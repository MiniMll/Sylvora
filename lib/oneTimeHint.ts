// Persistencia "ya vi este hint" — permanente, una vez por usuario
// y dispositivo. Distinto de lib/dismissible.ts que es por DÍA (para
// banners que conviene re-mostrar a la mañana siguiente). Acá no:
// un hint del estilo "así se usa el scanner" se ve una vez y nunca
// más se molesta al cajero.
//
// Namespace 'sylvora.hint.*' para no colisionar con
// 'sylvora.dismiss.*' (banners por día) ni 'sylvora.scanner.muted'
// (mute del scanner).
//
// SSR-safe + try/catch defensivos contra Safari incógnito.

const NAMESPACE = 'sylvora.hint.'

function fullKey(key: string): string {
  return `${NAMESPACE}${key}`
}

export function isHintSeen(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(fullKey(key)) === '1'
  } catch {
    return false
  }
}

export function markHintSeen(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(fullKey(key), '1')
  } catch {
    /* storage deshabilitado — el hint reaparecerá en la próxima
       apertura. Aceptable. */
  }
}

/** Útil para QA: forzar que el hint vuelva a aparecer. */
export function resetHint(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(fullKey(key))
  } catch {
    /* no-op */
  }
}
