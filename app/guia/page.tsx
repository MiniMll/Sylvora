import type { Metadata } from 'next'
import Link from 'next/link'
import { Brand } from '@/components/brand/Brand'
import { BackLink } from '@/components/BackLink'

export const metadata: Metadata = {
  title: 'Guía rápida',
  description: 'Guía rápida para empezar con Sylvora.',
}

const STEPS = [
  {
    title: 'Paso 1: Crear cuenta y cargar datos del comercio',
    body: 'Registrate, ingresá el nombre del comercio y completá los datos básicos. Con eso Sylvora ya puede ordenar tu espacio de trabajo.',
  },
  {
    title: 'Paso 2: Agregar productos',
    body: 'Cargá los productos que vendés todos los días: nombre, precio, stock y código de barras si lo tenés. Empezá por los más vendidos.',
  },
  {
    title: 'Paso 3: Hacer la primera venta desde el POS',
    body: 'Entrá al POS, buscá o escaneá un producto, agregalo al ticket y cobrá. Podés elegir el método de pago antes de cerrar la venta.',
  },
  {
    title: 'Paso 4: Revisar ventas y caja',
    body: 'Al final del día, revisá ventas, métodos de pago y movimientos de caja. Esto te ayuda a detectar diferencias rápido.',
  },
  {
    title: 'Paso 5: Exportar informacion',
    body: 'Desde Exportar podés descargar reportes para revisar, guardar o compartir con tu contador.',
  },
  {
    title: 'Paso 6: Invitar empleados si hace falta',
    body: 'Si trabajás con más personas, invitá empleados y asignales el rol que corresponda para que cada uno use lo necesario.',
  },
]

export default function GuiaPage() {
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px 72px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 56 }}>
          <Link href="/" aria-label="Volver a Sylvora" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Brand size={30} withText />
          </Link>
          <BackLink className="landing-footer-link">
            Volver
          </BackLink>
        </header>

        <article>
          <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--ac)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
            2-5 minutos
          </p>
          <h1 style={{ fontSize: 44, lineHeight: 1.08, letterSpacing: '-0.035em', margin: 0 }}>
            Guía rápida para empezar con Sylvora
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--text2)', marginTop: 18, maxWidth: 660 }}>
            Una vuelta corta por lo esencial para que un comercio pueda empezar a vender y controlar stock sin leer documentación larga.
          </p>

          <div style={{ display: 'grid', gap: 14, marginTop: 40 }}>
            {STEPS.map((step, index) => (
              <section
                key={step.title}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr',
                  gap: 16,
                  padding: '18px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--ac-light)',
                    color: 'var(--ac)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'DM Mono, monospace',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {index + 1}
                </div>
                <div>
                  <h2 style={{ fontSize: 19, lineHeight: 1.25, letterSpacing: '-0.02em', margin: 0 }}>{step.title}</h2>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text2)', marginTop: 8 }}>{step.body}</p>
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  )
}
