// ─────────────────────────────────────────────────────────────────────
// Beeps sintéticos del scanner — generados con AudioContext, sin
// archivos .mp3. Cero KB de payload, funciona offline, respeta el
// silenciador del sistema en mobile.
//
// Tres variantes según el feedback que queremos dar al cajero:
//   - 'ok'        : código detectado y producto agregado. Tono alto,
//                   corto. Misma "sensación" que un POS de Carrefour.
//   - 'not-found' : código detectado pero el producto no está en el
//                   catálogo. Tono medio, un poco más largo.
//   - 'error'     : sin stock, error de validación. Tono bajo, doble.
//
// Mute persistente: localStorage 'sylvora.scanner.muted'. NO usa el
// patrón "ocultar hoy" del DemoBanner — el mute del scanner es una
// preferencia permanente del comercio (algunos trabajan con música
// alta y nunca quieren el beep), no un dismiss por sesión.
// ─────────────────────────────────────────────────────────────────────

export type BeepKind = 'ok' | 'not-found' | 'error'

const MUTE_KEY = 'sylvora.scanner.muted'

// ───── Mute (localStorage) ──────────────────────────────────────────

export function isScannerMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setScannerMuted(muted: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (muted) window.localStorage.setItem(MUTE_KEY, '1')
    else window.localStorage.removeItem(MUTE_KEY)
  } catch {
    /* storage deshabilitado (Safari incógnito) — no rompemos */
  }
}

// ───── AudioContext lazy + reuse ────────────────────────────────────
// Crear un AudioContext por beep es caro (50-100ms en mobile). Lazy
// init en el primer uso y reutilizamos el mismo. El context queda
// "unlocked" después del primer gesto de usuario, que va a ser
// abrir el modal del scanner — flow natural.

let _ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (_ctx) return _ctx
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    _ctx = new Ctor()
    return _ctx
  } catch {
    return null
  }
}

// ───── Síntesis ─────────────────────────────────────────────────────

function playTone(freq: number, durationMs: number, volume = 0.3): void {
  const ctx = getCtx()
  if (!ctx) return

  // Algunos browsers (iOS Safari) dejan el context en 'suspended'
  // hasta que el usuario interactúa. resume() es no-op si ya está
  // activo. Sin esto, el primer beep no suena.
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq

  const now = ctx.currentTime
  const dur = durationMs / 1000

  // Envelope con fade-out exponencial — un "tic" abrupto suena
  // peor que un beep con decay suave.
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + dur)
}

// ───── API pública ──────────────────────────────────────────────────

/** Reproduce el beep correspondiente. No-op si está muteado o si
 *  el browser no tiene AudioContext. NUNCA tira excepción. */
export function beep(kind: BeepKind): void {
  if (isScannerMuted()) return

  switch (kind) {
    case 'ok':
      playTone(880, 80, 0.30)
      break
    case 'not-found':
      playTone(440, 160, 0.30)
      break
    case 'error':
      // Doble beep grave separados por ~80ms.
      playTone(220, 180, 0.32)
      setTimeout(() => playTone(220, 180, 0.32), 260)
      break
  }
}
