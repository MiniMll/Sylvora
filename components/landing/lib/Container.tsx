import type { CSSProperties, ReactNode } from 'react'

// Wrapper de ancho consistente para todas las secciones de la landing.
// El padding lateral lo aporta la clase .landing-container (en
// globals.css) con media queries — acá solo seteamos max-width
// vía inline style para permitir variantes por instancia.

interface ContainerProps {
  children: ReactNode
  /** Ancho máximo en px. Defaults: 720 texto, 900 FAQ, 1100 hero,
   *  1200 layouts amplios. */
  maxWidth?: number
  style?: CSSProperties
  className?: string
}

export function Container({ children, maxWidth = 1200, style, className }: ContainerProps) {
  return (
    <div
      className={`landing-container${className ? ` ${className}` : ''}`}
      style={{ maxWidth, ...style }}
    >
      {children}
    </div>
  )
}
