'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { invalidarCacheComercio } from '@/lib/supabase/_base'

/**
 * Escucha cambios de auth de Supabase. Si la sesión expira por
 * cualquier motivo (token vencido, refresh fallido, sign-out
 * server-side, usuario eliminado), redirige a /login con un toast
 * claro en lugar de dejar al cajero mirando una pantalla muda
 * donde todas las queries devuelven [] silenciosamente.
 *
 * Se monta en Sidebar (envuelve toda la app autenticada). En
 * /login y /registro el sidebar no aparece, así que el listener
 * tampoco — y eso está bien (no querés un loop de redirects).
 */
export function useAuthListener() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        invalidarCacheComercio()
        toast.error('Tu sesión expiró. Iniciá sesión otra vez.', {
          id: 'session-expired',
          duration: 5000,
        })
        router.push('/login')
      }
    })
    return () => subscription.unsubscribe()
  }, [router])
}
