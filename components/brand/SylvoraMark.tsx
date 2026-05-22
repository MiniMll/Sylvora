'use client'
import { useId } from 'react'
import {
  SYLVORA_ICON_RECT,
  SYLVORA_MARK_PATH,
  SYLVORA_VIOLET,
  SYLVORA_VIOLET_LIGHT,
} from './mark'

// Sylvora "S" monogram: fixed fill-only reference geometry.

export type MarkConcept = 'a-knockout' | 'a-solid' | 'b-freestanding'
export type MarkFinish = 'flat' | 'gradient'

interface SylvoraMarkProps {
  size?: number
  concept?: MarkConcept
  finish?: MarkFinish
  /** Override del color de relleno en freestanding (ej. mono para PDF). */
  color?: string
  className?: string
}

export function SylvoraMark({
  size = 32,
  concept = 'a-knockout',
  finish = 'flat',
  color,
  className,
}: SylvoraMarkProps) {
  const uid = useId().replace(/:/g, '')
  const gradId = `sg-${uid}`
  const maskId = `sm-${uid}`

  const containerFill = finish === 'gradient' ? `url(#${gradId})` : SYLVORA_VIOLET

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Sylvora"
    >
      <defs>
        {finish === 'gradient' && (
          <linearGradient id={gradId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={SYLVORA_VIOLET_LIGHT} />
            <stop offset="1" stopColor={SYLVORA_VIOLET} />
          </linearGradient>
        )}
        {concept === 'a-knockout' && (
          <mask id={maskId}>
            <rect width="100" height="100" fill="white" />
            <path d={SYLVORA_MARK_PATH} fill="black" />
          </mask>
        )}
      </defs>

      {concept === 'a-knockout' && (
        <rect {...SYLVORA_ICON_RECT} fill={containerFill} mask={`url(#${maskId})`} />
      )}

      {concept === 'a-solid' && (
        <>
          <rect {...SYLVORA_ICON_RECT} fill={containerFill} />
          <path d={SYLVORA_MARK_PATH} fill="#ffffff" />
        </>
      )}

      {concept === 'b-freestanding' && (
        <path d={SYLVORA_MARK_PATH} fill={color ?? containerFill} />
      )}
    </svg>
  )
}
