'use client'
import { ButtonHTMLAttributes, ReactNode, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Primitiva Button. 5 variants × 3 sizes + icon + loading + fullWidth.
// Hover via state (no CSS class) — simple, autocontenido, fácil de
// migrar a clases CSS más adelante si el sistema madura.
//
// Caso afuera del sistema: el botón "Cobrar" del POS (gradient verde)
// se queda inline literal porque es la acción identitaria del producto.

type ButtonVariant = 'primary' | 'danger' | 'success' | 'ghost' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
  fullWidth?: boolean
}

const SIZES: Record<ButtonSize, { padding: string; fontSize: number; radius: number; gap: number; iconSize: number }> = {
  sm: { padding: '7px 12px',  fontSize: 12, radius: 8,  gap: 5, iconSize: 13 },
  md: { padding: '9px 16px',  fontSize: 13, radius: 9,  gap: 6, iconSize: 14 },
  lg: { padding: '11px 20px', fontSize: 14, radius: 10, gap: 7, iconSize: 15 },
}

interface VariantStyle {
  bg: string
  color: string
  border: string
  bgHover: string
}

// Hover values: tokens cuando existen (--ac-hover); para danger/success
// se usan tints específicos del componente. Si más adelante el sistema
// los necesita afuera, se promueven a tokens en globals.css.
const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: { bg: 'var(--ac)',   color: 'white',        border: 'none',                       bgHover: 'var(--ac-hover)' },
  danger:  { bg: 'var(--r)',    color: 'white',        border: 'none',                       bgHover: '#e63e4d' },
  success: { bg: 'var(--g)',    color: 'white',        border: 'none',                       bgHover: '#00b486' },
  ghost:   { bg: 'var(--bg2)',  color: 'var(--text)',  border: '1px solid var(--border)',    bgHover: 'var(--bg3)' },
  subtle:  { bg: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)',    bgHover: 'var(--bg3)' },
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  disabled,
  style,
  children,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false)
  const s = SIZES[size]
  const v = VARIANTS[variant]
  const isDisabled = disabled || loading

  return (
    <button
      {...rest}
      disabled={isDisabled}
      onMouseEnter={e => { setHover(true); onMouseEnter?.(e) }}
      onMouseLeave={e => { setHover(false); onMouseLeave?.(e) }}
      style={{
        padding: s.padding,
        fontSize: s.fontSize,
        borderRadius: s.radius,
        background: !isDisabled && hover ? v.bgHover : v.bg,
        color: v.color,
        border: v.border,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: loading ? 'wait' : isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled && !loading ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        width: fullWidth ? '100%' : undefined,
        transition: 'background 0.12s',
        ...style,
      }}>
      {loading
        ? <Loader2 size={s.iconSize} style={{ animation: 'spin 0.75s linear infinite' }} />
        : icon}
      {children}
    </button>
  )
}
