// Cifrado simétrico app-level de tokens OAuth de Mercado Pago.
//
// Por qué app-level y no pgcrypto: rotar la clave = redeploy de env
// var, no migración SQL. Plus, los tokens nunca aparecen en plaintext
// en logs de Postgres / dumps.
//
// Algoritmo: AES-256-GCM. Authenticated encryption — además de cifrar,
// detecta tampering del ciphertext. Clave de 32 bytes (256 bits), IV
// (nonce) de 12 bytes aleatorio por mensaje, auth tag de 16 bytes.
//
// Formato del ciphertext serializado:
//   base64(iv) ":" base64(ciphertext) ":" base64(authTag)
//
// 3 partes separadas por ":". Cada vez que ciframos el mismo plaintext
// el output es DISTINTO (IV aleatorio). Si alguien modifica cualquier
// byte del ciphertext o del tag, decryptToken tira error.
//
// SERVER-ONLY. crypto de node:crypto.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getMPTokenEncryptionKey } from './config'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32   // 256 bits
const IV_LENGTH = 12    // 96 bits, recomendado para GCM
const AUTH_TAG_LENGTH = 16

/** Decodea la clave de env (base64) a Buffer y valida largo. */
function getKey(): Buffer {
  const raw = getMPTokenEncryptionKey()
  let key: Buffer
  try {
    key = Buffer.from(raw, 'base64')
  } catch {
    throw new Error(
      '[mp/crypto] SYLVORA_MP_TOKEN_ENCRYPTION_KEY no es base64 válido. ' +
      'Regenerar con: openssl rand -base64 32',
    )
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `[mp/crypto] SYLVORA_MP_TOKEN_ENCRYPTION_KEY debe ser ${KEY_LENGTH} bytes (256 bits) ` +
      `tras decodificar base64. Got ${key.length} bytes. ` +
      `Regenerar con: openssl rand -base64 32`,
    )
  }
  return key
}

/**
 * Cifra un token (access_token o refresh_token) para guardar en DB.
 * Devuelve un string serializado listo para INSERT.
 *
 * No cachear el output: cada llamada genera un IV nuevo, así que
 * encriptar el mismo plaintext 2 veces produce ciphertexts distintos.
 * Eso es lo esperado (semantic security).
 */
export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('[mp/crypto] encryptToken: plaintext vacío o no-string')
  }
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return [
    iv.toString('base64'),
    ciphertext.toString('base64'),
    authTag.toString('base64'),
  ].join(':')
}

/**
 * Descifra un token previamente cifrado con encryptToken().
 * Tira si el formato es inválido, la clave no coincide, o el
 * ciphertext fue tampered (auth tag check).
 */
export function decryptToken(encrypted: string): string {
  if (typeof encrypted !== 'string') {
    throw new Error('[mp/crypto] decryptToken: input no-string')
  }
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error(
      `[mp/crypto] decryptToken: formato inválido. Esperado ` +
      `"base64(iv):base64(ct):base64(tag)", got ${parts.length} partes.`,
    )
  }
  const [ivB64, ctB64, tagB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const ciphertext = Buffer.from(ctB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')

  if (iv.length !== IV_LENGTH) {
    throw new Error(`[mp/crypto] IV largo inválido: ${iv.length} bytes (esperado ${IV_LENGTH}).`)
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`[mp/crypto] authTag largo inválido: ${authTag.length} bytes (esperado ${AUTH_TAG_LENGTH}).`)
  }

  const key = getKey()
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  } catch (e) {
    // GCM tira al .final() si el authTag no matchea = el ciphertext
    // fue tampered O la clave es la equivocada. Mensaje uniforme
    // para no filtrar cuál de los dos casos es.
    throw new Error(
      '[mp/crypto] decryptToken: auth tag mismatch. ' +
      'El ciphertext fue modificado o la clave de cifrado cambió.',
      { cause: e },
    )
  }
}
