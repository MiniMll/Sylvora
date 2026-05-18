import Link from 'next/link'

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--ac)',
              color: 'white',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '-0.04em',
            }}
          >
            Sy
          </span>
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text)',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              Sylvora
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
              Punto de venta y stock para comercios chicos.
            </div>
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
