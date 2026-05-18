'use client'
import { Wallet, Package, UserCheck } from 'lucide-react'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { useInView } from './lib/useInView'

// Sección de empatía. Refleja al lector los 3 dolores estructurales
// del comercio chico LATAM. NO menciona Sylvora ni features — la
// solución aparece en la siguiente sección ("Cómo funciona"). Esa
// separación dolor/solución es deliberada para crear ritmo.
//
// Ver docs/landing-spec.md §14c para principios y copy decidido.

interface ProblemaCard {
  Icon: typeof Wallet
  titulo: string
  descripcion: string
}

const CARDS: ProblemaCard[] = [
  {
    Icon: Wallet,
    titulo: 'No sabés cuánto te quedó.',
    descripcion:
      'Vendiste todo el día, pero cerrar caja te lleva una hora — y los números nunca cuadran.',
  },
  {
    Icon: Package,
    titulo: 'Te enterás del stock cuando ya no hay.',
    descripcion:
      'El cliente pide el producto que vendía como pan caliente. Mirás el depósito y no queda. Otra venta perdida.',
  },
  {
    Icon: UserCheck,
    titulo: 'No sabés qué hizo tu empleado.',
    descripcion:
      'Anuló una venta, retiró efectivo, cobró por fuera. Lo descubrís dos semanas después, si lo descubrís.',
  },
]

export function Problema() {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <Section background="bg" paddingY="lg">
      <Container maxWidth={1200}>
        <div
          ref={ref}
          className={`landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
        >
          {/* Título centrado + lead. Max-width 720 para no estirarlo
              en wide. */}
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
            <h2 className="landing-h2">
              Lo más difícil no es vender.
              <br />
              Es saber qué pasó al final del día.
            </h2>
            <p className="landing-sub" style={{ marginTop: 16 }}>
              Si tenés un comercio, ya conocés esto.
            </p>
          </div>

          {/* Grid 1-col mobile / 3-col desktop con las 3 viñetas. */}
          <div className="problema-grid">
            {CARDS.map(({ Icon, titulo, descripcion }) => (
              <article key={titulo} className="problema-card">
                <div className="problema-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.6} />
                </div>
                <h3 className="problema-card-title">{titulo}</h3>
                <p className="problema-card-desc">{descripcion}</p>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
