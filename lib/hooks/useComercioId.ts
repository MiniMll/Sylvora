'use client'
import { useEffect, useState } from 'react'
import { getComercioId } from '@/lib/supabase/_base'

/**
 * Hook que expone el comercio_id del usuario actual.
 * Comparte caché con la capa de datos: si ya se resolvió por una query
 * previa de productos/ventas/etc., el hook devuelve el valor sin más
 * round-trips.
 */
export function useComercioId() {
  const [comercioId, setComercioId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false
    getComercioId().then(id => {
      if (cancelado) return
      setComercioId(id || null)
      setCargando(false)
    })
    return () => { cancelado = true }
  }, [])

  return { comercioId, cargando }
}
