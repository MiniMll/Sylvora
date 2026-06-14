'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TrendingUp, Receipt, Wallet, ShoppingBag,
  Trophy, AlertTriangle, Package, RefreshCw,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePermissions } from '@/components/PermissionsProvider'
import { formatPeso } from '@/lib/utils'
import {
  getReporteDashboard,
  RANGOS,
  type RangoReporte,
  type ReporteDashboard,
  type ReporteVentaDia,
} from '@/lib/supabase/reportes'

// Helpers para labels adaptativos según rango.
const SUFIJO_RANGO: Record<RangoReporte, string> = {
  hoy:    'hoy',
  semana: '(7 días)',
  mes:    '(30 días)',
}

function labelKpi(base: string, rango: RangoReporte): string {
  return `${base} ${SUFIJO_RANGO[rango]}`
}

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
  // Gating de acceso: solo admin y encargado pueden ver reportes.
  // Cajero queda fuera (sidebar oculta el link, este guard cubre el
  // caso de URL directa / link compartido). RLS bloquea igual la RPC
  // si se intentara llamar — esto es UX, no la fuente de seguridad.
  const { has, loading: permsLoading } = usePermissions()
  const puedeVer = has('reporte.ver_completo')

  const [rango, setRango] = useState<RangoReporte>('semana')
  const [data, setData] = useState<ReporteDashboard | null>(null)
  // cargando = initial full-page spinner; solo true antes del primer
  // fetch exitoso. Una vez que tenemos data, NUNCA volvemos a poner
  // cargando=true → el contenido viejo queda visible mientras refresca.
  const [cargando, setCargando] = useState(true)
  // refreshing = refresh "background". El indicador es sutil: icon
  // gira en el botón + opacity 0.7 en el contenido. No blanquea pantalla.
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  // Timestamp del último fetch exitoso. Usado para el "Hace X min"
  // del header.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // Tick contador que se incrementa cada minuto — solo sirve para
  // forzar re-render del timestamp relativo (sino "Justo ahora" nunca
  // se actualizaría a "Hace 5 min" si el usuario deja la página abierta).
  const [, setTick] = useState(0)

  // Distinguimos initial load vs refresh por un ref (no por estado).
  // El primer useEffect que dispara cargar() debe ser modo "initial"
  // (spinner). Los siguientes (cambio de rango, click en Actualizar)
  // son "refresh" (overlay sutil).
  const isFirstLoad = useRef(true)

  const cargar = useCallback(async (r: RangoReporte, refresh: boolean) => {
    if (refresh) setRefreshing(true)
    else setCargando(true)
    setError(false)

    const res = await getReporteDashboard(r)

    if (!res) {
      if (refresh) {
        // Mantener los datos viejos visibles + toast humano. El user
        // ve qué pasó pero no pierde la pantalla.
        toast.error('No pudimos actualizar el reporte. Probá de nuevo en unos segundos.', { id: 'reportes-refresh' })
        setRefreshing(false)
      } else {
        // Error en el initial load — sin data que mostrar.
        setError(true)
        setCargando(false)
      }
      return
    }

    setData(res)
    setLastUpdated(new Date())
    if (refresh) setRefreshing(false)
    else setCargando(false)
  }, [])

  // Trigger inicial + cuando cambia el rango. El ref marca si fue
  // initial o refresh. Sin esto, cambiar rango también lanzaría
  // el spinner full-page que decidimos evitar.
  //
  // Si el rol no puede ver reportes, evitamos el fetch (RLS igual
  // bloquearía, pero ahorramos round-trip + ruido en logs).
  useEffect(() => {
    if (permsLoading || !puedeVer) return
    const refresh = !isFirstLoad.current
    isFirstLoad.current = false
    cargar(rango, refresh)
  }, [cargar, rango, permsLoading, puedeVer])

  // Re-render del timestamp cada 60s. Solo activo cuando hay data —
  // si la página está en estado loading/error no hace falta.
  useEffect(() => {
    if (!lastUpdated) return
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [lastUpdated])

  const refrescarManual = useCallback(() => {
    if (refreshing || cargando) return
    cargar(rango, true)
  }, [cargar, rango, refreshing, cargando])

  // ── Permisos todavía cargando ──
  if (permsLoading) {
    return (
      <div style={{ padding: 24, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner texto="Cargando reportes..." />
      </div>
    )
  }

  // ── Sin acceso (cajero entra por URL directa) ──
  if (!puedeVer) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,184,0,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <AlertTriangle size={22} color="var(--w)" strokeWidth={1.8} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 6, color: 'var(--text)' }}>Sin acceso a reportes</h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
            Esta sección está disponible para administradores y encargados. Si necesitás ver reportes, pedile a un admin que te cambie el rol.
          </p>
        </div>
      </div>
    )
  }

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
          actions={[{ label: 'Reintentar', onClick: () => cargar(rango, false), variant: 'primary' }]}
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
            {lastUpdated
              ? `Actualizado · ${formatTimestampRelative(lastUpdated)}`
              : 'Lo que está pasando en tu comercio'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={refrescarManual}
            disabled={refreshing || cargando}
            aria-label="Actualizar reportes"
            title="Actualizar"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              border: '1px solid var(--border)',
              background: 'var(--bg2)',
              color: 'var(--text)',
              borderRadius: 8,
              cursor: refreshing || cargando ? 'not-allowed' : 'pointer',
              opacity: refreshing || cargando ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw
              size={13}
              strokeWidth={2.2}
              style={{
                animation: refreshing ? 'spin 0.9s linear infinite' : undefined,
              }}
            />
            <span>Actualizar</span>
          </button>
          <RangoSelector rango={rango} onChange={setRango} disabled={cargando || refreshing} />
        </div>
      </div>

      {/* Wrapper que se desatura levemente durante refresh. NO blanquea
          la pantalla — el cajero sigue viendo los datos viejos mientras
          llegan los nuevos. pointer-events:none evita interacciones
          ambiguas (clickear una fila que está por cambiar). */}
      <div
        aria-busy={refreshing}
        style={{
          opacity: refreshing ? 0.55 : 1,
          pointerEvents: refreshing ? 'none' : 'auto',
          transition: 'opacity 0.18s ease',
        }}
      >
      {/* KPIs — todos dependen del rango. Labels adaptativos:
          "Ventas hoy" / "Ventas (7 días)" / "Ventas (30 días)" etc. */}
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
          label={labelKpi('Ventas', rango)}
          value={formatPeso(kpis.ventas_total)}
          accent="var(--g)"
        />
        <KpiCard
          icon={Receipt}
          label={labelKpi('Tickets', rango)}
          value={String(kpis.tickets_total)}
          accent="var(--ac)"
        />
        <KpiCard
          icon={TrendingUp}
          label={labelKpi('Ticket promedio', rango)}
          value={kpis.ticket_promedio != null ? formatPeso(kpis.ticket_promedio) : '—'}
          accent="var(--o)"
          subtle={kpis.ticket_promedio == null ? 'Sin ventas en el período' : undefined}
        />
        <KpiCard
          icon={ShoppingBag}
          label={labelKpi('Ítems vendidos', rango)}
          value={String(kpis.unidades_total)}
          accent="var(--w)"
        />
        <KpiCard
          icon={Receipt}
          label={labelKpi('Gastos', rango)}
          value={formatPeso(kpis.gastos_total)}
          accent="var(--r)"
        />
        <KpiCard
          icon={TrendingUp}
          label={labelKpi('Ganancia', rango)}
          value={formatPeso(kpis.ganancia_estimada)}
          accent={kpis.ganancia_estimada < 0 ? 'var(--r)' : 'var(--g)'}
          subtle="Ventas menos gastos"
        />
      </div>

      {/* Gráfico de ventas por día — escondido cuando rango='hoy'
          (1 sola barra queda raro). 7 días = 7 barras, 30 días = 30. */}
      {rango !== 'hoy' && (
        <div style={{ marginBottom: 24 }}>
          <Card>
            <SectionHeader
              icon={BarChart3}
              title="Ventas por día"
              subtitle={`Total facturado · ${RANGOS.find(r => r.id === rango)?.label.toLowerCase()}`}
            />
            <VentasPorDiaChart data={data.ventas_por_dia} rango={rango} />
          </Card>
        </div>
      )}

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
      {/* fin wrapper de opacidad-mientras-refresca */}
    </div>
  )
}

// ── Helper: timestamp relativo en formato humano AR ────────────────
// Usa el "tick" implícito del componente padre (se re-render cada 60s
// gracias a setTick) para que "Justo ahora" pase a "Hace 5 min" sin
// que el usuario tenga que tocar nada.
function formatTimestampRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const minutos = Math.floor(diffMs / 60_000)
  if (minutos < 1) return 'Justo ahora'
  if (minutos === 1) return 'Hace 1 min'
  if (minutos < 60) return `Hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas === 1) return 'Hace 1 h'
  if (horas < 24) return `Hace ${horas} h`
  return 'Hace más de un día'
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

// ─────────────────────────────────────────────────────────────────────
// VentasPorDiaChart — gráfico de barras con recharts.
//
// Formato del eje X:
//   - rango='semana' → "Lun", "Mar", ... (3 chars, cabe holgado).
//   - rango='mes'    → "DD/MM" (más compacto que el día). Mostramos un
//     tick cada 5 días para no apilar labels.
// Eje Y: total en $K para que no satura.
// Tooltip: fecha completa + total + tickets.
// Altura: 200 desktop / 160 mobile. ResponsiveContainer adapta width.
// Empty state: si todas las barras son 0, mostramos texto en vez
// de un gráfico plano feo.
// ─────────────────────────────────────────────────────────────────────

interface VentasPorDiaChartProps {
  data: ReporteVentaDia[]
  rango: RangoReporte
}

function VentasPorDiaChart({ data, rango }: VentasPorDiaChartProps) {
  const totalRango = data.reduce((s, d) => s + Number(d.total), 0)

  if (totalRango === 0) {
    return (
      <div style={{
        height: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text2)',
        fontSize: 13,
      }}>
        Sin ventas en este período.
      </div>
    )
  }

  // Precomputar las labels del eje X una vez por render.
  const chartData = data.map(d => ({
    ...d,
    // Force a numeric for recharts.
    total: Number(d.total),
    tickets: Number(d.tickets),
    label: formatFechaEjeX(d.fecha, rango),
  }))

  // Para rango='mes' (30 puntos), mostramos 1 cada 5 ticks para que no
  // se apilen los labels.
  const intervalTicks = rango === 'mes' ? 4 : 0

  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10.5, fill: 'var(--text2)' }}
            axisLine={false}
            tickLine={false}
            interval={intervalTicks}
          />
          <YAxis
            tick={{ fontSize: 10.5, fill: 'var(--text2)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v === 0 ? '0' : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
            }
          />
          <Tooltip
            cursor={{ fill: 'rgba(91,76,255,0.06)' }}
            contentStyle={{
              borderRadius: 10,
              fontSize: 12,
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-md)',
              fontFamily: 'DM Sans, sans-serif',
              background: 'var(--card)',
              color: 'var(--text)',
              padding: '8px 12px',
            }}
            labelFormatter={(_label, payload) => {
              const row = payload?.[0]?.payload as (ReporteVentaDia & { label: string }) | undefined
              return row ? formatFechaTooltip(row.fecha) : ''
            }}
            formatter={(value, name) => {
              if (name === 'total') return [formatPeso(Number(value)), 'Ventas']
              return [String(value), String(name)]
            }}
          />
          <Bar
            dataKey="total"
            fill="var(--ac)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const DIAS_SEMANA_ABR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Para semana muestra "Lun"/"Mar"/etc., para mes "DD/MM". */
function formatFechaEjeX(fechaYmd: string, rango: RangoReporte): string {
  // fechaYmd llega como YYYY-MM-DD desde la RPC. Parseamos manual
  // para evitar problemas de TZ del Date constructor con strings.
  const [y, m, d] = fechaYmd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (rango === 'semana') {
    return DIAS_SEMANA_ABR[date.getDay()]
  }
  // mes: DD/MM
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** Para el tooltip: "Lunes 15 de junio". */
function formatFechaTooltip(fechaYmd: string): string {
  const [y, m, d] = fechaYmd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dia = DIAS_SEMANA_ABR[date.getDay()]
  const mes = MESES_ABR[m - 1]
  return `${dia} ${d} de ${mes}`
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
