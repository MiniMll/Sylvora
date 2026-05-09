import { getBrowserClient } from './_base'
import type { Lote } from '@/types/database'

export async function getLotes(productoId: string): Promise<Lote[]> {
  const supabase = getBrowserClient()
  const { data, error } = await supabase
    .from('lotes')
    .select('*')
    .eq('producto_id', productoId)
    .order('fecha_vencimiento', { ascending: true })
  if (error) { console.error(error); return [] }
  return (data ?? []) as Lote[]
}

interface AgregarLoteInput {
  producto_id: string
  numero_lote: string
  cantidad: number
  fecha_vencimiento?: string
}

export async function agregarLote(lote: AgregarLoteInput): Promise<boolean> {
  const supabase = getBrowserClient()

  // Si ya existe lote con el mismo número, sumamos a su cantidad.
  const { data: existente } = await supabase
    .from('lotes')
    .select('*')
    .eq('producto_id', lote.producto_id)
    .eq('numero_lote', lote.numero_lote)
    .single()

  if (existente) {
    const { error } = await supabase
      .from('lotes')
      .update({ cantidad: existente.cantidad + lote.cantidad })
      .eq('id', existente.id)
    if (error) { console.error(error); return false }
  } else {
    const { error } = await supabase.from('lotes').insert(lote)
    if (error) { console.error(error); return false }
  }

  // Sumar al stock del producto.
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
  const supabase = getBrowserClient()
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
  const supabase = getBrowserClient()
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
