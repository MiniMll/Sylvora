// POST /api/mp/cobros/[id]/cancelar
// ---------------------------------------------------------------
// Cancela un intento de cobro pendiente. Atómico: si el webhook
// llegó y aprobó el cobro entre el click del comerciante y este
// UPDATE, NO cancelamos — devolvemos el estado real.
//
// Defensas:
//   - Auth (cookie) → 401.
//   - Permiso venta.crear (los 3 roles lo tienen — gate flojo, pero
//     coherente con el endpoint de crear).
//   - RLS sobre intentos_cobro_mp UPDATE — filtra por comercio.
//   - Validación UUID.
//
// Edge case crítico documentado: si MP ya cobró al cliente y el
// comerciante cancela en Sylvora, el comerciante igual recibe el
// dinero en su cuenta MP. Hay que avisar al admin (panel de
// conciliación queda fuera de scope V1).

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rolPuede, esRolValido } from '@/lib/permissions'
import {
  obtenerIntentoCobroPorId,
  cancelarIntentoCobro,
} from '@/lib/supabase/mp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CancelarResponse {
  intento_id: string
  estado: string
  /** true si esta request cambió el estado. false si ya estaba en
   *  otro estado terminal (info para la UI: el comerciante igual
   *  recibió dinero si era 'aprobado'). */
  cancelado: boolean
}

export async function POST(
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

  const { data: perfil, error: perfilError } = await userClient
    .from('perfiles')
    .select('id, comercio_id, rol')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
  }
  if (!esRolValido(perfil.rol) || !rolPuede(perfil.rol, 'venta.crear')) {
    return NextResponse.json({ error: 'No tenés permiso para cancelar cobros' }, { status: 403 })
  }

  // Verificación explícita: el intento existe y es del comercio del
  // caller. RLS también lo enforza pero queremos un 404 claro en vez
  // de un "cancelar devolvió not_found".
  let intento: Awaited<ReturnType<typeof obtenerIntentoCobroPorId>>
  try {
    intento = await obtenerIntentoCobroPorId(userClient, id)
  } catch (e) {
    console.error(JSON.stringify({
      event: 'mp_cancelar_db_error',
      intentoId: id,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
  if (!intento) {
    return NextResponse.json({ error: 'Intento no encontrado' }, { status: 404 })
  }
  if (intento.comercio_id !== perfil.comercio_id) {
    // RLS ya nos protege; este check es defensa explícita por si en
    // el futuro alguien afloja RLS por error.
    return NextResponse.json({ error: 'Intento no pertenece a tu comercio' }, { status: 403 })
  }

  let result: Awaited<ReturnType<typeof cancelarIntentoCobro>>
  try {
    result = await cancelarIntentoCobro(userClient, id)
  } catch (e) {
    console.error(JSON.stringify({
      event: 'mp_cancelar_falla',
      intentoId: id,
      comercioId: perfil.comercio_id,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'No pudimos cancelar el cobro' }, { status: 500 })
  }

  if (result.ok) {
    console.log(JSON.stringify({
      event: 'mp_cobro_cancelado',
      intentoId: id,
      comercioId: perfil.comercio_id,
      perfilId: perfil.id,
    }))
    const response: CancelarResponse = {
      intento_id: result.intento.id,
      estado: result.intento.estado,
      cancelado: true,
    }
    return NextResponse.json(response, { status: 200 })
  }

  // !result.ok — el intento ya no estaba pendiente. Casos:
  //   - reason='not_pending' con intento.estado='aprobado': MP cobró
  //     entre el click y el UPDATE. El comerciante igual recibió
  //     dinero. Avisar a UI.
  //   - reason='not_pending' con estado='rechazado'/'cancelado'/
  //     'expirado': el intento ya estaba terminado. Idempotente.
  //   - reason='not_found': raro porque verificamos arriba — race
  //     con DELETE no debería existir (no hay DELETE policy).
  if (result.reason === 'not_found') {
    return NextResponse.json({ error: 'Intento no encontrado' }, { status: 404 })
  }

  const estadoActual = result.intento?.estado ?? 'desconocido'
  console.log(JSON.stringify({
    event: 'mp_cancelar_no_pendiente',
    intentoId: id,
    comercioId: perfil.comercio_id,
    estadoActual,
  }))
  const response: CancelarResponse = {
    intento_id: id,
    estado: estadoActual,
    cancelado: false,
  }
  // 200 con cancelado=false — el caller decide qué mostrar.
  return NextResponse.json(response, { status: 200 })
}
