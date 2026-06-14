// Sistema de permisos del producto. Ver docs/roles-permissions-spec.md.
//
// Modelo RBAC simple: cada rol tiene un set fijo de permisos definido
// en PERMISSIONS_BY_ROL. No hay capabilities per-usuario ni overrides.
// Cambiar permisos de un rol = editar la constante y hacer deploy.
//
// La fuente de verdad de SEGURIDAD es RLS — esto es para gatear UI.
// Ambas capas deben mantenerse sincronizadas. Cualquier cambio acá
// que abra un permiso al encargado debe reflejarse en una RLS policy
// de scripts/migration-roles-v1.sql (o uno posterior).

import type { Rol, Venta } from '@/types/database'

export type Permission =
  // Caja
  | 'caja.cerrar'                // admin + encargado + cajero
  | 'caja.reabrir'               // admin only — borra el cierre del día
  | 'caja.egreso'                // admin + encargado + cajero
  // Productos
  | 'producto.crear'             // admin + encargado
  | 'producto.editar'            // admin + encargado — datos básicos, precio individual, stock manual
  | 'producto.eliminar'          // admin only — destructivo (rompe FK items_venta)
  | 'lote.gestionar'             // admin + encargado — agregar/borrar/editar lotes
  // Precios
  | 'precio.actualizar_masivo'   // admin + encargado — /precios page
  // Ventas
  | 'venta.crear'                // admin + encargado + cajero — POS
  | 'venta.anular'               // admin + encargado
  // Reportes
  | 'reporte.ver_completo'       // admin + encargado — /reportes
  // Gastos
  | 'gasto.ver'                  // admin + encargado
  | 'gasto.crear'                // admin + encargado
  | 'gasto.editar'               // admin + encargado
  | 'gasto.eliminar'             // admin + encargado
  // Usuarios
  | 'usuario.gestionar'          // admin only — listar/cambiar rol/eliminar otros perfiles
  // Integraciones
  | 'mp.gestionar'               // admin only - conectar/desconectar Mercado Pago

const PERMISSIONS_BY_ROL: Record<Rol, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    'caja.cerrar', 'caja.reabrir', 'caja.egreso',
    'producto.crear', 'producto.editar', 'producto.eliminar',
    'lote.gestionar',
    'precio.actualizar_masivo',
    'venta.crear', 'venta.anular',
    'reporte.ver_completo',
    'gasto.ver', 'gasto.crear', 'gasto.editar', 'gasto.eliminar',
    'usuario.gestionar',
    'mp.gestionar',
  ]),
  encargado: new Set<Permission>([
    'caja.cerrar', 'caja.egreso',
    'producto.crear', 'producto.editar',  // NO eliminar
    'lote.gestionar',
    'precio.actualizar_masivo',
    'venta.crear', 'venta.anular',
    'reporte.ver_completo',
    'gasto.ver', 'gasto.crear', 'gasto.editar', 'gasto.eliminar',
    // NO: caja.reabrir, producto.eliminar, usuario.gestionar
  ]),
  cajero: new Set<Permission>([
    'venta.crear',
    'caja.egreso',
    'caja.cerrar',   // cajero cierra pero no reabre
    // NO: ver reportes, gestionar productos/lotes, anular ventas,
    //     precios masivos, gestionar usuarios.
  ]),
}

/** ¿El rol indicado tiene el permiso pedido?
 *  Rol null/inválido siempre devuelve false. */
export function rolPuede(rol: Rol | string | null | undefined, perm: Permission): boolean {
  if (rol !== 'admin' && rol !== 'encargado' && rol !== 'cajero') return false
  return PERMISSIONS_BY_ROL[rol].has(perm)
}

/** Type guard para chequear si un string es un rol válido del sistema. */
export function esRolValido(rol: string | null | undefined): rol is Rol {
  return rol === 'admin' || rol === 'encargado' || rol === 'cajero'
}

/** Etiqueta legible para mostrar en UI (capitalizada, en español). */
export function labelRol(rol: Rol): string {
  if (rol === 'admin') return 'Administrador'
  if (rol === 'encargado') return 'Encargado'
  return 'Cajero'
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
 * el chequeo de rol (admin o encargado). El rol es opcional para
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
    return { allowed: false, reason: 'Solo administradores y encargados pueden anular ventas' }
  }
  return { allowed: true }
}
