import { getBrowserClient, getComercioId } from './_base'
import type { CategoriaGasto, Gasto } from '@/types/database'

export const CATEGORIAS_GASTO: { id: CategoriaGasto; label: string }[] = [
  { id: 'alquiler', label: 'Alquiler' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'impuestos', label: 'Impuestos' },
  { id: 'sueldos', label: 'Sueldos' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'transporte', label: 'Transporte' },
  { id: 'otros', label: 'Otros' },
]

export const CATEGORIAS_GASTO_IDS = CATEGORIAS_GASTO.map(c => c.id)

export interface GastoInput {
  descripcion: string
  monto: number
  categoria: CategoriaGasto
  fecha: string
  observaciones?: string | null
}

export interface ListarGastosOpts {
  desde?: string
  hasta?: string
  categoria?: CategoriaGasto | 'todas'
  page?: number
  pageSize?: number
}

export interface ListarGastosResult {
  gastos: Gasto[]
  total: number
}

export function esCategoriaGasto(value: string): value is CategoriaGasto {
  return CATEGORIAS_GASTO_IDS.includes(value as CategoriaGasto)
}

function validarInput(input: GastoInput): string | null {
  if (!input.descripcion.trim()) return 'La descripción es obligatoria'
  if (!Number.isFinite(input.monto) || input.monto <= 0) return 'El monto debe ser mayor a 0'
  if (!input.categoria || !esCategoriaGasto(input.categoria)) return 'La categoría es obligatoria'
  if (!input.fecha) return 'La fecha es obligatoria'
  return null
}

export async function listarGastos(opts: ListarGastosOpts = {}): Promise<ListarGastosResult> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return { gastos: [], total: 0 }

  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('gastos')
    .select('*', { count: 'exact' })
    .eq('comercio_id', comercioId)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
    .range(from, to)

  if (opts.desde) query = query.gte('fecha', opts.desde)
  if (opts.hasta) query = query.lte('fecha', opts.hasta)
  if (opts.categoria && opts.categoria !== 'todas') query = query.eq('categoria', opts.categoria)

  const { data, error, count } = await query
  if (error) {
    console.error('[listarGastos] query falló:', error)
    return { gastos: [], total: 0 }
  }
  return { gastos: (data ?? []) as Gasto[], total: count ?? 0 }
}

export async function crearGasto(input: GastoInput): Promise<{ ok: true; gasto: Gasto } | { ok: false; error: string }> {
  const validation = validarInput(input)
  if (validation) return { ok: false, error: validation }

  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return { ok: false, error: 'Sin comercio asignado' }

  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('gastos')
    .insert({
      comercio_id: comercioId,
      descripcion: input.descripcion.trim(),
      monto: input.monto,
      categoria: input.categoria,
      fecha: input.fecha,
      observaciones: input.observaciones?.trim() || null,
      creado_por: user?.id ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[crearGasto] insert falló:', error)
    return { ok: false, error: 'No se pudo crear el gasto' }
  }
  return { ok: true, gasto: data as Gasto }
}

export async function actualizarGasto(
  id: string,
  input: GastoInput,
): Promise<{ ok: true; gasto: Gasto } | { ok: false; error: string }> {
  const validation = validarInput(input)
  if (validation) return { ok: false, error: validation }

  const supabase = getBrowserClient()
  const { data, error } = await supabase
    .from('gastos')
    .update({
      descripcion: input.descripcion.trim(),
      monto: input.monto,
      categoria: input.categoria,
      fecha: input.fecha,
      observaciones: input.observaciones?.trim() || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[actualizarGasto] update falló:', error)
    return { ok: false, error: 'No se pudo actualizar el gasto' }
  }
  return { ok: true, gasto: data as Gasto }
}

export async function eliminarGasto(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getBrowserClient()
  const { error } = await supabase
    .from('gastos')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[eliminarGasto] delete falló:', error)
    return { ok: false, error: 'No se pudo eliminar el gasto' }
  }
  return { ok: true }
}
