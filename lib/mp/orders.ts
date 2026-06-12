// Wrapper alto de la Orders API de Mercado Pago (in-store QR).
//
// Una sola función por ahora: crearOrderQR. Encapsula:
//   - Armado del body según MPOrderCreateBody.
//   - Conversión del monto a string con 2 decimales (formato MP).
//   - Derivación de la idempotency key desde external_reference.
//   - Llamada a mpPost con retryNonGet=true (la operación ES
//     idempotente gracias a la key).
//   - Extracción del qr_data y checkout_url de la respuesta MP, que
//     vienen en una estructura anidada distinta según el response.
//
// NO toca Supabase. NO conoce mp_credenciales ni intentos_cobro_mp.
// El call site (route handler) es quien orquesta:
//   data layer + token-provider + orders.ts.
//
// SERVER-ONLY.

import { mpPost, sanitizeForLog } from './api-client'
import { getMPWebhookUrl } from './config'
import { idempotencyKeyForOrder } from './identifiers'
import { getMPMode } from './token-provider'
import type { MPOrderCreateBody, MPOrderResponse } from './types'

export interface CrearOrderQRInput {
  /** Token plaintext del seller (resuelto vía token-provider). */
  accessToken: string
  /** External pos id de la cuenta MP del seller. */
  externalPosId: string
  /** El external_reference del intento — lo elegimos nosotros, vuelve
   *  en el webhook. Tiene que ser único globalmente. */
  externalReference: string
  /** Monto a cobrar en pesos. Number — se convierte a string "0.00". */
  monto: number
  /** Descripción opcional, aparece en el ticket del cliente y en el
   *  dashboard MP del comerciante. */
  descripcion?: string
}

export interface CrearOrderQRResult {
  /** Id de la Order en MP — guardar en intentos_cobro_mp.order_id_mp. */
  orderIdMp: string
  /** Contenido para renderizar el QR dinámico. Puede ser null si MP
   *  no lo devuelve en este endpoint (algunos flows lo entregan
   *  por separado). */
  qrData: string | null
  /** URL del checkout / link de pago. Sirve como fallback "mandar por
   *  WhatsApp" si el cliente no escanea. */
  checkoutUrl: string | null
  /** Respuesta cruda de MP, por si el call site quiere loggear
   *  algún campo extra. */
  raw: MPOrderResponse
}

/**
 * Convierte un monto numérico a string con 2 decimales fijos como
 * lo exige MP. Ej: 1500 → "1500.00", 1500.5 → "1500.50".
 *
 * No usa Intl.NumberFormat para evitar coma decimal en locales AR
 * — MP requiere punto.
 */
function formatMontoMP(monto: number): string {
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error(`[mp/orders] monto inválido: ${monto}`)
  }
  return monto.toFixed(2)
}

function sanitizeWebhookUrlForLog(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('x-vercel-protection-bypass')) {
      parsed.searchParams.set('x-vercel-protection-bypass', '[redacted]')
    }
    return parsed.toString()
  } catch {
    return '[invalid-url]'
  }
}

/**
 * Crea una Order de tipo QR dinámico en MP.
 *
 * Idempotencia: si esta llamada se repite con el mismo
 * external_reference (ej. retry del cliente o del proxy antes de
 * recibir respuesta), MP devuelve la MISMA Order — no crea otra.
 * Esto es seguro porque la idempotency key se deriva del
 * external_reference y va en X-Idempotency-Key.
 *
 * Retries: el api-client va a reintentar 5xx/network/429 hasta 3
 * veces con backoff. POST normalmente no reintenta pero acá
 * forzamos retryNonGet=true porque tenemos idempotency key.
 *
 * Errores: deja propagar los MPApiError. El call site decide si
 * marcar el intento como rechazado, qué mostrar al usuario, etc.
 */
export async function crearOrderQR(input: CrearOrderQRInput): Promise<CrearOrderQRResult> {
  // Mismo string formateado en total_amount y en payments[0].amount —
  // MP exige que total_amount === SUM(transactions.payments[].amount).
  // Para V1 mandamos 1 sola payment con el monto total (no soportamos
  // splits en el POS).
  const montoStr = formatMontoMP(input.monto)
  const notificationUrl = getMPWebhookUrl()
  if (!notificationUrl) {
    let mode: string
    try {
      mode = getMPMode()
    } catch {
      mode = 'invalid'
    }
    if (mode === 'manual_sandbox') {
      console.warn(JSON.stringify({
        level: 'warn',
        component: 'mp/orders',
        event: 'mp_order_notification_url_missing',
        mode,
        envVar: 'SYLVORA_MP_WEBHOOK_URL',
      }))
    }
  }

  const body: MPOrderCreateBody = {
    type: 'qr',
    total_amount: montoStr,
    external_reference: input.externalReference,
    description: input.descripcion,
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    config: {
      qr: {
        external_pos_id: input.externalPosId,
        mode: 'dynamic',
      },
    },
    transactions: {
      payments: [{ amount: montoStr }],
    },
  }

  const response = await mpPost<MPOrderResponse>({
    accessToken: input.accessToken,
    path: '/v1/orders',
    body,
    idempotencyKey: idempotencyKeyForOrder(input.externalReference),
    retryNonGet: true,
    operation: 'create-order-qr',
  })

  // MP devuelve qr_data y checkout_url en lugares distintos según el
  // formato de la respuesta. Tomamos defensivamente el primero que
  // exista. Si ninguno aparece, dejamos null — el caller decide qué
  // hacer (típicamente: caer al modo "link de pago" o tirar error).
  const qrFromRoot = response.qr_data ?? null
  const qrFromTypeResponse = response.type_response?.qr_data ?? null
  const qrFromPoi = response.point_of_interaction?.transaction_data?.qr_code ?? null
  const qrData = qrFromRoot ?? qrFromTypeResponse ?? qrFromPoi ?? null
  const checkoutUrl =
    response.point_of_interaction?.transaction_data?.ticket_url ??
    null

  // DIAGNÓSTICO temporal del troubleshooting del schema sept 2025:
  // logueamos la SHAPE de la respuesta (top-level keys + structure de
  // POI si existe) para confirmar dónde MP coloca el QR en el flujo
  // real. Sanitizado — no leakea tokens (no debería haber, pero
  // defensa). Pasarlo a level=info para que se vea en Vercel logs.
  console.log(JSON.stringify({
    level: 'info',
    component: 'mp/orders',
    event: 'mp_order_create_response',
    operation: 'create-order-qr',
    externalReference: input.externalReference,
    externalPosId: input.externalPosId,
    orderIdMp: response.id ?? null,
    notificationUrlPresent: typeof notificationUrl === 'string',
    ...(notificationUrl ? { notificationUrl: sanitizeWebhookUrlForLog(notificationUrl) } : {}),
    qrSource:
      qrFromRoot !== null ? 'root.qr_data'
      : qrFromTypeResponse !== null ? 'type_response.qr_data'
      : qrFromPoi !== null ? 'point_of_interaction.transaction_data.qr_code'
      : 'NO_QR_FOUND',
    qrDataLen: typeof qrData === 'string' ? qrData.length : null,
    qrDataPreview: typeof qrData === 'string' ? qrData.slice(0, 40) : null,
    checkoutUrlPresent: typeof checkoutUrl === 'string',
    // Top-level keys de la respuesta para ver qué nos manda MP:
    responseTopLevelKeys: response && typeof response === 'object'
      ? Object.keys(response as unknown as Record<string, unknown>)
      : null,
    // POI shape (si existe) — para saber el path real del QR.
    pointOfInteractionShape: response.point_of_interaction
      ? sanitizeForLog(response.point_of_interaction)
      : null,
    // Si NO encontramos el QR en ningún path conocido, logueamos la
    // respuesta entera sanitizada para detectar el path nuevo.
    ...(qrData === null ? { fullResponseSanitized: sanitizeForLog(response) } : {}),
  }))

  return {
    orderIdMp: response.id,
    qrData,
    checkoutUrl,
    raw: response,
  }
}
