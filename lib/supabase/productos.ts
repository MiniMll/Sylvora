import { createBrowserClient } from '@supabase/ssr'


function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

async function getComercioId(): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ''
  const { data } = await supabase
    .from('perfiles')
    .select('comercio_id')
    .eq('id', user.id)
    .single()
  return data?.comercio_id || ''
}

export async function getProductos() {
  const supabase = createClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('comercio_id', comercioId)
    .eq('activo', true)
    .order('nombre')
  if (error) { console.error(error); return [] }
  return data
}

export async function guardarProducto(producto: {
  nombre: string
  codigo_barras?: string
  sku?: string
  precio_costo: number
  precio_venta: number
  precio_mayorista?: number
  precio_por_kg?: number
  stock_actual: number
  stock_minimo: number
  stock_ideal: number
  unidad_venta: string
  ubicacion?: string
}) {
  const supabase = createClient()
  const comercioId = await getComercioId()
  if (!comercioId) return null

  // Verificar SKU duplicado
  if (producto.sku) {
    const { data: existeSku } = await supabase
      .from('productos')
      .select('id')
      .eq('comercio_id', comercioId)
      .eq('sku', producto.sku)
      .single()
    if (existeSku) return { error: 'sku_duplicado' }
  }

  // Verificar código de barras duplicado
  if (producto.codigo_barras) {
    const { data: existeCodigo } = await supabase
      .from('productos')
      .select('id')
      .eq('comercio_id', comercioId)
      .eq('codigo_barras', producto.codigo_barras)
      .single()
    if (existeCodigo) return { error: 'codigo_duplicado' }
  }

  const { data, error } = await supabase
    .from('productos')
    .insert({ ...producto, comercio_id: comercioId })
    .select()
    .single()
  if (error) { console.error(error); return null }
  return data
}

export async function actualizarProducto(id: string, cambios: Record<string, any>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('productos')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error(error); return null }
  return data
}

export async function eliminarProducto(id: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('productos')
    .delete()
    .eq('id', id)
  if (error) { console.error(error); return false }
  return true
}

export async function subirImagen(file: File, productoId: string): Promise<string | null> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `${productoId}.${ext}`
  const { error } = await supabase.storage
    .from('productos')
    .upload(path, file, { upsert: true })
  if (error) { console.error(error); return null }
  const { data } = supabase.storage.from('productos').getPublicUrl(path)
  return data.publicUrl
}

export async function getStockCritico() {
  const supabase = createClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('comercio_id', comercioId)
    .eq('activo', true)
    .order('stock_actual', { ascending: true })
  if (error) { console.error(error); return [] }
  return data ?? []
}

export async function ajustarStock(id: string, nuevoStock: number): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('productos')
    .update({ stock_actual: nuevoStock })
    .eq('id', id)
  return !error
}

export async function guardarVenta(venta: {
  subtotal: number
  descuento_porcentaje: number
  descuento_monto: number
  recargo_porcentaje: number
  recargo_monto: number
  total: number
  metodo_pago: string
  items: {
    producto_id: string
    nombre_producto: string
    precio_unitario: number
    cantidad: number
    subtotal: number
    peso_kg?: number
  }[]
}) {
  const supabase = createClient()
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
      estado: 'completada'
    })
    .select()
    .single()

  if (ventaError || !ventaData) { console.error(ventaError); return null }

  const items = venta.items.map(i => ({
    venta_id: ventaData.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre_producto,
    precio_unitario: i.precio_unitario,
    cantidad: i.cantidad,
    subtotal: i.subtotal,
  }))
  await supabase.from('items_venta').insert(items)

  // Descontar stock de forma atómica vía RPC (evita race conditions)
  await Promise.all(venta.items.map(item => {
    const aDescontar = (item.peso_kg !== undefined && item.peso_kg !== null)
      ? Number(item.peso_kg)
      : Number(item.cantidad)
    return supabase.rpc('descontar_stock', {
      p_producto_id: item.producto_id,
      p_cantidad: aDescontar,
    })
  }))

  return ventaData
}

export async function getVentas() {
  const supabase = createClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []
  const { data, error } = await supabase
    .from('ventas')
    .select('*, items_venta(*)')
    .eq('comercio_id', comercioId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) { console.error(error); return [] }
  return data
}

export async function getCajaHoy() {
  const supabase = createClient()
  const comercioId = await getComercioId()
  if (!comercioId) return { ventas: [], movimientos: [] }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const { data: ventas } = await supabase
    .from('ventas')
    .select('*')
    .eq('comercio_id', comercioId)
    .gte('created_at', hoy.toISOString())
    .order('created_at', { ascending: false })

  const { data: movimientos } = await supabase
    .from('movimientos_caja')
    .select('*')
    .eq('comercio_id', comercioId)
    .gte('created_at', hoy.toISOString())
    .order('created_at', { ascending: false })

  return { ventas: ventas || [], movimientos: movimientos || [] }
}

export async function agregarEgreso(descripcion: string, monto: number, metodo: string): Promise<boolean> {
  const supabase = createClient()
  const comercioId = await getComercioId()
  if (!comercioId) return false
  const { error } = await supabase
    .from('movimientos_caja')
    .insert({
      comercio_id: comercioId,
      tipo: 'egreso',
      monto,
      descripcion,
      metodo_pago: metodo,
    })
  return !error
}

export async function getLotes(productoId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lotes')
    .select('*')
    .eq('producto_id', productoId)
    .order('fecha_vencimiento', { ascending: true })
  if (error) { console.error(error); return [] }
  return data
}

export async function agregarLote(lote: {
  producto_id: string
  numero_lote: string
  cantidad: number
  fecha_vencimiento?: string
}): Promise<boolean> {
  const supabase = createClient()

  // Verificar si ya existe un lote con el mismo número
  const { data: existente } = await supabase
    .from('lotes')
    .select('*')
    .eq('producto_id', lote.producto_id)
    .eq('numero_lote', lote.numero_lote)
    .single()

  if (existente) {
    // Si existe, sumar la cantidad
    const { error } = await supabase
      .from('lotes')
      .update({ cantidad: existente.cantidad + lote.cantidad })
      .eq('id', existente.id)
    if (error) { console.error(error); return false }
  } else {
    // Si no existe, crear nuevo
    const { error } = await supabase.from('lotes').insert(lote)
    if (error) { console.error(error); return false }
  }

  // Sumar al stock del producto
  const { data: prod } = await supabase
    .from('productos')
    .select('stock_actual')
    .eq('id', lote.producto_id)
    .single()
  if (prod) {
    await supabase
      .from('productos')
      .update({ stock_actual: prod.stock_actual + lote.cantidad })
      .eq('id', lote.producto_id)
  }
  return true
}

export async function getSiguienteNumeroLote(productoId: string): Promise<string> {
  const supabase = createClient()
  const { data } = await supabase
    .from('lotes')
    .select('numero_lote')
    .eq('producto_id', productoId)
    .order('fecha_ingreso', { ascending: false })

  const fecha = new Date()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const anio = fecha.getFullYear()
  const base = `L-${anio}-${mes}`

  if (!data || data.length === 0) return `${base}-001`

  // Filtrar lotes del mes actual y obtener el siguiente número
  const lotesEsteMes = data.filter(l => l.numero_lote.startsWith(base))
  if (lotesEsteMes.length === 0) return `${base}-001`

  const numeros = lotesEsteMes.map(l => {
    const partes = l.numero_lote.split('-')
    return parseInt(partes[partes.length - 1]) || 0
  })
  const siguiente = Math.max(...numeros) + 1
  return `${base}-${String(siguiente).padStart(3, '0')}`
}

export async function eliminarLote(loteId: string, productoId: string, cantidad: number): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.from('lotes').delete().eq('id', loteId)
  if (error) { console.error(error); return false }
  const { data: prod } = await supabase
    .from('productos').select('stock_actual').eq('id', productoId).single()
  if (prod) {
    await supabase.from('productos')
      .update({ stock_actual: Math.max(0, prod.stock_actual - cantidad) })
      .eq('id', productoId)
  }
  return true
}

export async function cerrarCaja(resumen: {
  total_ventas: number
  total_egresos: number
  saldo_neto: number
  cantidad_ventas: number
  efectivo: number
  debito: number
  credito: number
  mercadopago: number
}): Promise<boolean> {
  const supabase = createClient()
  const comercioId = await getComercioId()
  if (!comercioId) return false

  // Mantenemos la columna legacy `transferencia` en 0 para no romper
  // schemas existentes. La columna `credito` puede no existir hasta que
  // se corra supabase-migracion-credito.sql — el fallback la descarta.
  const payload: Record<string, any> = {
    comercio_id: comercioId,
    fecha: new Date().toISOString().split('T')[0],
    total_ventas: resumen.total_ventas,
    total_egresos: resumen.total_egresos,
    saldo_neto: resumen.saldo_neto,
    cantidad_ventas: resumen.cantidad_ventas,
    efectivo: resumen.efectivo,
    transferencia: 0,
    debito: resumen.debito,
    credito: resumen.credito,
    mercadopago: resumen.mercadopago,
  }

  const { error } = await supabase.from('cierres_caja').insert(payload)
  if (error && /credito/i.test(error.message)) {
    // Fallback: schema sin columna credito todavía
    delete payload.credito
    const retry = await supabase.from('cierres_caja').insert(payload)
    return !retry.error
  }
  return !error
}

export async function getCierresCaja() {
  const supabase = createClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []

  const { data, error } = await supabase
    .from('cierres_caja')
    .select('*')
    .eq('comercio_id', comercioId)
    .order('fecha', { ascending: false })
    .limit(30)

  if (error) { console.error(error); return [] }
  return data
}