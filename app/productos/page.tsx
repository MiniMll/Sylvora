'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getProductos, eliminarProducto, actualizarProducto, subirImagen } from '@/lib/supabase/productos'
import { getLotes, agregarLote, getSiguienteNumeroLote, eliminarLote } from '@/lib/supabase/stock'
import { Spinner } from '@/components/ui/Spinner'
import { formatStock } from '@/lib/utils'
import type { Producto, Lote } from '@/types/database'
import { ProductFilters, type Vista } from './components/ProductFilters'
import { ProductGrid } from './components/ProductGrid'
import { ProductDetail } from './components/ProductDetail'
import { EditProductModal, type EditFormValues } from './components/EditProductModal'

const inpStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
  fontSize: 12, outline: 'none', fontFamily: 'inherit',
  background: 'var(--bg2)', color: 'var(--text)', width: '100%',
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [vista, setVista] = useState<Vista>('cards')
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('Todas')

  const [detalle, setDetalle] = useState<Producto | null>(null)
  const [lotesDetalle, setLotesDetalle] = useState<Lote[]>([])
  const [cargandoLotes, setCargandoLotes] = useState(false)
  const [borrandoLote, setBorrandoLote] = useState<string | null>(null)

  const [editando, setEditando] = useState<Producto | null>(null)
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  const [confirmarBorrar, setConfirmarBorrar] = useState<Producto | null>(null)

  const [modalLote, setModalLote] = useState<Producto | null>(null)
  const [nuevoLote, setNuevoLote] = useState({ numero_lote: '', cantidad: '', fecha_vencimiento: '' })
  const [guardandoLote, setGuardandoLote] = useState(false)

  useEffect(() => {
    getProductos().then(data => { setProductos(data); setCargando(false) })
  }, [])

  useEffect(() => {
    if (modalLote) {
      getSiguienteNumeroLote(modalLote.id).then(num => {
        setNuevoLote(p => ({ ...p, numero_lote: num }))
      })
    }
  }, [modalLote])

  const categorias = useMemo(
    () => ['Todas', ...Array.from(new Set(productos.map(p => p.categoria).filter(Boolean) as string[]))],
    [productos]
  )

  const filtrados = useMemo(() => productos.filter(p => {
    const matchCat = categoria === 'Todas' || p.categoria === categoria
    const matchBusq = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (p.codigo_barras || '').includes(busqueda)
    return matchCat && matchBusq
  }), [productos, categoria, busqueda])

  const abrirDetalle = useCallback(async (p: Producto) => {
    setDetalle(p)
    setCargandoLotes(true)
    setLotesDetalle([])
    const [lotes, numLote] = await Promise.all([
      getLotes(p.id),
      getSiguienteNumeroLote(p.id),
    ])
    setLotesDetalle(lotes)
    setNuevoLote({ numero_lote: numLote, cantidad: '', fecha_vencimiento: '' })
    setCargandoLotes(false)
  }, [])

  const onEditar = useCallback((p: Producto) => setEditando(p), [])
  const onConfirmarBorrar = useCallback((p: Producto) => setConfirmarBorrar(p), [])

  const guardarEdicion = async (form: EditFormValues, imgFile: File | null) => {
    if (!editando) return
    setGuardandoEdit(true)
    const cambios: Partial<Producto> = {
      nombre: form.nombre,
      codigo_barras: form.codigo_barras,
      sku: form.sku,
      precio_costo: Number(form.precio_costo),
      precio_venta: form.unidad_venta === 'kg' ? 0 : Number(form.precio_venta),
      precio_por_kg: form.precio_por_kg ? Number(form.precio_por_kg) : null,
      stock_actual: Number(form.stock_actual),
      stock_minimo: Number(form.stock_minimo),
      unidad_venta: form.unidad_venta as Producto['unidad_venta'],
    }
    if (imgFile) {
      const url = await subirImagen(imgFile, editando.id)
      if (url) cambios.imagen_url = url
    }
    await actualizarProducto(editando.id, cambios)
    setProductos(prev => prev.map(p => p.id === editando.id ? { ...p, ...cambios } as Producto : p))
    setGuardandoEdit(false)
    setEditando(null)
    toast.success('Producto actualizado')
  }

  const borrarProducto = async () => {
    if (!confirmarBorrar) return
    const ok = await eliminarProducto(confirmarBorrar.id)
    if (ok) {
      setProductos(prev => prev.filter(p => p.id !== confirmarBorrar.id))
      toast.success('Producto eliminado')
    } else {
      toast.error('Error al eliminar el producto')
    }
    if (detalle?.id === confirmarBorrar.id) setDetalle(null)
    setConfirmarBorrar(null)
  }

  const guardarNuevoLote = async () => {
    if (!modalLote || !nuevoLote.numero_lote || !nuevoLote.cantidad) {
      toast.error('Completá el número de lote y la cantidad')
      return
    }
    setGuardandoLote(true)
    const ok = await agregarLote({
      producto_id: modalLote.id,
      numero_lote: nuevoLote.numero_lote,
      cantidad: Number(nuevoLote.cantidad),
      fecha_vencimiento: nuevoLote.fecha_vencimiento || undefined,
    })
    if (ok) {
      const nuevaCant = Number(nuevoLote.cantidad)
      setProductos(prev => prev.map(p =>
        p.id === modalLote.id ? { ...p, stock_actual: p.stock_actual + nuevaCant } : p
      ))
      if (detalle?.id === modalLote.id) {
        setDetalle(prev => prev ? { ...prev, stock_actual: prev.stock_actual + nuevaCant } : prev)
        const [lotes, siguiente] = await Promise.all([
          getLotes(modalLote.id),
          getSiguienteNumeroLote(modalLote.id),
        ])
        setLotesDetalle(lotes)
        setNuevoLote({ numero_lote: siguiente, cantidad: '', fecha_vencimiento: '' })
      } else {
        const siguiente = await getSiguienteNumeroLote(modalLote.id)
        setNuevoLote({ numero_lote: siguiente, cantidad: '', fecha_vencimiento: '' })
      }
      setModalLote(null)
      toast.success('Lote agregado correctamente')
    } else {
      toast.error('Error al agregar el lote')
    }
    setGuardandoLote(false)
  }

  const borrarLoteDetalle = async (lote: Lote) => {
    if (!detalle) return
    setBorrandoLote(lote.id)
    const ok = await eliminarLote(lote.id, detalle.id, lote.cantidad)
    if (ok) {
      setLotesDetalle(prev => prev.filter(l => l.id !== lote.id))
      setDetalle(prev => prev ? { ...prev, stock_actual: Math.max(0, prev.stock_actual - lote.cantidad) } : prev)
      setProductos(prev => prev.map(p =>
        p.id === detalle.id ? { ...p, stock_actual: Math.max(0, p.stock_actual - lote.cantidad) } : p
      ))
      toast.success('Lote eliminado')
    } else {
      toast.error('Error al eliminar el lote')
    }
    setBorrandoLote(null)
  }

  if (cargando) return <Spinner texto="Cargando productos..." />

  return (
    <div className="page-in" style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <ProductFilters
        busqueda={busqueda} onBusquedaChange={setBusqueda}
        categoria={categoria} onCategoriaChange={setCategoria} categorias={categorias}
        vista={vista} onVistaChange={setVista}
      />

      <ProductGrid
        productos={filtrados}
        vista={vista}
        onAbrirDetalle={abrirDetalle}
        onEditar={onEditar}
        onConfirmarBorrar={onConfirmarBorrar}
      />

      {detalle && (
        <ProductDetail
          producto={detalle}
          lotes={lotesDetalle}
          cargandoLotes={cargandoLotes}
          borrandoLote={borrandoLote}
          onClose={() => setDetalle(null)}
          onEditar={() => { setDetalle(null); setEditando(detalle) }}
          onBorrar={() => { setConfirmarBorrar(detalle); setDetalle(null) }}
          onAgregarLote={() => setModalLote(detalle)}
          onBorrarLote={borrarLoteDetalle}
        />
      )}

      {editando && (
        <EditProductModal
          producto={editando}
          guardando={guardandoEdit}
          onClose={() => setEditando(null)}
          onGuardar={guardarEdicion}
        />
      )}

      {/* Modal agregar lote */}
      {modalLote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div data-modal-card className="scale-in" style={{ background: 'var(--card)', borderRadius: 20, padding: 24, width: 380, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z'/></svg>
                Agregar lote
              </div>
              <button onClick={() => setModalLote(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, background: 'var(--bg3)', padding: '8px 12px', borderRadius: 8 }}>
              {modalLote.nombre} · Stock: <b style={{ color: 'var(--text)' }}>{formatStock(modalLote.stock_actual, modalLote.unidad_venta)}</b>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Número de lote *</label>
                <input value={nuevoLote.numero_lote} onChange={e => setNuevoLote(p => ({ ...p, numero_lote: e.target.value }))}
                  placeholder="Ej: L-2025-05-001" style={inpStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  {modalLote.unidad_venta === 'kg' ? 'Peso (kg) *' : 'Cantidad *'}
                </label>
                <input value={nuevoLote.cantidad} onChange={e => setNuevoLote(p => ({ ...p, cantidad: e.target.value }))}
                  type="number" placeholder={modalLote.unidad_venta === 'kg' ? 'Ej: 4.5' : 'Ej: 24'} style={inpStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Fecha de vencimiento</label>
                <input value={nuevoLote.fecha_vencimiento} onChange={e => setNuevoLote(p => ({ ...p, fecha_vencimiento: e.target.value }))}
                  type="date" style={inpStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalLote(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                Cancelar
              </button>
              <button onClick={guardarNuevoLote} disabled={guardandoLote}
                style={{ flex: 1, padding: '11px', borderRadius: 9, background: '#00c896', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {guardandoLote ? 'Guardando...' : 'Agregar lote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar borrar */}
      {confirmarBorrar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div data-modal-card className="scale-in" style={{ background: 'var(--card)', borderRadius: 20, padding: 28, width: 380, textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>¿Borrar producto?</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 20, background: 'var(--bg3)', borderRadius: 10, padding: '10px 16px' }}>
              {confirmarBorrar.nombre}
            </div>
            <div style={{ fontSize: 12, color: '#ff4757', background: 'rgba(255,71,87,0.06)', borderRadius: 8, padding: '8px 12px', marginBottom: 20 }}>
              Esta acción no se puede deshacer
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmarBorrar(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                Cancelar
              </button>
              <button onClick={borrarProducto}
                style={{ flex: 1, padding: '11px', borderRadius: 9, background: '#ff4757', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Sí, borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
