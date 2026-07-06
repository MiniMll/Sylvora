// Smoke test — Sprint QA-1, hallazgo E1: optimización de exportaciones.
//
// El módulo Exportar llamaba getVentas() sin opts en 3 lugares:
// descargaba TODAS las ventas con TODOS sus items_venta al browser,
// ignorando el selector de período. Con datos reales (miles de ventas)
// congelaba la pestaña. Fix:
//   - getVentas acepta hasta / conItems además de desde / limit.
//   - traerVentasParaExport filtra por período, saltea items y aplica
//     la guarda de tamaño: consulta MAX+1 y CANCELA la exportación si
//     se excede (no genera archivo financiero incompleto).
//
// Cubre:
//   Query building (mock del builder de Supabase):
//     1. conItems:false → select('*') sin items_venta.
//     2. conItems default (true) → select('*, items_venta(*)').
//     3. desde → gte('created_at'); hasta → lte.
//     4. limit → limit aplicado; sin limit → sin cap (comportamiento
//        histórico, pero los exports SIEMPRE pasan cap).
//     5. contenido igual para el mismo rango: getVentas devuelve las
//        mismas filas que el builder entrega, sin transformarlas.
//   Guarda de tamaño (traerVentasParaExport, fetcher inyectable):
//     6. período con MAX+1 ventas → ok:false (BLOQUEA, no trunca).
//     7. período con exactamente MAX ventas → ok:true (procede).
//     8. consulta MAX+1 con conItems:false y el desde del período.
//   Período → desde (desdePeriodoExport, puro con reloj inyectable):
//     9. 'hoy' → inicio del día calendario AR de hoy.
//    10. 'semana' → inicio de hace 6 días (7 días con hoy).
//    11. 'mes' → inicio del día 1 del mes AR.
//    12. 'todo' → undefined (sin cota).
//    13. respeta huso AR de noche (23:30 AR no adelanta el día).
//
// Correr con:
//   npx tsx scripts/smoke-exportar-optimizacion.ts

import { randomBytes } from 'node:crypto'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'dummy'
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import { desdePeriodoExport } from '../lib/exportar/periodo'
import { traerVentasParaExport, EXPORT_MAX_VENTAS } from '../lib/exportar/ventas-export'
import { fechaLocalArgentina } from '../lib/operacion/diaOperativo'
import type { Venta } from '../types/database'

// ────────────────────────────────────────────────────────────────────
// Mock del builder de Supabase que captura la query construida.
// getVentas usa: from().select().eq().order().gte?().lte?().limit?()
// y await del builder → { data, error }.
// ────────────────────────────────────────────────────────────────────

interface CapturedQuery {
  table: string
  columns: string
  filtros: Array<{ op: string; col: string; val: unknown }>
  order: { col: string; asc: boolean } | null
  limit: number | null
}

function createMockSupabase(rows: unknown[]) {
  const captured: CapturedQuery = { table: '', columns: '', filtros: [], order: null, limit: null }

  function builder() {
    const q = {
      select(cols: string) { captured.columns = cols; return q },
      eq(col: string, val: unknown) { captured.filtros.push({ op: 'eq', col, val }); return q },
      order(col: string, opts?: { ascending?: boolean }) { captured.order = { col, asc: opts?.ascending !== false }; return q },
      gte(col: string, val: unknown) { captured.filtros.push({ op: 'gte', col, val }); return q },
      lte(col: string, val: unknown) { captured.filtros.push({ op: 'lte', col, val }); return q },
      limit(n: number) { captured.limit = n; return q },
      then(resolve: (v: unknown) => void) { resolve({ data: rows, error: null }) },
    }
    return q
  }

  const sb = {
    from(t: string) { captured.table = t; return builder() },
    auth: { async getUser() { return { data: { user: { id: 'u1' } } } } },
  }
  return { sb, captured }
}

// getVentasCon acepta client + comercioId inyectables (patrón del repo),
// así el smoke testea el armado de la query sin tocar _base ni auth.

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

// AR = UTC-3 fijo. HH:MM AR → instante UTC.
function arToUtc(fechaAr: string, horaAr: string): Date {
  const [y, m, d] = fechaAr.split('-').map(Number)
  const [hh, mm] = horaAr.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0))
}

// Inicio de día calendario AR como instante UTC (00:00 AR = 03:00 UTC).
function inicioDiaArUtc(fechaAr: string): number {
  return arToUtc(fechaAr, '00:00').getTime()
}

process.stdout.write('\n[smoke-exportar-optimizacion] Optimización de exportaciones (QA-1 E1)...\n\n')

async function run() {
  const { getVentasCon } = await import('../lib/supabase/ventas')

  // Helper: correr getVentasCon con un sb mockeado, capturando la query.
  type SbArg = Parameters<typeof getVentasCon>[0]
  async function correrGetVentas(rows: unknown[], opts: Parameters<typeof getVentasCon>[2]) {
    const { sb, captured } = createMockSupabase(rows)
    const data = await getVentasCon(sb as unknown as SbArg, 'comercio-1', opts)
    return { data, captured }
  }

  await check('1. conItems:false → select("*") sin items_venta', async () => {
    const { captured } = await correrGetVentas([], { conItems: false, limit: 5000 })
    assert(captured.columns === '*', `columns: ${captured.columns}`)
    assert(!captured.columns.includes('items_venta'), 'joina items_venta con conItems:false')
  })

  await check('2. conItems default → select con items_venta(*)', async () => {
    const { captured } = await correrGetVentas([], {})
    assert(captured.columns === '*, items_venta(*)', `columns: ${captured.columns}`)
  })

  await check('3. desde → gte(created_at); hasta → lte(created_at)', async () => {
    const desde = new Date('2026-07-01T03:00:00Z')
    const hasta = new Date('2026-07-31T02:59:59Z')
    const { captured } = await correrGetVentas([], { desde, hasta, conItems: false })
    const gte = captured.filtros.find(f => f.op === 'gte')
    const lte = captured.filtros.find(f => f.op === 'lte')
    assert(gte?.col === 'created_at' && gte.val === desde.toISOString(), `gte: ${JSON.stringify(gte)}`)
    assert(lte?.col === 'created_at' && lte.val === hasta.toISOString(), `lte: ${JSON.stringify(lte)}`)
  })

  await check('4. limit aplicado; sin limit → sin cap', async () => {
    const conCap = await correrGetVentas([], { limit: 5000, conItems: false })
    assert(conCap.captured.limit === 5000, `limit: ${conCap.captured.limit}`)
    const sinCap = await correrGetVentas([], {})
    assert(sinCap.captured.limit === null, `limit sin opt: ${sinCap.captured.limit}`)
  })

  await check('5. contenido IGUAL para el mismo rango: getVentas no transforma filas', async () => {
    const filas = [
      { id: 'v1', numero_ticket: 1, total: 1500, metodo_pago: 'efectivo', estado: 'completada', created_at: '2026-07-05T12:00:00Z' },
      { id: 'v2', numero_ticket: 2, total: 3000, metodo_pago: 'mercadopago', estado: 'anulada', created_at: '2026-07-04T18:00:00Z' },
    ]
    const { data } = await correrGetVentas(filas, { limit: 5000, conItems: false })
    assert(data.length === 2, `len: ${data.length}`)
    assert(data[0].id === 'v1' && data[1].id === 'v2', 'orden/contenido alterado')
    assert(Number(data[0].total) === 1500 && data[1].metodo_pago === 'mercadopago', 'campos alterados')
  })

  // ── Guarda de tamaño: bloquear, no truncar ─────────────────────────

  const filaFake = (i: number) => ({ id: `v${i}`, numero_ticket: i, total: 100, metodo_pago: 'efectivo', estado: 'completada', created_at: '2026-07-05T12:00:00Z' }) as unknown as Venta

  await check('6. período con MAX+1 ventas → ok:false (BLOQUEA, no trunca)', async () => {
    // El fetcher simula que la DB devolvió MAX+1 (la guarda pide MAX+1).
    const fetcher = async () => Array.from({ length: EXPORT_MAX_VENTAS + 1 }, (_, i) => filaFake(i))
    const res = await traerVentasParaExport(fetcher, 'todo')
    assert(res.ok === false, 'no bloqueó con MAX+1')
    if (!res.ok) assert(res.motivo === 'periodo_demasiado_grande', `motivo: ${res.motivo}`)
  })

  await check('7. período con exactamente MAX ventas → ok:true (procede)', async () => {
    const fetcher = async () => Array.from({ length: EXPORT_MAX_VENTAS }, (_, i) => filaFake(i))
    const res = await traerVentasParaExport(fetcher, 'mes')
    assert(res.ok === true, 'bloqueó con exactamente MAX')
    if (res.ok) assert(res.ventas.length === EXPORT_MAX_VENTAS, `len: ${res.ventas.length}`)
  })

  await check('8. consulta MAX+1 con conItems:false y el desde del período', async () => {
    let capturado: { desde?: Date; limit?: number; conItems?: boolean } | null = null
    const fetcher = async (opts: { desde?: Date; limit?: number; conItems?: boolean }) => { capturado = opts; return [] as Venta[] }
    const now = arToUtc('2026-07-18', '14:00')
    await traerVentasParaExport(fetcher, 'mes', now)
    assert(capturado !== null, 'no llamó al fetcher')
    const c = capturado as { desde?: Date; limit?: number; conItems?: boolean }
    assert(c.limit === EXPORT_MAX_VENTAS + 1, `limit: ${c.limit} (debe ser MAX+1 para detectar exceso)`)
    assert(c.conItems === false, `conItems: ${c.conItems}`)
    assert(c.desde?.getTime() === inicioDiaArUtc('2026-07-01'), `desde: ${c.desde?.toISOString()}`)
  })

  // ── desdePeriodoExport (puro) ──────────────────────────────────────

  await check('9. hoy → inicio del día calendario AR de hoy', () => {
    const now = arToUtc('2026-07-05', '14:00')
    const desde = desdePeriodoExport('hoy', now)
    assert(desde !== undefined, 'undefined')
    assert(desde!.getTime() === inicioDiaArUtc('2026-07-05'), `desde: ${desde!.toISOString()}`)
  })

  await check('10. semana → inicio de hace 6 días (7 con hoy)', () => {
    const now = arToUtc('2026-07-10', '14:00')
    const desde = desdePeriodoExport('semana', now)
    assert(desde!.getTime() === inicioDiaArUtc('2026-07-04'), `desde: ${desde!.toISOString()}`)
  })

  await check('11. mes → inicio del día 1 del mes AR', () => {
    const now = arToUtc('2026-07-18', '14:00')
    const desde = desdePeriodoExport('mes', now)
    assert(desde!.getTime() === inicioDiaArUtc('2026-07-01'), `desde: ${desde!.toISOString()}`)
  })

  await check('12. todo → undefined (sin cota inferior)', () => {
    assert(desdePeriodoExport('todo', new Date()) === undefined, 'no es undefined')
  })

  await check('13. huso AR de noche: 23:30 AR no adelanta el día', () => {
    // 23:30 AR del 05/07 = 02:30 UTC del 06/07. "hoy" debe ser 05, no 06.
    const now = arToUtc('2026-07-05', '23:30')
    assert(fechaLocalArgentina(now) === '2026-07-05', `fechaLocal: ${fechaLocalArgentina(now)}`)
    const desde = desdePeriodoExport('hoy', now)
    assert(desde!.getTime() === inicioDiaArUtc('2026-07-05'), `desde: ${desde!.toISOString()} (no debería ser el 06)`)
  })
}

run().then(() => {
  process.stdout.write(`\n[smoke-exportar-optimizacion] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  process.stdout.write(`crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
