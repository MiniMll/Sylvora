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
}
