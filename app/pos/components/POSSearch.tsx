'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Keyboard, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import type { BrowserMultiFormatReader } from '@zxing/library'
import type { Producto } from '@/types/database'

// "Trigger lock" estilo POS profesional. La ventana es DESLIZANTE: cada
// detección del mismo código renueva el timestamp, así el lock se
// mantiene mientras el código siga en cuadro. Sólo se libera si el
// código deja de verse por más de SCAN_DEBOUNCE_MS y reaparece. Así
// hold-en-cuadro = 1 lectura, código removido y re-presentado = 2.
const SCAN_DEBOUNCE_MS = 1500

// ZXing emite "MultiFormatReader: non-ReaderException from reader" por
// cada frame que no decodifica limpio (motion blur, exposición, low
// light en mobile). Es noise interno de la librería. Lo filtramos a
// nivel de módulo con refcount, así varias instancias / dobles mounts
// de StrictMode no se pisan al envolver/restaurar console.
let _origWarn: typeof console.warn | null = null
let _origError: typeof console.error | null = null
let _silenceCount = 0

function shouldFilterZxing(args: unknown[]): boolean {
  const first = args[0]
  if (typeof first !== 'string') return false
  return (
    first.startsWith('MultiFormatReader') ||
    first.includes('non-ReaderException') ||
    first.includes('ReaderException') ||
    first.startsWith('ZXing')
  )
}

function silenceZxingLogs() {
  if (_silenceCount === 0) {
    _origWarn = console.warn
    _origError = console.error
    console.warn = (...args: unknown[]) => {
      if (shouldFilterZxing(args)) return
      _origWarn?.apply(console, args as [])
    }
    console.error = (...args: unknown[]) => {
      if (shouldFilterZxing(args)) return
      _origError?.apply(console, args as [])
    }
  }
  _silenceCount++
}

function restoreZxingLogs() {
  _silenceCount = Math.max(0, _silenceCount - 1)
  if (_silenceCount === 0) {
    if (_origWarn) console.warn = _origWarn
    if (_origError) console.error = _origError
    _origWarn = null
    _origError = null
  }
}

interface Props {
  productos: Producto[]
  value: string
  onChange: (v: string) => void
  /** Se llama al seleccionar un producto desde scanner/cámara o tecla Enter. */
  onSelect: (p: Producto) => void
  /** Resultados ya filtrados — para el atajo "Enter cuando hay 1 sólo resultado". */
  resultados: Producto[]
}

export function POSSearch({ productos, value, onChange, onSelect, resultados }: Props) {
  const busquedaRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const lastScanRef = useRef<{ codigo: string; ts: number }>({ codigo: '', ts: 0 })
  // Evita arranque doble si el botón se clickea dos veces o si en
  // dev React StrictMode dispara dos efectos.
  const startingRef = useRef(false)
  // Refleja si esta instancia ya silenció los logs — para no dejar
  // refcount colgado en cleanup parciales.
  const silencedRef = useRef(false)
  const [modoCamara, setModoCamara] = useState(false)
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [modalScanner, setModalScanner] = useState(false)
  const [codigoManual, setCodigoManual] = useState('')

  const agregarPorCodigo = (codigo: string) => {
    const p = productos.find(x => x.codigo_barras === codigo)
    if (p) {
      onSelect(p)
      setCodigoManual('')
      setModalScanner(false)
    } else {
      toast.error('Código no encontrado: ' + codigo)
    }
  }

  // Idempotente: detiene reader + libera tracks + restaura console.
  // Llamado SOLO al cerrar manualmente con la X, en error de
  // getUserMedia y en unmount. NUNCA tras un scan exitoso — la cámara
  // queda abierta para múltiples lecturas (modo POS profesional).
  const cerrarCamara = useCallback(() => {
    if (codeReaderRef.current) {
      try { codeReaderRef.current.reset() } catch {}
      codeReaderRef.current = null
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    if (silencedRef.current) {
      restoreZxingLogs()
      silencedRef.current = false
    }
    lastScanRef.current = { codigo: '', ts: 0 }
    startingRef.current = false
    setModoCamara(false)
    setCamaraActiva(false)
  }, [])

  // Cleanup al desmontar (ej. usuario navega a otra ruta con la cámara abierta).
  useEffect(() => {
    return () => { cerrarCamara() }
  }, [cerrarCamara])

  const iniciarCamara = async () => {
    // Anti-doble-arranque: si ya hay una sesión en curso o iniciándose,
    // no abrimos otra. Cubre clicks rápidos y dobles-mounts de StrictMode.
    if (startingRef.current || codeReaderRef.current) return
    startingRef.current = true

    setModoCamara(true)
    setCamaraActiva(false)

    // Silenciar logs de ZXing INMEDIATAMENTE, antes de cualquier await,
    // para evitar la ventana entre setState y useEffect en la que
    // pasaban warns. Refcounteado a nivel módulo.
    silenceZxingLogs()
    silencedRef.current = true

    try {
      const { BrowserMultiFormatReader, NotFoundException } = await import('@zxing/library')
      const codeReader = new BrowserMultiFormatReader()
      codeReaderRef.current = codeReader
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (!videoRef.current) {
        // El componente se desmontó entre el await y acá. Liberar stream.
        stream.getTracks().forEach(t => t.stop())
        cerrarCamara()
        return
      }
      videoRef.current.srcObject = stream
      // play() puede rechazar en iOS Safari sin gesto reciente; el click
      // de "Cámara" cuenta como gesto pero por las dudas tragamos el
      // rejection para no propagarlo como unhandled promise.
      videoRef.current.play().catch(() => {})
      setCamaraActiva(true)
      startingRef.current = false

      codeReader.decodeFromVideoDevice(null, videoRef.current, (result, error) => {
        if (result) {
          const codigo = result.getText()
          const now = Date.now()
          const last = lastScanRef.current

          if (last.codigo === codigo) {
            // Mismo código: ventana DESLIZANTE. Renovamos ts SIEMPRE,
            // así el lock se sostiene mientras el código siga a la vista.
            const elapsed = now - last.ts
            last.ts = now
            // Sólo se desbloquea si transcurrió la ventana completa sin
            // detecciones (= código fuera de cuadro y vuelto a presentar).
            if (elapsed < SCAN_DEBOUNCE_MS) return
          } else {
            // Código distinto: pasa al instante, reset del lock.
            last.codigo = codigo
            last.ts = now
          }

          // Lookup local. NO cerramos la cámara — el cajero sigue escaneando.
          const p = productos.find(x => x.codigo_barras === codigo)
          if (p) {
            onSelect(p)
            // id estable → sonner reemplaza el toast anterior en lugar
            // de stackear si vienen escaneos seguidos.
            toast.success(`${p.nombre} agregado`, { id: 'pos-scanner' })
          } else {
            toast.error(`Código no encontrado: ${codigo}`, { id: 'pos-scanner' })
          }
          return
        }
        // Frame sin resultado.
        // - NotFoundException: no hay código visible (normal, ZXing fires ~30/s).
        // - Otros: transitorios (motion blur, exposición). Sin side-effect
        //   alguno: no toast, no setState, no log. Los logs internos de
        //   ZXing ya están silenciados por silenceZxingLogs().
        if (error && !(error instanceof NotFoundException)) {
          // intencionalmente vacío: ningún side-effect por frame.
        }
      })
    } catch {
      toast.error('No se pudo acceder a la cámara')
      cerrarCamara()
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} color="var(--text2)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            ref={busquedaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && resultados.length === 1) onSelect(resultados[0])
              if (e.key === 'Escape') onChange('')
            }}
            placeholder="Buscar producto o escanear código..."
            autoFocus
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px 9px 32px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)' }}
          />
        </div>
        <button onClick={iniciarCamara}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'inherit' }}>
          <Camera size={14} /> Cámara
        </button>
        <button onClick={() => setModalScanner(true)}
          style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: '#5b4cff', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'inherit' }}>
          <Keyboard size={14} /> Lector
        </button>
      </div>

      {/* Modal cámara */}
      {modoCamara && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 24, width: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Camera size={14} /> Escanear con cámara
              </span>
              <button onClick={cerrarCamara} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', position: 'relative', height: 220, marginBottom: 12 }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
              {!camaraActiva && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12 }}>Iniciando cámara...</div>}
              {camaraActiva && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ width: 200, height: 80, border: '2px solid #5b4cff', borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
                </div>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center' }}>Escaneá productos en serie · cerrá cuando termines</p>
          </div>
        </div>
      )}

      {/* Modal lector físico */}
      {modalScanner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 24, width: 360 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Keyboard size={14} /> Lector de código
              </span>
              <button onClick={() => setModalScanner(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>Escaneá con tu lector o ingresá el código manualmente.</p>
            <input value={codigoManual} onChange={e => setCodigoManual(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && codigoManual) agregarPorCodigo(codigoManual) }}
              placeholder="Código de barras..."
              style={{ width: '100%', border: '2px solid #5b4cff', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontFamily: 'monospace', textAlign: 'center', outline: 'none', marginBottom: 10, background: 'var(--bg2)', color: 'var(--text)' }}
              autoFocus />
            <button onClick={() => agregarPorCodigo(codigoManual)}
              style={{ width: '100%', padding: '10px', borderRadius: 8, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Agregar producto
            </button>
          </div>
        </div>
      )}
    </>
  )
}
