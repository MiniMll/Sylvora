// POST /api/mp/revision/[id]/resolver
// ---------------------------------------------------------------
// Resuelve un intento en requiere_revision. ADMIN-ONLY.
//
// Body: { accion: 'venta_registrada'|'venta_asociada'|'reembolsado'|
//         'descartado', venta_id?: uuid, nota?: string }
//
// TODA la resolución pasa por la RPC resolver_intento_mp — este
// endpoint NUNCA hace UPDATE manual del estado. La RPC garantiza en
// una sola transacción: validación de rol admin (segunda capa además
// del check de acá), lock del intento, validación de estado/acción/
// venta, INSERT en la auditoría inmutable, y cierre a 'resuelto'.
//
// Mapeo de errores tipados de la RPC → HTTP:
//   solo_admin       → 403
//   no_encontrado    → 404
//   estado_invalido  → 409 (ya resuelto / cambió de estado)
//   validacion       → 400 (acción/venta/nota inválidas)
//   error            → 500

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { esRolValido } from '@/lib/permissions'
import { resolverIntentoMP, type AccionResolucionMP } from '@/lib/supabase/mp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ACCIONES_VALIDAS: ReadonlySet<string> = new Set([
  'venta_registrada',
  'venta_asociada',
  'reembolsado',
  'descartado',
])

interface ResolverBody {
  accion?: unknown
  venta_id?: unknown
  nota?: unknown
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  let body: ResolverBody
  try {
    body = (await req.json()) as ResolverBody
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const accion = typeof body.accion === 'string' && ACCIONES_VALIDAS.has(body.accion)
    ? (body.accion as AccionResolucionMP)
    : null
  if (!accion) {
    return NextResponse.json(
      { error: 'Acción inválida. Valores: venta_registrada | venta_asociada | reembolsado | descartado' },
      { status: 400 },
    )
  }

  const ventaId = typeof body.venta_id === 'string' && UUID_RE.test(body.venta_id)
    ? body.venta_id
    : null
  if (body.venta_id !== undefined && body.venta_id !== null && ventaId === null) {
    return NextResponse.json({ error: 'venta_id inválido' }, { status: 400 })
  }

  const nota = typeof body.nota === 'string' && body.nota.trim()
    ? body.nota.trim().slice(0, 500)
    : null

  // ── Auth + admin estricto ────────────────────────────────────────
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
    .from('perfiles')
    .select('id, comercio_id, rol')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil?.comercio_id) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
  }
  if (!esRolValido(perfil.rol) || perfil.rol !== 'admin') {
    // Primera capa. La RPC re-valida get_rol()='admin' adentro de la
    // transacción — no dependemos del frontend NI de este check solo.
    return NextResponse.json({ error: 'Solo administradores pueden resolver cobros' }, { status: 403 })
  }

  // ── Resolución vía RPC (única vía — sin UPDATE manual) ──────────
  const result = await resolverIntentoMP(userClient, {
    intentoId: id,
    accion,
    ventaId,
    nota,
  })

  if (!result.ok) {
    const status =
      result.code === 'solo_admin' ? 403
      : result.code === 'no_encontrado' ? 404
      : result.code === 'estado_invalido' ? 409
      : result.code === 'validacion' ? 400
      : 500
    console.warn(JSON.stringify({
      event: 'mp_resolver_rechazado',
      intentoId: id,
      accion,
      code: result.code,
      comercioId: perfil.comercio_id,
      perfilId: perfil.id,
    }))
    return NextResponse.json({ error: result.message, code: result.code }, { status })
  }

  console.log(JSON.stringify({
    event: 'mp_intento_resuelto',
    intentoId: id,
    resolucionId: result.resolucionId,
    accion,
    ventaId,
    comercioId: perfil.comercio_id,
    resueltoPor: perfil.id,
  }))

  return NextResponse.json({
    intento_id: result.intentoId,
    resolucion_id: result.resolucionId,
    accion,
    estado: 'resuelto',
  }, { status: 200 })
}
