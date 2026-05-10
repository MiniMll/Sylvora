'use client'
import { memo } from 'react'
import { ShoppingCart, X } from 'lucide-react'
import { formatPeso } from '@/lib/utils'
import { usePOSStore } from '@/lib/store'

const PRESETS_DESC = [5, 10, 15]
const PRESETS_REC = [5, 10, 13]

function POSCartImpl() {
  const store = usePOSStore()

  return (
    <>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShoppingCart size={14} /> Ticket
        </span>
        <button onClick={store.limpiarTicket}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4757', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          <X size={13} /> Limpiar
        </button>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {store.items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 12, padding: '32px 0', animation: 'fadeIn 0.3s ease' }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: '50%',
              background: 'var(--bg3)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 10,
            }}>
              <ShoppingCart size={20} color="var(--text2)" strokeWidth={1.8} />
            </div>
            <div>El ticket está vacío</div>
          </div>
        ) : store.items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>{item.nombre}</div>
            {!item.peso_kg ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => store.cambiarCantidad(item.producto_id, item.cantidad - 1)}
                  aria-label="Disminuir cantidad"
                  style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 24, textAlign: 'center', fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{item.cantidad}</span>
                <button onClick={() => store.cambiarCantidad(item.producto_id, item.cantidad + 1)}
                  aria-label="Aumentar cantidad"
                  style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>+</button>
              </div>
            ) : (
              <button onClick={() => store.quitarItem(item.producto_id)}
                aria-label="Quitar item"
                style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,71,87,0.3)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4757' }}>
                <X size={13} />
              </button>
            )}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>
              {formatPeso(item.subtotal)}
            </div>
          </div>
        ))}
      </div>

      {/* Descuento / Recargo */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg3)' }}>
        {[
          { label: 'Descuento %', presets: PRESETS_DESC, val: store.descuentoPct, set: store.setDescuento, prefix: '-' },
          { label: 'Recargo %', presets: PRESETS_REC, val: store.recargoPct, set: store.setRecargo, prefix: '+' },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: 'var(--text2)', width: 76, flexShrink: 0 }}>{row.label}</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {row.presets.map(v => (
                <button key={v} onClick={() => row.set(row.val === v ? 0 : v)}
                  style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, border: '1px solid', borderColor: row.val === v ? '#5b4cff' : 'var(--border)', background: row.val === v ? '#5b4cff' : 'var(--bg2)', color: row.val === v ? 'white' : 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {row.prefix}{v}%
                </button>
              ))}
            </div>
            <input type="number" value={row.val || ''} onChange={e => row.set(Number(e.target.value))} placeholder="0"
              style={{ marginLeft: 'auto', width: 44, textAlign: 'center', fontSize: 11, fontFamily: 'monospace', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 5px', outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
          </div>
        ))}
      </div>

      {/* Totales */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
          <span>Subtotal</span><span style={{ fontFamily: 'monospace' }}>{formatPeso(store.subtotal())}</span>
        </div>
        {store.descuentoPct > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#00c896', marginBottom: 4 }}>
            <span>Descuento -{store.descuentoPct}%</span><span style={{ fontFamily: 'monospace' }}>-{formatPeso(store.descuentoMonto())}</span>
          </div>
        )}
        {store.recargoPct > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#ff4757', marginBottom: 4 }}>
            <span>Recargo +{store.recargoPct}%</span><span style={{ fontFamily: 'monospace' }}>+{formatPeso(store.recargoMonto())}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 15, color: 'var(--text)' }}>TOTAL</span>
          <span style={{ fontSize: 16, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(store.total())}</span>
        </div>
      </div>
    </>
  )
}

// Memo: el page re-renderiza por cada keystroke en la búsqueda y al
// abrir/cerrar el modal de cantidad. POSCart solo depende del store
// de zustand — sin props, memo evita re-renders por cambios del page.
export const POSCart = memo(POSCartImpl)
