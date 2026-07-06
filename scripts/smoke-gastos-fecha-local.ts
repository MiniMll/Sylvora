// Smoke test — Sprint QA-1, hallazgo G1: fecha local Argentina en Gastos.
//
// El módulo Gastos usaba new Date().toISOString().slice(0,10) para los
// defaults de fecha (form + filtro desde/hasta). Eso devuelve fecha
// UTC: desde las 21:00 AR (= 00:00 UTC del día siguiente) el gasto se
// precargaba con la fecha de MAÑANA. El fix reusa los helpers del día
// operativo (fechaLocalArgentina / mesLocalArgentina), que resuelven la
// fecha calendario en huso Argentina.
//
// Este smoke prueba, para cada timestamp:
//   - lo que devolvía el código VIEJO (toISOString().slice(0,10)),
//   - lo que devuelve el helper NUEVO,
// y afirma que en la ventana 21:00–23:59 AR el nuevo ya NO adelanta un
// día, sin regresar durante el día ni para comercios 24hs.
//
// Correr con:
//   npx tsx scripts/smoke-gastos-fecha-local.ts

import { fechaLocalArgentina, mesLocalArgentina } from '../lib/operacion/diaOperativo'

// Reproducción EXACTA del bug viejo (default del form), para contrastar.
function viejoTodayUTC(now: Date): string {
  return now.toISOString().slice(0, 10)
}

// AR = UTC-3 fijo (sin DST). Helper para construir "HH:MM AR" como
// instante UTC: 23:30 AR del 05/07 = 02:30 UTC del 06/07.
function arToUtc(fechaAr: string, horaAr: string): Date {
  const [y, m, d] = fechaAr.split('-').map(Number)
  const [hh, mm] = horaAr.split(':').map(Number)
  // AR = UTC-3 → UTC = AR + 3h
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0))
}

let passed = 0, failed = 0
function check(name: string, fn: () => void) {
  try { fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-gastos-fecha-local] Fecha local AR en Gastos (QA-1 G1)...\n\n')

// ── La ventana crítica: 21:00–23:59 AR ──────────────────────────────

check('1. 21:00 AR → helper devuelve HOY, el viejo UTC ya adelantaba al día siguiente', () => {
  const now = arToUtc('2026-07-05', '21:00')   // dom 05/07 21:00 AR = 00:00 UTC 06/07
  const nuevo = fechaLocalArgentina(now)
  const viejo = viejoTodayUTC(now)
  assert(nuevo === '2026-07-05', `nuevo: ${nuevo} (debería ser hoy 05)`)
  assert(viejo === '2026-07-06', `viejo: ${viejo} (confirmando que el bug adelantaba a 06)`)
})

check('2. 23:59 AR → helper devuelve HOY (no mañana)', () => {
  const now = arToUtc('2026-07-05', '23:59')   // = 02:59 UTC 06/07
  assert(fechaLocalArgentina(now) === '2026-07-05', `nuevo: ${fechaLocalArgentina(now)}`)
  assert(viejoTodayUTC(now) === '2026-07-06', 'el viejo no adelantaba (esperábamos que sí)')
})

check('3. 22:30 AR último día del mes → NO salta al mes siguiente', () => {
  const now = arToUtc('2026-07-31', '22:30')   // = 01:30 UTC 01/08
  assert(fechaLocalArgentina(now) === '2026-07-31', `fecha: ${fechaLocalArgentina(now)}`)
  assert(mesLocalArgentina(now) === '2026-07-01', `mes: ${mesLocalArgentina(now)}`)
  // El viejo habría puesto la fecha del gasto el 01/08 → mes equivocado.
  assert(viejoTodayUTC(now) === '2026-08-01', 'contraste del bug de fin de mes')
})

// ── No hay regresión durante el día ─────────────────────────────────

check('4. 12:00 AR → helper y viejo coinciden (mismo día, sin cambio de comportamiento)', () => {
  const now = arToUtc('2026-07-05', '12:00')   // = 15:00 UTC, mismo día
  assert(fechaLocalArgentina(now) === '2026-07-05', 'nuevo mediodía')
  assert(viejoTodayUTC(now) === '2026-07-05', 'viejo mediodía')
  assert(fechaLocalArgentina(now) === viejoTodayUTC(now), 'divergen al mediodía')
})

check('5. 08:00 AR primer día del mes → mes correcto', () => {
  const now = arToUtc('2026-08-01', '08:00')
  assert(fechaLocalArgentina(now) === '2026-08-01', `fecha: ${fechaLocalArgentina(now)}`)
  assert(mesLocalArgentina(now) === '2026-08-01', `mes: ${mesLocalArgentina(now)}`)
})

// ── Comercio 24hs: fecha calendario AR = lo que ve Caja/Dashboard ────

check('6. 24hs: la fecha del helper coincide con fechaOperativa de un comercio 24hs', async () => {
  const { obtenerDiaOperativoActual } = await import('../lib/operacion/diaOperativo')
  const now = arToUtc('2026-07-05', '23:30')
  const diaOp = obtenerDiaOperativoActual({ caja_24hs: true }, now)
  // Para 24hs, fechaOperativa == fecha calendario AR == el default de gastos.
  assert(fechaLocalArgentina(now) === diaOp.fechaOperativa, `gastos ${fechaLocalArgentina(now)} != caja ${diaOp.fechaOperativa}`)
})

// ── Ningún uso de toISOString().slice para fechas locales en la page ─

check('7. la page ya no USA toISOString().slice para fechas locales (ignora comentarios)', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../app/gastos/page.tsx', import.meta.url), 'utf8')
  // Quitar comentarios de línea antes de chequear — el fix documenta el
  // patrón viejo en un comentario, y no queremos falso positivo por eso.
  const sinComentarios = src.replace(/\/\/.*$/gm, '')
  assert(!/toISOString\(\)\.slice\(0,\s*10\)/.test(sinComentarios), 'sigue habiendo toISOString().slice en código de la page')
})

process.stdout.write(`\n[smoke-gastos-fecha-local] ${passed} OK / ${failed} FAIL\n\n`)
if (failed > 0) process.exit(1)
