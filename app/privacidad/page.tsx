import type { Metadata } from 'next'
import Link from 'next/link'
import { Brand } from '@/components/brand/Brand'
import { BackLink } from '@/components/BackLink'

export const metadata: Metadata = {
  title: 'Privacidad',
  description: 'Política de privacidad simple de Sylvora.',
}

export default function PrivacidadPage() {
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 72px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 56 }}>
          <Link href="/" aria-label="Volver a Sylvora" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Brand size={30} withText />
          </Link>
          <BackLink className="landing-footer-link">
            Volver
          </BackLink>
        </header>

        <article style={{ display: 'grid', gap: 28 }}>
          <div>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--ac)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Privacidad
            </p>
            <h1 style={{ fontSize: 44, lineHeight: 1.08, letterSpacing: '-0.035em', margin: 0 }}>
              Qué datos guarda Sylvora y para qué
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--text2)', marginTop: 18 }}>
              Guardamos solo la información necesaria para que el comercio pueda operar y consultar su actividad.
            </p>
          </div>

          {[
            {
              title: 'Datos de cuenta',
              body: 'Guardamos datos básicos como email, nombre de usuario, rol y relación con el comercio. Esto permite iniciar sesión, gestionar permisos e identificar quién realiza acciones dentro del sistema.',
            },
            {
              title: 'Datos del comercio',
              body: 'Podemos guardar nombre del comercio, tipo de negocio, teléfono y configuraciones operativas. Se usan para personalizar la experiencia y organizar la información interna.',
            },
            {
              title: 'Datos de operacion',
              body: 'Guardamos productos, precios, stock, ventas, caja, métodos de pago, anulaciones, empleados invitados y reportes relacionados. Estos datos son necesarios para que Sylvora funcione como punto de venta y control de stock.',
            },
            {
              title: 'Para que usamos los datos',
              body: 'Usamos la información para mostrar paneles, emitir tickets, calcular ventas, generar reportes, mejorar el producto y brindar soporte. No vendemos datos del comercio.',
            },
            {
              title: 'Responsabilidad sobre la informacion cargada',
              body: 'El comercio decide qué información cargar y es responsable de que sea correcta. Si un precio, stock o movimiento se carga mal, los reportes pueden reflejar ese error.',
            },
            {
              title: 'Etapa inicial',
              body: 'Sylvora está en una etapa inicial de producto. Eso significa que algunas funciones pueden cambiar, mejorar o ajustarse a medida que aprendemos del uso real de los comercios.',
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
