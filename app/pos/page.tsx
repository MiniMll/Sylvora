'use client'
import { useEffect, useMemo, useState } from 'react'
import { Scale, Beaker, Ruler, Package, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { getProductos } from '@/lib/supabase/productos'
import { usePOSStore } from '@/lib/store'
import { formatPeso } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Hint } from '@/components/ui/Hint'
import type { Producto } from '@/types/database'
import { POSHeader } from './components/POSHeader'
import { POSSearch } from './components/POSSearch'
import { POSProducts } from './components/POSProducts'
import { POSCart } from './components/POSCart'
import { POSPayment } from './components/POSPayment'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

const necesitaModal = (p: Producto) => ['kg', 'litro', 'metro'].includes(p.unidad_venta)

const cardStyle: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16,
  border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
}

export default function POSPage() {
  const store = usePOSStore()
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalCantidad, setModalCantidad] = useState<Producto | null>(null)
  const [cantidadIngresada, setCantidadIngresada] = useState('')

  useEffect(() => {
    getProductos().then(data => { setProductos(data); setCargando(false) })
  }, [])

  // Resultados filtrados (compartido entre POSSearch y POSProducts)
  const resultados = useMemo(() => {
    if (!busqueda.trim()) return []
    const q = busqueda.toLowerCase()
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.codigo_barras || '').includes(busqueda) ||
      (p.sku || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [busqueda, productos])

  const seleccionar = (p: Producto) => {
    setBusqueda('')
    if (necesitaModal(p)) {
      // kg/litro/metro pasan por el modal de cantidad. Permitimos
      // continuar aún con stock bajo: el cajero puede vender un
      // pesaje aproximado y ajustar manualmente.
      setModalCantidad(p)
      setCantidadIngresada('')
      return
    }
    // BLOQUEO ESTRICTO para productos por unidad sin stock: evita
    // ventas que dejarían el inventario en negativo. El cajero ve un
    // toast claro y el item NO se agrega al ticket.
    if (p.stock_actual === 0) {
      toast.error(`${p.nombre} no tiene stock`, { id: 'pos-input' })
      return
    }
    const enTicket = store.items.find(i => i.producto_id === p.id)
    const cantidadEnTicket = enTicket ? enTicket.cantidad : 0
    if (cantidadEnTicket + 1 > p.stock_actual) {
      toast.warning(`Solo quedan ${p.stock_actual} unidades de ${p.nombre}`, { id: 'pos-input' })
    }
    store.agregarItem({
      producto_id: p.id,
      nombre: p.nombre,
      precio_unitario: p.precio_venta,
      cantidad: 1,
      codigo_barras: p.codigo_barras || '',
    })
  }

  // Detecta input que parece un barcode escaneado por accidente:
  // muchos dígitos enteros sin parte decimal. Casos legítimos como
  // "10000.5" tienen decimal y pasan. Casos como "7790001001234"
  // (EAN13) o "12345678" (8+ enteros) se bloquean.
  // Sanity absoluto: > 100000 no tiene sentido en POS real-world.
  const validarCantidadInput = (input: string): { ok: boolean; reason?: string } => {
    const trimmed = input.trim().replace(',', '.')
    const cant = Number(trimmed)
    if (isNaN(cant) || cant <= 0) return { ok: false, reason: 'La cantidad debe ser mayor a 0' }
    const tieneDecimal = trimmed.includes('.')
    const entero = trimmed.replace(/[.,].*/, '').replace(/^-/, '')
    if (!tieneDecimal && entero.length >= 7) {
      return { ok: false, reason: 'Cantidad inválida. ¿Escaneaste un código por error?' }
    }
    if (cant > 100000) {
      return { ok: false, reason: 'Cantidad demasiado alta' }
    }
    return { ok: true }
  }

  const cerrarModalCantidad = () => {
    setModalCantidad(null)
    setCantidadIngresada('')
    // Devuelve foco al input principal del POS para que el cajero pueda
    // seguir scaneando sin tocar nada.
    store.requestRefocus()
  }

  const agregarConCantidad = () => {
    if (!modalCantidad || !cantidadIngresada) { toast.error('Ingresá la cantidad', { id: 'pos-cantidad' }); return }
    const validacion = validarCantidadInput(cantidadIngresada)
    if (!validacion.ok) {
      toast.error(validacion.reason!, { id: 'pos-cantidad' })
      setCantidadIngresada('')
      return
    }
    const cant = Number(cantidadIngresada.replace(',', '.'))
    if (cant > modalCantidad.stock_actual) {
      toast.warning(`Solo hay ${modalCantidad.stock_actual} ${modalCantidad.unidad_venta} disponibles`, { id: 'pos-cantidad' })
    }
    const unidad = modalCantidad.unidad_venta
    const precio = unidad === 'kg'
      ? (modalCantidad.precio_por_kg ?? 0) * cant
      : modalCantidad.precio_venta * cant
    const sufijo = unidad === 'kg' ? `${cant} kg` : unidad === 'litro' ? `${cant} L` : `${cant} m`

    store.agregarItem({
      producto_id: `${modalCantidad.id}_${Date.now()}`,
      nombre: `${modalCantidad.nombre} (${sufijo})`,
      precio_unitario: precio,
      cantidad: 1,
      codigo_barras: modalCantidad.codigo_barras || '',
      peso_kg: cant,
    })
    cerrarModalCantidad()
  }

  if (cargando) return <Spinner texto="Cargando productos..." />

  // Sin productos cargados no se puede cobrar. En vez de mostrar un POS
  // vacío y confuso, guiamos a cargar productos primero.
  if (productos.length === 0) {
    return (
      <div className="page-in" style={{ flex: 1, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <EmptyState
          accent
          icon={<Package size={20} color="var(--ac)" strokeWidth={2} />}
          title="Necesitás productos para vender."
          description="Cargá tu primer producto y después cobrás en segundos desde acá."
          actions={[{ label: 'Cargar primer producto', href: '/productos/nuevo', variant: 'primary', icon: <Package size={15} /> }]}
          guiaHref="/guia"
        />
      </div>
    )
  }

  return (
    <div className="pos-layout page-in" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Panel izquierdo: buscador + resultados */}
      <div className="pos-search-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', ...cardStyle, margin: 16, marginRight: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <POSHeader />
          <Hint id="pos-primera-venta" icon={<Lightbulb size={15} />} style={{ marginBottom: 10 }}>
            Buscá por nombre o escaneá el código de barras para agregar al ticket.
            Para cobrar, tocá <b>Cobrar</b> o apretá <b>F8</b>.
          </Hint>
          <POSSearch
            productos={productos}
            value={busqueda}
            onChange={setBusqueda}
            onSelect={seleccionar}
            resultados={resultados}
          />
        </div>
        <POSProducts busqueda={busqueda} resultados={resultados} onSelect={seleccionar} />
      </div>

      {/* Panel derecho: ticket + pago.
          POSPayment va wrappeada con .pos-payment-section: el CSS
          mobile le aplica flex-shrink: 0 para que métodos+Cobrar
          NUNCA queden fuera del viewport en pantalla angosta. En
          desktop el wrapper es un pass-through neutro. */}
      <div className="pos-cart-panel" style={{ width: 320, display: 'flex', flexDirection: 'column', ...cardStyle, margin: 16, marginLeft: 8, overflow: 'hidden' }}>
        <POSCart />
        <div className="pos-payment-section">
          <POSPayment />
        </div>
      </div>

      {/* Modal cantidad variable (kg/litro/metro) */}
      <Modal
        open={!!modalCantidad}
        onClose={cerrarModalCantidad}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarModalCantidad} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={agregarConCantidad} style={{ flex: 2 }}>
              Agregar al ticket
            </Button>
          </>
        }>
        {modalCantidad && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(91,76,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              {modalCantidad.unidad_venta === 'kg' ? <Scale size={24} color="#5b4cff" />
                : modalCantidad.unidad_venta === 'litro' ? <Beaker size={24} color="#5b4cff" />
                : <Ruler size={24} color="#5b4cff" />}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{modalCantidad.nombre}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
              {modalCantidad.unidad_venta === 'kg'
                ? `${formatPeso(modalCantidad.precio_por_kg ?? 0)}/kg · ${modalCantidad.stock_actual.toFixed(2)} kg disponibles`
                : `${formatPeso(modalCantidad.precio_venta)}/${modalCantidad.unidad_venta} · Stock: ${modalCantidad.stock_actual}`
              }
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                {modalCantidad.unidad_venta === 'kg' ? 'Kilogramos' : modalCantidad.unidad_venta === 'litro' ? 'Litros' : 'Metros'}
              </label>
              <input type="number" value={cantidadIngresada}
                onChange={e => setCantidadIngresada(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') agregarConCantidad()
                }}
                placeholder={modalCantidad.unidad_venta === 'kg' ? 'Ej: 0.500' : 'Ej: 2'}
                step={modalCantidad.unidad_venta === 'kg' ? '0.001' : '1'}
                max={Math.max(modalCantidad.stock_actual * 5, 1000)}
                autoFocus
                onFocus={e => e.target.select()}
                style={{ width: '100%', textAlign: 'center', fontSize: 28, fontWeight: 700, fontFamily: 'DM Mono, monospace', border: '2px solid var(--ac)', borderRadius: 12, padding: '12px', outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
            </div>
            {cantidadIngresada && Number(cantidadIngresada) > 0 && (
              <div style={{ background: 'rgba(91,76,255,0.08)', borderRadius: 10, padding: '10px', fontSize: 14, color: 'var(--text)' }}>
                Total: <b style={{ color: 'var(--ac)', fontFamily: 'DM Mono, monospace' }}>
                  {modalCantidad.unidad_venta === 'kg'
                    ? formatPeso((modalCantidad.precio_por_kg ?? 0) * Number(cantidadIngresada))
                    : formatPeso(modalCantidad.precio_venta * Number(cantidadIngresada))}
                </b>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
