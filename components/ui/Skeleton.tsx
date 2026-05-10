'use client'
import type { CSSProperties } from 'react'

interface SkeletonProps {
  /** Ancho CSS. Default: 100%. */
  width?: number | string
  /** Alto CSS. Default: 14 (línea de texto). Ignorado si se pasa aspectRatio. */
  height?: number | string
  /** Para skeletons cuadrados o de aspect fijo (ej. imágenes de cards). */
  aspectRatio?: string
  /** border-radius. Default: 6 (esquinas suaves). */
  radius?: number | string
  style?: CSSProperties
  className?: string
}

/**
 * Skeleton placeholder genérico para loading states con estructura
 * conocida (cards, tablas, KPIs).
 *
 * Usa pulseSoft (definida en globals.css) que ya respeta
 * prefers-reduced-motion vía la regla global.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  aspectRatio,
  radius = 6,
  style,
  className,
}: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        width,
        height: aspectRatio ? undefined : height,
        aspectRatio,
        borderRadius: radius,
        background: 'var(--bg3)',
        animation: 'pulseSoft 1.6s ease-in-out infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
