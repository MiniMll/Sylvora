import { getBrowserClient, getComercioId } from './_base'
import type { Venta } from '@/types/database'

interface ItemVentaInput {
  producto_id: string
  nombre_producto: string
  precio_unitario: number
  cantidad: number
  subtotal: number
  peso_kg?: number
}

interface VentaInput {
  subtotal: number
  descuento_porcentaje: number
  descuento_monto: number
  recargo_porcentaje: number
  recargo_monto: number
  total: number
  metodo_pago: string
  items: ItemVentaInput[]
}

export async function guardarVenta(venta: VentaInput): Promise<Venta | null> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return null

  const { data: ventaData, error: ventaError } = await supabase
    .from('ventas')
    .insert({
      comercio_id: comercioId,
      subtotal: venta.subtotal,
      descuento_porcentaje: venta.descuento_porcentaje,
      descuento_monto: venta.descuento_monto,
      recargo_porcentaje: venta.recargo_porcentaje,
      recargo_monto: venta.recargo_monto,
      total: venta.total,
      metodo_pago: venta.metodo_pago,
      estado: 'completada',
    })
    .select()
    .single()

  if (ventaError || !ventaData) {
    console.error(ventaError)
    return null
  }

  // Persistimos peso_kg para soportar anulación 100% exacta de ventas
  // con productos por peso. Si la columna no existe todavía (schema sin
  // migración aplicada), reintentamos sin esa key — backward-compat.
  const itemsConPeso = venta.items.map(i => ({
    venta_id: ventaData.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre_producto,
    precio_unitario: i.precio_unitario,
    cantidad: i.cantidad,
    subtotal: i.subtotal,
    peso_kg: i.peso_kg ?? null,
  }))

  const { error: itemsError } = await supabase.from('items_venta').insert(itemsConPeso)
  if (itemsError && /peso_kg/i.test(itemsError.message)) {
    // Fallback legacy: schema sin la columna. Re-insertamos sin peso_kg.
    const itemsSinPeso = itemsConPeso.map(({ peso_kg: _, ...rest }) => rest)
    await supabase.from('items_venta').insert(itemsSinPeso)
  }

  // Descontar stock atómicamente vía RPC.
  await Promise.all(venta.items.map(item => {
    const aDescontar = (item.peso_kg !== undefined && item.peso_kg !== null)
      ? Number(item.peso_kg)
      : Number(item.cantidad)
    return supabase.rpc('descontar_stock', {
      p_producto_id: item.producto_id,
      p_cantidad: aDescontar,
    })
  }))

  return ventaData as Venta
}

interface GetVentasOpts {
  /** Fecha mínima inclusiva. Por defecto: sin filtro. */
  desde?: Date
  /** Límite opcional. Sin valor: trae todas las ventas del comercio. */
  limit?: number
}

/**
 * Devuelve ventas del comercio con sus items_venta.
 * Sin args trae todas las ventas (necesario para analytics correctos).
 */
export async function getVentas(opts: GetVentasOpts = {}): Promise<Venta[]> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []

  let query = supabase
    .from('ventas')
    .select('*, items_venta(*)')
    .eq('comercio_id', comercioId)
    .order('created_at', { ascending: false })

  if (opts.desde) query = query.gte('created_at', opts.desde.toISOString())
  if (opts.limit) query = query.limit(opts.limit)

  const { data, error } = await query
  if (error) {
    console.error(error)
    return []
  }
  return (data ?? []) as Venta[]
}

interface AnularVentaResult {
  ok: boolean
  /** Mensaje user-friendly si falló. */
  error?: string
}

/**
 * Marca una venta como anulada y restituye el stock de sus items.
 *
 * Guardas implementadas:
 *  - Sin doble anulación: el UPDATE filtra por `estado = 'completada'`
 *    (optimistic concurrency). Si dos sesiones intentan anular la misma
 *    venta al mismo tiempo, sólo una efectivamente cambia la row; la
 *    segunda recibe `data: null` y retorna error claro.
 *  - Stock restituido vía RPC atómica `restituir_stock`.
 *  - Para items con peso_kg (productos por peso) restituye el peso
 *    real. Para items legacy sin peso_kg (anteriores a la migración),
 *    restituye por `cantidad` — sub-óptimo en ese caso, documentado.
 *
 * Requiere correr ambas migraciones SQL:
 *   - supabase-rpc-restituir-stock.sql
 *   - supabase-migracion-items-venta-peso.sql (idealmente)
 */
export async function anularVenta(venta: Venta): Promise<AnularVentaResult> {
  if (venta.estado === 'anulada') {
    return { ok: false, error: 'Esta venta ya está anulada' }
  }

  const supabase = getBrowserClient()

  // Marcar anulada con guarda atómica de doble click / doble sesión.
  const { data, error } = await supabase
    .from('ventas')
    .update({ estado: 'anulada' })
    .eq('id', venta.id)
    .eq('estado', 'completada')
    .select()
    .maybeSingle()

  if (error) {
    console.error(error)
    return { ok: false, error: 'No se pudo anular la venta' }
  }
  if (!data) {
    // El UPDATE no afectó filas — venta ya estaba anulada en DB
    // (otro cajero la anuló desde otra pestaña).
    return { ok: false, error: 'Esta venta ya está anulada' }
  }

  // Restituir stock. Fallback legacy: si peso_kg no está, usar cantidad.
  if (venta.items_venta?.length) {
    await Promise.all(venta.items_venta.map(item => {
      const aRestituir = (item.peso_kg !== undefined && item.peso_kg !== null)
        ? Number(item.peso_kg)
        : Number(item.cantidad)
      return supabase.rpc('restituir_stock', {
        p_producto_id: item.producto_id,
        p_cantidad: aRestituir,
      })
    }))
  }

  return { ok: true }
}
