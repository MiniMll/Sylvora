'use client'
import type { ReactNode } from 'react'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import {
  MiniStockPreview,
  MiniCajaPreview,
  MiniPhoneFrame,
} from './lib/MiniPreviews'
import { useInView } from './lib/useInView'

// 3 pasos del producto en formato visual zig-zag (desktop) / stack
// vertical (mobile). Cada paso: número 01/02/03 en DM Mono sutil +
// headline + sub + visual.
//
// Visual mix (decisión post-commit-4):
// - Paso 1 (Productos): MiniStockPreview recreado en JSX. La utilidad
//   de "stock que te avisa" se entiende mejor con chips crisp que con
//   un screenshot comprimido.
// - Paso 2 (POS mobile): screenshot real DENTRO de MiniPhoneFrame.
//   El frame editorial (bezel + notch en código) le da escala correcta
//   — antes el WebP a flex:1 quedaba gigante vs los otros Mini*. La
//   imagen real adentro del frame sigue diciendo "corre en mi celu".
// - Paso 3 (Caja): MiniCajaPreview recreado. El bloque de saldo es
//   denso y chico — vector le sienta mucho mejor.
//
// Ver docs/landing-spec.md §14d.

interface Paso {
  numero: string
  titulo: string
  descripcion: string
  /** Render del visual del paso. Puede ser un screenshot o un Mini*. */
  visual: ReactNode
}

const PASOS: Paso[] = [
  {
    numero: '01',
    titulo: 'Cargás tus productos.',
    descripcion: 'Una vez. Foto, precio, stock. Listo.',
    visual: <MiniStockPreview />,
  },
  {
    numero: '02',
    titulo: 'Cobrás desde el celular.',
    descripcion:
      'Tu empleado solo necesita su teléfono. El sistema calcula el vuelto.',
    visual: (
      <MiniPhoneFrame
        src="/landing/07-pos-mobile.webp"
        alt="POS de Sylvora corriendo en un celular con un ticket listo para cobrar"
        width={600}
        height={900}
      />
    ),
  },
  {
    numero: '03',
    titulo: 'Cerrás caja al final del día.',
    descripcion:
      'Ves qué vendiste, cuánto te quedó y qué falta reponer.',
    visual: <MiniCajaPreview />,
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
        {paso.visual}
      </div>
    </div>
  )
}

export function ComoFunciona() {
  const { ref: headerRef, inView: headerInView } = useInView<HTMLDivElement>()

  return (
    <Section background="card" paddingY="lg" id="como-funciona">
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
