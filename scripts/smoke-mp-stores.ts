// Smoke tests Store/POS MP sin llamadas reales.
//
// Correr con:
//   npx tsx scripts/smoke-mp-stores.ts

import assert from 'node:assert/strict'

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

function parseBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

async function main() {
  await check('external ids Store/POS son deterministicos', () => {
    const comercioId = '520197bd-ac2c-4ffd-a46e-77015b4714b6'
    assert.equal(buildExternalId('STORE', comercioId), 'SYLVORASTORE520197BDAC2C4FFDA46E77015B4714B6')
    assert.equal(buildMPStoreExternalId(comercioId), 'SYLVORASTORE520197BDAC2C4FFDA46E77015B4714B6')
    assert.equal(buildMPPOSExternalId(comercioId), 'SYLVORAPOS520197BDAC2C4FFDA46E77015B4714B6')
  })

  await check('ensureStoreAndPOS crea Store con location fallback valida para MP', async () => {
    const calls: FetchCall[] = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      const url = String(input)
      if (url.includes('/stores/search')) return jsonResponse({ results: [] })
      if (url.endsWith('/users/3385834545/stores')) {
        const body = parseBody(init)
        assert.equal(body.name, 'Kiosco Test')
        assert.equal(body.external_id, 'SYLVORASTORE520197BDAC2C4FFDA46E77015B4714B6')
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
          name: body.name,
          external_id: body.external_id,
          user_id: 3385834545,
        })
      }
      if (url.includes('/pos?')) return jsonResponse({ results: [] })
      if (url.endsWith('/pos')) {
        const body = parseBody(init)
        assert.equal(body.external_id, 'SYLVORAPOS520197BDAC2C4FFDA46E77015B4714B6')
        assert.equal(body.store_id, '987')
        assert.equal(body.fixed_amount, false)
        return jsonResponse({
          id: 654,
          name: body.name,
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
    assert.equal(result.externalPosId, 'SYLVORAPOS520197BDAC2C4FFDA46E77015B4714B6')
    assert.equal(calls.length, 4)
  })

  await check('direccion sin numero usa street_number fallback sin romper Store', async () => {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/stores/search')) return jsonResponse({ results: [] })
      if (url.endsWith('/users/3385834545/stores')) {
        const body = parseBody(init)
        assert.deepEqual(body.location, {
          street_name: 'Local sin numeracion',
          street_number: '0',
          city_name: 'Belgrano',
          state_name: 'Capital Federal',
          latitude: -34.5627,
          longitude: -58.4583,
        })
        return jsonResponse({
          id: 987,
          name: body.name,
          external_id: body.external_id,
          user_id: 3385834545,
        })
      }
      if (url.includes('/pos?')) return jsonResponse({ results: [] })
      if (url.endsWith('/pos')) {
        const body = parseBody(init)
        return jsonResponse({
          id: 654,
          name: body.name,
          external_id: body.external_id,
          store_id: body.store_id,
          user_id: 3385834545,
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }

    await ensureStoreAndPOS({
      accessToken: 'AT_123',
      userIdMp: 3385834545,
      comercio: {
        id: '520197bd-ac2c-4ffd-a46e-77015b4714b6',
        nombre: 'Kiosco Test',
        direccion: 'Local sin numeracion',
      },
    })
  })

  await check('Store y POS existentes se reutilizan sin crear payload nuevo', async () => {
    const calls: FetchCall[] = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      const url = String(input)
      if (url.includes('/stores/search')) {
        return jsonResponse({
          results: [{
            id: 987,
            name: 'Kiosco Test',
            external_id: 'SYLVORASTORE520197BDAC2C4FFDA46E77015B4714B6',
            user_id: 3385834545,
          }],
        })
      }
      if (url.includes('/pos?')) {
        return jsonResponse({
          results: [{
            id: 654,
            name: 'Kiosco Test - Sylvora',
            external_id: 'SYLVORAPOS520197BDAC2C4FFDA46E77015B4714B6',
            store_id: '987',
            user_id: 3385834545,
          }],
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
    assert.equal(result.externalPosId, 'SYLVORAPOS520197BDAC2C4FFDA46E77015B4714B6')
    assert.equal(calls.length, 2)
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
