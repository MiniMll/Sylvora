'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getProductos, eliminarProducto, actualizarProducto, subirImagen } from '@/lib/supabase/productos'
import { getLotes, agregarLote, getSiguienteNumeroLote, eliminarLote } from '@/lib/supabase/stock'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatStock } from '@/lib/utils'
import type { Producto, Lote } from '@/types/database'
import { ProductFilters, type Vista } from './components/ProductFilters'
import { ProductGrid } from './components/ProductGrid'
import { ProductDetail } from './components/ProductDetail'
import { EditProductModal, type EditFormValues } from './components/EditProductModal'
import { ImportarProductosModal } from './components/ImportarProductosModal'
import { useTrial } from '@/lib/hooks/useTrial'
import { esComercioDemo } from '@/lib/demo'
import { getBrowserClient } from '@/lib/supabase/_base'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Trash2, Package, Plus, Upload } from 'lucide-react'

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
  // Flag para EditProductModal — true si el producto que se está
  // editando tiene lotes. Cuando es true, el modal renderiza el campo
  // "Stock actual" como read-only con aviso de que se ajusta vía lotes.
  // Se resuelve en onEditar (query a lotes count); el modal no consulta
  // por su cuenta para mantener la separación de responsabilidades.
  const [editandoTieneLotes, setEditandoTieneLotes] = useState(false)

  const [confirmarBorrar, setConfirmarBorrar] = useState<Producto | null>(null)

  const [modalLote, setModalLote] = useState<Producto | null>(null)
  const [nuevoLote, setNuevoLote] = useState({ numero_lote: '', cantidad: '', fecha_vencimiento: '' })
  const [guardandoLote, setGuardandoLote] = useState(false)

  const [importarAbierto, setImportarAbierto] = useState(false)
  // Modo demo: ocultamos el botón Importar Excel — un visitante
  // podría subir 500 SKUs basura y romper la demo para los demás
  // hasta el reset cron. Carga manual por /productos/nuevo queda
  // habilitada (es parte del valor que se ve).
  const { comercio: comercioActivo } = useTrial()
  const esDemo = esComercioDemo(comercioActivo)

  const recargarProductos = useCallback(() => {
    getProductos().then(data => setProductos(data))
  }, [])

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

  const onEditar = useCallback(async (p: Producto) => {
    setEditando(p)
    // Query si el producto tiene al menos un lote — afecta cómo el modal
    // renderiza el campo "Stock actual". Es una query liviana
    // (limit(1)) y no bloquea la apertura del modal: si llega tarde,
    // el modal arranca con tieneLotes=false (estado inicial) y se actualiza
    // al rato. No degrada la UX porque el modal se abre instantáneo.
    const supabase = getBrowserClient()
    const { data } = await supabase
      .from('lotes')
      .select('id')
      .eq('producto_id', p.id)
      .limit(1)
      .maybeSingle()
    setEditandoTieneLotes(!!data)
  }, [])
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
    const resultado = await actualizarProducto(editando.id, cambios)
    if (resultado && 'error' in resultado) {
      if (resultado.error === 'codigo_duplicado') toast.error('Ya existe otro producto con ese código de barras')
      else if (resultado.error === 'sku_duplicado') toast.error('Ya existe otro producto con ese SKU')
      else toast.error('No pudimos guardar los cambios. Probá de nuevo.')
      setGuardandoEdit(false)
      return
    }
    if (!resultado) {
      toast.error('No pudimos guardar los cambios. Probá de nuevo.')
      setGuardandoEdit(false)
      return
    }
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
      toast.error('No pudimos eliminar el producto. Probá de nuevo.')
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
    const ok = await eliminarLote(lote.id)
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

  if (cargando) return (
    <div className="page-in" style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      {/* Filtros skeleton */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Skeleton style={{ flex: 1 }} height={34} radius={8} />
        <Skeleton width={120} height={34} radius={8} />
        <Skeleton width={88} height={34} radius={8} />
        <Skeleton width={140} height={34} radius={8} />
      </div>
      {/* Grid skeleton — mismo layout que el real */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            <Skeleton aspectRatio="1 / 1" radius={0} />
            <div style={{ padding: '12px 14px 10px' }}>
              <Skeleton width="80%" height={13} radius={4} style={{ marginBottom: 8 }} />
              <Skeleton width="50%" height={10} radius={3} style={{ marginBottom: 12 }} />
              <Skeleton width="60%" height={17} radius={4} />
            </div>
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width={90} height={18} radius={999} />
              <div style={{ display: 'flex', gap: 4 }}>
                <Skeleton width={24} height={20} radius={6} />
                <Skeleton width={24} height={20} radius={6} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // Empty state de onboarding: el comercio todavía no cargó NINGÚN
  // producto. Distinto del "sin resultados de búsqueda" (que maneja
  // ProductGrid cuando hay productos pero el filtro no matchea).
  if (productos.length === 0) {
    return (
      <>
        <div className="page-in" style={{ padding: 24, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState
            accent
            icon={<Package size={20} color="var(--ac)" strokeWidth={2} />}
            title="Todavía no cargaste productos."
            description="Cargá tu primer producto para empezar a vender: nombre, precio y stock. Lo hacés una sola vez."
            actions={[
              { label: 'Agregar producto', href: '/productos/nuevo', variant: 'primary', icon: <Plus size={15} /> },
              { label: 'Importar desde Excel', onClick: () => setImportarAbierto(true), variant: 'ghost', icon: <Upload size={15} /> },
            ]}
            guiaHref="/guia"
          />
        </div>
        <ImportarProductosModal
          open={importarAbierto}
          onClose={() => setImportarAbierto(false)}
          onImported={(n) => {
            toast.success(`${n} producto${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'}`)
            recargarProductos()
          }}
        />
      </>
    )
  }

  return (
    <div className="page-in" style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <ProductFilters
        busqueda={busqueda} onBusquedaChange={setBusqueda}
        categoria={categoria} onCategoriaChange={setCategoria} categorias={categorias}
        vista={vista} onVistaChange={setVista}
        onImportar={esDemo ? undefined : () => setImportarAbierto(true)}
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
          tieneLotes={editandoTieneLotes}
          onClose={() => { setEditando(null); setEditandoTieneLotes(false) }}
          onGuardar={guardarEdicion}
        />
      )}

      {/* Modal agregar lote */}
      <Modal
        open={!!modalLote}
        onClose={() => setModalLote(null)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalLote(null)} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="success" onClick={guardarNuevoLote} loading={guardandoLote} style={{ flex: 1 }}>
              {guardandoLote ? 'Guardando...' : 'Agregar lote'}
            </Button>
          </>
        }>
        {modalLote && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z'/></svg>
              Agregar lote
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, background: 'var(--bg3)', padding: '8px 12px', borderRadius: 8 }}>
              {modalLote.nombre} · Stock: <b style={{ color: 'var(--text)' }}>{formatStock(modalLote.stock_actual, modalLote.unidad_venta)}</b>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Número de lote *</label>
                <Input value={nuevoLote.numero_lote} onChange={e => setNuevoLote(p => ({ ...p, numero_lote: e.target.value }))}
                  placeholder="Ej: L-2025-05-001" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  {modalLote.unidad_venta === 'kg' ? 'Peso (kg) *' : 'Cantidad *'}
                </label>
                <Input value={nuevoLote.cantidad} onChange={e => setNuevoLote(p => ({ ...p, cantidad: e.target.value }))}
                  type="number" placeholder={modalLote.unidad_venta === 'kg' ? 'Ej: 4.5' : 'Ej: 24'} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Fecha de vencimiento</label>
                <Input value={nuevoLote.fecha_vencimiento} onChange={e => setNuevoLote(p => ({ ...p, fecha_vencimiento: e.target.value }))}
                  type="date" />
              </div>
            </div>
          </>
        )}
      </Modal>

      <ImportarProductosModal
        open={importarAbierto}
        onClose={() => setImportarAbierto(false)}
        onImported={(n) => {
          toast.success(`${n} producto${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'}`)
          recargarProductos()
        }}
      />

      {/* Modal confirmar borrar */}
      <Modal
        open={!!confirmarBorrar}
        onClose={() => setConfirmarBorrar(null)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmarBorrar(null)} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={borrarProducto} style={{ flex: 1 }}>
              Sí, borrar
            </Button>
          </>
        }>
        {confirmarBorrar && (
          <div style={{ textAlign: 'center' }}>
            {/* Badge circular con Trash2 lucide. Reemplaza el emoji 🗑️
                que rompía la consistencia visual con el resto del
                producto. Bg rojo translúcido + icon en rojo brand. */}
            <div style={{
              width: 64, height: 64,
              borderRadius: '50%',
              background: 'rgba(255,71,87,0.10)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}>
              <Trash2 size={28} color="var(--r)" strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>¿Borrar producto?</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 20, background: 'var(--bg3)', borderRadius: 10, padding: '10px 16px' }}>
              {confirmarBorrar.nombre}
            </div>
            <div style={{ fontSize: 12, color: 'var(--r)', background: 'rgba(255,71,87,0.06)', borderRadius: 8, padding: '8px 12px' }}>
              Esta acción no se puede deshacer
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
