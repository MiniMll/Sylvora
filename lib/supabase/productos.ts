// Capa de datos para la entidad Producto.
// Para ventas → ./ventas | para lotes → ./stock | para caja → ./caja.

import { getBrowserClient, getComercioId } from './_base'
import type { Producto } from '@/types/database'

// Cap defensivo. Si un comercio supera este número, conviene migrar
// a paginación o virtualización antes de subirlo. Hoy: render in-memory
// + filtrado client-side = OK hasta ~1000 SKUs.
const PRODUCTOS_LIMIT = 1000

export async function getProductos(): Promise<Producto[]> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('comercio_id', comercioId)
    .eq('activo', true)
    .order('nombre')
    .limit(PRODUCTOS_LIMIT)
  if (error) { console.error(error); return [] }
  return (data ?? []) as Producto[]
}

interface GuardarProductoInput {
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
}

export async function guardarProducto(producto: GuardarProductoInput): Promise<Producto | { error: string } | null> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return null

  if (producto.sku) {
    const { data: existeSku } = await supabase
      .from('productos')
      .select('id')
      .eq('comercio_id', comercioId)
      .eq('sku', producto.sku)
      .single()
    if (existeSku) return { error: 'sku_duplicado' }
  }

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
  return data as Producto
}

export async function actualizarProducto(id: string, cambios: Partial<Producto>): Promise<Producto | null> {
  const supabase = getBrowserClient()
  const { data, error } = await supabase
    .from('productos')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error(error); return null }
  return data as Producto
}

export async function eliminarProducto(id: string): Promise<boolean> {
  const supabase = getBrowserClient()
  const { error } = await supabase
    .from('productos')
    .delete()
    .eq('id', id)
  if (error) { console.error(error); return false }
  return true
}

export async function subirImagen(file: File, productoId: string): Promise<string | null> {
  const supabase = getBrowserClient()
  const ext = file.name.split('.').pop()
  const path = `${productoId}.${ext}`
  const { error } = await supabase.storage
    .from('productos')
    .upload(path, file, { upsert: true })
  if (error) { console.error(error); return null }
  const { data } = supabase.storage.from('productos').getPublicUrl(path)
  return data.publicUrl
}

export async function getStockCritico(): Promise<Producto[]> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('comercio_id', comercioId)
    .eq('activo', true)
    .order('stock_actual', { ascending: true })
  if (error) { console.error(error); return [] }
  return (data ?? []) as Producto[]
}

export async function ajustarStock(id: string, nuevoStock: number): Promise<boolean> {
  const supabase = getBrowserClient()
  const { error } = await supabase
    .from('productos')
    .update({ stock_actual: nuevoStock })
    .eq('id', id)
  return !error
}
