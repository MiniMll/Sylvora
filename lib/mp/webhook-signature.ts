// Verificador de firma HMAC de webhooks de Mercado Pago.
//
// MP firma cada notificación con un manifest determinístico y HMAC
// SHA-256 usando el secret configurado en la app. Verificar la firma
// ANTES de cualquier I/O (DB, parsing JSON) protege contra:
//   - Webhooks falsos (atacante mandando POSTs al endpoint público).
//   - Replay: combinado con la validación del timestamp (toleranceMs).
//
// Template oficial del manifest (según MP docs vigentes):
//
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//
// donde:
//   - <data.id> viene en la URL como query param ?data.id=<id>.
//     NO usar data.id del body — el body NO está firmado.
//   - <x-request-id> viene en el header x-request-id de la request.
//   - <ts> es el timestamp Unix (segundos) que MP incluye en el
//     header x-signature como "ts=<n>".
//
// El header x-signature trae: "ts=<ts>,v1=<hex-sha256>".
//
// Sobre el body crudo: la firma de MP NO firma el body. Lo aceptamos
// como parámetro opcional solo para defensa en profundidad (size
// guard, log de longitud sin contenido) — no entra al manifest.
//
// SERVER-ONLY. Se usa exclusivamente desde /api/mp/webhook/route.ts.

import { createHmac, timingSafeEqual } from 'node:crypto'

// ════════════════════════════════════════════════════════════════════
// Tipos
// ════════════════════════════════════════════════════════════════════

export type MPWebhookSignatureErrorCode =
  | 'missing_secret'        // no se pasó secret
  | 'missing_data_id'       // sin ?data.id= en la URL
  | 'missing_header'        // falta x-signature o x-request-id
  | 'malformed_header'      // x-signature mal formado
  | 'invalid_timestamp'     // ts no numérico o fuera de rango
  | 'timestamp_too_old'     // ts < (ahora - tolerancia)
  | 'timestamp_too_new'     // ts > (ahora + tolerancia)
  | 'signature_mismatch'    // HMAC no matchea

export class MPWebhookSignatureError extends Error {
  readonly code: MPWebhookSignatureErrorCode
  constructor(code: MPWebhookSignatureErrorCode, message: string) {
    super(message)
    this.name = 'MPWebhookSignatureError'
    this.code = code
  }
}

/** Headers como Headers (fetch API) o como dict plano. */
export type HeadersLike = Headers | Record<string, string | undefined | null>

export interface VerifyMPWebhookSignatureOptions {
  /** Headers de la request entrante. */
  headers: HeadersLike
  /** El data.id que viene en la URL: ?data.id=<id>. El caller debe
   *  extraerlo de la URL ANTES de parsear el body. */
  dataId: string
  /** Webhook secret configurado en MP developers (SYLVORA_MP_WEBHOOK_SECRET). */
  secret: string
  /** Body crudo. OPCIONAL — la firma de MP no lo firma. Se acepta
   *  por completitud para que el caller pueda pasarlo si quiere
   *  loggear longitud / aplicar guard de size sin re-parsear. */
  rawBody?: string
  /** Tolerancia del timestamp en ms (anti replay). Default 5 min. */
  toleranceMs?: number
  /** Reloj inyectable (para tests). Default Date.now. */
  now?: () => number
}

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000   // 5 minutos

/** Lee un header sin importar si headers es Headers o dict. Case
 *  insensitive (HTTP headers son case insensitive). */
function readHeader(headers: HeadersLike, name: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(name)
  }
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return v ?? null
    }
  }
  return null
}

/** Parsea "ts=123,v1=abc" → { ts: '123', v1: 'abc' }. Tira si formato
 *  inválido. */
function parseSignatureHeader(raw: string): { ts: string; v1: string } {
  // El header viene como pares "k=v" separados por coma. Ignoramos
  // espacios en blanco. NO asumimos orden ni que vengan solo ts y v1
  // — MP podría agregar versiones nuevas (v2, etc.). Buscamos los
  // que conocemos.
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
  const pairs: Record<string, string> = {}
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const k = part.slice(0, eq).trim().toLowerCase()
    const v = part.slice(eq + 1).trim()
    if (k && v && !(k in pairs)) pairs[k] = v
  }
  if (!pairs.ts || !pairs.v1) {
    throw new MPWebhookSignatureError(
      'malformed_header',
      'x-signature no contiene ts y v1 esperados',
    )
  }
  return { ts: pairs.ts, v1: pairs.v1 }
}

/**
 * Compara dos strings hex en tiempo constante. Si las longitudes
 * difieren devuelve false sin hacer la comparación binaria — NO es
 * 100% timing-safe en ese branch, pero las firmas SHA-256 siempre
 * son 64 chars hex, así que un mismatch de longitud indica entrada
 * corrupta y no hay información útil que un atacante extraiga
 * midiendo timing.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  // Normalizar lower-case primero para no ser case-sensitive en hex.
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  // Validar que ambas sean hex válidas (sin caracteres raros).
  if (!/^[0-9a-f]*$/.test(al) || !/^[0-9a-f]*$/.test(bl)) return false
  // Buffer.from('xyz', 'hex') silenciosamente trunca con chars no-hex.
  // El test de arriba lo previene. Para hex válido, length de Buffer
  // será length(string)/2 redondeado.
  if (al.length !== bl.length) return false
  const ba = Buffer.from(al, 'hex')
  const bb = Buffer.from(bl, 'hex')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// ════════════════════════════════════════════════════════════════════
// API pública
// ════════════════════════════════════════════════════════════════════

/**
 * Verifica la firma del webhook. NO devuelve nada en éxito; tira
 * MPWebhookSignatureError con code específico en cualquier falla.
 *
 * Diseño "throw on failure" (no boolean):
 *   - El call site (route handler) hace try/catch y devuelve 401 con
 *     un mensaje genérico para no leakear cuál validación falló.
 *   - Los logs del handler usan el .code para decidir severidad
 *     ('missing_header' es ruido de bots; 'signature_mismatch' es
 *     potencial ataque).
 */
export function verifyMPWebhookSignature(
  opts: VerifyMPWebhookSignatureOptions,
): void {
  // ── Validaciones de inputs ────────────────────────────────────────
  if (!opts.secret || typeof opts.secret !== 'string') {
    throw new MPWebhookSignatureError(
      'missing_secret',
      'webhook secret no configurado (SYLVORA_MP_WEBHOOK_SECRET).',
    )
  }
  if (!opts.dataId || typeof opts.dataId !== 'string') {
    throw new MPWebhookSignatureError(
      'missing_data_id',
      'falta data.id en la URL (?data.id=<id>).',
    )
  }

  // ── Headers requeridos ────────────────────────────────────────────
  const xSig = readHeader(opts.headers, 'x-signature')
  const xReq = readHeader(opts.headers, 'x-request-id')
  if (!xSig) {
    throw new MPWebhookSignatureError('missing_header', 'falta header x-signature')
  }
  if (!xReq) {
    throw new MPWebhookSignatureError('missing_header', 'falta header x-request-id')
  }

  // ── Parsear x-signature ──────────────────────────────────────────
  const { ts, v1 } = parseSignatureHeader(xSig)

  // ── Timestamp window (anti replay) ───────────────────────────────
  // MP manda ts en segundos. Aceptamos millisegundos defensivamente
  // (si MP cambia el formato) y normalizamos.
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum) || tsNum <= 0) {
    throw new MPWebhookSignatureError(
      'invalid_timestamp',
      'ts en x-signature no es numérico positivo',
    )
  }
  const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000   // heuristic seg vs ms
  const tolerance = opts.toleranceMs ?? DEFAULT_TOLERANCE_MS
  const now = (opts.now ?? Date.now)()
  if (tsMs < now - tolerance) {
    throw new MPWebhookSignatureError(
      'timestamp_too_old',
      'timestamp del webhook fuera de la tolerancia (muy viejo) — posible replay',
    )
  }
  if (tsMs > now + tolerance) {
    throw new MPWebhookSignatureError(
      'timestamp_too_new',
      'timestamp del webhook fuera de la tolerancia (futuro) — posible reloj desfasado o ataque',
    )
  }

  // ── Reconstruir manifest y firmar ────────────────────────────────
  // Template oficial. NO incluir el body — MP no lo firma.
  // OJO con typos: id:, request-id:, ts:, todos con ":" y ";".
  const manifest = `id:${opts.dataId};request-id:${xReq};ts:${ts};`
  const expected = createHmac('sha256', opts.secret)
    .update(manifest)
    .digest('hex')

  // ── Compare ──────────────────────────────────────────────────────
  if (!timingSafeEqualHex(expected, v1)) {
    throw new MPWebhookSignatureError(
      'signature_mismatch',
      'HMAC no matchea — request no firmada por MP o secret incorrecto',
    )
  }

  // No retornamos nada: éxito.
  // (rawBody se ignora intencionalmente; está en la interface por
  // completitud para que un caller pueda usarlo en su propia
  // diagnóstica sin doble-leer la stream.)
  void opts.rawBody
}
