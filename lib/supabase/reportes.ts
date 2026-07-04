import { getBrowserClient, getComercio } from './_base'
import {
  obtenerDiaOperativoActual,
  obtenerRangoDiaOperativo,
  sumarDiasYmd,
} from '@/lib/operacion/diaOperativo'

// Capa cliente para el dashboard de /reportes.
//
// Una sola RPC server-side (get_reporte_dashboard V3) devuelve KPIs,
// top productos y stock crítico en un único round-trip. Ver
// scripts/migration-reportes-dia-operativo.sql para la RPC.
//
// Diseño (V3 — día operativo):
//   - La RPC NO sabe qué significa "hoy". TODOS los rangos se calculan
//     acá con lib/operacion/diaOperativo.ts (misma fuente que Caja y
//     Dashboard) y se pasan como parámetros explícitos.
//   - La serie "ventas por día" usa buckets de días OPERATIVOS: para
//     un nocturno 18-02, el bucket del viernes cubre [vie 18:00,
//     sáb 02:00) — imposible con date_trunc server-side.
//   - Snake_case en los tipos para matchear el JSON de la RPC.
//   - Sin SWR/react-query — useState + useEffect en la página alcanza.

// ───── Rango ────────────────────────────────────────────────────────

export type RangoReporte = 'hoy' | 'semana' | 'mes'

export const RANGOS: { id: RangoReporte; label: string }[] = [
  { id: 'hoy',    label: 'Hoy'           },
  { id: 'semana', label: 'Últimos 7 días' },
  { id: 'mes',    label: 'Últimos 30 días'},
]

// ───── Tipos de respuesta ───────────────────────────────────────────

export interface ReporteKpis {
  /** SUM(total) de ventas completadas EN EL RANGO. */
  ventas_total: number
  /** COUNT de ventas completadas EN EL RANGO. */
  tickets_total: number
  /** ventas_total / tickets_total. NULL si tickets_total = 0. */
  ticket_promedio: number | null
  /** SUM(gastos.monto) en el rango. */
  gastos_total: number
  /** ventas_total - gastos_total. Estimado simple V1. */
  ganancia_estimada: number
  /** SUM(items_venta.cantidad) en el rango.
   *  Para productos por unidad cuenta unidades exactas. Para productos
   *  por peso (kg/L/m), cantidad típicamente es 1 (el peso real va en
   *  peso_kg), así que para esos casos la métrica representa "líneas
   *  en tickets". Para kioscos AR (95% por unidad) es preciso —
   *  trade-off documentado para V1. */
  unidades_total: number
}

/** Una fila de la serie temporal "ventas por día" del rango.
 *  Días sin ventas vienen con total=0 y tickets=0 (zero-filled
 *  server-side con generate_series). */
export interface ReporteVentaDia {
  /** Fecha en formato YYYY-MM-DD en la TZ del comercio. */
  fecha: string
  total: number
  tickets: number
}

export interface ReporteTopProducto {
  /** Null si el producto original fue eliminado (FK SET NULL). */
  producto_id: string | null
  /** Snapshot del nombre al momento de cada venta (items_venta.
   *  nombre_producto). Productos renombrados pueden aparecer
   *  duplicados — caso raro, V1 lo acepta. */
  nombre: string
  /** SUM(items_venta.cantidad). Para productos por peso, esto suma
   *  el campo "cantidad" (típicamente 1 por línea), no los kg
   *  reales — la línea ya tiene el peso en el nombre snapshot. */
  cantidad: number
  /** SUM(items_venta.subtotal). Lo que facturó este producto. */
  facturacion: number
}

export interface ReporteStockCritico {
  producto_id: string
  nombre: string
  stock_actual: number
  stock_minimo: number
  unidad_venta: string
}

export interface ReporteRango {
  tipo: RangoReporte
  desde: string
  hasta: string
  tz: string
}

export interface ReporteDashboard {
  rango: ReporteRango
  kpis: ReporteKpis
  /** Serie diaria de ventas del rango. Longitud:
   *    rango='hoy'    → 1
   *    rango='semana' → 7
   *    rango='mes'    → 30
   *  Días sin ventas vienen en 0 (zero-filled). */
  ventas_por_dia: ReporteVentaDia[]
  top_productos: ReporteTopProducto[]
  stock_critico: ReporteStockCritico[]
}

// ───── Construcción de rangos (única definición de "día") ──────────

const DIAS_POR_RANGO: Record<RangoReporte, number> = {
  hoy: 1,
  semana: 7,
  mes: 30,
}

export interface RangosReporte {
  /** Fecha operativa del día actual — la misma que ven Caja y Dashboard. */
  fechaOperativa: string
  /** Inicio del rango completo (inicio del primer día operativo). */
  desde: Date
  /** Fin del rango completo (fin del día operativo actual). EXCLUSIVE. */
  hasta: Date
  /** Buckets [inicio, fin) de cada día operativo, para la serie del
   *  gráfico. Longitud = 1 | 7 | 30 según el rango. */
  dias: Array<{ fecha: string; inicio: Date; fin: Date }>
  /** Rango de fechas operativas para gastos (columna DATE, inclusive). */
  gastosDesde: string
  gastosHasta: string
}

/**
 * Calcula todos los rangos que la RPC V3 recibe como parámetros.
 *
 * Función PURA (settings + now → rangos) y exportada a propósito:
 * el smoke de consistencia la usa para verificar que la fechaOperativa
 * de Reportes coincide con la de Caja/Dashboard para el mismo
 * timestamp — los tres módulos derivan del mismo helper, y este
 * export permite testear la derivación de Reportes sin mockear
 * Supabase.
 */
export function construirRangosReporte(
  settings: unknown,
  rango: RangoReporte,
  now: Date = new Date(),
): RangosReporte {
  const actual = obtenerDiaOperativoActual(settings, now)
  const n = DIAS_POR_RANGO[rango]

  const dias: Array<{ fecha: string; inicio: Date; fin: Date }> = []
  for (let i = n - 1; i >= 0; i--) {
    const fecha = sumarDiasYmd(actual.fechaOperativa, -i)
    const r = obtenerRangoDiaOperativo(fecha, settings)
    dias.push({ fecha, inicio: r.inicio, fin: r.fin })
  }

  return {
    fechaOperativa: actual.fechaOperativa,
    desde: dias[0].inicio,
    hasta: actual.fin,
    dias,
    gastosDesde: dias[0].fecha,
    gastosHasta: actual.fechaOperativa,
  }
}

// ───── Cliente ──────────────────────────────────────────────────────

/** Trae el dashboard de reportes en una sola request.
 *  Devuelve null si la RPC falla (red, no_session, etc.) — el caller
 *  debería mostrar un toast de error. El detalle del error va al
 *  console.error para inspección.
 *
 *  V3: los rangos se calculan acá (día operativo del comercio) y la
 *  RPC solo agrega dentro de ellos. */
export async function getReporteDashboard(
  rango: RangoReporte,
): Promise<ReporteDashboard | null> {
  const supabase = getBrowserClient()

  const comercio = await getComercio()
  const rangos = construirRangosReporte(comercio?.settings ?? null, rango)

  const { data, error } = await supabase.rpc('get_reporte_dashboard', {
    p_rango_tipo:   rango,
    p_desde:        rangos.desde.toISOString(),
    p_hasta:        rangos.hasta.toISOString(),
    p_dias:         rangos.dias.map(d => ({
      fecha:  d.fecha,
      inicio: d.inicio.toISOString(),
      fin:    d.fin.toISOString(),
    })),
    p_gastos_desde: rangos.gastosDesde,
    p_gastos_hasta: rangos.gastosHasta,
  })
  if (error) {
    console.error('[getReporteDashboard] RPC falló:', error)
    return null
  }
  return data as ReporteDashboard
}
