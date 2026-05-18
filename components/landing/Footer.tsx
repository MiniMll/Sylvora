import Link from 'next/link'
import { Brand } from '@/components/Brand'

// Footer minimalista. Server component sin interactividad.
// Los links Términos / Privacidad apuntan a `#` por ahora — cuando
// existan las páginas estáticas reales los cableamos. WhatsApp queda
// con `#` hasta que tengas el número operativo confirmado.

export function Footer() {
  return (
    <footer
      style={{
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        padding: '48px 0',
      }}
    >
      <div
        className="landing-container"
        style={{
          maxWidth: 1200,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div>
          <Brand variant="wordmark" size={22} color="dark" />
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>
            Punto de venta y stock para comercios chicos.
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 20,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            fontSize: 12,
            color: 'var(--text2)',
          }}
        >
          <div>© 2026 Sylvora</div>
          <nav style={{ display: 'flex', gap: 20 }}>
            <Link href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Términos</Link>
            <Link href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Privacidad</Link>
            <Link href="#" style={{ color: 'inherit', textDecoration: 'none' }}>WhatsApp</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
