// Lógica del webhook de Mercado Pago — extraída del route handler
// para que sea unit-testeable sin Next/SSR/cookies.
//
// La función processMPWebhookNotification es el "fact table" del
// flow:
//   1. Verifica firma HMAC (Commit 8).
//   2. Parsea payload JSON.
//   3. Resuelve credenciales del seller por user_id_mp (Commit 6).
//   4. Consulta el pago canónico vía Orders API (no confiamos en
//      el body del webhook — es solo trigger).
//   5. Busca el intento por external_reference.
//   6. Decide: aprobar / rechazar / no-op según status canónico.
//   7. Idempotencia: si el intento ya está en estado final, no
//      reprocesa.
//
// Pattern de respuesta:
//   - status: 200 → MP no reintenta (handled, incluso si fue no-op).
//   - status: 401 → firma inválida; MP lo marca y deja de reintentar
//                   tras N intentos. Mensaje genérico al cliente.
//   - status: 500 → error transitorio (DB caída, MP API caída);
//                   MP reintenta más tarde. Idempotencia DB nos cubre.
//
// SERVER-ONLY. Usa service client de Supabase (sin cookie) +
// access_token del seller para consultar payment.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  verifyMPWebhookSignature,
  MPWebhookSignatureError,
  type HeadersLike,
} from './webhook-signature'
import {
  mpGet,
  MPApiError,
  MPAuthError,
  MPClientError,
  MPServerError,
  MPNetworkError,
} from './api-client'
import {
  obtenerCredencialesPorUserIdMp,
  obtenerIntentoCobroPorExternalReference,
  aprobarIntentoCobro,
  actualizarIntentoCobro,
  marcarPagoPostCancelacion,
  type EstadoIntentoMP,
} from '@/lib/supabase/mp'
import { mapMPStatusToIntentoEstado, type MPWebhookPayload, type MPPaymentDetail } from './types'
import { getMPEnv } from './config'
import { getMPMode } from './token-provider'

export interface ProcessWebhookOptions {
  /** data.id del query string (?data.id=<paymentId>). */
  dataId: string
  /** Headers de la request entrante. */
  headers: HeadersLike
  /** Body crudo (string). Se parsea como JSON acá. */
  rawBody: string
  /** SYLVORA_MP_WEBHOOK_SECRET. */
  webhookSecret: string
  /** Service client de Supabase (sin cookies). */
  supabase: SupabaseClient
  /** Clock inyectable para tests. Default Date.now. */
  now?: () => number
}

export interface ProcessWebhookResult {
  status: 200 | 401 | 500
  /** Body que el route handler devuelve al cliente. Genérico
   *  intencionalmente (no leakea info). */
  body: { ok: true } | { error: string }
  /** Log estructurado que el route handler debe imprimir. NUNCA
   *  contiene tokens, qr_data, ni raw body. */
  log: {
    level: 'info' | 'warn' | 'error'
    event: string
    [key: string]: unknown
  }
}

// Estados terminales ABSOLUTOS del intento — si ya está acá, ningún
// webhook los pisa:
//   - aprobado / rechazado: resultado normal del cobro.
//   - requiere_revision: en la cola de revisión; la resolución es
//     manual (RPC resolver_intento_mp).
//   - resuelto: un admin ya lo resolvió con auditoría. Intocable.
//
// cancelado y expirado NO están acá desde la épica de revisión:
// un payment 'approved' que llega sobre esos estados significa que
// el cliente pagó justo después de la cancelación/expiración — el
// dinero entró y NO puede quedar invisible. Se manejan explícitamente
// antes de este check (transición a requiere_revision con motivo
// pago_post_cancelacion). Cualquier otro status sobre cancelado/
// expirado sigue siendo no-op.
const FINAL_STATES: ReadonlySet<EstadoIntentoMP> = new Set([
  'aprobado',
  'rechazado',
  'requiere_revision',
  'resuelto',
])

type WebhookCredenciales = {
  comercio_id: string
  access_token: string
}

function readHeader(headers: HeadersLike, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name)
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v ?? null
  }
  return null
}

function envFlag(name: string): boolean {
  return process.env[name]?.toLowerCase().trim() === 'true'
}

function getSandboxUserIdExpected(): number | null {
  const raw = process.env.MP_SANDBOX_USER_ID_MP
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function getWebhookSandboxModeInfo() {
  const mpEnv = getMPEnv()
  let mpMode: string
  try {
    mpMode = getMPMode()
  } catch (e) {
    mpMode = e instanceof Error ? `invalid:${e.message}` : 'invalid'
  }
  const allowUnsignedEnv = envFlag('MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX')
  return {
    mpEnv,
    mpMode,
    allowUnsignedEnv,
    unsignedAllowed:
      allowUnsignedEnv &&
      mpEnv === 'sandbox' &&
      mpMode === 'manual_sandbox',
    unsignedBlockedProduction:
      allowUnsignedEnv &&
      mpEnv === 'production',
  }
}

function getManualSandboxWebhookCredenciales(userId: number): WebhookCredenciales | null {
  if (getMPEnv() === 'production') return null
  try {
    if (getMPMode() !== 'manual_sandbox') return null
  } catch {
    return null
  }

  const expectedUserId = getSandboxUserIdExpected()
  if (!expectedUserId || userId !== expectedUserId) return null

  const accessToken = process.env.MP_SANDBOX_ACCESS_TOKEN?.trim()
  const comercioId = process.env.MP_SANDBOX_COMERCIO_ID?.trim()
  if (!accessToken || !comercioId) return null
  return { comercio_id: comercioId, access_token: accessToken }
}

/** Resultado de éxito idempotente "no había nada que hacer". */
function ok(
  event: string,
  extra: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
): ProcessWebhookResult {
  return {
    status: 200,
    body: { ok: true },
    log: { level, event, ...extra },
  }
}

export async function processMPWebhookNotification(
  opts: ProcessWebhookOptions,
): Promise<ProcessWebhookResult> {
  let parsedPayloadForDiag: MPWebhookPayload | null = null
  try {
    parsedPayloadForDiag = JSON.parse(opts.rawBody) as MPWebhookPayload
  } catch {
    parsedPayloadForDiag = null
  }

  const xSignaturePresent = Boolean(readHeader(opts.headers, 'x-signature'))
  const xRequestIdPresent = Boolean(readHeader(opts.headers, 'x-request-id'))
  const queryDataIdPresent = Boolean(opts.dataId)
  const payloadDataId = parsedPayloadForDiag?.data?.id ?? null
  const payloadDataIdPresent = typeof payloadDataId === 'string' && payloadDataId.length > 0
  const sandboxUserIdExpected = getSandboxUserIdExpected()

  // ── 1. Verificar firma ───────────────────────────────────────────
  // Si falla cualquier validación del header/secret/timestamp,
  // devolvemos 401 genérico. El log con el .code distingue ruido
  // de bots (missing_header) de potenciales ataques (signature_mismatch).
  try {
    verifyMPWebhookSignature({
      headers: opts.headers,
      dataId: opts.dataId,
      secret: opts.webhookSecret,
      rawBody: opts.rawBody,
      now: opts.now,
    })
  } catch (e) {
    if (e instanceof MPWebhookSignatureError) {
      const sandboxModeInfo = getWebhookSandboxModeInfo()
      console.warn(JSON.stringify({
        component: 'mp/webhook',
        event: 'signature_fail',
        code: e.code,
        dataId: opts.dataId,
        queryDataIdPresent,
        payloadDataIdPresent,
        xSignaturePresent,
        xRequestIdPresent,
        payloadUserId: parsedPayloadForDiag?.user_id ?? null,
        sandboxUserIdExpected,
        mpEnv: sandboxModeInfo.mpEnv,
        mpMode: sandboxModeInfo.mpMode,
        allowUnsignedEnv: sandboxModeInfo.allowUnsignedEnv,
      }))

      if (sandboxModeInfo.unsignedBlockedProduction) {
        console.error(JSON.stringify({
          component: 'mp/webhook',
          event: 'manual_sandbox_unsigned_webhook_blocked_production',
          code: e.code,
          dataId: opts.dataId,
        }))
      }

      // SOLO SANDBOX/DEV:
      // El simulador de Mercado Pago puede mandar headers incompletos o
      // firmas que no matchean el secret real de la app. Permitimos seguir
      // únicamente con MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX=true,
      // MP_ENV=sandbox y MP_MODE=manual_sandbox. getWebhookSandboxModeInfo()
      // mantiene el hard guard: nunca se habilita en production ni en OAuth.
      const canBypassSignature =
        sandboxModeInfo.unsignedAllowed &&
        (
          e.code === 'missing_header' ||
          e.code === 'missing_data_id' ||
          e.code === 'signature_mismatch'
        ) &&
        parsedPayloadForDiag !== null

      if (canBypassSignature) {
        const unsignedPayload = parsedPayloadForDiag as MPWebhookPayload
        console.warn(JSON.stringify({
          component: 'mp/webhook',
          event: 'manual_sandbox_signature_bypass_used',
          code: e.code,
          dataId: opts.dataId,
          effectiveDataId: opts.dataId || payloadDataId,
          payloadUserId: unsignedPayload.user_id,
          sandboxUserIdExpected,
        }))
      } else {
      const sev = e.code === 'missing_header' ? 'warn' : 'error'
      return {
        status: 401,
        body: { error: 'unauthorized' },
        log: {
          level: sev,
          event: 'mp_webhook_signature_fail',
          code: e.code,
          dataId: opts.dataId,
          queryDataIdPresent,
          payloadDataIdPresent,
          xSignaturePresent,
          xRequestIdPresent,
          payloadUserId: parsedPayloadForDiag?.user_id ?? null,
          sandboxUserIdExpected,
        },
      }
      }
    } else {
      throw e   // bug inesperado; que el route handler lo log/500.
    }
  }
  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'webhook_after_signature_gate',
    dataId: opts.dataId,
  }))

  // ── 2. Parse body ────────────────────────────────────────────────
  let payload: MPWebhookPayload
  try {
    payload = parsedPayloadForDiag ?? JSON.parse(opts.rawBody) as MPWebhookPayload
  } catch {
    return ok('mp_webhook_bad_json', { dataId: opts.dataId }, 'warn')
  }
  const effectiveDataId = opts.dataId || payload.data?.id || ''
  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'webhook_payload_ok',
    action: payload.action,
    type: payload.type,
    userId: payload.user_id,
    dataId: opts.dataId,
    effectiveDataId,
    payloadDataId: payload.data?.id ?? null,
    sandboxUserIdExpected,
  }))

  // Solo manejamos type=payment en V1. merchant_order y otros tipos
  // los aceptamos sin procesar — devolvemos 200 para que MP no reintente.
  if (payload.type !== 'payment') {
    return ok('mp_webhook_ignored_type', { type: payload.type, dataId: opts.dataId })
  }

  const userId = payload.user_id
  if (!Number.isFinite(userId) || userId <= 0) {
    return ok('mp_webhook_no_user_id', { dataId: opts.dataId }, 'warn')
  }

  // ── 3. Resolver credenciales del seller ──────────────────────────
  let cred: WebhookCredenciales | null
  try {
    cred = await obtenerCredencialesPorUserIdMp(opts.supabase, userId)
  } catch (e) {
    // Error de DB. Devolvemos 500 para que MP reintente — la DB
    // puede estar transitoriamente caída.
    return {
      status: 500,
      body: { error: 'internal' },
      log: {
        level: 'error',
        event: 'mp_webhook_db_error_credenciales',
        userId,
        errorMessage: e instanceof Error ? e.message : 'unknown',
      },
    }
  }
  if (!cred) {
    cred = getManualSandboxWebhookCredenciales(userId)
  }
  if (!cred) {
    // user_id_mp no matchea ningún comercio. Puede pasar si:
    //   - El comercio se desconectó después del cobro pero antes
    //     del webhook (raro).
    //   - El webhook viene de otra app MP que pegó a nuestro
    //     endpoint (raro, pero la firma debería haberlo prevenido).
    //   - El seller cambió de cuenta MP.
    // 200 idempotente con warn — no queremos que MP reintente
    // indefinidamente.
    return ok(
      'mp_webhook_user_id_sin_credenciales',
      { userId, sandboxUserIdExpected, dataId: opts.dataId },
      'warn',
    )
  }
  if (cred.comercio_id === process.env.MP_SANDBOX_COMERCIO_ID?.trim()) {
    console.warn(JSON.stringify({
      component: 'mp/webhook',
      event: 'manual_sandbox_webhook_used',
      userId,
      comercioId: cred.comercio_id,
    }))
  }
  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'credenciales_encontradas',
    userId,
    comercioId: cred.comercio_id,
  }))

  // ── 4. Fetch payment canónico desde MP ───────────────────────────
  // El payload del webhook NO se considera fuente de verdad: tenemos
  // que pegar a /v1/payments/<id> con el access_token del seller.
  // data.id viene como string en el payload — preferimos el del URL
  // (más confiable, MP lo manda fuera del body firmable).
  const paymentId = effectiveDataId
  if (!paymentId) {
    return ok('mp_webhook_no_payment_id', { dataId: opts.dataId }, 'warn')
  }

  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'payment_fetch_start',
    paymentId,
  }))

  let payment: MPPaymentDetail
  try {
    payment = await mpGet<MPPaymentDetail>({
      accessToken: cred.access_token,
      path: `/v1/payments/${encodeURIComponent(paymentId)}`,
      operation: 'webhook-fetch-payment',
    })
  } catch (e) {
    // Errores tipados del api-client.
    if (e instanceof MPAuthError) {
      // El access_token del seller no es válido (revocado / rotado).
      // 200 + warn: no tiene sentido que MP reintente; el admin
      // tiene que reconectar MP. El intento queda sin actualizar
      // (el polling del frontend va a expirarlo eventualmente).
      return ok(
        'mp_webhook_seller_token_invalido',
        { userId, comercioId: cred.comercio_id, paymentId },
        'error',
      )
    }
    if (e instanceof MPServerError || e instanceof MPNetworkError) {
      // Transitorio — que MP reintente.
      return {
        status: 500,
        body: { error: 'mp_unavailable' },
        log: {
          level: 'warn',
          event: 'mp_webhook_mp_unavailable',
          paymentId,
          errorName: e.name,
          status: e instanceof MPApiError ? e.status : 0,
        },
      }
    }
    if (e instanceof MPClientError && e.status === 404) {
      return ok(
        'manual_sandbox_simulator_payment_not_found',
        { paymentId, userId, sandboxUserIdExpected },
        'warn',
      )
    }
    // Otros 4xx (404, etc.). 200 — no reintentable.
    return ok(
      'mp_webhook_mp_client_error',
      {
        paymentId,
        errorName: e instanceof Error ? e.name : 'unknown',
        status: e instanceof MPApiError ? e.status : null,
      },
      'warn',
    )
  }
  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'payment_fetch_success',
    paymentId,
    paymentStatus: payment.status,
    paymentStatusDetail: payment.status_detail ?? null,
    externalReference: payment.external_reference,
  }))

  // ── 5. Buscar intento por external_reference ─────────────────────
  const externalRef = payment.external_reference
  if (!externalRef) {
    // Pago sin external_reference: NO es uno nuestro. Puede pasar
    // si la cuenta MP del seller recibe pagos por otros canales
    // (link de pago manual, otro POS, etc.).
    return ok('mp_webhook_payment_sin_external_reference', { paymentId }, 'info')
  }

  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'intento_lookup_start',
    paymentId,
    externalRef,
  }))

  let intento: Awaited<ReturnType<typeof obtenerIntentoCobroPorExternalReference>>
  try {
    intento = await obtenerIntentoCobroPorExternalReference(opts.supabase, externalRef)
  } catch (e) {
    return {
      status: 500,
      body: { error: 'internal' },
      log: {
        level: 'error',
        event: 'mp_webhook_db_error_intento',
        externalRef,
        errorMessage: e instanceof Error ? e.message : 'unknown',
      },
    }
  }
  if (!intento) {
    // External ref válido pero no en nuestra DB. Mismo razonamiento
    // que el "sin credenciales": MP puede haber emitido para otro
    // sistema, o el intento se borró (no debería).
    return ok('mp_webhook_intento_no_encontrado', { externalRef, paymentId }, 'warn')
  }
  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'intento_lookup_success',
    intentoId: intento.id,
    externalRef,
    estadoActual: intento.estado,
    ventaId: intento.venta_id,
  }))

  // ── 6.a. Caso especial: pago aprobado sobre cancelado/expirado ───
  // El cliente pagó justo después de que el cajero canceló, o después
  // de que el QR venció (webhook tardío). El dinero ENTRÓ a la cuenta
  // MP del comerciante — antes esto era un no-op "ya_final" y el cobro
  // quedaba invisible. Ahora: requiere_revision con motivo fijo
  // 'pago_post_cancelacion' → aparece en la cola del admin.
  const estadoOrigen = intento.estado
  if (estadoOrigen === 'cancelado' || estadoOrigen === 'expirado') {
    const mapeo = mapMPStatusToIntentoEstado(payment.status)
    if (mapeo !== 'aprobado') {
      // rejected/cancelled/pending sobre un cancelado/expirado: nada
      // que hacer — el intento ya está terminado y no entró dinero.
      return ok(
        'mp_webhook_intento_ya_final',
        {
          intentoId: intento.id,
          estadoActual: estadoOrigen,
          paymentStatus: payment.status,
        },
      )
    }

    let marcado: Awaited<ReturnType<typeof marcarPagoPostCancelacion>>
    try {
      marcado = await marcarPagoPostCancelacion(opts.supabase, intento.id, {
        mp_payment_id: payment.id,
        pagado_en: payment.date_approved ?? new Date(),
      })
    } catch (e) {
      // Error de DB → 500 para que MP reintente. La transición es
      // atómica e idempotente, el retry es seguro.
      return {
        status: 500,
        body: { error: 'internal' },
        log: {
          level: 'error',
          event: 'mp_webhook_db_error_post_cancelacion',
          intentoId: intento.id,
          errorMessage: e instanceof Error ? e.message : 'unknown',
        },
      }
    }

    if (marcado.ok) {
      // Level 'error' a propósito: es una alerta operativa — hay
      // dinero cobrado sin venta que un admin tiene que resolver.
      return ok(
        'mp_webhook_pago_post_cancelacion',
        {
          intentoId: intento.id,
          comercioId: cred.comercio_id,
          paymentId,
          estadoAnterior: estadoOrigen,
          estadoNuevo: 'requiere_revision',
          paymentStatus: payment.status,
          paymentStatusDetail: payment.status_detail ?? null,
          monto: intento.monto,
        },
        'error',
      )
    }
    // Race: otro proceso lo movió entre el lookup y el UPDATE (p. ej.
    // un retry del mismo webhook ya lo marcó). El WHERE atómico evitó
    // pisar — no-op idempotente con el estado real.
    return ok(
      'mp_webhook_post_cancelacion_race',
      {
        intentoId: intento.id,
        estadoActual: marcado.intento?.estado ?? 'desconocido',
        paymentStatus: payment.status,
      },
    )
  }

  // ── 6.b. Idempotencia: ya en estado final absoluto → no reprocesar.
  // Cubre aprobado, rechazado, requiere_revision y resuelto: approved
  // repetido sobre cualquiera de estos es no-op.
  if (FINAL_STATES.has(intento.estado)) {
    return ok(
      'mp_webhook_intento_ya_final',
      {
        intentoId: intento.id,
        estadoActual: intento.estado,
        paymentStatus: payment.status,
      },
    )
  }

  // ── 7. Mapear status y aplicar transición ────────────────────────
  const nuevoEstado = mapMPStatusToIntentoEstado(payment.status)
  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'estado_mapeado',
    intentoId: intento.id,
    paymentStatus: payment.status,
    estadoAnterior: intento.estado,
    estadoNuevo: nuevoEstado,
  }))
  if (nuevoEstado === null) {
    // pending / in_process / authorized — esperar siguiente webhook.
    return ok(
      'mp_webhook_estado_transitorio',
      { intentoId: intento.id, paymentStatus: payment.status },
    )
  }

  try {
    if (nuevoEstado === 'aprobado') {
      await aprobarIntentoCobro(opts.supabase, intento.id, {
        mp_payment_id: payment.id,
        mp_status_detail: payment.status_detail ?? null,
        pagado_en: payment.date_approved ?? new Date(),
      })
    } else {
      await actualizarIntentoCobro(opts.supabase, intento.id, {
        estado: 'rechazado',
        mp_payment_id: payment.id,
        mp_status_detail: payment.status_detail ?? null,
      })
    }
  } catch (e) {
    return {
      status: 500,
      body: { error: 'internal' },
      log: {
        level: 'error',
        event: 'mp_webhook_db_error_update',
        intentoId: intento.id,
        nuevoEstado,
        errorMessage: e instanceof Error ? e.message : 'unknown',
      },
    }
  }

  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'intento_update_success',
    intentoId: intento.id,
    estadoAnterior: intento.estado,
    estadoNuevo: nuevoEstado,
    paymentId,
  }))

  return ok('mp_webhook_intento_actualizado', {
    intentoId: intento.id,
    comercioId: cred.comercio_id,
    paymentId,
    estadoAnterior: intento.estado,
    estadoNuevo: nuevoEstado,
    paymentStatus: payment.status,
  })
}
