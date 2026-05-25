// ─────────────────────────────────────────────────────────────────────
// Persistencia "ocultar hoy" para banners y avisos no críticos.
//
// Lógica:
//   - Guardamos en localStorage la fecha local (YYYY-MM-DD) en la que
//     el usuario ocultó el aviso.
//   - Al día siguiente la fecha no coincide → el aviso vuelve a
//     aparecer sin necesidad de cron ni TTL.
//   - El mute es por DÍA, no permanente. Pensado para banners de
//     urgencia creciente (trial, mantenimiento, nueva versión), donde
//     ocultar para siempre sería contraproducente.
//
// SSR-safe: todas las funciones chequean `typeof window` antes de
// tocar localStorage. En servidor o en environments sin storage
// (modo incógnito en algunos navegadores) degradan a "no muteado",
// que es el default seguro — el aviso se muestra.
//
// Namespace: todas las keys se prefijan con "sylvora.dismiss." para
// no colisionar con otras keys del producto y para que un futuro
// "borrar todos los mutes" sea un único loop sobre Object.keys.
//
// Reutilizable: pensado para alimentar a useDismissibleToday(key) y
// a cualquier futuro componente Banner. Para usarlo en otros
// dominios (ej. tooltips one-shot), copiar el patrón con otro suffix
// de namespace ("sylvora.tip." o similar) en vez de mezclar acá.
// ─────────────────────────────────────────────────────────────────────

const NAMESPACE = 'sylvora.dismiss.'

/** Fecha local en formato YYYY-MM-DD. Usar local — no UTC — porque
 *  la noción humana de "hoy" es la del huso del usuario. Si el
 *  comercio está en Argentina (UTC-3) y son las 23:30 del 24, el
 *  comparador devuelve "2026-05-24"; a las 00:01 del 25, "2026-05-25"
 *  → el aviso reaparece automáticamente. */
export function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fullKey(key: string): string {
  return `${NAMESPACE}${key}`
}

/** ¿El aviso `key` fue ocultado hoy?
 *  En SSR o si no hay localStorage disponible, devuelve false
 *  (= "no muteado" = "mostrá el aviso"). Es el default conservador. */
export function isDismissedToday(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = window.localStorage.getItem(fullKey(key))
    return stored === todayLocalISO()
  } catch {
    // Safari en modo privado puede tirar QuotaExceeded incluso en
    // getItem si el storage está deshabilitado. No queremos que un
    // error de storage rompa el render del aviso.
    return false
  }
}

/** Ocultar el aviso `key` por el resto del día local actual. */
export function dismissToday(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(fullKey(key), todayLocalISO())
  } catch {
    // Si no se puede persistir, el aviso reaparecerá en el siguiente
    // render — UX peor que silenciar pero no rompe nada.
  }
}

/** Limpiar el mute del aviso `key`. Útil para testing y para un
 *  futuro botón "restablecer avisos" en configuración. */
export function undismiss(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(fullKey(key))
  } catch {
    /* no-op */
  }
}
