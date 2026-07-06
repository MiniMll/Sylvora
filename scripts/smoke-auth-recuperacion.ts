// Smoke test — Sprint QA-1, hallazgo V1: recuperación de contraseña.
//
// Cubre los dos helpers PUROS del flujo (lo testeable sin Supabase; el
// intercambio de sesión y las pantallas se validan en el QA manual):
//
//   validarPasswordNueva (lib/auth/password.ts):
//     1. válida (≥6 y coinciden) → ok.
//     2. muy corta → error con mínimo.
//     3. no coinciden → error.
//     4. exactamente el mínimo → ok.
//     5. tipo no-string → error (no crashea).
//
//   rutaInternaSegura (lib/auth/redirect.ts — anti open-redirect):
//     6. ruta interna "/reset-password" → se acepta.
//     7. "//evil.com" (esquema-relativo) → fallback.
//     8. "https://evil.com" (esquema explícito) → fallback.
//     9. "/\\evil.com" (backslash) → fallback.
//    10. "javascript:alert(1)" → fallback.
//    11. no empieza con "/" → fallback.
//    12. null / vacío → fallback.
//    13. whitespace inicial (" /x") → fallback.
//    14. "%2f" codificado ("/%2fevil.com" → "//evil.com") → fallback.
//    15. "%5c" codificado ("/%5cevil.com" → "/\evil.com") → fallback.
//    16. doble codificación ("/%252f%252fevil.com") → fallback.
//    17. "%2F" codificado en mayúscula ("/%2F%2Fevil.com") → fallback.
//    18. "%" mal formado ("/%zz") → fallback (decode tira).
//    19. ruta interna con query codeada válida ("/x?q=%20a") → se acepta.
//
// Correr con:
//   npx tsx scripts/smoke-auth-recuperacion.ts

import { validarPasswordNueva, PASSWORD_MIN_LEN } from '../lib/auth/password'
import { rutaInternaSegura } from '../lib/auth/redirect'

let passed = 0, failed = 0
function check(name: string, fn: () => void) {
  try { fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-auth-recuperacion] Recuperación de contraseña (QA-1 V1)...\n\n')

// ── validarPasswordNueva ────────────────────────────────────────────

check('1. válida (≥min y coinciden) → ok', () => {
  const r = validarPasswordNueva('secreta1', 'secreta1')
  assert(r.ok === true, `rechazó válida: ${!r.ok ? r.error : ''}`)
})

check('2. muy corta → error con el mínimo', () => {
  const r = validarPasswordNueva('123', '123')
  assert(r.ok === false, 'aceptó corta')
  if (!r.ok) assert(r.error.includes(String(PASSWORD_MIN_LEN)), `mensaje: ${r.error}`)
})

check('3. no coinciden → error', () => {
  const r = validarPasswordNueva('secreta1', 'secreta2')
  assert(r.ok === false, 'aceptó no-coincidentes')
  if (!r.ok) assert(/coincid/i.test(r.error), `mensaje: ${r.error}`)
})

check('4. exactamente el mínimo → ok', () => {
  const min = 'x'.repeat(PASSWORD_MIN_LEN)
  assert(validarPasswordNueva(min, min).ok === true, 'rechazó el mínimo exacto')
})

check('5. tipo no-string → error sin crashear', () => {
  // @ts-expect-error probando entrada inválida a propósito
  const r = validarPasswordNueva(null, null)
  assert(r.ok === false, 'aceptó null')
})

// ── rutaInternaSegura (anti open-redirect) ──────────────────────────

const FB = '/reset-password'

check('6. ruta interna → se acepta tal cual', () => {
  assert(rutaInternaSegura('/reset-password', FB) === '/reset-password', 'no aceptó ruta interna')
  assert(rutaInternaSegura('/dashboard', FB) === '/dashboard', 'no aceptó /dashboard')
})

check('7. "//evil.com" (esquema-relativo) → fallback', () => {
  assert(rutaInternaSegura('//evil.com', FB) === FB, 'dejó pasar //evil.com')
  assert(rutaInternaSegura('//evil.com/path', FB) === FB, 'dejó pasar //evil.com/path')
})

check('8. "https://evil.com" (esquema explícito) → fallback', () => {
  assert(rutaInternaSegura('https://evil.com', FB) === FB, 'dejó pasar https://')
})

check('9. "/\\\\evil.com" (backslash) → fallback', () => {
  assert(rutaInternaSegura('/\\evil.com', FB) === FB, 'dejó pasar /\\')
})

check('10. "javascript:..." → fallback', () => {
  assert(rutaInternaSegura('javascript:alert(1)', FB) === FB, 'dejó pasar javascript:')
})

check('11. no empieza con "/" → fallback', () => {
  assert(rutaInternaSegura('dashboard', FB) === FB, 'aceptó ruta relativa')
  assert(rutaInternaSegura('evil.com', FB) === FB, 'aceptó host pelado')
})

check('12. null / vacío → fallback', () => {
  assert(rutaInternaSegura(null, FB) === FB, 'null')
  assert(rutaInternaSegura('', FB) === FB, 'vacío')
  assert(rutaInternaSegura(undefined, FB) === FB, 'undefined')
})

check('13. whitespace inicial → fallback', () => {
  assert(rutaInternaSegura(' /dashboard', FB) === FB, 'aceptó whitespace inicial')
  assert(rutaInternaSegura('\t/dashboard', FB) === FB, 'aceptó tab inicial')
})

check('14. "%2f" codificado → "//host" → fallback', () => {
  assert(rutaInternaSegura('/%2fevil.com', FB) === FB, 'dejó pasar %2f → //')
  assert(rutaInternaSegura('/%2fevil.com/path', FB) === FB, 'dejó pasar %2f con path')
})

check('15. "%5c" codificado → backslash → fallback', () => {
  assert(rutaInternaSegura('/%5cevil.com', FB) === FB, 'dejó pasar %5c → \\')
})

check('16. doble codificación "%252f%252f" → fallback', () => {
  assert(rutaInternaSegura('/%252f%252fevil.com', FB) === FB, 'dejó pasar doble encoding')
})

check('17. "%2F" en mayúscula → fallback', () => {
  assert(rutaInternaSegura('/%2F%2Fevil.com', FB) === FB, 'dejó pasar %2F mayúscula')
})

check('18. "%" mal formado → fallback (decode tira)', () => {
  assert(rutaInternaSegura('/%zz', FB) === FB, 'aceptó % mal formado')
  assert(rutaInternaSegura('/%', FB) === FB, 'aceptó % suelto')
})

check('19. ruta interna con query codeada válida → se acepta', () => {
  assert(rutaInternaSegura('/dashboard?q=%20hola', FB) === '/dashboard?q=%20hola', 'rechazó query encodeada válida')
  // %2f dentro de un segmento (no al inicio) decodifica a una barra interna
  // simple ("/a/b"), que sigue siendo ruta interna → se acepta.
  assert(rutaInternaSegura('/a%2fb', FB) === '/a%2fb', 'rechazó %2f interno benigno')
})

process.stdout.write(`\n[smoke-auth-recuperacion] ${passed} OK / ${failed} FAIL\n\n`)
if (failed > 0) process.exit(1)
