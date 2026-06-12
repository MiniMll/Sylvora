// Tipos TypeScript de la API de Mercado Pago.
//
// Solo los campos que Sylvora consume — no replicamos la API entera.
// Si en algún momento se necesita más data, agregar los campos acá
// con un comentario "agregado para feature X".
//
// Convención: los nombres de campos respetan tal cual los devuelve MP
// (snake_case), aunque internamente el resto del proyecto sea
// camelCase. Hacer el mapping en los call sites cuando corresponda.
//
// Refs de MP docs:
//   - OAuth:    https://www.mercadopago.com.ar/developers/en/docs/security/oauth
//   - Stores:   https://www.mercadopago.com.ar/developers/en/reference/stores/_users_user_id_stores/post
//   - POS:      https://www.mercadopago.com.ar/developers/en/reference/pos/_pos/post
//   - Orders:   https://www.mercadopago.com.ar/developers/en/reference/in-person-payments/qr-code/orders/create-order/post
//   - Webhooks: https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks
//   - Payments: https://www.mercadopago.com.ar/developers/en/reference/payments/_payments_id/get

// ────────────────────────────────────────────────────────────────────
// OAuth
// ────────────────────────────────────────────────────────────────────

/** Response del endpoint POST /oauth/token (intercambio de code y
 *  refresh). El refresh_token solo viene en el primer intercambio —
 *  guardarlo en mp_credenciales para futuros refreshes. */
export interface MPOAuthTokenResponse {
  access_token: string
  /** 'bearer'. Constante. */
  token_type: string
  /** Segundos hasta expirar. MP devuelve ~15.552.000 (180 días). */
  expires_in: number
  /** Scope concedido. Para Sylvora típicamente 'offline_access read write'. */
  scope: string
  /** Seller id del comerciante. Mismo valor que después aparece en
   *  webhook.user_id — clave del routing. */
  user_id: number
  refresh_token: string
  /** Public key del seller. La usamos para inicializar el SDK MP
   *  en checkout flows si llegamos a necesitar. */
  public_key: string
  /** Si la app está vinculada a una organización de marketplace. */
  live_mode: boolean
}

// ────────────────────────────────────────────────────────────────────
// Stores y POS (creados en onboarding post-OAuth)
// ────────────────────────────────────────────────────────────────────

/** Body para POST /users/{user_id}/stores. */
export interface MPStoreCreateBody {
  name: string
  external_id: string   // controlado por nosotros
  location: {
    street_number?: string
    street_name?: string
    city_name?: string
    state_name?: string
    latitude?: number
    longitude?: number
  }
  business_hours?: Record<string, Array<{ open: string; close: string }>>
}

/** Response de creación de Store. */
export interface MPStoreResponse {
  id: number          // store_id_mp en nuestra DB (lo guardamos como text)
  name: string
  external_id: string
  user_id: number
}

/** Body para POST /pos. */
export interface MPPOSCreateBody {
  name: string
  fixed_amount: boolean         // false para QR dinámico
  store_id: string
  external_id: string           // controlado por nosotros — referenciado por external_pos_id en Orders
  category: number              // ej. 621102 = retail / kiosco
}

/** Response de creación de POS. */
export interface MPPOSResponse {
  id: number
  name: string
  external_id: string           // external_pos_id en nuestra DB
  store_id: string
  user_id: number
  qr?: { template_image: string; image: string }    // QR estático si fixed_amount=true
}

// ────────────────────────────────────────────────────────────────────
// Orders API (creación de cobro QR dinámico)
// ────────────────────────────────────────────────────────────────────

/** Item de la lista transactions.payments. MP exige solo amount; otros
 *  campos (payment_method_id, installments, payer, etc.) los resuelve
 *  cuando el cliente paga el QR. */
export interface MPOrderPayment {
  /** String con 2 decimales, mismo formato que total_amount. */
  amount: string
}

/** Body para POST /v1/orders (Orders API — schema vigente desde
 *  sept 2025; transactions agregado como obligatorio).
 *
 *  Invariante de MP:
 *    total_amount === SUM(transactions.payments[].amount)
 *
 *  Para cobros V1 mandamos 1 sola payment con el monto total. Si en
 *  el futuro soportamos splits (pagar en cuotas múltiples por POS),
 *  pasa a array de varios. */
export interface MPOrderCreateBody {
  type: 'qr'
  total_amount: string          // string con 2 decimales: "1500.00"
  external_reference: string    // nuestro id — clave del webhook lookup
  description?: string
  notification_url?: string     // webhook absoluto opcional para QR Orders
  config: {
    qr: {
      external_pos_id: string
      mode: 'dynamic' | 'static'
    }
  }
  transactions: {
    payments: MPOrderPayment[]
  }
}

/** Response de creación de Order. */
export interface MPOrderResponse {
  id: string                    // order_id_mp
  type: 'qr'
  status: string                // 'created' inicial
  status_detail?: string | null
  total_amount: string
  total_paid_amount?: string | null
  external_reference: string
  user_id?: string | number
  created_date?: string
  last_updated_date?: string
  qr_data?: string              // contenido del QR para renderizar
  type_response?: {
    qr_data?: string            // Orders API nuevo: QR dinámico
  }
  transactions?: {
    payments?: Array<{
      id?: string
      reference_id?: string
      status?: string
      status_detail?: string | null
      amount?: string
      paid_amount?: string
    }>
  }
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string
      qr_code_base64?: string
      ticket_url?: string       // URL del "link de pago" / checkout
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Webhooks
// ────────────────────────────────────────────────────────────────────

/** Payload que MP manda al webhook. Documentado en docs/webhooks.
 *
 *  Tipos de eventos que Sylvora maneja en V1:
 *    - payment.created
 *    - payment.updated
 *
 *  El user_id permite enrutar al comercio dueño. data.id es el
 *  payment_id que después se consulta con GET /v1/payments/{id}
 *  para traer el detalle. */
export interface MPWebhookPayload {
  /** Id del notification event. NO es el payment_id. */
  id: number
  live_mode: boolean
  type: 'payment' | 'merchant_order' | string
  /** ISO 8601. */
  date_created: string
  /** Seller id — match con mp_credenciales.user_id_mp. */
  user_id: number
  api_version: string
  /** Ej. 'payment.created' | 'payment.updated'. */
  action: string
  data: {
    /** Payment id (como string). */
    id: string
  }
}

// ────────────────────────────────────────────────────────────────────
// Payment detail (GET /v1/payments/{id})
// ────────────────────────────────────────────────────────────────────

/** Subset del payment detail que el webhook handler consume para
 *  decidir si aprobar / rechazar / etc. Hay muchísimos más campos
 *  en la respuesta real — agregar acá cuando se necesiten. */
export interface MPPaymentDetail {
  id: number
  /** 'approved' | 'rejected' | 'pending' | 'in_process' | 'cancelled' | 'refunded' | 'charged_back' */
  status: string
  status_detail: string
  /** Pesos. */
  transaction_amount: number
  /** El que mandamos al crear la Order. Lookup principal. */
  external_reference: string | null
  /** ISO 8601. */
  date_approved: string | null
  date_created: string
  /** Order asociada. */
  order?: { id?: string; type?: string }
  /** Para auditoría / detección de fraude eventual. */
  payment_method_id?: string
  payment_type_id?: string
}

// ────────────────────────────────────────────────────────────────────
// Helpers de discriminación
// ────────────────────────────────────────────────────────────────────

/** Mapea status de MP al estado interno de intentos_cobro_mp.
 *  Solo cubre los estados terminales — pendientes/in_process se
 *  ignoran (esperamos el próximo webhook). */
export function mapMPStatusToIntentoEstado(
  mpStatus: string,
): 'aprobado' | 'rechazado' | null {
  if (mpStatus === 'approved') return 'aprobado'
  if (
    mpStatus === 'rejected' ||
    mpStatus === 'cancelled' ||
    mpStatus === 'refunded' ||
    mpStatus === 'charged_back'
  ) {
    return 'rechazado'
  }
  // pending, in_process, authorized → seguir esperando.
  return null
}
