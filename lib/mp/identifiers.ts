// Helpers para los identificadores que mandamos a Mercado Pago.
//
// Constraints de MP (Orders API):
//   - external_reference: máx 64 chars, [a-zA-Z0-9_-].
//   - X-Idempotency-Key: longitud razonable, ASCII printable.
//
// Diseño:
//   - external_reference: "sy_<uuid sin hyphens>" → 3 + 32 = 35 chars.
//     Prefijo "sy_" para distinguir en el dashboard MP y para
//     debugging ("¿de Sylvora o de otra integración?").
//   - idempotency_key: derivado del external_reference. Mismo
//     external_ref ⇒ misma idempotency key. Esto garantiza que si
//     el endpoint se reintenta antes de persistir el orden, MP no
//     crea 2 órdenes — devuelve la misma.
//
// SERVER-ONLY (no hay nada client-side, pero igual: este módulo se
// usa solo desde lib/mp/orders.ts y los route handlers).

import { randomUUID } from 'node:crypto'

/** Prefijo de marca. NO cambiar — quedaría histórico de cobros sin
 *  match si se modifica. */
const PREFIX = 'sy_'

/** Regex permitido por MP en external_reference. */
const EXTERNAL_REF_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Genera un external_reference único para un nuevo intento de cobro.
 * Formato: "sy_" + uuid v4 sin hyphens (35 chars total).
 *
 * No requiere coordinación con DB — el UUID v4 colisiona con
 * probabilidad despreciable. La columna external_reference es UNIQUE
 * en la DB de todos modos, así que un duplicado se detectaría al
 * INSERT.
 */
export function generateExternalReference(): string {
  const uuid = randomUUID().replace(/-/g, '')
  return PREFIX + uuid
}

/**
 * Type guard: chequea que el string sea un external_reference válido
 * para MP. Útil cuando recibimos uno de afuera (ej. del webhook,
 * para asegurarnos de que no es un valor inyectado).
 */
export function isValidExternalReference(s: string): boolean {
  return typeof s === 'string' && EXTERNAL_REF_RE.test(s)
}

/**
 * Deriva la X-Idempotency-Key para una creación de Order a partir
 * del external_reference.
 *
 * Determinístico: mismo input → misma key. Esto importa porque si
 * el endpoint se reintenta (retry del cliente, retry del proxy)
 * antes de actualizar el intento con order_id_mp, queremos que MP
 * devuelva la MISMA Order, no cree una nueva.
 *
 * Formato: "order_create_" + external_reference. Le agrego prefijo
 * para distinguirlo si en el futuro hacemos otras operaciones
 * idempotentes (refund, capture, etc.) usando el mismo external_ref.
 */
export function idempotencyKeyForOrder(externalReference: string): string {
  if (!isValidExternalReference(externalReference)) {
    throw new Error(
      `[mp/identifiers] idempotencyKeyForOrder: externalReference inválido: ${JSON.stringify(externalReference)}`,
    )
  }
  return `order_create_${externalReference}`
}
