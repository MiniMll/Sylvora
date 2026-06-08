// Smoke test del verificador de firma de webhooks MP.
//
// Genera una firma "MP-like" con el mismo template oficial y verifica
// que la función la acepte o rechace según corresponda. Cubre:
//
//   1. Firma válida → pasa.
//   2. v1 mal → signature_mismatch.
//   3. dataId alterado en URL (equivalente a "body alterado" para MP,
//      que no firma body) → signature_mismatch.
//   4. Secret incorrecto → signature_mismatch.
//   5. x-signature ausente → missing_header.
//   6. x-request-id ausente → missing_header.
//   7. x-signature malformed → malformed_header.
//   8. ts no numérico → invalid_timestamp.
//   9. ts muy viejo → timestamp_too_old (anti replay).
//  10. ts muy futuro → timestamp_too_new.
//  11. Headers como Headers (fetch API) y como dict → ambos OK.
//  12. timingSafeEqualHex con longitudes distintas → false sin tirar.
//  13. timingSafeEqualHex con caracteres no-hex → false.
//  14. Sin secret → missing_secret.
//  15. Sin dataId → missing_data_id.
//
// Correr con:
//   npx tsx scripts/smoke-mp-webhook-signature.ts

import { createHmac } from 'node:crypto'
import {
  verifyMPWebhookSignature,
  timingSafeEqualHex,
  MPWebhookSignatureError,
} from '../lib/mp/webhook-signature'

// ────────────────────────────────────────────────────────────────────
// Helper: arma una firma "MP-like" con los valores que le pases.
// Replica el template de la función real para poder generar firmas
// válidas en tests.
// ────────────────────────────────────────────────────────────────────

function sign(
  secret: string,
  args: { dataId: string; xRequestId: string; tsSeconds: number },
): string {
  const manifest = `id:${args.dataId};request-id:${args.xRequestId};ts:${args.tsSeconds};`
  return createHmac('sha256', secret).update(manifest).digest('hex')
}

// ────────────────────────────────────────────────────────────────────
// Test runner
// ────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function check(name: string, fn: () => void) {
  try {
    fn()
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

function expectError(fn: () => void, code: string): MPWebhookSignatureError {
  let caught: unknown = null
  try { fn() } catch (e) { caught = e }
  if (!(caught instanceof MPWebhookSignatureError)) {
    throw new Error(`esperaba MPWebhookSignatureError, recibí: ${caught instanceof Error ? caught.name + ' ' + caught.message : String(caught)}`)
  }
  if (caught.code !== code) {
    throw new Error(`esperaba code '${code}', recibí '${caught.code}': ${caught.message}`)
  }
  return caught
}

// ────────────────────────────────────────────────────────────────────
// Setup base — usado por la mayoría de los tests
// ────────────────────────────────────────────────────────────────────

const SECRET = 'webhook_secret_de_test_no_usar_en_prod_12345'
const DATA_ID = '999999999'
const X_REQUEST_ID = '11111111-2222-3333-4444-555555555555'

function freshTs(): number {
  return Math.floor(Date.now() / 1000)
}

process.stdout.write('\n[smoke-mp-webhook-signature] Verificando firma de webhooks MP...\n\n')

// 1. Firma válida
check('1. firma válida → pasa', () => {
  const ts = freshTs()
  const v1 = sign(SECRET, { dataId: DATA_ID, xRequestId: X_REQUEST_ID, tsSeconds: ts })
  verifyMPWebhookSignature({
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': X_REQUEST_ID },
    dataId: DATA_ID,
    secret: SECRET,
  })
})

// 2. v1 mal
check('2. v1 mal → signature_mismatch', () => {
  const ts = freshTs()
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': `ts=${ts},v1=deadbeef0123deadbeef0123deadbeef0123deadbeef0123deadbeef0123dead`, 'x-request-id': X_REQUEST_ID },
      dataId: DATA_ID,
      secret: SECRET,
    })
  }, 'signature_mismatch')
})

// 3. dataId alterado en la URL
check('3. dataId alterado → signature_mismatch', () => {
  const ts = freshTs()
  const v1 = sign(SECRET, { dataId: DATA_ID, xRequestId: X_REQUEST_ID, tsSeconds: ts })
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': X_REQUEST_ID },
      dataId: 'dataId_falsificado',   // distinto del que firmó MP
      secret: SECRET,
    })
  }, 'signature_mismatch')
})

// 4. Secret incorrecto
check('4. secret incorrecto → signature_mismatch', () => {
  const ts = freshTs()
  const v1 = sign(SECRET, { dataId: DATA_ID, xRequestId: X_REQUEST_ID, tsSeconds: ts })
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': X_REQUEST_ID },
      dataId: DATA_ID,
      secret: 'OTRO_SECRET_QUE_NO_FIRMÓ_NADA',
    })
  }, 'signature_mismatch')
})

// 5. x-signature ausente
check('5. x-signature ausente → missing_header', () => {
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-request-id': X_REQUEST_ID },
      dataId: DATA_ID,
      secret: SECRET,
    })
  }, 'missing_header')
})

// 6. x-request-id ausente
check('6. x-request-id ausente → missing_header', () => {
  const ts = freshTs()
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': `ts=${ts},v1=deadbeef` },
      dataId: DATA_ID,
      secret: SECRET,
    })
  }, 'missing_header')
})

// 7. x-signature malformed
check('7. x-signature malformed → malformed_header', () => {
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': 'asdf=blah', 'x-request-id': X_REQUEST_ID },
      dataId: DATA_ID,
      secret: SECRET,
    })
  }, 'malformed_header')
})

// 8. ts no numérico
check('8. ts no numérico → invalid_timestamp', () => {
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': `ts=banana,v1=abc`, 'x-request-id': X_REQUEST_ID },
      dataId: DATA_ID,
      secret: SECRET,
    })
  }, 'invalid_timestamp')
})

// 9. ts muy viejo
check('9. ts muy viejo → timestamp_too_old', () => {
  const old = freshTs() - 3600   // 1 hora atrás
  const v1 = sign(SECRET, { dataId: DATA_ID, xRequestId: X_REQUEST_ID, tsSeconds: old })
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': `ts=${old},v1=${v1}`, 'x-request-id': X_REQUEST_ID },
      dataId: DATA_ID,
      secret: SECRET,
    })
  }, 'timestamp_too_old')
})

// 10. ts muy futuro
check('10. ts muy futuro → timestamp_too_new', () => {
  const future = freshTs() + 3600
  const v1 = sign(SECRET, { dataId: DATA_ID, xRequestId: X_REQUEST_ID, tsSeconds: future })
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': `ts=${future},v1=${v1}`, 'x-request-id': X_REQUEST_ID },
      dataId: DATA_ID,
      secret: SECRET,
    })
  }, 'timestamp_too_new')
})

// 11. Headers como Headers (fetch API)
check('11. headers como instancia de Headers → OK', () => {
  const ts = freshTs()
  const v1 = sign(SECRET, { dataId: DATA_ID, xRequestId: X_REQUEST_ID, tsSeconds: ts })
  const h = new Headers()
  h.set('x-signature', `ts=${ts},v1=${v1}`)
  h.set('x-request-id', X_REQUEST_ID)
  verifyMPWebhookSignature({ headers: h, dataId: DATA_ID, secret: SECRET })
})

// 11b. Headers case insensitive
check('11b. headers case insensitive (dict con X-Signature mayúsculas)', () => {
  const ts = freshTs()
  const v1 = sign(SECRET, { dataId: DATA_ID, xRequestId: X_REQUEST_ID, tsSeconds: ts })
  verifyMPWebhookSignature({
    headers: { 'X-Signature': `ts=${ts},v1=${v1}`, 'X-Request-Id': X_REQUEST_ID },
    dataId: DATA_ID,
    secret: SECRET,
  })
})

// 12. timingSafeEqualHex longitudes distintas
check('12. timingSafeEqualHex(a, b) longitudes distintas → false sin tirar', () => {
  const r1 = timingSafeEqualHex('aabb', 'aabbcc')
  assert(r1 === false, `esperaba false, recibí ${r1}`)
  const r2 = timingSafeEqualHex('', 'ab')
  assert(r2 === false, 'vacío vs no-vacío')
})

// 13. timingSafeEqualHex chars no-hex
check('13. timingSafeEqualHex con caracteres no-hex → false', () => {
  const r = timingSafeEqualHex('zzzz', 'zzzz')
  assert(r === false, `aceptó garbage: ${r}`)
})

// 13b. timingSafeEqualHex case insensitive en hex
check('13b. timingSafeEqualHex es case-insensitive', () => {
  assert(timingSafeEqualHex('AABBCC', 'aabbcc') === true, 'case sensitive — debería ser equal')
})

// 14. Sin secret
check('14. sin secret → missing_secret', () => {
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': 'ts=1,v1=abc', 'x-request-id': X_REQUEST_ID },
      dataId: DATA_ID,
      secret: '',
    })
  }, 'missing_secret')
})

// 15. Sin dataId
check('15. sin dataId → missing_data_id', () => {
  expectError(() => {
    verifyMPWebhookSignature({
      headers: { 'x-signature': 'ts=1,v1=abc', 'x-request-id': X_REQUEST_ID },
      dataId: '',
      secret: SECRET,
    })
  }, 'missing_data_id')
})

// 16. now() inyectable (control determinístico del clock)
check('16. now() inyectable funciona para tests', () => {
  // Firmamos con ts=1000, y le pasamos un now() que devuelve un valor
  // dentro de la ventana → debería pasar.
  const ts = 1000
  const v1 = sign(SECRET, { dataId: DATA_ID, xRequestId: X_REQUEST_ID, tsSeconds: ts })
  verifyMPWebhookSignature({
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': X_REQUEST_ID },
    dataId: DATA_ID,
    secret: SECRET,
    now: () => ts * 1000 + 1000,   // 1s después del ts
  })
})

process.stdout.write(`\n[smoke-mp-webhook-signature] ${passed} OK / ${failed} FAIL\n\n`)
if (failed > 0) process.exit(1)
