'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getProductos } from '@/lib/supabase/productos'
import { getVentas } from '@/lib/supabase/ventas'
import { formatPeso } from '@/lib/utils'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/Skeleton'
import { TrendingUp, ShoppingBag, AlertTriangle, Package, CheckCircle, Trophy, ShoppingCart, Wallet, BookOpen, ArrowRight } from 'lucide-react'

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
  const colores: Record<string, string> = { efectivo: '#5b4cff', debito: '#ff6b35', credito: '#ffd23f', mercadopago: '#009ee3' }
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
    <div className="page-in" style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: 24 }}>
        <Skeleton width={180} height={26} radius={6} />
        <Skeleton width={240} height={13} radius={4} style={{ marginTop: 8 }} />
      </div>

      {/* KPIs skeleton — mismo grid responsive que el real */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            background: 'var(--card)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <Skeleton width={70} height={10} radius={3} />
              <Skeleton width={32} height={32} radius={10} />
            </div>
            <Skeleton width={120} height={24} radius={5} style={{ marginBottom: 6 }} />
            <Skeleton width={80} height={11} radius={3} />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="dashboard-grid-2" style={{ marginBottom: 16 }}>
        {[200, 160].map((h, i) => (
          <div key={i} style={{
            background: 'var(--card)',
            borderRadius: 'var(--radius-lg)',
            padding: 20,
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <Skeleton width={140} height={14} radius={4} style={{ marginBottom: 6 }} />
            <Skeleton width={90} height={11} radius={3} style={{ marginBottom: 16 }} />
            <Skeleton width="100%" height={h} radius={8} />
          </div>
        ))}
      </div>

      {/* Tablas skeleton */}
      <div className="dashboard-grid-equal">
        {[0, 1].map(i => (
          <div key={i} style={{
            background: 'var(--card)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <Skeleton width={160} height={14} radius={4} />
            </div>
            {[0, 1, 2, 3, 4].map(j => (
              <div key={j} style={{ padding: '11px 16px', borderTop: j === 0 ? 'none' : '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Skeleton width={120 + (j % 3) * 30} height={11} radius={3} />
                <Skeleton width={60} height={11} radius={3} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  // Comercio nuevo: sin productos NI ventas. En vez de un panel lleno
  // de ceros (desmotivante y confuso), mostramos "Primeros pasos" con
  // las acciones recomendadas en el orden natural del onboarding.
  const esComercioNuevo = productos.length === 0 && ventas.length === 0
  if (esComercioNuevo) {
    const pasos = [
      { n: 1, Icon: Package, title: 'Cargá tus productos', desc: 'Empezá por lo que vendés: nombre, precio y stock. Lo hacés una vez.', href: '/productos/nuevo', destacado: true },
      { n: 2, Icon: ShoppingCart, title: 'Cobrá en el POS', desc: 'Con productos cargados, cobrás tu primera venta en segundos.', href: '/pos' },
      { n: 3, Icon: Wallet, title: 'Revisá tu caja', desc: 'Al final del día vas a ver acá cuánto vendiste y qué te quedó.', href: '/caja' },
      { n: 4, Icon: BookOpen, title: 'Mirá la guía rápida', desc: 'Dos minutos para entender cómo funciona Sylvora de punta a punta.', href: '/guia' },
    ]
    return (
      <div className="page-in" style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Bienvenido a Sylvora</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5, maxWidth: 480 }}>
            Tu comercio está listo. Seguí estos pasos para empezar a vender — te toma un par de minutos.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          {pasos.map(p => (
            <Link
              key={p.n}
              href={p.href}
              className="lift-hover"
              style={{
                display: 'flex', flexDirection: 'column', gap: 10,
                background: 'var(--card)',
                border: `1px solid ${p.destacado ? 'var(--ac)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '18px 20px',
                textDecoration: 'none',
                boxShadow: 'var(--shadow-sm)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: p.destacado ? 'var(--ac)' : 'var(--ac-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <p.Icon size={18} color={p.destacado ? '#fff' : 'var(--ac)'} strokeWidth={2} />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text2)',
                  fontFamily: 'DM Mono, monospace',
                }}>
                  {String(p.n).padStart(2, '0')}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                {p.title}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, flex: 1 }}>
                {p.desc}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--ac)' }}>
                Empezar <ArrowRight size={14} strokeWidth={2.2} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  // Color discipline: violeta como color de marca dominante. El único
  // color semántico que aparece es el rojo, y SOLO cuando comunica
  // información real (stock crítico > 0). Estilo Linear/Stripe.
  const stockCriticoColor = criticos > 0 ? '#ff4757' : '#5b4cff'
  const kpis = [
    { label: 'Ventas hoy', value: formatPeso(totalHoy), sub: `${ventasHoy.length} transacciones`, color: '#5b4cff', icon: TrendingUp },
    { label: 'Ventas del mes', value: formatPeso(totalMes), sub: `${ventas.length} total`, color: '#5b4cff', icon: ShoppingBag },
    { label: 'Stock crítico', value: criticos.toString(), sub: `${bajos} con stock bajo`, color: stockCriticoColor, icon: AlertTriangle },
    { label: 'Productos activos', value: productos.length.toString(), sub: 'En catálogo', color: '#5b4cff', icon: Package },
  ]

  return (
    <div className="page-in" style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Panel de Control</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 16 }}>
        {kpis.map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="lift-hover" style={{
              background: 'var(--card)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 20px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${k.color}, ${k.color}aa)`,
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{k.label}</div>
                <div style={{
                  width: 32, height: 32,
                  borderRadius: 10,
                  background: k.color + '14',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={15} color={k.color} strokeWidth={1.8} />
                </div>
              </div>
              <div style={{
                fontSize: 26, fontWeight: 700,
                fontFamily: 'DM Mono, monospace',
                marginBottom: 4, color: 'var(--text)',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{k.sub}</div>
            </div>
          )
        })}
      </div>

      {/* Gráficos */}
      <div className="dashboard-grid-2" style={{ marginBottom: 16 }}>
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text)', letterSpacing: '-0.01em' }}>Ventas últimos 7 días</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>Total por día</div>
          {ventas.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 12 }}>
              No hay ventas registradas todavía
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ultimos7}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '0' : '$' + Math.round(v / 1000) + 'k'} />
                <Tooltip formatter={(v: any) => formatPeso(v)} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: 'DM Sans, sans-serif' }} />
                <Bar dataKey="total" name="Ventas" fill="#5b4cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text)', letterSpacing: '-0.01em' }}>Métodos de pago</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>Distribución total</div>
          {metodosPie.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 12 }}>Sin datos</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {metodosPie.map(m => (
                  <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text2)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: m.color, display: 'inline-block' }} />
                    {m.name}
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={metodosPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {metodosPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatPeso(v)} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: 'DM Sans, sans-serif' }} />
                </PieChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>

      {/* Tablas */}
      <div className="dashboard-grid-equal">
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={14} color="var(--w)" strokeWidth={1.8} />
            Productos más vendidos
          </div>
          {topProductos.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 12 }}>Sin ventas registradas</div>
          ) : (
            <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Producto', 'Cant.', 'Total'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topProductos.map((p, i) => (
                  <tr key={i} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>{p.nombre}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>{p.cantidad}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', color: 'var(--ac)', fontWeight: 600 }}>{formatPeso(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} color="var(--w)" strokeWidth={1.8} />
              Alertas de stock
            </span>
            <Link href="/stock" style={{ fontSize: 11, color: 'var(--ac)', textDecoration: 'none', fontWeight: 500 }}>Ver todo →</Link>
          </div>
          {alertasStock.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--g)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <CheckCircle size={14} color="var(--g)" strokeWidth={1.8} /> Todo el stock está OK
            </div>
          ) : (
            <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Producto', 'Stock', 'Mín.', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alertasStock.map((p: any, i: number) => {
                  const sc = p.stock_actual <= p.stock_minimo * 0.3 ? 'var(--r)' : 'var(--w)'
                  const scHex = p.stock_actual <= p.stock_minimo * 0.3 ? '#ff4757' : '#ffb800'
                  const sl = p.stock_actual <= p.stock_minimo * 0.3 ? 'Crítico' : 'Bajo'
                  return (
                    <tr key={i} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>{p.nombre}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: sc }}>{p.stock_actual}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>{p.stock_minimo}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: scHex + '14', color: sc,
                          padding: '3px 9px', borderRadius: 999,
                          fontSize: 10, fontWeight: 600,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc }} />
                          {sl}
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
    </div>
  )
}