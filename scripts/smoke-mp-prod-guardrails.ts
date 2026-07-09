// Smoke test — Sprint QA-1, hallazgo M1: guardrails de producción de MP.
//
// Demuestra que el bypass de firma del webhook (MP_WEBHOOK_ALLOW_UNSIGNED_
// SANDBOX) está ESTRICTAMENTE acotado a sandbox+manual_sandbox+flag y NO
// puede filtrarse a producción, y que el flujo FIRMADO normal sigue
// funcionando en config de prod. Complementa smoke-mp-token-provider.ts
// (que ya testea manual_sandbox bloqueado en production del lado del token).
//
//   1. producción + flag=true + manual_sandbox + firma mala → 401
//      (el bypass NO se aplica en prod — hard guard, el corazón de M1).
//   2. sandbox + flag=true + manual_sandbox + firma mala → 200
//      (el bypass SÍ se aplica en dev — la afordancia existe solo acá).
//   3. sandbox + manual_sandbox + SIN flag + firma mala → 401
//      (el bypass exige el flag explícito).
//   4. sandbox + oauth + flag=true + firma mala → 401
//      (el bypass exige MP_MODE=manual_sandbox, no oauth).
//   5. producción + oauth + firma VÁLIDA + payment approved → 200 + aprobado
//      (el flujo firmado normal de prod queda intacto).
//
// Guard fail-loud de arranque (assertMPProductionConfig, M1):
//   6. prod + manual_sandbox → tira (mensaje menciona MP_MODE).
//   7. prod + ALLOW_UNSIGNED → tira (menciona el flag).
//   8. prod + una MP_SANDBOX_* → tira (menciona sandbox).
//   9. prod + falta una var obligatoria → tira (menciona la var).
//  10. prod + oauth + todas las vars + sin sandbox → NO tira.
//  11. sandbox + config sandbox → NO tira (no-op fuera de producción).
//
// Correr con:
//   npx tsx scripts/smoke-mp-prod-guardrails.ts

import { createHmac, randomBytes, randomUUID } from 'node:crypto'

// Key de cifrado para que lib/supabase/mp pueda cargar crypto.
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import { processMPWebhookNotification } from '../lib/mp/webhook-handler'
import { assertMPProductionConfig } from '../lib/mp/config'
import { guardarCredenciales, crearIntentoCobro } from '../lib/supabase/mp'
import type { SupabaseClient } from '@supabase/supabase-js'

// Silenciar logs estructurados del handler durante el smoke.
const origLog = console.log
const origWarn = console.warn
const origError = console.error
console.log = () => {}
console.warn = () => {}
console.error = () => {}

// ── Mock fetch (para el GET del payment en el caso firmado) ──────────
type FetchInit = Parameters<typeof fetch>[1]
let currentFetch: (url: string, init: FetchInit) => Promise<Response> =
  async () => { throw new Error('no fetch handler') }
globalThis.fetch = (async (input: unknown, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
  return currentFetch(url, init)
}) as typeof fetch
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// ── Mock Supabase (mp_credenciales + intentos_cobro_mp) ─────────────
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
    function matches(r: Row): boolean { return filters.every(([k, v]) => r[k] === v) }
    const q = {
      select(cols: string) {
        selectedCols = cols.split(',').map(c => c.trim())
        if (!pendingOp) pendingOp = { kind: 'select' }
        return q
      },
      eq(c: string, v: unknown) { filters.push([c, v]); return q },
      insert(row: Row) { pendingOp = { kind: 'insert', row }; return q },
      upsert(row: Row, o: { onConflict: string }) { pendingOp = { kind: 'upsert', row, onConflict: o.onConflict }; return q },
      update(patch: Row) { pendingOp = { kind: 'update', patch }; return q },
      async maybeSingle() { return execute('maybeSingle') },
      async single() { return execute('single') },
    }
    function execute(mode: 'maybeSingle' | 'single') {
      const rows = store[table]
      if (pendingOp?.kind === 'select') {
        const matched = rows.filter(matches)
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
        const now = new Date().toISOString()
        const idx = rows.findIndex(r => r[k] === v)
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...pendingOp.row, actualizado_en: now }
          return { data: project(rows[idx]), error: null }
        }
        const inserted: Row = { ...pendingOp.row, id: randomUUID(), actualizado_en: now, conectado_en: now }
        rows.push(inserted)
        return { data: project(inserted), error: null }
      }
      if (pendingOp?.kind === 'update') {
        const matched = rows.filter(matches)
        if (matched.length === 0) return mode === 'maybeSingle' ? { data: null, error: null } : { data: null, error: { code: 'no_rows', message: 'no rows' } }
        for (const r of matched) Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        return { data: project(matched[0]), error: null }
      }
      return { data: null, error: { code: 'noop', message: 'noop' } }
    }
    return q
  }
  const sb = { from(t: string) { return tableQuery(t as keyof Store) } } as unknown as SupabaseClient
  return { sb, store }
}

// ── Helpers ─────────────────────────────────────────────────────────
const SECRET = 'webhook_secret_test_12345'
const USER_ID_MP = 7777
const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const PERFIL = '00000000-0000-0000-0000-00000000p001'

// Firma inválida con timestamp FRESCO (dentro de la tolerancia de 5 min):
// pasa el chequeo de timestamp pero el v1 no matchea → code
// 'signature_mismatch', que es uno de los bypassables. Con ts viejo daría
// 'timestamp_too_old' (no bypassable) y no ejercitaría el guard.
function badSig(): Headers {
  const ts = Math.floor(Date.now() / 1000)
  const h = new Headers()
  h.set('x-signature', `ts=${ts},v1=deadbeefdeadbeef`)
  h.set('x-request-id', randomUUID())
  return h
}

function signedHeaders(dataId: string): Headers {
  const ts = Math.floor(Date.now() / 1000)
  const xReq = randomUUID()
  const manifest = `id:${dataId};request-id:${xReq};ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
  const h = new Headers()
  h.set('x-signature', `ts=${ts},v1=${v1}`)
  h.set('x-request-id', xReq)
  return h
}

const ENV_KEYS = [
  'MP_ENV', 'MP_MODE', 'MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX',
  'MP_SANDBOX_ACCESS_TOKEN', 'MP_SANDBOX_USER_ID_MP',
  'MP_SANDBOX_EXTERNAL_POS_ID', 'MP_SANDBOX_COMERCIO_ID',
] as const
function setEnv(vars: Partial<Record<typeof ENV_KEYS[number], string>>) {
  for (const k of ENV_KEYS) delete process.env[k]
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v
}

// Envs de sandbox completas (para los casos que las necesiten presentes).
const SANDBOX_ENVS = {
  MP_SANDBOX_ACCESS_TOKEN: 'TEST-SANDBOX-TOKEN',
  MP_SANDBOX_USER_ID_MP: '8888',
  MP_SANDBOX_EXTERNAL_POS_ID: 'POS_SANDBOX',
  MP_SANDBOX_COMERCIO_ID: COMERCIO,
}

// ── Env helpers para el guard de arranque (assertMPProductionConfig) ──
// SYLVORA_MP_TOKEN_ENCRYPTION_KEY se setea en el top (para crypto) y se
// mantiene siempre presente — no entra en el reset.
const PROD_REQUIRED = {
  SYLVORA_MP_CLIENT_ID: 'APP_PROD',
  SYLVORA_MP_CLIENT_SECRET: 'SECRET_PROD',
  SYLVORA_MP_REDIRECT_URI: 'https://prod.example/api/mp/oauth/callback',
  SYLVORA_MP_WEBHOOK_SECRET: 'WHSEC_PROD',
}
const GUARD_ENV_KEYS = [
  ...ENV_KEYS,
  'SYLVORA_MP_CLIENT_ID', 'SYLVORA_MP_CLIENT_SECRET',
  'SYLVORA_MP_REDIRECT_URI', 'SYLVORA_MP_WEBHOOK_SECRET',
] as const
function setGuardEnv(vars: Partial<Record<typeof GUARD_ENV_KEYS[number], string>>) {
  for (const k of GUARD_ENV_KEYS) delete process.env[k]
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v
}
function expectThrows(fn: () => void, mustInclude: string): void {
  let msg: string | null = null
  try { fn() } catch (e) { msg = e instanceof Error ? e.message : String(e) }
  if (msg === null) throw new Error('esperaba que tirara y no tiró')
  if (!msg.includes(mustInclude)) throw new Error(`mensaje no incluye "${mustInclude}": ${msg}`)
}

const payloadPayment = (userId: number, dataId: string) =>
  JSON.stringify({ type: 'payment', action: 'payment.updated', user_id: userId, data: { id: dataId } })

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); origLog(`  ✓ ${name}`); passed++ }
  catch (e) { origLog(`  ✗ ${name}`); origLog(`      ${e instanceof Error ? e.message : String(e)}`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

origLog('\n[smoke-mp-prod-guardrails] Guardrails de producción MP (QA-1 M1)...\n')

async function run() {
  await check('1. producción + flag + manual_sandbox + firma mala → 401 (bypass NO aplica en prod)', async () => {
    setEnv({ MP_ENV: 'production', MP_MODE: 'manual_sandbox', MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX: 'true', ...SANDBOX_ENVS })
    const { sb } = createMockSupabase()
    const r = await processMPWebhookNotification({
      dataId: 'pay_x', headers: badSig(), rawBody: payloadPayment(USER_ID_MP, 'pay_x'),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 401, `esperaba 401, got ${r.status}`)
  })

  await check('2. sandbox + flag + manual_sandbox + firma mala → 200 (bypass aplica solo acá)', async () => {
    setEnv({ MP_ENV: 'sandbox', MP_MODE: 'manual_sandbox', MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX: 'true', ...SANDBOX_ENVS })
    const { sb } = createMockSupabase()
    // user_id 9999 no matchea el sandbox (8888) ni hay credencial en DB →
    // el handler pasa el gate de firma (bypass) y corta en "sin credenciales" con 200.
    const r = await processMPWebhookNotification({
      dataId: 'pay_x', headers: badSig(), rawBody: payloadPayment(9999, 'pay_x'),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, `esperaba 200 (bypass aplicado), got ${r.status}`)
  })

  await check('3. sandbox + manual_sandbox + SIN flag + firma mala → 401 (exige el flag)', async () => {
    setEnv({ MP_ENV: 'sandbox', MP_MODE: 'manual_sandbox', ...SANDBOX_ENVS })
    const { sb } = createMockSupabase()
    const r = await processMPWebhookNotification({
      dataId: 'pay_x', headers: badSig(), rawBody: payloadPayment(USER_ID_MP, 'pay_x'),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 401, `esperaba 401, got ${r.status}`)
  })

  await check('4. sandbox + oauth + flag + firma mala → 401 (exige manual_sandbox)', async () => {
    setEnv({ MP_ENV: 'sandbox', MP_MODE: 'oauth', MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX: 'true' })
    const { sb } = createMockSupabase()
    const r = await processMPWebhookNotification({
      dataId: 'pay_x', headers: badSig(), rawBody: payloadPayment(USER_ID_MP, 'pay_x'),
      webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 401, `esperaba 401, got ${r.status}`)
  })

  await check('5. producción + oauth + firma VÁLIDA + approved → 200 + intento aprobado (flujo normal intacto)', async () => {
    setEnv({ MP_ENV: 'production', MP_MODE: 'oauth' })
    const { sb, store } = createMockSupabase()
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO, access_token: 'PROD-AT', refresh_token: 'RT',
      expira_en: new Date(Date.now() + 180 * 86400_000), user_id_mp: USER_ID_MP,
      public_key: 'PK', store_id_mp: 'STORE', external_pos_id: 'POS_1', conectado_por: PERFIL,
    })
    const externalRef = 'ext-guardrails-1'
    await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: externalRef, monto: 1500, metodo: 'qr',
      expira_en: new Date(Date.now() + 10 * 60_000), creado_por: PERFIL,
    })
    currentFetch = async () => jsonResponse(200, {
      id: 'pay_1', status: 'approved', status_detail: 'accredited',
      external_reference: externalRef, date_approved: new Date().toISOString(),
    })
    const r = await processMPWebhookNotification({
      dataId: 'pay_1', headers: signedHeaders('pay_1'),
      rawBody: payloadPayment(USER_ID_MP, 'pay_1'), webhookSecret: SECRET, supabase: sb,
    })
    assert(r.status === 200, `esperaba 200, got ${r.status}`)
    const intento = store.intentos_cobro_mp.find(i => i.external_reference === externalRef)
    assert(intento?.estado === 'aprobado', `intento no quedó aprobado: ${intento?.estado}`)
  })

  // ── Guard fail-loud de arranque (assertMPProductionConfig) ────────
  await check('6. guard: prod + manual_sandbox → tira (menciona MP_MODE)', async () => {
    setGuardEnv({ MP_ENV: 'production', MP_MODE: 'manual_sandbox', ...PROD_REQUIRED })
    expectThrows(() => assertMPProductionConfig(), 'MP_MODE')
  })

  await check('7. guard: prod + ALLOW_UNSIGNED → tira (menciona el flag)', async () => {
    setGuardEnv({ MP_ENV: 'production', MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX: 'true', ...PROD_REQUIRED })
    expectThrows(() => assertMPProductionConfig(), 'MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX')
  })

  await check('8. guard: prod + MP_SANDBOX_* → tira (menciona sandbox)', async () => {
    setGuardEnv({ MP_ENV: 'production', MP_SANDBOX_ACCESS_TOKEN: 'x', ...PROD_REQUIRED })
    expectThrows(() => assertMPProductionConfig(), 'MP_SANDBOX_ACCESS_TOKEN')
  })

  await check('9. guard: prod + falta var obligatoria → tira (menciona la var)', async () => {
    // Todas menos SYLVORA_MP_CLIENT_SECRET (TOKEN_ENCRYPTION_KEY viene del top).
    setGuardEnv({
      MP_ENV: 'production', MP_MODE: 'oauth',
      SYLVORA_MP_CLIENT_ID: 'a', SYLVORA_MP_REDIRECT_URI: 'b', SYLVORA_MP_WEBHOOK_SECRET: 'c',
    })
    expectThrows(() => assertMPProductionConfig(), 'SYLVORA_MP_CLIENT_SECRET')
  })

  await check('10. guard: prod + oauth + todo seteado + sin sandbox → NO tira', async () => {
    setGuardEnv({ MP_ENV: 'production', MP_MODE: 'oauth', ...PROD_REQUIRED })
    assertMPProductionConfig()  // no debe tirar
  })

  await check('11. guard: sandbox + config sandbox → NO tira (no-op fuera de prod)', async () => {
    setGuardEnv({
      MP_ENV: 'sandbox', MP_MODE: 'manual_sandbox',
      MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX: 'true', MP_SANDBOX_ACCESS_TOKEN: 'x',
    })
    assertMPProductionConfig()  // no-op → no debe tirar
  })
}

run().then(() => {
  console.log = origLog; console.warn = origWarn; console.error = origError
  origLog(`\n[smoke-mp-prod-guardrails] ${passed} OK / ${failed} FAIL\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  console.log = origLog; console.warn = origWarn; console.error = origError
  origLog(`\n[smoke-mp-prod-guardrails] crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
