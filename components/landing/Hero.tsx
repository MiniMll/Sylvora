import Link from 'next/link'
import { Smartphone, Users, MessageCircle, Zap, Sparkles } from 'lucide-react'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { ScreenshotCard } from './lib/ScreenshotCard'
import { loginDemoAction } from '@/lib/actions/demo-login'

// Hero de la landing. Server component (cero JS).
//
// Composición (split asimétrico — patrón Resend/Stripe/PostHog):
//   Desktop ≥1024:
//     ┌─────────────┬──────────────────┐
//     │ texto 45%   │  screenshot 55%  │
//     │ izquierda   │  con overflow    │
//     │             │  hacia derecha   │
//     └─────────────┴──────────────────┘
//     │  benefits row full-width        │
//
//   Mobile/Tablet <1024:
//     stack vertical centered — texto → CTA → screenshot → benefits.
//     El screenshot entra antes que benefits para que el producto
//     esté visible al primer scroll mobile también.
//
// Por qué split asimétrico (45/55) en lugar de centered: H1 largo
// descriptivo + producto protagonista + categoría no conocida por el
// target = el centered nos salía como "presentation slide". El split
// deja al H1 respirar a la izquierda y al producto dominar a la
// derecha. Más cerca de cómo se siente un producto real moderno.
//
// La animación entrada es CSS puro stagger via animation-delay,
// definido en globals.css. Respeta prefers-reduced-motion.

const BENEFITS = [
  { icon: Smartphone,    label: 'En cualquier celular'  },
  { icon: Users,         label: 'Usuarios y roles'      },
  { icon: MessageCircle, label: 'Soporte por WhatsApp'  },
  { icon: Zap,           label: 'Setup en 2 minutos'    },
]

interface HeroProps {
  /** Cambia el destino del CTA según si el visitante ya tiene cuenta. */
  isAuthenticated: boolean
  /** Tipo de error si el botón "Ver demo" falló. Pasado desde page.tsx
   *  que lee searchParams. Si está presente, mostramos un banner
   *  inline en lugar del botón demo. */
  demoError?: 'config' | 'auth' | null
}

const DEMO_ERROR_COPY: Record<'config' | 'auth', string> = {
  config: 'La demo no está disponible ahora. Probá entrar directamente con tu cuenta.',
  auth: 'No pudimos abrir la demo. Probá de nuevo en unos minutos o creá tu cuenta.',
}

export function Hero({ isAuthenticated, demoError = null }: HeroProps) {
  const ctaHref = isAuthenticated ? '/dashboard' : '/registro'
  const ctaLabel = isAuthenticated ? 'Ir al dashboard' : 'Probar 30 días gratis'

  return (
    <Section background="bg" paddingY="lg">
      <Container maxWidth={1200}>
        <div className="hero-split">
          {/* Columna izquierda — texto alineado a la izquierda en
              desktop, centered en mobile (gestionado por CSS).
              El order de elementos sigue el flujo: eyebrow → H1 →
              sub → CTA → micro. */}
          <div className="hero-text">
            <span className="hero-eyebrow hero-stagger hero-stagger-1">
              <span className="hero-eyebrow-marker" aria-hidden="true" />
              Para kioscos, almacenes y minimarkets
            </span>

            {/* H1 con line breaks distintos según viewport.
                Los <br> con .landing-hide-desktop rompen en mobile
                y desaparecen en desktop. En desktop split, el texto
                hace wrap natural en la columna 45%. */}
            <h1 className="landing-h1 hero-h1-gap hero-stagger hero-stagger-2">
              Cobrá,
              <br className="landing-hide-desktop" />
              {' '}controlá stock
              <br />
              y cerrá tu caja
              <br className="landing-hide-desktop" />
              {' '}desde el celular.
            </h1>

            <p className="landing-sub hero-sub-gap hero-stagger hero-stagger-3">
              Hecho para kioscos, almacenes y minimarkets argentinos.
              <br className="landing-hide-desktop" />
              {' '}Empezás gratis en 2 minutos.
            </p>

            {demoError && (
              <div className="hero-demo-error hero-stagger hero-stagger-4" role="alert">
                {DEMO_ERROR_COPY[demoError]}
              </div>
            )}

            <div className="hero-cta-row hero-cta-gap hero-stagger hero-stagger-4">
              <Link
                href={ctaHref}
                className="hero-cta"
                aria-label={ctaLabel}
              >
                <span>{ctaLabel}</span>
                <span aria-hidden="true" style={{ marginLeft: 8 }}>→</span>
              </Link>

              {/* "Ver demo" — solo para visitantes no autenticados. Si
                  el visitante ya tiene cuenta no tiene sentido ofrecerle
                  la demo (puede ver su propio comercio). El botón es un
                  <form action=serverAction> para que el handler corra
                  100% server-side y la DEMO_PASSWORD nunca llegue al
                  cliente. */}
              {!isAuthenticated && (
                <form action={loginDemoAction}>
                  <button
                    type="submit"
                    className="hero-cta-demo"
                    aria-label="Ver una demo del producto"
                  >
                    <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
                    Ver demo
                  </button>
                </form>
              )}

              <span className="hero-micro">Sin tarjeta · 2 minutos</span>
            </div>
          </div>

          {/* Columna derecha — screenshot protagonista.
              En desktop, .hero-screenshot-overflow le permite escapar
              de la columna hacia el borde derecho del viewport para
              señal "hay más app". En mobile vuelve a contained.
              El glow violeta vive en el ::before del wrapper. */}
          <div className="hero-screenshot-col hero-stagger hero-stagger-5">
            <div className="hero-screenshot-overflow">
              <div className="hero-screenshot-mask">
                <ScreenshotCard
                  src="/landing/01-hero-pos.webp"
                  srcMobile="/landing/07-pos-mobile.webp"
                  alt="Sylvora POS cobrando un ticket con productos argentinos"
                  width={1440}
                  height={900}
                  priority
                />
              </div>
            </div>
          </div>
        </div>

        {/* Benefits row — banda full-width debajo del split.
            Funciona como bridge visual entre el hero y la sección
            siguiente (Problema). */}
        <ul className="hero-benefits hero-stagger hero-stagger-6">
          {BENEFITS.map(({ icon: Icon, label }) => (
            <li key={label} className="hero-benefit">
              <Icon size={16} strokeWidth={2} />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}
