import type { UnidadVenta, Venta } from '@/types/database'

// Formato de peso argentino — sin decimales, con separador de miles "."
// Coincide con la versión que estaba duplicada en cada página.
export function formatPeso(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// Formato de stock por unidad de venta.
export function formatStock(actual: number, unidad: UnidadVenta | string = 'unidad'): string {
  if (unidad === 'kg') return `${actual.toFixed(2)} kg`
  if (unidad === 'litro') return `${actual} L`
  if (unidad === 'metro') return `${actual} m`
  return actual.toString()
}

// Margen porcentual de ganancia.
export function calcularMargen(costo: number, venta: number): number {
  if (!venta) return 0
  return Math.round((1 - costo / venta) * 100)
}

// Color hex según severidad de stock. Soporta unidades especiales (kg).
export function stockColor(actual: number, minimo: number, unidad: UnidadVenta | string = 'unidad'): string {
  if (actual === 0) return '#888898'
  if (unidad === 'kg') {
    if (actual <= 0.5) return '#ff4757'
    if (actual <= 2) return '#ffb800'
    return '#00c896'
  }
  if (actual <= minimo * 0.3) return '#ff4757'
  if (actual <= minimo) return '#ffb800'
  return '#00c896'
}

// Etiqueta corta en español según severidad.
export function stockLabel(actual: number, minimo: number, unidad: UnidadVenta | string = 'unidad'): string {
  if (actual === 0) return 'Sin stock'
  if (unidad === 'kg') {
    if (actual <= 0.5) return 'Crítico'
    if (actual <= 2) return 'Poco stock'
    return 'OK'
  }
  if (actual <= minimo * 0.3) return 'Crítico'
  if (actual <= minimo) return 'Stock bajo'
  return 'OK'
}

// Predicado: ¿el producto está bajo el umbral mínimo?
export function esStockBajo(actual: number, minimo: number): boolean {
  return actual <= minimo
}

// Predicado: ¿el producto está en zona crítica (30% del mínimo)?
export function esStockCritico(actual: number, minimo: number): boolean {
  return actual <= minimo * 0.3
}

/**
 * Texto + color semántico para una fecha de vencimiento de lote.
 * Devuelve string vacío cuando fecha es null/undefined.
 *
 * Reglas:
 * - rojo (--r): vencido, vence hoy, vence mañana
 * - amarillo (--w): vence en 2-7 días
 * - texto normal: vence en 8-30 días
 * - texto secundario: vence en más de 30 días (muestra la fecha)
 */
export function formatVencimiento(fecha: string | null | undefined): { texto: string; color: string } {
  if (!fecha) return { texto: '', color: 'var(--text2)' }

  // Parsear la fecha como medianoche LOCAL, no UTC. `new Date('2026-05-13')`
  // se interpreta como UTC midnight → en UTC-3 (AR) cae al 12/may local → bug
  // de -1 día. Construyendo con (year, month, day) la Date queda anclada al
  // huso local correctamente.
  const [y, m, d] = fecha.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return { texto: '', color: 'var(--text2)' }
  const venc = new Date(y, m - 1, d)

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const msPorDia = 24 * 60 * 60 * 1000
  const diasDif = Math.round((venc.getTime() - hoy.getTime()) / msPorDia)

  if (diasDif < -1) return { texto: `Vencido hace ${Math.abs(diasDif)} días`, color: 'var(--r)' }
  if (diasDif === -1) return { texto: 'Vencido ayer', color: 'var(--r)' }
  if (diasDif === 0) return { texto: 'Vence hoy', color: 'var(--r)' }
  if (diasDif === 1) return { texto: 'Vence mañana', color: 'var(--r)' }
  if (diasDif <= 7) return { texto: `Vence en ${diasDif} días`, color: 'var(--w)' }
  if (diasDif <= 30) return { texto: `Vence en ${diasDif} días`, color: 'var(--text)' }
  return { texto: `Vence: ${venc.toLocaleDateString('es-AR')}`, color: 'var(--text2)' }
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Labels canónicos para método de pago. La DB guarda valores en lowercase
// (efectivo, mercadopago, etc.) pero en UI/ticket queremos versión legible.
export const METODO_PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  mercadopago: 'Mercado Pago',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  qr: 'QR',
}

export function labelMetodoPago(metodo: string): string {
  return METODO_PAGO_LABEL[metodo?.toLowerCase()] ?? metodo
}

/**
 * Formatea una fecha de venta como "lunes 11 de mayo · 01:14 hs"
 * — pensado para ticket impreso y texto compartido. 24h, sin coma.
 */
export function formatFechaTicket(iso: string): string {
  const d = new Date(iso)
  const fecha = d.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const hora = d.toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return `${fecha} · ${hora} hs`
}

/**
 * Genera el texto plano del ticket para compartir vía WhatsApp/email
 * o copiar al clipboard. Formato pensado para ser legible en mobile,
 * con jerarquía clara: brand → ticket → items → total → método → footer.
 */
export function formatTicketText(venta: Venta): string {
  const items = (venta.items_venta || []).map(i => {
    const qty = i.peso_kg ? `${i.peso_kg} kg` : `${i.cantidad} ×`
    return `• ${qty} ${i.nombre_producto} — ${formatPeso(i.subtotal)}`
  }).join('\n')

  const ticketN = String(venta.numero_ticket).padStart(4, '0')

  const lines: string[] = [
    `SYLVORA · Ticket #${ticketN}`,
    formatFechaTicket(venta.created_at),
    '',
    items || '(sin detalle de items)',
    '',
  ]

  // Mostrar subtotal solo si hay ajustes (descuento/recargo); si no, ruido.
  const hayAjustes = venta.descuento_porcentaje > 0 || venta.recargo_porcentaje > 0
  if (hayAjustes) {
    lines.push(`Subtotal: ${formatPeso(venta.subtotal)}`)
    if (venta.descuento_porcentaje > 0) {
      lines.push(`Descuento -${venta.descuento_porcentaje}%: -${formatPeso(venta.descuento_monto)}`)
    }
    if (venta.recargo_porcentaje > 0) {
      lines.push(`Recargo +${venta.recargo_porcentaje}%: +${formatPeso(venta.recargo_monto)}`)
    }
  }
  lines.push(`TOTAL: ${formatPeso(venta.total)}`)
  lines.push(`Método: ${labelMetodoPago(venta.metodo_pago)}`)

  if (venta.estado === 'anulada') {
    lines.push('')
    lines.push('** VENTA ANULADA **')
  }
  lines.push('')
  lines.push('Gracias por tu compra.')
  return lines.join('\n')
}

/**
 * Intenta compartir texto vía Web Share API; si no está disponible
 * (desktop, browsers viejos), cae a clipboard. Retorna el resultado
 * para que el caller pueda dar feedback adecuado.
 */
export async function shareOrCopy(
  text: string,
  title: string,
): Promise<'shared' | 'copied' | 'cancelled' | 'error'> {
  if (typeof navigator === 'undefined') return 'error'

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e: unknown) {
      // El user canceló el sheet → no es error real.
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // Otros errores → fall through a clipboard.
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
    return 'error'
  } catch {
    return 'error'
  }
}
