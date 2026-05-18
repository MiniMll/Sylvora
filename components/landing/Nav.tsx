import Link from 'next/link'
import { Brand } from '@/components/Brand'

// Nav de la landing. Server component — el `isAuthenticated` viene
// resuelto desde `app/page.tsx` que lee la cookie en el server, así
// que no hay flash de "Entrar" → "Ir al dashboard" en hydration.
//
// Sticky para que el CTA "Entrar / Dashboard" esté siempre visible
// al scrollear. Border-bottom mínimo aparece sutilmente cuando el
// contenido pasa por debajo (no usamos efectos JS de "elevate on
// scroll" para mantenerlo simple).

interface NavProps {
  isAuthenticated: boolean
}

export function Nav({ isAuthenticated }: NavProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bg)',
        borderBottom: '1px solid rgba(0,0,0,0.04)',
      }}
    >
      <div
        className="landing-container"
        style={{
          maxWidth: 1200,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          href="/"
          aria-label="Sylvora — inicio"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          <Brand variant="wordmark" size={20} color="dark" />
        </Link>

        <Link
          href={isAuthenticated ? '/dashboard' : '/login'}
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text2)',
            textDecoration: 'none',
            padding: '8px 4px',
          }}
        >
          {isAuthenticated ? 'Ir al dashboard' : 'Entrar'}
        </Link>
      </div>
    </header>
  )
}
