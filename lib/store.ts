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
  /** Stock conocido al momento de agregar / al último sync con DB.
   *  Usado por POSCart para bloquear el botón + y clampear edición
   *  inline. Si está undefined (carrito persistido de una versión
   *  vieja), el frontend NO bloquea — la validación atómica
   *  server-side igualmente atrapa el caso al cobrar. */
  stock_disponible?: number
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
  /** Refresca stock_disponible de los items del ticket a partir del
   *  snapshot fresco de productos. Llamado al recargar productos
   *  desde la DB (post-venta, post-error de stock_insuficiente, etc.).
   *  Productos por peso usan producto_id compuesto "<realId>_<ts>" —
   *  acá hacemos lookup contra realId para mantener el sync. */
  sincronizarStock: (productosStock: Record<string, number>) => void
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
          const cantidadNueva = existe.cantidad + 1
          // Defensa en profundidad: el caller (page.tsx) ya valida stock
          // antes de llamar. Acá igual rechazamos silenciosamente si
          // excede el stock conocido — no queremos que un bug futuro
          // del UI permita inflar el carrito. La validación atómica
          // server-side queda como tercera línea de defensa.
          const stockDisp = existe.stock_disponible ?? item.stock_disponible
          if (stockDisp !== undefined && cantidadNueva > stockDisp) {
            return state
          }
          return {
            items: state.items.map(i =>
              i.producto_id === item.producto_id && !i.peso_kg
                ? {
                    ...i,
                    cantidad: cantidadNueva,
                    subtotal: cantidadNueva * i.precio_unitario,
                    // Refrescar el stock si el caller pasó uno nuevo.
                    stock_disponible: item.stock_disponible ?? i.stock_disponible,
                  }
                : i
            )
          }
        }
        return { items: [...state.items, { ...item, subtotal: item.precio_unitario * item.cantidad }] }
      }),

      cambiarCantidad: (producto_id, cantidad) => set(state => {
        if (cantidad <= 0) return { items: state.items.filter(i => i.producto_id !== producto_id) }
        return {
          items: state.items.map(i => {
            if (i.producto_id !== producto_id) return i
            // Clamp al stock disponible — defensa contra UI que olvide
            // chequear (botón +, edición inline). Si stock_disponible
            // es undefined (carrito legacy), no clampea.
            const max = i.stock_disponible ?? Infinity
            const clamped = Math.min(cantidad, max)
            return { ...i, cantidad: clamped, subtotal: clamped * i.precio_unitario }
          })
        }
      }),

      sincronizarStock: (productosStock) => set(state => ({
        items: state.items.map(i => {
          // Productos por peso usan producto_id compuesto: extraer realId.
          const realId = i.producto_id.includes('_')
            ? i.producto_id.split('_')[0]
            : i.producto_id
          const stock = productosStock[realId]
          if (stock === undefined) return i
          // Si el stock fresco es menor a la cantidad en el ticket,
          // dejamos la cantidad como está — la decisión de bajar el
          // carrito la toma el usuario (no pisar input del cajero
          // en mitad de la operación). El bloqueo igual aplica para
          // futuros incrementos.
          return { ...i, stock_disponible: stock }
        })
      })),

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
