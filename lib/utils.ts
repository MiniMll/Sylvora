import type { UnidadVenta } from '@/types/database'

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
