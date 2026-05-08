'use client'
import { useEffect, useState } from 'react'
import { getVentas } from '@/lib/supabase/productos'

export default function VentasPage() {
  const [ventas, setVentas] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<any | null>(null)

  useEffect(() => {
    getVentas().then(data => {
      setVentas(data)
      setCargando(false)
    })
  }, [])

  const totalMes = ventas.reduce((s, v) => s + Number(v.total), 0)
  const ticketProm = ventas.length ? Math.round(totalMes / ventas.length) : 0

  if (cargando) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b72' }}>
      ⏳ Cargando ventas...
    </div>
  )

  return (
    <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Historial de Ventas</h1>
        <p style={{ color: '#6b6b72', fontSize: 13, margin: '2px 0 0' }}>Hacé click en una venta para ver el detalle</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Ventas del período', value: '$' + totalMes.toLocaleString('es-AR'), color: '#5b4cff' },
          { label: 'Ticket promedio', value: '$' + ticketProm.toLocaleString('es-AR'), color: '#00c896' },
          { label: 'Transacciones', value: ventas.length.toString(), color: '#ff6b35' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--border)'



, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
            <div style={{ fontSize: 10, color: '#6b6b72', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace' }}>{k.value}</div>
          </div>
        ))}
      </div>



      <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
          Historial de ventas
        </div>
        {ventas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b6b72', fontSize: 13 }}>
            No hay ventas registradas todavía. Hacé una venta desde el POS para verla acá.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Fecha', 'Ticket', 'Método', 'Descuento', 'Recargo', 'Total', 'Estado', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: '#6b6b72', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventas.map((v: any) => (
                <tr key={v.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => setDetalle(v)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8f8f8')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '9px 12px', color: '#6b6b72', fontSize: 11 }}>
                    {new Date(v.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 600 }}>
                    #{String(v.numero_ticket).padStart(4, '0')}
                  </td>
                  <td style={{ padding: '9px 12px' }}>{v.metodo_pago}</td>
                  <td style={{ padding: '9px 12px', color: '#00c896', fontWeight: 500 }}>
                    {v.descuento_porcentaje > 0 ? `-${v.descuento_porcentaje}%` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#ff4757', fontWeight: 500 }}>
                    {v.recargo_porcentaje > 0 ? `+${v.recargo_porcentaje}%` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#5b4cff' }}>
                    ${Number(v.total).toLocaleString('es-AR')}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: 'rgba(0,200,150,0.1)', color: '#00c896', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>
                      {v.estado}
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ fontSize: 11, color: '#5b4cff' }}>Ver →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal detalle de venta */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  Ticket #{String(detalle.numero_ticket).padStart(4, '0')}
                </div>
                <div style={{ fontSize: 11, color: '#6b6b72', marginTop: 2 }}>
                  {new Date(detalle.created_at).toLocaleString('es-AR', {
                    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
              <button onClick={() => setDetalle(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b6b72', lineHeight: 1 }}>✕</button>
            </div>

            {/* Items */}
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6b72', textTransform: 'uppercase', marginBottom: 10 }}>
                Productos vendidos
              </div>
              {detalle.items_venta && detalle.items_venta.length > 0 ? (
                detalle.items_venta.map((item: any) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{item.nombre_producto}</div>
                      <div style={{ fontSize: 10, color: '#6b6b72' }}>
                        {item.cantidad} x ${Number(item.precio_unitario).toLocaleString('es-AR')}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#5b4cff' }}>
                      ${Number(item.subtotal).toLocaleString('es-AR')}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: '#6b6b72' }}>Sin detalle de productos</div>
              )}
            </div>

            {/* Totales */}
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b6b72', marginBottom: 5 }}>
                <span>Subtotal</span>
                <span style={{ fontFamily: 'monospace' }}>${Number(detalle.subtotal).toLocaleString('es-AR')}</span>
              </div>
              {detalle.descuento_porcentaje > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#00c896', marginBottom: 5 }}>
                  <span>Descuento -{detalle.descuento_porcentaje}%</span>
                  <span style={{ fontFamily: 'monospace' }}>-${Number(detalle.descuento_monto).toLocaleString('es-AR')}</span>
                </div>
              )}
              {detalle.recargo_porcentaje > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ff4757', marginBottom: 5 }}>
                  <span>Recargo +{detalle.recargo_porcentaje}%</span>
                  <span style={{ fontFamily: 'monospace' }}>+${Number(detalle.recargo_monto).toLocaleString('es-AR')}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                <span>TOTAL</span>
                <span style={{ fontFamily: 'monospace', color: '#5b4cff' }}>${Number(detalle.total).toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Método de pago */}
            <div style={{ marginTop: 12, background: 'rgba(91,76,255,0.05)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#6b6b72' }}>Método de pago</span>
              <span style={{ fontWeight: 600 }}>{detalle.metodo_pago}</span>
            </div>

            <button onClick={() => setDetalle(null)}
              style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 8, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}