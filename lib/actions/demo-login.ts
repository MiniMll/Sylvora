'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

// Server action que loguea al usuario en la cuenta demo compartida
// y lo redirige al dashboard. Llamada desde el botón "Ver demo" en
// la landing (Hero).
//
// Seguridad:
//   - DEMO_PASSWORD vive solo en env server-side (sin NEXT_PUBLIC).
//     Nunca llega al cliente — el visitante hace submit del form y
//     el handler corre 100% en server.
//   - Si la env falta, redirigimos a /?demo_error=config (sin
//     exponer detalles internos al cliente).
//   - Si el signIn falla, idem: /?demo_error=auth.
//
// Cookies:
//   - signInWithPassword setea las cookies de sesión via el
//     setAll callback del createServerClient. En server actions
//     (a diferencia de route handlers) cookies() devuelve un store
//     escribible, así que esto funciona sin Response manual.
//
// Tras login OK, redirect a /dashboard. El AppShell detecta el
// comercio demo (lib/demo.ts) y muestra el DemoBanner + escudo UX.

const DEMO_EMAIL = 'demo@sylvora.app'

export async function loginDemoAction() {
  const password = process.env.DEMO_PASSWORD
  if (!password) {
    // Env mal configurada en Vercel. No exponemos detalles al
    // visitante; la landing muestra un toast genérico.
    console.error('[loginDemoAction] DEMO_PASSWORD no configurada')
    redirect('/?demo_error=config')
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // En server actions sí podemos setear cookies (a diferencia
          // de los route handlers, donde hay que devolver Response).
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    },
  )

  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password,
  })

  if (error) {
    // Caso típico: alguien rotó la password en Dashboard y no la
    // actualizó en Vercel, o el user demo fue borrado. El visitante
    // ve un mensaje genérico — los detalles van al log de server.
    console.error('[loginDemoAction] signInWithPassword falló:', error.message)
    redirect('/?demo_error=auth')
  }

  // Redirect lanza una excepción interna de Next que es captada por
  // el framework; cualquier código después de redirect no se ejecuta.
  redirect('/dashboard')
}
