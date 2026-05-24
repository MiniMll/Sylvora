// Capa de datos para la entidad Producto.
// Para ventas → ./ventas | para lotes → ./stock | para caja → ./caja.

import { getBrowserClient, getComercioId } from './_base'
import type { Producto } from '@/types/database'
import type { ParsedRow, ExistingProduct } from '@/lib/import'

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

export async function actualizarProducto(
  id: string,
  cambios: Partial<Producto>,
): Promise<Producto | { error: string } | null> {
  const supabase = getBrowserClient()

  // Normalización: si el usuario LIMPIA el campo de código/SKU, lo
  // guardamos como null en vez de string vacío. Sin esto, dos productos
  // sin código quedarían ambos con codigo_barras='' y el chequeo de
  // duplicados los marcaría erróneamente como conflicto.
  const codigoTrim = cambios.codigo_barras?.trim()
  const skuTrim = cambios.sku?.trim()
  const cambiosNormalizados: Partial<Producto> = { ...cambios }
  if ('codigo_barras' in cambios) cambiosNormalizados.codigo_barras = codigoTrim || null
  if ('sku' in cambios) cambiosNormalizados.sku = skuTrim || null

  // Validar duplicados (replicación de la guarda de alta). Sólo chequea
  // si el valor nuevo es NO vacío. Replica el patrón de guardarProducto.
  if (codigoTrim) {
    const { data: dup } = await supabase
      .from('productos')
      .select('id')
      .eq('codigo_barras', codigoTrim)
      .neq('id', id)
      .maybeSingle()
    if (dup) return { error: 'codigo_duplicado' }
  }
  if (skuTrim) {
    const { data: dup } = await supabase
      .from('productos')
      .select('id')
      .eq('sku', skuTrim)
      .neq('id', id)
      .maybeSingle()
    if (dup) return { error: 'sku_duplicado' }
  }

  const { data, error } = await supabase
    .from('productos')
    .update(cambiosNormalizados)
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

/** Snapshot mínimo de productos del comercio para alimentar
 *  validateImportRows (detección de duplicados). Trae SOLO los
 *  campos que comparamos — más liviano que getProductos() y
 *  sin límite (la dedup necesita ver TODO el catálogo). */
export async function getProductosParaImport(): Promise<ExistingProduct[]> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []
  const { data, error } = await supabase
    .from('productos')
    .select('nombre, sku, codigo_barras')
    .eq('comercio_id', comercioId)
    .eq('activo', true)
  if (error) { console.error(error); return [] }
  return (data ?? []) as ExistingProduct[]
}

export interface ImportResult {
  inserted: number
  error?: string
}

/** Bulk insert de productos validados (filas con status='ok').
 *  Una sola query a Supabase — atómica desde la perspectiva del cliente.
 *  RLS garantiza que comercio_id se respete; igual lo seteamos explícito.
 *
 *  Defaults aplicados acá (no en DB) para no depender del schema:
 *    precio_costo = 0, stock_minimo = 0, stock_ideal = 0, unidad_venta = 'unidad'
 *  Los nullables (precio_mayorista, precio_por_kg, ubicacion, imagen_url)
 *  se omiten y la DB los deja en NULL. `activo` queda true por default DB. */
export async function importarProductos(rows: ParsedRow[]): Promise<ImportResult> {
  if (rows.length === 0) return { inserted: 0 }
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return { inserted: 0, error: 'No se pudo identificar el comercio.' }

  const payload = rows.map(r => ({
    comercio_id: comercioId,
    nombre: r.nombre,
    precio_venta: r.precio,
    precio_costo: 0,
    stock_actual: r.stock,
    stock_minimo: 0,
    stock_ideal: 0,
    unidad_venta: 'unidad',
    categoria: r.categoria,
    sku: r.sku,
    codigo_barras: r.codigo_barras,
  }))

  const { data, error } = await supabase
    .from('productos')
    .insert(payload)
    .select('id')

  if (error) {
    console.error(error)
    return {
      inserted: 0,
      error: 'No se pudo importar. Verificá que no haya productos duplicados y volvé a intentar.',
    }
  }
  return { inserted: data?.length ?? 0 }
}
