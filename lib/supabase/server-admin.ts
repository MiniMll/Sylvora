// Cliente Supabase con SERVICE ROLE para uso server-side.
//
// ⚠️  PODER TOTAL: este cliente bypasea RLS. Solo se usa en route
//     handlers / server components donde validamos manualmente el
//     permiso del caller ANTES de cualquier operación.
//
// Si `SUPABASE_SERVICE_ROLE_KEY` no está seteada, getServiceClient()
// tira un error explícito (mejor fallar ruidoso que silent-broken).
//
// El módulo es server-only por convención — Next.js no incluye en el
// bundle del cliente porque la env var no tiene prefijo NEXT_PUBLIC_,
// pero igual evitamos importarlo desde components 'use client'.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _serviceClient: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('[server-admin] NEXT_PUBLIC_SUPABASE_URL no está definida')
  }
  if (!serviceKey) {
    throw new Error(
      '[server-admin] SUPABASE_SERVICE_ROLE_KEY no está definida. ' +
      'Obtené el valor en Supabase Dashboard → Settings → API → service_role ' +
      'y agregalo a .env.local (sin prefijo NEXT_PUBLIC_).'
    )
  }

  _serviceClient = createClient(url, serviceKey, {
    auth: {
      // No queremos que este cliente intente persistir sesiones — es
      // un cliente "operacional", no representa a un usuario.
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return _serviceClient
}
