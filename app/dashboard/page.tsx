'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Lock,
  Package,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePermissions } from '@/components/PermissionsProvider'
import { formatPeso } from '@/lib/utils'

type DashboardComercial = {
  generado_en: string
  kpis: {
    ventas_hoy_cantidad: number
    ventas_hoy_total: number
    ventas_7_dias_total: number
    ventas_mes_total: number
    ventas_mes_cantidad: number
    ticket_promedio_mes: number
    stock_critico_cantidad: number
  }
  top_productos: Array<{
    producto_id: string | null
    nombre: string
    cantidad: number
    facturacion: number
  }>
  stock_critico: Array<{
    producto_id: string
    nombre: string
    stock_actual: number
    stock_minimo: number
    unidad_venta: string
  }>
  ultimas_ventas: Array<{
    id: string
    numero_ticket: number
    fecha: string
    cliente: string | null
    total: number
    metodo_pago: string
  }>
}

function formatFecha(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatMetodoPago(metodo: string): string {
  const m: Record<string, string> = {
    efectivo: 'Efectivo',
    debito: 'Débito',
    credito: 'Crédito',
    transferencia: 'Transferencia',
    mercadopago: 'Mercado Pago',
  }
  return m[metodo] ?? metodo
}

function PageHeader() {
  return (
    <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Dashboard comercial
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>
          Resumen operativo para decidir rápido
        </p>
      </div>
      <Link
        href="/reportes"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 36,
          padding: '0 13px',
          borderRadius: 9,
          border: '1px solid var(--border)',
          color: 'var(--text)',
          background: 'var(--card)',
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Reportes <ArrowRight size={14} />
      </Link>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="page-in" style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: 22 }}>
        <Skeleton width={220} height={26} radius={7} />
        <Skeleton width={260} height={13} radius={4} style={{ marginTop: 8 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <Skeleton width={86} height={10} radius={4} />
            <Skeleton width={120} height={24} radius={5} style={{ marginTop: 12 }} />
            <Skeleton width={92} height={11} radius={4} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="dashboard-grid-2" style={{ marginBottom: 16 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <Skeleton width={160} height={15} radius={4} />
            {[0, 1, 2, 3, 4].map(j => (
              <Skeleton key={j} width="100%" height={36} radius={6} style={{ marginTop: 10 }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <Skeleton width={160} height={15} radius={4} />
        {[0, 1, 2, 3].map(j => (
          <Skeleton key={j} width="100%" height={36} radius={6} style={{ marginTop: 10 }} />
        ))}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: 24,
      color: 'var(--text2)',
      fontSize: 12,
      textAlign: 'center',
    }}>
      {text}
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  Icon,
  tone = 'default',
}: {
  label: string
  value: string
  sub: string
  Icon: typeof TrendingUp
  tone?: 'default' | 'danger'
}) {
  const color = tone === 'danger' ? 'var(--r)' : 'var(--ac)'
  return (
    <section style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 16,
      boxShadow: 'var(--shadow-sm)',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--text2)' }}>
          {label}
        </div>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: tone === 'danger' ? 'rgba(255,82,97,0.10)' : 'var(--ac-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={15} color={color} strokeWidth={2} />
        </div>
      </div>
      <div style={{
        marginTop: 12,
        fontFamily: 'DM Mono, ui-monospace, monospace',
        fontSize: 24,
        fontWeight: 700,
        color: 'var(--text)',
        letterSpacing: '-0.02em',
        overflowWrap: 'anywhere',
      }}>
        {value}
      </div>
      <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text2)' }}>
        {sub}
      </div>
    </section>
  )
}

function Panel({ title, Icon, children }: { title: string; Icon: typeof Trophy; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      minWidth: 0,
    }}>
      <div style={{
        padding: '12px 15px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: 'var(--text)',
        fontSize: 13,
        fontWeight: 700,
      }}>
        <Icon size={14} color="var(--ac)" strokeWidth={2} />
        {title}
      </div>
      {children}
    </section>
  )
}

function NoAccess() {
  return (
    <div className="page-in" style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
      <PageHeader />
      <div style={{
        maxWidth: 520,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: 'var(--bg2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Lock size={18} color="var(--text2)" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            Métricas no disponibles
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
            Esta vista está disponible para administradores y encargados.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { loading: permisosLoading, has } = usePermissions()
  const puedeVerDashboard = has('reporte.ver_completo')
  const [data, setData] = useState<DashboardComercial | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (permisosLoading) return
    if (!puedeVerDashboard) return

    let cancelled = false
    async function cargar() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/dashboard/comercial', { cache: 'no-store' })
        const body = await res.json().catch(() => null) as DashboardComercial | { error?: string } | null
        if (!res.ok) {
          throw new Error((body && 'error' in body && body.error) || 'No pudimos cargar el dashboard')
        }
        if (!cancelled) setData(body as DashboardComercial)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No pudimos cargar el dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    cargar()
    return () => { cancelled = true }
  }, [permisosLoading, puedeVerDashboard])

  if (permisosLoading) return <DashboardSkeleton />
  if (!puedeVerDashboard) return <NoAccess />
  if (loading) return <DashboardSkeleton />

  if (error || !data) {
    return (
      <div className="page-in" style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <PageHeader />
        <div style={{
          background: 'rgba(255,82,97,0.08)',
          border: '1px solid rgba(255,82,97,0.28)',
          borderRadius: 12,
          padding: 16,
          color: 'var(--text)',
          fontSize: 13,
        }}>
          {error || 'No pudimos cargar el dashboard'}
        </div>
      </div>
    )
  }

  const hayActividad =
    data.kpis.ventas_hoy_cantidad > 0 ||
    data.kpis.ventas_mes_cantidad > 0 ||
    data.stock_critico.length > 0

  return (
    <div className="page-in" style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
      <PageHeader />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard
          label="Ventas hoy"
          value={formatPeso(data.kpis.ventas_hoy_total)}
          sub={`${data.kpis.ventas_hoy_cantidad} ventas`}
          Icon={TrendingUp}
        />
        <KpiCard
          label="Últimos 7 días"
          value={formatPeso(data.kpis.ventas_7_dias_total)}
          sub="Importe total"
          Icon={CalendarDays}
        />
        <KpiCard
          label="Mes actual"
          value={formatPeso(data.kpis.ventas_mes_total)}
          sub={`${data.kpis.ventas_mes_cantidad} ventas`}
          Icon={BarChart3}
        />
        <KpiCard
          label="Ticket promedio"
          value={formatPeso(data.kpis.ticket_promedio_mes)}
          sub="Mes actual"
          Icon={ReceiptText}
        />
        <KpiCard
          label="Stock crítico"
          value={String(data.kpis.stock_critico_cantidad)}
          sub="Productos bajo mínimo"
          Icon={AlertTriangle}
          tone={data.kpis.stock_critico_cantidad > 0 ? 'danger' : 'default'}
        />
      </div>

      {!hayActividad && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 18,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <ShoppingBag size={20} color="var(--ac)" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Todavía no hay actividad comercial</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Cuando registres ventas, este panel se va a completar automáticamente.</div>
          </div>
        </div>
      )}

      <div className="dashboard-grid-2" style={{ marginBottom: 16 }}>
        <Panel title="Top 5 productos más vendidos" Icon={Trophy}>
          {data.top_productos.length === 0 ? (
            <EmptyState text="Sin productos vendidos este mes" />
          ) : (
            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg3)' }}>
                    {['Producto', 'Unidades', 'Facturación'].map(h => (
                      <th key={h} style={{ padding: '9px 13px', textAlign: 'left', color: 'var(--text2)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.top_productos.map(p => (
                    <tr key={p.producto_id ?? p.nombre} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 13px', color: 'var(--text)', fontWeight: 600 }}>{p.nombre}</td>
                      <td style={{ padding: '10px 13px', color: 'var(--text)', fontFamily: 'DM Mono, ui-monospace, monospace' }}>{p.cantidad}</td>
                      <td style={{ padding: '10px 13px', color: 'var(--ac)', fontWeight: 700, fontFamily: 'DM Mono, ui-monospace, monospace' }}>{formatPeso(p.facturacion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Stock crítico" Icon={Package}>
          {data.stock_critico.length === 0 ? (
            <EmptyState text="No hay productos bajo el mínimo" />
          ) : (
            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg3)' }}>
                    {['Producto', 'Stock', 'Mínimo'].map(h => (
                      <th key={h} style={{ padding: '9px 13px', textAlign: 'left', color: 'var(--text2)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.stock_critico.map(p => (
                    <tr key={p.producto_id} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 13px', color: 'var(--text)', fontWeight: 600 }}>{p.nombre}</td>
                      <td style={{ padding: '10px 13px', color: 'var(--r)', fontFamily: 'DM Mono, ui-monospace, monospace', fontWeight: 700 }}>
                        {p.stock_actual} {p.unidad_venta}
                      </td>
                      <td style={{ padding: '10px 13px', color: 'var(--text2)', fontFamily: 'DM Mono, ui-monospace, monospace' }}>
                        {p.stock_minimo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Últimas 10 ventas" Icon={ReceiptText}>
        {data.ultimas_ventas.length === 0 ? (
          <EmptyState text="Sin ventas registradas" />
        ) : (
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Fecha', 'Ticket', 'Cliente', 'Método', 'Total'].map(h => (
                    <th key={h} style={{ padding: '9px 13px', textAlign: 'left', color: 'var(--text2)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.ultimas_ventas.map(v => (
                  <tr key={v.id} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 13px', color: 'var(--text2)' }}>{formatFecha(v.fecha)}</td>
                    <td style={{ padding: '10px 13px', color: 'var(--text)', fontFamily: 'DM Mono, ui-monospace, monospace' }}>#{v.numero_ticket}</td>
                    <td style={{ padding: '10px 13px', color: 'var(--text2)' }}>{v.cliente || 'Consumidor final'}</td>
                    <td style={{ padding: '10px 13px', color: 'var(--text)' }}>{formatMetodoPago(v.metodo_pago)}</td>
                    <td style={{ padding: '10px 13px', color: 'var(--ac)', fontWeight: 700, fontFamily: 'DM Mono, ui-monospace, monospace' }}>{formatPeso(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
