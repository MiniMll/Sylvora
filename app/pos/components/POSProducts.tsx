'use client'
import { Search, ShoppingCart } from 'lucide-react'
import { formatPeso } from '@/lib/utils'
import { usePOSStore } from '@/lib/store'
import type { Producto } from '@/types/database'

const necesitaModal = (p: Producto) => ['kg', 'litro', 'metro'].includes(p.unidad_venta)

interface Props {
  busqueda: string
  resultados: Producto[]
  onSelect: (p: Producto) => void
}

export function POSProducts({ busqueda, resultados, onSelect }: Props) {
  const items = usePOSStore(s => s.items)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      {!busqueda && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--text2)', animation: 'fadeIn 0.3s ease' }}>
          <div style={{
            width: 56, height: 56,
            borderRadius: '50%',
            background: 'var(--ac-light)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <ShoppingCart size={24} color="var(--ac)" strokeWidth={1.8} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6, letterSpacing: '-0.01em' }}>
            Buscá un producto para empezar
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            Escribí el nombre, código o escaneá<br/>el código de barras
          </div>
        </div>
      )}

      {!busqueda && items.length > 0 && (
        <div style={{ textAlign: 'center', padding: '44px 20px', color: 'var(--text2)', fontSize: 13, animation: 'fadeIn 0.3s ease' }}>
          <div style={{
            width: 40, height: 40,
            borderRadius: '50%',
            background: 'var(--bg3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Search size={18} color="var(--text2)" strokeWidth={1.8} />
          </div>
          <div>Buscá más productos para agregar al ticket</div>
        </div>
      )}

      {busqueda && resultados.length === 0 && (
        <div style={{ textAlign: 'center', padding: '44px 20px', color: 'var(--text2)', fontSize: 13, animation: 'fadeIn 0.2s ease' }}>
          <div style={{
            width: 40, height: 40,
            borderRadius: '50%',
            background: 'var(--bg3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Search size={18} color="var(--text2)" strokeWidth={1.8} />
          </div>
          <div>No se encontraron productos para &quot;{busqueda}&quot;</div>
        </div>
      )}

      {resultados.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resultados.map(p => {
            const sinStock = p.stock_actual === 0
            const esVariable = necesitaModal(p)
            return (
              <button key={p.id} onClick={() => onSelect(p)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s', opacity: sinStock ? 0.6 : 1 }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--ac)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {p.imagen_url
                    ? <img src={p.imagen_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                    : <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' style={{opacity: 0.3}}><path d='M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z'/></svg>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>{p.codigo_barras || p.sku}</div>
                  <div style={{ fontSize: 11, color: sinStock ? '#888898' : p.stock_actual <= 5 ? 'var(--r)' : 'var(--text2)', marginTop: 2 }}>
                    {sinStock ? 'Sin stock' :
                      p.unidad_venta === 'kg' ? `${p.stock_actual.toFixed(2)} kg disponibles` :
                      `Stock: ${p.stock_actual}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ac)', fontFamily: 'DM Mono, monospace' }}>
                    {p.unidad_venta === 'kg' ? `${formatPeso(p.precio_por_kg ?? 0)}/kg`
                      : p.unidad_venta === 'litro' ? `${formatPeso(p.precio_venta)}/L`
                      : p.unidad_venta === 'metro' ? `${formatPeso(p.precio_venta)}/m`
                      : formatPeso(p.precio_venta)}
                  </div>
                  {esVariable && (
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>Toca para ingresar cantidad</div>
                  )}
                  {sinStock && (
                    <div style={{ fontSize: 10, color: '#888898', marginTop: 2 }}>Sin stock</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
