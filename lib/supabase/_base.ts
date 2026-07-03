// Helpers compartidos por toda la capa de datos del browser.
// - getBrowserClient(): singleton del cliente Supabase para el browser.
// - getComercioId(): resuelve el comercio del usuario y cachea el resultado
//   por sesión, así no se hacen 2 queries (auth + perfiles) por cada
//   función de DB invocada.

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Comercio } from '@/types/database'

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
  _comercioPromise = null
  _comercioUsuario = null
}

// ============================================================
// Perfil actual (id, comercio_id, nombre, rol). Cacheado por sesión
// igual que getComercioId. Resuelve auth.uid() → perfiles row.
// ============================================================

export interface PerfilActual {
  id: string
  comercio_id: string
  nombre: string | null
  rol: 'admin' | 'encargado' | 'cajero'
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
        // bloqueamos al user con un rol roto). Si encontramos un
        // rol legacy 'empleado' (debería haber sido migrado), lo
        // mapeamos a 'cajero' como semantic equivalent.
        const rolValido =
          data.rol === 'admin' ||
          data.rol === 'encargado' ||
          data.rol === 'cajero'
        if (!rolValido) {
          if (data.rol === 'empleado') {
            console.warn('[getPerfilActual] rol legacy "empleado" — mapeando a "cajero". Re-aplicar migration-roles-v1.sql.')
          } else {
            console.warn('[getPerfilActual] rol invalido en DB:', JSON.stringify(data.rol))
          }
        }
        const rol: 'admin' | 'encargado' | 'cajero' = rolValido
          ? data.rol
          : data.rol === 'empleado'
            ? 'cajero'
            : 'admin'
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

// ============================================================
// Comercio actual completo (nombre, tipo, dirección, etc.).
// Cacheado por sesión igual que getPerfilActual. Lo usa el ticket
// para renderizar el header del comercio. No re-fetcha cuando el
// usuario edita su comercio en /configuracion — ese flujo tiene
// que llamar a invalidarCacheComercio() para forzar reload.
// ============================================================

let _comercioPromise: Promise<Comercio | null> | null = null
let _comercioUsuario: string | null = null

export async function getComercio(): Promise<Comercio | null> {
  const supabase = getBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    _comercioPromise = null
    _comercioUsuario = null
    return null
  }

  if (_comercioUsuario !== user.id) {
    _comercioPromise = null
    _comercioUsuario = user.id
  }

  if (!_comercioPromise) {
    _comercioPromise = (async () => {
      try {
        // Resolvemos primero el comercio_id del perfil para no depender
        // del orden de carga: getComercio se puede llamar antes que
        // getPerfilActual sin problema.
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('comercio_id')
          .eq('id', user.id)
          .single()
        if (!perfil?.comercio_id) return null

        const { data: comercio } = await supabase
          .from('comercios')
          .select('id, nombre, tipo, telefono, email, direccion, plan, trial_ends_at, settings, created_at')
          .eq('id', perfil.comercio_id)
          .single()
        return (comercio as Comercio | null) ?? null
      } catch {
        return null
      }
    })()
  }
  return _comercioPromise
}
