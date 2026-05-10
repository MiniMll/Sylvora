'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { startScanner, stopScanner, type OnScan } from '@/lib/pos/barcodeScanner'

/**
 * Hook React fino sobre el módulo barcodeScanner.
 *
 * - El callback `onScan` se guarda en una ref que se actualiza en cada
 *   render → el módulo siempre invoca el closure más fresco (con
 *   productos/onSelect actuales).
 * - `videoRef` lo provee el hook; el consumer lo asigna al <video>.
 * - `open()` y `close()` son estables (useCallback con [] deps).
 * - Cleanup en unmount llama stopScanner — fire-and-forget porque
 *   stopScanner es idempotente.
 */
export function useBarcodeScanner(onScan: OnScan) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // Ref a la última versión del callback. Esto desacopla el ciclo de
  // vida del scanner (módulo) del ciclo de render (componente):
  // cambios en productos/onSelect se reflejan sin reabrir el scanner.
  const onScanRef = useRef<OnScan>(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = useCallback(async () => {
    if (!videoRef.current) return
    setError(null)
    try {
      await startScanner({
        videoEl: videoRef.current,
        onScan: (codigo) => onScanRef.current(codigo),
      })
      setActive(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo acceder a la cámara'
      setError(msg)
      setActive(false)
      throw e
    }
  }, [])

  const close = useCallback(async () => {
    await stopScanner()
    setActive(false)
    setError(null)
  }, [])

  // Cleanup al desmontar el componente (ej. usuario navega a otra
  // ruta con la cámara abierta). stopScanner es idempotente.
  useEffect(() => {
    return () => { stopScanner().catch(() => {}) }
  }, [])

  return { videoRef, active, error, open, close }
}
