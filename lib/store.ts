import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

  // Estado transitorio — NO persistido. Refleja si una venta está en
  // proceso de guardado (deshabilita scanner / botones hasta finalizar).
  cargandoVenta: boolean

  // Counter incremental. Componentes que necesitan re-enfocar el input
  // del scanner emiten requestRefocus(); POSSearch escucha vía effect
  // y devuelve el foco si no hay modal abierto. Token para evitar
  // pasar refs entre componentes.
  refocusToken: number

  agregarItem: (item: Omit<POSItem, 'subtotal'>) => void
  cambiarCantidad: (producto_id: string, cantidad: number) => void
  quitarItem: (producto_id: string) => void
  setDescuento: (pct: number) => void
  setRecargo: (pct: number) => void
  setMetodoPago: (metodo: MetodoPago) => void
  limpiarTicket: () => void
  setCargandoVenta: (v: boolean) => void
  requestRefocus: () => void
  subtotal: () => number
  descuentoMonto: () => number
  recargoMonto: () => number
  total: () => number
}

export const usePOSStore = create<POSStore>()(
  persist(
    (set, get) => ({
      items: [],
      descuentoPct: 0,
      recargoPct: 0,
      metodoPago: 'efectivo',
      cargandoVenta: false,
      refocusToken: 0,

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
      setCargandoVenta: (v) => set({ cargandoVenta: v }),
      requestRefocus: () => set(s => ({ refocusToken: s.refocusToken + 1 })),

      subtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),
      descuentoMonto: () => get().subtotal() * (get().descuentoPct / 100),
      recargoMonto: () => get().subtotal() * (get().recargoPct / 100),
      total: () => get().subtotal() - get().descuentoMonto() + get().recargoMonto(),
    }),
    {
      name: 'sylvora-pos',
      version: 1,
      // Persistimos sólo estado durable. Excluimos:
      //   - cargandoVenta: si el tablet reloadea durante una venta,
      //     no queremos quedar bloqueados con el flag en true.
      //   - refocusToken: counter de eventos, no tiene sentido persistir.
      partialize: (s) => ({
        items: s.items,
        descuentoPct: s.descuentoPct,
        recargoPct: s.recargoPct,
        metodoPago: s.metodoPago,
      }),
    }
  )
)
