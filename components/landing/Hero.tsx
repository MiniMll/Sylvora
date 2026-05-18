import Link from 'next/link'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { ScreenshotCard } from './lib/ScreenshotCard'

// Hero de la landing. Server component (cero JS) — la animación de
// entrada es CSS puro con stagger via animation-delay, definido en
// globals.css bajo .hero-stagger-*. Respeta prefers-reduced-motion.
//
// Composición exacta del spec (docs/landing-spec.md §14b):
//   1. H1 con line breaks controlados (4 líneas mobile / 2 desktop).
//   2. Sub-headline 2 líneas.
//   3. CTA primaria.
//   4. Micro-trust.
//   5. Screenshot grande (LCP-crítico).
//
// Toda la jerarquía está alineada al center y centrada horizontalmente.

interface HeroProps {
  /** Cambia el destino del CTA según si el visitante ya tiene cuenta. */
  isAuthenticated: boolean
}

export function Hero({ isAuthenticated }: HeroProps) {
  // Si está logueado, el CTA primario lo manda al dashboard en vez
  // de empujarlo a un signup que ya hizo.
  const ctaHref = isAuthenticated ? '/dashboard' : '/registro'
  const ctaLabel = isAuthenticated ? 'Ir al dashboard' : 'Probar 30 días gratis'

  return (
    <Section background="bg" paddingY="lg">
      <Container maxWidth={1100}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {/* H1 con line breaks distintos según viewport.
              Los <br> con .landing-hide-desktop rompen líneas en mobile
              y desaparecen en desktop, dejando "Cobrá, controlá stock"
              en una sola línea. */}
          <h1 className="landing-h1 hero-stagger hero-stagger-1">
            Cobrá,
            <br className="landing-hide-desktop" />
            {' '}controlá stock
            <br />
            y cerrá tu caja
            <br className="landing-hide-desktop" />
            {' '}desde el celular.
          </h1>

          {/* Sub-headline: identifica al target + baja la barrera. */}
          <p className="landing-sub hero-sub-gap hero-stagger hero-stagger-2" style={{ maxWidth: 640 }}>
            Hecho para kioscos, almacenes y minimarkets.
            <br />
            Empezás gratis en 2 minutos.
          </p>

          {/* CTA primaria. En mobile va full-width (gestionado por
              .hero-cta), en desktop auto-width centrado. */}
          <Link
            href={ctaHref}
            className="hero-cta hero-cta-gap hero-stagger hero-stagger-3"
            aria-label={ctaLabel}
          >
            <span>{ctaLabel}</span>
            <span aria-hidden="true" style={{ marginLeft: 8 }}>→</span>
          </Link>

          {/* Micro-trust: "Sin tarjeta · 2 minutos". El middle-dot
              da el feel editorial vs un bullet o pipe. */}
          <p className="hero-micro hero-micro-gap hero-stagger hero-stagger-4">
            Sin tarjeta · 2 minutos
          </p>
        </div>

        {/* Screenshot del hero. Recibe el tratamiento editorial
            estándar (radius + border + shadow 2-capas) via
            ScreenshotCard. priority=true → eager + fetchPriority
            high para acelerar el LCP. */}
        <div className="hero-screenshot-gap hero-stagger hero-stagger-5">
          <ScreenshotCard
            src="/landing/01-hero-pos.webp"
            srcMobile="/landing/07-pos-mobile.webp"
            alt="Sylvora POS cobrando un ticket con productos argentinos"
            width={1440}
            height={900}
            priority
          />
        </div>
      </Container>
    </Section>
  )
}
