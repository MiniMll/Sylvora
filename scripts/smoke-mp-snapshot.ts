// Smoke test del snapshot de carrito (épica requiere_revision, Commit 3).
//
// Cubre:
//   Sanitizador (lib/mp/snapshot.ts — puro):
//     1. snapshot válido pasa y devuelve copia normalizada.
//     2. no-objeto / versión desconocida → rechazo.
//     3. items: vacío, >200, producto_id no-UUID, nombre vacío → rechazo.
//     4. montos negativos / no finitos → rechazo.
//     5. inconsistencias aritméticas (items vs subtotal, total vs
//        cálculo, total vs monto cobrado) → rechazo.
//     6. nombre >200 chars se trunca; keys desconocidas se eliminan.
//     7. peso_kg inválido se omite SIN rechazar el snapshot.
//     8. producto_id null (producto borrado / manual) es válido.
//   Data layer (lib/supabase/mp.ts):
//     (se usa el mock in-memory de siempre)
//     9. crearIntentoCobro CON snapshot → se persiste y se relee.
//    10. crearIntentoCobro SIN snapshot → items_snapshot null
//        (compat con intentos históricos).
//    11. flujo de aprobación con snapshot NULL → idéntico a siempre
//        (aprobarIntentoCobro no toca el campo).
//    12. flujo de aprobación CON snapshot → el snapshot sobrevive
//        la transición (no se pisa).
//
// Correr con:
//   npx tsx scripts/smoke-mp-snapshot.ts

import { randomBytes, randomUUID } from 'node:crypto'
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import { sanitizarSnapshotVenta, type SnapshotVentaMP } from '../lib/mp/snapshot'
import {
  crearIntentoCobro,
  aprobarIntentoCobro,
  obtenerIntentoCobroPorId,
} from '../lib/supabase/mp'

// ────────────────────────────────────────────────────────────────────
// Mock Supabase (patrón compartido de los smokes MP)
// ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
interface Store { intentos_cobro_mp: Row[] }

function createMockSupabase() {
  const store: Store = { intentos_cobro_mp: [] }
  function tableQuery(table: keyof Store) {
    const filters: Array<[string, unknown]> = []
    let pendingOp:
      | { kind: 'select' }
      | { kind: 'insert'; row: Row }
      | { kind: 'update'; patch: Row }
      | null = null
    let selectedCols: string[] | null = null
    function project(row: Row | null): Row | null {
      if (!row) return null
      if (!selectedCols) return row
      const out: Row = {}
      for (const c of selectedCols) out[c] = c in row ? row[c] : null
      return out
    }
    const q = {
      select(cols: string) {
        selectedCols = cols.split(',').map(c => c.trim())
        if (pendingOp && pendingOp.kind !== 'select') return q
        pendingOp = { kind: 'select' }
        return q
      },
      eq(c: string, v: unknown) { filters.push([c, v]); return q },
      insert(row: Row) { pendingOp = { kind: 'insert', row }; return q },
      update(patch: Row) { pendingOp = { kind: 'update', patch }; return q },
      async maybeSingle() { return execute('maybeSingle') },
      async single() { return execute('single') },
    }
    function execute(mode: 'maybeSingle' | 'single') {
      const rows = store[table]
      if (pendingOp?.kind === 'select') {
        const m = rows.filter(r => filters.every(([k, v]) => r[k] === v))
        if (mode === 'maybeSingle') return { data: project(m[0] ?? null), error: null }
        if (m.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        return { data: project(m[0]), error: null }
      }
      if (pendingOp?.kind === 'insert') {
        const inserted: Row = { ...pendingOp.row, id: randomUUID(), creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }
        if (!('estado' in inserted)) inserted.estado = 'pendiente'
        if (!('venta_id' in inserted)) inserted.venta_id = null
        if (!('mp_payment_id' in inserted)) inserted.mp_payment_id = null
        if (!('mp_status_detail' in inserted)) inserted.mp_status_detail = null
        if (!('pagado_en' in inserted)) inserted.pagado_en = null
        if (!('items_snapshot' in inserted)) inserted.items_snapshot = null
        rows.push(inserted)
        return { data: project(inserted), error: null }
      }
      if (pendingOp?.kind === 'update') {
        const m = rows.filter(r => filters.every(([k, v]) => r[k] === v))
        if (m.length === 0) {
          if (mode === 'maybeSingle') return { data: null, error: null }
          return { data: null, error: { code: 'no_rows', message: 'no rows' } }
        }
        for (const r of m) Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        return { data: project(m[0]), error: null }
      }
      return { data: null, error: null }
    }
    return q
  }
  return {
    sb: { from(t: string) { return tableQuery(t as keyof Store) } } as unknown as import('@supabase/supabase-js').SupabaseClient,
    store,
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const PERFIL = '00000000-0000-0000-0000-00000000p001'
const PROD_A = '11111111-1111-4111-8111-111111111111'
const PROD_B = '22222222-2222-4222-8222-222222222222'

function snapshotValido(): SnapshotVentaMP {
  return {
    version: 1,
    subtotal: 3000,
    descuento_porcentaje: 0,
    descuento_monto: 0,
    recargo_porcentaje: 0,
    recargo_monto: 0,
    total: 3000,
    items: [
      { producto_id: PROD_A, nombre_producto: 'Coca-Cola 2.25L', precio_unitario: 1500, cantidad: 1, subtotal: 1500 },
      { producto_id: PROD_B, nombre_producto: 'Galletitas', precio_unitario: 750, cantidad: 2, subtotal: 1500 },
    ],
  }
}

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

function expectRechazo(raw: unknown, monto: number, motivoPrefix: string) {
  const r = sanitizarSnapshotVenta(raw, monto)
  assert(r.ok === false, `esperaba rechazo ${motivoPrefix}, pasó`)
  if (!r.ok) assert(r.motivo.startsWith(motivoPrefix), `motivo: ${r.motivo} (esperaba ${motivoPrefix}*)`)
}

process.stdout.write('\n[smoke-mp-snapshot] Verificando snapshot de carrito...\n\n')

async function run() {

  // ── Sanitizador ────────────────────────────────────────────────

  await check('1. snapshot válido pasa y normaliza', () => {
    const r = sanitizarSnapshotVenta(snapshotValido(), 3000)
    assert(r.ok === true, `rechazado: ${!r.ok ? r.motivo : ''}`)
    if (r.ok) {
      assert(r.snapshot.items.length === 2, 'items')
      assert(r.snapshot.total === 3000, 'total')
      assert(r.snapshot.items[0].producto_id === PROD_A, 'producto_id')
    }
  })

  await check('2. no-objeto / versión desconocida → rechazo', () => {
    expectRechazo(null, 100, 'snapshot_no_es_objeto')
    expectRechazo('x', 100, 'snapshot_no_es_objeto')
    expectRechazo([1, 2], 100, 'snapshot_no_es_objeto')
    expectRechazo({ ...snapshotValido(), version: 2 }, 3000, 'version_desconocida')
  })

  await check('3. items inválidos → rechazo', () => {
    expectRechazo({ ...snapshotValido(), items: [] }, 3000, 'items_invalidos')
    const muchos = { ...snapshotValido(), items: new Array(201).fill(snapshotValido().items[0]) }
    expectRechazo(muchos, 3000, 'items_invalidos')
    const badId = snapshotValido()
    badId.items[0] = { ...badId.items[0], producto_id: 'DROP TABLE;--' }
    expectRechazo(badId, 3000, 'producto_id_invalido')
    const sinNombre = snapshotValido()
    sinNombre.items[0] = { ...sinNombre.items[0], nombre_producto: '   ' }
    expectRechazo(sinNombre, 3000, 'nombre_producto_vacio')
  })

  await check('4. montos inválidos → rechazo', () => {
    expectRechazo({ ...snapshotValido(), subtotal: -1 }, 3000, 'montos_invalidos')
    expectRechazo({ ...snapshotValido(), total: Number.NaN }, 3000, 'montos_invalidos')
    expectRechazo({ ...snapshotValido(), total: Infinity }, 3000, 'montos_invalidos')
    const itemNeg = snapshotValido()
    itemNeg.items[0] = { ...itemNeg.items[0], cantidad: -5 }
    expectRechazo(itemNeg, 3000, 'item_montos_invalidos')
  })

  await check('5. inconsistencias aritméticas → rechazo', () => {
    // items suman 3000 pero declara 2500.
    expectRechazo({ ...snapshotValido(), subtotal: 2500, total: 2500 }, 2500, 'subtotal_inconsistente')
    // subtotal - desc + rec != total.
    expectRechazo({ ...snapshotValido(), descuento_monto: 500 }, 3000, 'total_inconsistente')
    // total != monto que se cobra a MP.
    expectRechazo(snapshotValido(), 9999, 'total_no_coincide_con_monto')
  })

  await check('6. nombre >200 chars se trunca; keys extra se eliminan', () => {
    const s = snapshotValido() as SnapshotVentaMP & { campo_raro?: string }
    s.campo_raro = 'no debería sobrevivir'
    s.items[0] = { ...s.items[0], nombre_producto: 'X'.repeat(500) }
    const r = sanitizarSnapshotVenta(s, 3000)
    assert(r.ok === true, `rechazado: ${!r.ok ? r.motivo : ''}`)
    if (r.ok) {
      assert(r.snapshot.items[0].nombre_producto.length === 200, `len: ${r.snapshot.items[0].nombre_producto.length}`)
      assert(!('campo_raro' in r.snapshot), 'key desconocida sobrevivió')
      assert(!('campo_raro' in r.snapshot.items[0]), 'key desconocida en item')
    }
  })

  await check('7. peso_kg inválido se omite sin rechazar', () => {
    const s = snapshotValido()
    s.items[0] = { ...s.items[0], peso_kg: -5 }
    const r = sanitizarSnapshotVenta(s, 3000)
    assert(r.ok === true, 'rechazó por peso_kg')
    if (r.ok) assert(!('peso_kg' in r.snapshot.items[0]), 'peso_kg inválido sobrevivió')
    // peso_kg válido sí pasa.
    const s2 = snapshotValido()
    s2.items[0] = { ...s2.items[0], peso_kg: 1.5 }
    const r2 = sanitizarSnapshotVenta(s2, 3000)
    assert(r2.ok === true && r2.snapshot.items[0].peso_kg === 1.5, 'peso_kg válido no pasó')
  })

  await check('8. producto_id null (borrado/manual) es válido', () => {
    const s = snapshotValido()
    s.items[0] = { ...s.items[0], producto_id: null }
    const r = sanitizarSnapshotVenta(s, 3000)
    assert(r.ok === true, `rechazado: ${!r.ok ? r.motivo : ''}`)
    if (r.ok) assert(r.snapshot.items[0].producto_id === null, 'null no preservado')
  })

  // ── Data layer ─────────────────────────────────────────────────

  await check('9. crearIntentoCobro CON snapshot → se persiste y se relee', async () => {
    const { sb, store } = createMockSupabase()
    const snap = snapshotValido()
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_snap_9',
      monto: 3000, metodo: 'qr',
      expira_en: new Date(Date.now() + 10 * 60_000), creado_por: PERFIL,
      items_snapshot: snap,
    })
    assert(intento.items_snapshot !== null, 'snapshot null al crear')
    assert(intento.items_snapshot!.items.length === 2, 'items perdidos')
    const releido = await obtenerIntentoCobroPorId(sb, intento.id)
    assert(releido!.items_snapshot!.total === 3000, 'snapshot no releído')
    const row = store.intentos_cobro_mp[0]
    assert((row.items_snapshot as SnapshotVentaMP).version === 1, 'version en DB')
  })

  await check('10. crearIntentoCobro SIN snapshot → null (compat histórico)', async () => {
    const { sb } = createMockSupabase()
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_snap_10',
      monto: 1000, metodo: 'qr',
      expira_en: new Date(), creado_por: PERFIL,
    })
    assert(intento.items_snapshot === null, `snapshot: ${JSON.stringify(intento.items_snapshot)}`)
  })

  await check('11. aprobación con snapshot NULL → flujo idéntico a siempre', async () => {
    const { sb } = createMockSupabase()
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_snap_11',
      monto: 1000, metodo: 'qr',
      expira_en: new Date(), creado_por: PERFIL,
    })
    const aprobado = await aprobarIntentoCobro(sb, intento.id, { mp_payment_id: 111 })
    assert(aprobado.estado === 'aprobado', 'no aprobó')
    assert(aprobado.items_snapshot === null, 'snapshot apareció de la nada')
  })

  await check('12. aprobación CON snapshot → el snapshot sobrevive', async () => {
    const { sb } = createMockSupabase()
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_snap_12',
      monto: 3000, metodo: 'qr',
      expira_en: new Date(), creado_por: PERFIL,
      items_snapshot: snapshotValido(),
    })
    const aprobado = await aprobarIntentoCobro(sb, intento.id, { mp_payment_id: 222 })
    assert(aprobado.estado === 'aprobado', 'no aprobó')
    assert(aprobado.items_snapshot !== null, 'snapshot se perdió al aprobar')
    assert(aprobado.items_snapshot!.items[0].nombre_producto === 'Coca-Cola 2.25L', 'contenido pisado')
  })

}

run().then(() => {
  process.stdout.write(`\n[smoke-mp-snapshot] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  process.stdout.write(`crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
