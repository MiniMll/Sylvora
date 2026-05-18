'use client'
import type { ReactNode } from 'react'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import {
  MiniPOSPreview,
  MiniStockPreview,
  MiniCajaPreview,
  MiniUsersPreview,
  MiniTicketPreview,
  MiniLotesPreview,
} from './lib/MiniPreviews'
import { useInView } from './lib/useInView'

// Las 6 features presentadas como "qué resuelve por vos" — verbos
// de acción del dueño, no sustantivos técnicos del producto.
// Cada card: título + sub corto + mini preview recreado en JSX/CSS.
//
// Por qué Mini* en lugar de mini-screenshots (decisión post-commit-4):
// las capturas WebP a 80KB en cards de ~520px se sienten blandas y
// rompen la percepción premium. Los Mini* usan los mismos tokens y
// la misma DM Sans/Mono que el producto real — son vector-crisp, no
// pesan bytes, y mantienen continuidad visual con la app.
//
// Disciplina aplicada (docs/landing-spec.md §14f):
// - 6 max, ni 7 ni 5.
// - Cada sub agrega UN detalle que el hero/cómo funciona no
//   mencionaron (métodos de pago, vencimientos, roles, etc.) para
//   no repetir lo mismo en otro tono.

interface Feature {
  titulo: string
  descripcion: string
  preview: ReactNode
}

const FEATURES: Feature[] = [
  {
    titulo: 'Cobrá en segundos.',
    descripcion:
      'Efectivo, débito, crédito, Mercado Pago. Calcula el vuelto solo.',
    preview: <MiniPOSPreview />,
  },
  {
    titulo: 'Stock que te avisa.',
    descripcion:
      'Te marca lo que está por agotarse y separa lo crítico de lo que recién baja.',
    preview: <MiniStockPreview />,
  },
  {
    titulo: 'Caja cerrada de verdad.',
    descripcion:
      'Al final del día sabés cuánto vendiste, qué retiraste y cuánto queda.',
    preview: <MiniCajaPreview />,
  },
  {
    titulo: 'Tu equipo, con control.',
    descripcion:
      'Cada empleado con su cuenta y su rol. Vos decidís qué puede tocar cada uno.',
    preview: <MiniUsersPreview />,
  },
  {
    titulo: 'Tickets profesionales.',
    descripcion:
      'Imprimís en térmica o mandás por WhatsApp en un toque. Sin programas raros.',
    preview: <MiniTicketPreview />,
  },
  {
    titulo: 'Lotes con vencimiento.',
    descripcion:
      'Cargás la fecha al recibir mercadería. Sylvora te avisa cuando algo está por vencer.',
    preview: <MiniLotesPreview />,
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
        {feature.preview}
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
