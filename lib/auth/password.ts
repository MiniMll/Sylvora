// Validación de contraseña nueva, compartida por todos los flujos que
// setean/cambian password: registro, cambio en Configuración, y
// recuperación. Centralizar la regla evita que cada pantalla defina su
// propio mínimo o mensaje (antes login/registro/TabCuenta la repetían).
//
// PURO: sin Supabase, sin React. Testeable en aislamiento.

export const PASSWORD_MIN_LEN = 6

export type ValidacionPassword =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Valida una contraseña nueva y su confirmación.
 * Reglas V1: mínimo PASSWORD_MIN_LEN caracteres y ambas coinciden.
 */
export function validarPasswordNueva(pwd1: string, pwd2: string): ValidacionPassword {
  if (typeof pwd1 !== 'string' || pwd1.length < PASSWORD_MIN_LEN) {
    return { ok: false, error: `La contraseña debe tener al menos ${PASSWORD_MIN_LEN} caracteres` }
  }
  if (pwd1 !== pwd2) {
    return { ok: false, error: 'Las contraseñas no coinciden' }
  }
  return { ok: true }
}
