'use client'
import { useEffect, useState } from 'react'
import { getProductos } from '@/lib/supabase/productos'
import { getVentas } from '@/lib/supabase/ventas'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, Receipt, Package, Medal } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { formatPeso } from '@/lib/utils'

export default function ReportesPage() {
  const [ventas, setVentas] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    Promise.all([getVentas(), getProductos()]).then(([v, p]) => {
      setVentas(v)
      setProductos(p)
      setCargando(false)
    })
  }, [])

  const totalMes = ventas.reduce((s, v) => s + Number(v.total), 0)
  const ticketProm = ventas.length ? Math.round(totalMes / ventas.length) : 0

  // Ganancia estimada (ventas - costos de items vendidos)
  const costoTotal = ventas.reduce((s, v) => {
    return s + (v.items_venta || []).reduce((ss: number, item: any) => {
      const prod = productos.find(p => p.id === item.producto_id)
      return ss + (prod ? Number(prod.precio_costo) * Number(item.cantidad) : 0)
    }, 0)
  }, 0)
  const ganancia = totalMes - costoTotal
  const margenProm = totalMes > 0 ? Math.round((ganancia / totalMes) * 100) : 0

  // Ventas por mes (últimos 6 meses)
  const ultimos6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    const mes = d.toLocaleDateString('es-AR', { month: 'short' })
    const total = ventas
      .filter(v => {
        const vd = new Date(v.created_at)
        return vd.getMonth() === d.getMonth() && vd.getFullYear() === d.getFullYear()
      })
      .reduce((s, v) => s + Number(v.total), 0)
    return { mes, total }
  })

  // Ventas por método
  const porMetodo: Record<string, number> = {}
  ventas.forEach(v => { porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] || 0) + Number(v.total) })

  // Top productos
  const itemsCount: Record<string, { nombre: string; cantidad: number; total: number; costo: number }> = {}
  ventas.forEach(v => {
    v.items_venta?.forEach((item: any) => {
      const prod = productos.find(p => p.id === item.producto_id)
      if (!itemsCount[item.nombre_producto]) {
        itemsCount[item.nombre_producto] = { nombre: item.nombre_producto, cantidad: 0, total: 0, costo: 0 }
      }
      itemsCount[item.nombre_producto].cantidad += Number(item.cantidad)
      itemsCount[item.nombre_producto].total += Number(item.subtotal)
      itemsCount[item.nombre_producto].costo += (prod ? Number(prod.precio_costo) : 0) * Number(item.cantidad)
    })
  })
  const topProductos = Object.values(itemsCount).sort((a, b) => b.total - a.total).slice(0, 6)

  if (cargando) return <Spinner texto="Cargando reportes..." />

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Reportes</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>Análisis de performance y rentabilidad</p>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {[
          { label: 'Ventas totales', value: formatPeso(totalMes), sub: `${ventas.length} transacciones`, color: '#5b4cff', icon: TrendingUp },
          { label: 'Ganancia estimada', value: formatPeso(ganancia), sub: `Margen ${margenProm}%`, color: '#00c896', icon: DollarSign },
          { label: 'Ticket promedio', value: formatPeso(ticketProm), sub: 'Por transacción', color: '#ff6b35', icon: Receipt },
          { label: 'Productos activos', value: productos.length.toString(), sub: 'En catálogo', color: '#ffd23f', icon: Package },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} style={{ background: 'var(--card)', borderRadius: 16, padding: '14px 16px', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace', marginBottom: 3, color: 'var(--text)' }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{k.sub}</div>
                </div>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={15} color={k.color} />
                </div>
              </div>
            </div>
          )
        })}
    </div>


      {/* Gráfico ventas por mes */}
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: 18, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, letterSpacing: '-0.2px', color: 'var(--text)' }}>Ventas por mes — últimos 6 meses</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>Total recaudado por mes</div>
        {ventas.length === 0 ? (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 12 }}>
            Sin datos de ventas todavía
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={ultimos6}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '0' : '$' + Math.round(v / 1000) + 'k'} />
              <Tooltip formatter={(v: any) => formatPeso(v)} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: 'DM Sans, sans-serif' }} />
              <Line dataKey="total" name="Ventas" stroke="#5b4cff" strokeWidth={2.5} dot={{ r: 4, fill: '#5b4cff' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>



      <div className="split-2" style={{ marginBottom: 16 }}>
        {/* Top productos */}
        <div style={{ background: 'var(--card)', borderRadius: 16, padding: 18, border: '1px solid var(--border)'

 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, letterSpacing: '-0.2px', color: 'var(--text)' }}>Rentabilidad por producto</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>Ventas vs costo</div>
          {topProductos.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 12 }}>
              Sin ventas registradas
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProductos.map(p => ({ name: p.nombre.split(' ')[0], ventas: p.total, costo: p.costo }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b6b72' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '0' : '$' + Math.round(v / 1000) + 'k'} />
                <Tooltip formatter={(v: any) => formatPeso(v)} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: 'DM Sans, sans-serif' }} />
                <Bar dataKey="ventas" name="Ventas" fill="#5b4cff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="costo" name="Costo" fill="rgba(255,107,53,0.5)" radius={[4, 4, 0, 0]} />
              </BarChart>


            </ResponsiveContainer>
          )}
        </div>

        {/* Por método */}
        <div style={{ background: 'var(--card)', borderRadius: 16, padding: 18, border: '1px solid var(--border)'

 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, letterSpacing: '-0.2px', color: 'var(--text)' }}>Por método de pago</div>
          {Object.entries(porMetodo).length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 12 }}>Sin datos</div>
          ) : Object.entries(porMetodo).map(([metodo, total]) => {
            const pct = Math.round(((total as number) / totalMes) * 100)
            return (
              <div key={metodo} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{metodo}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--ac)', borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text2)', border: '1px solid var(--border)',}}></div>
            </div>
            )
          })}
        </div>
      </div>

      {/* Tabla top productos */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Medal size={15} color="#ffd23f" /> Ranking de productos más vendidos
        </div>
        {topProductos.length === 0 ? (
          <div className="empty-state empty-state-sm">
            <div className="empty-icon"><Medal size={18} color="var(--text2)" strokeWidth={1.8} /></div>
            <div className="empty-sub">Sin ventas registradas todavía</div>
          </div>
        ) : (
          <div className="table-scroll">
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['#', 'Producto', 'Unidades', 'Total vendido', 'Costo', 'Ganancia', 'Margen'].map((h, i) => (
                  <th key={h} className={i === 0 ? 'sticky-col' : undefined} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500, background: 'var(--bg3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topProductos.map((p, i) => {
                const gan = p.total - p.costo
                const mg = p.total > 0 ? Math.round((gan / p.total) * 100) : 0
                return (
                  <tr key={i} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="sticky-col" style={{ padding: '9px 12px', fontWeight: 700, color: i === 0 ? '#ffd23f' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text2)' }}>
                      {i < 3 ? (
                        <Medal
                          size={16}
                          color={i === 0 ? '#ffd23f' : i === 1 ? '#c0c0c0' : '#cd7f32'}
                          strokeWidth={1.8}
                        />
                      ) : `#${i + 1}`}
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 500 }}>{p.nombre}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace' }}>{p.cantidad}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--ac)', fontWeight: 600 }}>{formatPeso(p.total)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>{formatPeso(p.costo)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--g)', fontWeight: 600 }}>{formatPeso(gan)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ background: mg >= 35 ? 'rgba(0,200,150,0.1)' : 'rgba(255,184,0,0.1)', color: mg >= 35 ? 'var(--g)' : 'var(--w)', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>
                        {mg}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}