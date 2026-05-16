// Data layer de la página /usuarios (P2.1). Operaciones admin-only
// (las RLS lo enforzan; este código solo formatea/valida).

import { getBrowserClient, getComercioId } from './_base'
import type { Perfil, Rol } from '@/types/database'

/** Lista todos los perfiles del comercio actual, ordenados por nombre. */
export async function listUsuariosComercio(): Promise<Perfil[]> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []

  const { data, error } = await supabase
    .from('perfiles')
    .select('id, comercio_id, nombre, rol')
    .eq('comercio_id', comercioId)
    .order('nombre', { ascending: true })

  if (error) {
    console.error('[listUsuariosComercio]', error.code, '-', error.message)
    return []
  }
  return (data ?? []) as Perfil[]
}

/** Resultado discriminado de cambiarRolUsuario. La UI puede distinguir
 *  "ok" de los casos de error puntuales. */
export type CambiarRolResult =
  | { ok: true }
  | { ok: false; reason: 'last_admin' | 'rls' | 'error'; message?: string }

/**
 * Cambia el rol de un perfil. Invariante app-level: no permitir bajar
 * a empleado al último admin del comercio (decisión 6 del spec).
 *
 * La RLS bloquea el UPDATE si el caller no es admin — esto es defensa
 * en profundidad, no la fuente de seguridad.
 */
export async function cambiarRolUsuario(perfilId: string, nuevoRol: Rol): Promise<CambiarRolResult> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return { ok: false, reason: 'error', message: 'Comercio no resuelto' }

  // Guard: si vamos a degradar a empleado, asegurar que queda al menos
  // otro admin en el comercio. Si el perfilId YA es empleado, este
  // check no aplica (no estamos degradando admin).
  if (nuevoRol === 'empleado') {
    const { data: admins, error } = await supabase
      .from('perfiles')
      .select('id')
      .eq('comercio_id', comercioId)
      .eq('rol', 'admin')
    if (error) return { ok: false, reason: 'error', message: error.message }

    const adminIds = (admins ?? []).map(a => a.id)
    const targetEraAdmin = adminIds.includes(perfilId)
    const otrosAdmins = adminIds.filter(id => id !== perfilId).length
    if (targetEraAdmin && otrosAdmins === 0) {
      return { ok: false, reason: 'last_admin' }
    }
  }

  const { error } = await supabase
    .from('perfiles')
    .update({ rol: nuevoRol })
    .eq('id', perfilId)
    .eq('comercio_id', comercioId)

  if (error) {
    // 42501 / RLS violation → el caller no es admin (no debería pasar
    // por el gating UI, pero por las dudas distinguimos).
    if (error.code === '42501') return { ok: false, reason: 'rls' }
    return { ok: false, reason: 'error', message: error.message }
  }
  return { ok: true }
}
