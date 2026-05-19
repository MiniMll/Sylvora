// GET /api/debug/auth-check
// ⚠️ TEMPORAL — endpoint de diagnóstico. Borrar cuando el bug de RLS
// de comercios esté resuelto.
//
// Qué hace: usa las MISMAS cookies del usuario que está logueado en
// el browser y reporta:
//   1. user.id que ve el server (= auth.uid() en RLS)
//   2. perfil del user (rol + comercio_id) según la tabla perfiles
//   3. resultado de un UPDATE no-op a comercios (mismo flujo que /perfil)
//   4. resultado de SELECT comercios filtrado por comercio_id
//
// Si el UPDATE devuelve 0 filas pero el perfil tiene rol='admin' →
// la policy de RLS está mal escrita o las functions get_rol/
// get_comercio_id no resuelven bien.
//
// Si el UPDATE devuelve 1 fila → la RLS funciona y el bug está
// en otro lado (probablemente el client side de /perfil).

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()

  // Project ref extraído del URL — sirve para confirmar si el deploy
  // está apuntando al mismo proyecto Supabase que el SQL Editor que
  // estás mirando en otra pestaña. Bug clásico de "el comercio existe
  // pero el SELECT devuelve null" = SQL Editor en proyecto A, deploy
  // en proyecto B.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const projectRefMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
  const projectRef = projectRefMatch?.[1] ?? null

  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* no-op — GET no muta cookies */ },
      },
    }
  )

  // ───── 1. Auth user ───────────────────────────────────────────────
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({
      error: 'No hay sesión activa',
      userErr: userErr?.message,
      hint: 'Probá esto desde una pestaña donde estés logueado.',
    }, { status: 401 })
  }

  // ───── 2. Perfil del user ─────────────────────────────────────────
  // maybeSingle distingue 0 filas (null sin error) de N filas (error).
  // single() en cambio explota con "Cannot coerce" cuando hay 0 — que
  // confunde con un problema de auth/RLS cuando en realidad es "el
  // row no existe".
  const { data: perfil, error: perfilErr } = await supabase
    .from('perfiles')
    .select('id, rol, comercio_id, nombre')
    .eq('id', user.id)
    .maybeSingle()

  // ───── 3. SELECT comercio (debería pasar comercios_read_propio) ───
  const { data: comercio, error: comercioSelErr } = await supabase
    .from('comercios')
    .select('id, nombre, tipo, direccion, telefono, email')
    .eq('id', perfil?.comercio_id ?? '')
    .maybeSingle()

  // ───── 4. UPDATE no-op (mismo flujo que /perfil) ──────────────────
  // Seteamos el nombre al MISMO valor que ya tenía. Si la policy
  // de UPDATE funciona, devuelve la fila modificada. Si bloquea,
  // devuelve [] sin error.
  const { data: updateRows, error: updateErr } = await supabase
    .from('comercios')
    .update({ nombre: comercio?.nombre ?? '__noop__' })
    .eq('id', perfil?.comercio_id ?? '')
    .select()

  return NextResponse.json({
    proyecto: {
      project_ref: projectRef,
      url: supabaseUrl,
      hint: 'Comparalo con el project_ref en la URL de tu SQL Editor. Si no coinciden, estás mirando 2 DBs distintas.',
    },
    auth: {
      user_id: user.id,
      user_email: user.email,
    },
    perfil: {
      data: perfil,
      error: perfilErr?.message ?? null,
    },
    select_comercio: {
      data: comercio,
      // Full error object — para distinguir "Cannot coerce" (era con
      // .single, ya no debería pasar) vs PGRST116 ("not found") vs
      // 42501 ("permission denied") que indicaría RLS.
      error: comercioSelErr ? {
        message: comercioSelErr.message,
        code: (comercioSelErr as any).code,
        details: (comercioSelErr as any).details,
        hint: (comercioSelErr as any).hint,
      } : null,
    },
    update_comercio_noop: {
      filas_afectadas: updateRows?.length ?? 0,
      data: updateRows,
      error: updateErr ? {
        message: updateErr.message,
        code: (updateErr as any).code,
        details: (updateErr as any).details,
        hint: (updateErr as any).hint,
      } : null,
    },
    diagnostico: {
      tiene_sesion: !!user,
      tiene_perfil: !!perfil,
      rol: perfil?.rol ?? null,
      rol_length: perfil?.rol?.length ?? null,
      rol_es_admin_exacto: perfil?.rol === 'admin',
      perfil_id_coincide_user: perfil?.id === user.id,
      // Si perfil.comercio_id apunta a una fila inexistente, este
      // flag distingue claramente "comercio no existe" de "RLS bloqueó".
      perfil_apunta_a_comercio_huerfano: !!perfil && !comercio,
      comercio_select_funciona: !!comercio,
      comercio_update_funciona: (updateRows?.length ?? 0) > 0,
    },
  })
}
