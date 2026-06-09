// Wrappers de fetch para los endpoints MP desde el browser. Tipados
// y con mensajes de error human-readable.
//
// CLIENT-SAFE. No importa nada de lib/mp/* que dependa de env del
// server. Solo hace HTTP a /api/mp/*.

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
    const msg =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${res.status}`
    throw new MPClientFetchError(msg, res.status)
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
): Promise<CrearCobroResponse> {
  const res = await fetch('/api/mp/cobros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monto, descripcion }),
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
