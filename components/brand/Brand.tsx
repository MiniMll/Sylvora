'use client'

import type { CSSProperties } from 'react'
import { SylvoraMark } from './SylvoraMark'

interface BrandProps {
  size?: number
  withText?: boolean
  className?: string
  style?: CSSProperties
}

export function Brand({ size = 32, withText = false, className, style }: BrandProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(8, Math.round(size * 0.28)),
        color: 'currentColor',
        lineHeight: 1,
        ...style,
      }}
    >
      <SylvoraMark size={size} concept="a-solid" finish="gradient" />
      {withText && (
        <span
          style={{
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontSize: Math.round(size * 0.72),
            fontWeight: 700,
            letterSpacing: '-0.035em',
            color: 'currentColor',
            lineHeight: 1,
          }}
        >
          sylvora
        </span>
      )}
    </span>
  )
}
