// Smoke test del cifrado de tokens MP. Verifica:
//   1. Roundtrip encrypt/decrypt → match exacto.
//   2. Encrypt mismo plaintext 2 veces → ciphertexts distintos (IV random).
//   3. Tampering del ciphertext → throw.
//   4. Decrypt con key distinta → throw.
//   5. Formato inválido → throw con mensaje claro.
//
// Correr con:
//   npx tsx scripts/smoke-mp-crypto.ts
//
// El script setea una key de test antes de importar el módulo
// — no requiere SYLVORA_MP_TOKEN_ENCRYPTION_KEY en el env real.

import { randomBytes } from 'node:crypto'

// Setear key ANTES de importar crypto.ts (lazy reads en runtime).
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import { encryptToken, decryptToken } from '../lib/mp/crypto'

let passed = 0
let failed = 0

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`      ${e instanceof Error ? e.message : String(e)}`)
    failed++
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

console.log('\n[smoke-mp-crypto] Verificando cifrado de tokens MP...\n')

const plaintext = 'APP_USR-1234567890-abcdef-mock-access-token-from-mp'

// 1. Roundtrip.
check('roundtrip encrypt → decrypt devuelve el plaintext original', () => {
  const encrypted = encryptToken(plaintext)
  const decrypted = decryptToken(encrypted)
  assert(decrypted === plaintext, `decrypted="${decrypted}" !== plaintext`)
})

// 2. IV aleatorio → ciphertexts distintos.
check('encrypt mismo plaintext 2 veces produce ciphertexts distintos', () => {
  const a = encryptToken(plaintext)
  const b = encryptToken(plaintext)
  assert(a !== b, 'los ciphertexts coinciden — IV no se está randomizando')
  // Pero ambos deben decryptar al mismo plaintext.
  assert(decryptToken(a) === plaintext, 'a no decrypta al plaintext')
  assert(decryptToken(b) === plaintext, 'b no decrypta al plaintext')
})

// 3. Tampering del ciphertext → throw.
check('tampering del ciphertext es detectado (auth tag mismatch)', () => {
  const encrypted = encryptToken(plaintext)
  const parts = encrypted.split(':')
  // Flippear un bit del ciphertext middle.
  const ct = Buffer.from(parts[1], 'base64')
  ct[0] = ct[0] ^ 0xff
  const tampered = [parts[0], ct.toString('base64'), parts[2]].join(':')
  let threw = false
  try {
    decryptToken(tampered)
  } catch {
    threw = true
  }
  assert(threw, 'decryptToken NO detectó el tampering — vulnerabilidad')
})

// 4. Tampering del auth tag → throw.
check('tampering del auth tag es detectado', () => {
  const encrypted = encryptToken(plaintext)
  const parts = encrypted.split(':')
  const tag = Buffer.from(parts[2], 'base64')
  tag[0] = tag[0] ^ 0xff
  const tampered = [parts[0], parts[1], tag.toString('base64')].join(':')
  let threw = false
  try {
    decryptToken(tampered)
  } catch {
    threw = true
  }
  assert(threw, 'tag tampering no detectado')
})

// 5. Decrypt con key distinta → throw.
check('decrypt con clave distinta tira (no devuelve garbage)', () => {
  const encrypted = encryptToken(plaintext)
  // Cambiar la key del env.
  const prevKey = process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY
  process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  let threw = false
  try {
    decryptToken(encrypted)
  } catch {
    threw = true
  }
  process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = prevKey
  assert(threw, 'decrypt con key distinta no tiró — vulnerabilidad')
})

// 6. Formato inválido.
check('formato inválido (menos de 3 partes) tira con mensaje claro', () => {
  let threw = false
  let msg = ''
  try {
    decryptToken('not-a-valid-ciphertext')
  } catch (e) {
    threw = true
    msg = e instanceof Error ? e.message : ''
  }
  assert(threw, 'formato inválido no tiró')
  assert(msg.includes('formato inválido'), `mensaje no claro: ${msg}`)
})

// 7. Plaintext vacío rechazado al encriptar.
check('encryptToken rechaza plaintext vacío', () => {
  let threw = false
  try {
    encryptToken('')
  } catch {
    threw = true
  }
  assert(threw, 'plaintext vacío fue aceptado')
})

console.log(`\n[smoke-mp-crypto] ${passed} OK / ${failed} FAIL\n`)

if (failed > 0) {
  process.exit(1)
}
