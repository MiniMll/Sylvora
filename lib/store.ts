import { create } from 'zustand'
import type { MetodoPago } from '@/types'

const LEGACY_POS_STORAGE_KEY = 'sylvora-pos'
const POS_CART_STORAGE_PREFIX = 'sylvora:pos-cart:'
const POS_CART_STORAGE_VERSION = 2

export interface POSItem {
  producto_id: string
  comercio_id?: string
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

interface PersistedPOSCart {
  version: number
  comercioId: string
  items: POSItem[]
  descuentoPct: number
  recargoPct: number
  metodoPago: MetodoPago
}

interface ProductoStockSnapshot {
  stock_actual: number
  comercio_id: string
}

interface POSStore {
  comercioId: string | null
  storageReady: boolean
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

  setComercioActivo: (comercioId: string | null) => void
  limpiarMemoriaSesion: () => void
  agregarItem: (item: Omit<POSItem, 'subtotal'>) => void
  cambiarCantidad: (producto_id: string, cantidad: number) => void
  quitarItem: (producto_id: string) => void
  /** Refresca stock_disponible de los items del ticket a partir del
   *  snapshot fresco de productos. También remueve items que ya no
   *  existen o que no pertenecen al comercio activo. */
  sincronizarStock: (productosStock: Record<string, ProductoStockSnapshot>) => number
  setDescuento: (pct: number) => void
  setRecargo: (pct: number) => void
  setMetodoPago: (metodo: MetodoPago) => void
  limpiarTicket: () => void
  limpiarTicketPorSeguridad: () => void
  setCargandoVenta: (v: boolean) => void
  requestRefocus: () => void
  carritoPerteneceAComercio: (comercioId: string) => boolean
  subtotal: () => number
  descuentoMonto: () => number
  recargoMonto: () => number
  total: () => number
}

function storageKey(comercioId: string): string {
  return `${POS_CART_STORAGE_PREFIX}${comercioId}`
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function emptyCartState(): {
  items: POSItem[]
  descuentoPct: number
  recargoPct: number
  metodoPago: MetodoPago
} {
  return {
    items: [],
    descuentoPct: 0,
    recargoPct: 0,
    metodoPago: 'efectivo' as MetodoPago,
  }
}

function baseProductId(productoId: string): string {
  return productoId.includes('_') ? productoId.split('_')[0] : productoId
}

function readCart(comercioId: string): ReturnType<typeof emptyCartState> {
  if (!canUseStorage()) return emptyCartState()
  try {
    // La key vieja era global y por lo tanto insegura cross-commerce.
    window.localStorage.removeItem(LEGACY_POS_STORAGE_KEY)

    const raw = window.localStorage.getItem(storageKey(comercioId))
    if (!raw) return emptyCartState()
    const parsed = JSON.parse(raw) as Partial<PersistedPOSCart>
    if (parsed.version !== POS_CART_STORAGE_VERSION || parsed.comercioId !== comercioId) {
      return emptyCartState()
    }

    const items = Array.isArray(parsed.items)
      ? parsed.items.filter(i => i && typeof i.producto_id === 'string')
      : []

    return {
      items,
      descuentoPct: Number(parsed.descuentoPct) || 0,
      recargoPct: Number(parsed.recargoPct) || 0,
      metodoPago: parsed.metodoPago === 'debito' || parsed.metodoPago === 'credito' || parsed.metodoPago === 'mercadopago'
        ? parsed.metodoPago
        : 'efectivo',
    }
  } catch {
    return emptyCartState()
  }
}

function writeCart(state: POSStore): void {
  if (!state.comercioId || !state.storageReady || !canUseStorage()) return
  try {
    const payload: PersistedPOSCart = {
      version: POS_CART_STORAGE_VERSION,
      comercioId: state.comercioId,
      items: state.items,
      descuentoPct: state.descuentoPct,
      recargoPct: state.recargoPct,
      metodoPago: state.metodoPago,
    }
    window.localStorage.setItem(storageKey(state.comercioId), JSON.stringify(payload))
  } catch {
    // Sin storage disponible el POS sigue funcionando en memoria.
  }
}

export const usePOSStore = create<POSStore>()((set, get) => {
  const persistAfter = () => writeCart(get())

  return {
    comercioId: null,
    storageReady: false,
    items: [],
    descuentoPct: 0,
    recargoPct: 0,
    metodoPago: 'efectivo',
    cargandoVenta: false,
    refocusToken: 0,

    setComercioActivo: (comercioId) => {
      const current = get().comercioId
      if (current === comercioId && get().storageReady) return

      if (!comercioId) {
        set({ comercioId: null, storageReady: true, ...emptyCartState() })
        return
      }

      const persisted = readCart(comercioId)
      set({
        comercioId,
        storageReady: true,
        ...persisted,
        cargandoVenta: false,
      })
    },

    limpiarMemoriaSesion: () => {
      set({
        comercioId: null,
        storageReady: false,
        ...emptyCartState(),
        cargandoVenta: false,
        refocusToken: 0,
      })
    },

    agregarItem: (item) => {
      set(state => {
        // Productos con peso_kg siempre se agregan como línea nueva.
        if (item.peso_kg) {
          return { items: [...state.items, { ...item, subtotal: item.precio_unitario * item.cantidad }] }
        }
        const existe = state.items.find(i => i.producto_id === item.producto_id && !i.peso_kg)
        if (existe) {
          const cantidadNueva = existe.cantidad + 1
          // Defensa en profundidad: el caller (page.tsx) ya valida stock
          // antes de llamar. Acá igual rechazamos silenciosamente si
          // excede el stock conocido.
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
                    stock_disponible: item.stock_disponible ?? i.stock_disponible,
                    comercio_id: item.comercio_id ?? i.comercio_id,
                  }
                : i
            ),
          }
        }
        return { items: [...state.items, { ...item, subtotal: item.precio_unitario * item.cantidad }] }
      })
      persistAfter()
    },

    cambiarCantidad: (producto_id, cantidad) => {
      set(state => {
        if (cantidad <= 0) return { items: state.items.filter(i => i.producto_id !== producto_id) }
        return {
          items: state.items.map(i => {
            if (i.producto_id !== producto_id) return i
            const max = i.stock_disponible ?? Infinity
            const clamped = Math.min(cantidad, max)
            return { ...i, cantidad: clamped, subtotal: clamped * i.precio_unitario }
          }),
        }
      })
      persistAfter()
    },

    sincronizarStock: (productosStock) => {
      let removidos = 0
      set(state => {
        const comercioId = state.comercioId
        const items: POSItem[] = []
        for (const item of state.items) {
          const realId = baseProductId(item.producto_id)
          const producto = productosStock[realId]
          const itemSeguro =
            comercioId &&
            item.comercio_id === comercioId &&
            producto &&
            producto.comercio_id === comercioId

          if (!itemSeguro) {
            removidos += 1
            continue
          }

          items.push({ ...item, stock_disponible: producto.stock_actual })
        }
        return { items }
      })
      if (removidos > 0) persistAfter()
      return removidos
    },

    quitarItem: (producto_id) => {
      set(state => ({ items: state.items.filter(i => i.producto_id !== producto_id) }))
      persistAfter()
    },

    setDescuento: (pct) => {
      set({ descuentoPct: pct })
      persistAfter()
    },
    setRecargo: (pct) => {
      set({ recargoPct: pct })
      persistAfter()
    },
    setMetodoPago: (metodo) => {
      set({ metodoPago: metodo })
      persistAfter()
    },
    limpiarTicket: () => {
      set(emptyCartState())
      persistAfter()
    },
    limpiarTicketPorSeguridad: () => {
      set(emptyCartState())
      persistAfter()
    },
    setCargandoVenta: (v) => set({ cargandoVenta: v }),
    requestRefocus: () => set(s => ({ refocusToken: s.refocusToken + 1 })),
    carritoPerteneceAComercio: (comercioId) => (
      get().items.every(item => item.comercio_id === comercioId)
    ),

    subtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),
    descuentoMonto: () => get().subtotal() * (get().descuentoPct / 100),
    recargoMonto: () => get().subtotal() * (get().recargoPct / 100),
    total: () => get().subtotal() - get().descuentoMonto() + get().recargoMonto(),
  }
})
