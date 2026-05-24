// ─────────────────────────────────────────────────────────────────────
// Helpers puros para derivar el estado del trial de un comercio.
//
// Filosofía V1: el estado "expirado efectivo" se DERIVA al leer, no
// se materializa en la columna `plan`. Esto evita cron jobs y
// triggers — el reloj se chequea en cada render.
//
// Reglas:
//   plan='active'                              → acceso completo
//   plan='trial' && now <= trial_ends_at       → acceso completo (trial vigente)
//   plan='trial' && now >  trial_ends_at       → expirado (soft-lock)
//   plan='expired'                             → expirado (cortado manual por admin)
//   plan='trial' && trial_ends_at IS NULL      → expirado (defensa: dato corrupto)
//
// Edge case: now === trial_ends_at → consideramos vigente (`<=`). El
// usuario tiene acceso al milisegundo exacto de su deadline.
//
// Estos helpers son la ÚNICA fuente de verdad para la derivación. El
// componente TrialBlocked, el hook useTrial y cualquier futura policy
// RLS server-side deben respetar la misma lógica.
// ─────────────────────────────────────────────────────────────────────

import type { Comercio } from '@/types/database'

export type EstadoTrial = 'trial' | 'active' | 'expired'

/** Estado efectivo del trial — distinto de `comercio.plan` cuando el
 *  trial venció pero nadie cambió la columna a 'expired' todavía. */
export function estadoTrial(c: Comercio | null | undefined): EstadoTrial {
  if (!c) return 'trial' // optimistic default mientras carga
  if (c.plan === 'active') return 'active'
  if (c.plan === 'expired') return 'expired'
  // plan === 'trial': depende del reloj
  if (!c.trial_ends_at) return 'expired' // dato corrupto → conservador
  const fin = new Date(c.trial_ends_at).getTime()
  return Date.now() <= fin ? 'trial' : 'expired'
}

/** ¿El comercio puede usar features bloqueables (POS, exportar)?
 *  True para 'active' y 'trial' vigente. False para 'expired'. */
export function accesoCompleto(c: Comercio | null | undefined): boolean {
  const e = estadoTrial(c)
  return e === 'active' || e === 'trial'
}

/** ¿El trial está vencido (o el comercio fue cortado a mano)? */
export function expirado(c: Comercio | null | undefined): boolean {
  return estadoTrial(c) === 'expired'
}

/** Días restantes del trial, o null si no aplica (active / expired /
 *  loading). Redondea hacia abajo: si quedan 2.7 días, devuelve 2. */
export function diasRestantesTrial(c: Comercio | null | undefined): number | null {
  if (!c || c.plan !== 'trial' || !c.trial_ends_at) return null
  const ms = new Date(c.trial_ends_at).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}
