// Smoke test del token provider. Verifica:
//   1. oauth + comercio conectado → lee de mp_credenciales.
//   2. oauth + comercio NO conectado → MPTokenProviderError 'no_credentials'.
//   3. manual_sandbox + env válida + match → resuelve OK.
//   4. manual_sandbox + MP_ENV=production → 'mode_blocked' SIN tocar nada.
//   5. manual_sandbox + comercioId mismatch → 'comercio_mismatch'.
//   6. manual_sandbox + falta MP_SANDBOX_ACCESS_TOKEN → 'missing_env'.
//   7. manual_sandbox + USER_ID_MP no entero → 'missing_env'.
//   8. MP_MODE inválido → 'invalid_mode'.
//   9. Default sin MP_MODE → oauth.
//  10. console.warn de manual_sandbox NO incluye el access_token.
//
// Correr con:
//   npx tsx scripts/smoke-mp-token-provider.ts

import { randomBytes } from 'node:crypto'

// Key para que crypto.ts no falle al ser cargado transitivamente
// via lib/supabase/mp.ts.
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import {
  resolveAccessToken,
  MPTokenProviderError,
  getMPMode,
  type MPMode,
  type MPTokenResolution,
} from '../lib/mp/token-provider'
import { guardarCredenciales } from '../lib/supabase/mp'

// ────────────────────────────────────────────────────────────────────
// Mock minimal de Supabase para los tests de modo oauth
// ────────────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto'

type Row = Record<string, unknown>

function createMockSupabase() {
  const rows: Row[] = []
  function tableQuery() {
    const filters: Array<[string, unknown]> = []
    let pendingOp:
      | { kind: 'select'; head?: boolean }
      | { kind: 'insert'; row: Row }
      | { kind: 'upsert'; row: Row; onConflict: string }
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
      select(cols: string, opts?: { head?: boolean }) {
        selectedCols = cols.split(',').map(c => c.trim()).filter(Boolean)
        if (pendingOp && pendingOp.kind !== 'select') return q
        pendingOp = { kind: 'select', head: opts?.head }
        return q
      },
      eq(col: string, val: unknown) { filters.push([col, val]); return q },
      insert(row: Row) { pendingOp = { kind: 'insert', row }; return q },
      upsert(row: Row, opts: { onConflict: string }) {
        pendingOp = { kind: 'upsert', row, onConflict: opts.onConflict }; return q
      },
      async maybeSingle() {
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
        if (pendingOp?.kind === 'select') {
          const matched = rows.filter(r => filters.every(([k, v]) => r[k] === v))
          return { data: project(matched[0] ?? null), error: null }
        }
        return { data: null, error: null }
      },
      async single() {
        const r = await q.maybeSingle()
        if (!r.data) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        return r
      },
    }
    return q
  }
  return { from() { return tableQuery() } } as unknown as import('@supabase/supabase-js').SupabaseClient
}

// ────────────────────────────────────────────────────────────────────
// Capturador de console.warn — para verificar que no leakean tokens
// ────────────────────────────────────────────────────────────────────

let warnCalls: string[] = []
const origWarn = console.warn
console.warn = (...args: unknown[]) => {
  warnCalls.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '))
}

function resetWarn() { warnCalls = [] }

// ────────────────────────────────────────────────────────────────────
// Helper: setear el env del modo limpio para cada test
// ────────────────────────────────────────────────────────────────────

const ENV_KEYS = [
  'MP_MODE', 'MP_ENV',
  'MP_SANDBOX_ACCESS_TOKEN', 'MP_SANDBOX_USER_ID_MP',
  'MP_SANDBOX_EXTERNAL_POS_ID', 'MP_SANDBOX_COMERCIO_ID',
] as const

function setEnv(vars: Partial<Record<typeof ENV_KEYS[number], string | undefined>>) {
  for (const k of ENV_KEYS) delete process.env[k]
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v
  }
}

// ────────────────────────────────────────────────────────────────────
// Test runner
// ────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function check(name: string, fn: () => Promise<void>) {
  try {
    resetWarn()
    await fn()
    process.stdout.write(`  ✓ ${name}\n`)
    passed++
  } catch (e) {
    process.stdout.write(`  ✗ ${name}\n`)
    process.stdout.write(`      ${e instanceof Error ? e.message : String(e)}\n`)
    failed++
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function expectError(fn: () => Promise<unknown>, code: string): Promise<MPTokenProviderError> {
  let caught: unknown = null
  try { await fn() } catch (e) { caught = e }
  if (!(caught instanceof MPTokenProviderError)) {
    throw new Error(`esperaba MPTokenProviderError, recibí: ${caught instanceof Error ? caught.name + ' ' + caught.message : String(caught)}`)
  }
  if (caught.code !== code) {
    throw new Error(`esperaba code '${code}', recibí '${caught.code}': ${caught.message}`)
  }
  return caught
}

const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const OTRO_COMERCIO = '00000000-0000-0000-0000-00000000c999'
const PERFIL = '00000000-0000-0000-0000-00000000p001'
const SECRET_TOKEN = 'TEST-SECRET-TOKEN-ABCDEF-12345-NO-DEBE-APARECER-EN-LOGS'

process.stdout.write('\n[smoke-mp-token-provider] Verificando token provider...\n\n')

async function run() {

  await check('1. oauth + comercio conectado → lee de mp_credenciales', async () => {
    setEnv({ MP_MODE: 'oauth', MP_ENV: 'sandbox' })
    const sb = createMockSupabase()
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'OAUTH_AT_42',
      refresh_token: 'OAUTH_RT_42',
      expira_en: new Date(Date.now() + 180 * 86400_000),
      user_id_mp: 4242,
      public_key: 'pk',
      store_id_mp: 'store_oauth',
      external_pos_id: 'pos_oauth_42',
      conectado_por: PERFIL,
    })
    const r: MPTokenResolution = await resolveAccessToken({ comercioId: COMERCIO, supabase: sb })
    assert(r.source === 'oauth', `source: ${r.source}`)
    assert(r.accessToken === 'OAUTH_AT_42', `accessToken: ${r.accessToken}`)
    assert(r.userIdMp === 4242, `userIdMp: ${r.userIdMp}`)
    assert(r.externalPosId === 'pos_oauth_42', `externalPosId: ${r.externalPosId}`)
  })

  await check('2. oauth + comercio NO conectado → no_credentials', async () => {
    setEnv({ MP_MODE: 'oauth', MP_ENV: 'sandbox' })
    const sb = createMockSupabase()
    await expectError(
      () => resolveAccessToken({ comercioId: COMERCIO, supabase: sb }),
      'no_credentials',
    )
  })

  await check('3. manual_sandbox + env OK + match → resuelve', async () => {
    setEnv({
      MP_MODE: 'manual_sandbox',
      MP_ENV: 'sandbox',
      MP_SANDBOX_ACCESS_TOKEN: SECRET_TOKEN,
      MP_SANDBOX_USER_ID_MP: '7777',
      MP_SANDBOX_EXTERNAL_POS_ID: 'sandbox_pos_1',
      MP_SANDBOX_COMERCIO_ID: COMERCIO,
    })
    const sb = createMockSupabase()
    const r = await resolveAccessToken({ comercioId: COMERCIO, supabase: sb })
    assert(r.source === 'manual_sandbox', `source: ${r.source}`)
    assert(r.accessToken === SECRET_TOKEN, 'accessToken no matcheó el env')
    assert(r.userIdMp === 7777, `userIdMp: ${r.userIdMp}`)
    assert(r.externalPosId === 'sandbox_pos_1', 'externalPosId mal')
  })

  await check('4. manual_sandbox + MP_ENV=production → mode_blocked', async () => {
    setEnv({
      MP_MODE: 'manual_sandbox',
      MP_ENV: 'production',
      MP_SANDBOX_ACCESS_TOKEN: SECRET_TOKEN,
      MP_SANDBOX_USER_ID_MP: '7777',
      MP_SANDBOX_EXTERNAL_POS_ID: 'p',
      MP_SANDBOX_COMERCIO_ID: COMERCIO,
    })
    const sb = createMockSupabase()
    const err = await expectError(
      () => resolveAccessToken({ comercioId: COMERCIO, supabase: sb }),
      'mode_blocked',
    )
    // El mensaje NO incluye el token aunque esté en el env.
    assert(!err.message.includes(SECRET_TOKEN), 'mode_blocked leakeó el token en el mensaje')
  })

  await check('5. manual_sandbox + comercioId mismatch → comercio_mismatch', async () => {
    setEnv({
      MP_MODE: 'manual_sandbox',
      MP_ENV: 'sandbox',
      MP_SANDBOX_ACCESS_TOKEN: SECRET_TOKEN,
      MP_SANDBOX_USER_ID_MP: '1',
      MP_SANDBOX_EXTERNAL_POS_ID: 'p',
      MP_SANDBOX_COMERCIO_ID: COMERCIO,
    })
    const sb = createMockSupabase()
    const err = await expectError(
      () => resolveAccessToken({ comercioId: OTRO_COMERCIO, supabase: sb }),
      'comercio_mismatch',
    )
    // No leak del comercio_id "esperado" tampoco — el mensaje es
    // genérico para evitar reconnaissance.
    assert(!err.message.includes(COMERCIO), 'mensaje leakea el comercio configurado')
  })

  await check('6. manual_sandbox + falta MP_SANDBOX_ACCESS_TOKEN → missing_env', async () => {
    setEnv({
      MP_MODE: 'manual_sandbox',
      MP_ENV: 'sandbox',
      // ACCESS_TOKEN faltante
      MP_SANDBOX_USER_ID_MP: '1',
      MP_SANDBOX_EXTERNAL_POS_ID: 'p',
      MP_SANDBOX_COMERCIO_ID: COMERCIO,
    })
    const sb = createMockSupabase()
    const err = await expectError(
      () => resolveAccessToken({ comercioId: COMERCIO, supabase: sb }),
      'missing_env',
    )
    assert(err.message.includes('MP_SANDBOX_ACCESS_TOKEN'), `mensaje no menciona la var: ${err.message}`)
  })

  await check('7. manual_sandbox + USER_ID_MP no entero → missing_env', async () => {
    setEnv({
      MP_MODE: 'manual_sandbox',
      MP_ENV: 'sandbox',
      MP_SANDBOX_ACCESS_TOKEN: SECRET_TOKEN,
      MP_SANDBOX_USER_ID_MP: 'no_es_numero',
      MP_SANDBOX_EXTERNAL_POS_ID: 'p',
      MP_SANDBOX_COMERCIO_ID: COMERCIO,
    })
    const sb = createMockSupabase()
    await expectError(
      () => resolveAccessToken({ comercioId: COMERCIO, supabase: sb }),
      'missing_env',
    )
  })

  await check('8. MP_MODE inválido → invalid_mode', async () => {
    setEnv({ MP_MODE: 'gibberish', MP_ENV: 'sandbox' })
    let caught: unknown = null
    try { getMPMode() } catch (e) { caught = e }
    assert(caught instanceof MPTokenProviderError, 'no tiró')
    assert((caught as MPTokenProviderError).code === 'invalid_mode', `code: ${(caught as MPTokenProviderError).code}`)
  })

  await check('9. Default sin MP_MODE → oauth', async () => {
    setEnv({ MP_ENV: 'sandbox' })   // sin MP_MODE
    const mode: MPMode = getMPMode()
    assert(mode === 'oauth', `default: ${mode}`)
  })

  await check('10. console.warn de manual_sandbox NO incluye el access_token', async () => {
    setEnv({
      MP_MODE: 'manual_sandbox',
      MP_ENV: 'sandbox',
      MP_SANDBOX_ACCESS_TOKEN: SECRET_TOKEN,
      MP_SANDBOX_USER_ID_MP: '1',
      MP_SANDBOX_EXTERNAL_POS_ID: 'sandbox_pos_1',
      MP_SANDBOX_COMERCIO_ID: COMERCIO,
    })
    const sb = createMockSupabase()
    resetWarn()
    await resolveAccessToken({ comercioId: COMERCIO, supabase: sb })
    assert(warnCalls.length >= 1, 'no hubo warn')
    const joined = warnCalls.join('\n')
    assert(!joined.includes(SECRET_TOKEN), `WARN LEAK DEL TOKEN: ${joined}`)
    assert(joined.includes('manual_sandbox_used'), `warn no menciona el evento: ${joined}`)
    assert(joined.includes('DEV/TEMPORAL') || joined.includes('temporal'), `warn no marca temporal: ${joined}`)
  })
}

run().then(() => {
  // Restaurar console.warn para que el resultado final sea visible.
  console.warn = origWarn
  process.stdout.write(`\n[smoke-mp-token-provider] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  console.warn = origWarn
  process.stdout.write(`\n[smoke-mp-token-provider] crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
