'use client'
import { useEffect, useState, useRef } from 'react'
import { getProductos, eliminarProducto, actualizarProducto, subirImagen } from '@/lib/supabase/productos'
import { getLotes, agregarLote, getSiguienteNumeroLote, eliminarLote } from '@/lib/supabase/stock'
import { toast } from 'sonner'
import { Pencil, Trash2, Plus, Search, LayoutGrid, List, Package, X, AlertTriangle, CheckCircle, Camera, Layers } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { formatPeso, calcularMargen as margen, stockColor, stockLabel, formatStock } from '@/lib/utils'

function CodigoBarras({ codigo }: { codigo: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!svgRef.current || !codigo) return
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(svgRef.current, codigo, {
          format: 'CODE128', width: 2, height: 50,
          displayValue: true, fontSize: 12, margin: 8, background: 'transparent',
        })
      } catch {}
    })
  }, [codigo])
  return <svg ref={svgRef} style={{ width: '100%' }} />
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [vista, setVista] = useState<'cards' | 'lista'>('cards')
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('Todas')
  const [detalle, setDetalle] = useState<any | null>(null)
  const [lotesDetalle, setLotesDetalle] = useState<any[]>([])
  const [cargandoLotes, setCargandoLotes] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [confirmarBorrar, setConfirmarBorrar] = useState<any | null>(null)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [imgEditPreview, setImgEditPreview] = useState<string | null>(null)
  const [imgEditFile, setImgEditFile] = useState<File | null>(null)
  const [formEdit, setFormEdit] = useState<any>({})
  const [modalLote, setModalLote] = useState<any | null>(null)
  const [nuevoLote, setNuevoLote] = useState({ numero_lote: '', cantidad: '', fecha_vencimiento: '' })
  const [guardandoLote, setGuardandoLote] = useState(false)
  const [borrandoLote, setBorrandoLote] = useState<string | null>(null)

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

  const abrirDetalle = async (p: any) => {
    setDetalle(p)
    setCargandoLotes(true)
    setLotesDetalle([])
    const [lotes, numLote] = await Promise.all([
      getLotes(p.id),
      getSiguienteNumeroLote(p.id)
    ])
    setLotesDetalle(lotes)
    setNuevoLote({ numero_lote: numLote, cantidad: '', fecha_vencimiento: '' })
    setCargandoLotes(false)
  }

  const categorias = ['Todas', ...new Set(productos.map((p: any) => p.categoria).filter(Boolean))]
  const filtrados = productos.filter((p: any) => {
    const matchCat = categoria === 'Todas' || p.categoria === categoria
    const matchBusq = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (p.codigo_barras || '').includes(busqueda)
    return matchCat && matchBusq
  })

  const abrirEditar = (p: any) => {
    setFormEdit({
      nombre: p.nombre || '',
      codigo_barras: p.codigo_barras || '',
      sku: p.sku || '',
      precio_costo: p.precio_costo?.toString() || '',
      precio_venta: p.precio_venta?.toString() || '',
      precio_por_kg: p.precio_por_kg?.toString() || '',
      stock_actual: p.stock_actual?.toString() || '',
      stock_minimo: p.stock_minimo?.toString() || '',
      unidad_venta: p.unidad_venta || 'unidad',
    })
    setImgEditPreview(p.imagen_url || null)
    setImgEditFile(null)
    setEditando(p)
  }

  const handleImgEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgEditFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImgEditPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const guardarEdicion = async () => {
    if (!editando) return
    setGuardandoEdit(true)
    const cambios: any = {
      nombre: formEdit.nombre,
      codigo_barras: formEdit.codigo_barras,
      sku: formEdit.sku,
      precio_costo: Number(formEdit.precio_costo),
      precio_venta: formEdit.unidad_venta === 'kg' ? 0 : Number(formEdit.precio_venta),
      precio_por_kg: formEdit.precio_por_kg ? Number(formEdit.precio_por_kg) : null,
      stock_actual: Number(formEdit.stock_actual),
      stock_minimo: Number(formEdit.stock_minimo),
      unidad_venta: formEdit.unidad_venta,
    }
    if (imgEditFile) {
      const url = await subirImagen(imgEditFile, editando.id)
      if (url) cambios.imagen_url = url
    }
    await actualizarProducto(editando.id, cambios)
    setProductos(prev => prev.map(p => p.id === editando.id ? { ...p, ...cambios } : p))
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
    setConfirmarBorrar(null)
    if (detalle?.id === confirmarBorrar.id) setDetalle(null)
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
        setDetalle((prev: any) => ({ ...prev, stock_actual: prev.stock_actual + nuevaCant }))
        const [lotes, siguiente] = await Promise.all([
          getLotes(modalLote.id),
          getSiguienteNumeroLote(modalLote.id)
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

  const borrarLoteDetalle = async (lote: any) => {
    if (!detalle) return
    setBorrandoLote(lote.id)
    const ok = await eliminarLote(lote.id, detalle.id, lote.cantidad)
    if (ok) {
      setLotesDetalle(prev => prev.filter(l => l.id !== lote.id))
      setDetalle((prev: any) => ({ ...prev, stock_actual: Math.max(0, prev.stock_actual - lote.cantidad) }))
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

  const mg = detalle ? margen(detalle.precio_costo, detalle.precio_venta) : 0

  const inp: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
    fontSize: 12, outline: 'none', fontFamily: 'inherit',
    background: 'var(--bg2)', color: 'var(--text)', width: '100%'
  }

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      {/* Toolbar */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código, SKU..."
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)' }} />
        <select value={categoria} onChange={e => setCategoria(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
          {categorias.map(c => <option key={String(c)}>{c}</option>)}
        </select>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['cards', 'lista'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: '8px 12px', border: 'none', background: vista === v ? '#5b4cff' : 'var(--bg2)', color: vista === v ? 'white' : 'var(--text)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
              {v === 'cards' ? <LayoutGrid size={13} /> : <List size={13} />}
            </button>
          ))}
        </div>
        <a href="/productos/nuevo"
          style={{ padding: '8px 14px', borderRadius: 8, background: '#5b4cff', color: 'white', fontSize: 12, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /> Nuevo Producto
        </a>
      </div>

      {/* LISTA */}
      {vista === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          {filtrados.map((p: any) => {
            const sc = stockColor(p.stock_actual, p.stock_minimo, p.unidad_venta)
            const sl = stockLabel(p.stock_actual, p.stock_minimo, p.unidad_venta)
            const esKg = p.unidad_venta === 'kg'
            return (
              <div key={p.id} onClick={() => abrirDetalle(p)}
                style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>

                {/* Imagen fija 130px */}
                <div style={{ width: '100%', height: 130, background: 'var(--bg3)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, position: 'relative', flexShrink: 0 }}>
                  {p.imagen_url
                    ? <img src={p.imagen_url} alt={p.nombre}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 8 }} />
                    : <Package size={40} color="var(--border)" style={{ opacity: 0.5 }} />
                  }
                  {p.unidad_venta !== 'unidad' && (
                    <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(91,76,255,0.9)', color: 'white', fontSize: 9, padding: '3px 7px', borderRadius: 5, fontWeight: 700 }}>
                      {p.unidad_venta === 'kg' ? '$/kg' : p.unidad_venta === 'litro' ? '$/L' : p.unidad_venta === 'metro' ? '$/m' : p.unidad_venta}
                    </span>
                  )}
                  {p.stock_actual === 0 && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: 'white', fontSize: 11, fontWeight: 700, background: 'rgba(136,136,152,0.8)', borderRadius: 6, padding: '4px 10px' }}>SIN STOCK</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '10px 12px', flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{p.nombre}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'monospace', marginBottom: 8 }}>{p.sku || p.codigo_barras || '—'}</div>
                  {p.unidad_venta === 'kg'
                    ? <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(p.precio_por_kg || 0)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400 }}>/kg</span></div>
                    : p.unidad_venta === 'litro'
                    ? <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(p.precio_venta)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400 }}>/L</span></div>
                    : p.unidad_venta === 'metro'
                    ? <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(p.precio_venta)}<span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400 }}>/m</span></div>
                    : <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(p.precio_venta)}</div>
                  }
                </div>

                {/* Footer */}
                <div style={{ borderTop: '1px solid var(--border)', padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: sc }}>
                      {formatStock(p.stock_actual, p.unidad_venta)}
                    </span>
                    <span style={{ background: sc + '22', color: sc, padding: '2px 6px', borderRadius: 5, fontSize: 9, fontWeight: 700 }}>{sl}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => abrirEditar(p)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Pencil size={11} color="var(--text2)" />
                    </button>
                    <button onClick={() => setConfirmarBorrar(p)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.25)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={11} color="#ff4757"/>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* LISTA VIEW */}
      {vista === 'lista' && (
        <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Producto', 'SKU / Código', 'Categoría', 'Precio', 'Stock', 'Estado', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p: any) => {
                const sc = stockColor(p.stock_actual, p.stock_minimo, p.unidad_venta)
                const sl = stockLabel(p.stock_actual, p.stock_minimo, p.unidad_venta)
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => abrirDetalle(p)}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg3)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {p.imagen_url
                            ? <img src={p.imagen_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <Package size={16} color="var(--border)" />
                          }
                        </div>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{p.nombre}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text2)', fontSize: 11 }}>{p.sku || p.codigo_barras || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{p.categoria || '—'}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#5b4cff' }}>
                      {p.unidad_venta === 'kg'
                        ? `${formatPeso(p.precio_por_kg || 0)}/kg`
                        : p.unidad_venta === 'litro'
                        ? `${formatPeso(p.precio_venta)}/L`
                        : formatPeso(p.precio_venta)
                      }
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: sc }}>
                      {formatStock(p.stock_actual, p.unidad_venta)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: sc + '22', color: sc, padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>{sl}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => abrirEditar(p)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Pencil size={11} color="var(--text2)" />
                        </button>
                        <button onClick={() => setConfirmarBorrar(p)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.25)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Trash2 size={11} color="#ff4757" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtrados.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
              No se encontraron productos
            </div>
          )}
        </div>
      )}

      {/* MODAL DETALLE */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, width: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ height: 180, background: 'var(--bg3)', borderRadius: '20px 20px 0 0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, position: 'relative' }}>
              {detalle.imagen_url
                ? <img src={detalle.imagen_url} alt={detalle.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Package size={48} color="rgba(255,255,255,0.3)" />
              }
              <button onClick={() => setDetalle(null)}
                style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>{detalle.nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace', marginBottom: 16 }}>{detalle.sku} · {detalle.codigo_barras}</div>

              {/* Precios */}
              <div style={{ display: 'grid', gridTemplateColumns: detalle.unidad_venta === 'kg' ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                {detalle.unidad_venta === 'kg' ? (
                  <>
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Precio por kg</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#5b4cff' }}>{formatPeso(detalle.precio_por_kg || 0)}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Stock disponible</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: stockColor(detalle.stock_actual, detalle.stock_minimo, 'kg') }}>{detalle.stock_actual.toFixed(2)} kg</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Precio venta</div>
                      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#5b4cff' }}>{formatPeso(detalle.precio_venta)}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Precio costo</div>
                      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text2)' }}>{formatPeso(detalle.precio_costo)}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Margen</div>
                      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: mg >= 35 ? '#00c896' : mg >= 20 ? '#ffb800' : '#ff4757' }}>{mg}%</div>
                    </div>
                  </>
                )}
              </div>

              {/* Stock */}
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>Stock actual</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: stockColor(detalle.stock_actual, detalle.stock_minimo, detalle.unidad_venta) }}>
                    {formatStock(detalle.stock_actual, detalle.unidad_venta)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>Mínimo</div>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text)' }}>{formatStock(detalle.stock_minimo, detalle.unidad_venta)}</div>
                </div>
                <span style={{ background: stockColor(detalle.stock_actual, detalle.stock_minimo, detalle.unidad_venta) + '22', color: stockColor(detalle.stock_actual, detalle.stock_minimo, detalle.unidad_venta), padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                  {stockLabel(detalle.stock_actual, detalle.stock_minimo, detalle.unidad_venta)}
                </span>
              </div>

              {/* Lotes */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}><Layers size={12} /> Lotes</div>
                  <button onClick={() => setModalLote(detalle)}
                    style={{ padding: '4px 10px', borderRadius: 7, background: '#5b4cff', color: 'white', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Agregar lote
                  </button>
                </div>
                {cargandoLotes ? (
                  <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: 12 }}>Cargando lotes...</div>
                ) : lotesDetalle.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: 12, background: 'var(--bg3)', borderRadius: 8 }}>
                    No hay lotes registrados
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lotesDetalle.map((lote: any) => {
                      const vencido = lote.fecha_vencimiento && new Date(lote.fecha_vencimiento) < new Date()
                      const proxVencer = lote.fecha_vencimiento && !vencido && (new Date(lote.fecha_vencimiento).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000
                      return (
                        <div key={lote.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', border: `1px solid ${vencido ? 'rgba(255,71,87,0.3)' : 'var(--border)'}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text)' }}>{lote.numero_lote}</div>
                            {lote.fecha_vencimiento && (
                              <div style={{ fontSize: 10, color: vencido ? '#ff4757' : proxVencer ? '#ffb800' : 'var(--text2)' }}>
                                {vencido ? 'Vencido: ' : proxVencer ? 'Vence pronto: ' : 'Vence: '}
                                {new Date(lote.fecha_vencimiento).toLocaleDateString('es-AR')}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
                            {formatStock(lote.cantidad, detalle.unidad_venta)}
                          </div>
                          <button onClick={() => borrarLoteDetalle(lote)} disabled={borrandoLote === lote.id}
                            style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.2)', background: 'var(--bg2)', fontSize: 10, cursor: 'pointer', color: '#ff4757' }}>
                            {borrandoLote === lote.id ? '...' : '🗑️'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Código de barras */}
              {detalle.codigo_barras && (
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>Código de barras</div>
                  <CodigoBarras codigo={detalle.codigo_barras} />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setDetalle(null); abrirEditar(detalle) }}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✏️ Editar
                </button>
                <button onClick={() => { setConfirmarBorrar(detalle); setDetalle(null) }}
                  style={{ padding: '10px 14px', borderRadius: 9, background: 'var(--bg2)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR */}
      {editando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: 24, width: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>✏️ Editar producto</div>
              <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)' }}>✕</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Imagen</label>
              <label style={{ width: 80, height: 70, borderRadius: 10, overflow: 'hidden', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--bg3)', fontSize: 28 }}>
                {imgEditPreview ? <img src={imgEditPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' style={{color:'var(--text2)'}}><path d='M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z'/><circle cx='12' cy='13' r='4'/></svg>}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImgEdit} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Nombre *', key: 'nombre', full: true },
                { label: 'Código de barras', key: 'codigo_barras' },
                { label: 'SKU', key: 'sku' },
                { label: 'Precio de costo', key: 'precio_costo', type: 'number' },
                ...(formEdit.unidad_venta !== 'kg' ? [{ label: 'Precio de venta', key: 'precio_venta', type: 'number' }] : []),
                { label: 'Precio por kg', key: 'precio_por_kg', type: 'number' },
                { label: 'Stock actual', key: 'stock_actual', type: 'number' },
                { label: 'Stock mínimo', key: 'stock_minimo', type: 'number' },
              ].map((f: any) => (
                <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>{f.label}</label>
                  <input type={f.type || 'text'} value={formEdit[f.key] || ''}
                    onChange={e => setFormEdit((prev: any) => ({ ...prev, [f.key]: e.target.value }))}
                    style={inp} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>Unidad de venta</label>
                <select value={formEdit.unidad_venta || 'unidad'}
                  onChange={e => setFormEdit((prev: any) => ({ ...prev, unidad_venta: e.target.value }))}
                  style={inp}>
                  <option value="unidad">Unidad</option>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="litro">Litro</option>
                  <option value="metro">Metro</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={guardarEdicion} disabled={guardandoEdit}
                style={{ flex: 1, padding: '10px', borderRadius: 9, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button onClick={() => setEditando(null)}
                style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AGREGAR LOTE */}
      {modalLote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: 24, width: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><path d='M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z'/></svg> Agregar lote</div>
              <button onClick={() => setModalLote(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, background: 'var(--bg3)', padding: '8px 12px', borderRadius: 8 }}>
              {modalLote.nombre} · Stock: <b style={{ color: 'var(--text)' }}>{formatStock(modalLote.stock_actual, modalLote.unidad_venta)}</b>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Número de lote *</label>
                <input value={nuevoLote.numero_lote} onChange={e => setNuevoLote(p => ({ ...p, numero_lote: e.target.value }))}
                  placeholder="Ej: L-2025-05-001" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  {modalLote.unidad_venta === 'kg' ? 'Peso (kg) *' : 'Cantidad *'}
                </label>
                <input value={nuevoLote.cantidad} onChange={e => setNuevoLote(p => ({ ...p, cantidad: e.target.value }))}
                  type="number" placeholder={modalLote.unidad_venta === 'kg' ? 'Ej: 4.5' : 'Ej: 24'} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Fecha de vencimiento</label>
                <input value={nuevoLote.fecha_vencimiento} onChange={e => setNuevoLote(p => ({ ...p, fecha_vencimiento: e.target.value }))}
                  type="date" style={inp} />
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

      {/* MODAL CONFIRMAR BORRAR */}
      {confirmarBorrar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: 28, width: 380, textAlign: 'center' }}>
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