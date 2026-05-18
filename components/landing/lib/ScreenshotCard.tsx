import type { CSSProperties } from 'react'

// Wrapper editorial para todas las capturas de la landing.
// Aplica el tratamiento definido en docs/landing-spec.md §5:
// radius generoso, border sutil de 1px, shadow de 2 capas muy difusa
// que "flota" sobre el fondo warm de la landing. SIN chrome de
// browser, SIN frame de teléfono, SIN tilt 3D.
//
// Para hero shots responsivos pasá `srcMobile` — se sirve via
// <picture><source> en viewports <768px. Para el resto, omitilo y
// la misma imagen se escala.

interface ScreenshotCardProps {
  src: string
  /** Variante mobile opcional. Si está, se sirve en viewports <768px. */
  srcMobile?: string
  alt: string
  width: number
  height: number
  /** Para el hero shot (LCP-critical) usar true → eager + fetchPriority high. */
  priority?: boolean
  className?: string
  style?: CSSProperties
}

export function ScreenshotCard({
  src,
  srcMobile,
  alt,
  width,
  height,
  priority = false,
  className,
  style,
}: ScreenshotCardProps) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.06)',
        // Dos capas de shadow:
        // - cercana: sutil "assentamiento" sobre el fondo.
        // - lejana: difusa, da peso visual sin que se note el blur.
        boxShadow:
          '0 4px 16px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.06)',
        background: 'var(--bg2)',
        ...style,
      }}
    >
      <picture>
        {srcMobile && <source media="(max-width: 767px)" srcSet={srcMobile} />}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </picture>
    </div>
  )
}
