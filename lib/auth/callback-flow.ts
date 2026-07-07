// Lógica de flujo de /auth/callback, separada de la ruta para poder
// testearla en aislamiento (la ruta en sí necesita cookies/Supabase).
//
// Un mismo callback sirve a dos flujos PKCE de Supabase Auth que aterrizan
// con un ?code: recuperación de contraseña (V1) e invitación de usuario
// (U4). Se distinguen con el query param `tipo`:
//
//   sin `tipo` / cualquier otro valor → recuperación (default, back-compat
//     con los links de recuperación de V1 que solo mandan `next`).
//   tipo=invitacion                   → invitación / primer acceso.
//
// La diferencia entre flujos es solo de UX (a dónde va tras el éxito y qué
// aviso muestra /login si el link falla). El intercambio de code por sesión
// es idéntico.
//
// PURO: sin Supabase, sin React. Reutiliza rutaInternaSegura.

import { rutaInternaSegura } from './redirect'

export type FlujoAuth = 'invitacion' | 'recuperacion'

/** Normaliza el query param `tipo` a un flujo conocido. */
export function flujoDesdeParam(tipo: unknown): FlujoAuth {
  return tipo === 'invitacion' ? 'invitacion' : 'recuperacion'
}

/**
 * Destino tras intercambiar el code con éxito.
 *
 * - Invitación: pantalla de contraseña en modo "bienvenida" (primer
 *   acceso: el usuario fija su primera contraseña). Destino fijo y seguro,
 *   no depende de `next`.
 * - Recuperación: `next` saneado (anti open-redirect), default
 *   /reset-password.
 */
export function destinoExito(flujo: FlujoAuth, next: unknown): string {
  if (flujo === 'invitacion') return '/reset-password?bienvenida=1'
  return rutaInternaSegura(next, '/reset-password')
}

/** Motivo de fallo del link al llegar al callback. */
export type MotivoFallo = 'sin_code' | 'exchange'

/**
 * Clave de aviso (?auth=) que /login traduce a un mensaje. El flujo define
 * el "sabor" del mensaje (invitación vs recuperación) para no confundir a
 * un empleado invitado con copy de "recuperación de contraseña".
 */
export function avisoError(flujo: FlujoAuth, motivo: MotivoFallo): string {
  if (flujo === 'invitacion') {
    return motivo === 'sin_code' ? 'invite_invalido' : 'invite_expirado'
  }
  return motivo === 'sin_code' ? 'link_invalido' : 'link_expirado'
}
