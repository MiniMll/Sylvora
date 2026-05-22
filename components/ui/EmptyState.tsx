'use client'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'

// Empty state unificado del producto. Construido sobre la convención
// CSS existente (.empty-state / .empty-icon / .empty-title / .empty-sub
// en globals.css) para mantener consistencia con lo que ya había.
//
// Cada empty state del sprint "first merchant experience" debe:
//  - explicar QUÉ falta (title)
//  - decir cuál es el SIGUIENTE PASO (description)
//  - ofrecer CTA(s) claros (actions)
//  - opcionalmente, link discreto a la guía (guiaHref)
//
// Las acciones pueden ser links (href) o botones (onClick). Se estilan
// igual en ambos casos para no mezclar <Link> con <Button> anidados.

export interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'ghost'
  icon?: ReactNode
}

interface EmptyStateProps {
  /** Icono ya dimensionado, ej. <Package size={20} />. */
  icon: ReactNode
  title: string
  description?: string
  actions?: EmptyStateAction[]
  /** Si se pasa, muestra link discreto "¿No sabés qué hacer? Ver guía". */
  guiaHref?: string
  /** Icono con fondo violeta sutil en lugar del gris neutro. */
  accent?: boolean
  size?: 'sm' | 'md'
  style?: CSSProperties
}

const actionBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 9,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'background 0.12s, border-color 0.12s',
  // Tap target cómodo en mobile (Android baratos): mínimo 40px alto.
  minHeight: 40,
}

function actionStyle(variant: 'primary' | 'ghost'): CSSProperties {
  if (variant === 'primary') {
    return { ...actionBase, background: 'var(--ac)', color: '#fff', border: '1px solid var(--ac)' }
  }
  return { ...actionBase, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }
}

function ActionEl({ action }: { action: EmptyStateAction }) {
  const variant = action.variant ?? 'ghost'
  const content = <>{action.icon}{action.label}</>
  if (action.href) {
    return <Link href={action.href} style={actionStyle(variant)}>{content}</Link>
  }
  return (
    <button type="button" onClick={action.onClick} style={actionStyle(variant)}>
      {content}
    </button>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  guiaHref,
  accent = false,
  size = 'md',
  style,
}: EmptyStateProps) {
  return (
    <div className={`empty-state${size === 'sm' ? ' empty-state-sm' : ''}`} style={style}>
      <div className={`empty-icon${accent ? ' empty-icon-accent' : ''}`}>
        {icon}
      </div>
      <div className="empty-title">{title}</div>
      {description && (
        <div className="empty-sub" style={{ maxWidth: 340, margin: '0 auto' }}>
          {description}
        </div>
      )}

      {actions && actions.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginTop: 16,
        }}>
          {actions.map(a => <ActionEl key={a.label} action={a} />)}
        </div>
      )}

      {guiaHref && (
        <div style={{ marginTop: 14 }}>
          <Link
            href={guiaHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              color: 'var(--text2)',
              textDecoration: 'none',
            }}
          >
            <HelpCircle size={13} strokeWidth={2} />
            ¿No sabés qué hacer? Ver guía rápida
          </Link>
        </div>
      )}
    </div>
  )
}
