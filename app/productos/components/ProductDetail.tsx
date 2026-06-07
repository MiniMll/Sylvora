'use client'
import { useEffect, useRef } from 'react'
import { Package, X, Layers, Pencil, Trash2, Loader2, Plus } from 'lucide-react'
import { formatPeso, calcularMargen, stockColor, stockLabel, formatStock, formatVencimiento } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Hint } from '@/components/ui/Hint'
import { usePermissions } from '@/components/PermissionsProvider'
import type { Producto, Lote } from '@/types/database'

function CodigoBarras({ codigo }: { codigo: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!svgRef.current || !codigo) return
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(svgRef.current, codigo, {
          format: 'CODE128', width: 2, height: 50,
          displayValue: true, fontSize: 12, margin: 8, background: 'transparent',
        })
      } catch {}
    })
  }, [codigo])
  return <svg ref={svgRef} style={{ width: '100%' }} />
}

interface Props {
  producto: Producto
  lotes: Lote[]
  cargandoLotes: boolean
  borrandoLote: string | null
  onClose: () => void
  onEditar: () => void
  onBorrar: () => void
  onAgregarLote: () => void
  onBorrarLote: (l: Lote) => void
}

export function ProductDetail({
  producto, lotes, cargandoLotes, borrandoLote,
  onClose, onEditar, onBorrar, onAgregarLote, onBorrarLote,
}: Props) {
  const mg = calcularMargen(producto.precio_costo, producto.precio_venta)
  const { has } = usePermissions()
  const puedeGestionarLotes = has('lote.gestionar')

  return (
    <Modal open onClose={onClose} size="md">
      <div style={{ margin: -18, marginBottom: 18 }}>
        <div style={{ height: 180, background: 'var(--bg3)', borderRadius: '20px 20px 0 0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, position: 'relative' }}>
          {producto.imagen_url
            ? <img src={producto.imagen_url} alt={producto.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <Package size={48} color="rgba(255,255,255,0.3)" />
          }
          <button onClick={onClose}
            style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
      </div>
      <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>{producto.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace', marginBottom: 16 }}>{producto.sku} · {producto.codigo_barras}</div>

          <div className="kpi-grid-sm" style={{ marginBottom: 16 }}>
            {producto.unidad_venta === 'kg' ? (
              <>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Precio por kg</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--ac)' }}>{formatPeso(producto.precio_por_kg || 0)}</div>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Stock disponible</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: stockColor(producto.stock_actual, producto.stock_minimo, 'kg') }}>{producto.stock_actual.toFixed(2)} kg</div>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Precio venta</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--ac)' }}>{formatPeso(producto.precio_venta)}</div>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Precio costo</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>{formatPeso(producto.precio_costo)}</div>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Margen</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: mg >= 35 ? 'var(--g)' : mg >= 20 ? 'var(--w)' : 'var(--r)' }}>{mg}%</div>
                </div>
              </>
            )}
          </div>

          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>Stock actual</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: stockColor(producto.stock_actual, producto.stock_minimo, producto.unidad_venta) }}>
                {formatStock(producto.stock_actual, producto.unidad_venta)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>Mínimo</div>
              <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{formatStock(producto.stock_minimo, producto.unidad_venta)}</div>
            </div>
            <span style={{ background: stockColor(producto.stock_actual, producto.stock_minimo, producto.unidad_venta) + '22', color: stockColor(producto.stock_actual, producto.stock_minimo, producto.unidad_venta), padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
              {stockLabel(producto.stock_actual, producto.stock_minimo, producto.unidad_venta)}
            </span>
          </div>

          {/* Lotes */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}><Layers size={12} /> Lotes</div>
              {puedeGestionarLotes && (
                <Button variant="primary" size="sm" onClick={onAgregarLote}>
                  <Plus size={13} strokeWidth={2.4} style={{ marginRight: 4 }} />
                  Agregar lote
                </Button>
              )}
            </div>
            {/* FEFO hint — explica al comerciante que los lotes con
                vencimiento más cercano se consumen primero. id compartido
                con el del modal de /stock (lib usa localStorage por id),
                así si lo dismisses en una pantalla desaparece en la otra. */}
            <Hint id="lotes-fefo" style={{ marginBottom: 10 }}>
              Sylvora descuenta primero los lotes con vencimiento más cercano.
              Si no tienen fecha, usa el orden de carga.
            </Hint>
            {cargandoLotes ? (
              <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: 12 }}>Cargando lotes...</div>
            ) : lotes.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: 12, background: 'var(--bg3)', borderRadius: 8 }}>
                No hay lotes registrados
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lotes.map(lote => {
                  const vencido = lote.fecha_vencimiento && new Date(lote.fecha_vencimiento) < new Date()
                  const venc = formatVencimiento(lote.fecha_vencimiento)
                  return (
                    <div key={lote.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', border: `1px solid ${vencido ? 'rgba(255,71,87,0.3)' : 'var(--border)'}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{lote.numero_lote}</div>
                        {venc.texto && (
                          <div style={{ fontSize: 10, color: venc.color }}>{venc.texto}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>
                        {formatStock(lote.cantidad, producto.unidad_venta)}
                      </div>
                      {puedeGestionarLotes && (
                        <button
                          onClick={() => onBorrarLote(lote)}
                          disabled={borrandoLote === lote.id}
                          aria-label={`Borrar lote ${lote.numero_lote}`}
                          style={{
                            // Tier sm consistente con resto del POS/productos
                            width: 28, height: 28,
                            borderRadius: 7,
                            border: '1px solid rgba(255,71,87,0.2)',
                            background: 'var(--bg2)',
                            cursor: borrandoLote === lote.id ? 'wait' : 'pointer',
                            color: 'var(--r)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {borrandoLote === lote.id
                            ? <Loader2 size={12} className="spin" style={{ animation: 'spin 0.75s linear infinite' }} />
                            : <Trash2 size={12} strokeWidth={2.2} />
                          }
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {producto.codigo_barras && (
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>Código de barras</div>
              <CodigoBarras codigo={producto.codigo_barras} />
            </div>
          )}

          {(has('producto.editar') || has('producto.eliminar')) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {has('producto.editar') && (
                <Button variant="primary" onClick={onEditar} style={{ flex: 1 }}>
                  <Pencil size={14} strokeWidth={2.2} style={{ marginRight: 6 }} />
                  Editar
                </Button>
              )}
              {has('producto.eliminar') && (
                <button
                  onClick={onBorrar}
                  aria-label="Borrar producto"
                  style={{
                    width: 40, height: 40,
                    borderRadius: 9,
                    background: 'var(--bg2)',
                    color: 'var(--r)',
                    border: '1px solid rgba(255,71,87,0.3)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={15} strokeWidth={2.2} />
                </button>
              )}
            </div>
          )}
      </div>
    </Modal>
  )
}
