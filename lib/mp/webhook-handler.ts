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
  MPServerError,
  MPNetworkError,
} from './api-client'
import {
  obtenerCredencialesPorUserIdMp,
  obtenerIntentoCobroPorExternalReference,
  aprobarIntentoCobro,
  actualizarIntentoCobro,
  type EstadoIntentoMP,
} from '@/lib/supabase/mp'
import { mapMPStatusToIntentoEstado, type MPWebhookPayload, type MPPaymentDetail } from './types'

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

// Estados terminales del intento — si ya está acá, no reprocesar.
// Incluye requiere_revision: una vez que el frontend lo marcó (MP
// cobró pero crear_venta falló), un webhook posterior no debe pisar
// el estado. La resolución es manual.
const FINAL_STATES: ReadonlySet<EstadoIntentoMP> = new Set([
  'aprobado',
  'rechazado',
  'cancelado',
  'expirado',
  'requiere_revision',
])

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
      console.warn(JSON.stringify({
        component: 'mp/webhook',
        event: 'signature_fail',
        code: e.code,
        dataId: opts.dataId,
      }))
      const sev = e.code === 'missing_header' ? 'warn' : 'error'
      return {
        status: 401,
        body: { error: 'unauthorized' },
        log: {
          level: sev,
          event: 'mp_webhook_signature_fail',
          code: e.code,
          dataId: opts.dataId,
        },
      }
    }
    throw e   // bug inesperado; que el route handler lo log/500.
  }
  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'signature_ok',
    dataId: opts.dataId,
  }))

  // ── 2. Parse body ────────────────────────────────────────────────
  let payload: MPWebhookPayload
  try {
    payload = JSON.parse(opts.rawBody) as MPWebhookPayload
  } catch {
    return ok('mp_webhook_bad_json', { dataId: opts.dataId }, 'warn')
  }
  console.log(JSON.stringify({
    component: 'mp/webhook',
    event: 'payload_parsed',
    action: payload.action,
    type: payload.type,
    userId: payload.user_id,
    dataId: opts.dataId,
    payloadDataId: payload.data?.id ?? null,
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
  let cred: Awaited<ReturnType<typeof obtenerCredencialesPorUserIdMp>>
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
    // user_id_mp no matchea ningún comercio. Puede pasar si:
    //   - El comercio se desconectó después del cobro pero antes
    //     del webhook (raro).
    //   - El webhook viene de otra app MP que pegó a nuestro
    //     endpoint (raro, pero la firma debería haberlo prevenido).
    //   - El seller cambió de cuenta MP.
    // 200 idempotente con warn — no queremos que MP reintente
    // indefinidamente.
    return ok('mp_webhook_user_id_sin_credenciales', { userId, dataId: opts.dataId }, 'warn')
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
  const paymentId = opts.dataId || payload.data?.id
  if (!paymentId) {
    return ok('mp_webhook_no_payment_id', { dataId: opts.dataId }, 'warn')
  }

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
    event: 'payment_fetched',
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
    event: 'intento_encontrado',
    intentoId: intento.id,
    externalRef,
    estadoActual: intento.estado,
    ventaId: intento.venta_id,
  }))

  // ── 6. Idempotencia: ya en estado final → no reprocesar ──────────
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

  return ok('mp_webhook_intento_actualizado', {
    intentoId: intento.id,
    comercioId: cred.comercio_id,
    paymentId,
    estadoAnterior: intento.estado,
    estadoNuevo: nuevoEstado,
    paymentStatus: payment.status,
  })
}
