import { getBrowserClient, getComercioId } from './_base'
import type { Venta } from '@/types/database'

interface ItemVentaInput {
  producto_id: string
  nombre_producto: string
  precio_unitario: number
  cantidad: number
  subtotal: number
  peso_kg?: number
}

interface VentaInput {
  subtotal: number
  descuento_porcentaje: number
  descuento_monto: number
  recargo_porcentaje: number
  recargo_monto: number
  total: number
  metodo_pago: string
  items: ItemVentaInput[]
}

/** Resultado descriptivo cuando la venta no se puede registrar
 *  porque algún ítem no tiene stock suficiente. Lo devuelve la
 *  RPC server-side descontar_stock_validado vía DETAIL en JSON
 *  (ver scripts/migration-stock-validado.sql). El frontend del POS
 *  hace toast humano con el nombre del producto + cantidad
 *  disponible vs pedida; el ticket NO se limpia para que el cajero
 *  ajuste y reintente. */
export interface StockInsuficienteError {
  error: 'stock_insuficiente'
  producto_id: string
  nombre: string
  disponible: number
  pedido: number
}

/** Resultado descriptivo cuando la venta no se puede registrar porque
 *  hay drift entre productos.stock_actual y SUM(lotes) — la RPC
 *  intentó descontar de lotes FIFO pero no había suficiente cantidad
 *  para cubrir el pedido. Es el assert server-side disparándose:
 *  indica que un UPDATE directo o un bug rompió el invariante.
 *  El cajero no puede hacer nada salvo escalar al administrador
 *  (que tiene que correr el script de audit y reconciliar). */
export interface DriftLotesError {
  error: 'drift_lotes'
}

export type GuardarVentaResult =
  | Venta
  | StockInsuficienteError
  | DriftLotesError
  | null

/** Type guard para discriminar el caso "stock insuficiente" del
 *  caso éxito o error genérico. */
export function esErrorStockInsuficiente(
  r: GuardarVentaResult,
): r is StockInsuficienteError {
  return !!r && typeof r === 'object' && 'error' in r && r.error === 'stock_insuficiente'
}

/** Type guard para "drift de lotes detectado". Diferente del
 *  stock_insuficiente: este indica inconsistencia DB, no que el
 *  carrito haya excedido el stock real. */
export function esErrorDriftLotes(
  r: GuardarVentaResult,
): r is DriftLotesError {
  return !!r && typeof r === 'object' && 'error' in r && r.error === 'drift_lotes'
}

// Cuántas veces reintentar el INSERT de venta si choca contra la
// unique constraint (comercio_id, numero_ticket). Caso esperado:
// dos cajeros del mismo comercio cobran al mismo tiempo, el trigger
// les asigna el mismo MAX+1, la unique constraint detecta el choque
// en el segundo INSERT y devuelve 23505. El retry vuelve a ejecutar
// el trigger, que ahora ve la primera venta ya commiteada y asigna
// MAX+2. Tres intentos cubren con margen un escenario de 2-3 cajas
// concurrentes — más que eso ya pediría advisory locks o sequence
// per-comercio.
const MAX_REINTENTOS_NUMERO_TICKET = 3

/** Cantidad real a descontar/restituir del stock para un ítem.
 *  Productos por peso (kg/L/m) tienen `peso_kg` con el valor real
 *  pesado/medido; el resto usa `cantidad` (unidades).
 *
 *  Nota: desde el sprint fix/stock-lotes-integrity-v1, las RPCs
 *  descontar_stock_validado y restituir_stock son LOTES-AWARE:
 *  para productos con lotes hacen FIFO + sincronizan SUM(lotes)
 *  con stock_actual atómicamente. Productos sin lotes (modo legacy)
 *  siguen funcionando como antes. Este código cliente no necesita
 *  saber del modo — la RPC decide internamente. */
function cantidadParaStock(i: ItemVentaInput): number {
  return (i.peso_kg !== undefined && i.peso_kg !== null)
    ? Number(i.peso_kg)
    : Number(i.cantidad)
}

/** Restituye stock de TODOS los items en paralelo. Se usa como
 *  compensación cuando el descuento ya pasó pero el insert posterior
 *  (venta o items_venta) falla. Best-effort: si alguna restitución
 *  falla, logueamos pero no propagamos — peor escenario es stock
 *  que quedó descontado y dueño ajusta a mano. Sin esto el bug
 *  "stock fantasma" reaparece por un canal distinto. */
async function compensarRestituirStock(
  supabase: ReturnType<typeof getBrowserClient>,
  items: ItemVentaInput[],
): Promise<void> {
  await Promise.all(items.map(async item => {
    const { error } = await supabase.rpc('restituir_stock', {
      p_producto_id: item.producto_id,
      p_cantidad: cantidadParaStock(item),
    })
    if (error) {
      console.error('[guardarVenta] compensación restituir_stock falló', {
        producto_id: item.producto_id, error,
      })
    }
  }))
}

export async function guardarVenta(venta: VentaInput): Promise<GuardarVentaResult> {
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return null

  // ──────────────────────────────────────────────────────────────────
  // PASO 1 — Validar y descontar stock atómicamente.
  // RPC descontar_stock_validado: lock pesimista FOR UPDATE + check
  // de stock_actual >= cantidad + descuento, todo en una transacción.
  // Si algún ítem no alcanza → RAISE EXCEPTION 'stock_insuficiente'
  // con DETAIL en JSON. Postgres hace rollback automático del lock.
  // Ningún stock se modifica si ALGÚN ítem falla.
  // ──────────────────────────────────────────────────────────────────
  const itemsParaRpc = venta.items.map(i => ({
    producto_id: i.producto_id,
    cantidad: cantidadParaStock(i),
  }))

  const { error: stockError } = await supabase.rpc('descontar_stock_validado', {
    p_items: itemsParaRpc,
  })

  if (stockError) {
    // Caso esperado: stock_insuficiente con DETAIL parseable.
    if (stockError.message === 'stock_insuficiente' && stockError.details) {
      try {
        const detail = JSON.parse(stockError.details) as {
          producto_id: string
          nombre: string
          disponible: number | string
          pedido: number | string
        }
        return {
          error: 'stock_insuficiente',
          producto_id: detail.producto_id,
          nombre: detail.nombre,
          disponible: Number(detail.disponible),
          pedido: Number(detail.pedido),
        }
      } catch (e) {
        // DETAIL malformado — fallback a error genérico.
        console.error('[guardarVenta] error.details no parseable', e, stockError)
      }
    }
    // drift_lotes: el assert server-side detectó que SUM(lotes) <
    // stock_actual al intentar descontar FIFO. Indica drift de datos
    // (alguien rompió el invariante con un UPDATE directo). El cajero
    // no puede resolverlo — escalar al administrador para correr el
    // audit + reconciliación. PostgREST surface el message con el
    // formato 'drift_lotes: ...' por la RAISE EXCEPTION format() de
    // la RPC; matcheamos startsWith.
    if (stockError.message?.startsWith('drift_lotes')) {
      console.error('[guardarVenta] drift_lotes detectado por la RPC:', stockError.message)
      return { error: 'drift_lotes' }
    }
    // Cualquier otro error de la RPC (cantidad_invalida,
    // producto_no_encontrado, red, etc.) → null genérico.
    console.error('[guardarVenta] descontar_stock_validado falló', stockError)
    return null
  }

  // ──────────────────────────────────────────────────────────────────
  // PASO 2 — Insert de la venta con retry de numero_ticket.
  // Si falla definitivamente → COMPENSAR (restituir stock).
  // ──────────────────────────────────────────────────────────────────
  let ventaData: Venta | null = null
  for (let intento = 0; intento < MAX_REINTENTOS_NUMERO_TICKET; intento++) {
    const { data, error } = await supabase
      .from('ventas')
      .insert({
        comercio_id: comercioId,
        subtotal: venta.subtotal,
        descuento_porcentaje: venta.descuento_porcentaje,
        descuento_monto: venta.descuento_monto,
        recargo_porcentaje: venta.recargo_porcentaje,
        recargo_monto: venta.recargo_monto,
        total: venta.total,
        metodo_pago: venta.metodo_pago,
        estado: 'completada',
      })
      .select()
      .single()

    if (!error && data) {
      ventaData = data as Venta
      break
    }

    // 23505 = unique_violation. Solo reintentamos si el conflicto es
    // específicamente sobre numero_ticket; cualquier otra unique
    // violation indica bug y debe fallar visible.
    const esColisionNumeroTicket =
      error?.code === '23505' &&
      /numero_ticket/i.test(error.message ?? '')

    if (!esColisionNumeroTicket) {
      console.error(error)
      await compensarRestituirStock(supabase, venta.items)
      return null
    }

    // Jitter chico para reducir probabilidad de re-colisión inmediata
    // con otra sesión que esté en el mismo retry-loop.
    await new Promise(r => setTimeout(r, 30 + Math.random() * 70))
  }

  if (!ventaData) {
    console.error('[guardarVenta] No se pudo asignar numero_ticket tras', MAX_REINTENTOS_NUMERO_TICKET, 'intentos')
    await compensarRestituirStock(supabase, venta.items)
    return null
  }

  // ──────────────────────────────────────────────────────────────────
  // PASO 3 — Insert de items_venta. Si falla → COMPENSAR (restituir
  // stock + borrar la venta huérfana que ya tiene numero_ticket).
  // ──────────────────────────────────────────────────────────────────
  const itemsConPeso = venta.items.map(i => ({
    venta_id: ventaData.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre_producto,
    precio_unitario: i.precio_unitario,
    cantidad: i.cantidad,
    subtotal: i.subtotal,
    peso_kg: i.peso_kg ?? null,
  }))

  // Variante sin peso_kg para el fallback legacy (schema viejo sin la
  // columna). La armamos siempre — es barato — y solo se usa si el
  // primer insert falla por columna inexistente.
  const itemsSinPeso = venta.items.map(i => ({
    venta_id: ventaData.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre_producto,
    precio_unitario: i.precio_unitario,
    cantidad: i.cantidad,
    subtotal: i.subtotal,
  }))

  let itemsError: { message?: string } | null = null
  const r1 = await supabase.from('items_venta').insert(itemsConPeso)
  if (r1.error) {
    itemsError = r1.error
    if (/peso_kg/i.test(r1.error.message ?? '')) {
      const r2 = await supabase.from('items_venta').insert(itemsSinPeso)
      itemsError = r2.error
    }
  }

  if (itemsError) {
    console.error('[guardarVenta] insert items_venta falló', itemsError)
    await compensarRestituirStock(supabase, venta.items)
    // Borrar la venta huérfana para no dejar tickets sin items.
    // Si el delete también falla, la venta queda en DB sin items —
    // el dueño la puede ver y anular manualmente.
    await supabase.from('ventas').delete().eq('id', ventaData.id)
    return null
  }

  return ventaData
}

interface GetVentasOpts {
  /** Fecha mínima inclusiva (created_at >=). Por defecto: sin filtro. */
  desde?: Date
  /** Fecha máxima inclusiva (created_at <=). Por defecto: sin filtro. */
  hasta?: Date
  /** Límite de filas. Sin valor: trae todas las ventas del comercio.
   *  Los call sites de exportación SIEMPRE pasan un cap para no
   *  descargar decenas de miles de filas al browser. */
  limit?: number
  /** Si false, NO joina items_venta(*) — el join más pesado, ya que
   *  arrastra todas las líneas de cada venta. Default true para no
   *  romper call sites que sí los necesitan (historial /ventas, anular).
   *  Los exports de ventas no usan items → pasan false. */
  conItems?: boolean
}

/**
 * Devuelve ventas del comercio, con o sin items_venta según opts.
 * Sin args trae todas las ventas con items (comportamiento histórico).
 */
export async function getVentas(opts: GetVentasOpts = {}): Promise<Venta[]> {
  const comercioId = await getComercioId()
  if (!comercioId) return []
  return getVentasCon(getBrowserClient(), comercioId, opts)
}

/** Core de getVentas con client + comercioId inyectables — mismo patrón
 *  que anularVentaCon. Los smokes testean el armado de la query acá; la
 *  app usa el wrapper de arriba. */
export async function getVentasCon(
  supabase: ReturnType<typeof getBrowserClient>,
  comercioId: string,
  opts: GetVentasOpts = {},
): Promise<Venta[]> {
  const conItems = opts.conItems !== false
  const columns = conItems ? '*, items_venta(*)' : '*'

  let query = supabase
    .from('ventas')
    .select(columns)
    .eq('comercio_id', comercioId)
    .order('created_at', { ascending: false })

  if (opts.desde) query = query.gte('created_at', opts.desde.toISOString())
  if (opts.hasta) query = query.lte('created_at', opts.hasta.toISOString())
  if (opts.limit) query = query.limit(opts.limit)

  const { data, error } = await query
  if (error) {
    console.error(error)
    return []
  }
  // Cast vía unknown: el select con string dinámico (por conItems)
  // pierde el tipado literal del parser de Supabase. El shape en runtime
  // es correcto — Venta con o sin items_venta según la columna pedida.
  return (data ?? []) as unknown as Venta[]
}

interface AnularVentaResult {
  ok: boolean
  /** Mensaje user-friendly si falló. */
  error?: string
}

/**
 * Marca una venta como anulada y restituye el stock de sus items.
 *
 * TODO: mover a RPC transaccional única para evitar estado anulada sin
 * restitución de stock ante cortes de red. Hoy el UPDATE de `estado` y
 * los `restituir_stock` viajan en queries separadas; si el cliente
 * pierde red entre ambas, la venta queda como 'anulada' pero el stock
 * no se devuelve.
 *
 * Guardas implementadas:
 *  - Sin doble anulación: el UPDATE filtra por `estado = 'completada'`
 *    (optimistic concurrency). Si dos sesiones intentan anular la misma
 *    venta al mismo tiempo, sólo una efectivamente cambia la row; la
 *    segunda recibe `data: null` y retorna error claro.
 *  - Stock restituido vía RPC atómica `restituir_stock`.
 *  - Para items con peso_kg (productos por peso) restituye el peso
 *    real. Para items legacy sin peso_kg (anteriores a la migración),
 *    restituye por `cantidad` — sub-óptimo en ese caso, documentado.
 *
 * Requiere correr ambas migraciones SQL:
 *   - supabase-rpc-restituir-stock.sql
 *   - supabase-migracion-items-venta-peso.sql (idealmente)
 */
export async function anularVenta(venta: Venta): Promise<AnularVentaResult> {
  return anularVentaCon(getBrowserClient(), venta)
}

/** Core de anularVenta con client inyectable — mismo patrón que
 *  lib/supabase/mp.ts. Los smokes lo testean con mock; la app usa
 *  el wrapper de arriba. */
export async function anularVentaCon(
  supabase: ReturnType<typeof getBrowserClient>,
  venta: Venta,
): Promise<AnularVentaResult> {
  if (venta.estado === 'anulada') {
    return { ok: false, error: 'Esta venta ya está anulada' }
  }

  // Ventas cobradas por Mercado Pago: el dinero YA entró a la cuenta
  // MP del comerciante y Sylvora no ejecuta devoluciones (V1). El
  // flag reembolso_mp_pendiente viaja en el MISMO update de anulación
  // — atómico: no puede quedar anulada sin la marca.
  const esMP = venta.metodo_pago === 'mercadopago'
  const patch: Record<string, unknown> = { estado: 'anulada' }
  if (esMP) patch.reembolso_mp_pendiente = true

  // Marcar anulada con guarda atómica de doble click / doble sesión.
  let { data, error } = await supabase
    .from('ventas')
    .update(patch)
    .eq('id', venta.id)
    .eq('estado', 'completada')
    .select()
    .maybeSingle()

  // Backward-compat con DBs sin migration-ventas-reembolso-mp.sql:
  // si la columna no existe, reintentar sin el flag (mismo patrón que
  // cerrarCaja). La anulación no se bloquea por la marca.
  if (error && esMP && /reembolso_mp_pendiente/i.test(error.message || '')) {
    console.warn('[anularVenta] columna reembolso_mp_pendiente ausente — correr migration-ventas-reembolso-mp.sql')
    const retry = await supabase
      .from('ventas')
      .update({ estado: 'anulada' })
      .eq('id', venta.id)
      .eq('estado', 'completada')
      .select()
      .maybeSingle()
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error(error)
    return { ok: false, error: 'No se pudo anular la venta' }
  }
  if (!data) {
    // El UPDATE no afectó filas — venta ya estaba anulada en DB
    // (otro cajero la anuló desde otra pestaña).
    return { ok: false, error: 'Esta venta ya está anulada' }
  }

  // Restituir stock. Fallback legacy: si peso_kg no está, usar cantidad.
  if (venta.items_venta?.length) {
    await Promise.all(venta.items_venta.map(item => {
      const aRestituir = (item.peso_kg !== undefined && item.peso_kg !== null)
        ? Number(item.peso_kg)
        : Number(item.cantidad)
      return supabase.rpc('restituir_stock', {
        p_producto_id: item.producto_id,
        p_cantidad: aRestituir,
      })
    }))
  }

  return { ok: true }
}

/**
 * Marca como ejecutado el reembolso manual de una venta MP anulada.
 * El comerciante lo confirma DESPUÉS de hacer la devolución desde el
 * panel de Mercado Pago — Sylvora no devuelve dinero (V1).
 *
 * Atómico: UPDATE ... WHERE estado='anulada' AND
 * reembolso_mp_pendiente=true. Si la venta no está en ese estado
 * exacto (ya confirmado desde otra pestaña, o no era una anulación
 * MP), devuelve false sin tocar nada.
 *
 * Permiso: mismo gate que anular (venta.anular — admin/encargado);
 * la UI lo aplica y la RLS de UPDATE de ventas contiene.
 */
export async function marcarReembolsoMPHecho(ventaId: string): Promise<boolean> {
  const comercioId = await getComercioId()
  if (!comercioId) return false
  return marcarReembolsoMPHechoCon(getBrowserClient(), comercioId, ventaId)
}

/** Core con client inyectable — ver anularVentaCon. */
export async function marcarReembolsoMPHechoCon(
  supabase: ReturnType<typeof getBrowserClient>,
  comercioId: string,
  ventaId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ventas')
    .update({ reembolso_mp_pendiente: false })
    .eq('id', ventaId)
    .eq('comercio_id', comercioId)
    .eq('estado', 'anulada')
    .eq('reembolso_mp_pendiente', true)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[marcarReembolsoMPHecho]', error.code, '-', error.message)
    return false
  }
  return data !== null
}

/**
 * Busca una venta por número de ticket dentro del comercio actual.
 * Usado por la cola de revisión MP ("asociar a venta existente"):
 * el admin tipea el número del ticket y confirmamos el match antes
 * de asociar. Devuelve null si no existe.
 */
export async function buscarVentaPorTicket(
  numeroTicket: number,
): Promise<Pick<Venta, 'id' | 'numero_ticket' | 'total' | 'metodo_pago' | 'estado' | 'created_at'> | null> {
  if (!Number.isInteger(numeroTicket) || numeroTicket <= 0) return null
  const supabase = getBrowserClient()
  const comercioId = await getComercioId()
  if (!comercioId) return null

  const { data, error } = await supabase
    .from('ventas')
    .select('id, numero_ticket, total, metodo_pago, estado, created_at')
    .eq('comercio_id', comercioId)
    .eq('numero_ticket', numeroTicket)
    .maybeSingle()

  if (error) {
    console.error('[buscarVentaPorTicket]', error.code, '-', error.message)
    return null
  }
  return data as Pick<Venta, 'id' | 'numero_ticket' | 'total' | 'metodo_pago' | 'estado' | 'created_at'> | null
}
