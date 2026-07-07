// Smoke test — Sprint QA-1, hallazgo U4: invitaciones / primer acceso.
//
// Cubre la lógica PURA del flujo del callback (lib/auth/callback-flow.ts),
// que decide a dónde va y qué aviso muestra según el flujo (invitación vs
// recuperación). El intercambio de code por sesión, el reenvío del endpoint
// y las pantallas se validan en el QA manual (requieren Supabase real).
//
//   flujoDesdeParam:
//     1. "invitacion" → invitacion.
//     2. null / undefined / "recuperacion" / basura → recuperacion (default).
//
//   destinoExito:
//     3. invitación → /reset-password?bienvenida=1 (ignora next).
//     4. recuperación + next interno válido → ese next.
//     5. recuperación + next open-redirect → fallback /reset-password.
//     6. recuperación + next null → /reset-password.
//
//   avisoError:
//     7. invitación: sin_code → invite_invalido, exchange → invite_expirado.
//     8. recuperación: sin_code → link_invalido, exchange → link_expirado.
//
// Correr con:
//   npx tsx scripts/smoke-auth-invitaciones.ts

import { flujoDesdeParam, destinoExito, avisoError } from '../lib/auth/callback-flow'

let passed = 0, failed = 0
function check(name: string, fn: () => void) {
  try { fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-auth-invitaciones] Invitaciones / primer acceso (QA-1 U4)...\n\n')

// ── flujoDesdeParam ─────────────────────────────────────────────────

check('1. "invitacion" → invitacion', () => {
  assert(flujoDesdeParam('invitacion') === 'invitacion', 'no reconoció invitacion')
})

check('2. null/undefined/otros → recuperacion (default)', () => {
  assert(flujoDesdeParam(null) === 'recuperacion', 'null')
  assert(flujoDesdeParam(undefined) === 'recuperacion', 'undefined')
  assert(flujoDesdeParam('recuperacion') === 'recuperacion', 'recuperacion')
  assert(flujoDesdeParam('cualquier-cosa') === 'recuperacion', 'basura')
  assert(flujoDesdeParam('') === 'recuperacion', 'vacío')
})

// ── destinoExito ────────────────────────────────────────────────────

check('3. invitación → /reset-password?bienvenida=1 (ignora next)', () => {
  assert(destinoExito('invitacion', null) === '/reset-password?bienvenida=1', 'default')
  // aunque venga un next (incluso malicioso), en invitación el destino es fijo
  assert(destinoExito('invitacion', '//evil.com') === '/reset-password?bienvenida=1', 'ignoró next malicioso')
})

check('4. recuperación + next interno válido → ese next', () => {
  assert(destinoExito('recuperacion', '/reset-password') === '/reset-password', 'reset-password')
  assert(destinoExito('recuperacion', '/dashboard') === '/dashboard', 'dashboard')
})

check('5. recuperación + next open-redirect → fallback', () => {
  assert(destinoExito('recuperacion', '//evil.com') === '/reset-password', '//evil')
  assert(destinoExito('recuperacion', 'https://evil.com') === '/reset-password', 'https')
  assert(destinoExito('recuperacion', '/%2fevil.com') === '/reset-password', '%2f')
})

check('6. recuperación + next null → /reset-password', () => {
  assert(destinoExito('recuperacion', null) === '/reset-password', 'null')
})

// ── avisoError ──────────────────────────────────────────────────────

check('7. invitación: sin_code→invite_invalido, exchange→invite_expirado', () => {
  assert(avisoError('invitacion', 'sin_code') === 'invite_invalido', 'sin_code')
  assert(avisoError('invitacion', 'exchange') === 'invite_expirado', 'exchange')
})

check('8. recuperación: sin_code→link_invalido, exchange→link_expirado', () => {
  assert(avisoError('recuperacion', 'sin_code') === 'link_invalido', 'sin_code')
  assert(avisoError('recuperacion', 'exchange') === 'link_expirado', 'exchange')
})

process.stdout.write(`\n[smoke-auth-invitaciones] ${passed} OK / ${failed} FAIL\n\n`)
if (failed > 0) process.exit(1)
