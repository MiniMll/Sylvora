'use client'
import { useEffect, useState } from 'react'
import { getComercio } from '@/lib/supabase/_base'
import {
  accesoCompleto as deriveAccesoCompleto,
  diasRestantesTrial,
  estadoTrial,
  type EstadoTrial,
} from '@/lib/trial'
import type { Comercio } from '@/types/database'

// Hook que expone el estado del trial del comercio actual.
//
// Internamente usa getComercio() (cacheado por sesión en _base.ts),
// así que múltiples consumidores en distintas pantallas NO disparan
// queries extra — la caché única vale.
//
// Mientras `loading` es true, `accesoCompleto` es true por default
// (optimistic) para no parpadear el TrialBlocked en el primer render
// de un comercio activo. Cuando llega el comercio real, se reevalúa.
//
// La derivación vive en lib/trial.ts (single source of truth).
// Este hook es solo el adaptador para componentes React.

interface UseTrialResult {
  comercio: Comercio | null
  estado: EstadoTrial
  accesoCompleto: boolean
  expirado: boolean
  diasRestantes: number | null
  loading: boolean
}

export function useTrial(): UseTrialResult {
  const [comercio, setComercio] = useState<Comercio | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getComercio().then(c => {
      if (cancelled) return
      setComercio(c)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const estado = estadoTrial(comercio)
  // Mientras carga, asumimos acceso completo para no flashear el
  // overlay en cada navegación a /pos o /exportar. El overlay solo
  // se muestra cuando confirmamos el estado expirado.
  const accesoCompleto = loading ? true : deriveAccesoCompleto(comercio)
  const expirado = !loading && estado === 'expired'
  const diasRestantes = diasRestantesTrial(comercio)

  return { comercio, estado, accesoCompleto, expirado, diasRestantes, loading }
}
