import { getBrowserClient } from './_base'
import type { Lote } from '@/types/database'

// Capa cliente sobre lotes.
//
// V1 hasta el sprint fix/stock-lotes-integrity-v1 hacía 2-3 UPDATEs
// sueltos por operación (lotes + productos.stock_actual). Ahora cada
// mutación pasa por una RPC plpgsql atómica con FOR UPDATE + assert
// de invariante SUM(lotes) == stock_actual. Ver
// scripts/migration-lotes-integrity.sql para los contratos.
//
// Errores conocidos de las RPCs (PostgREST los expone como
// error.message, con DETAIL en error.details):
//   - 'cantidad_invalida'
//   - 'producto_no_encontrado'
//   - 'lote_no_encontrado'
//   - 'invariante_violada' (no debería pasar — bug si lo ves)
// Los mapeamos a boolean para mantener la API actual; los callers
// muestran toast genérico. Detalle al console.error para debug.

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

/** Agrega un lote y actualiza stock atómicamente vía RPC
 *  agregar_lote_atomico. La RPC se encarga de:
 *   - Mergear si existe (numero_lote, fecha_vencimiento) idéntico.
 *   - Auto-backfill "L-INICIAL" si el producto venía en modo
 *     legacy (stock > 0 sin lotes).
 *   - Incrementar productos.stock_actual.
 *   - Assert SUM(lotes) == stock_actual al final.
 *
 *  Devuelve true si OK, false si la RPC falló. El detalle del error
 *  va al console para inspección — la UI muestra toast genérico. */
export async function agregarLote(lote: AgregarLoteInput): Promise<boolean> {
  const supabase = getBrowserClient()
  const { error } = await supabase.rpc('agregar_lote_atomico', {
    p_producto_id:       lote.producto_id,
    p_numero_lote:       lote.numero_lote,
    p_cantidad:          lote.cantidad,
    p_fecha_vencimiento: lote.fecha_vencimiento ?? null,
  })
  if (error) {
    console.error('[agregarLote] RPC agregar_lote_atomico falló:', error)
    return false
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

/** Elimina un lote y descuenta stock atómicamente vía RPC
 *  eliminar_lote_atomico. La RPC obtiene cantidad y producto_id del
 *  lote internamente — no hace falta pasarlos.
 *
 *  Firma simplificada respecto a la versión anterior (que pedía
 *  productoId y cantidad por la lógica no-atómica). Los callers se
 *  actualizan en este mismo commit. */
export async function eliminarLote(loteId: string): Promise<boolean> {
  const supabase = getBrowserClient()
  const { error } = await supabase.rpc('eliminar_lote_atomico', {
    p_lote_id: loteId,
  })
  if (error) {
    console.error('[eliminarLote] RPC eliminar_lote_atomico falló:', error)
    return false
  }
  return true
}
