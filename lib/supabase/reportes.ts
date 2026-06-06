import { getBrowserClient } from './_base'

// Capa cliente para el dashboard de /reportes.
//
// Una sola RPC server-side (get_reporte_dashboard) devuelve KPIs,
// top productos y stock crítico en un único round-trip. Ver
// scripts/migration-reportes-rpc.sql para la implementación de la RPC.
//
// Diseño:
//   - Cero lógica de fechas en el cliente — la RPC computa todo según
//     su TZ. Default 'America/Argentina/Buenos_Aires'.
//   - Snake_case en los tipos para matchear el JSON de la RPC sin
//     transformaciones. Coherente con el resto de types/database.ts.
//   - Sin SWR/react-query — useState + useEffect en la página alcanza
//     para V1. Si en V2 agregamos auto-refresh + revalidación, ahí sí.

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
  /** SUM(total) ventas completadas HOY (en TZ del comercio). Fijo,
   *  independiente del rango. */
  ventas_hoy: number
  /** SUM(total) ventas completadas en el mes calendario actual.
   *  Fijo, independiente del rango. */
  ventas_mes: number
  /** COUNT de ventas completadas EN EL RANGO. */
  tickets_total: number
  /** COUNT de ventas completadas HOY. Fijo. */
  tickets_hoy: number
  /** ventas_hoy / tickets_hoy. NULL si tickets_hoy = 0. */
  ticket_promedio_hoy: number | null
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
  top_productos: ReporteTopProducto[]
  stock_critico: ReporteStockCritico[]
}

// ───── Cliente ──────────────────────────────────────────────────────

/** Trae el dashboard de reportes en una sola request.
 *  Devuelve null si la RPC falla (red, no_session, etc.) — el caller
 *  debería mostrar un toast de error. El detalle del error va al
 *  console.error para inspección.
 *
 *  El TZ default coincide con el que usa la RPC. Lo expongo como
 *  parámetro opcional por si en algún test queremos override. */
export async function getReporteDashboard(
  rango: RangoReporte,
  tz: string = 'America/Argentina/Buenos_Aires',
): Promise<ReporteDashboard | null> {
  const supabase = getBrowserClient()
  const { data, error } = await supabase.rpc('get_reporte_dashboard', {
    p_rango: rango,
    p_tz:    tz,
  })
  if (error) {
    console.error('[getReporteDashboard] RPC falló:', error)
    return null
  }
  return data as ReporteDashboard
}
