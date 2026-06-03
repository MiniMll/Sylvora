'use client'
import { useEffect, useRef } from 'react'

// Hook que detecta pistolas/escáneres físicos USB que emulan teclado
// (HID, modo HID-KBW). Listener global de keydown que captura el
// patrón "ráfaga muy rápida de chars + Enter" y lo dispara como un
// scan SIN necesidad de tener el input focado.
//
// Por qué existe: la pistola tipea los dígitos donde sea que esté
// el foco. Si el cajero acaba de clickear el botón Cobrar y vuelve a
// escanear, el primer keystroke (un dígito) cae en el body sin
// hacer nada útil. Con este hook, lo capturamos y agregamos al
// carrito sin que el cajero tenga que tocar el input.
//
// Heurística (calibrada para 99% de pistolas baratas):
//   - Buffer de keystrokes consecutivos con timestamps.
//   - Terminator: Enter o Tab (las pistolas configurables permiten
//     ambas; default Enter).
//   - Para considerar la ráfaga un scan:
//       1. Longitud ≥ 6 (EAN-13 son 13 dígitos, Code-128 industrial
//          suele ser ≥6). Códigos cortos los rechazamos para no
//          confundir con "1<Enter>" tipeado humano.
//       2. Tiempo total (primer key → Enter) ≤ 1000ms.
//       3. Intervalo PROMEDIO entre keys < 30ms (humanos máximos
//          rondan 50-60ms incluso tipeando muy rápido).
//   - Si entre dos keystrokes consecutivos pasa > 100ms, el buffer
//     se resetea — el cajero tipeó algo y después llegó un scan.
//
// Defensas:
//   - Skip cuando el target del evento es input/textarea/select/
//     contenteditable. Esos casos los maneja el componente que tenga
//     el foco (ej. POSSearch tiene su propio onKeyDown con detección
//     de scan en input). Evitamos doble-procesamiento.
//   - Skip cuando hay un modal abierto ([data-modal-card] presente)
//     — el scanner modal por cámara, modal de cobrar, etc. tienen
//     su propio flujo de teclado.
//   - Skip combinaciones con Ctrl/Alt/Meta (shortcuts del browser
//     o del usuario).
//   - preventDefault del Enter al detectar scan exitoso, para evitar
//     que ese Enter active accidentalmente un botón con focus
//     (ej. "Cobrar").

interface UseScannerHIDOptions {
  /** Si false, el hook NO escucha. Útil para gatear por trial
   *  vencido, página de carga, etc. */
  active: boolean
  /** Callback con el código detectado. Recibe el string completo
   *  (sin el terminator Enter). */
  onScan: (codigo: string) => void
}

// Calibración. No exponemos como opciones — V1 valores fijos.
const MIN_LENGTH = 6
const MAX_TOTAL_MS = 1000
const MAX_AVG_INTERVAL_MS = 30
const RESET_GAP_MS = 100

export function useScannerHID({ active, onScan }: UseScannerHIDOptions): void {
  // Mismo patrón que useScannerCamara: ref al callback + sync via
  // effect → el callback más reciente se llama sin re-registrar el
  // listener global (que es caro y causaría perdidas de keystrokes
  // si el padre re-renderiza durante una ráfaga).
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  })

  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined') return

    let buffer = ''
    let firstKeyTime = 0
    let lastKeyTime = 0

    const reset = () => {
      buffer = ''
      firstKeyTime = 0
      lastKeyTime = 0
    }

    const handler = (e: KeyboardEvent) => {
      // ── Skips defensivos ──
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (target?.isContentEditable) return
      if (document.querySelector('[data-modal-card]')) return
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const now = Date.now()

      // ── Terminator: Enter o Tab ──
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (
          buffer.length >= MIN_LENGTH &&
          firstKeyTime > 0
        ) {
          const totalTime = now - firstKeyTime
          // Para 1 sola key el "promedio" no tiene sentido — pero
          // MIN_LENGTH ≥ 6 ya descarta ese caso.
          const avgInterval = totalTime / Math.max(1, buffer.length - 1)
          if (totalTime <= MAX_TOTAL_MS && avgInterval < MAX_AVG_INTERVAL_MS) {
            // ¡Scan detectado!
            e.preventDefault()
            const codigo = buffer
            reset()
            onScanRef.current(codigo)
            return
          }
        }
        // No era un scan — limpiar y dejar que el Enter haga lo
        // que tenga que hacer (submit de form, etc.). No prevenimos.
        reset()
        return
      }

      // ── Char normal ──
      // Solo aceptamos caracteres únicos (no F1, ArrowUp, etc.).
      if (e.key.length !== 1) return

      // Gap > 100ms desde el último key → arrancamos buffer nuevo.
      // Caso típico: cajero apretó "1" en un teclado físico hace
      // 5 segundos (y nada pasó porque no había Enter); ahora llega
      // la ráfaga de la pistola. No queremos contaminar la métrica
      // de tiempo total con ese "1" viejo.
      if (lastKeyTime > 0 && now - lastKeyTime > RESET_GAP_MS) {
        reset()
      }

      if (buffer === '') firstKeyTime = now
      buffer += e.key
      lastKeyTime = now
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [active])
}
