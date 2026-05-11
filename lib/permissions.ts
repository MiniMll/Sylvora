// Single source of truth para chequeos de permisos.
//
// Hoy: cualquier usuario autenticado puede anular ventas (no hay
// sistema de roles formal). Mañana, cuando agreguemos roles
// (cajero/encargado/dueño), sólo hay que tocar acá — la UI ya
// consulta esta función.

import type { Venta } from '@/types/database'

export interface PermissionCheck {
  allowed: boolean
  /** Si allowed=false, motivo user-friendly para mostrar en UI. */
  reason?: string
}

/**
 * Determina si la venta dada puede anularse.
 *
 * Reglas actuales:
 *  - No se puede anular una venta ya anulada (doble anulación).
 *  - No se puede anular sin items (caso teórico, defensa).
 *
 * Reglas futuras (preparadas):
 *  - Si pasamos un `user`, validar rol cuando exista.
 *  - Posiblemente: anular solo ventas del mismo día / mismo cajero / etc.
 */
export function puedeAnularVenta(
  venta: Venta,
  _user?: { id: string; rol?: string },
): PermissionCheck {
  if (venta.estado === 'anulada') {
    return { allowed: false, reason: 'Esta venta ya está anulada' }
  }
  if (!venta.items_venta || venta.items_venta.length === 0) {
    return { allowed: false, reason: 'No se puede anular una venta sin items' }
  }
  // Hook para chequeo de rol futuro:
  //   if (_user?.rol && !['encargado', 'dueño'].includes(_user.rol)) {
  //     return { allowed: false, reason: 'Permiso insuficiente' }
  //   }
  return { allowed: true }
}
