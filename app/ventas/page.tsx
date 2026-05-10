'use client'
import { useEffect, useState } from 'react'
import { getVentas } from '@/lib/supabase/ventas'
import { formatPeso } from '@/lib/utils'
import { Search, TrendingUp, Receipt, Hash, X, ChevronDown } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

export default function VentasPage() {
  const [ventas, setVentas] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<any | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroMetodo, setFiltroMetodo] = useState('todos')
  const [filtroFecha, setFiltroFecha] = useState('todo')

  useEffect(() => {
    getVentas().then(data => { setVentas(data); setCargando(false) })
  }, [])

  const ventasFiltradas = ventas.filter(v => {
    const matchMetodo = filtroMetodo === 'todos' || v.metodo_pago === filtroMetodo
    const matchBusq = !busqueda ||
      String(v.numero_ticket).includes(busqueda) ||
      v.metodo_pago.toLowerCase().includes(busqueda.toLowerCase()) ||
      String(v.total).includes(busqueda)
    const hoy = new Date()
    const fechaVenta = new Date(v.created_at)
    const matchFecha = filtroFecha === 'todo' ? true
      : filtroFecha === 'hoy' ? fechaVenta.toDateString() === hoy.toDateString()
      : filtroFecha === 'semana' ? (hoy.getTime() - fechaVenta.getTime()) < 7 * 24 * 60 * 60 * 1000
      : filtroFecha === 'mes' ? fechaVenta.getMonth() === hoy.getMonth() && fechaVenta.getFullYear() === hoy.getFullYear()
      : true
    return matchMetodo && matchBusq && matchFecha
  })

  const totalFiltrado = ventasFiltradas.reduce((s, v) => s + Number(v.total), 0)
  const ticketProm = ventasFiltradas.length ? Math.round(totalFiltrado / ventasFiltradas.length) : 0

  if (cargando) return <Spinner texto="Cargando ventas..." />

  const inp: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px',
    fontSize: 12, outline: 'none', fontFamily: 'inherit',
    background: 'var(--bg2)', color: 'var(--text)'
  }

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.5px', color: 'var(--text)' }}>Historial de Ventas</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '2px 0 0' }}>Hacé click en una venta para ver el detalle</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total período', value: formatPeso(totalFiltrado), icon: TrendingUp, color: '#5b4cff' },
          { label: 'Ticket promedio', value: formatPeso(ticketProm), icon: Receipt, color: '#00c896' },
          { label: 'Transacciones', value: ventasFiltradas.length.toString(), icon: Hash, color: '#ff6b35' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} style={{ background: 'var(--card)', borderRadius: 16, padding: '14px 16px', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>{k.value}</div>
                </div>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={15} color={k.color} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: '12px 16px', border: '1px solid var(--border)', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} color="var(--text2)" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por ticket, monto..."
            style={{ ...inp, width: '100%', paddingLeft: 28 }} />
        </div>
        <select value={filtroMetodo} onChange={e => setFiltroMetodo(e.target.value)} style={inp}>
          <option value="todos">Todos los métodos</option>
          <option value="efectivo">Efectivo</option>
          <option value="debito">Débito</option>
          <option value="credito">Crédito</option>
          <option value="mercadopago">Mercado Pago</option>
        </select>
        <select value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} style={inp}>
          <option value="todo">Todo el historial</option>
          <option value="hoy">Hoy</option>
          <option value="semana">Esta semana</option>
          <option value="mes">Este mes</option>
        </select>
        {(busqueda || filtroMetodo !== 'todos' || filtroFecha !== 'todo') && (
          <button onClick={() => { setBusqueda(''); setFiltroMetodo('todos'); setFiltroFecha('todo') }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 11, color: 'var(--text2)', fontFamily: 'inherit' }}>
            <X size={11} /> Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Ventas</span>
          <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>{ventasFiltradas.length} resultados</span>
        </div>
        {ventasFiltradas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Search size={18} color="var(--text2)" strokeWidth={1.8} /></div>
            <div className="empty-sub">No hay ventas que coincidan con los filtros</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Fecha', 'Ticket', 'Método', 'Descuento', 'Recargo', 'Total', 'Estado', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map((v: any) => (
                <tr key={v.id} className="row-hover" style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => setDetalle(v)}>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)', fontSize: 11 }}>
                    {new Date(v.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>
                    #{String(v.numero_ticket).padStart(4, '0')}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text)', textTransform: 'capitalize' }}>{v.metodo_pago}</td>
                  <td style={{ padding: '9px 12px', color: '#00c896', fontWeight: 500 }}>
                    {v.descuento_porcentaje > 0 ? `-${v.descuento_porcentaje}%` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#ff4757', fontWeight: 500 }}>
                    {v.recargo_porcentaje > 0 ? `+${v.recargo_porcentaje}%` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#5b4cff' }}>
                    {formatPeso(v.total)}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: 'rgba(0,200,150,0.1)', color: '#00c896', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>
                      {v.estado}
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px', color: '#5b4cff', fontSize: 11 }}>Ver</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal detalle */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div data-modal-card className="scale-in" style={{ background: 'var(--card)', borderRadius: 20, width: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  Ticket #{String(detalle.numero_ticket).padStart(4, '0')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {new Date(detalle.created_at).toLocaleString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button onClick={() => setDetalle(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Items */}
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 10 }}>
                  Productos vendidos
                </div>
                {detalle.items_venta && detalle.items_venta.length > 0 ? (
                  detalle.items_venta.map((item: any) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{item.nombre_producto}</div>
                        <div style={{ fontSize: 10, color: 'var(--text2)' }}>
                          {item.cantidad} x {formatPeso(item.precio_unitario)}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#5b4cff' }}>
                        {formatPeso(item.subtotal)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Sin detalle de productos</div>
                )}
              </div>

              {/* Totales */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
                  <span>Subtotal</span>
                  <span style={{ fontFamily: 'monospace' }}>{formatPeso(detalle.subtotal)}</span>
                </div>
                {detalle.descuento_porcentaje > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#00c896', marginBottom: 5 }}>
                    <span>Descuento -{detalle.descuento_porcentaje}%</span>
                    <span style={{ fontFamily: 'monospace' }}>-{formatPeso(detalle.descuento_monto)}</span>
                  </div>
                )}
                {detalle.recargo_porcentaje > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ff4757', marginBottom: 5 }}>
                    <span>Recargo +{detalle.recargo_porcentaje}%</span>
                    <span style={{ fontFamily: 'monospace' }}>+{formatPeso(detalle.recargo_monto)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text)' }}>TOTAL</span>
                  <span style={{ fontFamily: 'monospace', color: '#5b4cff' }}>{formatPeso(detalle.total)}</span>
                </div>
              </div>

              {/* Método */}
              <div style={{ marginTop: 12, background: 'rgba(91,76,255,0.05)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text2)' }}>Método de pago</span>
                <span style={{ fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{detalle.metodo_pago}</span>
              </div>

              <button onClick={() => setDetalle(null)}
                style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 8, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}