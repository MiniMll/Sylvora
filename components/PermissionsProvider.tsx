'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getBrowserClient, getPerfilActual } from '@/lib/supabase/_base'
import { rolPuede, type Permission } from '@/lib/permissions'
import type { Rol } from '@/types/database'

// Singleton de permisos para toda la sesión. Hace una query a perfiles
// al montar la app (vía getPerfilActual cacheado en _base.ts) Y
// re-fetcha cuando Supabase notifica cambio de auth (SIGNED_IN /
// SIGNED_OUT). Esto resuelve el caso post-signup desde la landing:
// el provider monta cuando el visitante es anónimo (rol=null), después
// el flow de registro hace signInWithPassword pero router.push no
// re-monta el root layout — sin la suscripción a onAuthStateChange el
// rol quedaba stale hasta un full reload.
//
// La caché interna de getPerfilActual está keyada por user.id y se
// auto-invalida cuando cambia el user, así que no necesitamos limpiarla
// manualmente acá: el getPerfilActual() del refetch detecta el user
// nuevo y hace la nueva query.
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
    const supabase = getBrowserClient()

    const cargar = async () => {
      const p = await getPerfilActual()
      if (cancelled) return
      setRol(p?.rol ?? null)
      setNombre(p?.nombre ?? null)
      setLoading(false)
    }

    // Carga inicial — el mount del provider corre con el estado de
    // auth que haya en ese momento (anónimo si venimos de la landing,
    // logueado si vienen de un reload directo a /dashboard).
    cargar()

    // Reactivá ante cambios de auth. Cubre 3 casos:
    //  - SIGNED_IN: signup desde /registro o login desde /login → el
    //    rol se carga sin necesidad de full reload.
    //  - SIGNED_OUT: logout → cargar() ve user=null y resetea el rol
    //    a null sin dejar el estado anterior stale.
    //  - INITIAL_SESSION lo IGNORAMOS porque ya hicimos el cargar()
    //    manual arriba (cualquier supabase-js dispara INITIAL_SESSION
    //    al subscribir aunque no haya sesión).
    //  - TOKEN_REFRESHED / USER_UPDATED tampoco aplican (mismo user).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        cargar()
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
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
