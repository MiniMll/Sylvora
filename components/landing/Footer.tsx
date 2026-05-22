import Link from 'next/link'
import { Brand } from '@/components/brand/Brand'

const WHATSAPP_URL =
  'https://wa.me/5491126716530?text=Hola%2C%20quiero%20probar%20Sylvora'

const FOOTER_LINKS = [
  { href: '/guia', label: 'Guía rápida' },
  { href: '/terminos', label: 'Términos' },
  { href: '/privacidad', label: 'Privacidad' },
  { href: WHATSAPP_URL, label: 'WhatsApp', external: true },
]

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
          display: 'grid',
          gap: 28,
        }}
      >
        <div
          className="landing-footer-top"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 28,
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <Brand size={32} withText style={{ color: 'var(--text)' }} />
            <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 10, lineHeight: 1.5 }}>
              Punto de venta y stock para comercios chicos.
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 }}>
              Hecho para kioscos, almacenes y minimarkets en Argentina.
            </div>
          </div>

          <nav
            className="landing-footer-links"
            aria-label="Links del footer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {FOOTER_LINKS.map((link) => {
              if (link.external) {
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="landing-footer-link"
                  >
                    {link.label}
                  </a>
                )
              }

              return (
                <Link key={link.href} href={link.href} className="landing-footer-link">
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 18,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
            color: 'var(--text2)',
          }}
        >
          <div>© 2026 Sylvora</div>
          <div>Versión inicial para comercios chicos.</div>
        </div>
      </div>
    </footer>
  )
}
