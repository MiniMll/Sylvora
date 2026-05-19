'use client'
import { CreditCard, Sparkles } from 'lucide-react'
import { SectionHeader } from './TabComercio'

// Tab "Plan" — placeholder simple por ahora.
// V1 solo expone el plan actual + un mensaje "próximamente"; cuando
// se integre Mercado Pago (o el provider que decidamos), acá vive
// la gestión de suscripción.

interface Props {
  plan: string
}

const PLAN_LABEL: Record<string, { label: string; descripcion: string }> = {
  trial: {
    label: 'Trial gratuito',
    descripcion: 'Acceso completo durante 30 días. Sin tarjeta, sin compromiso.',
  },
  pro: {
    label: 'Pro',
    descripcion: 'Plan completo activo.',
  },
  expired: {
    label: 'Trial vencido',
    descripcion: 'Tu período de prueba terminó. Suscribite para seguir usando Sylvora.',
  },
}

export function TabPlan({ plan }: Props) {
  const info = PLAN_LABEL[plan] ?? {
    label: plan,
    descripcion: 'Plan personalizado.',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader Icon={CreditCard} title="Plan activo"
        subtitle="Tu suscripción actual y forma de pago" />

      {/* Card del plan actual. Diseño limpio sin gradient — el viejo
          violet → lavender gradient se sentía marketing-y; este es
          info+status legible. */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{
          width: 44, height: 44,
          borderRadius: 12,
          background: 'var(--ac-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Sparkles size={20} color="var(--ac)" strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: 'var(--text)',
            letterSpacing: '-0.01em',
          }}>
            {info.label}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>
            {info.descripcion}
          </div>
        </div>
        <span style={{
          background: plan === 'expired' ? 'rgba(255,71,87,0.10)' : 'var(--ac-light)',
          color: plan === 'expired' ? 'var(--r)' : 'var(--ac)',
          fontSize: 11, fontWeight: 600,
          padding: '5px 12px',
          borderRadius: 999,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontFamily: 'DM Mono, monospace',
        }}>
          {plan}
        </span>
      </div>

      {/* Placeholder de gestión */}
      <div style={{
        background: 'var(--bg3)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 14,
        padding: '20px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text)',
          marginBottom: 6,
        }}>
          Gestión de suscripción
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
          Próximamente vas a poder cambiar de plan, ver historial de pagos
          y actualizar el método de cobro desde acá.
        </div>
      </div>
    </div>
  )
}
