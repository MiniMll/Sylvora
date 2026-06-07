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
  /** Master numérico del stock vendible. Sincronizado con
   *  SUM(lotes.cantidad) cuando el producto tiene lotes; única
   *  fuente cuando no los tiene (modo legacy).
   *
   *  ⚠️ REGLA DE ORO: NUNCA UPDATE directo desde el cliente
   *  (`supabase.from('productos').update({ stock_actual: ... })`).
   *  Las mutaciones DEBEN pasar por las RPCs:
   *    - descontar_stock_validado(items)         → ventas
   *    - restituir_stock(producto, cant)         → anular venta
   *    - agregar_lote_atomico(...)               → alta de lote
   *    - eliminar_lote_atomico(lote_id)          → baja de lote
   *    - ajustar_stock_atomico(prod, cant, mot)  → ajuste manual
   *                                                (legacy only —
   *                                                rechaza productos
   *                                                con lotes)
   *  Las RPCs validan + asertan SUM(lotes) == stock_actual.
   *
   *  GUARDAS ACTIVAS (post sprint v2):
   *    1. UI: EditProductModal renderiza el campo como read-only
   *       cuando el producto tiene lotes (commit 4 del v2).
   *    2. Cliente: actualizarProducto en lib/supabase/productos.ts
   *       filtra cambios.stock_actual del UPDATE si el producto
   *       tiene lotes — defensa programática.
   *    3. Server: ajustar_stock_atomico (la RPC que invoca
   *       ajustarStock) RAISE 'usa_lotes' si el producto tiene
   *       lotes. Cierre final.
   *
   *  Diagnóstico:
   *    scripts/audit-lotes-drift.sql           → drift positivo
   *    scripts/audit-lotes-drift-negativo.sql  → drift negativo */
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
  /** Cantidad del lote. En DB es NUMERIC (soporta decimales para
   *  productos por peso — kg/L/m). Migrado de INTEGER en
   *  scripts/migration-lotes-cantidad-numeric.sql.
   *
   *  ⚠️ NUNCA UPDATE directo desde el cliente. Mutar vía RPCs
   *  agregar_lote_atomico / eliminar_lote_atomico, o
   *  indirectamente via descontar_stock_validado en ventas.
   *
   *  Post sprint v2 (scripts/migration-lotes-cleanup-cero.sql):
   *  los lotes que quedan en cantidad=0 tras una venta FIFO se
   *  borran automáticamente. Si listás lotes y no ves ninguno
   *  con cantidad=0, es esperado — no es un bug. */
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
  /** Usuario que ejecutó el cierre. Nullable para backward-compat con
   *  cierres anteriores a la migración. = auth.uid() al cerrar. */
  usuario_id?: string | null
  /** Monto retirado al cerrar (opcional). Solo informativo en V1 —
   *  no se arrastra como fondo del día siguiente. */
  retiro_efectivo?: number | null
  created_at: string
}

/** Comercio = "tenant" del sistema. Cada perfil/producto/venta pertenece
 *  a un comercio. Los campos opcionales se completan en /configuracion;
 *  algunos los seteás recién al registrarte (nombre, tipo), otros (email,
 *  telefono, direccion) los completás después porque condicionan cómo
 *  aparece tu marca en tickets y comunicaciones. */
export interface Comercio {
  id: string
  nombre: string
  tipo: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  /** Estado del plan. Constraint en DB: 'trial' | 'active' | 'expired'.
   *  El estado "expirado efectivo" se deriva en lib/trial.ts según
   *  plan + trial_ends_at (no es necesariamente igual a `plan`: un
   *  comercio en plan='trial' con trial_ends_at en el pasado está
   *  expirado aunque su columna `plan` diga 'trial'). */
  plan: 'trial' | 'active' | 'expired'
  /** Fin del período de prueba. Para `plan='trial'`, si now > trial_ends_at
   *  el comercio queda en soft-lock (ver lib/trial.ts). */
  trial_ends_at: string | null
  created_at: string
}

/** Roles soportados por el sistema. Ver docs/roles-permissions-spec.md.
 *  Tras la migration P2.1, `rol` en DB es NOT NULL con CHECK ('admin'|'empleado'). */
export type Rol = 'admin' | 'empleado'

export interface Perfil {
  id: string
  comercio_id: string
  nombre: string | null
  rol: Rol
}
