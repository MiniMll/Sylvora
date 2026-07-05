// Wrappers de fetch para los endpoints MP desde el browser. Tipados
// y con mensajes de error human-readable.
//
// CLIENT-SAFE. No importa nada de lib/mp/* que dependa de env del
// server. Solo hace HTTP a /api/mp/*. (lib/mp/snapshot.ts es puro —
// tipos compartidos, sin env.)

import type { SnapshotVentaMP } from '@/lib/mp/snapshot'

export type EstadoIntentoCobro =
  | 'pendiente'
  | 'aprobado'
  | 'rechazado'
  | 'cancelado'
  | 'expirado'
  | 'requiere_revision'

// ────────────────────────────────────────────────────────────────────
// Error tipado para el cliente
// ────────────────────────────────────────────────────────────────────

export class MPClientFetchError extends Error {
  readonly status: number
  readonly code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'MPClientFetchError'
    this.status = status
    this.code = code
  }
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // body no JSON.
  }
  if (!res.ok) {
    const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
    const msg = obj && typeof obj.error === 'string' ? obj.error : `HTTP ${res.status}`
    const code = obj && typeof obj.code === 'string' ? obj.code : undefined
    throw new MPClientFetchError(msg, res.status, code)
  }
  return body
}

// ────────────────────────────────────────────────────────────────────
// Tipos de las respuestas (subset, lo que usa la UI)
// ────────────────────────────────────────────────────────────────────

export interface CrearCobroResponse {
  intento_id: string
  qr_data: string | null
  checkout_url: string | null
  expira_en: string
  estado: 'pendiente'
}

export interface EstadoCobroResponse {
  intento_id: string
  estado: EstadoIntentoCobro
  monto: number
  metodo: string
  qr_data: string | null
  checkout_url: string | null
  expira_en: string
  pagado_en: string | null
  venta_id: string | null
  mp_status_detail: string | null
}

export interface CancelarCobroResponse {
  intento_id: string
  estado: EstadoIntentoCobro
  /** true si esta request cambió el estado. false si MP cobró antes. */
  cancelado: boolean
}

export interface RequiereRevisionResponse {
  intento_id: string
  estado: EstadoIntentoCobro
  ok: boolean
  error?: string
}

export interface AsociarVentaResponse {
  intento_id: string
  venta_id: string | null
  estado: EstadoIntentoCobro
}

// ────────────────────────────────────────────────────────────────────
// Acciones
// ────────────────────────────────────────────────────────────────────

export async function crearCobroMP(
  monto: number,
  descripcion?: string,
  itemsSnapshot?: SnapshotVentaMP,
): Promise<CrearCobroResponse> {
  const res = await fetch('/api/mp/cobros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monto, descripcion, items_snapshot: itemsSnapshot }),
  })
  return (await parseJsonOrThrow(res)) as CrearCobroResponse
}

export async function obtenerEstadoCobroMP(
  intentoId: string,
): Promise<EstadoCobroResponse> {
  const res = await fetch(`/api/mp/cobros/${encodeURIComponent(intentoId)}`)
  return (await parseJsonOrThrow(res)) as EstadoCobroResponse
}

export async function cancelarCobroMP(
  intentoId: string,
): Promise<CancelarCobroResponse> {
  const res = await fetch(`/api/mp/cobros/${encodeURIComponent(intentoId)}/cancelar`, {
    method: 'POST',
  })
  return (await parseJsonOrThrow(res)) as CancelarCobroResponse
}

export async function marcarCobroRequiereRevision(
  intentoId: string,
  motivo: string,
): Promise<RequiereRevisionResponse> {
  const res = await fetch(`/api/mp/cobros/${encodeURIComponent(intentoId)}/requiere-revision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo }),
  })
  // 409 con ok:false también devuelve JSON estructurado — lo parseamos
  // sin tirar, porque el frontend quiere distinguir "ya estaba en otro
  // estado" de error real.
  let body: unknown = null
  try { body = await res.json() } catch { /* ignore */ }
  if (res.status === 409 || res.ok) {
    return body as RequiereRevisionResponse
  }
  const msg = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`
  throw new MPClientFetchError(msg, res.status)
}

export async function asociarVentaAIntentoMP(
  intentoId: string,
  ventaId: string,
): Promise<AsociarVentaResponse> {
  const res = await fetch(`/api/mp/cobros/${encodeURIComponent(intentoId)}/venta`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ venta_id: ventaId }),
  })
  return (await parseJsonOrThrow(res)) as AsociarVentaResponse
}

// ────────────────────────────────────────────────────────────────────
// Cola de revisión (épica requiere_revision)
// ────────────────────────────────────────────────────────────────────

export interface IntentoRevisionMP {
  intento_id: string
  monto: number
  mp_payment_id: number | null
  motivo: string | null
  tipo: 'huerfano_detectado' | 'requiere_revision'
  estado: string
  pagado_en: string | null
  antiguedad_minutos: number | null
  creado_en: string
  actualizado_en: string
  external_reference: string
  tiene_snapshot: boolean
  items_snapshot: SnapshotVentaMP | null
  venta_id: string | null
}

export interface ResolucionRevisionMP {
  resolucion_id: string
  intento_id: string
  accion: 'venta_registrada' | 'venta_asociada' | 'reembolsado' | 'descartado'
  nota: string | null
  fecha: string
  resuelto_por: string | null
  venta_id: string | null
  venta_numero_ticket: number | null
  monto: number | null
  mp_payment_id: number | null
}

export interface ColaRevisionResponse {
  intentos: IntentoRevisionMP[]
  resueltos: ResolucionRevisionMP[]
  promovidos: number
}

/** Cola de cobros a revisar + historial. ADMIN-ONLY (403 para otros
 *  roles — el caller debe manejarlo). Dispara el lazy-promote de
 *  huérfanos server-side. */
export async function obtenerColaRevisionMP(): Promise<ColaRevisionResponse> {
  const res = await fetch('/api/mp/revision', { cache: 'no-store' })
  return (await parseJsonOrThrow(res)) as ColaRevisionResponse
}

export interface ResolverRevisionResponse {
  intento_id: string
  resolucion_id: string
  accion: string
  estado: 'resuelto'
}

/** Resuelve un intento de la cola. Pasa por la RPC transaccional
 *  server-side — acá solo viaja la intención. */
export async function resolverCobroRevisionMP(
  intentoId: string,
  accion: 'venta_registrada' | 'venta_asociada' | 'reembolsado' | 'descartado',
  opts?: { ventaId?: string; nota?: string },
): Promise<ResolverRevisionResponse> {
  const res = await fetch(`/api/mp/revision/${encodeURIComponent(intentoId)}/resolver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accion,
      venta_id: opts?.ventaId,
      nota: opts?.nota,
    }),
  })
  return (await parseJsonOrThrow(res)) as ResolverRevisionResponse
}
