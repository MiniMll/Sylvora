// Smoke test del handler del webhook MP.
//
// Cubre:
//   1. Firma inválida → 401 con code en log.
//   2. Firma válida + payment aprobado → intento queda aprobado.
//   3. Firma válida + payment rejected → intento queda rechazado.
//   4. Firma válida + payment pending/in_process → no-op 200.
//   5. user_id sin credenciales → 200 idempotente con warn.
//   6. intento inexistente (external_ref no matchea) → 200 warn.
//   7. intento ya en estado final → no reprocesa, log "ya final".
//   8. payment sin external_reference → 200 info.
//   9. type != payment → 200 ignored.
//  10. MPAuthError al fetch payment → 200 warn ("token inválido").
//  11. MPServerError al fetch payment → 500 (MP reintenta).
//  12. Error de DB al UPDATE → 500.
//  13. JSON body inválido → 200 warn (no 4xx, MP no reintenta).
//  14. Verifica que tokens NO aparecen en los logs estructurados.
//
// Correr con:
//   npx tsx scripts/smoke-mp-webhook-handler.ts

import { createHmac, randomBytes, randomUUID } from 'node:crypto'

// Key de cifrado para que lib/supabase/mp pueda cargar crypto.
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import { processMPWebhookNotification } from '../lib/mp/webhook-handler'
import { guardarCredenciales, crearIntentoCobro, aprobarIntentoCobro, type IntentoCobroMP } from '../lib/supabase/mp'

// Silenciar logs del api-client durante el smoke.
const origLog = console.log
const origWarn = console.warn
console.log = () => {}
console.warn = () => {}

// ────────────────────────────────────────────────────────────────────
// Mock fetch (para mpGet de payments)
// ────────────────────────────────────────────────────────────────────

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchHandler = (url: string, init: FetchInit) => Promise<Response>

let currentFetch: FetchHandler = async () => { throw new Error('no fetch handler') }

globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
  return currentFetch(url, init)
}) as typeof fetch

function setFetch(h: FetchHandler) { currentFetch = h }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// ────────────────────────────────────────────────────────────────────
// Mock Supabase — in-memory con .from/.select/.update/.upsert/.insert/.eq/.maybeSingle/.single
// ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

interface Store { mp_credenciales: Row[]; intentos_cobro_mp: Row[] }

function createMockSupabase(opts?: { onUpdate?: (table: string) => 'throw' | null }) {
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
        const matched = rows.filter(r => filters.every(([k, v]) => r[k] === v))
        if (mode === 'maybeSingle') return { data: project(matched[0] ?? null), error: null }
        if (matched.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        return { data: project(matched[0]), error: null }
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
        if (opts?.onUpdate?.(table) === 'throw') {
          return { data: null, error: { code: 'X', message: 'DB caída simulada' } }
        }
        const matched = rows.filter(r => filters.every(([k, v]) => r[k] === v))
        if (matched.length === 0) return { data: null, error: { code: 'no_rows', message: 'no rows' } }
        for (const r of matched) Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        return { data: project(matched[0]), error: null }
      }
      return { data: null, error: { code: 'noop', message: 'noop' } }
    }
    return q
  }

  const sb = { from(t: string) { return tableQuery(t as keyof Store) } } as unknown as import('@supabase/supabase-js').SupabaseClient
  return { sb, store }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

const SECRET = 'webhook_secret_test_12345'
const USER_ID_MP = 7777
const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const PERFIL = '00000000-0000-0000-0000-00000000p001'
const ACCESS_TOKEN_SENSIBLE = 'TEST-SENSIBLE-ACCESS-TOKEN-XYZ-NUNCA-EN-LOGS'

function signedHeaders(args: { dataId: string; tsSeconds?: number; xRequestId?: string }) {
  const ts = args.tsSeconds ?? Math.floor(Date.now() / 1000)
  const xReq = args.xRequestId ?? randomUUID()
  const manifest = `id:${args.dataId};request-id:${xReq};ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
  const h = new Headers()
  h.set('x-signature', `ts=${ts},v1=${v1}`)
  h.set('x-request-id', xReq)
  return h
}

async function seedComercio(sb: import('@supabase/supabase-js').SupabaseClient) {
  await guardarCredenciales(sb, {
    comercio_id: COMERCIO,
    access_token: ACCESS_TOKEN_SENSIBLE,
    refresh_token: 'RT',
    expira_en: new Date(Date.now() + 180 * 86400_000),
    user_id_mp: USER_ID_MP,
    public_key: 'PK',
    store_id_mp: 'STORE',
    external_pos_id: 'POS_1',
    conectado_por: PERFIL,
  })
}

async function seedIntento(sb: import('@supabase/supabase-js').SupabaseClient, externalRef: string, monto = 1500): Promise<IntentoCobroMP> {
  return crearIntentoCobro(sb, {
    comercio_id: COMERCIO,
    external_reference: externalRef,
    monto, metodo: 'qr',
    expira_en: new Date(Date.now() + 10 * 60_000),
    creado_por: PERFIL,
  })
}

let passed = 0, failed = 0
function check(name: string, fn: () => Promise<void>) {
  return (async () => {
    try {
      await fn()
      origLog(`  ✓ ${name}`)
      passed++
    } catch (e) {
      origLog(`  ✗ ${name}`)
      origLog(`      ${e instanceof Error ? e.message : String(e)}`)
      failed++
    }
  })()
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

origLog('\n[smoke-mp-webhook-handler] Verificando handler webhook...\n')

async function run() {

  await check('1. firma inválida → 401 con code en log', async () => {
    const { sb } = createMockSupabase()
    const r = await processMPWebhookNotification({
      dataId: '999',
      headers: { 'x-signature': 'ts=1,v1=bad', 'x-request-id': 'r' },
      rawBody: '{}',
      webhookSecret: SECRET,
      supabase: sb,
    })
    assert(r.status === 401, `status: ${r.status}`)
    assert(r.log.event === 'mp_webhook_signature_fail', `event: ${r.log.event}`)
    assert(typeof r.log.code === 'string', 'sin code en log')
  })

  await check('2. firma válida + payment aprobado → intento aprobado', async () => {
    const { sb, store } = createMockSupabase()
    await seedComercio(sb)
    const intento = await seedIntento(sb, 'sy_test_2')
    setFetch(async () => jsonResponse(200, {
      id: 555, status: 'approved', status_detail: 'accredited',
      transaction_amount: 1500, external_reference: 'sy_test_2',
      date_approved: '2026-06-08T12:00:00Z', date_created: '2026-06-08T11:59:00Z',
    }))
    const h = signedHeaders({ dataId: '555' })
    const r = await processMPWebhookNotification({
      dataId: '555', headers: h, rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '555' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, `status: ${r.status}`)
    assert(r.log.event === 'mp_webhook_intento_actualizado', `event: ${r.log.event}`)
    const row = store.intentos_cobro_mp.find(x => x.id === intento.id)!
    assert(row.estado === 'aprobado', `estado: ${row.estado}`)
    assert(row.mp_payment_id === 555, `payment_id: ${row.mp_payment_id}`)
  })

  await check('3. firma válida + payment rejected → intento rechazado', async () => {
    const { sb, store } = createMockSupabase()
    await seedComercio(sb)
    const intento = await seedIntento(sb, 'sy_test_3')
    setFetch(async () => jsonResponse(200, {
      id: 556, status: 'rejected', status_detail: 'cc_rejected_other',
      transaction_amount: 1500, external_reference: 'sy_test_3',
      date_approved: null, date_created: '2026-06-08T11:59:00Z',
    }))
    const r = await processMPWebhookNotification({
      dataId: '556', headers: signedHeaders({ dataId: '556' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '556' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status')
    const row = store.intentos_cobro_mp.find(x => x.id === intento.id)!
    assert(row.estado === 'rechazado', `estado: ${row.estado}`)
    assert(row.mp_status_detail === 'cc_rejected_other', 'detail')
  })

  await check('4. payment pending → no-op 200', async () => {
    const { sb, store } = createMockSupabase()
    await seedComercio(sb)
    const intento = await seedIntento(sb, 'sy_test_4')
    setFetch(async () => jsonResponse(200, {
      id: 557, status: 'pending', status_detail: 'pending_waiting_payment',
      transaction_amount: 1500, external_reference: 'sy_test_4', date_approved: null, date_created: 'x',
    }))
    const r = await processMPWebhookNotification({
      dataId: '557', headers: signedHeaders({ dataId: '557' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '557' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status')
    assert(r.log.event === 'mp_webhook_estado_transitorio', `event: ${r.log.event}`)
    const row = store.intentos_cobro_mp.find(x => x.id === intento.id)!
    assert(row.estado === 'pendiente', `no-op: ${row.estado}`)
  })

  await check('5. user_id sin credenciales → 200 warn', async () => {
    const { sb } = createMockSupabase()
    // sin seed de credenciales
    const r = await processMPWebhookNotification({
      dataId: '600', headers: signedHeaders({ dataId: '600' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: 99999, data: { id: '600' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status')
    assert(r.log.event === 'mp_webhook_user_id_sin_credenciales', `event: ${r.log.event}`)
    assert(r.log.level === 'warn', 'level')
  })

  await check('6. intento inexistente → 200 warn', async () => {
    const { sb } = createMockSupabase()
    await seedComercio(sb)
    setFetch(async () => jsonResponse(200, {
      id: 700, status: 'approved', status_detail: 'ok', transaction_amount: 1,
      external_reference: 'sy_no_existe', date_approved: 'x', date_created: 'x',
    }))
    const r = await processMPWebhookNotification({
      dataId: '700', headers: signedHeaders({ dataId: '700' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '700' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status')
    assert(r.log.event === 'mp_webhook_intento_no_encontrado', `event: ${r.log.event}`)
  })

  await check('7. intento ya en estado final → no reprocesa', async () => {
    const { sb, store } = createMockSupabase()
    await seedComercio(sb)
    const intento = await seedIntento(sb, 'sy_test_7')
    await aprobarIntentoCobro(sb, intento.id, { mp_payment_id: 111 })
    setFetch(async () => jsonResponse(200, {
      id: 800, status: 'rejected', status_detail: 'other',
      transaction_amount: 1, external_reference: 'sy_test_7',
      date_approved: null, date_created: 'x',
    }))
    const r = await processMPWebhookNotification({
      dataId: '800', headers: signedHeaders({ dataId: '800' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '800' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status')
    assert(r.log.event === 'mp_webhook_intento_ya_final', `event: ${r.log.event}`)
    const row = store.intentos_cobro_mp.find(x => x.id === intento.id)!
    assert(row.estado === 'aprobado', `no debió reprocesarse: ${row.estado}`)
    assert(row.mp_payment_id === 111, `payment_id sobreescribió: ${row.mp_payment_id}`)
  })

  await check('8. payment sin external_reference → 200 info', async () => {
    const { sb } = createMockSupabase()
    await seedComercio(sb)
    setFetch(async () => jsonResponse(200, {
      id: 900, status: 'approved', status_detail: 'x', transaction_amount: 1,
      external_reference: null, date_approved: 'x', date_created: 'x',
    }))
    const r = await processMPWebhookNotification({
      dataId: '900', headers: signedHeaders({ dataId: '900' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '900' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status')
    assert(r.log.event === 'mp_webhook_payment_sin_external_reference', `event: ${r.log.event}`)
  })

  await check('9. type != payment → 200 ignored', async () => {
    const { sb } = createMockSupabase()
    const r = await processMPWebhookNotification({
      dataId: '999', headers: signedHeaders({ dataId: '999' }),
      rawBody: JSON.stringify({ type: 'merchant_order', user_id: USER_ID_MP, data: { id: '999' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status')
    assert(r.log.event === 'mp_webhook_ignored_type', `event: ${r.log.event}`)
  })

  await check('10. MPAuthError al fetch payment → 200 error (no reintenta MP)', async () => {
    const { sb } = createMockSupabase()
    await seedComercio(sb)
    await seedIntento(sb, 'sy_test_10')
    setFetch(async () => jsonResponse(401, { error: 'invalid_token' }))
    const r = await processMPWebhookNotification({
      dataId: '1000', headers: signedHeaders({ dataId: '1000' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '1000' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status (debería ser 200 para no reintentar)')
    assert(r.log.event === 'mp_webhook_seller_token_invalido', `event: ${r.log.event}`)
    assert(r.log.level === 'error', 'level')
  })

  await check('11. MPServerError al fetch payment → 500 (MP reintenta)', async () => {
    const { sb } = createMockSupabase()
    await seedComercio(sb)
    await seedIntento(sb, 'sy_test_11')
    setFetch(async () => jsonResponse(500, { error: 'internal' }))
    const r = await processMPWebhookNotification({
      dataId: '1100', headers: signedHeaders({ dataId: '1100' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '1100' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 500, 'status')
    assert(r.log.event === 'mp_webhook_mp_unavailable', `event: ${r.log.event}`)
  })

  await check('12. Error de DB al UPDATE → 500', async () => {
    const { sb } = createMockSupabase({ onUpdate: (t) => t === 'intentos_cobro_mp' ? 'throw' : null })
    await seedComercio(sb)
    await seedIntento(sb, 'sy_test_12')
    setFetch(async () => jsonResponse(200, {
      id: 1200, status: 'approved', status_detail: 'x', transaction_amount: 1,
      external_reference: 'sy_test_12', date_approved: 'x', date_created: 'x',
    }))
    const r = await processMPWebhookNotification({
      dataId: '1200', headers: signedHeaders({ dataId: '1200' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '1200' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 500, 'status')
    assert(r.log.event === 'mp_webhook_db_error_update', `event: ${r.log.event}`)
  })

  await check('13. JSON body inválido → 200 warn', async () => {
    const { sb } = createMockSupabase()
    const r = await processMPWebhookNotification({
      dataId: '1300', headers: signedHeaders({ dataId: '1300' }),
      rawBody: 'not-json-{{{', webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, 'status (no 4xx)')
    assert(r.log.event === 'mp_webhook_bad_json', `event: ${r.log.event}`)
  })

  await check('14. Tokens nunca aparecen en logs', async () => {
    const { sb } = createMockSupabase()
    await seedComercio(sb)
    await seedIntento(sb, 'sy_test_14')
    setFetch(async () => jsonResponse(200, {
      id: 1400, status: 'approved', status_detail: 'ok', transaction_amount: 1,
      external_reference: 'sy_test_14', date_approved: 'x', date_created: 'x',
    }))
    const r = await processMPWebhookNotification({
      dataId: '1400', headers: signedHeaders({ dataId: '1400' }),
      rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: '1400' } }),
      webhookSecret: SECRET, supabase: sb,
    })
    const stringified = JSON.stringify(r.log)
    assert(!stringified.includes(ACCESS_TOKEN_SENSIBLE), `LEAK del access_token en log: ${stringified}`)
    assert(!stringified.includes(SECRET), `LEAK del webhook secret: ${stringified}`)
  })

}

run().then(() => {
  console.log = origLog; console.warn = origWarn
  origLog(`\n[smoke-mp-webhook-handler] ${passed} OK / ${failed} FAIL\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  console.log = origLog; console.warn = origWarn
  origLog(`\n[smoke-mp-webhook-handler] crash: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
