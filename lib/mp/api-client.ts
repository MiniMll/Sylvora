// Cliente HTTP genérico contra la API de Mercado Pago.
//
// Diseño:
//   - Funcional (no clase). mpRequest() + helpers mpGet/mpPost/mpPut.
//   - Stateless. La capa superior pasa el access_token YA descifrado.
//     El cliente NUNCA lee env vars ni accede a mp_credenciales.
//   - Jerarquía de errores tipados. Cada call site puede hacer
//     `if (e instanceof MPAuthError)` y decidir si refrescar token.
//   - Retries exponenciales con jitter para errores transitorios
//     (429 con respeto del Retry-After, 5xx, network). GET reintenta
//     siempre; POST/PUT solo si retryNonGet=true (típicamente cuando
//     pasamos X-Idempotency-Key, ej. crear Order).
//   - Logging estructurado (JSON one-line) listo para parsear en
//     Vercel logs. Nunca loguea el token ni el body cifrado.
//   - Request id propio (UUID) en cada request, + captura del
//     x-request-id que devuelve MP para correlación bidireccional.
//
// Usado por:
//   - OAuth callback (POST /oauth/token)
//   - Creación de Store (POST /users/{id}/stores)
//   - Creación de POS (POST /pos)
//   - Orders API (POST /v1/orders)
//   - Consulta de pagos (GET /v1/payments/{id})
//   - Webhook handler (cuando re-consulta el payment por id)

import { randomUUID } from 'node:crypto'
import { MP_API_BASE, MP_API_TIMEOUT_MS } from './config'

// ────────────────────────────────────────────────────────────────────
// Jerarquía de errores
// ────────────────────────────────────────────────────────────────────
//
// Todas heredan de MPApiError → un solo catch atrapa todas. Pero el
// call site puede discriminar con instanceof para decidir UX:
//   - MPAuthError    → refrescar token y reintentar 1 vez
//   - MPRateLimitError → backoff ya aplicado por el cliente; si llega
//                        acá el caller, ya se agotaron los retries
//   - MPServerError  → infra MP caída, mostrar toast genérico
//   - MPClientError  → bug nuestro (body mal armado), reportar
//   - MPNetworkError → conectividad / timeout
//   - MPDeserializeError → MP devolvió algo raro, body no parseable

export interface MPApiErrorInit {
  message: string
  status: number
  code?: string | null
  /** Correlation id que pusimos en el header X-Request-Id. */
  requestId?: string | null
  /** Lo que devolvió MP en el header x-request-id. Útil para
   *  reportar al soporte de MP. */
  mpRequestId?: string | null
  /** Body parseado de MP (para debugging — no incluir en respuestas
   *  al cliente porque puede leak info). */
  body?: unknown
  cause?: unknown
}

export class MPApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly requestId: string | null
  readonly mpRequestId: string | null
  readonly retryable: boolean
  readonly body: unknown

  constructor(init: MPApiErrorInit & { retryable?: boolean }) {
    super(init.message, { cause: init.cause })
    this.name = 'MPApiError'
    this.status = init.status
    this.code = init.code ?? null
    this.requestId = init.requestId ?? null
    this.mpRequestId = init.mpRequestId ?? null
    this.retryable = init.retryable ?? false
    this.body = init.body
  }
}

/** 401 / 403. Token inválido o sin scope para esta operación. */
export class MPAuthError extends MPApiError {
  constructor(init: MPApiErrorInit) {
    super({ ...init, retryable: false })
    this.name = 'MPAuthError'
  }
}

/** 429. Incluye retry-after si MP lo manda. */
export class MPRateLimitError extends MPApiError {
  readonly retryAfterMs: number | null
  constructor(init: MPApiErrorInit & { retryAfterMs?: number | null }) {
    super({ ...init, retryable: true })
    this.name = 'MPRateLimitError'
    this.retryAfterMs = init.retryAfterMs ?? null
  }
}

/** 5xx. Infra MP. Retryable. */
export class MPServerError extends MPApiError {
  constructor(init: MPApiErrorInit) {
    super({ ...init, retryable: true })
    this.name = 'MPServerError'
  }
}

/** 4xx que no es 401/403/429. Bug del request — body mal armado,
 *  parámetro inválido, etc. NO retryable. */
export class MPClientError extends MPApiError {
  constructor(init: MPApiErrorInit) {
    super({ ...init, retryable: false })
    this.name = 'MPClientError'
  }
}

/** Timeout, DNS, conexión rechazada. Retryable. */
export class MPNetworkError extends MPApiError {
  constructor(message: string, init?: { requestId?: string | null; cause?: unknown }) {
    super({
      message,
      status: 0,
      requestId: init?.requestId ?? null,
      retryable: true,
      cause: init?.cause,
    })
    this.name = 'MPNetworkError'
  }
}

/** Status OK pero body no es JSON parseable. No retryable — es
 *  un bug de MP o un cambio breaking que tenemos que ver. */
export class MPDeserializeError extends MPApiError {
  constructor(message: string, init: { status: number; requestId?: string | null; cause?: unknown }) {
    super({
      message,
      status: init.status,
      requestId: init.requestId ?? null,
      retryable: false,
      cause: init.cause,
    })
    this.name = 'MPDeserializeError'
  }
}

// ────────────────────────────────────────────────────────────────────
// Tipos públicos
// ────────────────────────────────────────────────────────────────────

export type MPHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface MPRequestOptions {
  /** Bearer token del seller (descifrado). Server-side only — el cliente
   *  no sabe cómo obtenerlo: es responsabilidad del call site pasarlo
   *  ya plaintext. */
  accessToken: string
  /** Path relativo a MP_API_BASE, ej. "/v1/orders". También acepta URL
   *  absoluta (raro — solo si MP devuelve una en un response). */
  path: string
  /** Querystring opcional. */
  query?: Record<string, string | number | boolean | undefined | null>
  /** Body para POST/PUT. Se serializa a JSON. */
  body?: unknown
  /** Header X-Idempotency-Key. Obligatorio para Orders API. */
  idempotencyKey?: string
  /** Override del timeout default. */
  timeoutMs?: number
  /** Max reintentos sobre errores retryables. Default 3. */
  maxRetries?: number
  /** Forzar retry en POST/PUT. Solo si la operación es idempotente
   *  (pasaste idempotencyKey). Default false. */
  retryNonGet?: boolean
  /** Correlation id propio. Si no se pasa, se genera. */
  requestId?: string
  /** Etiqueta human-readable para logs. Ej. "create-order". */
  operation?: string
}

// ────────────────────────────────────────────────────────────────────
// Core
// ────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 3
const BASE_BACKOFF_MS = 250
const MAX_BACKOFF_MS = 8_000

function buildUrl(path: string, query?: MPRequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${MP_API_BASE}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.append(k, String(v))
    }
  }
  return url.toString()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** attempt es 1-indexed. 1→250ms, 2→500, 3→1000, capped a 8s. */
function backoffMs(attempt: number): number {
  const base = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS)
  const jitter = Math.random() * base * 0.25
  return Math.floor(base + jitter)
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const n = Number(header)
  if (Number.isFinite(n) && n > 0) return n * 1000
  const ts = Date.parse(header)
  if (Number.isFinite(ts)) return Math.max(0, ts - Date.now())
  return null
}

function extractError(body: unknown): { code: string | null; message: string | null } {
  if (!body || typeof body !== 'object') return { code: null, message: null }
  const o = body as Record<string, unknown>
  const code = typeof o.error === 'string' ? o.error : null
  const message =
    (typeof o.message === 'string' && o.message) ||
    (typeof o.error_description === 'string' && o.error_description) ||
    null
  return { code, message }
}

async function singleAttempt<T>(method: MPHttpMethod, opts: MPRequestOptions): Promise<T> {
  const requestId = opts.requestId!
  const timeoutMs = opts.timeoutMs ?? MP_API_TIMEOUT_MS
  const url = buildUrl(opts.path, opts.query)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    'X-Request-Id': requestId,
    Accept: 'application/json',
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.idempotencyKey) headers['X-Idempotency-Key'] = opts.idempotencyKey

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    const isAbort = e instanceof Error && e.name === 'AbortError'
    throw new MPNetworkError(
      isAbort
        ? `Timeout tras ${timeoutMs}ms`
        : `Error de red: ${e instanceof Error ? e.message : String(e)}`,
      { requestId, cause: e },
    )
  }
  clearTimeout(timer)

  const mpRequestId = response.headers.get('x-request-id')

  // 204 No Content: body vacío, devolvemos null sin parsear.
  let body: unknown = null
  if (response.status !== 204) {
    const text = await response.text()
    if (text) {
      try {
        body = JSON.parse(text)
      } catch (e) {
        throw new MPDeserializeError(
          `Response body no es JSON válido (status ${response.status})`,
          { status: response.status, requestId, cause: e },
        )
      }
    }
  }

  if (response.ok) {
    return body as T
  }

  const { code, message } = extractError(body)
  const init: MPApiErrorInit = {
    message: `MP API ${response.status} ${response.statusText || ''}: ${message ?? code ?? 'sin detalle'}`.trim(),
    status: response.status,
    code,
    requestId,
    mpRequestId,
    body,
  }

  if (response.status === 401 || response.status === 403) throw new MPAuthError(init)
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
    throw new MPRateLimitError({ ...init, retryAfterMs })
  }
  if (response.status >= 500) throw new MPServerError(init)
  throw new MPClientError(init)
}

// ────────────────────────────────────────────────────────────────────
// Logging estructurado (JSON one-line)
// ────────────────────────────────────────────────────────────────────
//
// No incluimos token, body cifrado, ni mensajes con PII. El requestId
// permite correlacionar request/retry/success en Vercel logs sin tener
// que mirar el body.

interface LogBase {
  level: 'info' | 'warn' | 'error'
  component: 'mp/api-client'
  event: 'request' | 'retry' | 'success' | 'failure'
  operation: string | null
  method: MPHttpMethod
  path: string
  attempt: number
  requestId: string
}

function logLine(line: LogBase & Record<string, unknown>): void {
  const fn = line.level === 'error'
    ? console.error
    : line.level === 'warn'
      ? console.warn
      : console.log
  fn(JSON.stringify(line))
}

/**
 * Sanitiza un valor arbitrario para incluirlo en logs estructurados:
 *   - Trunca strings largas a maxStrLen.
 *   - Recorta arrays largos a maxItems.
 *   - Filtra keys sensibles (token, secret, authorization, credential,
 *     password, refresh, access_token, api_key).
 *   - Limita profundidad a maxDepth.
 *
 * Pensada para loguear cuerpos de respuesta MP en errores 4xx sin
 * arriesgar leak de información sensible.
 */
const SENSITIVE_KEY_RE = /token|secret|authorization|credential|password|refresh|api_?key/i

export function sanitizeForLog(
  value: unknown,
  opts: { maxStrLen?: number; maxItems?: number; maxDepth?: number } = {},
): unknown {
  const { maxStrLen = 500, maxItems = 20, maxDepth = 5 } = opts
  function walk(v: unknown, depth: number): unknown {
    if (depth > maxDepth) return '<max-depth>'
    if (v === null || v === undefined) return v
    if (typeof v === 'string') {
      return v.length > maxStrLen ? v.slice(0, maxStrLen) + '…' : v
    }
    if (typeof v === 'number' || typeof v === 'boolean') return v
    if (Array.isArray(v)) {
      const out = v.slice(0, maxItems).map(x => walk(x, depth + 1))
      if (v.length > maxItems) out.push(`<+${v.length - maxItems} más>`)
      return out
    }
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SENSITIVE_KEY_RE.test(k)) {
          out[k] = '<redacted>'
        } else {
          out[k] = walk(val, depth + 1)
        }
      }
      return out
    }
    return String(v)
  }
  return walk(value, 0)
}

// ────────────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────────────

export async function mpRequest<T>(
  method: MPHttpMethod,
  opts: MPRequestOptions,
): Promise<T> {
  if (!opts.accessToken || typeof opts.accessToken !== 'string') {
    throw new MPAuthError({
      message: 'accessToken faltante o inválido en la llamada',
      status: 0,
    })
  }
  const requestId = opts.requestId ?? randomUUID()
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const canRetry = method === 'GET' || opts.retryNonGet === true
  const start = Date.now()

  let lastErr: MPApiError | null = null
  // attempt 1..(maxRetries+1) — la primera no es retry.
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    logLine({
      level: 'info',
      component: 'mp/api-client',
      event: 'request',
      operation: opts.operation ?? null,
      method,
      path: opts.path,
      attempt,
      requestId,
    })
    try {
      const result = await singleAttempt<T>(method, { ...opts, requestId })
      logLine({
        level: 'info',
        component: 'mp/api-client',
        event: 'success',
        operation: opts.operation ?? null,
        method,
        path: opts.path,
        attempt,
        requestId,
        durationMs: Date.now() - start,
      })
      return result
    } catch (e) {
      if (!(e instanceof MPApiError)) throw e
      lastErr = e
      const isLast = attempt > maxRetries
      if (isLast || !e.retryable || !canRetry) {
        // Para errores client-side (4xx), incluimos el body parseado
        // de MP en el log — es la única forma de diagnosticar campos
        // mal armados sin tener que reproducir el request. Sanitizado
        // para evitar leak de keys sensibles si MP cambiara la forma.
        // Para 5xx/network no incluimos body (suele ser HTML genérico).
        const includeBody = e.status >= 400 && e.status < 500 && e.body !== null && e.body !== undefined
        logLine({
          level: 'error',
          component: 'mp/api-client',
          event: 'failure',
          operation: opts.operation ?? null,
          method,
          path: opts.path,
          attempt,
          requestId,
          durationMs: Date.now() - start,
          errorName: e.name,
          status: e.status,
          code: e.code,
          mpRequestId: e.mpRequestId,
          mpErrorMessage: e.message,
          ...(includeBody ? { mpResponseBody: sanitizeForLog(e.body) } : {}),
        })
        throw e
      }
      let delay = backoffMs(attempt)
      if (e instanceof MPRateLimitError && e.retryAfterMs != null) {
        delay = Math.max(delay, e.retryAfterMs)
      }
      logLine({
        level: 'warn',
        component: 'mp/api-client',
        event: 'retry',
        operation: opts.operation ?? null,
        method,
        path: opts.path,
        attempt,
        requestId,
        nextDelayMs: delay,
        errorName: e.name,
        status: e.status,
      })
      await sleep(delay)
    }
  }
  throw lastErr ?? new Error('mpRequest: loop terminó sin resultado (bug)')
}

export function mpGet<T>(
  opts: Omit<MPRequestOptions, 'body' | 'idempotencyKey'>,
): Promise<T> {
  return mpRequest<T>('GET', opts)
}

export function mpPost<T>(opts: MPRequestOptions): Promise<T> {
  return mpRequest<T>('POST', opts)
}

export function mpPut<T>(opts: MPRequestOptions): Promise<T> {
  return mpRequest<T>('PUT', opts)
}
