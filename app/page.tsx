import ReactDOM from 'react-dom'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Metadata } from 'next'
import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { Footer } from '@/components/landing/Footer'

// Server component. Lee la cookie de auth en el server para decidir si
// el visitante está logueado, así el nav muestra "Ir al dashboard" o
// "Entrar" desde el primer paint (sin flash de hydration).
//
// Las secciones de contenido se agregan en commits siguientes
// (Hero, Problema, Cómo funciona, etc.).

export const metadata: Metadata = {
  // `absolute` evita que el template '%s · Sylvora' del layout root
  // se aplique. Queremos que la landing tenga el brand al principio.
  title: { absolute: 'Sylvora — Punto de venta y control de stock para comercios' },
  description:
    'Cobrá, controlá stock y cerrá tu caja desde el celular. Hecho para kioscos, almacenes y minimarkets. Empezás gratis en 2 minutos.',
  openGraph: {
    title: 'Sylvora — Punto de venta y control de stock para comercios',
    description: 'Hecho para kioscos, almacenes y minimarkets. Probá 30 días gratis, sin tarjeta.',
    locale: 'es_AR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sylvora — Punto de venta y control de stock',
    description: 'Hecho para kioscos, almacenes y minimarkets. Probá 30 días gratis, sin tarjeta.',
  },
  alternates: { canonical: '/' },
}

async function resolverAuth(): Promise<boolean> {
  // Lee la cookie en el server. Si Supabase está mal configurada o no
  // hay cookie, devuelve false (visitante anónimo) sin tirar error.
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() { /* no-op — el server component no setea cookies */ },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    return !!user
  } catch {
    return false
  }
}

export default async function HomePage() {
  const isAuthenticated = await resolverAuth()

  // Preload del screenshot del hero para acelerar el LCP.
  // ReactDOM.preload inyecta <link rel="preload"> en el head del HTML
  // server-rendered. Solo el desktop — mobile recibe el suyo via
  // <picture> source y el browser lo descarga apenas resuelve el media.
  ReactDOM.preload('/landing/01-hero-pos.webp', { as: 'image', fetchPriority: 'high' })

  return (
    <>
      <Nav isAuthenticated={isAuthenticated} />
      <main>
        <Hero isAuthenticated={isAuthenticated} />
        {/* Próximas secciones (Problema, ComoFunciona, ParaQuien,
            Features, Pricing, FAQ, CTAFinal) en commits siguientes. */}
      </main>
      <Footer />
    </>
  )
}
