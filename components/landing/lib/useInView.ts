'use client'
import { useEffect, useRef, useState } from 'react'

// Hook custom para disparar animaciones de entrada cuando una sección
// se vuelve visible al scrollear. Respeta prefers-reduced-motion —
// con motion reducido, devuelve inView=true desde el primer render
// para que el contenido aparezca sin animación.
//
// Por default, una vez que el elemento entra al viewport, ya no
// vuelve a animar (once=true). Si se quiere re-disparar al
// desplazarse afuera/adentro, pasar once=false.

interface UseInViewOptions {
  /** Fracción del elemento que tiene que estar visible (0..1). */
  threshold?: number
  /** Margen alrededor del viewport. Negativo en bottom dispara antes
   *  de que el elemento llegue al final del viewport (más natural). */
  rootMargin?: string
  /** Si true (default), una vez visto deja de observar. */
  once?: boolean
}

export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {},
) {
  const { threshold = 0.1, rootMargin = '0px 0px -10% 0px', once = true } = options
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setInView(true)
      return
    }

    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) obs.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold, rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, rootMargin, once])

  return { ref, inView }
}
