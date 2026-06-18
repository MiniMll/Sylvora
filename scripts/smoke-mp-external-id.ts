// Smoke test para external_id alfanumericos de Mercado Pago.
//
// Correr con:
//   npx tsx scripts/smoke-mp-external-id.ts

import assert from 'node:assert/strict'

import {
  buildExternalId,
  buildMPPOSExternalId,
  buildMPStoreExternalId,
} from '../lib/mp/stores'

async function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`OK ${name}`)
  } catch (e) {
    console.error(`FAIL ${name}`)
    throw e
  }
}

const ALPHANUMERIC_RE = /^[A-Z0-9]+$/

function assertAlphanumeric(value: string) {
  assert.match(value, ALPHANUMERIC_RE)
  assert.equal(value.includes('_'), false)
  assert.equal(value.includes('-'), false)
  assert.equal(value.includes(' '), false)
}

async function main() {
  check('Store y POS usan solo caracteres alfanumericos', () => {
    const comercioId = 'a4dc774a-50c7-426e-b420-06996d71e06b'
    const storeId = buildMPStoreExternalId(comercioId)
    const posId = buildMPPOSExternalId(comercioId)

    assert.equal(storeId, 'SYLVORASTOREA4DC774A50C7426EB42006996D71E06B')
    assert.equal(posId, 'SYLVORAPOSA4DC774A50C7426EB42006996D71E06B')
    assertAlphanumeric(storeId)
    assertAlphanumeric(posId)
  })

  check('external_id mantiene unicidad por comercio y tipo', () => {
    const comercioA = 'a4dc774a-50c7-426e-b420-06996d71e06b'
    const comercioB = '520197bd-ac2c-4ffd-a46e-77015b4714b6'

    const ids = new Set([
      buildExternalId('STORE', comercioA),
      buildExternalId('POS', comercioA),
      buildExternalId('STORE', comercioB),
      buildExternalId('POS', comercioB),
    ])

    assert.equal(ids.size, 4)
  })

  check('comercio_id con simbolos se normaliza sin perder alfanumericos', () => {
    const id = buildExternalId('POS', ' * a4_dc-774a 50c7 ! ')
    assert.equal(id, 'SYLVORAPOSA4DC774A50C7')
    assertAlphanumeric(id)
  })

  check('comercio_id sin caracteres alfanumericos falla controlado', () => {
    assert.throws(
      () => buildExternalId('STORE', '--- ___ ***'),
      /external_id MP/,
    )
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
