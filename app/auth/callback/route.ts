// GET /auth/callback
// ---------------------------------------------------------------
// Landing genérico de los redirects de Supabase Auth. Recibe el
// ?code de un flujo PKCE (recuperación de contraseña — V1 — e
// invitación de usuario / primer acceso — U4), lo intercambia por una
// sesión (setea las cookies sb-*), y redirige según el flujo.
//
// El flujo se distingue con ?tipo (ver lib/auth/callback-flow.ts):
//   - recuperación (default): redirige a ?next saneado.
//   - invitación (tipo=invitacion): redirige a /reset-password en modo
//     "bienvenida" para que el usuario fije su primera contraseña.
//
// Es la pieza que faltaba: sin esta ruta, el link del email no tenía
// dónde aterrizar y el usuario quedaba sin sesión. Ver
// docs/qa-recuperacion-password.md §1 y docs/qa-invitaciones.md.
//
// Seguridad:
//   - En recuperación, `next` se sanitiza (rutaInternaSegura) para evitar
//     open redirect. En invitación el destino es fijo.
//   - Si falta el code o el intercambio falla → /login con motivo acorde
//     al flujo (link_/invite_ * invalido/expirado).
//
// IMPORTANTE (config Supabase): la URL {SITE_URL}/auth/callback debe
// estar en Authentication → URL Configuration → Redirect URLs, o
// Supabase rechaza el redirectTo del email. Es la MISMA entrada para
// recuperación e invitación (no hace falta una nueva).

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { flujoDesdeParam, destinoExito, avisoError } from '@/lib/auth/callback-flow'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const flujo = flujoDesdeParam(searchParams.get('tipo'))
  const next = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?auth=${avisoError(flujo, 'sin_code')}`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          // En route handlers de Next 15/16, cookies() es escribible.
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.warn('[auth/callback] exchangeCodeForSession falló:', error.message)
    return NextResponse.redirect(`${origin}/login?auth=${avisoError(flujo, 'exchange')}`)
  }

  return NextResponse.redirect(`${origin}${destinoExito(flujo, next)}`)
}
