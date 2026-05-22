// POST /api/usuarios/invite
// ---------------------------------------------------------------
// Invitación de un usuario nuevo al comercio del caller.
// Ver docs/invite-flow-spec.md.
//
// Flow:
//   1. Parsear + validar body.
//   2. Resolver session.user del caller via cookies (anon client).
//   3. Verificar que el caller es admin (service role + SELECT perfiles).
//   4. Disparar inviteUserByEmail (crea auth user + manda magic link).
//   5. INSERT perfil con rol elegido. Si falla → rollback (delete user).
//
// El handler usa service-role para los pasos 3-5. Esa key bypasea RLS,
// así que el chequeo "caller es admin" del paso 3 es la única defensa
// contra privilege escalation — testear con un empleado real antes de
// shipear.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getServiceClient } from '@/lib/supabase/server-admin'

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(req: Request) {
  // ───── 1. Parse + validate ──────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const { email, rol, nombre } = (body ?? {}) as { email?: string; rol?: string; nombre?: string }

  if (!email || typeof email !== 'string' || !emailValido(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }
  if (rol !== 'admin' && rol !== 'empleado') {
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  }
  const emailNorm = email.toLowerCase().trim()
  const nombreNorm = typeof nombre === 'string' && nombre.trim() ? nombre.trim() : null

  // ───── 2. Resolver session ─────────────────────────────────────
  const cookieStore = await cookies()
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        // Setear cookies en route handlers no es soportado por Next 16
        // sin ResponseCookies — y este endpoint no las necesita modificar.
        setAll() { /* no-op */ },
      },
    }
  )
  const { data: { user: caller } } = await userClient.auth.getUser()
  if (!caller) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // ───── 3. Verificar que caller es admin ────────────────────────
  // Importante: usamos service-role acá adrede. Si usáramos el
  // userClient quedaríamos sujetos a la policy SELECT de perfiles
  // (que sí permite leer el propio perfil, pero queremos defensa
  // explícita acá ante cualquier cambio futuro de RLS).
  const admin = getServiceClient()
  const { data: callerPerfil, error: callerPerfilError } = await admin
    .from('perfiles')
    .select('comercio_id, rol')
    .eq('id', caller.id)
    .single()
  if (callerPerfilError || !callerPerfil) {
    return NextResponse.json({ error: 'Perfil del caller no encontrado' }, { status: 403 })
  }
  if (callerPerfil.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo admin puede invitar usuarios' }, { status: 403 })
  }

  // ───── 4. Disparar invite ──────────────────────────────────────
  // Supabase behavior con auth.admin.inviteUserByEmail:
  //   - Email nuevo → crea user + manda magic link → success.
  //   - Email existente NO confirmado → reenvía magic link → success.
  //   - Email existente Y confirmado → error "already registered".
  const { data: inviteData, error: inviteError } = await admin.auth.admin
    .inviteUserByEmail(emailNorm)

  if (inviteError) {
    const msg = (inviteError.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return NextResponse.json({
        error: 'Ese email ya tiene una cuenta activa. Si es de este comercio, pedile que use "olvidé mi contraseña". Si es de otro comercio, no podés invitarlo.',
      }, { status: 409 })
    }
    console.error('[invite] inviteUserByEmail falló:', inviteError.message)
    return NextResponse.json({ error: inviteError.message || 'No se pudo enviar la invitación' }, { status: 500 })
  }

  const userId = inviteData?.user?.id
  if (!userId) {
    console.error('[invite] invite OK pero sin user.id en la respuesta')
    return NextResponse.json({ error: 'Respuesta inválida de Supabase' }, { status: 500 })
  }

  // ───── 5. INSERT perfil + rollback si falla ────────────────────
  const { error: perfilError } = await admin
    .from('perfiles')
    .insert({
      id: userId,
      comercio_id: callerPerfil.comercio_id,
      nombre: nombreNorm,
      rol,
    })

  if (perfilError) {
    // 23505 = unique_violation. La PK de perfiles es id (= auth user id).
    // Si ya existe un perfil para este user_id, significa que el email
    // ya está en algún comercio. Diferenciamos cuál para mejor mensaje.
    if (perfilError.code === '23505') {
      const { data: perfilExistente } = await admin
        .from('perfiles')
        .select('comercio_id')
        .eq('id', userId)
        .single()
      const mismoComercio = perfilExistente?.comercio_id === callerPerfil.comercio_id
      return NextResponse.json({
        error: mismoComercio
          ? 'Ese email ya pertenece a este comercio'
          : 'Ese email ya tiene cuenta en otro comercio',
      }, { status: 409 })
    }

    // Otro error → rollback: borrar el auth user que acabamos de crear
    // para no dejar huérfano. Best-effort: si el delete también falla,
    // queda zombie y se loguea para investigar.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('[invite] perfil insert FAIL + rollback delete FAIL — zombie auth user:', userId, deleteError)
    }
    console.error('[invite] perfil insert falló:', perfilError.message)
    return NextResponse.json({ error: perfilError.message || 'No se pudo crear el perfil' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, user_id: userId }, { status: 200 })
}
