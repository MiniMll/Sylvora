'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from 'recharts'
import { getVentas, getProductos } from '@/lib/supabase/productos'
import Link from 'next/link'
import { Spinner } from '@/components/ui/Spinner'
import { TrendingUp, ShoppingBag, AlertTriangle, Package, CheckCircle } from 'lucide-react'

function formatPeso(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }

export default function DashboardPage() {
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

  // Calculos
  const hoy = new Date().toDateString()
  const ventasHoy = ventas.filter(v => new Date(v.created_at).toDateString() === hoy)
  const totalHoy = ventasHoy.reduce((s, v) => s + Number(v.total), 0)
  const totalMes = ventas.reduce((s, v) => s + Number(v.total), 0)

  const criticos = productos.filter(p => p.stock_actual <= p.stock_minimo * 0.3).length
  const bajos = productos.filter(p => p.stock_actual > p.stock_minimo * 0.3 && p.stock_actual <= p.stock_minimo).length

  // Ventas por día (últimos 7 días)
  const ultimos7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const label = d.toLocaleDateString('es-AR', { weekday: 'short' })
    const total = ventas
      .filter(v => new Date(v.created_at).toDateString() === d.toDateString())
      .reduce((s, v) => s + Number(v.total), 0)
    return { dia: label, total }
  })

  // Métodos de pago
  const metodos: Record<string, number> = {}
  ventas.forEach(v => { metodos[v.metodo_pago] = (metodos[v.metodo_pago] || 0) + Number(v.total) })
  const totalMetodos = Object.values(metodos).reduce((s, v) => s + v, 0)
  const colores: Record<string, string> = { efectivo: '#5b4cff', transferencia: '#00c896', debito: '#ff6b35', credito: '#ffd23f', mercadopago: '#009ee3' }
  const metodosPie = Object.entries(metodos).map(([name, value]) => ({ name, value, color: colores[name] || '#aaa' }))

  // Top productos vendidos
  const itemsCount: Record<string, { nombre: string; cantidad: number; total: number }> = {}
  ventas.forEach(v => {
    v.items_venta?.forEach((item: any) => {
      if (!itemsCount[item.nombre_producto]) itemsCount[item.nombre_producto] = { nombre: item.nombre_producto, cantidad: 0, total: 0 }
      itemsCount[item.nombre_producto].cantidad += Number(item.cantidad)
      itemsCount[item.nombre_producto].total += Number(item.subtotal)
    })
  })
  const topProductos = Object.values(itemsCount).sort((a, b) => b.total - a.total).slice(0, 5)

  // Alertas stock
  const alertasStock = productos.filter(p => p.stock_actual <= p.stock_minimo).slice(0, 5)

  if (cargando) return (
    <Spinner texto="Cargando dashboard..." />
  )

  const kpis = [
    { label: 'Ventas hoy', value: formatPeso(totalHoy), sub: `${ventasHoy.length} transacciones`, color: '#5b4cff', icon: TrendingUp },
    { label: 'Ventas del mes', value: formatPeso(totalMes), sub: `${ventas.length} total`, color: '#00c896', icon: ShoppingBag },
    { label: 'Stock crítico', value: criticos.toString(), sub: `${bajos} con stock bajo`, color: '#ff6b35', icon: AlertTriangle },
    { label: 'Productos activos', value: productos.length.toString(), sub: 'En catálogo', color: '#ffd23f', icon: Package },
  ]

  return (
    <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Panel de Control</h1>
        <p style={{ color: '#6b6b72', fontSize: 13, margin: '2px 0 0' }}>
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {kpis.map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} style={{ background: 'var(--card)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</div>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={14} color={k.color} />
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', marginBottom: 3, color: 'var(--text)' }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{k.sub}</div>
            </div>
          )
        })}
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--card)', borderRadius: 14, padding: 18, border: '1px solid var(--border)'

 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Ventas últimos 7 días</div>
          <div style={{ fontSize: 11, color: '#6b6b72', marginBottom: 12 }}>Total por día</div>
          {ventas.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b72', fontSize: 12 }}>
              No hay ventas registradas todavía
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ultimos7}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '0' : '$' + Math.round(v / 1000) + 'k'} />
                <Tooltip formatter={(v: any) => formatPeso(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="total" name="Ventas" fill="#5b4cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: 'var(--card)', borderRadius: 14, padding: 18, border: '1px solid var(--border)'

 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Métodos de pago</div>
          <div style={{ fontSize: 11, color: '#6b6b72', marginBottom: 8 }}>Distribución total</div>
          {metodosPie.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b72', fontSize: 12 }}>Sin datos</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {metodosPie.map(m => (
                  <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6b6b72' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: 'inline-block' }} />
                    {m.name}
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={metodosPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {metodosPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatPeso(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>

      {/* Tablas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)'

, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)'
, fontSize: 13, fontWeight: 600 }}>
            🏆 Productos más vendidos
          </div>
          {topProductos.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6b6b72', fontSize: 12 }}>Sin ventas registradas</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', }}>
                  {['Producto', 'Cant.', 'Total'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: '#6b6b72', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topProductos.map((p, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 500 }}>{p.nombre}</td>
                    <td style={{ padding: '9px 12px' }}>{p.cantidad}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#5b4cff', fontWeight: 600 }}>{formatPeso(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)'

, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)'
, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><AlertTriangle size={13} /> Alertas de stock</span>
            <Link href="/stock" style={{ fontSize: 11, color: '#5b4cff', textDecoration: 'none' }}>Ver todo</Link>
          </div>
          {alertasStock.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#00c896', fontSize: 12 }}><CheckCircle size={13} color="#00c896" style={{marginRight:4}}/> Todo el stock está OK</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Producto', 'Stock', 'Mín.', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: '#6b6b72', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alertasStock.map((p: any, i: number) => {
                  const sc = p.stock_actual <= p.stock_minimo * 0.3 ? '#ff4757' : '#ffb800'
                  const sl = p.stock_actual <= p.stock_minimo * 0.3 ? 'Crítico' : 'Bajo'
                  return (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 500 }}>{p.nombre}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: sc }}>{p.stock_actual}</td>
                      <td style={{ padding: '9px 12px', color: '#6b6b72' }}>{p.stock_minimo}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ background: sc + '22', color: sc, padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>{sl}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}