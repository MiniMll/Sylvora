import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getServiceClient } from '@/lib/supabase/server-admin'
import { esRolValido, rolPuede } from '@/lib/permissions'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Rol } from '@/types/database'

export const MP_OAUTH_STATE_COOKIE = 'sylvora_mp_oauth_state'
export const MP_OAUTH_STATE_TTL_SECONDS = 10 * 60

export class MPRouteAuthError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'MPRouteAuthError'
    this.status = status
  }
}

export interface MPAdminContext {
  caller: User
  perfil: {
    id: string
    comercioId: string
    rol: Rol
  }
  admin: SupabaseClient
}

export async function requireMPGestionar(): Promise<MPAdminContext> {
  const cookieStore = await cookies()
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* no-op */ },
      },
    },
  )

  const { data: { user: caller } } = await userClient.auth.getUser()
  if (!caller) {
    throw new MPRouteAuthError(401, 'No autenticado')
  }

  const admin = getServiceClient()
  const { data: perfil, error } = await admin
    .from('perfiles')
    .select('id, comercio_id, rol')
    .eq('id', caller.id)
    .single()

  if (error || !perfil) {
    throw new MPRouteAuthError(403, 'Perfil no encontrado')
  }
  if (!perfil.comercio_id) {
    throw new MPRouteAuthError(403, 'Sin comercio asignado')
  }
  if (!esRolValido(perfil.rol) || !rolPuede(perfil.rol, 'mp.gestionar')) {
    throw new MPRouteAuthError(403, 'Solo administradores pueden gestionar Mercado Pago')
  }

  return {
    caller,
    perfil: {
      id: perfil.id,
      comercioId: perfil.comercio_id,
      rol: perfil.rol,
    },
    admin,
  }
}
