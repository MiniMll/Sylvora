// Smoke test del estado requiere_revision.
//
// Cubre:
//   1. aprobado → requiere_revision con motivo OK.
//   2. pendiente → requiere_revision REJECTED (not_in_aprobado).
//   3. rechazado → requiere_revision REJECTED (not_in_aprobado).
//   4. cancelado → requiere_revision REJECTED.
//   5. expirado → requiere_revision REJECTED.
//   6. requiere_revision (ya) → requiere_revision REJECTED (idempotente
//      en el sentido "no se reprocesa", devuelve estado real).
//   7. id no existe → not_found.
//   8. motivo se trunca a 200 chars.
//   9. motivo no-string fallback.
//  10. atomicidad: race con webhook que cambia el estado entre
//      "leer" y "UPDATE" → resultado refleja el estado real.
//  11. FINAL_STATES del webhook incluye requiere_revision (smoke
//      indirecto: re-process del webhook NO toca el estado).
//
// Correr con:
//   npx tsx scripts/smoke-mp-requiere-revision.ts

import { createHmac, randomBytes, randomUUID } from 'node:crypto'
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import {
  crearIntentoCobro,
  aprobarIntentoCobro,
  cancelarIntentoCobro,
  actualizarIntentoCobro,
  marcarExpiradoSiCorresponde,
  marcarIntentoRequiereRevision,
  obtenerIntentoCobroPorId,
  guardarCredenciales,
} from '../lib/supabase/mp'
import { processMPWebhookNotification } from '../lib/mp/webhook-handler'

// Silenciar logs del api-client.
const origLog = console.log, origWarn = console.warn
console.log = () => {}; console.warn = () => {}

// ────────────────────────────────────────────────────────────────────
// Mock fetch (para el test 11 de webhook)
// ────────────────────────────────────────────────────────────────────

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchHandler = (url: string, init: FetchInit) => Promise<Response>
let currentFetch: FetchHandler = async () => { throw new Error('no handler') }
globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
  return currentFetch(url, init)
}) as typeof fetch
function setFetch(h: FetchHandler) { currentFetch = h }
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// ────────────────────────────────────────────────────────────────────
// Mock Supabase (reusa el patrón)
// ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
interface Store { mp_credenciales: Row[]; intentos_cobro_mp: Row[] }

function createMockSupabase() {
  const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
  function tableQuery(table: keyof Store) {
    const filters: Array<[string, unknown]> = []
    let pendingOp:
      | { kind: 'select' }
      | { kind: 'insert'; row: Row }
      | { kind: 'upsert'; row: Row; onConflict: string }
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
      upsert(row: Row, o: { onConflict: string }) {
        pendingOp = { kind: 'upsert', row, onConflict: o.onConflict }; return q
      },
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
        if (table === 'intentos_cobro_mp') {
          if (!('estado' in inserted)) inserted.estado = 'pendiente'
          if (!('venta_id' in inserted)) inserted.venta_id = null
          if (!('mp_payment_id' in inserted)) inserted.mp_payment_id = null
          if (!('mp_status_detail' in inserted)) inserted.mp_status_detail = null
          if (!('pagado_en' in inserted)) inserted.pagado_en = null
        }
        rows.push(inserted)
        return { data: project(inserted), error: null }
      }
      if (pendingOp?.kind === 'upsert') {
        const k = pendingOp.onConflict
        const v = (pendingOp.row as Row)[k]
        const idx = rows.findIndex(r => r[k] === v)
        const now = new Date().toISOString()
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...pendingOp.row, actualizado_en: now }
          return { data: project(rows[idx]), error: null }
        }
        const inserted: Row = { ...pendingOp.row, actualizado_en: now, conectado_en: now, id: randomUUID() }
        rows.push(inserted)
        return { data: project(inserted), error: null }
      }
      if (pendingOp?.kind === 'update') {
        const m = rows.filter(r => filters.every(([k, v]) => r[k] === v))
        if (m.length === 0) return { data: null, error: null }
        for (const r of m) Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        return { data: project(m[0]), error: null }
      }
      return { data: null, error: null }
    }
    return q
  }
  return { sb: { from(t: string) { return tableQuery(t as keyof Store) } } as unknown as import('@supabase/supabase-js').SupabaseClient, store }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const PERFIL = '00000000-0000-0000-0000-00000000p001'
const USER_ID_MP = 7777
const SECRET = 'webhook_secret_test'

async function seed(sb: import('@supabase/supabase-js').SupabaseClient, ref: string, expiraEn = new Date(Date.now() + 10 * 60_000)) {
  return crearIntentoCobro(sb, {
    comercio_id: COMERCIO, external_reference: ref,
    monto: 1000, metodo: 'qr', expira_en: expiraEn, creado_por: PERFIL,
  })
}

function signedHeaders(dataId: string) {
  const ts = Math.floor(Date.now() / 1000)
  const xReq = randomUUID()
  const manifest = `id:${dataId};request-id:${xReq};ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
  const h = new Headers()
  h.set('x-signature', `ts=${ts},v1=${v1}`)
  h.set('x-request-id', xReq)
  return h
}

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); origLog(`  ✓ ${name}`); passed++ }
  catch (e) { origLog(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

origLog('\n[smoke-mp-requiere-revision] Verificando estado requiere_revision...\n')

async function run() {

  await check('1. aprobado → requiere_revision con motivo OK', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_1')
    await aprobarIntentoCobro(sb, i.id, { mp_payment_id: 999, mp_status_detail: 'accredited' })
    const r = await marcarIntentoRequiereRevision(sb, i.id, 'stock_insuficiente_post_aprobado')
    assert(r.ok === true, `ok: ${r.ok}`)
    if (r.ok) {
      assert(r.intento.estado === 'requiere_revision', `estado: ${r.intento.estado}`)
      assert(r.intento.mp_status_detail === 'stock_insuficiente_post_aprobado', `detail: ${r.intento.mp_status_detail}`)
      assert(r.intento.mp_payment_id === 999, 'mp_payment_id se perdió')
    }
  })

  await check('2. pendiente → requiere_revision REJECTED', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_2')
    const r = await marcarIntentoRequiereRevision(sb, i.id, 'no_debería_disparar_acá')
    assert(r.ok === false, 'no debió aplicar')
    if (!r.ok) {
      assert(r.reason === 'not_in_aprobado', `reason: ${r.reason}`)
      assert(r.intento?.estado === 'pendiente', `estado: ${r.intento?.estado}`)
    }
  })

  await check('3. rechazado → requiere_revision REJECTED', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_3')
    await actualizarIntentoCobro(sb, i.id, { estado: 'rechazado' })
    const r = await marcarIntentoRequiereRevision(sb, i.id, 'irrelevant')
    assert(r.ok === false, 'no debió aplicar')
    if (!r.ok) assert(r.reason === 'not_in_aprobado', `reason: ${r.reason}`)
  })

  await check('4. cancelado → requiere_revision REJECTED', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_4')
    await cancelarIntentoCobro(sb, i.id)
    const r = await marcarIntentoRequiereRevision(sb, i.id, 'irrelevant')
    assert(r.ok === false, 'no debió aplicar')
    if (!r.ok) {
      assert(r.reason === 'not_in_aprobado', `reason: ${r.reason}`)
      assert(r.intento?.estado === 'cancelado', `estado: ${r.intento?.estado}`)
    }
  })

  await check('5. expirado → requiere_revision REJECTED', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_5', new Date(Date.now() - 1000))
    await marcarExpiradoSiCorresponde(sb, i)
    const r = await marcarIntentoRequiereRevision(sb, i.id, 'irrelevant')
    assert(r.ok === false, 'no debió aplicar')
    if (!r.ok) assert(r.intento?.estado === 'expirado', `estado: ${r.intento?.estado}`)
  })

  await check('6. requiere_revision (ya) → REJECTED (no se reprocesa)', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_6')
    await aprobarIntentoCobro(sb, i.id, { mp_payment_id: 1 })
    await marcarIntentoRequiereRevision(sb, i.id, 'motivo_original')
    const r = await marcarIntentoRequiereRevision(sb, i.id, 'motivo_distinto_no_debe_pisar')
    assert(r.ok === false, 'segunda llamada no debió aplicar')
    if (!r.ok) {
      assert(r.intento?.estado === 'requiere_revision', `estado: ${r.intento?.estado}`)
      assert(r.intento?.mp_status_detail === 'motivo_original', `motivo pisado: ${r.intento?.mp_status_detail}`)
    }
  })

  await check('7. id no existe → not_found', async () => {
    const { sb } = createMockSupabase()
    const r = await marcarIntentoRequiereRevision(sb, '00000000-0000-0000-0000-000000000000', 'irrelevant')
    assert(r.ok === false, 'debió fallar')
    if (!r.ok) assert(r.reason === 'not_found', `reason: ${r.reason}`)
  })

  await check('8. motivo se trunca a 200 chars', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_8')
    await aprobarIntentoCobro(sb, i.id, { mp_payment_id: 1 })
    const motivoLargo = 'x'.repeat(500)
    const r = await marcarIntentoRequiereRevision(sb, i.id, motivoLargo)
    assert(r.ok === true, 'falló')
    if (r.ok) {
      assert(r.intento.mp_status_detail!.length === 200, `length: ${r.intento.mp_status_detail!.length}`)
    }
  })

  await check('9. motivo no-string fallback', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_9')
    await aprobarIntentoCobro(sb, i.id, { mp_payment_id: 1 })
    // @ts-expect-error: a propósito un valor no-string
    const r = await marcarIntentoRequiereRevision(sb, i.id, null)
    assert(r.ok === true, 'debió tolerar')
    if (r.ok) assert(r.intento.mp_status_detail!.includes('motivo no provisto'), 'no usó fallback')
  })

  await check('10. atomicidad: WHERE estado=aprobado filtra race', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_rr_10')
    await aprobarIntentoCobro(sb, i.id, { mp_payment_id: 1 })
    // Simular que entre tanto un sweep o admin cambió el estado a algo no-aprobado.
    await actualizarIntentoCobro(sb, i.id, { estado: 'cancelado' })
    const r = await marcarIntentoRequiereRevision(sb, i.id, 'irrelevant')
    assert(r.ok === false, 'no debió aplicar')
    if (!r.ok) {
      assert(r.reason === 'not_in_aprobado', `reason: ${r.reason}`)
      assert(r.intento?.estado === 'cancelado', `estado: ${r.intento?.estado}`)
    }
    // Verificar en DB: no quedó como requiere_revision.
    const real = await obtenerIntentoCobroPorId(sb, i.id)
    assert(real!.estado === 'cancelado', 'sobreescribió el cancelado!')
  })

  await check('11. webhook NO reprocesa intento en requiere_revision', async () => {
    const { sb } = createMockSupabase()
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'AT', refresh_token: 'RT',
      expira_en: new Date(Date.now() + 86400_000 * 180),
      user_id_mp: USER_ID_MP,
      public_key: 'PK', store_id_mp: 'S', external_pos_id: 'P',
      conectado_por: PERFIL,
    })
    const i = await seed(sb, 'sy_rr_11')
    await aprobarIntentoCobro(sb, i.id, { mp_payment_id: 555 })
    await marcarIntentoRequiereRevision(sb, i.id, 'frontend_falla')

    setFetch(async () => jsonResponse(200, {
      id: 555, status: 'approved', status_detail: 'accredited',
      transaction_amount: 1000, external_reference: 'sy_rr_11',
      date_approved: 'x', date_created: 'x',
    }))
    const result = await processMPWebhookNotification({
      dataId: '555',
      headers: signedHeaders('555'),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '555' } }),
      webhookSecret: SECRET,
      supabase: sb,
    })
    assert(result.status === 200, `status: ${result.status}`)
    assert(result.log.event === 'mp_webhook_intento_ya_final', `event: ${result.log.event}`)
    const real = await obtenerIntentoCobroPorId(sb, i.id)
    assert(real!.estado === 'requiere_revision', `webhook pisó el estado: ${real!.estado}`)
    assert(real!.mp_status_detail === 'frontend_falla', 'pisó el motivo')
  })

}

run().then(() => {
  console.log = origLog; console.warn = origWarn
  origLog(`\n[smoke-mp-requiere-revision] ${passed} OK / ${failed} FAIL\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  console.log = origLog; console.warn = origWarn
  origLog(`\n[smoke-mp-requiere-revision] crash: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
