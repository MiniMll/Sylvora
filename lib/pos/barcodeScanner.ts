// Scanner de códigos de barras a nivel de módulo (singleton).
// Inspirado en la implementación JS plana de POS: el estado vive
// fuera de React y NO se ve afectado por StrictMode double-mounts,
// re-renders ni unmounts intermedios.
//
// API pública:
//   - startScanner({ videoEl, onScan }) : abre cámara con
//     decodeFromConstraints (un solo getUserMedia, manejado por ZXing)
//     y arranca el loop de decode.
//   - stopScanner() : idempotente. Detiene reader, libera tracks,
//     limpia el <video> y restaura console.warn/error.
//   - isScannerActive() : útil si el consumer necesita verificar.

import type { BrowserMultiFormatReader } from '@zxing/library'

export type OnScan = (codigo: string) => void

interface ScannerState {
  active: boolean
  reader: BrowserMultiFormatReader | null
  videoEl: HTMLVideoElement | null
  /** Próximo timestamp en el que se permite procesar un scan. */
  lockUntil: number
}

const state: ScannerState = {
  active: false,
  reader: null,
  videoEl: null,
  lockUntil: 0,
}

// Cooldown global tras cada scan procesado. Equivale al toggle
// "scannerActivo = false; sleep; = true" del JS de referencia, pero
// expresado como timestamp para evitar timers/promises por scan.
const COOLDOWN_MS = 1500

// ── Filtro de logs ZXing ──────────────────────────────────────────
// ZXing logea "MultiFormatReader: non-ReaderException from reader"
// por cada frame que no decodifica limpio (motion blur, exposición).
// Lo silenciamos a nivel módulo con refcount para que múltiples
// arranques (o StrictMode dev) no se pisen al envolver/restaurar.

let _origWarn: typeof console.warn | null = null
let _origError: typeof console.error | null = null
let _silenceCount = 0

function shouldFilterLog(args: unknown[]): boolean {
  const first = args[0]
  if (typeof first !== 'string') return false
  return (
    first.startsWith('MultiFormatReader') ||
    first.includes('non-ReaderException') ||
    first.includes('ReaderException') ||
    first.startsWith('ZXing')
  )
}

function silenceLogs() {
  if (_silenceCount === 0) {
    _origWarn = console.warn
    _origError = console.error
    console.warn = (...args: unknown[]) => {
      if (shouldFilterLog(args)) return
      _origWarn?.apply(console, args as [])
    }
    console.error = (...args: unknown[]) => {
      if (shouldFilterLog(args)) return
      _origError?.apply(console, args as [])
    }
  }
  _silenceCount++
}

function restoreLogs() {
  _silenceCount = Math.max(0, _silenceCount - 1)
  if (_silenceCount === 0) {
    if (_origWarn) console.warn = _origWarn
    if (_origError) console.error = _origError
    _origWarn = null
    _origError = null
  }
}

// ── API pública ───────────────────────────────────────────────────

export interface StartOptions {
  videoEl: HTMLVideoElement
  onScan: OnScan
}

/**
 * Abre la cámara y empieza a escanear continuamente. Idempotente:
 * llamar dos veces seguidas no abre dos sesiones.
 */
export async function startScanner({ videoEl, onScan }: StartOptions): Promise<void> {
  if (state.active) return
  state.active = true
  state.videoEl = videoEl
  state.lockUntil = 0
  silenceLogs()

  try {
    const { BrowserMultiFormatReader } = await import('@zxing/library')

    // Si stopScanner() corrió durante el await de import, abortar.
    if (!state.active) return

    const reader = new BrowserMultiFormatReader()
    state.reader = reader

    // decodeFromConstraints maneja getUserMedia + attach al <video> +
    // loop de decode. Único punto de obtención del stream — evita el
    // patrón anterior (getUserMedia manual + decodeFromVideoDevice con
    // deviceId null) que terminaba abriendo dos streams.
    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoEl,
      (result) => {
        if (!result || !state.active) return
        const now = Date.now()
        // Cooldown global: cualquier scan dentro de la ventana se
        // ignora. Aplica a códigos iguales y distintos por igual,
        // matching el comportamiento del POS de referencia.
        if (now < state.lockUntil) return
        state.lockUntil = now + COOLDOWN_MS

        const codigo = result.getText()
        try {
          onScan(codigo)
        } catch {
          // El consumer es responsable de su propio error handling.
        }
      }
    )
  } catch (e) {
    await stopScanner()
    throw e
  }
}

/**
 * Detiene el scanner y libera todos los recursos. Idempotente.
 */
export async function stopScanner(): Promise<void> {
  // Marcar inactivo PRIMERO: cualquier callback en vuelo verá
  // !state.active y no procesará el frame.
  state.active = false

  if (state.reader) {
    try { state.reader.reset() } catch { /* defensivo */ }
    state.reader = null
  }

  const v = state.videoEl
  if (v) {
    if (v.srcObject) {
      const stream = v.srcObject as MediaStream
      stream.getTracks().forEach(t => { try { t.stop() } catch { /* ignore */ } })
      v.srcObject = null
    }
    // pause + load: explícito en mobile (iOS Safari) para que el
    // elemento <video> realmente libere el dispositivo.
    try { v.pause() } catch { /* ignore */ }
    try { v.load() } catch { /* ignore */ }
  }

  state.videoEl = null
  state.lockUntil = 0
  restoreLogs()

  // Ventana corta para que el browser libere la cámara antes de un
  // posible re-arranque. En el JS de referencia es 500ms, acá 100ms
  // alcanza porque no hacemos close-and-reopen por cada scan.
  await new Promise(r => setTimeout(r, 100))
}

export function isScannerActive(): boolean {
  return state.active
}
