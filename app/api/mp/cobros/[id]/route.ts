// GET /api/mp/cobros/[id]
// ---------------------------------------------------------------
// Devuelve el estado actual de un intento de cobro. Usado por el
// polling del POS cada 2s mientras espera el pago.
//
// Aplica lazy expiry: si el intento está pendiente pero expira_en
// ya pasó, lo marca expirado antes de devolver (idempotente y
// race-safe contra webhook gracias al WHERE estado='pendiente' del
// data layer).
//
// Defensas:
//   - Auth (cookie) → 401 sin sesión.
//   - RLS: la query a intentos_cobro_mp ya filtra por comercio_id.
//   - Validación explícita de UUID en el path para no pegarle a la
//     DB con basura.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  obtenerIntentoCobroPorId,
  marcarExpiradoSiCorresponde,
  actualizarIntentoCobro,
} from '@/lib/supabase/mp'
import { resolveAccessToken } from '@/lib/mp/token-provider'
import { mpGet } from '@/lib/mp/api-client'
import type { MPOrderResponse } from '@/lib/mp/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MP_POLL_MIN_INTERVAL_MS = 4_000
const lastMpOrderPollAt = new Map<string, number>()

interface GetCobroResponse {
  intento_id: string
  estado: string
  monto: number
  metodo: string
  qr_data: string | null
  checkout_url: string | null
  expira_en: string
  pagado_en: string | null
  venta_id: string | null
  mp_status_detail: string | null
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().trim() : ''
}

function numericAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function getPaymentReferenceId(order: MPOrderResponse): number | null {
  const ref = order.transactions?.payments?.[0]?.reference_id
  if (!ref) return null
  const n = Number(ref)
  return Number.isInteger(n) && n > 0 ? n : null
}

function mapOrderStatus(order: MPOrderResponse): 'aprobado' | 'rechazado' | null {
  const orderStatus = normalizeStatus(order.status)
  const orderStatusDetail = normalizeStatus(order.status_detail)
  const payments = order.transactions?.payments ?? []
  const paymentStatuses = payments.map(p => normalizeStatus(p.status))
  const paymentStatusDetails = payments.map(p => normalizeStatus(p.status_detail))
  const totalAmount = numericAmount(order.total_amount)
  const totalPaidAmount = numericAmount(order.total_paid_amount)

  const approvedStatuses = new Set(['approved', 'accredited', 'paid', 'processed'])
  const rejectedStatuses = new Set(['rejected', 'cancelled', 'canceled'])

  if (
    approvedStatuses.has(orderStatus) ||
    approvedStatuses.has(orderStatusDetail) ||
    paymentStatuses.some(s => approvedStatuses.has(s)) ||
    paymentStatusDetails.some(s => approvedStatuses.has(s)) ||
    (totalAmount > 0 && totalPaidAmount >= totalAmount)
  ) {
    return 'aprobado'
  }

  if (
    rejectedStatuses.has(orderStatus) ||
    paymentStatuses.some(s => rejectedStatuses.has(s))
  ) {
    return 'rechazado'
  }

  return null
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* no-op */ },
      },
    },
  )

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // RLS hace el filtro por comercio_id — si el intento no es del
  // comercio del caller, recibimos null (no row).
  let intento: Awaited<ReturnType<typeof obtenerIntentoCobroPorId>>
  try {
    intento = await obtenerIntentoCobroPorId(userClient, id)
  } catch (e) {
    console.error(JSON.stringify({
      event: 'mp_get_cobro_db_error',
      intentoId: id,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
  if (!intento) {
    return NextResponse.json({ error: 'Intento no encontrado' }, { status: 404 })
  }

  // Lazy expiry: si está pendiente y vencido, lo marca expirado.
  // No-op si está en cualquier otro estado.
  let actual: Awaited<ReturnType<typeof marcarExpiradoSiCorresponde>>
  try {
    actual = await marcarExpiradoSiCorresponde(userClient, intento)
  } catch (e) {
    // Si falla el lazy expiry, devolvemos el estado anterior — peor
    // caso, el frontend pollea de nuevo en 2s y lo intenta otra vez.
    console.warn(JSON.stringify({
      event: 'mp_lazy_expiry_failed',
      intentoId: id,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    actual = intento
  }

  if (actual.estado === 'pendiente' && actual.order_id_mp) {
    const updatedAtMs = new Date(actual.actualizado_en).getTime()
    const lastPollAt = lastMpOrderPollAt.get(actual.id) ?? 0
    const now = Date.now()
    const recentlyUpdated = Number.isFinite(updatedAtMs) &&
      now - updatedAtMs < MP_POLL_MIN_INTERVAL_MS
    const recentlyPolled = now - lastPollAt < MP_POLL_MIN_INTERVAL_MS

    if (!recentlyUpdated && !recentlyPolled) {
      lastMpOrderPollAt.set(actual.id, now)

      try {
        const token = await resolveAccessToken({
          comercioId: actual.comercio_id,
          supabase: userClient,
        })
        const order = await mpGet<MPOrderResponse>({
          accessToken: token.accessToken,
          path: `/v1/orders/${encodeURIComponent(actual.order_id_mp)}`,
          operation: 'poll-order-status',
        })
        const nuevoEstado = mapOrderStatus(order)

        if (nuevoEstado === 'aprobado') {
          const paymentId = getPaymentReferenceId(order)
          actual = await actualizarIntentoCobro(userClient, actual.id, {
            estado: 'aprobado',
            mp_payment_id: paymentId,
            mp_status_detail: order.status_detail ?? order.transactions?.payments?.[0]?.status_detail ?? null,
            pagado_en: order.last_updated_date ?? new Date(),
          })
          console.log(JSON.stringify({
            event: 'mp_poll_order_update_success',
            intentoId: actual.id,
            orderIdMp: actual.order_id_mp,
            estadoNuevo: actual.estado,
            paymentId,
            orderStatus: order.status,
            orderStatusDetail: order.status_detail ?? null,
          }))
        } else if (nuevoEstado === 'rechazado') {
          const paymentId = getPaymentReferenceId(order)
          actual = await actualizarIntentoCobro(userClient, actual.id, {
            estado: 'rechazado',
            mp_payment_id: paymentId,
            mp_status_detail: order.status_detail ?? order.transactions?.payments?.[0]?.status_detail ?? null,
          })
          console.log(JSON.stringify({
            event: 'mp_poll_order_update_success',
            intentoId: actual.id,
            orderIdMp: actual.order_id_mp,
            estadoNuevo: actual.estado,
            paymentId,
            orderStatus: order.status,
            orderStatusDetail: order.status_detail ?? null,
          }))
        }
      } catch (e) {
        console.warn(JSON.stringify({
          event: 'mp_poll_order_failed',
          intentoId: actual.id,
          orderIdMp: actual.order_id_mp,
          errorName: e instanceof Error ? e.name : 'unknown',
          errorMessage: e instanceof Error ? e.message : 'unknown',
        }))
      }
    }
  }

  const response: GetCobroResponse = {
    intento_id: actual.id,
    estado: actual.estado,
    monto: Number(actual.monto),
    metodo: actual.metodo,
    qr_data: actual.qr_data,
    checkout_url: actual.checkout_url,
    expira_en: actual.expira_en,
    pagado_en: actual.pagado_en,
    venta_id: actual.venta_id,
    mp_status_detail: actual.mp_status_detail,
  }

  return NextResponse.json(response, { status: 200 })
}
