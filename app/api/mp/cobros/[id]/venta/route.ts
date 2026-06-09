// PUT /api/mp/cobros/[id]/venta
// ---------------------------------------------------------------
// Asocia una venta recién creada al intento aprobado. Lo llama el
// frontend después de:
//   1. Recibir estado='aprobado' del polling.
//   2. Ejecutar guardarVenta con metodo_pago='mercadopago'.
//   3. Recibir el id de la venta OK.
//
// Best-effort: si esto falla, la venta YA existe pero queda sin
// link al intento. El webhook posterior puede no completar la
// trazabilidad, pero el dinero está cobrado y la venta registrada.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rolPuede, esRolValido } from '@/lib/permissions'
import {
  obtenerIntentoCobroPorId,
  asociarVentaAIntento,
} from '@/lib/supabase/mp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ReqBody {
  venta_id?: unknown
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  let body: ReqBody
  try {
    body = (await req.json()) as ReqBody
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const ventaId = typeof body.venta_id === 'string' ? body.venta_id : ''
  if (!UUID_RE.test(ventaId)) {
    return NextResponse.json({ error: 'venta_id inválido' }, { status: 400 })
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

  const { data: perfil, error: perfilError } = await userClient
    .from('perfiles').select('id, comercio_id, rol').eq('id', user.id).single()
  if (perfilError || !perfil) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
  }
  if (!esRolValido(perfil.rol) || !rolPuede(perfil.rol, 'venta.crear')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const intento = await obtenerIntentoCobroPorId(userClient, id)
  if (!intento) {
    return NextResponse.json({ error: 'Intento no encontrado' }, { status: 404 })
  }
  if (intento.comercio_id !== perfil.comercio_id) {
    return NextResponse.json({ error: 'Intento no pertenece a tu comercio' }, { status: 403 })
  }
  // No exigimos que el intento esté en estado aprobado — un caller
  // podría asociar venta en un estado raro (ej. requiere_revision)
  // si se recupera manualmente. El data layer no impone reglas.

  let actualizado: Awaited<ReturnType<typeof asociarVentaAIntento>>
  try {
    actualizado = await asociarVentaAIntento(userClient, id, ventaId)
  } catch (e) {
    console.error(JSON.stringify({
      event: 'mp_asociar_venta_falla',
      intentoId: id,
      ventaId,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'No pudimos asociar la venta' }, { status: 500 })
  }

  console.log(JSON.stringify({
    event: 'mp_venta_asociada',
    intentoId: id,
    ventaId,
    comercioId: perfil.comercio_id,
  }))

  return NextResponse.json({
    intento_id: actualizado.id,
    venta_id: actualizado.venta_id,
    estado: actualizado.estado,
  }, { status: 200 })
}
