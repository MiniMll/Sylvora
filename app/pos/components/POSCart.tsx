'use client'
import { memo, useState } from 'react'
import { ShoppingCart, X, Plus, Minus } from 'lucide-react'
import { formatPeso } from '@/lib/utils'
import { usePOSStore } from '@/lib/store'

const PRESETS_DESC = [5, 10, 15]
const PRESETS_REC = [5, 10, 15]

function POSCartImpl() {
  const store = usePOSStore()
  // Item cuya cantidad se está editando inline (click sobre el número).
  // Patrón POS clásico: click → input con valor seleccionado → Enter/blur
  // confirma → Esc cancela. Reemplaza "click + N veces" por "click + tipear".
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShoppingCart size={14} /> Ticket
        </span>
        <button onClick={store.limpiarTicket}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--r)', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          <X size={13} /> Limpiar
        </button>
      </div>

      {/* Items — className .pos-cart-items aplica min-height en mobile
          para que el cajero siempre vea 1-2 items aunque el panel
          esté comprimido por el teclado virtual. */}
      <div className="pos-cart-items" style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
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
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</div>
              {!item.peso_kg && (
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2, fontFamily: 'DM Mono, monospace' }}>
                  {item.cantidad} × {formatPeso(item.precio_unitario)}
                </div>
              )}
            </div>
            {!item.peso_kg ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => store.cambiarCantidad(item.producto_id, item.cantidad - 1)}
                    aria-label="Disminuir cantidad"
                    style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                    <Minus size={13} strokeWidth={2.2} />
                  </button>
                  {editingId === item.producto_id ? (
                    <input
                      type="number"
                      autoFocus
                      defaultValue={item.cantidad}
                      min={1}
                      max={9999}
                      onFocus={e => e.target.select()}
                      onBlur={e => {
                        const v = parseInt(e.target.value, 10)
                        if (Number.isFinite(v) && v >= 1 && v <= 9999) {
                          store.cambiarCantidad(item.producto_id, v)
                        }
                        setEditingId(null)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      style={{
                        width: 42,
                        height: 26,
                        textAlign: 'center',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: 'DM Mono, monospace',
                        color: 'var(--text)',
                        background: 'var(--bg2)',
                        border: '1px solid var(--ac)',
                        borderRadius: 6,
                        outline: 'none',
                        padding: 0,
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditingId(item.producto_id)}
                      title="Click para editar"
                      style={{
                        fontSize: 13, fontWeight: 700, minWidth: 22,
                        textAlign: 'center', fontFamily: 'DM Mono, monospace',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        padding: '0 4px',
                        borderRadius: 4,
                      }}
                    >{item.cantidad}</span>
                  )}
                  <button onClick={() => store.cambiarCantidad(item.producto_id, item.cantidad + 1)}
                    aria-label="Aumentar cantidad"
                    style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                    <Plus size={13} strokeWidth={2.2} />
                  </button>
                </div>
                <button onClick={() => store.quitarItem(item.producto_id)}
                  aria-label="Quitar item"
                  style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,71,87,0.22)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--r)', flexShrink: 0 }}>
                  <X size={13} strokeWidth={2.2} />
                </button>
              </>
            ) : (
              <button onClick={() => store.quitarItem(item.producto_id)}
                aria-label="Quitar item"
                style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,71,87,0.3)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--r)' }}>
                <X size={13} strokeWidth={2.2} />
              </button>
            )}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ac)', fontFamily: 'DM Mono, monospace', minWidth: 56, textAlign: 'right' }}>
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
                  style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, border: '1px solid', borderColor: row.val === v ? 'var(--ac)' : 'var(--border)', background: row.val === v ? 'var(--ac)' : 'var(--bg2)', color: row.val === v ? 'white' : 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {row.prefix}{v}%
                </button>
              ))}
            </div>
            <input type="number" value={row.val || ''} onChange={e => row.set(Number(e.target.value))} placeholder="0"
              style={{ marginLeft: 'auto', width: 44, textAlign: 'center', fontSize: 11, fontFamily: 'DM Mono, monospace', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 5px', outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
          </div>
        ))}
      </div>

      {/* Totales */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
          <span>Subtotal</span><span style={{ fontFamily: 'DM Mono, monospace' }}>{formatPeso(store.subtotal())}</span>
        </div>
        {store.descuentoPct > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--g)', marginBottom: 4 }}>
            <span>Descuento -{store.descuentoPct}%</span><span style={{ fontFamily: 'DM Mono, monospace' }}>-{formatPeso(store.descuentoMonto())}</span>
          </div>
        )}
        {store.recargoPct > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--r)', marginBottom: 4 }}>
            <span>Recargo +{store.recargoPct}%</span><span style={{ fontFamily: 'DM Mono, monospace' }}>+{formatPeso(store.recargoMonto())}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 15, color: 'var(--text)' }}>TOTAL</span>
          <span style={{ fontSize: 16, color: 'var(--ac)', fontFamily: 'DM Mono, monospace' }}>{formatPeso(store.total())}</span>
        </div>
      </div>
    </>
  )
}

// Memo: el page re-renderiza por cada keystroke en la búsqueda y al
// abrir/cerrar el modal de cantidad. POSCart solo depende del store
// de zustand — sin props, memo evita re-renders por cambios del page.
export const POSCart = memo(POSCartImpl)
