// Sistema de permisos del producto. Ver docs/roles-permissions-spec.md.
//
// Modelo RBAC simple: cada rol tiene un set fijo de permisos definido
// en PERMISSIONS_BY_ROL. No hay capabilities per-usuario ni overrides.
// Cambiar permisos de un rol = editar la constante y hacer deploy.
//
// La fuente de verdad de seguridad es RLS — esto es para gatear UI.

import type { Rol, Venta } from '@/types/database'

export type Permission =
  // Caja
  | 'caja.cerrar'                // ambos roles
  | 'caja.reabrir'               // admin only — borra el cierre del día
  | 'caja.egreso'                // ambos — registrar egreso (con caja abierta)
  // Productos
  | 'producto.crear'             // admin
  | 'producto.editar'            // admin — datos básicos, precio individual, stock manual
  | 'producto.eliminar'          // admin
  | 'lote.gestionar'             // admin — agregar/borrar/editar lotes
  // Precios
  | 'precio.actualizar_masivo'   // admin — /precios page
  // Ventas
  | 'venta.crear'                // ambos — POS
  | 'venta.anular'               // admin
  // Usuarios
  | 'usuario.gestionar'          // admin — listar/cambiar rol/eliminar otros perfiles

const PERMISSIONS_BY_ROL: Record<Rol, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    'caja.cerrar', 'caja.reabrir', 'caja.egreso',
    'producto.crear', 'producto.editar', 'producto.eliminar',
    'lote.gestionar',
    'precio.actualizar_masivo',
    'venta.crear', 'venta.anular',
    'usuario.gestionar',
  ]),
  empleado: new Set<Permission>([
    'venta.crear',
    'caja.egreso',
    'caja.cerrar',   // empleado cierra pero no reabre
  ]),
}

// DIAG: log de cada par (rol, perm) la primera vez que se chequea.
// rolPuede se llama en cada render de la sidebar y muchos componentes,
// así que sin el dedup el log sería ilegible.
const _diagSeen = new Set<string>()

/** ¿El rol indicado tiene el permiso pedido?
 *  Rol null/inválido siempre devuelve false. */
export function rolPuede(rol: Rol | string | null | undefined, perm: Permission): boolean {
  if (rol !== 'admin' && rol !== 'empleado') {
    const key = `null:${perm}`
    if (!_diagSeen.has(key)) {
      _diagSeen.add(key)
      console.log('[rolPuede]', { rol: rol === undefined ? 'undefined' : rol, perm, resultado: false, motivo: 'rol invalido o null' })
    }
    return false
  }
  const resultado = PERMISSIONS_BY_ROL[rol].has(perm)
  const key = `${rol}:${perm}`
  if (!_diagSeen.has(key)) {
    _diagSeen.add(key)
    console.log('[rolPuede]', { rol, perm, resultado })
  }
  return resultado
}

/** Type guard para chequear si un string es un rol válido del sistema. */
export function esRolValido(rol: string | null | undefined): rol is Rol {
  return rol === 'admin' || rol === 'empleado'
}

/** Etiqueta legible para mostrar en UI (capitalizada, en español). */
export function labelRol(rol: Rol): string {
  return rol === 'admin' ? 'Administrador' : 'Empleado'
}

// ============================================================
// Validadores de dominio — combinan reglas de negocio con rol.
// ============================================================

export interface PermissionCheck {
  allowed: boolean
  /** Si allowed=false, motivo user-friendly para mostrar en UI. */
  reason?: string
}

/**
 * Determina si la venta dada puede anularse.
 *
 * Combina reglas de negocio (no doble anulación, debe tener items) con
 * el chequeo de rol (admin requerido). El rol es opcional para
 * compat con call sites legacy — si no se pasa, se omite el chequeo
 * de rol (la RLS igual va a bloquear el UPDATE si el caller no tiene
 * permiso).
 */
export function puedeAnularVenta(
  venta: Venta,
  user?: { rol?: Rol | string | null },
): PermissionCheck {
  if (venta.estado === 'anulada') {
    return { allowed: false, reason: 'Esta venta ya está anulada' }
  }
  if (!venta.items_venta || venta.items_venta.length === 0) {
    return { allowed: false, reason: 'No se puede anular una venta sin items' }
  }
  if (user && !rolPuede(user.rol, 'venta.anular')) {
    return { allowed: false, reason: 'Solo administradores pueden anular ventas' }
  }
  return { allowed: true }
}
