'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Keyboard, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import type { BrowserMultiFormatReader } from '@zxing/library'
import type { Producto } from '@/types/database'

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

  // Idempotente: detiene reader + libera tracks. Llamado desde el botón
  // X, en éxito de scan, en error de getUserMedia y en unmount.
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
    setModoCamara(false)
    setCamaraActiva(false)
  }, [])

  // Mientras la cámara esté activa, ZXing emite por frame el warning
  // "MultiFormatReader: non-ReaderException from reader" cuando un
  // reader interno tira algo distinto de ReaderException (normal en
  // mobile por motion blur / exposición). Lo filtramos sin tocar el
  // resto de console.warn. Restauramos el original al cerrar.
  useEffect(() => {
    if (!modoCamara) return
    const original = console.warn
    console.warn = (...args: unknown[]) => {
      const first = args[0]
      if (typeof first === 'string' && first.startsWith('MultiFormatReader')) return
      original.apply(console, args as [])
    }
    return () => { console.warn = original }
  }, [modoCamara])

  // Cleanup al desmontar (ej. usuario navega a otra ruta con la cámara abierta).
  useEffect(() => {
    return () => { cerrarCamara() }
  }, [cerrarCamara])

  const iniciarCamara = async () => {
    setModoCamara(true)
    setCamaraActiva(false)
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
      videoRef.current.play()
      setCamaraActiva(true)
      codeReader.decodeFromVideoDevice(null, videoRef.current, (result, error) => {
        if (result) {
          agregarPorCodigo(result.getText())
          cerrarCamara()
          return
        }
        // El callback se llama una vez por frame con (undefined, error).
        // - NotFoundException: "no hay código en este frame" — normal,
        //   ignorar silenciosamente.
        // - Otros: errores transitorios (motion blur, low light). Los
        //   ignoramos también para no spamear toasts ni gatillar
        //   re-renders en loop. ZXing los logea internamente; el
        //   warning de "MultiFormatReader: ..." se filtra en el effect
        //   de arriba.
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
            <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center' }}>Apuntá la cámara al código de barras</p>
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
