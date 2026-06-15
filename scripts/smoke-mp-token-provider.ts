// Smoke test del token provider.
//
// Verifica que OAuth lea credenciales con service role server-side,
// refresque tokens por vencer y nunca loguee secretos.
//
// Correr con:
//   npx tsx scripts/smoke-mp-token-provider.ts

import { randomBytes, randomUUID } from 'node:crypto'

process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')
process.env.SYLVORA_MP_CLIENT_ID = 'APP_123'
process.env.SYLVORA_MP_CLIENT_SECRET = 'CLIENT_SECRET_TEST'
process.env.SYLVORA_MP_REDIRECT_URI = 'https://preview.example/api/mp/oauth/callback'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveAccessToken,
  MPTokenProviderError,
  getMPMode,
  type MPMode,
  type MPTokenResolution,
} from '../lib/mp/token-provider'
import { guardarCredenciales, obtenerCredencialesPorComercio } from '../lib/supabase/mp'

type Row = Record<string, unknown>

function createMockSupabase() {
  const rows: Row[] = []

  function tableQuery() {
    const filters: Array<[string, unknown]> = []
    let pendingOp:
      | { kind: 'select'; head?: boolean }
      | { kind: 'insert'; row: Row }
      | { kind: 'upsert'; row: Row; onConflict: string }
      | { kind: 'update'; patch: Row }
      | null = null
    let selectedCols: string[] | null = null

    function matches(row: Row): boolean {
      return filters.every(([k, v]) => row[k] === v)
    }

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
      update(patch: Row) { pendingOp = { kind: 'update', patch }; return q },
      upsert(row: Row, opts: { onConflict: string }) {
        pendingOp = { kind: 'upsert', row, onConflict: opts.onConflict }; return q
      },
      async maybeSingle() {
        const now = new Date().toISOString()

        if (pendingOp?.kind === 'insert') {
          const inserted: Row = { ...pendingOp.row, actualizado_en: now, creado_en: now, id: randomUUID() }
          rows.push(inserted)
          return { data: project(inserted), error: null }
        }

        if (pendingOp?.kind === 'upsert') {
          const k = pendingOp.onConflict
          const v = pendingOp.row[k]
          const idx = rows.findIndex(r => r[k] === v)
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...pendingOp.row, actualizado_en: now }
            return { data: project(rows[idx]), error: null }
          }
          const inserted: Row = { ...pendingOp.row, actualizado_en: now, conectado_en: now, id: randomUUID() }
          rows.push(inserted)
          return { data: project(inserted), error: null }
        }

        if (pendingOp?.kind === 'update') {
          const idx = rows.findIndex(matches)
          if (idx < 0) return { data: null, error: null }
          rows[idx] = { ...rows[idx], ...pendingOp.patch, actualizado_en: now }
          return { data: project(rows[idx]), error: null }
        }

        const matched = rows.filter(matches)
        return { data: project(matched[0] ?? null), error: null }
      },
      async single() {
        const r = await q.maybeSingle()
        if (!r.data) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        return r
      },
    }
    return q
  }

  return { from() { return tableQuery() } } as unknown as SupabaseClient
}

function createForbiddenSupabase(): SupabaseClient {
  return {
    from(table: string) {
      throw new Error(`userClient no debe leer ${table}`)
    },
  } as unknown as SupabaseClient
}

const originalFetch = globalThis.fetch
const originalWarn = console.warn
const originalLog = console.log
const originalError = console.error

let logCalls: string[] = []
function captureLogs() {
  logCalls = []
  console.warn = (...args: unknown[]) => { logCalls.push(args.map(String).join(' ')) }
  console.log = (...args: unknown[]) => { logCalls.push(args.map(String).join(' ')) }
  console.error = (...args: unknown[]) => { logCalls.push(args.map(String).join(' ')) }
}

function restoreGlobals() {
  console.warn = originalWarn
  console.log = originalLog
  console.error = originalError
  globalThis.fetch = originalFetch
}

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

let passed = 0
let failed = 0

async function check(name: string, fn: () => Promise<void>) {
  try {
    captureLogs()
    await fn()
    restoreGlobals()
    process.stdout.write(`  OK ${name}\n`)
    passed++
  } catch (e) {
    restoreGlobals()
    process.stdout.write(`  FAIL ${name}\n`)
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
    throw new Error(`esperaba MPTokenProviderError, recibi: ${caught instanceof Error ? caught.name + ' ' + caught.message : String(caught)}`)
  }
  if (caught.code !== code) {
    throw new Error(`esperaba code '${code}', recibi '${caught.code}': ${caught.message}`)
  }
  return caught
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function seedCredential(
  sb: SupabaseClient,
  comercioId: string,
  accessToken: string,
  refreshToken: string,
  expiraEn: Date,
) {
  await guardarCredenciales(sb, {
    comercio_id: comercioId,
    access_token: accessToken,
    refresh_token: refreshToken,
    expira_en: expiraEn,
    user_id_mp: comercioId.endsWith('999') ? 9999 : 4242,
    public_key: 'pk',
    store_id_mp: `store_${comercioId.slice(-4)}`,
    external_pos_id: `pos_${comercioId.slice(-4)}`,
    conectado_por: '00000000-0000-0000-0000-00000000a001',
  })
}

const COMERCIO_A = '00000000-0000-0000-0000-00000000c001'
const COMERCIO_B = '00000000-0000-0000-0000-00000000c999'
const SECRET_TOKEN = 'TEST-SECRET-TOKEN-ABCDEF-12345-NO-DEBE-APARECER-EN-LOGS'
const SECRET_REFRESH = 'TEST-REFRESH-TOKEN-ABCDEF-67890-NO-DEBE-APARECER-EN-LOGS'

process.stdout.write('\n[smoke-mp-token-provider] Verificando token provider...\n\n')

async function run() {
  for (const rol of ['cajero', 'encargado', 'admin'] as const) {
    await check(`${rol} puede cobrar con OAuth sin leer mp_credenciales con userClient`, async () => {
      setEnv({ MP_MODE: 'oauth', MP_ENV: 'sandbox' })
      const service = createMockSupabase()
      await seedCredential(service, COMERCIO_A, `OAUTH_AT_${rol}`, `OAUTH_RT_${rol}`, new Date(Date.now() + 180 * 86400_000))

      const r: MPTokenResolution = await resolveAccessToken({
        comercioId: COMERCIO_A,
        supabase: createForbiddenSupabase(),
        supabaseService: service,
      })

      assert(r.source === 'oauth', `source: ${r.source}`)
      assert(r.accessToken === `OAUTH_AT_${rol}`, `accessToken: ${r.accessToken}`)
      assert(r.userIdMp === 4242, `userIdMp: ${r.userIdMp}`)
      assert(r.externalPosId === 'pos_c001', `externalPosId: ${r.externalPosId}`)
    })
  }

  await check('comercio A no puede usar credencial de comercio B', async () => {
    setEnv({ MP_MODE: 'oauth', MP_ENV: 'sandbox' })
    const service = createMockSupabase()
    await seedCredential(service, COMERCIO_B, 'OAUTH_AT_B', 'OAUTH_RT_B', new Date(Date.now() + 180 * 86400_000))

    await expectError(
      () => resolveAccessToken({
        comercioId: COMERCIO_A,
        supabase: createForbiddenSupabase(),
        supabaseService: service,
      }),
      'no_credentials',
    )
  })

  await check('token proximo a expirar se refresca y actualiza credenciales', async () => {
    setEnv({ MP_MODE: 'oauth', MP_ENV: 'sandbox' })
    const service = createMockSupabase()
    await seedCredential(service, COMERCIO_A, SECRET_TOKEN, SECRET_REFRESH, new Date(Date.now() + 60_000))

    globalThis.fetch = async () => jsonResponse({
      access_token: 'OAUTH_AT_REFRESHED',
      token_type: 'bearer',
      expires_in: 15552000,
      scope: 'offline_access read write',
      user_id: 4242,
      refresh_token: 'OAUTH_RT_REFRESHED',
      public_key: 'pk_refreshed',
      live_mode: false,
    })

    const r = await resolveAccessToken({
      comercioId: COMERCIO_A,
      supabase: createForbiddenSupabase(),
      supabaseService: service,
    })

    assert(r.accessToken === 'OAUTH_AT_REFRESHED', `accessToken: ${r.accessToken}`)
    const stored = await obtenerCredencialesPorComercio(service, COMERCIO_A)
    assert(stored?.access_token === 'OAUTH_AT_REFRESHED', 'access token no se actualizo')
    assert(stored?.refresh_token === 'OAUTH_RT_REFRESHED', 'refresh token no se actualizo')
    const joined = logCalls.join('\n')
    assert(!joined.includes(SECRET_TOKEN), 'logs filtraron access token viejo')
    assert(!joined.includes(SECRET_REFRESH), 'logs filtraron refresh token viejo')
    assert(!joined.includes('OAUTH_AT_REFRESHED'), 'logs filtraron access token nuevo')
    assert(!joined.includes('OAUTH_RT_REFRESHED'), 'logs filtraron refresh token nuevo')
    assert(!joined.includes('CLIENT_SECRET_TEST'), 'logs filtraron client secret')
  })

  await check('refresh fallido devuelve reconexion requerida sin filtrar secretos', async () => {
    setEnv({ MP_MODE: 'oauth', MP_ENV: 'sandbox' })
    const service = createMockSupabase()
    await seedCredential(service, COMERCIO_A, SECRET_TOKEN, SECRET_REFRESH, new Date(Date.now() + 60_000))
    globalThis.fetch = async () => jsonResponse({ error: 'invalid_grant', refresh_token: SECRET_REFRESH }, 400)

    await expectError(
      () => resolveAccessToken({
        comercioId: COMERCIO_A,
        supabase: createForbiddenSupabase(),
        supabaseService: service,
      }),
      'mp_reconnect_required',
    )

    const joined = logCalls.join('\n')
    assert(!joined.includes(SECRET_TOKEN), 'logs filtraron access token')
    assert(!joined.includes(SECRET_REFRESH), 'logs filtraron refresh token')
    assert(!joined.includes('CLIENT_SECRET_TEST'), 'logs filtraron client secret')
  })

  await check('manual_sandbox sigue bloqueado en production', async () => {
    setEnv({
      MP_MODE: 'manual_sandbox',
      MP_ENV: 'production',
      MP_SANDBOX_ACCESS_TOKEN: SECRET_TOKEN,
      MP_SANDBOX_USER_ID_MP: '7777',
      MP_SANDBOX_EXTERNAL_POS_ID: 'p',
      MP_SANDBOX_COMERCIO_ID: COMERCIO_A,
    })
    const err = await expectError(
      () => resolveAccessToken({
        comercioId: COMERCIO_A,
        supabase: createForbiddenSupabase(),
        supabaseService: createMockSupabase(),
      }),
      'mode_blocked',
    )
    assert(!err.message.includes(SECRET_TOKEN), 'mode_blocked filtro el token en el mensaje')
  })

  await check('MP_MODE invalido y default oauth conservan comportamiento', async () => {
    setEnv({ MP_MODE: 'gibberish', MP_ENV: 'sandbox' })
    let caught: unknown = null
    try { getMPMode() } catch (e) { caught = e }
    assert(caught instanceof MPTokenProviderError, 'MP_MODE invalido no tiro')
    assert((caught as MPTokenProviderError).code === 'invalid_mode', 'code invalido')

    setEnv({ MP_ENV: 'sandbox' })
    const mode: MPMode = getMPMode()
    assert(mode === 'oauth', `default: ${mode}`)
  })
}

run().then(() => {
  restoreGlobals()
  process.stdout.write(`\n[smoke-mp-token-provider] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  restoreGlobals()
  process.stdout.write(`\n[smoke-mp-token-provider] crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
