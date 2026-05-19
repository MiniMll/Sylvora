'use client'
import { memo } from 'react'
import { Pencil, Trash2, Package } from 'lucide-react'
import { formatPeso, stockColor, stockLabel, formatStock } from '@/lib/utils'
import type { Producto } from '@/types/database'
import type { Vista } from './ProductFilters'
import { usePermissions } from '@/components/PermissionsProvider'

interface Props {
  productos: Producto[]
  vista: Vista
  onAbrirDetalle: (p: Producto) => void
  onEditar: (p: Producto) => void
  onConfirmarBorrar: (p: Producto) => void
}

function ProductGridImpl({ productos, vista, onAbrirDetalle, onEditar, onConfirmarBorrar }: Props) {
  if (vista === 'cards') return <CardsView {...{ productos, onAbrirDetalle, onEditar, onConfirmarBorrar }} />
  return <ListaView {...{ productos, onAbrirDetalle, onEditar, onConfirmarBorrar }} />
}

// Memo: la página re-renderiza al abrir/cerrar 4 modales distintos.
// Cuando ninguna prop relevante cambia, evitamos re-pintar la grilla
// completa de N productos.
export const ProductGrid = memo(ProductGridImpl)

function CardsView({ productos, onAbrirDetalle, onEditar, onConfirmarBorrar }: Omit<Props, 'vista'>) {
  const { has } = usePermissions()
  return (
    // Grid 170/10 (antes 200/14): cards más compactas para mostrar más
    // productos por fila en desktop sin sacrificar legibilidad. En
    // mobile (1 col) la diferencia es marginal.
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10 }}>
      {productos.map(p => {
        const sc = stockColor(p.stock_actual, p.stock_minimo, p.unidad_venta)
        const sl = stockLabel(p.stock_actual, p.stock_minimo, p.unidad_venta)
        const sinStock = p.stock_actual === 0
        return (
          <div key={p.id} onClick={() => onAbrirDetalle(p)}
            className="lift-hover"
            style={{
              background: 'var(--card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
            }}>

            {/* Imagen — aspect 5/4 (antes 1/1): ahorra ~20% de alto
                manteniendo el producto reconocible. El padding interior
                baja de 14 a 12 para acompañar el formato. */}
            <div style={{
              width: '100%',
              aspectRatio: '5 / 4',
              background: 'var(--bg3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              flexShrink: 0,
            }}>
              {p.imagen_url
                ? <img src={p.imagen_url} alt={p.nombre}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 12 }} />
                : <Package size={32} color="var(--border-strong)" strokeWidth={1.8} style={{ opacity: 0.6 }} />
              }
              {p.unidad_venta !== 'unidad' && (
                <span style={{
                  position: 'absolute', top: 8, left: 8,
                  background: 'rgba(91,76,255,0.95)',
                  color: 'white',
                  fontSize: 9,
                  padding: '2px 7px',
                  borderRadius: 999,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  backdropFilter: 'blur(8px)',
                }}>
                  {p.unidad_venta === 'kg' ? '$/kg' : p.unidad_venta === 'litro' ? '$/L' : p.unidad_venta === 'metro' ? '$/m' : p.unidad_venta}
                </span>
              )}
              {sinStock && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(14,14,19,0.55)',
                  backdropFilter: 'blur(2px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{
                    color: 'white', fontSize: 10, fontWeight: 700,
                    background: 'rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.28)',
                    borderRadius: 999, padding: '5px 12px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>Sin stock</span>
                </div>
              )}
            </div>

            {/* Info — padding ajustado al sistema 4/8 (10 lateral, 8 vertical). */}
            <div style={{ padding: '10px 12px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{
                // tier "title" del sistema: 13/600 — antes era igual
                // pero ahora la card es más chica así que el text-overflow
                // ellipsis se activa más seguido. Acepatable.
                fontSize: 13, fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
              }}>{p.nombre}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                {p.sku || p.codigo_barras || '—'}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 2 }}>
                {p.unidad_venta === 'kg'
                  ? <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ac)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>{formatPeso(p.precio_por_kg || 0)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400, marginLeft: 2 }}>/kg</span></div>
                  : p.unidad_venta === 'litro'
                  ? <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ac)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>{formatPeso(p.precio_venta)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400, marginLeft: 2 }}>/L</span></div>
                  : p.unidad_venta === 'metro'
                  ? <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ac)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>{formatPeso(p.precio_venta)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400, marginLeft: 2 }}>/m</span></div>
                  : <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ac)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>{formatPeso(p.precio_venta)}</div>
                }
              </div>
            </div>

            {/* Footer — min-height 36 (antes 40) consistente con tier sm.
                Botones acción 28×28 (antes ~28×24 variable). */}
            <div style={{
              borderTop: '1px solid var(--border)',
              padding: '6px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 6,
              minHeight: 36,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: sc + '14',
                color: sc,
                padding: '3px 8px',
                borderRadius: 999,
                fontSize: 10, fontWeight: 600,
                letterSpacing: '0.01em',
                minWidth: 0,
                overflow: 'hidden',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatStock(p.stock_actual, p.unidad_venta)}</span>
                <span style={{ opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {sl}</span>
              </span>
              {(has('producto.editar') || has('producto.eliminar')) && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {has('producto.editar') && (
                    <button
                      onClick={() => onEditar(p)}
                      aria-label="Editar producto"
                      style={{
                        width: 24, height: 24,
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--bg2)',
                        cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Pencil size={11} color="var(--text2)" strokeWidth={2.2} />
                    </button>
                  )}
                  {has('producto.eliminar') && (
                    <button
                      onClick={() => onConfirmarBorrar(p)}
                      aria-label="Eliminar producto"
                      style={{
                        width: 24, height: 24,
                        borderRadius: 6,
                        border: '1px solid rgba(255,71,87,0.22)',
                        background: 'var(--bg2)',
                        cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={11} color="#ff4757" strokeWidth={2.2} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListaView({ productos, onAbrirDetalle, onEditar, onConfirmarBorrar }: Omit<Props, 'vista'>) {
  const { has } = usePermissions()
  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg3)' }}>
            {['Producto', 'SKU / Código', 'Categoría', 'Precio', 'Stock', 'Estado', ''].map(h => (
              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {productos.map(p => {
            const sc = stockColor(p.stock_actual, p.stock_minimo, p.unidad_venta)
            const sl = stockLabel(p.stock_actual, p.stock_minimo, p.unidad_venta)
            return (
              <tr key={p.id} className="row-hover" style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => onAbrirDetalle(p)}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg3)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Package size={16} color="var(--border)" />
                      }
                    </div>
                    <span style={{ fontWeight: 500, color: 'var(--text)' }}>{p.nombre}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', color: 'var(--text2)', fontSize: 11 }}>{p.sku || p.codigo_barras || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{p.categoria || '—'}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--ac)' }}>
                  {p.unidad_venta === 'kg'
                    ? `${formatPeso(p.precio_por_kg || 0)}/kg`
                    : p.unidad_venta === 'litro'
                    ? `${formatPeso(p.precio_venta)}/L`
                    : formatPeso(p.precio_venta)
                  }
                </td>
                <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: sc }}>
                  {formatStock(p.stock_actual, p.unidad_venta)}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: sc + '14', color: sc,
                    padding: '3px 9px', borderRadius: 999,
                    fontSize: 10, fontWeight: 600,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc }} />
                    {sl}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {has('producto.editar') && (
                      <button onClick={() => onEditar(p)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Pencil size={11} color="var(--text2)" />
                      </button>
                    )}
                    {has('producto.eliminar') && (
                      <button onClick={() => onConfirmarBorrar(p)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.25)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={11} color="#ff4757" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {productos.length === 0 && (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text2)', fontSize: 13, animation: 'fadeIn 0.3s ease' }}>
          <div style={{
            width: 44, height: 44,
            borderRadius: '50%',
            background: 'var(--bg3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Package size={20} color="var(--text2)" strokeWidth={1.8} />
          </div>
          <div>No se encontraron productos</div>
        </div>
      )}
    </div>
  )
}
