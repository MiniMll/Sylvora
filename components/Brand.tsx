import type { CSSProperties } from 'react'

// Prototipo del nuevo wordmark de Sylvora — Dirección 1.
//
// El isotipo "Sy" cuadrado violet se reemplaza por un wordmark
// minimalista "sylvora" lowercase. Razones (ver discusión de
// branding en chat / docs futuros):
//
// - Editorial: lowercase + tight letter-spacing es el feel de
//   Linear, Plain, Pacific. Encaja con el tono que tomó la landing.
// - Memorable: la gente lee "sylvora", no descifra iniciales.
// - Atemporal: wordmarks bien hechos no envejecen.
// - Sin cuadrado violeta de iniciales = menos "template SaaS".
//
// Esto es PROTOTIPO. Si el branding funciona en uso real, después
// refinamos (tipografía custom, kerning manual, asset SVG). Por
// ahora todo en JSX puro usando DM Sans que ya está cargada.

type Variant = 'wordmark' | 'icon'
type Color = 'auto' | 'light' | 'dark'

interface BrandProps {
  /** `wordmark` = "sylvora" completo. `icon` = "s" sola, para
   *  favicon / espacios muy chicos. */
  variant?: Variant
  /** font-size en px. Defaults: 20 wordmark, 16 icon. */
  size?: number
  /** Color del texto. `light` = white (sidebar dark, CTA final
   *  violet). `dark` = var(--text). `auto` = currentColor (hereda
   *  del contexto). */
  color?: Color
  className?: string
  style?: CSSProperties
}

function resolveColor(color: Color): string {
  if (color === 'light') return 'white'
  if (color === 'dark') return 'var(--text)'
  return 'currentColor'
}

export function Brand({
  variant = 'wordmark',
  size,
  color = 'auto',
  className,
  style,
}: BrandProps) {
  const isIcon = variant === 'icon'
  const fontSize = size ?? (isIcon ? 16 : 20)

  return (
    <span
      className={className}
      style={{
        fontFamily: '"DM Sans", system-ui, sans-serif',
        fontWeight: isIcon ? 800 : 700,
        fontSize,
        // Letter-spacing tight es la decisión clave del feel
        // editorial. -0.03em es el sweet spot — más cerrado se
        // siente claustrofóbico, más abierto pierde el "premium".
        letterSpacing: isIcon ? '-0.04em' : '-0.03em',
        lineHeight: 1,
        color: resolveColor(color),
        // Trick: usar font-feature-settings para activar features
        // tipográficas modernas que mejoran el rendering del
        // lowercase (ligatures, contextual alternates si la fuente
        // las tiene).
        fontFeatureSettings: '"ss01" on, "cv01" on',
        display: 'inline-block',
        ...style,
      }}
    >
      {isIcon ? 's' : 'sylvora'}
    </span>
  )
}
