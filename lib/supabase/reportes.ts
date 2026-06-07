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
  /** COUNT de ventas completadas EN EL RANGO. */
  tickets_total: number
  /** ventas_total / tickets_total. NULL si tickets_total = 0. */
  ticket_promedio: number | null
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
