'use client'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { ScreenshotCard } from './lib/ScreenshotCard'
import { useInView } from './lib/useInView'

// Las 6 features presentadas como "qué resuelve por vos" — verbos
// de acción del dueño, no sustantivos técnicos del producto.
// Cada card: título + sub corto + mini-screenshot abajo.
//
// Disciplina aplicada (docs/landing-spec.md §14f):
// - 6 max, ni 7 ni 5.
// - Cada sub agrega UN detalle que el hero/cómo funciona no
//   mencionaron (métodos de pago, vencimientos, roles, etc.) para
//   no repetir lo mismo en otro tono.
// - 3 screenshots únicos (usuarios, tickets, lotes) + 3 repetidos
//   en mini-card. La repetición está OK acá porque el contexto
//   visual cambia (mini vs full).

interface Feature {
  titulo: string
  descripcion: string
  screenshot: string
  alt: string
  width: number
  height: number
}

const FEATURES: Feature[] = [
  {
    titulo: 'Cobrá en segundos.',
    descripcion:
      'Efectivo, débito, crédito, Mercado Pago. Calcula el vuelto solo.',
    screenshot: '/landing/01-hero-pos.webp',
    alt: 'POS cobrando con métodos de pago y total destacado',
    width: 1440,
    height: 900,
  },
  {
    titulo: 'Stock que te avisa.',
    descripcion:
      'Te marca lo que está por agotarse y separa lo crítico de lo que recién baja.',
    screenshot: '/landing/03-productos-stock.webp',
    alt: 'Lista de productos con chips de estado de stock',
    width: 1200,
    height: 700,
  },
  {
    titulo: 'Caja cerrada de verdad.',
    descripcion:
      'Al final del día sabés cuánto vendiste, qué retiraste y cuánto queda.',
    screenshot: '/landing/02-caja-cerrada.webp',
    alt: 'Bloque "Caja cerrada" con saldo, diferencia y retiro',
    width: 1200,
    height: 700,
  },
  {
    titulo: 'Tu equipo, con control.',
    descripcion:
      'Cada empleado con su cuenta y su rol. Vos decidís qué puede tocar cada uno.',
    screenshot: '/landing/05-usuarios-roles.webp',
    alt: 'Página /usuarios con roles admin y empleado asignados',
    width: 1200,
    height: 700,
  },
  {
    titulo: 'Tickets profesionales.',
    descripcion:
      'Imprimís en térmica o mandás por WhatsApp en un toque. Sin programas raros.',
    screenshot: '/landing/06-ticket.webp',
    alt: 'Ticket de venta con productos, totales y datos del comercio',
    width: 600,
    height: 900,
  },
  {
    titulo: 'Lotes con vencimiento.',
    descripcion:
      'Cargás la fecha al recibir mercadería. Sylvora te avisa cuando algo está por vencer.',
    screenshot: '/landing/04-lotes-vencimientos.webp',
    alt: 'Lotes de un producto con countdown de vencimiento',
    width: 1200,
    height: 700,
  },
]

function FeatureCard({ feature }: { feature: Feature }) {
  const { ref, inView } = useInView<HTMLElement>()
  return (
    <article
      ref={ref}
      className={`feature-card landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
    >
      <h3 className="feature-title">{feature.titulo}</h3>
      <p className="feature-desc">{feature.descripcion}</p>
      <div className="feature-screenshot">
        <ScreenshotCard
          src={feature.screenshot}
          alt={feature.alt}
          width={feature.width}
          height={feature.height}
        />
      </div>
    </article>
  )
}

export function Features() {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <Section background="card" paddingY="lg">
      <Container maxWidth={1200}>
        <div
          ref={ref}
          className={`landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
          style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}
        >
          <h2 className="landing-h2">Lo que Sylvora resuelve por vos.</h2>
        </div>

        <div className="features-grid">
          {FEATURES.map((f) => (
            <FeatureCard key={f.titulo} feature={f} />
          ))}
        </div>
      </Container>
    </Section>
  )
}
