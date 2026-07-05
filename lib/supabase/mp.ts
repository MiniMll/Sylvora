// Data layer de Mercado Pago — capa tipada sobre las tablas
// mp_credenciales e intentos_cobro_mp.
//
// ⚠️  SERVER-ONLY. Este módulo descifra access_token / refresh_token
//     de mp_credenciales. NUNCA importarlo desde un component
//     'use client', desde una page que no sea server-only, ni desde
//     lib/supabase/_base.ts (que es browser). Solo:
//       - app/api/mp/**/route.ts (route handlers)
//       - server actions
//       - lib/mp/** (helpers también server-only)
//
//     La defensa de fondo es la env SYLVORA_MP_TOKEN_ENCRYPTION_KEY:
//     si este módulo termina en el bundle del cliente, decryptToken
//     tira porque la env no existe ahí. Igual: no lo importes desde
//     componentes 'use client'.
//
// Pattern: todas las funciones reciben un SupabaseClient como primer
// param. La capa superior decide cuál cliente pasar:
//   - Operaciones de admin con cookie del user → server client de @supabase/ssr.
//   - Webhook (sin cookie) → service client de lib/supabase/server-admin.
//
// Eso mantiene este módulo testeable (mockeable) y desacoplado del
// transport.

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import { encryptToken, decryptToken } from '@/lib/mp/crypto'

// ════════════════════════════════════════════════════════════════════
// Tipos
// ════════════════════════════════════════════════════════════════════

/** Estados posibles del intento de cobro. Match con el CHECK constraint.
 *
 *  Lifecycle:
 *    pendiente → aprobado    → requiere_revision → resuelto
 *              → rechazado
 *              → cancelado  ─┐ (webhook 'approved' tardío)
 *              → expirado   ─┴→ requiere_revision → resuelto
 *
 *  requiere_revision: MP cobró pero la venta no se registró. Visible
 *  en la cola de revisión (admin-only).
 *  resuelto: un admin lo resolvió vía la RPC resolver_intento_mp —
 *  la auditoría queda en mp_resoluciones_cobro. Terminal absoluto. */
export type EstadoIntentoMP =
  | 'pendiente'
  | 'aprobado'
  | 'rechazado'
  | 'cancelado'
  | 'expirado'
  | 'requiere_revision'
  | 'resuelto'

/** Método del intento. Match con el CHECK constraint. */
export type MetodoIntentoMP = 'qr' | 'link'

/**
 * Row tal cual existe en DB. Los tokens vienen CIFRADOS (lo que
 * guardó encryptToken). NO se expone fuera del módulo — solo es
 * útil para queries internas.
 */
interface MPCredencialesRaw {
  comercio_id: string
  access_token: string         // cifrado
  refresh_token: string        // cifrado
  expira_en: string            // ISO
  user_id_mp: number
  public_key: string
  store_id_mp: string
  external_pos_id: string
  conectado_en: string
  conectado_por: string | null
  actualizado_en: string
}

/**
 * Vista pública (sin tokens cifrados crudos). Útil para chequear
 * conexión, mostrar fecha, etc.
 */
export interface MPCredenciales {
  comercio_id: string
  expira_en: string
  user_id_mp: number
  public_key: string
  store_id_mp: string
  external_pos_id: string
  conectado_en: string
  conectado_por: string | null
  actualizado_en: string
}

/**
 * Credenciales descifradas. Solo se devuelve cuando el caller la
 * pide explícitamente y desde server-side. Tratá `access_token`
 * y `refresh_token` como secrets: NO logs, NO responses al cliente.
 */
export interface MPCredencialesDescifradas extends MPCredenciales {
  access_token: string
  refresh_token: string
}

/** Input para guardar credenciales (post-OAuth callback). */
export interface GuardarCredencialesInput {
  comercio_id: string
  /** Plaintext. Se cifra dentro del módulo antes del INSERT. */
  access_token: string
  /** Plaintext. */
  refresh_token: string
  /** Cuándo expira el access_token. */
  expira_en: Date | string
  user_id_mp: number
  public_key: string
  store_id_mp: string
  external_pos_id: string
  conectado_por: string | null
}

/** Patch para actualizar credenciales (typical: refresh de tokens). */
export interface ActualizarCredencialesInput {
  /** Plaintext si se actualiza. */
  access_token?: string
  refresh_token?: string
  expira_en?: Date | string
  store_id_mp?: string
  external_pos_id?: string
  public_key?: string
}

/** Row de intentos_cobro_mp. Todos los campos opcionales son nullable
 *  en DB y se llenan a medida que avanza el lifecycle. */
export interface IntentoCobroMP {
  id: string
  comercio_id: string
  venta_id: string | null
  external_reference: string
  order_id_mp: string | null
  qr_data: string | null
  checkout_url: string | null
  monto: number
  metodo: MetodoIntentoMP
  estado: EstadoIntentoMP
  mp_payment_id: number | null
  mp_status_detail: string | null
  pagado_en: string | null
  creado_por: string
  creado_en: string
  expira_en: string
  actualizado_en: string
}

/** Input para crear un intento al iniciar el cobro. */
export interface CrearIntentoCobroInput {
  comercio_id: string
  external_reference: string
  monto: number
  metodo: MetodoIntentoMP
  /** Default 10 minutos desde now() si no se pasa (manejado app-level). */
  expira_en: Date | string
  creado_por: string
  /** Si ya tenemos la respuesta de MP al crear, los llenamos en el
   *  mismo INSERT. Si no, después con actualizarIntentoCobro. */
  order_id_mp?: string
  qr_data?: string
  checkout_url?: string
}

/** Patch para actualizar un intento. Lo usa el webhook handler
 *  (estado, mp_payment_id, etc.) y el endpoint de cancelación
 *  (estado='cancelado'). */
export interface ActualizarIntentoCobroInput {
  estado?: EstadoIntentoMP
  mp_payment_id?: number | null
  mp_status_detail?: string | null
  pagado_en?: Date | string | null
  venta_id?: string | null
  order_id_mp?: string | null
  qr_data?: string | null
  checkout_url?: string | null
}

// ════════════════════════════════════════════════════════════════════
// Error helper
// ════════════════════════════════════════════════════════════════════

/** Convierte errores de Postgrest a Error con contexto útil — pero
 *  sin filtrar columnas sensibles. */
function pgError(op: string, err: PostgrestError): Error {
  // No incluir err.details ni err.hint porque a veces incluyen
  // el row completo (con token cifrado). code + message alcanza.
  return new Error(`[mp:${op}] ${err.code ?? 'pg_error'}: ${err.message}`)
}

// ════════════════════════════════════════════════════════════════════
// Credenciales
// ════════════════════════════════════════════════════════════════════

const CREDENCIALES_SELECT_PUBLIC =
  'comercio_id, expira_en, user_id_mp, public_key, store_id_mp, external_pos_id, conectado_en, conectado_por, actualizado_en'

const CREDENCIALES_SELECT_FULL =
  'comercio_id, access_token, refresh_token, expira_en, user_id_mp, public_key, store_id_mp, external_pos_id, conectado_en, conectado_por, actualizado_en'

function rawToDescifradas(raw: MPCredencialesRaw): MPCredencialesDescifradas {
  return {
    comercio_id: raw.comercio_id,
    access_token: decryptToken(raw.access_token),
    refresh_token: decryptToken(raw.refresh_token),
    expira_en: raw.expira_en,
    user_id_mp: raw.user_id_mp,
    public_key: raw.public_key,
    store_id_mp: raw.store_id_mp,
    external_pos_id: raw.external_pos_id,
    conectado_en: raw.conectado_en,
    conectado_por: raw.conectado_por,
    actualizado_en: raw.actualizado_en,
  }
}

/**
 * Guarda credenciales nuevas (típicamente desde el callback OAuth).
 * Cifra tokens antes del INSERT. UPSERT por comercio_id — si el
 * comercio ya tenía MP conectado, sobreescribe (reconexión).
 */
export async function guardarCredenciales(
  supabase: SupabaseClient,
  input: GuardarCredencialesInput,
): Promise<MPCredenciales> {
  const expiraIso =
    input.expira_en instanceof Date ? input.expira_en.toISOString() : input.expira_en

  const row = {
    comercio_id: input.comercio_id,
    access_token: encryptToken(input.access_token),
    refresh_token: encryptToken(input.refresh_token),
    expira_en: expiraIso,
    user_id_mp: input.user_id_mp,
    public_key: input.public_key,
    store_id_mp: input.store_id_mp,
    external_pos_id: input.external_pos_id,
    conectado_por: input.conectado_por,
  }

  const { data, error } = await supabase
    .from('mp_credenciales')
    .upsert(row, { onConflict: 'comercio_id' })
    .select(CREDENCIALES_SELECT_PUBLIC)
    .single()

  if (error) throw pgError('guardarCredenciales', error)
  return data as MPCredenciales
}

/**
 * Actualiza credenciales existentes. Típico use case: refresh del
 * access_token cuando está por expirar.
 */
export async function actualizarCredenciales(
  supabase: SupabaseClient,
  comercioId: string,
  patch: ActualizarCredencialesInput,
): Promise<MPCredenciales> {
  const update: Record<string, unknown> = {}
  if (patch.access_token !== undefined) update.access_token = encryptToken(patch.access_token)
  if (patch.refresh_token !== undefined) update.refresh_token = encryptToken(patch.refresh_token)
  if (patch.expira_en !== undefined) {
    update.expira_en =
      patch.expira_en instanceof Date ? patch.expira_en.toISOString() : patch.expira_en
  }
  if (patch.store_id_mp !== undefined) update.store_id_mp = patch.store_id_mp
  if (patch.external_pos_id !== undefined) update.external_pos_id = patch.external_pos_id
  if (patch.public_key !== undefined) update.public_key = patch.public_key

  if (Object.keys(update).length === 0) {
    throw new Error('[mp:actualizarCredenciales] patch vacío')
  }

  const { data, error } = await supabase
    .from('mp_credenciales')
    .update(update)
    .eq('comercio_id', comercioId)
    .select(CREDENCIALES_SELECT_PUBLIC)
    .single()

  if (error) throw pgError('actualizarCredenciales', error)
  return data as MPCredenciales
}

/**
 * Lee credenciales de UN comercio y devuelve los tokens descifrados.
 * Devuelve null si el comercio no tiene MP conectado.
 *
 * Este es el handler que usan los endpoints autenticados (cookie):
 * RLS exige rol='admin' y el comercio del caller — si la cookie
 * pertenece a otro comercio o a un encargado/cajero, devuelve null
 * (no fila).
 */
export async function obtenerCredencialesPorComercio(
  supabase: SupabaseClient,
  comercioId: string,
): Promise<MPCredencialesDescifradas | null> {
  const { data, error } = await supabase
    .from('mp_credenciales')
    .select(CREDENCIALES_SELECT_FULL)
    .eq('comercio_id', comercioId)
    .maybeSingle()

  if (error) throw pgError('obtenerCredencialesPorComercio', error)
  if (!data) return null
  return rawToDescifradas(data as MPCredencialesRaw)
}

/**
 * Lookup por user_id_mp — el campo que viene en el payload del
 * webhook MP. Routing key del webhook handler.
 *
 * IMPORTANTE: esta función se llama desde el webhook que NO tiene
 * cookie de usuario. La capa superior DEBE pasar el service client
 * (lib/supabase/server-admin → getServiceClient). Si se llama con
 * el client de cookies, RLS la va a rechazar (no hay usuario admin
 * "del comercio del webhook"). Sin cubrir esto, los webhooks fallan
 * con 401 silenciosos.
 */
export async function obtenerCredencialesPorUserIdMp(
  supabaseService: SupabaseClient,
  userIdMp: number,
): Promise<MPCredencialesDescifradas | null> {
  const { data, error } = await supabaseService
    .from('mp_credenciales')
    .select(CREDENCIALES_SELECT_FULL)
    .eq('user_id_mp', userIdMp)
    .maybeSingle()

  if (error) throw pgError('obtenerCredencialesPorUserIdMp', error)
  if (!data) return null
  return rawToDescifradas(data as MPCredencialesRaw)
}

/**
 * Lee solo la vista pública (sin tokens). Útil para mostrar en
 * UI "MP conectado desde ..." sin cargar/descifrar tokens al pedo.
 */
export async function obtenerCredencialesPublicasPorComercio(
  supabase: SupabaseClient,
  comercioId: string,
): Promise<MPCredenciales | null> {
  const { data, error } = await supabase
    .from('mp_credenciales')
    .select(CREDENCIALES_SELECT_PUBLIC)
    .eq('comercio_id', comercioId)
    .maybeSingle()

  if (error) throw pgError('obtenerCredencialesPublicasPorComercio', error)
  return (data as MPCredenciales | null) ?? null
}

/** Helper booleano para gates de UI / endpoints. */
export async function tieneMPConectado(
  supabase: SupabaseClient,
  comercioId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('mp_credenciales')
    .select('comercio_id', { count: 'exact', head: true })
    .eq('comercio_id', comercioId)

  if (error) throw pgError('tieneMPConectado', error)
  return (count ?? 0) > 0
}

/**
 * Desconectar MP. Borra el row de credenciales (RLS exige admin).
 * Los intentos_cobro_mp históricos del comercio quedan — son
 * auditoría. La FK comercio_id en intentos NO se rompe porque
 * apunta a comercios, no a mp_credenciales.
 *
 * Después de desconectar, el comercio puede volver a hacer OAuth.
 */
export async function desconectarMP(
  supabase: SupabaseClient,
  comercioId: string,
): Promise<void> {
  const { error } = await supabase
    .from('mp_credenciales')
    .delete()
    .eq('comercio_id', comercioId)

  if (error) throw pgError('desconectarMP', error)
}

// ════════════════════════════════════════════════════════════════════
// Intentos de cobro
// ════════════════════════════════════════════════════════════════════

const INTENTO_SELECT =
  'id, comercio_id, venta_id, external_reference, order_id_mp, qr_data, checkout_url, monto, metodo, estado, mp_payment_id, mp_status_detail, pagado_en, creado_por, creado_en, expira_en, actualizado_en'

/**
 * Crea un intento pendiente. La venta NO se persiste todavía — se
 * persiste cuando el intento llega a estado='aprobado'. Si el
 * intento se cancela o expira, no se gastó stock.
 */
export async function crearIntentoCobro(
  supabase: SupabaseClient,
  input: CrearIntentoCobroInput,
): Promise<IntentoCobroMP> {
  const expiraIso =
    input.expira_en instanceof Date ? input.expira_en.toISOString() : input.expira_en

  const row = {
    comercio_id: input.comercio_id,
    external_reference: input.external_reference,
    monto: input.monto,
    metodo: input.metodo,
    expira_en: expiraIso,
    creado_por: input.creado_por,
    order_id_mp: input.order_id_mp ?? null,
    qr_data: input.qr_data ?? null,
    checkout_url: input.checkout_url ?? null,
    // estado='pendiente' lo pone el DEFAULT del schema.
  }

  const { data, error } = await supabase
    .from('intentos_cobro_mp')
    .insert(row)
    .select(INTENTO_SELECT)
    .single()

  if (error) throw pgError('crearIntentoCobro', error)
  return data as IntentoCobroMP
}

export async function obtenerIntentoCobroPorId(
  supabase: SupabaseClient,
  id: string,
): Promise<IntentoCobroMP | null> {
  const { data, error } = await supabase
    .from('intentos_cobro_mp')
    .select(INTENTO_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw pgError('obtenerIntentoCobroPorId', error)
  return (data as IntentoCobroMP | null) ?? null
}

/**
 * Lookup por external_reference — el id que mandamos a MP y que
 * vuelve en el webhook. Es UNIQUE así que es 1:1.
 */
export async function obtenerIntentoCobroPorExternalReference(
  supabase: SupabaseClient,
  externalReference: string,
): Promise<IntentoCobroMP | null> {
  const { data, error } = await supabase
    .from('intentos_cobro_mp')
    .select(INTENTO_SELECT)
    .eq('external_reference', externalReference)
    .maybeSingle()

  if (error) throw pgError('obtenerIntentoCobroPorExternalReference', error)
  return (data as IntentoCobroMP | null) ?? null
}

/**
 * UPDATE genérico. Usado por:
 *  - Endpoint /api/mp/cobros/:id (PATCH cancel) → { estado:'cancelado' }.
 *  - Webhook handler → { estado:'aprobado'|'rechazado', mp_payment_id,
 *    mp_status_detail, pagado_en }.
 *  - Sweep de expirados → { estado:'expirado' }.
 *
 * El call site es responsable de chequear transiciones válidas — el
 * data layer no impone reglas de estado (intencional: el webhook a
 * veces llega fuera de orden, y un sweep podría correr en paralelo).
 */
export async function actualizarIntentoCobro(
  supabase: SupabaseClient,
  id: string,
  patch: ActualizarIntentoCobroInput,
): Promise<IntentoCobroMP> {
  const update: Record<string, unknown> = {}
  if (patch.estado !== undefined) update.estado = patch.estado
  if (patch.mp_payment_id !== undefined) update.mp_payment_id = patch.mp_payment_id
  if (patch.mp_status_detail !== undefined) update.mp_status_detail = patch.mp_status_detail
  if (patch.pagado_en !== undefined) {
    update.pagado_en =
      patch.pagado_en instanceof Date ? patch.pagado_en.toISOString() : patch.pagado_en
  }
  if (patch.venta_id !== undefined) update.venta_id = patch.venta_id
  if (patch.order_id_mp !== undefined) update.order_id_mp = patch.order_id_mp
  if (patch.qr_data !== undefined) update.qr_data = patch.qr_data
  if (patch.checkout_url !== undefined) update.checkout_url = patch.checkout_url

  if (Object.keys(update).length === 0) {
    throw new Error('[mp:actualizarIntentoCobro] patch vacío')
  }

  const { data, error } = await supabase
    .from('intentos_cobro_mp')
    .update(update)
    .eq('id', id)
    .select(INTENTO_SELECT)
    .single()

  if (error) throw pgError('actualizarIntentoCobro', error)
  return data as IntentoCobroMP
}

/**
 * Atajo semántico: marcar como aprobado tras webhook OK. Aplica el
 * patch completo en una sola RPC para garantizar consistencia
 * (estado/payment_id/pagado_en al mismo tiempo).
 */
export async function aprobarIntentoCobro(
  supabase: SupabaseClient,
  id: string,
  args: { mp_payment_id: number; mp_status_detail?: string | null; pagado_en?: Date | string },
): Promise<IntentoCobroMP> {
  return actualizarIntentoCobro(supabase, id, {
    estado: 'aprobado',
    mp_payment_id: args.mp_payment_id,
    mp_status_detail: args.mp_status_detail ?? null,
    pagado_en: args.pagado_en ?? new Date(),
  })
}

/**
 * Asocia la venta al intento aprobado. Se llama después de
 * crear_venta cuando el cobro se aprobó.
 */
export async function asociarVentaAIntento(
  supabase: SupabaseClient,
  intentoId: string,
  ventaId: string,
): Promise<IntentoCobroMP> {
  return actualizarIntentoCobro(supabase, intentoId, { venta_id: ventaId })
}

/**
 * Idempotente: si el intento ya está expirado/cancelado/aprobado/
 * rechazado, devuelve el row sin tocar. Si está pendiente y
 * expira_en < now, lo marca expirado.
 *
 * Pensada para el "lazy expiry" — se invoca en el GET /:id (polling)
 * para que el frontend reciba el estado correcto sin necesidad de
 * cron.
 */
export async function marcarExpiradoSiCorresponde(
  supabase: SupabaseClient,
  intento: IntentoCobroMP,
): Promise<IntentoCobroMP> {
  if (intento.estado !== 'pendiente') return intento
  if (new Date(intento.expira_en).getTime() > Date.now()) return intento

  const { data, error } = await supabase
    .from('intentos_cobro_mp')
    .update({ estado: 'expirado' })
    .eq('id', intento.id)
    .eq('estado', 'pendiente')   // protección contra race con webhook
    .select(INTENTO_SELECT)
    .maybeSingle()

  if (error) throw pgError('marcarExpiradoSiCorresponde', error)
  // Si maybeSingle devolvió null, hubo race — algún otro lo movió
  // a aprobado/cancelado entre nuestro chequeo y el UPDATE. Releemos.
  if (!data) {
    const fresco = await obtenerIntentoCobroPorId(supabase, intento.id)
    return fresco ?? intento
  }
  return data as IntentoCobroMP
}

/**
 * Resultado discriminado de cancelarIntentoCobro. La UI puede
 * distinguir el caso "ya no estaba cancelable" del éxito real.
 */
export type CancelarIntentoResult =
  | { ok: true; intento: IntentoCobroMP }
  | { ok: false; reason: 'not_found' | 'not_pending'; intento?: IntentoCobroMP }

/**
 * Cancela un intento pendiente. Atómico: UPDATE ... WHERE
 * estado='pendiente'. Si el intento ya fue aprobado/rechazado/
 * expirado entre la verificación de la UI y el UPDATE (race con
 * webhook o lazy expiry), el cambio NO se aplica y el resultado
 * marca 'not_pending'.
 */
export async function cancelarIntentoCobro(
  supabase: SupabaseClient,
  id: string,
): Promise<CancelarIntentoResult> {
  const { data, error } = await supabase
    .from('intentos_cobro_mp')
    .update({ estado: 'cancelado' })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select(INTENTO_SELECT)
    .maybeSingle()

  if (error) throw pgError('cancelarIntentoCobro', error)
  if (data) {
    return { ok: true, intento: data as IntentoCobroMP }
  }
  // Sin update — o no existe el id, o ya no estaba pendiente.
  // Releemos para devolver el estado actual al caller.
  const fresco = await obtenerIntentoCobroPorId(supabase, id)
  if (!fresco) return { ok: false, reason: 'not_found' }
  return { ok: false, reason: 'not_pending', intento: fresco }
}

/** Resultado discriminado de marcarIntentoRequiereRevision. */
export type RequiereRevisionResult =
  | { ok: true; intento: IntentoCobroMP }
  | { ok: false; reason: 'not_found' | 'not_in_aprobado'; intento?: IntentoCobroMP }

/**
 * Marca un intento APROBADO como requiere_revision. Atómico:
 * UPDATE ... WHERE estado='aprobado'.
 *
 * Solo se permite la transición desde 'aprobado' — el caso de uso es
 * "MP cobró al cliente y nos llegó el webhook OK, pero al disparar
 * crear_venta falló (stock cambió en paralelo, RPC error, etc.)".
 * Cualquier otro estado origen indica un bug del caller.
 *
 * El motivo se guarda en mp_status_detail. Lo trunca a 200 chars
 * para evitar que un stack trace gigante explote la columna.
 *
 * Estado TERMINAL en V1: no hay transición automática desde
 * requiere_revision. El admin lo resuelve fuera de la app (refund
 * desde dashboard MP + anulación manual del intento). Conciliación
 * automática queda para V1.5.
 */
export async function marcarIntentoRequiereRevision(
  supabase: SupabaseClient,
  id: string,
  motivo: string,
): Promise<RequiereRevisionResult> {
  const motivoSan = typeof motivo === 'string'
    ? motivo.slice(0, 200)
    : 'requiere_revision (motivo no provisto)'

  const { data, error } = await supabase
    .from('intentos_cobro_mp')
    .update({ estado: 'requiere_revision', mp_status_detail: motivoSan })
    .eq('id', id)
    .eq('estado', 'aprobado')
    .select(INTENTO_SELECT)
    .maybeSingle()

  if (error) throw pgError('marcarIntentoRequiereRevision', error)
  if (data) {
    return { ok: true, intento: data as IntentoCobroMP }
  }
  // No matchó — o no existe, o no estaba en 'aprobado'.
  const fresco = await obtenerIntentoCobroPorId(supabase, id)
  if (!fresco) return { ok: false, reason: 'not_found' }
  return { ok: false, reason: 'not_in_aprobado', intento: fresco }
}

/** Resultado discriminado de marcarPagoPostCancelacion. */
export type PagoPostCancelacionResult =
  | { ok: true; intento: IntentoCobroMP }
  | { ok: false; reason: 'not_found' | 'not_cancelado_ni_expirado'; intento?: IntentoCobroMP }

/**
 * Clase A de huérfanos: MP confirmó un pago sobre un intento que ya
 * estaba CANCELADO o EXPIRADO (el cliente pagó justo después de que
 * el cajero canceló, o después de que el QR venció).
 *
 * El dinero ENTRÓ a la cuenta MP del comerciante — no puede quedar
 * invisible. Transición atómica cancelado|expirado → requiere_revision
 * con motivo fijo 'pago_post_cancelacion' en mp_status_detail, y se
 * persisten mp_payment_id + pagado_en para trazabilidad con el
 * dashboard MP.
 *
 * Atómico: UPDATE ... WHERE estado IN ('cancelado','expirado'). Si
 * hubo race (otro proceso lo movió), devuelve el estado real sin
 * pisar nada — el caller decide (típicamente no-op idempotente).
 */
export async function marcarPagoPostCancelacion(
  supabase: SupabaseClient,
  id: string,
  args: { mp_payment_id: number | null; pagado_en?: Date | string | null },
): Promise<PagoPostCancelacionResult> {
  const pagadoIso = args.pagado_en instanceof Date
    ? args.pagado_en.toISOString()
    : (args.pagado_en ?? new Date().toISOString())

  const { data, error } = await supabase
    .from('intentos_cobro_mp')
    .update({
      estado: 'requiere_revision',
      mp_status_detail: 'pago_post_cancelacion',
      mp_payment_id: args.mp_payment_id,
      pagado_en: pagadoIso,
    })
    .eq('id', id)
    .in('estado', ['cancelado', 'expirado'])
    .select(INTENTO_SELECT)
    .maybeSingle()

  if (error) throw pgError('marcarPagoPostCancelacion', error)
  if (data) {
    return { ok: true, intento: data as IntentoCobroMP }
  }
  const fresco = await obtenerIntentoCobroPorId(supabase, id)
  if (!fresco) return { ok: false, reason: 'not_found' }
  return { ok: false, reason: 'not_cancelado_ni_expirado', intento: fresco }
}
