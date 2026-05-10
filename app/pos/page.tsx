'use client'
import { useEffect, useMemo, useState } from 'react'
import { Scale, Beaker, Ruler } from 'lucide-react'
import { toast } from 'sonner'
import { getProductos } from '@/lib/supabase/productos'
import { usePOSStore } from '@/lib/store'
import { formatPeso } from '@/lib/utils'
import type { Producto } from '@/types/database'
import { POSHeader } from './components/POSHeader'
import { POSSearch } from './components/POSSearch'
import { POSProducts } from './components/POSProducts'
import { POSCart } from './components/POSCart'
import { POSPayment } from './components/POSPayment'

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
      setModalCantidad(p)
      setCantidadIngresada('')
      return
    }
    const enTicket = store.items.find(i => i.producto_id === p.id)
    const cantidadEnTicket = enTicket ? enTicket.cantidad : 0
    if (p.stock_actual === 0) toast.warning(`${p.nombre} no tiene stock`)
    else if (cantidadEnTicket + 1 > p.stock_actual) toast.warning(`Solo quedan ${p.stock_actual} unidades`)
    store.agregarItem({
      producto_id: p.id,
      nombre: p.nombre,
      precio_unitario: p.precio_venta,
      cantidad: 1,
      codigo_barras: p.codigo_barras || '',
    })
  }

  const agregarConCantidad = () => {
    if (!modalCantidad || !cantidadIngresada) { toast.error('Ingresá la cantidad'); return }
    const cant = Number(cantidadIngresada)
    if (cant <= 0) { toast.error('La cantidad debe ser mayor a 0'); return }
    if (cant > modalCantidad.stock_actual) {
      toast.warning(`Solo hay ${modalCantidad.stock_actual} ${modalCantidad.unidad_venta} disponibles`)
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
    setModalCantidad(null)
    setCantidadIngresada('')
  }

  if (cargando) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      Cargando productos...
    </div>
  )

  return (
    <div className="pos-layout page-in" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Panel izquierdo: buscador + resultados */}
      <div className="pos-search-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', ...cardStyle, margin: 16, marginRight: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <POSHeader />
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

      {/* Panel derecho: ticket + pago */}
      <div className="pos-cart-panel" style={{ width: 320, display: 'flex', flexDirection: 'column', ...cardStyle, margin: 16, marginLeft: 8, overflow: 'hidden' }}>
        <POSCart />
        <POSPayment />
      </div>

      {/* Modal cantidad variable (kg/litro/metro) */}
      {modalCantidad && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div data-modal-card className="scale-in" style={{ background: 'var(--card)', borderRadius: 20, padding: 28, width: 360, textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
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
                onKeyDown={e => e.key === 'Enter' && agregarConCantidad()}
                placeholder={modalCantidad.unidad_venta === 'kg' ? 'Ej: 0.500' : 'Ej: 2'}
                step={modalCantidad.unidad_venta === 'kg' ? '0.001' : '1'}
                autoFocus
                style={{ width: '100%', textAlign: 'center', fontSize: 28, fontWeight: 700, fontFamily: 'monospace', border: '2px solid #5b4cff', borderRadius: 12, padding: '12px', outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
            </div>
            {cantidadIngresada && Number(cantidadIngresada) > 0 && (
              <div style={{ background: 'rgba(91,76,255,0.08)', borderRadius: 10, padding: '10px', marginBottom: 16, fontSize: 14, color: 'var(--text)' }}>
                Total: <b style={{ color: '#5b4cff', fontFamily: 'monospace' }}>
                  {modalCantidad.unidad_venta === 'kg'
                    ? formatPeso((modalCantidad.precio_por_kg ?? 0) * Number(cantidadIngresada))
                    : formatPeso(modalCantidad.precio_venta * Number(cantidadIngresada))}
                </b>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalCantidad(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                Cancelar
              </button>
              <button onClick={agregarConCantidad}
                style={{ flex: 2, padding: '11px', borderRadius: 9, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Agregar al ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
