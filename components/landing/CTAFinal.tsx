'use client'
import Link from 'next/link'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { useInView } from './lib/useInView'

// Sección de cierre. Tono explícitamente NO agresivo:
// - Sin countdown.
// - Sin "última oportunidad".
// - Sin "+1.000 comercios ya lo usan" (en V1 sería mentira).
// - Sin segundo CTA secundario (menos ruido = menos fricción).
//
// El copy es "probalo y fijate si te sirve" — invitación, no presión.
// El reaseguro va abajo de la CTA en micro-text: lo que el visitante
// quiere oír antes de hacer clic.
//
// Fondo violeta brand (var(--ac)): único uso de full-bleed violeta en
// toda la landing. Le da peso al cierre sin necesidad de gritar.

interface CTAFinalProps {
  /** Cambia el destino del CTA según si el visitante ya tiene cuenta. */
  isAuthenticated: boolean
}

export function CTAFinal({ isAuthenticated }: CTAFinalProps) {
  const { ref, inView } = useInView<HTMLDivElement>()

  const ctaHref = isAuthenticated ? '/dashboard' : '/registro'
  const ctaLabel = isAuthenticated ? 'Ir al dashboard' : 'Empezar gratis'

  return (
    <Section background="brand" paddingY="lg">
      <Container maxWidth={720}>
        <div
          ref={ref}
          className={`landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
          style={{ textAlign: 'center' }}
        >
          <h2 className="ctafinal-title">
            Probalo y fijate si te sirve.
          </h2>
          <p className="ctafinal-sub">
            En 2 minutos tenés tu primera venta cobrada.
            <br />
            Si después no te suma, no hacés nada.
          </p>

          <Link
            href={ctaHref}
            className="ctafinal-cta"
            aria-label={ctaLabel}
          >
            <span>{ctaLabel}</span>
            <span aria-hidden="true" style={{ marginLeft: 8 }}>→</span>
          </Link>

          <p className="ctafinal-micro">Sin tarjeta · Sin instalación</p>
        </div>
      </Container>
    </Section>
  )
}
