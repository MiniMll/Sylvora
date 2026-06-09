// POST /api/mp/cobros/[id]/requiere-revision
// ---------------------------------------------------------------
// Marca un intento APROBADO como requiere_revision. Lo dispara el
// frontend cuando crear_venta falla después de que MP ya confirmó
// el cobro (típicamente stock cambió mid-flight).
//
// Transición permitida: aprobado → requiere_revision.
// Cualquier otro estado origen → 409 con el estado actual.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rolPuede, esRolValido } from '@/lib/permissions'
import {
  obtenerIntentoCobroPorId,
  marcarIntentoRequiereRevision,
} from '@/lib/supabase/mp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ReqBody {
  motivo?: unknown
}

export async function POST(
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
  const motivo = typeof body.motivo === 'string' && body.motivo.trim()
    ? body.motivo.trim()
    : 'requiere_revision (motivo no provisto)'

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

  // Verificación defensiva — RLS también filtra por comercio.
  const intento = await obtenerIntentoCobroPorId(userClient, id)
  if (!intento) {
    return NextResponse.json({ error: 'Intento no encontrado' }, { status: 404 })
  }
  if (intento.comercio_id !== perfil.comercio_id) {
    return NextResponse.json({ error: 'Intento no pertenece a tu comercio' }, { status: 403 })
  }

  let result: Awaited<ReturnType<typeof marcarIntentoRequiereRevision>>
  try {
    result = await marcarIntentoRequiereRevision(userClient, id, motivo)
  } catch (e) {
    console.error(JSON.stringify({
      event: 'mp_requiere_revision_db_error',
      intentoId: id,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  if (result.ok) {
    console.error(JSON.stringify({
      event: 'mp_intento_requiere_revision',
      intentoId: id,
      comercioId: perfil.comercio_id,
      perfilId: perfil.id,
      // motivo se guarda en DB; no lo metemos en log para no
      // duplicar (puede tener PII).
    }))
    return NextResponse.json({
      intento_id: result.intento.id,
      estado: result.intento.estado,
      ok: true,
    }, { status: 200 })
  }

  if (result.reason === 'not_found') {
    return NextResponse.json({ error: 'Intento no encontrado' }, { status: 404 })
  }
  // not_in_aprobado: estado origen distinto de aprobado. Devolvemos
  // 409 con el estado real para que el frontend decida UX.
  return NextResponse.json({
    intento_id: id,
    estado: result.intento?.estado ?? 'desconocido',
    ok: false,
    error: 'El intento no está en estado aprobado',
  }, { status: 409 })
}
