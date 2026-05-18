import type { CSSProperties, ReactNode } from 'react'

// Wrapper de sección con ritmo vertical consistente y backgrounds
// alternados. El padding vertical lo aporta .landing-section (mobile)
// + .landing-section--lg (≥768px) — definidos en globals.css.

type Background = 'bg' | 'card' | 'brand'
type PaddingY = 'md' | 'lg'

const BG_MAP: Record<Background, string> = {
  bg: 'var(--bg)',      // warm off-white — secciones "respiran"
  card: 'var(--bg2)',   // white puro — secciones alternas
  brand: 'var(--ac)',   // violeta brand — CTA final
}

interface SectionProps {
  children: ReactNode
  /** Color de fondo. Alternar `bg` y `card` para ritmo entre secciones. */
  background?: Background
  /** Vertical padding: `lg` = 64 mobile / 96 desktop (default).
   *  `md` = 64 en todos los viewports. */
  paddingY?: PaddingY
  className?: string
  style?: CSSProperties
  id?: string
}

export function Section({
  children,
  background = 'bg',
  paddingY = 'lg',
  className,
  style,
  id,
}: SectionProps) {
  return (
    <section
      id={id}
      className={`landing-section landing-section--${paddingY}${className ? ` ${className}` : ''}`}
      style={{ background: BG_MAP[background], ...style }}
    >
      {children}
    </section>
  )
}
