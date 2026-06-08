// Smoke test del cliente HTTP MP. Mockea globalThis.fetch para
// validar:
//   1. GET 200 → parsea body y devuelve.
//   2. POST 201 con idempotency key → header pasa.
//   3. GET 429 con Retry-After → respeta y reintenta.
//   4. GET 500 → reintenta hasta agotar.
//   5. GET 401 → MPAuthError, sin retry.
//   6. GET 400 → MPClientError, sin retry.
//   7. POST 500 default → NO reintenta (no idempotente).
//   8. POST 500 con retryNonGet=true → reintenta.
//   9. Timeout → MPNetworkError.
//  10. Body no-JSON con 200 → MPDeserializeError.
//  11. accessToken vacío → MPAuthError sin tocar la red.
//  12. Header X-Request-Id se genera y se manda.
//
// Correr con:
//   npx tsx scripts/smoke-mp-api-client.ts

// Silenciar logs structured del cliente durante el smoke. Lo
// dejamos verbose solo si DEBUG=1.
const DEBUG = process.env.DEBUG === '1'
if (!DEBUG) {
  console.log = () => {}
  console.warn = () => {}
}

// Las env vars no las consume el api-client, pero config.ts las
// requeriría si se accediera. Para evitar accidentes, no las
// seteamos — el api-client no llama a getMPTokenEncryptionKey().

import {
  mpRequest,
  mpGet,
  mpPost,
  MPApiError,
  MPAuthError,
  MPServerError,
  MPClientError,
  MPNetworkError,
  MPDeserializeError,
} from '../lib/mp/api-client'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchHandler = (url: string, init: FetchInit) => Promise<Response>

let currentHandler: FetchHandler = async () => {
  throw new Error('no handler set')
}
let calls: Array<{ url: string; init: FetchInit }> = []

const origFetch = globalThis.fetch
globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
  calls.push({ url, init })
  return currentHandler(url, init)
}) as typeof fetch

function setHandler(h: FetchHandler) {
  currentHandler = h
  calls = []
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function textResponse(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain' } })
}

let passed = 0
let failed = 0

async function check(name: string, fn: () => Promise<void>) {
  try {
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

process.stdout.write('\n[smoke-mp-api-client] Verificando cliente HTTP MP...\n\n')

async function run() {

  await check('1. GET 200 devuelve body parseado', async () => {
    setHandler(async () => jsonResponse(200, { id: 'abc', value: 42 }))
    const result = await mpGet<{ id: string; value: number }>({
      accessToken: 'TEST_TOKEN',
      path: '/v1/test',
      maxRetries: 0,
    })
    assert(result.id === 'abc' && result.value === 42, `body raro: ${JSON.stringify(result)}`)
    assert(calls.length === 1, `esperaba 1 call, hubo ${calls.length}`)
    const auth = (calls[0].init?.headers as Record<string, string>).Authorization
    assert(auth === 'Bearer TEST_TOKEN', `Authorization header malo: ${auth}`)
  })

  await check('2. POST con idempotency key manda el header', async () => {
    setHandler(async () => jsonResponse(201, { id: 'order_1' }))
    await mpPost({
      accessToken: 'T',
      path: '/v1/orders',
      body: { type: 'qr' },
      idempotencyKey: 'idem-123',
      maxRetries: 0,
    })
    const h = calls[0].init?.headers as Record<string, string>
    assert(h['X-Idempotency-Key'] === 'idem-123', `idempotency key no se mandó: ${h['X-Idempotency-Key']}`)
    assert(h['Content-Type'] === 'application/json', 'content-type faltante')
  })

  await check('3. GET 429 con Retry-After respeta y reintenta', async () => {
    let n = 0
    setHandler(async () => {
      n++
      if (n === 1) return jsonResponse(429, { error: 'too_many_requests' }, { 'retry-after': '0' })
      return jsonResponse(200, { ok: true })
    })
    const start = Date.now()
    await mpGet({ accessToken: 'T', path: '/v1/x', maxRetries: 2 })
    const elapsed = Date.now() - start
    assert(n === 2, `esperaba 2 calls, hubo ${n}`)
    assert(elapsed < 2000, `tardó demasiado: ${elapsed}ms (Retry-After: 0 debería ser rápido)`)
  })

  await check('4. GET 500 reintenta y agota maxRetries', async () => {
    setHandler(async () => jsonResponse(500, { error: 'internal' }))
    let threw: MPApiError | null = null
    try {
      await mpGet({ accessToken: 'T', path: '/v1/x', maxRetries: 2 })
    } catch (e) {
      if (e instanceof MPApiError) threw = e
    }
    assert(threw instanceof MPServerError, `error type: ${threw?.name}`)
    assert(calls.length === 3, `esperaba 3 calls (1+2 retries), hubo ${calls.length}`)
  })

  await check('5. GET 401 tira MPAuthError sin retry', async () => {
    setHandler(async () => jsonResponse(401, { error: 'invalid_token' }))
    let threw: MPApiError | null = null
    try {
      await mpGet({ accessToken: 'T', path: '/v1/x', maxRetries: 3 })
    } catch (e) {
      if (e instanceof MPApiError) threw = e
    }
    assert(threw instanceof MPAuthError, `error type: ${threw?.name}`)
    assert(threw?.retryable === false, 'auth error retryable??')
    assert(calls.length === 1, `esperaba 1 call (no retry), hubo ${calls.length}`)
  })

  await check('6. GET 400 tira MPClientError sin retry', async () => {
    setHandler(async () => jsonResponse(400, { error: 'bad_request', message: 'campo X requerido' }))
    let threw: MPApiError | null = null
    try {
      await mpGet({ accessToken: 'T', path: '/v1/x', maxRetries: 3 })
    } catch (e) {
      if (e instanceof MPApiError) threw = e
    }
    assert(threw instanceof MPClientError, `error type: ${threw?.name}`)
    assert(calls.length === 1, `esperaba 1 call, hubo ${calls.length}`)
    assert(threw?.code === 'bad_request', `code: ${threw?.code}`)
    assert(threw?.message.includes('campo X requerido'), `message: ${threw?.message}`)
  })

  await check('7. POST 500 SIN retryNonGet → NO reintenta', async () => {
    setHandler(async () => jsonResponse(500, { error: 'internal' }))
    try {
      await mpPost({ accessToken: 'T', path: '/v1/x', body: {}, maxRetries: 3 })
    } catch { /* expected */ }
    assert(calls.length === 1, `esperaba 1 call (no retry), hubo ${calls.length}`)
  })

  await check('8. POST 500 CON retryNonGet=true → reintenta', async () => {
    let n = 0
    setHandler(async () => {
      n++
      if (n < 3) return jsonResponse(500, { error: 'internal' })
      return jsonResponse(200, { ok: true })
    })
    await mpPost({
      accessToken: 'T',
      path: '/v1/x',
      body: {},
      idempotencyKey: 'k',
      retryNonGet: true,
      maxRetries: 3,
    })
    assert(n === 3, `esperaba 3 calls, hubo ${n}`)
  })

  await check('9. Timeout → MPNetworkError', async () => {
    // El handler honra AbortSignal — simula el comportamiento real
    // de fetch cuando AbortController.abort() dispara.
    setHandler(async (_url, init) => {
      const signal = init?.signal
      return new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(jsonResponse(200, {})), 500)
        signal?.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })
    let threw: MPApiError | null = null
    try {
      await mpGet({ accessToken: 'T', path: '/v1/x', timeoutMs: 30, maxRetries: 0 })
    } catch (e) {
      if (e instanceof MPApiError) threw = e
    }
    assert(threw instanceof MPNetworkError, `error type: ${threw?.name}`)
    assert(threw?.message.toLowerCase().includes('timeout'), `mensaje no menciona timeout: ${threw?.message}`)
  })

  await check('10. Body no-JSON con 200 → MPDeserializeError', async () => {
    setHandler(async () => textResponse(200, '<html>not json</html>'))
    let threw: MPApiError | null = null
    try {
      await mpGet({ accessToken: 'T', path: '/v1/x', maxRetries: 0 })
    } catch (e) {
      if (e instanceof MPApiError) threw = e
    }
    assert(threw instanceof MPDeserializeError, `error type: ${threw?.name}`)
    assert(threw?.retryable === false, 'deserialize retryable??')
  })

  await check('11. accessToken vacío → MPAuthError SIN tocar la red', async () => {
    let touched = false
    setHandler(async () => { touched = true; return jsonResponse(200, {}) })
    let threw: MPApiError | null = null
    try {
      await mpRequest('GET', { accessToken: '', path: '/v1/x' })
    } catch (e) {
      if (e instanceof MPApiError) threw = e
    }
    assert(threw instanceof MPAuthError, `error type: ${threw?.name}`)
    assert(touched === false, 'tocó fetch con token vacío')
  })

  await check('12. X-Request-Id se genera y se manda en headers', async () => {
    setHandler(async () => jsonResponse(200, {}))
    await mpGet({ accessToken: 'T', path: '/v1/x', maxRetries: 0 })
    const h = calls[0].init?.headers as Record<string, string>
    assert(typeof h['X-Request-Id'] === 'string' && h['X-Request-Id'].length > 8, `request id: ${h['X-Request-Id']}`)
  })

  await check('13. retry-after en segundos parsea bien', async () => {
    let n = 0
    setHandler(async () => {
      n++
      if (n === 1) return jsonResponse(429, { error: 'rl' }, { 'retry-after': '1' })
      return jsonResponse(200, { ok: true })
    })
    const start = Date.now()
    await mpGet({ accessToken: 'T', path: '/v1/x', maxRetries: 1 })
    const elapsed = Date.now() - start
    assert(n === 2, 'no reintentó')
    assert(elapsed >= 900, `no respetó el retry-after de 1s: ${elapsed}ms`)
  })

  // Restaurar fetch
  globalThis.fetch = origFetch
}

run().then(() => {
  process.stdout.write(`\n[smoke-mp-api-client] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  process.stdout.write(`\n[smoke-mp-api-client] crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
