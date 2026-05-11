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

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Genera el texto plano del ticket para compartir vía WhatsApp/email
 * o copiar al clipboard. Formato pensado para ser legible en mobile.
 */
export function formatTicketText(venta: Venta): string {
  const fecha = new Date(venta.created_at).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })
  const items = (venta.items_venta || []).map(i => {
    const qty = i.peso_kg ? `${i.peso_kg} kg` : `${i.cantidad} ×`
    return `${qty}  ${i.nombre_producto}  —  ${formatPeso(i.subtotal)}`
  }).join('\n')

  const lines: string[] = [
    `Ticket #${String(venta.numero_ticket).padStart(4, '0')}`,
    fecha,
    '',
    items || '(sin detalle de items)',
    '',
    `Subtotal: ${formatPeso(venta.subtotal)}`,
  ]
  if (venta.descuento_porcentaje > 0) {
    lines.push(`Descuento -${venta.descuento_porcentaje}%: -${formatPeso(venta.descuento_monto)}`)
  }
  if (venta.recargo_porcentaje > 0) {
    lines.push(`Recargo +${venta.recargo_porcentaje}%: +${formatPeso(venta.recargo_monto)}`)
  }
  lines.push(`TOTAL: ${formatPeso(venta.total)}`)
  lines.push('')
  lines.push(`Método: ${venta.metodo_pago}`)
  if (venta.estado === 'anulada') {
    lines.push('')
    lines.push('** VENTA ANULADA **')
  }
  lines.push('')
  lines.push('— Sylvora')
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
