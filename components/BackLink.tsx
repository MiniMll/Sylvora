'use client'
import { useRouter } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'

// Botón "Volver" inteligente para páginas informativas (/guia,
// /terminos, /privacidad). Vuelve a la pantalla anterior real
// (router.back) en vez de mandar siempre a la landing.
//
// Casos:
// - Entré desde /productos → guía → Volver = vuelve a /productos.
// - Entré por link directo / sin historial dentro del sitio →
//   fallback a "/" (landing) para no dejar al usuario varado.

interface BackLinkProps {
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** A dónde caer si no hay historial previo. Default "/". */
  fallback?: string
}

export function BackLink({ className, style, children = 'Volver', fallback = '/' }: BackLinkProps) {
  const router = useRouter()

  const handleClick = () => {
    // history.length > 1 = hay navegación previa en esta pestaña →
    // back() vuelve a donde estaba. Si entró directo (length 1),
    // back() saldría del sitio, así que usamos el fallback.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallback)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
