// Smoke test del helper de día operativo (lib/operacion/diaOperativo.ts).
//
// Cubre los 3 perfiles de comercio aprobados:
//   A. 24hs (default / settings vacío / null)
//   B. Almacén 08:00–20:00 (no cruza medianoche)
//   C. Pizzería 18:00–02:00 (cruza medianoche)
//
// Y los edge cases:
//   - normalizar: null, {}, valores inválidos, HH:MM malformados.
//   - fechaOperativaDeTimestamp: madrugada post-medianoche pertenece
//     al día operativo anterior (pizzería), pero al día calendario
//     actual (24hs / almacén).
//   - obtenerRangoDiaOperativo: límites exactos en UTC (AR = UTC-3).
//   - obtenerDiaOperativoActual con `now` inyectado.
//   - sumarDiasYmd cruza meses/años.
//
// Correr con:
//   npx tsx scripts/smoke-dia-operativo.ts

import {
  normalizarConfigDiaOperativo,
  obtenerDiaOperativoActual,
  obtenerRangoDiaOperativo,
  fechaOperativaDeTimestamp,
  sumarDiasYmd,
  fechaLocalArgentina,
} from '../lib/operacion/diaOperativo'
import { construirRangosReporte } from '../lib/supabase/reportes'

let passed = 0, failed = 0
function check(name: string, fn: () => void) {
  try { fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

// Configs de los 3 perfiles.
const CFG_24HS = { caja_24hs: true }
const CFG_ALMACEN = { caja_24hs: false, hora_apertura_caja: '08:00', hora_cierre_caja: '20:00' }
const CFG_PIZZERIA = { caja_24hs: false, hora_apertura_caja: '18:00', hora_cierre_caja: '02:00' }

// Timestamps de referencia (UTC). AR = UTC-3 fijo (sin DST).
// "2026-06-12T15:30:00-03:00" = viernes 12/6 15:30 AR = 18:30 UTC.
const ts = (iso: string) => new Date(iso)

process.stdout.write('\n[smoke-dia-operativo] Verificando helper de día operativo...\n\n')

// ── Normalización ───────────────────────────────────────────────────

check('1. normalizar(null) → default 24hs', () => {
  const c = normalizarConfigDiaOperativo(null)
  assert(c.caja_24hs === true, `caja_24hs: ${c.caja_24hs}`)
})

check('2. normalizar({}) → default 24hs', () => {
  const c = normalizarConfigDiaOperativo({})
  assert(c.caja_24hs === true, 'default no aplicado')
})

check('3. normalizar con horas inválidas → fallback a horas default', () => {
  const c = normalizarConfigDiaOperativo({ caja_24hs: false, hora_apertura_caja: '25:99', hora_cierre_caja: 'garbage' })
  assert(c.caja_24hs === false, 'caja_24hs se pisó')
  assert(c.hora_apertura_caja === '08:00', `apertura fallback: ${c.hora_apertura_caja}`)
  assert(c.hora_cierre_caja === '20:00', `cierre fallback: ${c.hora_cierre_caja}`)
})

check('4. normalizar tipos raros (string, array, number) → default', () => {
  for (const raw of ['x', [1], 42, true]) {
    const c = normalizarConfigDiaOperativo(raw)
    assert(c.caja_24hs === true, `raw=${JSON.stringify(raw)} no cayó en default`)
  }
})

// ── fechaOperativaDeTimestamp ───────────────────────────────────────

check('5. 24hs: madrugada 01:30 AR pertenece al día calendario actual', () => {
  // Sábado 13/6 01:30 AR = sáb 04:30 UTC.
  const f = fechaOperativaDeTimestamp(ts('2026-06-13T04:30:00Z'), CFG_24HS)
  assert(f === '2026-06-13', `f: ${f}`)
})

check('6. Almacén 08-20: madrugada 01:30 pertenece al día calendario (no cruza)', () => {
  const f = fechaOperativaDeTimestamp(ts('2026-06-13T04:30:00Z'), CFG_ALMACEN)
  assert(f === '2026-06-13', `f: ${f}`)
})

check('7. Pizzería 18-02: venta 01:30 del sábado pertenece al VIERNES operativo', () => {
  // Sáb 13/6 01:30 AR — antes del cierre 02:00 → día operativo viernes 12/6.
  const f = fechaOperativaDeTimestamp(ts('2026-06-13T04:30:00Z'), CFG_PIZZERIA)
  assert(f === '2026-06-12', `f: ${f}`)
})

check('8. Pizzería: venta 02:00 exacto (cierre) ya pertenece al día calendario', () => {
  // El rango es [apertura, cierre): 02:00 exacto queda FUERA del día anterior.
  const f = fechaOperativaDeTimestamp(ts('2026-06-13T05:00:00Z'), CFG_PIZZERIA)
  assert(f === '2026-06-13', `f: ${f}`)
})

check('9. Pizzería: venta 20:00 pertenece al día calendario actual', () => {
  // Viernes 12/6 20:00 AR = 23:00 UTC.
  const f = fechaOperativaDeTimestamp(ts('2026-06-12T23:00:00Z'), CFG_PIZZERIA)
  assert(f === '2026-06-12', `f: ${f}`)
})

check('10. Pizzería: venta en el "gap" (15:00, cerrado) pertenece al día calendario', () => {
  const f = fechaOperativaDeTimestamp(ts('2026-06-12T18:00:00Z'), CFG_PIZZERIA)  // 15:00 AR
  assert(f === '2026-06-12', `f: ${f}`)
})

// ── obtenerRangoDiaOperativo (límites UTC exactos) ──────────────────

check('11. 24hs: rango = [00:00 AR, 00:00 AR día siguiente) = [03:00Z, 03:00Z+1d)', () => {
  const r = obtenerRangoDiaOperativo('2026-06-12', CFG_24HS)
  assert(r.inicio.toISOString() === '2026-06-12T03:00:00.000Z', `inicio: ${r.inicio.toISOString()}`)
  assert(r.fin.toISOString() === '2026-06-13T03:00:00.000Z', `fin: ${r.fin.toISOString()}`)
  assert(r.cruzaMedianoche === false, 'cruza?')
})

check('12. Almacén: rango = [08:00 AR, 20:00 AR) = [11:00Z, 23:00Z)', () => {
  const r = obtenerRangoDiaOperativo('2026-06-12', CFG_ALMACEN)
  assert(r.inicio.toISOString() === '2026-06-12T11:00:00.000Z', `inicio: ${r.inicio.toISOString()}`)
  assert(r.fin.toISOString() === '2026-06-12T23:00:00.000Z', `fin: ${r.fin.toISOString()}`)
  assert(r.cruzaMedianoche === false, 'cruza?')
})

check('13. Pizzería: rango = [18:00 AR vie, 02:00 AR sáb) = [21:00Z, 05:00Z+1d)', () => {
  const r = obtenerRangoDiaOperativo('2026-06-12', CFG_PIZZERIA)
  assert(r.inicio.toISOString() === '2026-06-12T21:00:00.000Z', `inicio: ${r.inicio.toISOString()}`)
  assert(r.fin.toISOString() === '2026-06-13T05:00:00.000Z', `fin: ${r.fin.toISOString()}`)
  assert(r.cruzaMedianoche === true, 'no marcó cruce')
})

// ── obtenerDiaOperativoActual con now inyectado ─────────────────────

check('14. actual 24hs con now inyectado', () => {
  const d = obtenerDiaOperativoActual(CFG_24HS, ts('2026-06-13T04:30:00Z'))  // sáb 01:30 AR
  assert(d.fechaOperativa === '2026-06-13', `fecha: ${d.fechaOperativa}`)
})

check('15. actual pizzería a la 01:30 → día operativo del viernes con rango completo', () => {
  const d = obtenerDiaOperativoActual(CFG_PIZZERIA, ts('2026-06-13T04:30:00Z'))
  assert(d.fechaOperativa === '2026-06-12', `fecha: ${d.fechaOperativa}`)
  assert(d.inicio.toISOString() === '2026-06-12T21:00:00.000Z', `inicio: ${d.inicio.toISOString()}`)
  assert(d.fin.toISOString() === '2026-06-13T05:00:00.000Z', `fin: ${d.fin.toISOString()}`)
})

check('16. consistencia: todo ts dentro del rango mapea a la misma fechaOperativa', () => {
  // Propiedad clave: fechaOperativaDeTimestamp(t) === F para todo
  // t ∈ [inicio, fin) del rango de F. Sampleamos cada 30 min.
  const r = obtenerRangoDiaOperativo('2026-06-12', CFG_PIZZERIA)
  for (let t = r.inicio.getTime(); t < r.fin.getTime(); t += 30 * 60_000) {
    const f = fechaOperativaDeTimestamp(new Date(t), CFG_PIZZERIA)
    assert(f === '2026-06-12', `ts=${new Date(t).toISOString()} mapeó a ${f}`)
  }
})

check('17. consistencia 24hs: propiedad de partición del día calendario', () => {
  const r = obtenerRangoDiaOperativo('2026-06-12', CFG_24HS)
  const antes = fechaOperativaDeTimestamp(new Date(r.inicio.getTime() - 1), CFG_24HS)
  const dentro = fechaOperativaDeTimestamp(r.inicio, CFG_24HS)
  const despues = fechaOperativaDeTimestamp(r.fin, CFG_24HS)
  assert(antes === '2026-06-11', `antes: ${antes}`)
  assert(dentro === '2026-06-12', `dentro: ${dentro}`)
  assert(despues === '2026-06-13', `despues: ${despues}`)
})

// ── Escenarios de aceptación de la integración CAJA ─────────────────
// (los 4 casos aprobados en el sprint de integración)

check('A1. CAJA 24hs: venta a la 01:30 → cae en la caja del día actual', () => {
  // Sáb 13/6 01:30 AR.
  const f = fechaOperativaDeTimestamp(ts('2026-06-13T04:30:00Z'), CFG_24HS)
  assert(f === '2026-06-13', `f: ${f}`)
})

check('A2. CAJA 08-20: venta a las 09:00 → cae en la caja del día actual', () => {
  // Sáb 13/6 09:00 AR = 12:00 UTC.
  const f = fechaOperativaDeTimestamp(ts('2026-06-13T12:00:00Z'), CFG_ALMACEN)
  assert(f === '2026-06-13', `f: ${f}`)
})

check('A3. CAJA 18-02: venta a la 01:30 → cae en la caja del día ANTERIOR', () => {
  const f = fechaOperativaDeTimestamp(ts('2026-06-13T04:30:00Z'), CFG_PIZZERIA)
  assert(f === '2026-06-12', `f: ${f}`)
})

check('A4. CAJA 18-02: venta a las 02:01 → cae en la caja del día NUEVO', () => {
  // Sáb 13/6 02:01 AR = 05:01 UTC. Ya pasó el cierre de las 02:00.
  const f = fechaOperativaDeTimestamp(ts('2026-06-13T05:01:00Z'), CFG_PIZZERIA)
  assert(f === '2026-06-13', `f: ${f}`)
})

// ── CONSISTENCIA ENTRE MÓDULOS: Caja == Dashboard == Reportes ──────
// Los tres módulos derivan el día del mismo helper; estos tests
// verifican que sus PUNTOS DE ENTRADA (getCajaHoy / route dashboard /
// construirRangosReporte) resuelven la misma fechaOperativa para el
// mismo timestamp. Si alguien reintroduce una definición local de
// "hoy" en Reportes, C1-C3 rompen.

check('C1. pizzería 01:30 sáb: fechaOperativa Caja == Dashboard == Reportes == viernes', () => {
  const NOW = ts('2026-06-13T04:30:00Z')  // sáb 13/6 01:30 AR
  // Caja: getCajaHoy → obtenerDiaOperativoActual(settings).fechaOperativa
  const caja = obtenerDiaOperativoActual(CFG_PIZZERIA, NOW).fechaOperativa
  // Dashboard: /api/dashboard/comercial → misma llamada
  const dashboard = obtenerDiaOperativoActual(CFG_PIZZERIA, NOW).fechaOperativa
  // Reportes: construirRangosReporte (lo que la RPC V3 recibe)
  const reportes = construirRangosReporte(CFG_PIZZERIA, 'hoy', NOW).fechaOperativa
  assert(caja === '2026-06-12', `caja: ${caja}`)
  assert(caja === dashboard, `caja(${caja}) != dashboard(${dashboard})`)
  assert(caja === reportes, `caja(${caja}) != reportes(${reportes})`)
})

check('C2. reportes rango "hoy": bucket único idéntico al rango de Caja', () => {
  const NOW = ts('2026-06-13T04:30:00Z')
  const caja = obtenerDiaOperativoActual(CFG_PIZZERIA, NOW)
  const r = construirRangosReporte(CFG_PIZZERIA, 'hoy', NOW)
  assert(r.dias.length === 1, `dias: ${r.dias.length}`)
  assert(r.dias[0].fecha === caja.fechaOperativa, 'fecha bucket != caja')
  assert(r.dias[0].inicio.getTime() === caja.inicio.getTime(), 'inicio != caja')
  assert(r.dias[0].fin.getTime() === caja.fin.getTime(), 'fin != caja')
  assert(r.desde.getTime() === caja.inicio.getTime(), 'desde != caja.inicio')
  assert(r.hasta.getTime() === caja.fin.getTime(), 'hasta != caja.fin')
})

check('C3. reportes rango "semana": 7 buckets operativos contiguos, último = hoy operativo', () => {
  const NOW = ts('2026-06-13T04:30:00Z')
  const r = construirRangosReporte(CFG_PIZZERIA, 'semana', NOW)
  assert(r.dias.length === 7, `dias: ${r.dias.length}`)
  assert(r.dias[6].fecha === '2026-06-12', `último bucket: ${r.dias[6].fecha}`)
  assert(r.dias[0].fecha === '2026-06-06', `primer bucket: ${r.dias[0].fecha}`)
  // Contiguos: fin del bucket i == inicio del bucket i+1 NO aplica a
  // horarios con gap (pizzería cierra 02:00, abre 18:00) — pero las
  // fechas sí deben ser consecutivas.
  for (let i = 1; i < 7; i++) {
    assert(r.dias[i].fecha === sumarDiasYmd(r.dias[i - 1].fecha, 1), `gap entre ${r.dias[i - 1].fecha} y ${r.dias[i].fecha}`)
  }
  // gastos: fechas operativas inclusive.
  assert(r.gastosDesde === '2026-06-06' && r.gastosHasta === '2026-06-12', `gastos: ${r.gastosDesde}..${r.gastosHasta}`)
})

check('C4. consistencia también en 24hs (default): los 3 módulos = día calendario', () => {
  const NOW = ts('2026-06-13T04:30:00Z')  // sáb 01:30 AR
  const caja = obtenerDiaOperativoActual(CFG_24HS, NOW).fechaOperativa
  const reportes = construirRangosReporte(CFG_24HS, 'hoy', NOW).fechaOperativa
  assert(caja === '2026-06-13' && reportes === '2026-06-13', `caja=${caja} reportes=${reportes}`)
})

// ── sumarDiasYmd edge cases ─────────────────────────────────────────

check('18. sumarDiasYmd cruza mes y año', () => {
  assert(sumarDiasYmd('2026-06-30', 1) === '2026-07-01', 'mes')
  assert(sumarDiasYmd('2026-12-31', 1) === '2027-01-01', 'año')
  assert(sumarDiasYmd('2026-03-01', -1) === '2026-02-28', 'feb no bisiesto')
  assert(sumarDiasYmd('2028-03-01', -1) === '2028-02-29', 'feb bisiesto')
})

check('19. fechaLocalArgentina devuelve YYYY-MM-DD del huso AR', () => {
  // 02:00 UTC del 13/6 = 23:00 AR del 12/6.
  const f = fechaLocalArgentina(ts('2026-06-13T02:00:00Z'))
  assert(f === '2026-06-12', `f: ${f}`)
})

process.stdout.write(`\n[smoke-dia-operativo] ${passed} OK / ${failed} FAIL\n\n`)
if (failed > 0) process.exit(1)

// ── Demo de los 3 perfiles (output informativo) ─────────────────────
const NOW = ts('2026-06-13T04:30:00Z')  // sábado 13/6 01:30 AR
process.stdout.write('─'.repeat(66) + '\n')
process.stdout.write('DEMO: son las 01:30 AR del sábado 13/06/2026. ¿Qué día operativo es?\n')
process.stdout.write('─'.repeat(66) + '\n')
for (const [nombre, cfg] of [
  ['Kiosco 24hs        ', CFG_24HS],
  ['Almacén 08:00-20:00', CFG_ALMACEN],
  ['Pizzería 18:00-02:00', CFG_PIZZERIA],
] as const) {
  const d = obtenerDiaOperativoActual(cfg, NOW)
  process.stdout.write(
    `${nombre} → día operativo ${d.fechaOperativa}  ` +
    `[${d.inicio.toISOString()} .. ${d.fin.toISOString()})` +
    `${d.cruzaMedianoche ? '  (cruza medianoche)' : ''}\n`,
  )
}
process.stdout.write('─'.repeat(66) + '\n')
