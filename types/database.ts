// Row types de las tablas Supabase usadas por la app.
// Basados en supabase-schema.sql + columnas vistas en uso real.
// Para regenerar automáticamente desde el proyecto Supabase:
//   npx supabase gen types typescript --project-id <id> > types/database.ts
// Mientras se mantenga manual, hay que sincronizar tras cambios de schema.

export type UnidadVenta = 'unidad' | 'kg' | 'litro' | 'metro'
export type EstadoVenta = 'completada' | 'anulada' | 'pendiente'
export type TipoMovimientoCaja = 'ingreso' | 'egreso'

export interface Producto {
  id: string
  comercio_id: string
  nombre: string
  codigo_barras: string | null
  sku: string | null
  categoria: string | null
  imagen_url: string | null
  precio_costo: number
  precio_venta: number
  precio_mayorista: number | null
  precio_por_kg: number | null
  stock_actual: number
  stock_minimo: number
  stock_ideal: number
  unidad_venta: UnidadVenta
  ubicacion: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Lote {
  id: string
  producto_id: string
  numero_lote: string
  cantidad: number
  fecha_vencimiento: string | null
  fecha_ingreso: string
}

export interface ItemVenta {
  id: string
  venta_id: string
  producto_id: string | null
  nombre_producto: string
  precio_unitario: number
  cantidad: number
  subtotal: number
  peso_kg?: number | null
}

export interface Venta {
  id: string
  comercio_id: string
  numero_ticket: number
  subtotal: number
  descuento_porcentaje: number
  descuento_monto: number
  recargo_porcentaje: number
  recargo_monto: number
  total: number
  metodo_pago: string
  estado: EstadoVenta
  created_at: string
  items_venta?: ItemVenta[]
}

export interface MovimientoCaja {
  id: string
  comercio_id: string
  tipo: TipoMovimientoCaja
  monto: number
  descripcion: string | null
  metodo_pago: string | null
  created_at: string
}

export interface CierreCaja {
  id: string
  comercio_id: string
  fecha: string
  total_ventas: number
  total_egresos: number
  saldo_neto: number
  cantidad_ventas: number
  efectivo: number
  transferencia: number
  debito: number
  credito?: number
  mercadopago: number
  /** Efectivo contado físicamente al cerrar (opcional — el cajero
   *  puede cerrar sin contar y diferencia_efectivo queda null). */
  efectivo_contado?: number | null
  /** efectivo_contado - efectivo_esperado.
   *  - 0  → caja cuadra
   *  - >0 → sobrante
   *  - <0 → faltante
   *  Persistida para conservar el valor histórico aunque cambien
   *  ventas o egresos posteriormente. */
  diferencia_efectivo?: number | null
  created_at: string
}

export interface Perfil {
  id: string
  comercio_id: string
  nombre: string | null
  rol: string | null
}
