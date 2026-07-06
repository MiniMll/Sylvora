// GET /auth/callback
// ---------------------------------------------------------------
// Landing genérico de los redirects de Supabase Auth. Recibe el
// ?code de un flujo PKCE (recuperación de contraseña, y a futuro
// invitaciones / confirmación de email), lo intercambia por una
// sesión (setea las cookies sb-*), y redirige a ?next.
//
// Es la pieza que faltaba: sin esta ruta, el link del email de
// recuperación no tenía dónde aterrizar y el usuario quedaba sin
// sesión. Ver docs/qa-auditoria-integral-2026-07.md §1.1 (L1/V1).
//
// Seguridad:
//   - `next` se sanitiza (rutaInternaSegura) para evitar open redirect.
//   - Si falta el code o el intercambio falla → /login con motivo.
//
// IMPORTANTE (config Supabase): la URL {SITE_URL}/auth/callback debe
// estar en Authentication → URL Configuration → Redirect URLs, o
// Supabase rechaza el redirectTo del email.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rutaInternaSegura } from '@/lib/auth/redirect'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Destino por defecto tras recuperar: la pantalla de nueva contraseña.
  const next = rutaInternaSegura(searchParams.get('next'), '/reset-password')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?auth=link_invalido`)
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
    return NextResponse.redirect(`${origin}/login?auth=link_expirado`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
