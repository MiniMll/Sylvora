import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Lista explícita de rutas que requieren autenticación. Todo lo demás
// (`/`, `/login`, `/registro`, futuras páginas públicas) queda accesible
// sin auth. Invertimos la lógica respecto al diseño anterior (donde
// listábamos rutas públicas) para que agregar la landing o cualquier
// página pública nueva no requiera tocar este archivo.
const RUTAS_PROTEGIDAS = [
  '/dashboard',
  '/pos',
  '/productos',
  '/stock',
  '/ventas',
  '/caja',
  '/reportes',
  '/exportar',
  '/precios',
  '/configuracion',
  '/usuarios',
]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const esProtegida = RUTAS_PROTEGIDAS.some(r => pathname === r || pathname.startsWith(`${r}/`))

  // Sin auth y ruta protegida → /login.
  if (!user && esProtegida) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Con auth y va a /login o /registro → /dashboard. El user logueado
  // que llega a la landing (/) la ve normalmente; el nav le muestra
  // "Ir al dashboard" en vez de "Entrar".
  if (user && (pathname.startsWith('/login') || pathname.startsWith('/registro'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
