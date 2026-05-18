'use client'
import { Section } from './lib/Section'
import { Container } from './lib/Container'
import { useInView } from './lib/useInView'

// Sección de auto-identificación. 3 perfiles concretos del target
// (kiosco, minimarket, almacén) para que el dueño se vea reflejado.
// La etiqueta UPPERCASE en DM Mono violet brand es el único uso de
// violet en esta sección — marca la categoría.
//
// Ver docs/landing-spec.md §14e.

interface Perfil {
  etiqueta: string
  titulo: string
  dolor: string
  ejemplo: string
}

const PERFILES: Perfil[] = [
  {
    etiqueta: 'KIOSCO / MAXIKIOSCO',
    titulo: 'Cobrá rápido, no perdás vueltos.',
    dolor: 'Decenas de operaciones chicas por día, sumar a mano cansa.',
    ejemplo: 'Galletitas, gaseosas, cigarrillos. Cobrás con efectivo y MP por igual.',
  },
  {
    etiqueta: 'MINIMARKET / AUTOSERVICIO',
    titulo: 'Controlá 200+ productos sin volverte loco.',
    dolor: 'Stock que se mueve rápido, vencimientos que pasás por alto.',
    ejemplo: 'Lácteos, fiambres, panadería. Lotes con fecha. Precios por kg.',
  },
  {
    etiqueta: 'ALMACÉN DE BARRIO',
    titulo: 'Cerrá tu caja en serio, todos los días.',
    dolor: 'Cuentas mezcladas con la familia, no sabés qué te queda neto.',
    ejemplo: 'Almacén con caja chica, varios empleados, retiros parciales.',
  },
]

export function ParaQuien() {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <Section background="bg" paddingY="lg">
      <Container maxWidth={1200}>
        <div
          ref={ref}
          className={`landing-fade-in${inView ? ' landing-fade-in--visible' : ''}`}
        >
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
            <h2 className="landing-h2">
              Hecho para tu negocio.
              <br />
              No para el de una multinacional.
            </h2>
            <p className="landing-sub" style={{ marginTop: 16 }}>
              Si tu comercio entra acá abajo, Sylvora está hecho para vos.
            </p>
          </div>

          <div className="paraquien-grid">
            {PERFILES.map((p) => (
              <article key={p.etiqueta} className="paraquien-card">
                <span className="paraquien-label">{p.etiqueta}</span>
                <h3 className="paraquien-title">{p.titulo}</h3>
                <p className="paraquien-dolor">{p.dolor}</p>
                <p className="paraquien-ejemplo">{p.ejemplo}</p>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
