'use client'
import { useCallback, useSyncExternalStore } from 'react'
import { isDismissedToday, dismissToday } from '@/lib/dismissible'

// Adapter React para `lib/dismissible.ts`. La lógica pura vive ahí —
// este hook solo expone estado + handler para componentes.
//
// Por qué useSyncExternalStore en vez de useEffect+useState:
//
//   1. localStorage es una "fuente externa" en términos de React. El
//      hook fue diseñado exactamente para este caso — leer datos
//      sincrónicos no-React de forma SSR-safe.
//   2. Evita el patrón anti-pattern "setState dentro de useEffect
//      para sincronizar con almacenamiento externo" (React 19 lo
//      marca como error de lint: react-hooks/set-state-in-effect).
//   3. SSR-safe sin flash: `getServerSnapshot` devuelve true
//      (= dismissed) → en server y primer paint el banner está
//      oculto. En el primer render del cliente `getSnapshot` lee
//      localStorage y devuelve el valor real — todo en el mismo
//      paint, sin segundo render. No hay flash visible.
//   4. Reacciona a cambios cross-tab: si el usuario ocultó el aviso
//      en otra tab, el evento 'storage' actualiza esta tab también.
//      No es crítico para trial-banner, pero es gratis con este API.
//
// Persistencia por día local (ver lib/dismissible.ts). Reutilizable:
// pasá una `key` distinta por cada aviso ('trial-banner',
// 'mantenimiento', etc.). El namespace "sylvora.dismiss." se aplica
// automáticamente.

interface UseDismissibleTodayResult {
  /** true si el aviso debe ocultarse. En SSR/primer paint siempre
   *  true (default seguro = no parpadear). En cliente refleja el
   *  estado real de localStorage. */
  dismissed: boolean
  /** Marcar como muteado por el resto del día local y ocultar
   *  inmediatamente. Persistido en localStorage. */
  dismiss: () => void
}

/** Suscripción al evento 'storage' del window. React lo llama una
 *  sola vez cuando el componente se monta. El handler `notify`
 *  fuerza una nueva lectura de getSnapshot → re-render con el valor
 *  actualizado. Útil cuando otra tab oculta el mismo aviso. */
function subscribe(notify: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', notify)
  return () => window.removeEventListener('storage', notify)
}

/** Snapshot en server: asumimos "muteado" para que el aviso NO
 *  renderice en SSR. Si en cliente no está muteado, la primera
 *  llamada a getSnapshot lo corrige sin pintar el estado server. */
function getServerSnapshot(): boolean {
  return true
}

export function useDismissibleToday(key: string): UseDismissibleTodayResult {
  // getSnapshot debe ser estable entre renders para que React no
  // re-suscriba sin necesidad. useCallback lo congela mientras
  // `key` no cambie.
  const getSnapshot = useCallback(() => isDismissedToday(key), [key])

  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const dismiss = useCallback(() => {
    dismissToday(key)
    // dismissToday escribe en localStorage. Como NO disparamos el
    // evento 'storage' a nosotros mismos (solo se dispara cross-tab),
    // forzamos un re-render notificando manualmente — emitimos un
    // StorageEvent custom que nuestro subscribe captura.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage'))
    }
  }, [key])

  return { dismissed, dismiss }
}
