// Smoke tests OAuth MP sin llamadas reales.
//
// Correr con:
//   npx tsx scripts/smoke-mp-oauth.ts

import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'

process.env.MP_ENV = 'sandbox'
process.env.SYLVORA_MP_CLIENT_ID = 'APP_123'
process.env.SYLVORA_MP_CLIENT_SECRET = 'CLIENT_SECRET_TEST'
process.env.SYLVORA_MP_REDIRECT_URI = 'https://preview.example/api/mp/oauth/callback'
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import {
  buildMPAuthorizationUrl,
  exchangeAuthorizationCode,
  MPOAuthError,
} from '../lib/mp/oauth'
import {
  buildMPPOSExternalId,
  buildMPStoreExternalId,
  buildExternalId,
  ensureStoreAndPOS,
} from '../lib/mp/stores'

type FetchCall = {
  url: string
  init?: RequestInit
}

const originalFetch = globalThis.fetch

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`OK ${name}`)
  } catch (e) {
    console.error(`FAIL ${name}`)
    throw e
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function main() {
  await check('authorization URL incluye state, client_id y redirect_uri exacta', () => {
    const url = new URL(buildMPAuthorizationUrl('STATE_123'))
    assert.equal(url.origin + url.pathname, 'https://auth.mercadopago.com/authorization')
    assert.equal(url.searchParams.get('client_id'), 'APP_123')
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(url.searchParams.get('platform_id'), 'mp')
    assert.equal(url.searchParams.get('state'), 'STATE_123')
    assert.equal(url.searchParams.get('redirect_uri'), 'https://preview.example/api/mp/oauth/callback')
    assert.equal(url.searchParams.get('client_secret'), null)
  })

  await check('exchangeAuthorizationCode postea JSON correcto a /oauth/token', async () => {
    const calls: FetchCall[] = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return jsonResponse({
        access_token: 'AT_123',
        token_type: 'bearer',
        expires_in: 15552000,
        scope: 'offline_access read write',
        user_id: 3385834545,
        refresh_token: 'RT_123',
        public_key: 'APP_USR_PUBLIC',
        live_mode: false,
      })
    }

    const token = await exchangeAuthorizationCode('CODE_123')
    assert.equal(token.access_token, 'AT_123')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.mercadopago.com/oauth/token')
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>
    assert.equal(body.client_id, 'APP_123')
    assert.equal(body.client_secret, 'CLIENT_SECRET_TEST')
    assert.equal(body.code, 'CODE_123')
    assert.equal(body.grant_type, 'authorization_code')
    assert.equal(body.redirect_uri, 'https://preview.example/api/mp/oauth/callback')
    assert.equal(body.test_token, 'true')
  })

  await check('exchangeAuthorizationCode falla controlado si MP devuelve error', async () => {
    globalThis.fetch = async () => jsonResponse({ error: 'invalid_grant', access_token: 'SHOULD_REDACT' }, 400)
    await assert.rejects(
      () => exchangeAuthorizationCode('BAD_CODE'),
      (e: unknown) => e instanceof MPOAuthError && e.code === 'http_error' && e.status === 400,
    )
  })

  await check('external ids Store/POS son deterministicos por comercio', () => {
    const comercioId = '520197bd-ac2c-4ffd-a46e-77015b4714b6'
    assert.equal(buildExternalId('STORE', comercioId), 'SYLVORASTORE520197BDAC2C4FFD')
    assert.equal(buildMPStoreExternalId(comercioId), 'SYLVORASTORE520197BDAC2C4FFD')
    assert.equal(buildMPPOSExternalId(comercioId), 'SYLVORAPOS520197BDAC2C4FFD')
  })

  await check('ensureStoreAndPOS crea Store y POS con fetch mockeado', async () => {
    const calls: FetchCall[] = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      const url = String(input)
      if (url.includes('/stores/search')) return jsonResponse({ results: [] })
      if (url.endsWith('/users/3385834545/stores')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        assert.equal(body.external_id, 'SYLVORASTORE520197BDAC2C4FFD')
        assert.deepEqual(body.location, {
          street_name: 'Av Test',
          street_number: '123',
          city_name: 'Belgrano',
          state_name: 'Capital Federal',
          latitude: -34.5627,
          longitude: -58.4583,
        })
        return jsonResponse({
          id: 987,
          name: 'Kiosco Test',
          external_id: body.external_id,
          user_id: 3385834545,
        })
      }
      if (url.includes('/pos?')) return jsonResponse({ results: [] })
      if (url.endsWith('/pos')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        assert.equal(body.external_id, 'SYLVORAPOS520197BDAC2C4FFD')
        assert.equal(body.store_id, '987')
        assert.equal(body.fixed_amount, false)
        return jsonResponse({
          id: 654,
          name: 'Kiosco Test - Sylvora',
          external_id: body.external_id,
          store_id: body.store_id,
          user_id: 3385834545,
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }

    const result = await ensureStoreAndPOS({
      accessToken: 'AT_123',
      userIdMp: 3385834545,
      comercio: {
        id: '520197bd-ac2c-4ffd-a46e-77015b4714b6',
        nombre: 'Kiosco Test',
        direccion: 'Av Test 123',
      },
    })

    assert.equal(result.storeIdMp, '987')
    assert.equal(result.externalPosId, 'SYLVORAPOS520197BDAC2C4FFD')
    assert.equal(calls.length, 5)
  })
}

main()
  .finally(() => {
    globalThis.fetch = originalFetch
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

