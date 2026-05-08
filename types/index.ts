export type MetodoPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mercadopago'

export interface Producto {
  id: string
  nombre: string
  codigo_barras?: string
  sku?: string
  categoria: string
  icono: string
  precio_costo: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  lote?: string
  vence?: string
}

export interface ItemTicket {
  producto_id: string
  nombre: string
  precio_unitario: number
  cantidad: number
  subtotal: number
  codigo_barras?: string
}