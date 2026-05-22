'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

// Micro-hint contextual: una ayuda discreta y descartable. NO es un
// tour. Aparece una vez por dispositivo (localStorage) y se puede
// cerrar para siempre con la X.
//
// Uso:
//   <Hint id="pos-primera-venta" icon={<Lightbulb size={15} />}>
//     Buscá o escaneá un producto para agregarlo al ticket.
//   </Hint>
//
// Cada `id` es independiente. Persistencia por dispositivo via
// localStorage (V1, sin backend). Si el user limpia el storage o
// entra desde otro dispositivo, el hint vuelve a aparecer — aceptable
// para una ayuda de onboarding.

const PREFIX = 'sylvora_hint_'

/** Hook: ¿este hint ya fue descartado? + función para descartarlo. */
export function useHintDismissed(id: string): [boolean, () => void] {
  // Arranca "descartado" para que el SSR no renderice nada y no haya
  // mismatch de hidratación. En el cliente, el efecto resuelve el
  // estado real desde localStorage.
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(PREFIX + id) === '1')
    } catch {
      // localStorage bloqueado (modo privado estricto, etc.) → mostramos
      // el hint igual; no es crítico.
      setDismissed(false)
    }
  }, [id])

  const dismiss = () => {
    try { localStorage.setItem(PREFIX + id, '1') } catch { /* noop */ }
    setDismissed(true)
  }

  return [dismissed, dismiss]
}

interface HintProps {
  id: string
  children: ReactNode
  icon?: ReactNode
  /** Margen inferior (default 12). */
  style?: React.CSSProperties
}

export function Hint({ id, children, icon, style }: HintProps) {
  const [dismissed, dismiss] = useHintDismissed(id)
  if (dismissed) return null

  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: 'var(--ac-light)',
        border: '1px solid rgba(91,76,255,0.18)',
        borderRadius: 12,
        padding: '10px 12px',
        fontSize: 12.5,
        lineHeight: 1.5,
        color: 'var(--text)',
        animation: 'fadeIn 0.25s var(--ease-out)',
        ...style,
      }}
    >
      {icon && (
        <span style={{ color: 'var(--ac)', flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>
          {icon}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar ayuda"
        style={{
          flexShrink: 0,
          width: 24, height: 24,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          color: 'var(--text2)',
        }}
      >
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  )
}
