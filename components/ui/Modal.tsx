'use client'
import { useEffect, useRef, ReactNode } from 'react'
import { X } from 'lucide-react'

// Primitiva Modal. Reemplaza el patrón inline duplicado en 15 call sites:
// backdrop fixed + card centrada + scale-in + close handlers.
//
// Comportamiento:
// - ESC y click en backdrop disparan onClose.
// - Body scroll bloqueado mientras open.
// - Focus inicial al primer elemento focuseable del card.
// - Focus se restaura al elemento previo al cerrarse.
// - data-modal-card en el card → preserva selectores existentes.
//
// Limitaciones intencionales v1:
// - Sin portal: render inline, suficiente para los casos actuales.
// - Sin focus trap completo: Tab puede salir del modal.
// - Sin stacked modals: un solo nivel de z-index (100).

type ModalSize = 'sm' | 'md' | 'lg'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  size?: ModalSize
  footer?: ReactNode
  children: ReactNode
}

const SIZE_WIDTH: Record<ModalSize, number> = { sm: 380, md: 480, lg: 640 }

export function Modal({ open, onClose, title, size = 'md', footer, children }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const prev = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)

    const t = setTimeout(() => {
      const first = cardRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      first?.focus()
    }, 0)

    return () => {
      clearTimeout(t)
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'fadeIn 0.15s ease',
      }}
      role="presentation">
      <div
        ref={cardRef}
        data-modal-card
        className="scale-in"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        style={{
          background: 'var(--card)',
          borderRadius: 20,
          width: '100%',
          maxWidth: SIZE_WIDTH[size],
          maxHeight: 'calc(100dvh - 32px)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
        {title && (
          <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <h2 id="modal-title" style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}>{title}</h2>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                width: 28, height: 28,
                borderRadius: 8,
                background: 'transparent',
                border: 'none',
                color: 'var(--text2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
              <X size={16} />
            </button>
          </header>
        )}
        <div style={{
          padding: 18,
          overflowY: 'auto',
          flex: 1,
        }}>
          {children}
        </div>
        {footer && (
          <footer className="modal-footer" style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: 'var(--card)',
            flexShrink: 0,
          }}>
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
