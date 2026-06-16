// Smoke test de lib/mp/client-fetch.ts: verifica que los wrappers
// mandan el método/path/body correctos y traducen errores HTTP a
// MPClientFetchError.
//
// Correr con:
//   npx tsx scripts/smoke-mp-client-fetch.ts

import {
  crearCobroMP,
  obtenerEstadoCobroMP,
  cancelarCobroMP,
  marcarCobroRequiereRevision,
  asociarVentaAIntentoMP,
  MPClientFetchError,
} from '../lib/mp/client-fetch'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchHandler = (url: string, init: FetchInit) => Promise<Response>

let handler: FetchHandler = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
let calls: Array<{ url: string; init: FetchInit }> = []

globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
  calls.push({ url, init })
  return handler(url, init)
}) as typeof fetch

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function reset() { calls = [] }
let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void>) {
  reset()
  try { await fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-mp-client-fetch] Verificando wrappers fetch del browser...\n\n')

async function run() {

  await check('1. crearCobroMP: POST /api/mp/cobros con body { monto, descripcion }', async () => {
    handler = async () => jsonResponse(201, {
      intento_id: 'i_1', qr_data: 'QR', checkout_url: 'https://mp/x',
      expira_en: '2026-06-09T12:00:00Z', estado: 'pendiente',
    })
    const r = await crearCobroMP(1500, 'venta de prueba')
    assert(calls[0].url === '/api/mp/cobros', `url: ${calls[0].url}`)
    assert(calls[0].init?.method === 'POST', `method: ${calls[0].init?.method}`)
    const body = JSON.parse(calls[0].init?.body as string)
    assert(body.monto === 1500 && body.descripcion === 'venta de prueba', 'body mal')
    assert(r.intento_id === 'i_1', `intento_id: ${r.intento_id}`)
  })

  await check('2. obtenerEstadoCobroMP: GET /api/mp/cobros/:id', async () => {
    handler = async () => jsonResponse(200, {
      intento_id: 'i_2', estado: 'aprobado', monto: 100, metodo: 'qr',
      qr_data: null, checkout_url: null,
      expira_en: 'x', pagado_en: 'x', venta_id: null, mp_status_detail: 'accredited',
    })
    const r = await obtenerEstadoCobroMP('i_2')
    assert(calls[0].url === '/api/mp/cobros/i_2', `url: ${calls[0].url}`)
    assert(r.estado === 'aprobado', `estado: ${r.estado}`)
  })

  await check('3. cancelarCobroMP: POST /:id/cancelar', async () => {
    handler = async () => jsonResponse(200, { intento_id: 'i_3', estado: 'cancelado', cancelado: true })
    const r = await cancelarCobroMP('i_3')
    assert(calls[0].url === '/api/mp/cobros/i_3/cancelar', `url: ${calls[0].url}`)
    assert(calls[0].init?.method === 'POST', 'method')
    assert(r.cancelado === true, 'cancelado')
  })

  await check('4. cancelarCobroMP: 200 cancelado=false si MP cobró', async () => {
    handler = async () => jsonResponse(200, { intento_id: 'i_4', estado: 'aprobado', cancelado: false })
    const r = await cancelarCobroMP('i_4')
    assert(r.cancelado === false && r.estado === 'aprobado', `r: ${JSON.stringify(r)}`)
  })

  await check('5. marcarCobroRequiereRevision: POST con body { motivo }', async () => {
    handler = async () => jsonResponse(200, { intento_id: 'i_5', estado: 'requiere_revision', ok: true })
    const r = await marcarCobroRequiereRevision('i_5', 'stock_insuficiente_post_aprobado')
    assert(calls[0].url === '/api/mp/cobros/i_5/requiere-revision', `url: ${calls[0].url}`)
    assert(calls[0].init?.method === 'POST', 'method')
    const body = JSON.parse(calls[0].init?.body as string)
    assert(body.motivo === 'stock_insuficiente_post_aprobado', 'motivo')
    assert(r.ok === true, 'ok')
  })

  await check('6. marcarCobroRequiereRevision: 409 devuelve estado actual sin tirar', async () => {
    handler = async () => jsonResponse(409, { intento_id: 'i_6', estado: 'cancelado', ok: false, error: 'El intento no está en estado aprobado' })
    const r = await marcarCobroRequiereRevision('i_6', 'irrelevant')
    assert(r.ok === false, 'ok')
    assert(r.estado === 'cancelado', `estado: ${r.estado}`)
  })

  await check('7. asociarVentaAIntentoMP: PUT con body { venta_id }', async () => {
    handler = async () => jsonResponse(200, { intento_id: 'i_7', venta_id: 'v_7', estado: 'aprobado' })
    const r = await asociarVentaAIntentoMP('i_7', 'v_7')
    assert(calls[0].url === '/api/mp/cobros/i_7/venta', `url: ${calls[0].url}`)
    assert(calls[0].init?.method === 'PUT', 'method')
    const body = JSON.parse(calls[0].init?.body as string)
    assert(body.venta_id === 'v_7', 'venta_id')
    assert(r.venta_id === 'v_7', 'r.venta_id')
  })

  await check('8. Errores HTTP se traducen a MPClientFetchError', async () => {
    handler = async () => jsonResponse(401, { error: 'No autenticado' })
    let threw: unknown = null
    try { await crearCobroMP(100) } catch (e) { threw = e }
    assert(threw instanceof MPClientFetchError, `type: ${threw instanceof Error ? threw.name : 'none'}`)
    assert((threw as MPClientFetchError).status === 401, 'status')
    assert((threw as MPClientFetchError).message === 'No autenticado', `message: ${(threw as MPClientFetchError).message}`)
  })

  await check('9. 409 en crearCobroMP (MP no conectado)', async () => {
    handler = async () => jsonResponse(409, { error: 'Mercado Pago no está conectado.' })
    let threw: unknown = null
    try { await crearCobroMP(100) } catch (e) { threw = e }
    assert(threw instanceof MPClientFetchError, 'type')
    assert((threw as MPClientFetchError).status === 409, 'status')
  })

}

run().then(() => {
  process.stdout.write(`\n[smoke-mp-client-fetch] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  process.stdout.write(`crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
