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
}

export async function cerrarCaja(resumen: CerrarCajaInput): Promise<boolean> {
  const supabase = getBrowserClient()
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
    delete payload.credito
    const retry = await supabase.from('cierres_caja').insert(payload)
    return !retry.error
  }
  return !error
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

  if (error) { console.error(error); return [] }
  return (data ?? []) as CierreCaja[]
}
