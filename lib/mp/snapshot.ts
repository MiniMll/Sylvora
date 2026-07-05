// Snapshot del carrito para intentos de cobro MP.
//
// Épica requiere_revision — Commit 3. Cuando se crea un cobro MP,
// el POS congela acá TODO lo necesario para reconstruir la venta
// después, sin depender del carrito (que muere con la sesión del
// navegador). Es la pieza que habilita la acción "registrar venta"
// de la cola de revisión: si MP cobró pero crear_venta falló, el
// admin puede recrear la venta días después con los items exactos.
//
// Formato versionado (version: 1). Si en el futuro cambia la shape,
// se incrementa y el consumidor discrimina.
//
// PURO: sin env, sin Supabase, sin node APIs. Importable desde el
// cliente (POSPayment arma el snapshot) y desde el server (el
// endpoint lo sanitiza). Los tipos son la única fuente compartida.
//
// Seguridad: el server NUNCA confía en el snapshot del cliente tal
// cual — sanitizarSnapshotVenta() valida shape, tipos, límites y
// consistencia aritmética antes de persistir. Un snapshot inválido
// NO bloquea el cobro (se guarda NULL + warn): el dinero importa
// más que el snapshot, y la cola ofrece resolución sin snapshot.

// ════════════════════════════════════════════════════════════════════
// Tipos
// ════════════════════════════════════════════════════════════════════

export interface SnapshotItemMP {
  /** Puede ser null si el producto fue borrado / item manual. */
  producto_id: string | null
  nombre_producto: string
  precio_unitario: number
  cantidad: number
  subtotal: number
  /** Solo productos por peso. */
  peso_kg?: number
}

export interface SnapshotVentaMP {
  version: 1
  subtotal: number
  descuento_porcentaje: number
  descuento_monto: number
  recargo_porcentaje: number
  recargo_monto: number
  total: number
  items: SnapshotItemMP[]
}

export type SanitizarSnapshotResult =
  | { ok: true; snapshot: SnapshotVentaMP }
  | { ok: false; motivo: string }

// ════════════════════════════════════════════════════════════════════
// Límites defensivos
// ════════════════════════════════════════════════════════════════════

const MAX_ITEMS = 200
const MAX_NOMBRE_LEN = 200
const MAX_MONTO = 1_000_000_000
/** Tolerancia para comparaciones de montos (redondeos float). */
const EPSILON = 0.01

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function num(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return v
}

function numEnRango(v: unknown, min: number, max: number): number | null {
  const n = num(v)
  if (n === null || n < min || n > max) return null
  return n
}

// ════════════════════════════════════════════════════════════════════
// Sanitizador server-side
// ════════════════════════════════════════════════════════════════════

/**
 * Valida y normaliza un snapshot recibido del cliente. Devuelve una
 * copia limpia (sin keys desconocidas, strings truncadas, números
 * verificados) o un motivo de rechazo.
 *
 * Checks:
 *   - Shape y tipos de todos los campos.
 *   - 1..200 items; nombres no vacíos truncados a 200 chars.
 *   - producto_id: UUID válido o null (nada de strings arbitrarios).
 *   - Montos finitos, no negativos, con techo defensivo.
 *   - Consistencia aritmética: SUM(items.subtotal) ≈ subtotal y
 *     subtotal - descuento + recargo ≈ total (tolerancia 1 centavo).
 *   - total ≈ montoEsperado (lo que realmente se le cobra a MP) —
 *     un mismatch indica bug del POS o manipulación del payload.
 */
export function sanitizarSnapshotVenta(
  raw: unknown,
  montoEsperado: number,
): SanitizarSnapshotResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, motivo: 'snapshot_no_es_objeto' }
  }
  const o = raw as Record<string, unknown>

  if (o.version !== 1) {
    return { ok: false, motivo: `version_desconocida:${String(o.version)}` }
  }

  const subtotal = numEnRango(o.subtotal, 0, MAX_MONTO)
  const descuentoPct = numEnRango(o.descuento_porcentaje, 0, 100)
  const descuentoMonto = numEnRango(o.descuento_monto, 0, MAX_MONTO)
  const recargoPct = numEnRango(o.recargo_porcentaje, 0, 1000)
  const recargoMonto = numEnRango(o.recargo_monto, 0, MAX_MONTO)
  const total = numEnRango(o.total, 0, MAX_MONTO)

  if (subtotal === null || descuentoPct === null || descuentoMonto === null ||
      recargoPct === null || recargoMonto === null || total === null) {
    return { ok: false, motivo: 'montos_invalidos' }
  }

  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > MAX_ITEMS) {
    return { ok: false, motivo: `items_invalidos:${Array.isArray(o.items) ? o.items.length : 'no_array'}` }
  }

  const items: SnapshotItemMP[] = []
  for (const rawItem of o.items) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      return { ok: false, motivo: 'item_no_es_objeto' }
    }
    const it = rawItem as Record<string, unknown>

    const productoId =
      it.producto_id === null || it.producto_id === undefined
        ? null
        : typeof it.producto_id === 'string' && UUID_RE.test(it.producto_id)
          ? it.producto_id
          : undefined
    if (productoId === undefined) {
      return { ok: false, motivo: 'producto_id_invalido' }
    }

    const nombre = typeof it.nombre_producto === 'string' ? it.nombre_producto.trim() : ''
    if (!nombre) {
      return { ok: false, motivo: 'nombre_producto_vacio' }
    }

    const precio = numEnRango(it.precio_unitario, 0, MAX_MONTO)
    const cantidad = numEnRango(it.cantidad, 0, 1_000_000)
    const itemSubtotal = numEnRango(it.subtotal, 0, MAX_MONTO)
    if (precio === null || cantidad === null || cantidad <= 0 || itemSubtotal === null) {
      return { ok: false, motivo: 'item_montos_invalidos' }
    }

    const pesoKg = it.peso_kg === undefined || it.peso_kg === null
      ? undefined
      : numEnRango(it.peso_kg, 0, 100_000) ?? undefined
    // peso_kg inválido no rechaza el snapshot — se omite (dato
    // informativo, no crítico para recrear la venta).

    items.push({
      producto_id: productoId,
      nombre_producto: nombre.slice(0, MAX_NOMBRE_LEN),
      precio_unitario: precio,
      cantidad,
      subtotal: itemSubtotal,
      ...(pesoKg !== undefined ? { peso_kg: pesoKg } : {}),
    })
  }

  // Consistencia aritmética.
  const sumaItems = items.reduce((s, i) => s + i.subtotal, 0)
  if (Math.abs(sumaItems - subtotal) > EPSILON) {
    return { ok: false, motivo: `subtotal_inconsistente:items=${sumaItems.toFixed(2)},declarado=${subtotal.toFixed(2)}` }
  }
  const totalCalculado = subtotal - descuentoMonto + recargoMonto
  if (Math.abs(totalCalculado - total) > EPSILON) {
    return { ok: false, motivo: `total_inconsistente:calculado=${totalCalculado.toFixed(2)},declarado=${total.toFixed(2)}` }
  }
  if (Math.abs(total - montoEsperado) > EPSILON) {
    return { ok: false, motivo: `total_no_coincide_con_monto:total=${total.toFixed(2)},monto=${montoEsperado.toFixed(2)}` }
  }

  return {
    ok: true,
    snapshot: {
      version: 1,
      subtotal,
      descuento_porcentaje: descuentoPct,
      descuento_monto: descuentoMonto,
      recargo_porcentaje: recargoPct,
      recargo_monto: recargoMonto,
      total,
      items,
    },
  }
}
