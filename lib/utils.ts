export function formatPeso(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function calcularMargen(costo: number, venta: number): number {
  if (!venta) return 0
  return Math.round((1 - costo / venta) * 100)
}

export function colorStock(actual: number, minimo: number) {
  if (actual <= minimo * 0.3) return 'danger'
  if (actual <= minimo) return 'warning'
  return 'success'
}

export function labelStock(actual: number, minimo: number): string {
  const c = colorStock(actual, minimo)
  if (c === 'danger') return 'Crítico'
  if (c === 'warning') return 'Stock bajo'
  return 'OK'
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}