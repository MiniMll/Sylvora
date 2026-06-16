// Smoke test del wrapper Orders API + identifiers.
//
// El route handler POST /api/mp/cobros lo testeamos manualmente con
// curl (ver instrucciones al final del archivo) porque su dependencia
// con cookies/SSR de Next.js + Supabase auth real no se mockea bien
// con un script standalone.
//
// Cubrimos:
//   1. generateExternalReference: formato sy_<32hex>, único.
//   2. isValidExternalReference: regex MP-compatible.
//   3. idempotencyKeyForOrder: determinístico, mismo input => misma key.
//   4. idempotencyKeyForOrder rechaza external_ref inválido.
//   5. crearOrderQR: arma body correcto y manda X-Idempotency-Key.
//   6. crearOrderQR: extrae qr_data del nivel root.
//   7. crearOrderQR: extrae qr_data desde point_of_interaction como fallback.
//   8. crearOrderQR: extrae checkout_url de point_of_interaction.
//   9. crearOrderQR: monto=0 rechaza antes de llamar a MP.
//  10. crearOrderQR: monto se formatea con 2 decimales fijos.
//  11. crearOrderQR: propaga MPApiError sin tragarlo.
//  12. crearOrderQR: NO manda notification_url aunque SYLVORA_MP_WEBHOOK_URL exista.
//
// Correr con:
//   npx tsx scripts/smoke-mp-orders.ts

import {
  generateExternalReference,
  isValidExternalReference,
  idempotencyKeyForOrder,
} from '../lib/mp/identifiers'
import { crearOrderQR } from '../lib/mp/orders'
import { MPClientError } from '../lib/mp/api-client'

// Silenciar logs del api-client en el smoke.
console.log = () => {}
console.warn = () => {}

// Mock fetch
type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchHandler = (url: string, init: FetchInit) => Promise<Response>

let currentHandler: FetchHandler = async () => { throw new Error('no handler') }
let calls: Array<{ url: string; init: FetchInit }> = []

globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
  calls.push({ url, init })
  return currentHandler(url, init)
}) as typeof fetch

function setHandler(h: FetchHandler) {
  currentHandler = h
  calls = []
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void> | void) {
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
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-mp-orders] Verificando wrapper Orders API + identifiers...\n\n')

async function run() {

  // Identifiers

  await check('1. generateExternalReference: formato sy_<32hex>, único', () => {
    const a = generateExternalReference()
    const b = generateExternalReference()
    assert(/^sy_[a-f0-9]{32}$/.test(a), `formato malo: ${a}`)
    assert(/^sy_[a-f0-9]{32}$/.test(b), `formato malo: ${b}`)
    assert(a !== b, 'no es único')
    assert(a.length === 35, `length ${a.length}`)
  })

  await check('2. isValidExternalReference: regex MP-compatible', () => {
    assert(isValidExternalReference('sy_abc123'), 'sy_abc123 debería ser válido')
    assert(isValidExternalReference('A-B_C-123'), 'hyphens y underscore válidos')
    assert(!isValidExternalReference(''), 'vacío inválido')
    assert(!isValidExternalReference('sy_abc def'), 'espacios inválidos')
    assert(!isValidExternalReference('sy_;drop'), 'caracteres raros inválidos')
    assert(!isValidExternalReference('a'.repeat(65)), '>64 chars inválido')
    assert(isValidExternalReference('a'.repeat(64)), '64 chars exactos válido')
  })

  await check('3. idempotencyKeyForOrder: determinístico', () => {
    const ref = generateExternalReference()
    const k1 = idempotencyKeyForOrder(ref)
    const k2 = idempotencyKeyForOrder(ref)
    assert(k1 === k2, `mismas keys distintas: ${k1} vs ${k2}`)
    assert(k1.startsWith('order_create_'), 'prefijo mal')
    assert(k1.endsWith(ref), 'suffix mal')
  })

  await check('4. idempotencyKeyForOrder rechaza external_ref inválido', () => {
    let threw = false
    try { idempotencyKeyForOrder('') } catch { threw = true }
    assert(threw, 'no rechazó vacío')
    threw = false
    try { idempotencyKeyForOrder('contiene espacios') } catch { threw = true }
    assert(threw, 'no rechazó espacios')
  })

  // crearOrderQR

  await check('5. crearOrderQR: arma body correcto y manda X-Idempotency-Key', async () => {
    setHandler(async () => jsonResponse(201, { id: 'order_xyz', type: 'qr', status: 'created', total_amount: '1500.00', external_reference: 'sy_test' }))
    const ref = 'sy_test_ref_5'
    await crearOrderQR({
      accessToken: 'AT',
      externalPosId: 'POS_1',
      externalReference: ref,
      monto: 1500,
      descripcion: 'Venta de prueba',
    })
    assert(calls.length === 1, 'esperaba 1 call')
    const init = calls[0].init
    assert(init?.method === 'POST', `method ${init?.method}`)
    const headers = init?.headers as Record<string, string>
    assert(headers['X-Idempotency-Key'] === `order_create_${ref}`, `idem key: ${headers['X-Idempotency-Key']}`)
    assert(headers['Authorization'] === 'Bearer AT', `auth: ${headers['Authorization']}`)
    const body = JSON.parse(init?.body as string)
    assert(body.type === 'qr', `type: ${body.type}`)
    assert(body.total_amount === '1500.00', `total_amount: ${body.total_amount}`)
    assert(body.external_reference === ref, 'external_reference no matchea')
    assert(body.config.qr.external_pos_id === 'POS_1', 'pos id mal')
    assert(body.config.qr.mode === 'dynamic', 'mode mal')
    assert(body.description === 'Venta de prueba', 'descripcion mal')
    assert(typeof body.transactions === 'object' && body.transactions !== null, 'transactions ausente')
    assert(Array.isArray(body.transactions.payments), 'transactions.payments no es array')
    assert(body.transactions.payments.length === 1, `payments len: ${body.transactions.payments.length}`)
    assert(body.transactions.payments[0].amount === '1500.00', `payments[0].amount: ${body.transactions.payments[0].amount}`)
  })

  await check('5b. crearOrderQR: total_amount === SUM(transactions.payments[].amount)', async () => {
    setHandler(async () => jsonResponse(201, { id: 'o', type: 'qr', status: 'created', total_amount: '0', external_reference: 'x' }))
    await crearOrderQR({
      accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_5b', monto: 2547.83,
    })
    const body = JSON.parse(calls[0].init?.body as string)
    const total = body.total_amount as string
    const sumPayments = body.transactions.payments
      .reduce((acc: number, p: { amount: string }) => acc + Number(p.amount), 0)
      .toFixed(2)
    assert(total === '2547.83', `total_amount: ${total}`)
    assert(sumPayments === total, `sum payments (${sumPayments}) != total_amount (${total})`)
  })

  await check('5c. crearOrderQR: sin descripcion -> no incluye description en body', async () => {
    setHandler(async () => jsonResponse(201, { id: 'o', type: 'qr', status: 'created', total_amount: '0', external_reference: 'x' }))
    await crearOrderQR({
      accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_5c', monto: 100,
    })
    const body = JSON.parse(calls[0].init?.body as string)
    assert(!('description' in body), `description presente con undefined: ${JSON.stringify(body)}`)
    assert('transactions' in body, 'transactions ausente sin descripcion')
  })

  await check('5d. crearOrderQR: NO incluye notification_url aunque SYLVORA_MP_WEBHOOK_URL exista', async () => {
    const prevUrl = process.env.SYLVORA_MP_WEBHOOK_URL
    const prevEnv = process.env.MP_ENV
    const prevMode = process.env.MP_MODE
    process.env.SYLVORA_MP_WEBHOOK_URL = 'https://preview.example/api/mp/webhook?x-vercel-protection-bypass=secret'
    process.env.MP_ENV = 'sandbox'
    process.env.MP_MODE = 'manual_sandbox'
    try {
      setHandler(async () => jsonResponse(201, { id: 'o', type: 'qr', status: 'created', total_amount: '0', external_reference: 'x' }))
      await crearOrderQR({
        accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_5d', monto: 100,
      })
      const body = JSON.parse(calls[0].init?.body as string)
      assert(!('notification_url' in body), `notification_url no permitido en Orders QR: ${JSON.stringify(body)}`)
    } finally {
      if (prevUrl === undefined) delete process.env.SYLVORA_MP_WEBHOOK_URL
      else process.env.SYLVORA_MP_WEBHOOK_URL = prevUrl
      if (prevEnv === undefined) delete process.env.MP_ENV
      else process.env.MP_ENV = prevEnv
      if (prevMode === undefined) delete process.env.MP_MODE
      else process.env.MP_MODE = prevMode
    }
  })

  await check('6. crearOrderQR: extrae qr_data del nivel root', async () => {
    setHandler(async () => jsonResponse(201, {
      id: 'order_6',
      type: 'qr',
      status: 'created',
      total_amount: '100.00',
      external_reference: 'sy_test',
      qr_data: 'QR_RAW_DATA_AT_ROOT',
    }))
    const r = await crearOrderQR({
      accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_6', monto: 100,
    })
    assert(r.qrData === 'QR_RAW_DATA_AT_ROOT', `qr_data: ${r.qrData}`)
    assert(r.orderIdMp === 'order_6', `orderId: ${r.orderIdMp}`)
  })

  await check('7. crearOrderQR: extrae qr_data desde point_of_interaction (fallback)', async () => {
    setHandler(async () => jsonResponse(201, {
      id: 'order_7', type: 'qr', status: 'created',
      total_amount: '100.00', external_reference: 'sy_test',
      point_of_interaction: { transaction_data: { qr_code: 'QR_FROM_POI' } },
    }))
    const r = await crearOrderQR({
      accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_7', monto: 100,
    })
    assert(r.qrData === 'QR_FROM_POI', `qr_data: ${r.qrData}`)
  })

  await check('8. crearOrderQR: extrae checkout_url (ticket_url) de POI', async () => {
    setHandler(async () => jsonResponse(201, {
      id: 'order_8', type: 'qr', status: 'created',
      total_amount: '100.00', external_reference: 'sy_test',
      point_of_interaction: { transaction_data: { ticket_url: 'https://mp.example/checkout/xyz' } },
    }))
    const r = await crearOrderQR({
      accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_8', monto: 100,
    })
    assert(r.checkoutUrl === 'https://mp.example/checkout/xyz', `checkout: ${r.checkoutUrl}`)
    assert(r.qrData === null, 'qrData debería ser null')
  })

  await check('9. crearOrderQR: monto 0 rechaza ANTES de llamar a MP', async () => {
    let touched = false
    setHandler(async () => { touched = true; return jsonResponse(201, {}) })
    let threw = false
    try {
      await crearOrderQR({ accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_9', monto: 0 })
    } catch { threw = true }
    assert(threw, 'no tiró con monto 0')
    assert(touched === false, 'tocó fetch con monto 0')
  })

  await check('10. crearOrderQR: monto se formatea con 2 decimales', async () => {
    setHandler(async () => jsonResponse(201, { id: 'order_10', type: 'qr', status: 'created', total_amount: '0', external_reference: 'x' }))
    await crearOrderQR({ accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_10', monto: 1500.5 })
    const body = JSON.parse(calls[0].init?.body as string)
    assert(body.total_amount === '1500.50', `total_amount: ${body.total_amount}`)

    setHandler(async () => jsonResponse(201, { id: 'order_10b', type: 'qr', status: 'created', total_amount: '0', external_reference: 'x' }))
    await crearOrderQR({ accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_10b', monto: 1500 })
    const body2 = JSON.parse(calls[0].init?.body as string)
    assert(body2.total_amount === '1500.00', `total_amount entero: ${body2.total_amount}`)
  })

  await check('11. crearOrderQR: propaga MPApiError sin tragarlo', async () => {
    setHandler(async () => jsonResponse(400, { error: 'invalid_total_amount', message: 'total_amount inválido' }))
    let caught: unknown = null
    try {
      await crearOrderQR({ accessToken: 'AT', externalPosId: 'P', externalReference: 'sy_test_11', monto: 100 })
    } catch (e) { caught = e }
    assert(caught instanceof MPClientError, `error type: ${caught instanceof Error ? caught.name : 'none'}`)
  })
}

run().then(() => {
  process.stdout.write(`\n[smoke-mp-orders] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)

  process.stdout.write([
    '-'.repeat(70),
    'TEST MANUAL DEL ENDPOINT POST /api/mp/cobros',
    '-'.repeat(70),
    '',
    'Prerrequisitos (modo manual_sandbox):',
    '  - MP_MODE=manual_sandbox',
    '  - MP_ENV=sandbox',
    '  - MP_SANDBOX_ACCESS_TOKEN=TEST-XXXX (de credenciales de prueba MP)',
    '  - MP_SANDBOX_USER_ID_MP=<seller test id>',
    '  - MP_SANDBOX_EXTERNAL_POS_ID=<external id del POS de prueba en MP>',
    '  - MP_SANDBOX_COMERCIO_ID=<comercio_id de Sylvora>',
    '  - User logueado con rol admin/encargado/cajero en ese comercio',
    '',
    'Request:',
    '  curl -X POST http://localhost:3000/api/mp/cobros \\',
    '    -H "Content-Type: application/json" \\',
    '    --cookie-jar sb-cookies.txt \\',
    '    -d \'{"monto": 1500, "descripcion": "test"}\'',
    '',
    'Esperado (201):',
    '  { "intento_id": "<uuid>", "qr_data": "...", "checkout_url": "...",',
    '    "expira_en": "<iso>", "estado": "pendiente" }',
    '',
    'Smokes negativos:',
    '  monto=0    -> 400 "Monto inválido"',
    '  sin cookie -> 401 "No autenticado"',
    '  rol sin venta.crear -> 403 (no debería pasar; todos los roles lo tienen)',
    '  MP no conectado + MP_MODE=oauth -> 409 "Mercado Pago no está conectado"',
    '',
    '-'.repeat(70),
    '',
  ].join('\n'))
}).catch(e => {
  process.stdout.write(`\n[smoke-mp-orders] crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
