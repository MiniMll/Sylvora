import type { Metadata } from 'next'
import Link from 'next/link'
import { Brand } from '@/components/brand/Brand'

export const metadata: Metadata = {
  title: 'Términos',
  description: 'Términos simples de uso de Sylvora.',
}

export default function TerminosPage() {
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 72px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 56 }}>
          <Link href="/" aria-label="Volver a Sylvora" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Brand size={30} withText />
          </Link>
          <Link href="/" className="landing-footer-link">
            Volver
          </Link>
        </header>

        <article style={{ display: 'grid', gap: 28 }}>
          <div>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--ac)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Términos de uso
            </p>
            <h1 style={{ fontSize: 44, lineHeight: 1.08, letterSpacing: '-0.035em', margin: 0 }}>
              Términos simples para usar Sylvora
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--text2)', marginTop: 18 }}>
              Sylvora es una herramienta en etapa inicial para ayudar a comercios chicos a vender, controlar stock y revisar información básica del negocio.
            </p>
          </div>

          {[
            {
              title: 'Uso del servicio',
              body: 'Podés usar Sylvora para cargar productos, registrar ventas, revisar caja, exportar información e invitar empleados. La plataforma puede cambiar o mejorar con el tiempo, especialmente mientras está en etapa inicial o beta.',
            },
            {
              title: 'Datos cargados por el comercio',
              body: 'El usuario es responsable de cargar datos correctos: precios, stock, códigos, ventas, métodos de pago y datos del comercio. Sylvora ayuda a organizar esa información, pero no reemplaza la revisión del negocio.',
            },
            {
              title: 'Errores manuales',
              body: 'No somos responsables por pérdidas, diferencias de caja, stock incorrecto o reportes equivocados causados por datos mal cargados, ventas omitidas, anulaciones incorrectas o uso manual del sistema.',
            },
            {
              title: 'Disponibilidad',
              body: 'Trabajamos para que Sylvora funcione bien, pero pueden existir cortes, errores o cambios mientras el producto evoluciona. Si algo falla, haremos lo posible por corregirlo de forma razonable.',
            },
            {
              title: 'Dejar de usar Sylvora',
              body: 'Podés dejar de usar el servicio cuando quieras. Si necesitás asistencia para exportar o revisar información antes de irte, podés escribirnos por los canales disponibles.',
            },
          ].map((section) => (
            <section key={section.title} style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
              <h2 style={{ fontSize: 20, lineHeight: 1.25, letterSpacing: '-0.02em', margin: 0 }}>{section.title}</h2>
              <p style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--text2)', marginTop: 10 }}>{section.body}</p>
            </section>
          ))}

          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: 24 }}>
            Última actualización: mayo de 2026.
          </p>
        </article>
      </div>
    </main>
  )
}
