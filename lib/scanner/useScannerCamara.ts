'use client'
import { useEffect, useRef, useState } from 'react'
import { createDetector, getDetectorStrategy, type Detector } from './detector'

// Hook que orquesta el ciclo de vida del scanner por cámara:
//
//   1. Pide getUserMedia con facingMode='environment' (cámara trasera).
//   2. Conecta el stream al <video> del modal.
//   3. Crea el detector apropiado (native o ZXing lazy).
//   4. Loop de detect() cada 100ms (~10 fps — balance entre latencia
//      y batería; 30fps en main thread quema CPU en Android baratos).
//   5. Debounce por código: misma string en <1.5s se ignora.
//      Sin esto, el video detecta el mismo barcode 10 veces por segundo
//      y el carrito explota.
//   6. Cleanup TOTAL al desmontar o cuando active=false:
//      - clearInterval del loop
//      - detector.dispose()
//      - tracks.forEach(stop) → libera la cámara (clave en mobile,
//        sin esto el navegador puede dejarla encendida hasta cerrar tab)
//      - videoRef.srcObject = null
//
// Estados expuestos al caller:
//   'idle'        → todavía no se intentó arrancar (active=false)
//   'unsupported' → browser sin getUserMedia (probable webview o
//                   Firefox viejo)
//   'starting'    → getUserMedia in-flight + creando detector
//   'scanning'    → loop activo
//   'denied'      → usuario rechazó el permiso (irreversible sin
//                   tocar settings del browser)
//   'error'       → algún otro fallo (cámara ocupada por otra app,
//                   detector no se pudo crear). errorMsg explica.

export type ScannerStatus =
  | 'idle'
  | 'unsupported'
  | 'starting'
  | 'scanning'
  | 'denied'
  | 'error'

interface UseScannerCamaraOptions {
  /** Ref al <video> donde se va a renderizar el preview. */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Callback que dispara con el código detectado (ya debounceado).
   *  El caller decide qué hacer (lookup, beep, agregar al carrito). */
  onScan: (codigo: string) => void
  /** Si false, el hook NO arranca el stream — útil para gatear por
   *  modal abierto/cerrado. Cambiar de true a false dispara cleanup
   *  inmediato. */
  active: boolean
}

interface UseScannerCamaraResult {
  status: ScannerStatus
  /** Mensaje humano si status === 'error'. */
  errorMsg?: string
}

const POLL_INTERVAL_MS = 100
const DEBOUNCE_MS = 1500

export function useScannerCamara({
  videoRef,
  onScan,
  active,
}: UseScannerCamaraOptions): UseScannerCamaraResult {
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | undefined>()

  // onScan se accede por ref para que el effect de start/stop NO
  // re-corra si el caller pasa una arrow function inline (lo más
  // común). Re-arrancar el stream por cada cambio de prop sería
  // horrible: cámara se apaga y prende, beep duplicado, etc.
  // React 19 prohíbe asignar refs en render → useEffect sin deps
  // sincroniza después del paint.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  })

  useEffect(() => {
    if (!active) {
      // Reset legítimo cuando cambia el flag — no es "syncing state
      // to props" (regla react-hooks/set-state-in-effect): es
      // transición discreta entre dos modos del hook.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('idle')
      return
    }

    // Capability check síncrono ANTES de pedir el permiso. Si el
    // browser no soporta nada, salimos limpio sin abrir el dialog.
    if (getDetectorStrategy() === 'none') {
      setStatus('unsupported')
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null
    let detector: Detector | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null
    const debounce = { lastCode: '', lastTime: 0 }

    async function arrancar() {
      setStatus('starting')
      setErrorMsg(undefined)

      // 1. Pedir cámara trasera. `ideal` (no `exact`) → si no existe
      //    facingMode environment (laptop), cae a la frontal sin fallar.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch (e) {
        if (cancelled) return
        // NotAllowedError = usuario clickeó "Bloquear". El estado
        // 'denied' es distinto de otros errores porque la UI ofrece
        // instrucciones específicas (no podemos re-pedir desde el
        // mismo origen sin que el user vaya a settings del browser).
        const name = (e as { name?: string })?.name
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatus('denied')
        } else {
          setStatus('error')
          setErrorMsg(
            name === 'NotFoundError'
              ? 'No se encontró cámara en este dispositivo.'
              : 'No pudimos abrir la cámara. Cerrá otras apps que la usen y volvé a intentar.'
          )
        }
        return
      }

      if (cancelled || !videoRef.current) {
        stream?.getTracks().forEach(t => t.stop())
        return
      }

      // 2. Conectar al video + arrancar reproducción. play() puede
      //    rechazar si el browser bloquea autoplay sin gesture, pero
      //    el modal se abre por click → permitido.
      videoRef.current.srcObject = stream
      try {
        await videoRef.current.play()
      } catch {
        /* algunos browsers (Safari mobile) resuelven play() después
           de un frame — no es bloqueante para nosotros */
      }

      // 3. Crear el detector (puede lazy-cargar ZXing acá).
      try {
        detector = await createDetector()
      } catch {
        detector = null
      }
      if (cancelled) {
        detector?.dispose()
        return
      }
      if (!detector) {
        setStatus('error')
        setErrorMsg('No pudimos inicializar el lector de códigos.')
        return
      }

      // 4. Loop de detección. setInterval (no rAF) para tener una
      //    cadencia predecible — rAF salta a 60fps que sobra y mata
      //    batería.
      setStatus('scanning')
      intervalId = setInterval(async () => {
        const video = videoRef.current
        if (!video || !detector) return

        const codigo = await detector.detect(video)
        if (!codigo) return

        // Debounce: misma string en <1.5s → ignorar. Distintas strings
        // pasan inmediatamente (caso "escaneo 3 productos seguidos").
        const now = Date.now()
        if (codigo === debounce.lastCode && now - debounce.lastTime < DEBOUNCE_MS) {
          return
        }
        debounce.lastCode = codigo
        debounce.lastTime = now

        onScanRef.current(codigo)
      }, POLL_INTERVAL_MS)
    }

    void arrancar()

    // Capturamos el ref ACTUAL del video al armar el cleanup. Para
    // cuando el cleanup corra, .current puede haber cambiado a otro
    // <video> o a null si el padre desmontó — queremos limpiar el
    // que esta corrida estuvo usando.
    const videoEl = videoRef.current

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      detector?.dispose()
      stream?.getTracks().forEach(t => t.stop())
      if (videoEl) {
        videoEl.srcObject = null
      }
    }
  }, [active, videoRef])

  return { status, errorMsg }
}
