'use client'
import { memo, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatPeso } from '@/lib/utils'
import { usePOSStore } from '@/lib/store'
import { guardarVenta } from '@/lib/supabase/ventas'
import type { MetodoPago } from '@/types'

const METODOS: { id: MetodoPago; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'debito', label: 'Débito' },
  { id: 'credito', label: 'Crédito' },
  { id: 'mercadopago', label: 'Mercado Pago' },
]

// Tiempo que el botón muestra "¡Cobrado!" antes de limpiar el ticket.
// Antes 2000ms — sentía lento en POS de alta rotación. 800ms es
// suficiente feedback sin interrumpir el flujo.
const COBRADO_FEEDBACK_MS = 800

function POSPaymentImpl() {
  const store = usePOSStore()
  const [cobrado, setCobrado] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Ref al cobrar más reciente, para que el listener de teclado
  // global (registrado una vez) siempre llame al closure actual.
  const cobrarRef = useRef<() => void>(() => {})

  const cobrar = async () => {
    // Guard contra doble-submit: click+click rápido, F8 mientras
    // ya está guardando, o F8 durante el feedback "¡Cobrado!".
    if (guardando || cobrado) return
    if (!store.items.length) {
      toast.error('El ticket está vacío', { id: 'pos-cobrar' })
      return
    }

    setGuardando(true)

    const itemsParaVenta = store.items.map(i => ({
      producto_id: i.producto_id.includes('_') ? i.producto_id.split('_')[0] : i.producto_id,
      nombre_producto: i.nombre,
      precio_unitario: i.precio_unitario,
      cantidad: i.cantidad,
      subtotal: i.subtotal,
      peso_kg: i.peso_kg,
    }))

    const totalActual = store.total()

    try {
      const result = await guardarVenta({
        subtotal: store.subtotal(),
        descuento_porcentaje: store.descuentoPct,
        descuento_monto: store.descuentoMonto(),
        recargo_porcentaje: store.recargoPct,
        recargo_monto: store.recargoMonto(),
        total: totalActual,
        metodo_pago: store.metodoPago,
        items: itemsParaVenta,
      })

      // Solo limpiar el carrito si la venta SE GUARDÓ. En caso de
      // error de red o falla del backend, el cajero mantiene el
      // ticket intacto y puede reintentar sin volver a cargar todo.
      if (!result) {
        toast.error('No se pudo guardar la venta. Probá de nuevo.', { id: 'pos-cobrar' })
        setGuardando(false)
        return
      }

      setGuardando(false)
      setCobrado(true)
      toast.success(`Venta de ${formatPeso(totalActual)} registrada`, { id: 'pos-cobrar' })
      setTimeout(() => {
        setCobrado(false)
        store.limpiarTicket()
      }, COBRADO_FEEDBACK_MS)
    } catch {
      // Excepciones inesperadas (ej. fetch abort). Mismo principio:
      // no limpiar carrito, mostrar error claro.
      toast.error('Error al guardar la venta. Probá de nuevo.', { id: 'pos-cobrar' })
      setGuardando(false)
    }
  }

  // Mantener cobrarRef apuntando al closure actual.
  cobrarRef.current = cobrar

  // Atajo de teclado: F8 o Ctrl+Enter ejecutan cobrar.
  // F8 es el estándar de POS profesionales (Falabella, Easy, etc.).
  // Si hay un modal abierto en cualquier parte de la app
  // (data-modal-card), suprimimos el atajo para no interrumpir
  // un flujo de modal cantidad / edit / confirmación.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isShortcut = e.key === 'F8' || (e.ctrlKey && e.key === 'Enter')
      if (!isShortcut) return
      if (document.querySelector('[data-modal-card]')) return
      e.preventDefault()
      cobrarRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const itemsVacio = store.items.length === 0
  const cobrarDisabled = itemsVacio || guardando || cobrado
  const totalActual = store.total()

  return (
    <>
      {/* Método pago */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {METODOS.map(m => {
            const active = store.metodoPago === m.id
            return (
              <button key={m.id} onClick={() => store.setMetodoPago(m.id)}
                aria-pressed={active}
                style={{
                  minHeight: 40,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid',
                  borderColor: active ? 'var(--ac)' : 'var(--border)',
                  background: active ? 'var(--ac)' : 'var(--bg2)',
                  color: active ? 'white' : 'var(--text)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '-0.01em',
                  boxShadow: active ? '0 2px 8px rgba(91,76,255,0.25)' : 'none',
                  transition: 'all 0.15s var(--ease-out)',
                }}>
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Cobrar */}
      <div style={{ padding: '10px 12px 14px' }}>
        <button onClick={cobrar}
          disabled={cobrarDisabled}
          aria-busy={guardando}
          aria-label={`Cobrar ${formatPeso(totalActual)}`}
          title="Atajo: F8 o Ctrl+Enter"
          style={{
            width: '100%',
            minHeight: 52,
            padding: '14px',
            borderRadius: 12,
            background: itemsVacio
              ? 'var(--bg3)'
              : cobrado
                ? 'var(--g)'
                : 'linear-gradient(180deg, #00d4a3 0%, #00b486 100%)',
            color: itemsVacio ? 'var(--text2)' : 'white',
            border: 'none',
            fontSize: 15, fontWeight: 700,
            cursor: cobrarDisabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '-0.01em',
            boxShadow: itemsVacio
              ? 'none'
              : '0 2px 6px rgba(0,200,150,0.25), 0 8px 20px rgba(0,200,150,0.18)',
            transition: 'transform 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out), background 0.15s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: itemsVacio ? 0.85 : 1,
          }}>
          {guardando ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 0.75s linear infinite' }} />
              Guardando…
            </>
          ) : cobrado ? '¡Cobrado!' : 'Cobrar'}
        </button>
      </div>
    </>
  )
}

// Memo: igual razonamiento que POSCart — sin props externos, evita
// re-render cuando el page actualiza estado no relacionado al pago.
export const POSPayment = memo(POSPaymentImpl)
