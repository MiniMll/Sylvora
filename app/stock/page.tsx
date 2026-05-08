'use client'
import { useEffect, useState } from 'react'
import { getStockCritico, getLotes, agregarLote, getSiguienteNumeroLote, eliminarLote, ajustarStock } from '@/lib/supabase/productos'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { Pencil, PackageOpen, AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

function stockColor(actual: number, min: number) {
  if (actual === 0) return '#888898'
  if (actual <= min * 0.3) return '#ff4757'
  if (actual <= min) return '#ffb800'
  return '#00c896'
}
function stockLabel(actual: number, min: number) {
  if (actual === 0) return 'Sin stock'
  if (actual <= min * 0.3) return 'Crítico'
  if (actual <= min) return 'Bajo'
  return 'OK'
}

export default function StockPage() {
  const [productos, setProductos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalProducto, setModalProducto] = useState<any | null>(null)
  const [lotesModal, setLotesModal] = useState<any[]>([])
  const [cargandoLotes, setCargandoLotes] = useState(false)
  const [nuevoLote, setNuevoLote] = useState({ numero_lote: '', cantidad: '', fecha_vencimiento: '' })
  const [guardandoLote, setGuardandoLote] = useState(false)
  const [editandoLote, setEditandoLote] = useState<any | null>(null)
  const [nuevoStockLote, setNuevoStockLote] = useState('')
  const [borrandoLote, setBorrandoLote] = useState<string | null>(null)

  useEffect(() => {
    getStockCritico().then(data => {
      setProductos(data)
      setCargando(false)
    }).catch(() => setCargando(false))
  }, [])

  useEffect(() => {
    if (modalProducto) {
      getSiguienteNumeroLote(modalProducto.id).then(num => {
        setNuevoLote(p => ({ ...p, numero_lote: num }))
      })
    }
  }, [modalProducto])

  const abrirModal = async (p: any) => {
    setModalProducto(p)
    setCargandoLotes(true)
    setLotesModal([])
    setEditandoLote(null)
    const lotes = await getLotes(p.id)
    setLotesModal(lotes)
    setCargandoLotes(false)
  }

  const guardarNuevoLote = async () => {
    if (!modalProducto || !nuevoLote.numero_lote || !nuevoLote.cantidad) {
      toast.error('Completá el número de lote y la cantidad')
      return
    }
    setGuardandoLote(true)
    const ok = await agregarLote({
      producto_id: modalProducto.id,
      numero_lote: nuevoLote.numero_lote,
      cantidad: Number(nuevoLote.cantidad),
      fecha_vencimiento: nuevoLote.fecha_vencimiento || undefined,
    })
    if (ok) {
      const nuevaCant = Number(nuevoLote.cantidad)
      setProductos(prev => prev.map(p =>
        p.id === modalProducto.id ? { ...p, stock_actual: p.stock_actual + nuevaCant } : p
      ))
      setModalProducto((prev: any) => ({ ...prev, stock_actual: prev.stock_actual + nuevaCant }))
      const lotes = await getLotes(modalProducto.id)
      setLotesModal(lotes)
      const siguiente = await getSiguienteNumeroLote(modalProducto.id)
      setNuevoLote({ numero_lote: siguiente, cantidad: '', fecha_vencimiento: '' })
      toast.success('Lote agregado correctamente')
    } else {
      toast.error('Error al agregar el lote')
    }
    setGuardandoLote(false)
  }

  const guardarEdicionLote = async () => {
    if (!editandoLote || nuevoStockLote === '') return
    const nuevo = Number(nuevoStockLote)
    const diferencia = nuevo - editandoLote.cantidad
    const { createBrowserClient } = await import('@supabase/ssr')
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.from('lotes').update({ cantidad: nuevo }).eq('id', editandoLote.id)
    await ajustarStock(modalProducto.id, modalProducto.stock_actual + diferencia)
    setProductos(prev => prev.map(p =>
      p.id === modalProducto.id ? { ...p, stock_actual: p.stock_actual + diferencia } : p
    ))
    setModalProducto((prev: any) => ({ ...prev, stock_actual: prev.stock_actual + diferencia }))
    setLotesModal(prev => prev.map(l => l.id === editandoLote.id ? { ...l, cantidad: nuevo } : l))
    setEditandoLote(null)
    setNuevoStockLote('')
    toast.success('Lote actualizado')
  }

  const borrarLote = async (lote: any) => {
    setBorrandoLote(lote.id)
    const ok = await eliminarLote(lote.id, modalProducto.id, lote.cantidad)
    if (ok) {
      setLotesModal(prev => prev.filter(l => l.id !== lote.id))
      setProductos(prev => prev.map(p =>
        p.id === modalProducto.id ? { ...p, stock_actual: Math.max(0, p.stock_actual - lote.cantidad) } : p
      ))
      setModalProducto((prev: any) => ({ ...prev, stock_actual: Math.max(0, prev.stock_actual - lote.cantidad) }))
      toast.success('Lote eliminado')
    } else {
      toast.error('Error al eliminar el lote')
    }
    setBorrandoLote(null)
  }

  const ordenados = [...productos].sort((a, b) => {
    const orden = (p: any) => {
      if (p.stock_actual === 0) return 0
      if (p.stock_actual <= p.stock_minimo * 0.3) return 1
      if (p.stock_actual <= p.stock_minimo) return 2
      return 3
    }
    return orden(a) - orden(b)
  })

  const sinStock = productos.filter(p => p.stock_actual === 0)
  const criticos = productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo * 0.3)
  const bajos = productos.filter(p => p.stock_actual > p.stock_minimo * 0.3 && p.stock_actual <= p.stock_minimo)
  const ok = productos.filter(p => p.stock_actual > p.stock_minimo)

  const inp: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 10px', fontSize: 12, outline: 'none',
    fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)'
  }

  if (cargando) return <Spinner texto="Cargando stock..." />

  return (
    <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Control de Stock</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '2px 0 0' }}>Inventario en tiempo real</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Sin stock', value: sinStock.length, color: '#888898', Icon: XCircle },
          { label: 'Críticos', value: criticos.length, color: '#ff4757', Icon: AlertTriangle },
          { label: 'Stock bajo', value: bajos.length, color: '#ffb800', Icon: PackageOpen },
          { label: 'OK', value: ok.length, color: '#00c896', Icon: CheckCircle },
        ].map(k => {
          const Icon = k.Icon
          return (
            <div key={k.label} style={{ background: 'var(--card)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color: k.color }}>{k.value}</div>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={k.color} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Alertas */}
      {sinStock.length > 0 && (
        <div style={{ background: 'rgba(136,136,152,0.08)', border: '1px solid rgba(136,136,152,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 12, color: 'var(--text2)' }}>
          ⬜ <b style={{ color: 'var(--text)' }}>Sin stock:</b> {sinStock.map(p => p.nombre).join(', ')}
        </div>
      )}
      {criticos.length > 0 && (
        <div style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#ff4757' }}>
          <b>{criticos.length} crítico{criticos.length > 1 ? 's' : ''}:</b> {criticos.map(p => p.nombre).join(', ')}
        </div>
      )}

      {/* Gráfico */}
      <div style={{ background: 'var(--card)', borderRadius: 14, padding: 18, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Stock por producto</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>Stock actual vs mínimo</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={productos.slice(0, 10).map(p => ({
            name: p.nombre.split(' ')[0],
            actual: p.stock_actual,
            minimo: p.stock_minimo,
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text2)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text2)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <Bar dataKey="actual" name="Stock actual" fill="#5b4cff" radius={[4, 4, 0, 0]} />
            <Bar dataKey="minimo" name="Mínimo" fill="rgba(255,71,87,0.3)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Detalle de stock ({productos.length} productos)
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg3)' }}>
              {['Producto', 'SKU', 'Stock actual', 'Mínimo', 'Ideal', 'Estado', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenados.map((p: any) => {
              const sc = stockColor(p.stock_actual, p.stock_minimo)
              const sl = stockLabel(p.stock_actual, p.stock_minimo)
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text)' }}>{p.nombre}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 10, color: 'var(--text2)' }}>{p.sku || '—'}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: sc, fontSize: 14 }}>{p.stock_actual}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{p.stock_minimo}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{p.stock_ideal}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: sc + '22', color: sc, padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600 }}>{sl}</span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <button onClick={() => abrirModal(p)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                      <Pencil size={11} /> Editar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal editar stock + lotes */}
      {modalProducto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: 24, width: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{modalProducto.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Stock actual: <b style={{ color: stockColor(modalProducto.stock_actual, modalProducto.stock_minimo), fontFamily: 'monospace' }}>{modalProducto.stock_actual}</b>
                  {' '}· Mínimo: {modalProducto.stock_minimo}
                </div>
              </div>
              <button onClick={() => { setModalProducto(null); setEditandoLote(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)' }}>✕</button>
            </div>

            {/* Lotes existentes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Lotes existentes</div>
              {cargandoLotes ? (
                <div style={{ fontSize: 12, color: 'var(--text2)', padding: 12, textAlign: 'center' }}>Cargando...</div>
              ) : lotesModal.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text2)', padding: 12, textAlign: 'center', background: 'var(--bg3)', borderRadius: 8 }}>
                  No hay lotes registrados
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lotesModal.map((lote: any) => {
                    const vencido = lote.fecha_vencimiento && new Date(lote.fecha_vencimiento) < new Date()
                    const editando = editandoLote?.id === lote.id
                    return (
                      <div key={lote.id} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: `1px solid ${vencido ? 'rgba(255,71,87,0.3)' : 'var(--border)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text)' }}>{lote.numero_lote}</div>
                            {lote.fecha_vencimiento && (
                              <div style={{ fontSize: 10, color: vencido ? '#ff4757' : 'var(--text2)', marginTop: 2 }}>
                                {vencido ? 'Vencido: ' : 'Vence: '}
                                {new Date(lote.fecha_vencimiento).toLocaleDateString('es-AR')}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)', minWidth: 40, textAlign: 'right' }}>
                            {lote.cantidad}
                          </div>
                          <button onClick={() => { setEditandoLote(lote); setNuevoStockLote(lote.cantidad.toString()) }}
                            style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                            Editar
                          </button>
                          <button onClick={() => borrarLote(lote)} disabled={borrandoLote === lote.id}
                            style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.3)', background: 'var(--bg2)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', color: '#ff4757' }}>
                            {borrandoLote === lote.id ? '...' : '🗑️'}
                          </button>
                        </div>
                        {editando && (
                          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="number" value={nuevoStockLote} onChange={e => setNuevoStockLote(e.target.value)}
                              style={{ ...inp, flex: 1 }} placeholder="Nueva cantidad" autoFocus />
                            <button onClick={guardarEdicionLote}
                              style={{ padding: '7px 12px', borderRadius: 7, background: '#5b4cff', color: 'white', border: 'none', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                              ✓
                            </button>
                            <button onClick={() => setEditandoLote(null)}
                              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit' }}>
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Agregar nuevo lote */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>+ Agregar nuevo lote</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Número de lote *</label>
                  <input value={nuevoLote.numero_lote} onChange={e => setNuevoLote(p => ({ ...p, numero_lote: e.target.value }))}
                    placeholder="Ej: L-2025-05-001" style={inp} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Cantidad *</label>
                    <input value={nuevoLote.cantidad} onChange={e => setNuevoLote(p => ({ ...p, cantidad: e.target.value }))}
                      type="number" placeholder="0" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Fecha vencimiento</label>
                    <input value={nuevoLote.fecha_vencimiento} onChange={e => setNuevoLote(p => ({ ...p, fecha_vencimiento: e.target.value }))}
                      type="date" style={inp} />
                  </div>
                </div>
                <button onClick={guardarNuevoLote} disabled={guardandoLote}
                  style={{ padding: '10px', borderRadius: 9, background: '#00c896', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
                  {guardandoLote ? 'Agregando...' : 'Agregar lote al stock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}