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

  const items = venta.items.map(i => ({
    venta_id: ventaData.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre_producto,
    precio_unitario: i.precio_unitario,
    cantidad: i.cantidad,
    subtotal: i.subtotal,
  }))
  await supabase.from('items_venta').insert(items)

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
 * Antes esto tenía un limit(50) hardcoded que rompía el dashboard cuando
 * el comercio superaba 50 ventas en el período.
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
