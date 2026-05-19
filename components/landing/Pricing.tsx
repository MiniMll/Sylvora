'use client'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { useInView } from './lib/useInView'

// Sección de pricing. Un solo plan, sin tiers, sin comparativa.
// La estrategia (ver docs/landing-spec.md §4.7 + §9) es no hacer
// pensar al visitante "¿qué plan elijo?" — quiere saber si entra o
// no entra a su bolsillo. Por eso una sola card, centrada, grande.
//
// La card tiene dos zonas separadas por un divider sutil:
//   1. Arriba — la oferta de entrada: 30 días gratis sin tarjeta.
//      Es el ANCHOR mental, lo que hace que pruebe.
//   2. Abajo — qué cuesta después. Honesto, claro, sin asteriscos.
//
// El monto AR$20.000/mes — más arriba del rango "balanceado" del
// spec. La decisión: 15k empieza a sonar "software barato" para el
// nivel visual que está tomando el producto. 20k mantiene
// accesibilidad para kioscos/minimarkets pero se siente sostenible
// (soporte por WhatsApp, hosting, mejoras, inflación AR). Ancla
// mental: ~1 línea de celular de gama media.
//
// Si lo cambiás, tocá UNA constante: PRECIO_MENSUAL_AR. No hay más
// copias del monto en la landing.

const PRECIO_MENSUAL_AR = 20000

interface PricingProps {
  /** Cambia el destino del CTA según si el visitante ya tiene cuenta. */
  isAuthenticated: boolean
}

export function Pricing({ isAuthenticated }: PricingProps) {
  const { ref, inView } = useInView<HTMLDivElement>()

  const ctaHref = isAuthenticated ? '/dashboard' : '/registro'
  const ctaLabel = isAuthenticated ? 'Ir al dashboard' : 'Empezar gratis'

  // Formateado a la argentina: $15.000 (punto como separador de miles).
  const precioFormateado = '$' + PRECIO_MENSUAL_AR.toLocaleString('es-AR')

  return (
    <Section background="bg" paddingY="lg" id="precios">
      <Container maxWidth={1100}>
        <div
          ref={ref}
          className={`landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
        >
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
            <h2 className="landing-h2">Un precio. Cero sorpresas.</h2>
            <p className="landing-sub" style={{ marginTop: 16 }}>
              Sin tiers, sin "contactá ventas", sin costos escondidos.
            </p>
          </div>

          {/* La card en sí. max-width 480, centrada. La eyebrow violet
              arriba del título marca categoría sin pesar la jerarquía. */}
          <div className="pricing-card">
            <span className="pricing-eyebrow">PLAN ÚNICO</span>

            {/* Zona 1 — la oferta de entrada. */}
            <h3 className="pricing-headline">
              Gratis por <span className="pricing-headline-accent">30 días</span>.
            </h3>
            <ul className="pricing-bullets">
              <li><Check size={16} strokeWidth={2.4} /> Sin tarjeta de crédito al registrarte</li>
              <li><Check size={16} strokeWidth={2.4} /> Sin instalación, sin programas raros</li>
              <li><Check size={16} strokeWidth={2.4} /> Todas las funciones desde el día uno</li>
            </ul>

            <div className="pricing-divider" />

            {/* Zona 2 — qué cuesta después. Honesto. */}
            <div className="pricing-after">
              <span className="pricing-after-label">Después</span>
              <div className="pricing-precio-row">
                <span className="pricing-precio">{precioFormateado}</span>
                <span className="pricing-precio-suffix">/mes</span>
              </div>
            </div>
            <ul className="pricing-bullets">
              <li><Check size={16} strokeWidth={2.4} /> Usuarios ilimitados</li>
              <li><Check size={16} strokeWidth={2.4} /> Soporte por WhatsApp</li>
              <li><Check size={16} strokeWidth={2.4} /> Cancelás cuando quieras. Sin contrato anual.</li>
            </ul>

            {/* CTA — reusamos .hero-cta para que la jerarquía visual
                sea consistente con la primaria del hero. */}
            <Link
              href={ctaHref}
              className="hero-cta pricing-cta"
              aria-label={ctaLabel}
            >
              <span>{ctaLabel}</span>
              <span aria-hidden="true" style={{ marginLeft: 8 }}>→</span>
            </Link>

            <p className="pricing-micro">
              {isAuthenticated
                ? 'Ya tenés tu cuenta activa.'
                : 'Probás 30 días. Después decidís.'}
            </p>
          </div>
        </div>
      </Container>
    </Section>
  )
}
