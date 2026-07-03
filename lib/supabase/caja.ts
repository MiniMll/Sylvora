import { getBrowserClient, getComercioId, getComercio } from './_base'
import { obtenerDiaOperativoActual, type DiaOperativo } from '@/lib/operacion/diaOperativo'
import type { Venta, MovimientoCaja, CierreCaja } from '@/types/database'

/**
 * Ventas + movimientos del DÍA OPERATIVO actual del comercio.
 *
 * El "día" ya no es el día calendario del browser: sale de
 * comercios.settings via lib/operacion/diaOperativo.ts. Para un
 * comercio 24hs (default) equivale al día calendario en TZ Argentina;
 * para un nocturno (ej. 18:00–02:00), a la 01:30 la caja sigue siendo
 * la del día anterior.
 *
 * Devuelve también el DiaOperativo usado, para que la page derive
 * estado (cierreHoy, labels) con la MISMA fecha operativa y no
 * recalcule con new Date() por su cuenta.
 */
export async function getCajaHoy(): Promise<{
  ventas: Venta[]
  movimientos: MovimientoCaja[]
  dia: DiaOperativo | null
}> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return { ventas: [], movimientos: [], dia: null }

  const comercio = await getComercio()
  const dia = obtenerDiaOperativoActual(comercio?.settings ?? null)

  const { data: ventas } = await supabase
    .from('ventas')
    .select('*')
    .eq('comercio_id', comercioId)
    .gte('created_at', dia.inicio.toISOString())
    .lt('created_at', dia.fin.toISOString())
    .order('created_at', { ascending: false })

  const { data: movimientos } = await supabase
    .from('movimientos_caja')
    .select('*')
    .eq('comercio_id', comercioId)
    .gte('created_at', dia.inicio.toISOString())
    .lt('created_at', dia.fin.toISOString())
    .order('created_at', { ascending: false })

  return {
    ventas: (ventas ?? []) as Venta[],
    movimientos: (movimientos ?? []) as MovimientoCaja[],
    dia,
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
  /** Monto retirado al cerrar (opcional, solo informativo en V1). */
  retiro_efectivo?: number | null
}

/** Resultado discriminado de cerrarCaja para que la UI pueda diferenciar
 *  entre éxito, duplicado (ya hay un cierre hoy) y error genérico. */
export type CerrarCajaResult = 'ok' | 'duplicate' | 'error'

/**
 * Persiste un cierre de caja del día. La regla 1-cierre-por-día está
 * garantizada por UNIQUE(comercio_id, fecha); si ya hay un cierre hoy,
 * el insert falla con código 23505 y se devuelve 'duplicate' para que
 * la UI muestre el mensaje correcto.
 *
 * Backward-compat con schemas que todavía no corrieron las migraciones
 * de `credito` y/o `efectivo_contado/diferencia_efectivo`: reintenta
 * sin esos campos si el error lo menciona. Los campos nuevos
 * (`usuario_id`, `retiro_efectivo`) requieren la migration del rework
 * — no se reintenta sin ellos.
 */
export async function cerrarCaja(resumen: CerrarCajaInput): Promise<CerrarCajaResult> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return 'error'

  const { data: { user } } = await supabase.auth.getUser()

  // La fecha del cierre es la FECHA OPERATIVA, no la calendario.
  // Para una pizzería 18-02 que cierra a la 01:45, el cierre queda
  // registrado con la fecha del día que abrió (ayer calendario).
  // El UNIQUE(comercio_id, fecha) sigue garantizando 1 cierre por
  // día operativo.
  const comercio = await getComercio()
  const dia = obtenerDiaOperativoActual(comercio?.settings ?? null)

  const payload: Record<string, any> = {
    comercio_id: comercioId,
    usuario_id: user?.id ?? null,
    fecha: dia.fechaOperativa,
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
  if (resumen.retiro_efectivo !== undefined && resumen.retiro_efectivo !== null) {
    payload.retiro_efectivo = resumen.retiro_efectivo
  }

  const tryInsert = async (p: Record<string, any>): Promise<CerrarCajaResult> => {
    const { data, error } = await supabase
      .from('cierres_caja')
      .insert(p)
      .select('id')
      .single()

    if (!error && data?.id) return 'ok'

    const msg = error?.message || ''

    // 23505 = unique_violation. El UNIQUE(comercio_id, fecha) rechaza
    // un segundo cierre para el mismo día — la UI lo trata como "ya
    // cerraste caja hoy" sin mostrar error técnico.
    if (error?.code === '23505') return 'duplicate'

    // Insert sin error pero sin data: RLS USING desalineada con SELECT.
    if (!error && !data) {
      console.warn('[cerrarCaja] insert sin error pero row no visible post-insert — revisar RLS')
      return 'error'
    }
    if (error && (error.code === 'PGRST116' || /no rows/i.test(msg))) {
      console.warn('[cerrarCaja] RLS bloquea releer el row insertado. msg:', msg)
      return 'error'
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
    return 'error'
  }

  return tryInsert(payload)
}

/**
 * Borra el cierre de hoy para volver el estado de caja a "abierta".
 * Coherente con la decisión A del spec: reabrir = borrar, sin estado
 * "anulado" ni múltiples cierres activos por día.
 */
export async function reabrirCaja(cierreId: string): Promise<boolean> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return false
  const { error } = await supabase
    .from('cierres_caja')
    .delete()
    .eq('id', cierreId)
    .eq('comercio_id', comercioId)
  if (error) console.error('[reabrirCaja]', error.code, error.message)
  return !error
}

/**
 * Resuelve el nombre del responsable de un cierre a partir del
 * usuario_id. Devuelve null si no hay id o el perfil no se encuentra.
 * V1 single-user: en la práctica siempre es el usuario actual, pero
 * la función queda lista para multi-user/roles.
 */
export async function getResponsableNombre(usuarioId: string | null | undefined): Promise<string | null> {
  if (!usuarioId) return null
  const supabase = getBrowserClient()
  const { data } = await supabase
    .from('perfiles')
    .select('nombre')
    .eq('id', usuarioId)
    .single()
  return (data?.nombre as string | null) ?? null
}

export async function getCierresCaja(): Promise<CierreCaja[]> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) {
    console.warn('[getCierresCaja] sin comercioId — usuario/perfil no resuelto')
    return []
  }

  const { data, error } = await supabase
    .from('cierres_caja')
    .select('*')
    .eq('comercio_id', comercioId)
    .order('fecha', { ascending: false })
    .limit(30)

  if (error) {
    console.error('[getCierresCaja] error:', error.code, '-', error.message)
    return []
  }
  return (data ?? []) as CierreCaja[]
}
