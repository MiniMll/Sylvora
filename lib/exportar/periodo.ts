// Rango de exportación: mapea el selector de período de /exportar a
// una fecha "desde" (instante) para filtrar ventas.
//
// Reusa la infraestructura de fechas del día operativo para convertir
// una fecha calendario AR (YYYY-MM-DD) al instante de inicio de día en
// huso Argentina — misma fuente de verdad que usa el resto de Sylvora,
// sin hardcodear el offset -03:00 en varios lugares.
//
// PURO: sin Supabase, sin React. Testeable con reloj inyectable.

import {
  fechaLocalArgentina,
  mesLocalArgentina,
  sumarDiasYmd,
  obtenerRangoDiaOperativo,
} from '@/lib/operacion/diaOperativo'

export type PeriodoExport = 'hoy' | 'semana' | 'mes' | 'todo'

/** Config 24hs: usamos obtenerRangoDiaOperativo solo como conversor
 *  "fecha calendario AR → instante de inicio de día". Las exportaciones
 *  razonan en días calendario, no en el día operativo configurable. */
const CFG_CALENDARIO = { caja_24hs: true }

/**
 * Devuelve el `desde` (Date) para el período elegido, o undefined para
 * 'todo' (sin cota inferior). El límite superior siempre es "ahora"
 * (todas las ventas existen hasta el presente), así que no se necesita
 * `hasta`.
 *
 * - hoy    → inicio del día calendario AR de hoy.
 * - semana → inicio del día de hace 6 días (7 días incluyendo hoy).
 * - mes    → inicio del día 1 del mes calendario AR actual.
 * - todo   → undefined.
 */
export function desdePeriodoExport(
  periodo: PeriodoExport,
  now: Date = new Date(),
): Date | undefined {
  const hoyYmd = fechaLocalArgentina(now)
  switch (periodo) {
    case 'hoy':
      return obtenerRangoDiaOperativo(hoyYmd, CFG_CALENDARIO).inicio
    case 'semana':
      return obtenerRangoDiaOperativo(sumarDiasYmd(hoyYmd, -6), CFG_CALENDARIO).inicio
    case 'mes':
      return obtenerRangoDiaOperativo(mesLocalArgentina(now), CFG_CALENDARIO).inicio
    case 'todo':
      return undefined
  }
}
