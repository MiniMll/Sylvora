'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getPerfilActual } from '@/lib/supabase/_base'
import { rolPuede, type Permission } from '@/lib/permissions'
import type { Rol } from '@/types/database'

// Singleton de permisos para toda la sesión. Una sola query a perfiles
// al montar la app (vía getPerfilActual cacheado en _base.ts). Después
// cada componente consume con usePermissions() sin re-fetch.
//
// Acordate: esto es solo para gating UI. La seguridad real vive en RLS.

interface PermissionsContextValue {
  rol: Rol | null
  nombre: string | null
  loading: boolean
  /** ¿El usuario actual puede ejecutar el permiso indicado? */
  has: (perm: Permission) => boolean
  /** Atajo común para rol === 'admin'. */
  isAdmin: boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
  rol: null,
  nombre: null,
  loading: true,
  has: () => false,
  isAdmin: false,
})

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [rol, setRol] = useState<Rol | null>(null)
  const [nombre, setNombre] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getPerfilActual().then(p => {
      if (cancelled) return
      // DIAG: trazar qué llega al provider y qué se setea en context.
      console.log('[PermissionsProvider] perfil recibido:', p)
      console.log('[PermissionsProvider] rol que se va a setear:', p?.rol ?? null)
      setRol(p?.rol ?? null)
      setNombre(p?.nombre ?? null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const value: PermissionsContextValue = {
    rol,
    nombre,
    loading,
    has: (perm) => rolPuede(rol, perm),
    isAdmin: rol === 'admin',
  }

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  )
}

/** Hook principal para gatear UI según permisos del usuario actual. */
export function usePermissions() {
  return useContext(PermissionsContext)
}
