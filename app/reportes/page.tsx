'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  TrendingUp, Receipt, Wallet, Calendar,
  Trophy, AlertTriangle, Package,
  type LucideIcon,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatPeso } from '@/lib/utils'
import {
  getReporteDashboard,
  RANGOS,
  type RangoReporte,
  type ReporteDashboard,
} from '@/lib/supabase/reportes'

// /reportes V1 — dashboard de información accionable.
//
// Filosofía declarada en el sprint feat/reportes-v1: NO enterprise,
// NO gráficos, NO comparativas. Solo lo que el dueño de un kiosco/
// almacén AR mira con frecuencia:
//   - 4 KPIs principales (ventas hoy, mes, tickets hoy, ticket promedio)
//   - Top 10 productos por facturación del rango seleccionado
//   - Stock crítico (productos debajo de su mínimo configurado)
//
// Decisiones del sprint que se reflejan en este código:
//   - KPIs hoy/mes son FIJOS (no dependen del rango). El rango afecta
//     solo "Productos más vendidos".
//   - Top ordenado por facturación DESC.
//   - Stock crítico excluye productos con stock_minimo = 0 (server-side).
//
// Toda la lógica pesada está en la RPC get_reporte_dashboard (commit
// anterior). Acá solo render + filtro de rango.

export default function ReportesPage() {
  const [rango, setRango] = useState<RangoReporte>('semana')
  const [data, setData] = useState<ReporteDashboard | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)

  const cargar = useCallback(async (r: RangoReporte) => {
    setCargando(true)
    setError(false)
    const res = await getReporteDashboard(r)
    if (!res) {
      setError(true)
      setCargando(false)
      return
    }
    setData(res)
    setCargando(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar(rango)
  }, [cargar, rango])

  // ── Loading inicial — todavía no hay data ──
  if (cargando && !data) {
    return (
      <div style={{ padding: 24, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner texto="Cargando reportes..." />
      </div>
    )
  }

  // ── Error de la RPC ──
  if (error && !data) {
    return (
      <div style={{ padding: 24, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon={<AlertTriangle size={20} color="var(--r)" strokeWidth={2} />}
          title="No pudimos cargar los reportes."
          description="Revisá tu conexión y volvé a intentarlo."
          actions={[{ label: 'Reintentar', onClick: () => cargar(rango), variant: 'primary' }]}
        />
      </div>
    )
  }

  if (!data) return null

  const { kpis, top_productos, stock_critico } = data
  const sinDatosRango = top_productos.length === 0 && kpis.tickets_total === 0

  return (
    <div className="page-in" style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Reportes
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>
            Lo que está pasando en tu comercio
          </p>
        </div>

        <RangoSelector rango={rango} onChange={setRango} disabled={cargando} />
      </div>

      {/* KPIs — siempre visibles, no dependen del rango. */}
      <div
        className="reportes-kpis"
        style={{
          display: 'grid',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard
          icon={Wallet}
          label="Ventas hoy"
          value={formatPeso(kpis.ventas_hoy)}
          accent="var(--g)"
        />
        <KpiCard
          icon={Calendar}
          label="Ventas este mes"
          value={formatPeso(kpis.ventas_mes)}
          accent="var(--ac)"
        />
        <KpiCard
          icon={Receipt}
          label="Tickets hoy"
          value={String(kpis.tickets_hoy)}
          accent="var(--o)"
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket promedio hoy"
          value={kpis.ticket_promedio_hoy != null ? formatPeso(kpis.ticket_promedio_hoy) : '—'}
          accent="var(--w)"
          subtle={kpis.ticket_promedio_hoy == null ? 'Sin ventas hoy todavía' : undefined}
        />
      </div>

      {/* Dos columnas en desktop, stack en mobile */}
      <div
        className="reportes-grid"
        style={{
          display: 'grid',
          gap: 16,
        }}
      >
        {/* ── Top productos ── */}
        <Card>
          <SectionHeader
            icon={Trophy}
            title="Productos más vendidos"
            subtitle={`Por facturación · ${RANGOS.find(r => r.id === rango)?.label.toLowerCase()}`}
          />

          {top_productos.length === 0 ? (
            <EmptyMini
              icon={Trophy}
              text={
                sinDatosRango
                  ? 'No hubo ventas en este período. Probá un rango más amplio.'
                  : 'Sin datos para este rango.'
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Producto</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Cantidad</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Facturación</th>
                  </tr>
                </thead>
                <tbody>
                  {top_productos.map((p, idx) => (
                    <tr key={`${p.producto_id ?? 'unknown'}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, color: 'var(--text)', fontWeight: 500 }}>
                        {p.nombre}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>
                        {Number(p.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
                        {formatPeso(p.facturacion)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Stock crítico ── */}
        <Card>
          <SectionHeader
            icon={AlertTriangle}
            title="Stock crítico"
            subtitle="Productos debajo del mínimo configurado"
          />

          {stock_critico.length === 0 ? (
            <EmptyMini
              icon={Package}
              text="No hay productos por debajo del mínimo. 👍"
              positive
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Producto</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Stock</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {stock_critico.map(p => {
                    const ratio = p.stock_minimo > 0 ? p.stock_actual / p.stock_minimo : 1
                    const nivel: 'agotado' | 'critico' | 'bajo' =
                      p.stock_actual <= 0 ? 'agotado'
                      : ratio <= 0.5 ? 'critico'
                      : 'bajo'
                    const colorBadge =
                      nivel === 'agotado' ? 'var(--r)'
                      : nivel === 'critico' ? 'var(--o)'
                      : 'var(--w)'
                    return (
                      <tr key={p.producto_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...tdStyle, color: 'var(--text)', fontWeight: 500 }}>
                          {p.nombre}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11.5,
                            fontWeight: 700,
                            fontFamily: 'DM Mono, monospace',
                            background: colorBadge,
                            color: '#fff',
                            minWidth: 32,
                            justifyContent: 'center',
                          }}>
                            {Number(p.stock_actual).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>
                          {Number(p.stock_minimo).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-componentes locales
// ─────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: string
  accent: string
  subtle?: string
}

function KpiCard({ icon: Icon, label, value, accent, subtle }: KpiCardProps) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600, letterSpacing: '0.01em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{
          width: 28, height: 28,
          borderRadius: 8,
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={accent} strokeWidth={2.2} />
        </div>
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--text)',
        letterSpacing: '-0.015em',
        fontFamily: 'DM Mono, monospace',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {subtle && (
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{subtle}</div>
      )}
    </div>
  )
}

interface RangoSelectorProps {
  rango: RangoReporte
  onChange: (r: RangoReporte) => void
  disabled?: boolean
}

function RangoSelector({ rango, onChange, disabled }: RangoSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Rango del reporte"
      style={{
        display: 'inline-flex',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 3,
        gap: 2,
      }}
    >
      {RANGOS.map(r => {
        const active = r.id === rango
        return (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.id)}
            disabled={disabled}
            style={{
              padding: '6px 12px',
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              border: 'none',
              background: active ? 'var(--card)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text2)',
              borderRadius: 8,
              cursor: disabled ? 'not-allowed' : 'pointer',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              opacity: disabled ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={15} color="var(--ac)" strokeWidth={2.2} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          {title}
        </h3>
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{subtitle}</div>
      )}
    </div>
  )
}

function EmptyMini({ icon: Icon, text, positive }: { icon: LucideIcon; text: string; positive?: boolean }) {
  return (
    <div style={{
      padding: '24px 16px',
      textAlign: 'center',
      color: positive ? 'var(--g)' : 'var(--text2)',
      fontSize: 13,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      <Icon size={20} strokeWidth={1.8} color={positive ? 'var(--g)' : 'var(--text2)'} />
      <span>{text}</span>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text2)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 10px',
  verticalAlign: 'middle',
}
