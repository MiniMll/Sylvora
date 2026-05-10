'use client'
import { memo } from 'react'
import { Pencil, Trash2, Package } from 'lucide-react'
import { formatPeso, stockColor, stockLabel, formatStock } from '@/lib/utils'
import type { Producto } from '@/types/database'
import type { Vista } from './ProductFilters'

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
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
      {productos.map(p => {
        const sc = stockColor(p.stock_actual, p.stock_minimo, p.unidad_venta)
        const sl = stockLabel(p.stock_actual, p.stock_minimo, p.unidad_venta)
        return (
          <div key={p.id} onClick={() => onAbrirDetalle(p)}
            style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s', display: 'flex', flexDirection: 'column' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>

            <div style={{ width: '100%', height: 130, background: 'var(--bg3)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, position: 'relative', flexShrink: 0 }}>
              {p.imagen_url
                ? <img src={p.imagen_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 8 }} />
                : <Package size={40} color="var(--border)" style={{ opacity: 0.5 }} />
              }
              {p.unidad_venta !== 'unidad' && (
                <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(91,76,255,0.9)', color: 'white', fontSize: 9, padding: '3px 7px', borderRadius: 5, fontWeight: 700 }}>
                  {p.unidad_venta === 'kg' ? '$/kg' : p.unidad_venta === 'litro' ? '$/L' : p.unidad_venta === 'metro' ? '$/m' : p.unidad_venta}
                </span>
              )}
              {p.stock_actual === 0 && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontSize: 11, fontWeight: 700, background: 'rgba(136,136,152,0.8)', borderRadius: 6, padding: '4px 10px' }}>SIN STOCK</span>
                </div>
              )}
            </div>

            <div style={{ padding: '10px 12px', flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{p.nombre}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'monospace', marginBottom: 8 }}>{p.sku || p.codigo_barras || '—'}</div>
              {p.unidad_venta === 'kg'
                ? <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(p.precio_por_kg || 0)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400 }}>/kg</span></div>
                : p.unidad_venta === 'litro'
                ? <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(p.precio_venta)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400 }}>/L</span></div>
                : p.unidad_venta === 'metro'
                ? <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(p.precio_venta)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400 }}>/m</span></div>
                : <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(p.precio_venta)}</div>
              }
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: sc }}>
                  {formatStock(p.stock_actual, p.unidad_venta)}
                </span>
                <span style={{ background: sc + '22', color: sc, padding: '2px 6px', borderRadius: 5, fontSize: 9, fontWeight: 700 }}>{sl}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => onEditar(p)}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Pencil size={11} color="var(--text2)" />
                </button>
                <button onClick={() => onConfirmarBorrar(p)}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.25)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={11} color="#ff4757" />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListaView({ productos, onAbrirDetalle, onEditar, onConfirmarBorrar }: Omit<Props, 'vista'>) {
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
              <tr key={p.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => onAbrirDetalle(p)}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
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
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text2)', fontSize: 11 }}>{p.sku || p.codigo_barras || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{p.categoria || '—'}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#5b4cff' }}>
                  {p.unidad_venta === 'kg'
                    ? `${formatPeso(p.precio_por_kg || 0)}/kg`
                    : p.unidad_venta === 'litro'
                    ? `${formatPeso(p.precio_venta)}/L`
                    : formatPeso(p.precio_venta)
                  }
                </td>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: sc }}>
                  {formatStock(p.stock_actual, p.unidad_venta)}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ background: sc + '22', color: sc, padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>{sl}</span>
                </td>
                <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => onEditar(p)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Pencil size={11} color="var(--text2)" />
                    </button>
                    <button onClick={() => onConfirmarBorrar(p)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.25)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={11} color="#ff4757" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {productos.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
          No se encontraron productos
        </div>
      )}
    </div>
  )
}
