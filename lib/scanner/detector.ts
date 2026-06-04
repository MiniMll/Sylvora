// ─────────────────────────────────────────────────────────────────────
// Primitiva pura de detección de códigos de barras desde un frame de
// video. Sin React, sin DOM-mutations, sin lifecycle. La API es:
//
//   const det = await createDetector()  // null si nada está soportado
//   if (det) {
//     const codigo = await det.detect(videoElement)
//     if (codigo) onScan(codigo)
//     // ... repetir con setInterval / requestAnimationFrame
//     det.dispose()
//   }
//
// El caller controla el polling rate, el debounce, el loop. El detector
// solo extrae un código del frame actual del video y devuelve string
// o null. Esto deja al caller libre para implementar la UI (modal,
// torch, fallback) en commits posteriores.
//
// Estrategia híbrida:
//   1. Si el browser soporta BarcodeDetector (Chrome Android, Edge),
//      lo usamos — cero KB extra y mejor performance que cualquier JS.
//   2. Fallback a @zxing/browser para iOS Safari, Firefox, browsers
//      sin soporte nativo. La librería se carga via dynamic import
//      SOLO cuando se necesita, para no inflar el bundle del POS
//      en visitantes que no van a usar el scanner.
//
// Formatos soportados en V1: EAN-13, EAN-8, UPC-A, Code-128, ITF.
// Cubre productos de almacén AR (EAN-13 mayoritariamente), items
// importados (UPC-A) e industriales (Code-128, ITF). QR queda fuera.
// ─────────────────────────────────────────────────────────────────────

// ───── Typing manual de BarcodeDetector ─────────────────────────────
// La WebAPI BarcodeDetector está implementada en Chrome/Edge pero su
// tipo todavía no vive en lib.dom.d.ts. Declaramos lo mínimo que
// usamos. Si TS bumpea las defs y aparece nativo, esto sigue siendo
// compatible (Structural typing).

interface DetectedBarcodeShape {
  rawValue: string
  format: string
}

interface BarcodeDetectorShape {
  detect(source: HTMLVideoElement): Promise<DetectedBarcodeShape[]>
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorShape
  getSupportedFormats?(): Promise<string[]>
}

/** Formatos que pedimos al detector. Strings que entiende la
 *  BarcodeDetector nativa. Para ZXing los mapeamos a su enum. */
const FORMATS_NATIVE = ['ean_13', 'ean_8', 'upc_a', 'code_128', 'itf']

// ───── Capability detection ─────────────────────────────────────────

export type DetectorStrategy = 'native' | 'zxing' | 'none'

/** Detecta sincrónicamente qué estrategia está disponible. Útil para
 *  ocultar el botón "Escanear" si no hay forma de hacerlo (estrategia
 *  = 'none'). No fuerza la carga de ZXing — solo chequea APIs nativas
 *  y disponibilidad de getUserMedia.
 *
 *  Devuelve:
 *    'native' → BarcodeDetector nativo + getUserMedia disponibles.
 *    'zxing'  → getUserMedia disponible, sin BarcodeDetector nativo
 *               (ZXing se cargará lazy al invocar createDetector).
 *    'none'   → getUserMedia no disponible o estamos en SSR. UI debe
 *               ocultar el botón de cámara. */
export function getDetectorStrategy(): DetectorStrategy {
  // SSR-safe: en server no hay window.
  if (typeof window === 'undefined') return 'none'
  if (!window.navigator?.mediaDevices?.getUserMedia) return 'none'

  const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (Ctor) return 'native'
  return 'zxing'
}

// ───── Interfaz pública ─────────────────────────────────────────────

export interface Detector {
  /** Procesa el frame actual del video. Devuelve el string del código
   *  detectado o null si no había nada decodificable. Errores de
   *  decodificación (NotFoundException de ZXing, etc.) se mapean a
   *  null — el caller NO recibe excepciones para esto. */
  detect(video: HTMLVideoElement): Promise<string | null>

  /** Libera recursos internos (reset del reader de ZXing, etc.).
   *  Idempotente: llamar dos veces no rompe. */
  dispose(): void

  /** Qué estrategia se usó. Útil para QA, logs y diagnóstico. */
  readonly strategy: 'native' | 'zxing'
}

// ───── Implementación: nativo ───────────────────────────────────────

class NativeDetector implements Detector {
  readonly strategy = 'native' as const
  private inner: BarcodeDetectorShape

  constructor(Ctor: BarcodeDetectorCtor) {
    this.inner = new Ctor({ formats: FORMATS_NATIVE })
  }

  async detect(video: HTMLVideoElement): Promise<string | null> {
    // BarcodeDetector falla con OperationError si el video todavía
    // no tiene frame (videoWidth=0). Defendemos.
    if (!video.videoWidth || !video.videoHeight) return null
    try {
      const codes = await this.inner.detect(video)
      return codes[0]?.rawValue ?? null
    } catch {
      // OperationError, encoding errors, etc. → no-detection.
      return null
    }
  }

  dispose(): void {
    // BarcodeDetector nativo no tiene cleanup explícito — el GC lo
    // libera cuando ya nadie lo referencia.
  }
}

// ───── Implementación: ZXing (lazy) ─────────────────────────────────
// Tipamos solo lo que usamos, no importamos types del módulo
// directamente para evitar que TS arrastre @zxing/browser al bundle
// principal aún cuando el código lo carga via dynamic import.

interface ZXingReader {
  decodeFromCanvas(canvas: HTMLCanvasElement): { getText(): string }
  reset?(): void
}

class ZXingDetector implements Detector {
  readonly strategy = 'zxing' as const
  private reader: ZXingReader
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(reader: ZXingReader) {
    this.reader = reader
    // Canvas re-usable entre frames — evita allocar uno por scan,
    // lo que importa cuando el caller polls a 10-15fps.
    this.canvas = document.createElement('canvas')
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new Error('No se pudo crear contexto 2D para el canvas del scanner')
    }
    this.ctx = ctx
  }

  async detect(video: HTMLVideoElement): Promise<string | null> {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null

    // Ajustamos el tamaño del canvas solo si el video cambió de
    // resolución (cambio de cámara, rotación). El resize tiene costo.
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.ctx.drawImage(video, 0, 0, w, h)

    try {
      // decodeFromCanvas es síncrono en ZXing pero envolvemos en
      // Promise.resolve para que la firma de la interfaz sea uniforme
      // con NativeDetector (async).
      const result = this.reader.decodeFromCanvas(this.canvas)
      return result.getText()
    } catch {
      // NotFoundException (no hay código en el frame) y otros errores
      // de decoding → null. Es el caso normal por frame.
      return null
    }
  }

  dispose(): void {
    try {
      this.reader.reset?.()
    } catch {
      /* no-op — reset no debería tirar pero defendemos */
    }
  }
}

// ───── Factory ──────────────────────────────────────────────────────

/** Crea el mejor detector disponible para este browser.
 *
 *  Para 'native': retorna instancia inmediatamente, sin async work
 *  real (solo el `await` por la firma de la función).
 *
 *  Para 'zxing': carga @zxing/browser via dynamic import → ~80-90 KB
 *  gzipped. NO impacta el bundle principal del POS porque está fuera
 *  del grafo estático.
 *
 *  Para 'none': retorna null. El caller no debería haber llegado acá
 *  (debería haber chequeado getDetectorStrategy() antes), pero si
 *  pasa, devolvemos null sin tirar — defensivo. */
export async function createDetector(): Promise<Detector | null> {
  const strategy = getDetectorStrategy()
  if (strategy === 'none') return null

  if (strategy === 'native') {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
    if (!Ctor) return null // Race: capability cambió. Improbable.
    return new NativeDetector(Ctor)
  }

  // strategy === 'zxing'. Lazy import — esta línea es la que define
  // el chunk separado en el build de Next.
  try {
    const zxing = await import('@zxing/browser')
    const reader = new zxing.BrowserMultiFormatReader() as unknown as ZXingReader
    return new ZXingDetector(reader)
  } catch (e) {
    console.error('[scanner] No se pudo cargar ZXing:', e)
    return null
  }
}
