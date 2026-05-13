import { getBrowserClient, getComercioId } from './_base'
import type { Venta, MovimientoCaja, CierreCaja } from '@/types/database'

export async function getCajaHoy(): Promise<{ ventas: Venta[]; movimientos: MovimientoCaja[] }> {
  const supabase = getBrowserClient()
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

  return {
    ventas: (ventas ?? []) as Venta[],
    movimientos: (movimientos ?? []) as MovimientoCaja[],
  }
}

export async function agregarEgreso(descripcion: string, monto: number, metodo: string): Promise<boolean> {
  const supabase = getBrowserClient()
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

interface CerrarCajaInput {
  total_ventas: number
  total_egresos: number
  saldo_neto: number
  cantidad_ventas: number
  efectivo: number
  debito: number
  credito: number
  mercadopago: number
  /** Efectivo físicamente contado en la caja al cerrar. Opcional —
   *  si el cajero no cuenta, no se persiste ni se calcula diferencia. */
  efectivo_contado?: number | null
  /** efectivo_contado - efectivo_esperado. Calculado en el caller. */
  diferencia_efectivo?: number | null
}

/**
 * Persiste un cierre de caja del día. Backward-compat con schemas que
 * todavía no corrieron las migraciones de `credito` y/o
 * `efectivo_contado/diferencia_efectivo`: si el insert falla por
 * columna inexistente, reintenta sin esos campos.
 *
 * Mantiene `transferencia: 0` por compatibilidad con schema antiguo
 * que tiene la columna pero ya no aplica al producto actual.
 */
export async function cerrarCaja(resumen: CerrarCajaInput): Promise<boolean> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return false

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
  if (resumen.efectivo_contado !== undefined && resumen.efectivo_contado !== null) {
    payload.efectivo_contado = resumen.efectivo_contado
    payload.diferencia_efectivo = resumen.diferencia_efectivo ?? null
  }

  // Reintento recursivo eliminando columnas que el schema todavía no tiene.
  // Usa .select() para confirmar que el row quedó visible post-insert
  // (detecta el caso de RLS USING que permite INSERT pero bloquea SELECT).
  const tryInsert = async (p: Record<string, any>): Promise<boolean> => {
    const { data, error } = await supabase
      .from('cierres_caja')
      .insert(p)
      .select('id')
      .single()

    if (!error && data?.id) {
      console.log('[cerrarCaja] insert OK, id:', data.id)
      return true
    }

    const msg = error?.message || ''

    // Caso: insert se ejecutó pero el SELECT post-insert no ve el row.
    // Indica desalineación de policy RLS (USING permite INSERT pero
    // USING/SELECT no devuelve el row al mismo usuario). Ej: get_comercio_id()
    // retornando null en el contexto del SELECT.
    if (!error && !data) {
      console.warn('[cerrarCaja] insert sin error pero row no visible post-insert — revisar policy RLS de cierres_caja')
      return false
    }

    // PGRST116 = "JSON object requested, multiple (or no) rows returned"
    // → insert pasó RLS pero el SELECT-after-INSERT fue bloqueado por RLS.
    if (error && (error.code === 'PGRST116' || /no rows/i.test(msg))) {
      console.warn('[cerrarCaja] insert pasó pero RLS bloquea releer el row. msg:', msg)
      return false
    }

    console.warn('[cerrarCaja] error:', error?.code, msg)

    if (/efectivo_contado|diferencia_efectivo/i.test(msg)) {
      const { efectivo_contado: _a, diferencia_efectivo: _b, ...rest } = p
      return tryInsert(rest)
    }
    if (/credito/i.test(msg)) {
      const { credito: _c, ...rest } = p
      return tryInsert(rest)
    }
    return false
  }

  return tryInsert(payload)
}

export async function getCierresCaja(): Promise<CierreCaja[]> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return []

  const { data, error } = await supabase
    .from('cierres_caja')
    .select('*')
    .eq('comercio_id', comercioId)
    .order('fecha', { ascending: false })
    .limit(30)

  if (error) { console.error('[getCierresCaja]', error); return [] }
  console.log('[getCierresCaja] rows:', data?.length ?? 0)
  return (data ?? []) as CierreCaja[]
}
