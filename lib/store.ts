import { create } from 'zustand'
import type { MetodoPago } from '@/types'

interface POSItem {
  producto_id: string
  nombre: string
  precio_unitario: number
  cantidad: number
  subtotal: number
  codigo_barras: string
  peso_kg?: number
}

interface POSStore {
  items: POSItem[]
  descuentoPct: number
  recargoPct: number
  metodoPago: MetodoPago
  agregarItem: (item: Omit<POSItem, 'subtotal'>) => void
  cambiarCantidad: (producto_id: string, cantidad: number) => void
  quitarItem: (producto_id: string) => void
  setDescuento: (pct: number) => void
  setRecargo: (pct: number) => void
  setMetodoPago: (metodo: MetodoPago) => void
  limpiarTicket: () => void
  subtotal: () => number
  descuentoMonto: () => number
  recargoMonto: () => number
  total: () => number
}

export const usePOSStore = create<POSStore>((set, get) => ({
  items: [],
  descuentoPct: 0,
  recargoPct: 0,
  metodoPago: 'efectivo',

  agregarItem: (item) => set(state => {
    // Productos con peso_kg siempre se agregan como línea nueva
    if (item.peso_kg) {
      return { items: [...state.items, { ...item, subtotal: item.precio_unitario * item.cantidad }] }
    }
    const existe = state.items.find(i => i.producto_id === item.producto_id && !i.peso_kg)
    if (existe) {
      return {
        items: state.items.map(i =>
          i.producto_id === item.producto_id && !i.peso_kg
            ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario }
            : i
        )
      }
    }
    return { items: [...state.items, { ...item, subtotal: item.precio_unitario * item.cantidad }] }
  }),

  cambiarCantidad: (producto_id, cantidad) => set(state => {
    if (cantidad <= 0) return { items: state.items.filter(i => i.producto_id !== producto_id) }
    return {
      items: state.items.map(i =>
        i.producto_id === producto_id
          ? { ...i, cantidad, subtotal: cantidad * i.precio_unitario }
          : i
      )
    }
  }),

  quitarItem: (producto_id) => set(state => ({
    items: state.items.filter(i => i.producto_id !== producto_id)
  })),

  setDescuento: (pct) => set({ descuentoPct: pct }),
  setRecargo: (pct) => set({ recargoPct: pct }),
  setMetodoPago: (metodo) => set({ metodoPago: metodo }),
  limpiarTicket: () => set({ items: [], descuentoPct: 0, recargoPct: 0, metodoPago: 'efectivo' }),

  subtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),
  descuentoMonto: () => get().subtotal() * (get().descuentoPct / 100),
  recargoMonto: () => get().subtotal() * (get().recargoPct / 100),
  total: () => get().subtotal() - get().descuentoMonto() + get().recargoMonto(),
}))