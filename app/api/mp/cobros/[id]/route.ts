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
} from '@/lib/supabase/mp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
