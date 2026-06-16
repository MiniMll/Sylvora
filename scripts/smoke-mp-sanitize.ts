// Smoke test del sanitizador de logs (sanitizeForLog) — la nueva
// función que el api-client usa para incluir el body parseado de MP
// en logs de error 4xx sin riesgo de leak de campos sensibles.
//
// Cubre:
//   1. Strings largas se truncan.
//   2. Arrays largos se cortan a maxItems con marcador.
//   3. Keys que matchean SENSITIVE_KEY_RE se redactan.
//   4. Profundidad se limita a maxDepth.
//   5. Nested values con keys sensibles también se redactan.
//   6. null / undefined / boolean / number passthrough.
//
// Correr con: npx tsx scripts/smoke-mp-sanitize.ts

import { sanitizeForLog } from '../lib/mp/api-client'

let passed = 0, failed = 0
function check(name: string, fn: () => void) {
  try { fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-mp-sanitize] Verificando sanitizador de logs...\n\n')

check('1. strings largas se truncan con elipsis', () => {
  const r = sanitizeForLog('x'.repeat(1000), { maxStrLen: 50 })
  assert(typeof r === 'string', 'tipo')
  assert((r as string).length === 51, `len: ${(r as string).length}`)
  assert((r as string).endsWith('…'), 'sin elipsis')
})

check('2. arrays largos se cortan con marcador "+N más"', () => {
  const r = sanitizeForLog(new Array(50).fill(1), { maxItems: 5 })
  assert(Array.isArray(r), 'tipo')
  assert((r as unknown[]).length === 6, `len: ${(r as unknown[]).length}`)
  const last = (r as unknown[])[5]
  assert(typeof last === 'string' && last.includes('45'), `last: ${last}`)
})

check('3. keys "token", "secret" etc. se redactan', () => {
  const r = sanitizeForLog({
    access_token: 'TEST-SECRET-123',
    refresh_token: 'RT-456',
    client_secret: 'CS-789',
    Authorization: 'Bearer xyz',
    api_key: 'KEY',
    password: 'pwd',
    nombre: 'visible',
  })
  const o = r as Record<string, unknown>
  assert(o.access_token === '<redacted>', `access_token: ${o.access_token}`)
  assert(o.refresh_token === '<redacted>', 'refresh_token')
  assert(o.client_secret === '<redacted>', 'client_secret')
  assert(o.Authorization === '<redacted>', 'Authorization')
  assert(o.api_key === '<redacted>', 'api_key')
  assert(o.password === '<redacted>', 'password')
  assert(o.nombre === 'visible', 'nombre se redactó por error')
})

check('4. profundidad se limita a maxDepth', () => {
  const deeply: Record<string, unknown> = { v: 'leaf' }
  let cur = deeply
  for (let i = 0; i < 10; i++) { cur.next = { v: `level${i}` }; cur = cur.next as Record<string, unknown> }
  const r = sanitizeForLog(deeply, { maxDepth: 2 })
  // En profundidad 3+ deberíamos ver '<max-depth>'.
  let pointer: unknown = r
  let foundMaxDepth = false
  for (let i = 0; i < 5 && pointer; i++) {
    if (pointer === '<max-depth>') { foundMaxDepth = true; break }
    pointer = (pointer as Record<string, unknown>).next
  }
  assert(foundMaxDepth, 'no encontró <max-depth>')
})

check('5. nested: keys sensibles redactadas en arrays/objetos anidados', () => {
  const r = sanitizeForLog({
    cause: [
      { code: 200, description: 'OK', refresh_token: 'NESTED-RT' },
      { code: 400, description: 'bad', access_token: 'NESTED-AT' },
    ],
    seguro: 'visible',
  })
  const o = r as Record<string, unknown>
  const causes = o.cause as Array<Record<string, unknown>>
  assert(causes[0].refresh_token === '<redacted>', 'nested refresh')
  assert(causes[1].access_token === '<redacted>', 'nested access')
  assert(causes[0].description === 'OK', 'description se redactó por error')
})

check('6. tipos primitivos passthrough', () => {
  assert(sanitizeForLog(null) === null, 'null')
  assert(sanitizeForLog(undefined) === undefined, 'undefined')
  assert(sanitizeForLog(42) === 42, 'number')
  assert(sanitizeForLog(true) === true, 'boolean')
  assert(sanitizeForLog('corta') === 'corta', 'string corta')
})

check('7. body MP típico (cause array) se mantiene legible para diagnóstico', () => {
  // Estructura típica de error 400 de MP.
  const mpError = {
    message: 'invalid_request',
    error: 'bad_request',
    status: 400,
    cause: [
      { code: 2067, description: 'collector_id no autorizado para este POS' },
      { code: 2068, description: 'external_pos_id no existe en la cuenta' },
    ],
  }
  const r = sanitizeForLog(mpError) as Record<string, unknown>
  assert(r.message === 'invalid_request', 'message se modificó')
  assert(r.status === 400, 'status')
  const causes = r.cause as Array<Record<string, unknown>>
  assert(causes.length === 2, `len: ${causes.length}`)
  assert(causes[0].description === 'collector_id no autorizado para este POS', 'desc 1')
  assert(causes[1].description === 'external_pos_id no existe en la cuenta', 'desc 2')
})

process.stdout.write(`\n[smoke-mp-sanitize] ${passed} OK / ${failed} FAIL\n\n`)
if (failed > 0) process.exit(1)
