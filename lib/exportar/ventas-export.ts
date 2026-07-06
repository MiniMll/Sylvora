// Orquestación de la traída de ventas para exportación, con guarda de
// tamaño. Separa la política de exportación (cuántas filas, qué hacer
// si son demasiadas) de la generación de PDF/Excel de la página.
//
// PURO respecto de Supabase: recibe el fetcher (getVentas) por parámetro
// → testeable sin browser client.

import type { Venta } from '@/types/database'
import { desdePeriodoExport, type PeriodoExport } from './periodo'

/**
 * Límite de protección V1: máximo de ventas por exportación.
 *
 * NO es un truncado. La generación de PDF/Excel corre en el BROWSER
 * (jsPDF / xlsx); traer decenas de miles de ventas congela la pestaña.
 * Si un período supera este número, la exportación se CANCELA — nunca
 * generamos un archivo financiero incompleto — y se le pide al usuario
 * un rango más corto.
 *
 * Se consulta MAX+1 para detectar el exceso sin traer de más. Este cap
 * se podrá subir (o quitar) cuando la generación se mueva a server-side
 * con streaming, que es la evolución natural (ver docs/backlog.md).
 */
export const EXPORT_MAX_VENTAS = 5000

type FetchVentas = (opts: {
  desde?: Date
  hasta?: Date
  limit?: number
  conItems?: boolean
}) => Promise<Venta[]>

export type VentasExportResult =
  | { ok: true; ventas: Venta[] }
  | { ok: false; motivo: 'periodo_demasiado_grande' }

/**
 * Trae las ventas del período para exportar, sin items (los exports no
 * los usan) y con la guarda de tamaño. Si el período excede
 * EXPORT_MAX_VENTAS, devuelve ok:false y NO hay que generar el archivo.
 */
export async function traerVentasParaExport(
  fetchVentas: FetchVentas,
  periodo: PeriodoExport,
  now: Date = new Date(),
): Promise<VentasExportResult> {
  const ventas = await fetchVentas({
    desde: desdePeriodoExport(periodo, now),
    limit: EXPORT_MAX_VENTAS + 1,
    conItems: false,
  })
  if (ventas.length > EXPORT_MAX_VENTAS) {
    return { ok: false, motivo: 'periodo_demasiado_grande' }
  }
  return { ok: true, ventas }
}
