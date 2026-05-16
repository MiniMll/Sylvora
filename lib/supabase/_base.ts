// Helpers compartidos por toda la capa de datos del browser.
// - getBrowserClient(): singleton del cliente Supabase para el browser.
// - getComercioId(): resuelve el comercio del usuario y cachea el resultado
//   por sesión, así no se hacen 2 queries (auth + perfiles) por cada
//   función de DB invocada.

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getBrowserClient(): SupabaseClient {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _client
}

let _comercioIdPromise: Promise<string> | null = null
let _comercioIdUsuario: string | null = null

export async function getComercioId(): Promise<string> {
  const supabase = getBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    _comercioIdPromise = null
    _comercioIdUsuario = null
    return ''
  }

  // Si el usuario cambió, invalidar caché
  if (_comercioIdUsuario !== user.id) {
    _comercioIdPromise = null
    _comercioIdUsuario = user.id
  }

  if (!_comercioIdPromise) {
    _comercioIdPromise = (async () => {
      try {
        const { data } = await supabase
          .from('perfiles')
          .select('comercio_id')
          .eq('id', user.id)
          .single()
        return (data?.comercio_id as string | undefined) || ''
      } catch {
        return ''
      }
    })()
  }
  return _comercioIdPromise
}

// Limpiar caché en logout/login.
export function invalidarCacheComercio() {
  _comercioIdPromise = null
  _comercioIdUsuario = null
  _perfilActualPromise = null
  _perfilActualUsuario = null
}

// ============================================================
// Perfil actual (id, comercio_id, nombre, rol). Cacheado por sesión
// igual que getComercioId. Resuelve auth.uid() → perfiles row.
// ============================================================

export interface PerfilActual {
  id: string
  comercio_id: string
  nombre: string | null
  rol: 'admin' | 'empleado'
}

let _perfilActualPromise: Promise<PerfilActual | null> | null = null
let _perfilActualUsuario: string | null = null

export async function getPerfilActual(): Promise<PerfilActual | null> {
  const supabase = getBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    _perfilActualPromise = null
    _perfilActualUsuario = null
    return null
  }

  if (_perfilActualUsuario !== user.id) {
    _perfilActualPromise = null
    _perfilActualUsuario = user.id
  }

  if (!_perfilActualPromise) {
    _perfilActualPromise = (async () => {
      try {
        const { data } = await supabase
          .from('perfiles')
          .select('id, comercio_id, nombre, rol')
          .eq('id', user.id)
          .single()
        if (!data) return null
        // Defensa contra rol con valor invalido (debería ser imposible
        // post-migration con CHECK + NOT NULL, pero por las dudas no
        // bloqueamos al user con un rol roto).
        const rolValido = data.rol === 'admin' || data.rol === 'empleado'
        if (!rolValido) {
          console.warn('[getPerfilActual] rol invalido en DB:', JSON.stringify(data.rol))
        }
        const rol = rolValido ? data.rol : 'admin'
        return {
          id: data.id,
          comercio_id: data.comercio_id,
          nombre: data.nombre,
          rol,
        }
      } catch {
        return null
      }
    })()
  }
  return _perfilActualPromise
}
