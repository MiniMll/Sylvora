import Link from 'next/link'
import { Brand } from '@/components/brand/Brand'

// Nav de la landing. Server component — el `isAuthenticated` viene
// resuelto desde `app/page.tsx` que lee la cookie en el server, así
// que no hay flash de "Entrar" → "Ir al dashboard" en hydration.
//
// Sticky para que el CTA "Entrar / Dashboard" esté siempre visible
// al scrollear. Border-bottom mínimo aparece sutilmente cuando el
// contenido pasa por debajo (no usamos efectos JS de "elevate on
// scroll" para mantenerlo simple).
//
// Links centrales (Cómo funciona · Precios · Preguntas) son anchors
// a las secciones correspondientes — usan `<a href="#...">` plano
// para que el browser maneje el smooth scroll nativamente.
// Desktop ≥768: visibles. Mobile: ocultos (sin hamburguesa todavía,
// el target del producto está acostumbrado a hacer scroll directo).

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#precios',       label: 'Precios'        },
  { href: '#preguntas',     label: 'Preguntas'      },
]

interface NavProps {
  isAuthenticated: boolean
}

export function Nav({ isAuthenticated }: NavProps) {
  return (
    <header className="landing-nav">
      <div
        className="landing-container landing-nav-inner"
        style={{ maxWidth: 1200 }}
      >
        <Link
          href="/"
          aria-label="Sylvora — inicio"
          className="landing-nav-brand"
        >
          <Brand size={30} withText style={{ color: 'var(--text)' }} />
        </Link>

        <nav className="landing-nav-links" aria-label="Navegación principal">
          {NAV_LINKS.map(l => (
            <a key={l.href} href={l.href} className="landing-nav-link">
              {l.label}
            </a>
          ))}
        </nav>

        <Link
          href={isAuthenticated ? '/dashboard' : '/login'}
          className="landing-nav-cta"
        >
          {isAuthenticated ? 'Ir al dashboard' : 'Entrar'}
        </Link>
      </div>
    </header>
  )
}
