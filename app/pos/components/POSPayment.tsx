'use client'
import { useState } from 'react'
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

export function POSPayment() {
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
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {METODOS.map(m => (
            <button key={m.id} onClick={() => store.setMetodoPago(m.id)}
              style={{ padding: '7px', borderRadius: 8, border: '1px solid', borderColor: store.metodoPago === m.id ? '#5b4cff' : 'var(--border)', background: store.metodoPago === m.id ? '#5b4cff' : 'var(--bg2)', color: store.metodoPago === m.id ? 'white' : 'var(--text)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cobrar */}
      <div style={{ padding: '8px 12px 12px' }}>
        <button onClick={cobrar}
          style={{ width: '100%', padding: '12px', borderRadius: 10, background: '#00c896', color: 'white', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {cobrado ? '¡Cobrado!' : 'Cobrar'}
        </button>
      </div>
    </>
  )
}
