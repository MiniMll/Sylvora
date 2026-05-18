'use client'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { ScreenshotCard } from './lib/ScreenshotCard'
import { useInView } from './lib/useInView'

// 3 pasos del producto en formato visual zig-zag (desktop) / stack
// vertical (mobile). Cada paso: número 01/02/03 en DM Mono sutil +
// headline + sub + screenshot.
//
// Ver docs/landing-spec.md §14d. Background white para alternar con
// la sección anterior (off-white).

interface Paso {
  numero: string
  titulo: string
  descripcion: string
  screenshot: string
  alt: string
  width: number
  height: number
}

const PASOS: Paso[] = [
  {
    numero: '01',
    titulo: 'Cargás tus productos.',
    descripcion: 'Una vez. Foto, precio, stock. Listo.',
    screenshot: '/landing/03-productos-stock.webp',
    alt: 'Lista de productos del comercio en Sylvora con sus estados de stock',
    width: 1200,
    height: 700,
  },
  {
    numero: '02',
    titulo: 'Cobrás desde el celular.',
    descripcion:
      'Tu empleado solo necesita su teléfono. El sistema calcula el vuelto.',
    screenshot: '/landing/07-pos-mobile.webp',
    alt: 'POS de Sylvora corriendo en un celular con un ticket listo para cobrar',
    width: 600,
    height: 900,
  },
  {
    numero: '03',
    titulo: 'Cerrás caja al final del día.',
    descripcion:
      'Ves qué vendiste, cuánto te quedó y qué falta reponer.',
    screenshot: '/landing/02-caja-cerrada.webp',
    alt: 'Bloque de estado "Caja cerrada" con saldo neto, diferencia y retiro',
    width: 1200,
    height: 700,
  },
]

function PasoRow({ paso, reverse }: { paso: Paso; reverse: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`comofunciona-row${reverse ? ' comofunciona-row--reverse' : ''} landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
    >
      <div className="comofunciona-text">
        <span className="comofunciona-numero">{paso.numero}</span>
        <h3 className="comofunciona-titulo">{paso.titulo}</h3>
        <p className="comofunciona-desc">{paso.descripcion}</p>
      </div>
      <div className="comofunciona-screenshot">
        <ScreenshotCard
          src={paso.screenshot}
          alt={paso.alt}
          width={paso.width}
          height={paso.height}
        />
      </div>
    </div>
  )
}

export function ComoFunciona() {
  const { ref: headerRef, inView: headerInView } = useInView<HTMLDivElement>()

  return (
    <Section background="card" paddingY="lg">
      <Container maxWidth={1200}>
        <div
          ref={headerRef}
          className={`landing-fade-in${headerInView ? ' landing-fade-in--visible' : ''}`}
          style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}
        >
          <h2 className="landing-h2">Tres pasos. Y ya está.</h2>
          <p className="landing-sub" style={{ marginTop: 16 }}>
            Si sabés usar WhatsApp, sabés usar Sylvora.
          </p>
        </div>

        <div className="comofunciona-pasos">
          {PASOS.map((paso, idx) => (
            <PasoRow key={paso.numero} paso={paso} reverse={idx % 2 === 1} />
          ))}
        </div>
      </Container>
    </Section>
  )
}
