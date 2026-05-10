'use client'
import { memo, useState } from 'react'
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

function POSPaymentImpl() {
  const store = usePOSStore()
  const [cobrado, setCobrado] = useState(false)

  const cobrar = async () => {
    if (!store.items.length) { toast.error('El ticket está vacío'); return }
    const itemsParaVenta = store.items.map(i => ({
      producto_id: i.producto_id.includes('_') ? i.producto_id.split('_')[0] : i.producto_id,
      nombre_producto: i.nombre,
      precio_unitario: i.precio_unitario,
      cantidad: i.cantidad,
      subtotal: i.subtotal,
      peso_kg: i.peso_kg,
    }))
    await guardarVenta({
      subtotal: store.subtotal(),
      descuento_porcentaje: store.descuentoPct,
      descuento_monto: store.descuentoMonto(),
      recargo_porcentaje: store.recargoPct,
      recargo_monto: store.recargoMonto(),
      total: store.total(),
      metodo_pago: store.metodoPago,
      items: itemsParaVenta,
    })
    setCobrado(true)
    toast.success(`Venta de ${formatPeso(store.total())} registrada`)
    setTimeout(() => { setCobrado(false); store.limpiarTicket() }, 2000)
  }

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
          style={{
            width: '100%',
            minHeight: 52,
            padding: '14px',
            borderRadius: 12,
            background: cobrado ? 'var(--g)' : 'linear-gradient(180deg, #00d4a3 0%, #00b486 100%)',
            color: 'white',
            border: 'none',
            fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '-0.01em',
            boxShadow: '0 2px 6px rgba(0,200,150,0.25), 0 8px 20px rgba(0,200,150,0.18)',
            transition: 'transform 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out)',
          }}>
          {cobrado ? '¡Cobrado!' : 'Cobrar'}
        </button>
      </div>
    </>
  )
}

// Memo: igual razonamiento que POSCart — sin props externos, evita
// re-render cuando el page actualiza estado no relacionado al pago.
export const POSPayment = memo(POSPaymentImpl)
