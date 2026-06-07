'use client'
import { useEffect, useState } from 'react'
import { getStockCritico } from '@/lib/supabase/productos'
import { getLotes, agregarLote, getSiguienteNumeroLote, eliminarLote } from '@/lib/supabase/stock'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { Pencil, PackageOpen, AlertTriangle, CheckCircle, XCircle, Trash2, Loader2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePermissions } from '@/components/PermissionsProvider'
import { stockColor, stockLabel, formatVencimiento } from '@/lib/utils'

export default function StockPage() {
  const { has } = usePermissions()
  const puedeEditar = has('producto.editar')
  const puedeGestionarLotes = has('lote.gestionar')
  const [productos, setProductos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalProducto, setModalProducto] = useState<any | null>(null)
  const [lotesModal, setLotesModal] = useState<any[]>([])
  const [cargandoLotes, setCargandoLotes] = useState(false)
  const [nuevoLote, setNuevoLote] = useState({ numero_lote: '', cantidad: '', fecha_vencimiento: '' })
  const [guardandoLote, setGuardandoLote] = useState(false)
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
      toast.error('No pudimos agregar el lote. Probá de nuevo.')
    }
    setGuardandoLote(false)
  }

  // DESHABILITADO V2 — edit de cantidad de un lote era no-atómico:
  //   UPDATE lotes.cantidad (directo, sin RPC) + ajustarStock
  // Tras el fix V2, ajustarStock va por ajustar_stock_atomico que
  // RECHAZA productos con lotes (porque rompe el invariante). El
  // flujo entero quedó roto.
  //
  // Workaround V2: el comerciante puede borrar el lote (atomic) y
  // agregar uno nuevo con la cantidad correcta. La UI esconde el
  // botón "Editar" de cada lote — solo "Borrar".
  //
  // Restauración V3: una RPC editar_lote_atomico(lote_id, nueva_cantidad)
  // que en una transacción UPDATEa lote + ajusta stock_actual con la
  // diferencia. ~15 líneas de SQL.

  const borrarLote = async (lote: any) => {
    setBorrandoLote(lote.id)
    const ok = await eliminarLote(lote.id)
    if (ok) {
      setLotesModal(prev => prev.filter(l => l.id !== lote.id))
      setProductos(prev => prev.map(p =>
        p.id === modalProducto.id ? { ...p, stock_actual: Math.max(0, p.stock_actual - lote.cantidad) } : p
      ))
      setModalProducto((prev: any) => ({ ...prev, stock_actual: Math.max(0, prev.stock_actual - lote.cantidad) }))
      toast.success('Lote eliminado')
    } else {
      toast.error('No pudimos eliminar el lote. Probá de nuevo.')
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

  if (cargando) return <Spinner texto="Cargando stock..." />

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Control de Stock</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>Inventario en tiempo real</p>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {[
          { label: 'Sin stock', value: sinStock.length, color: '#888898', Icon: XCircle },
          { label: 'Críticos', value: criticos.length, color: '#ff4757', Icon: AlertTriangle },
          { label: 'Stock bajo', value: bajos.length, color: '#ffb800', Icon: PackageOpen },
          { label: 'OK', value: ok.length, color: '#00c896', Icon: CheckCircle },
        ].map(k => {
          const Icon = k.Icon
          return (
            <div key={k.label} style={{ background: 'var(--card)', borderRadius: 16, padding: '14px 16px', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: k.color }}>{k.value}</div>
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
        <div style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'var(--r)' }}>
          <b>{criticos.length} crítico{criticos.length > 1 ? 's' : ''}:</b> {criticos.map(p => p.nombre).join(', ')}
        </div>
      )}

      {/* Gráfico */}
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: 18, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, letterSpacing: '-0.2px', color: 'var(--text)',}}>Stock por producto</div>
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
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Detalle de stock ({productos.length} productos)
        </div>
        <div className="table-scroll">
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg3)' }}>
              {['Producto', 'SKU', 'Stock actual', 'Mínimo', 'Ideal', 'Estado', ''].map((h, i) => (
                <th key={h} className={i === 0 ? 'sticky-col' : undefined} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500, background: 'var(--bg3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenados.map((p: any) => {
              const sc = stockColor(p.stock_actual, p.stock_minimo)
              const sl = stockLabel(p.stock_actual, p.stock_minimo)
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="sticky-col" style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text)' }}>{p.nombre}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text2)' }}>{p.sku || '—'}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: sc, fontSize: 14 }}>{p.stock_actual}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{p.stock_minimo}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{p.stock_ideal}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: sc + '22', color: sc, padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600 }}>{sl}</span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    {puedeEditar && (
                      <button onClick={() => abrirModal(p)}
                        style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                        <Pencil size={11} /> Editar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modal editar stock + lotes */}
      <Modal
        open={!!modalProducto}
        onClose={() => setModalProducto(null)}
        size="md">
        {modalProducto && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{modalProducto.nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                Stock actual: <b style={{ color: stockColor(modalProducto.stock_actual, modalProducto.stock_minimo), fontFamily: 'DM Mono, monospace' }}>{modalProducto.stock_actual}</b>
                {' '}· Mínimo: {modalProducto.stock_minimo}
              </div>
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
                    const venc = formatVencimiento(lote.fecha_vencimiento)
                    return (
                      <div key={lote.id} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', border: `1px solid ${vencido ? 'rgba(255,71,87,0.3)' : 'var(--border)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{lote.numero_lote}</div>
                            {venc.texto && (
                              <div style={{ fontSize: 10, color: venc.color, marginTop: 2 }}>{venc.texto}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)', minWidth: 40, textAlign: 'right' }}>
                            {lote.cantidad}
                          </div>
                          {/* "Editar lote" removido V2 — el flujo era no-atómico
                              y el RPC ajustar_stock_atomico rechaza productos
                              con lotes. Workaround V2: borrar y agregar de
                              nuevo. Reapertura en V3 con editar_lote_atomico. */}
                          {puedeGestionarLotes && (
                            <button onClick={() => borrarLote(lote)} disabled={borrandoLote === lote.id}
                              aria-label="Borrar lote"
                              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.3)', background: 'var(--bg2)', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {borrandoLote === lote.id
                                ? <Loader2 size={12} color="var(--r)" style={{ animation: 'spin 0.8s linear infinite' }} />
                                : <Trash2 size={12} color="#ff4757" strokeWidth={2} />
                              }
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Agregar nuevo lote — solo si tiene permiso */}
            {puedeGestionarLotes && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>+ Agregar nuevo lote</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Número de lote *</label>
                  <Input value={nuevoLote.numero_lote} onChange={e => setNuevoLote(p => ({ ...p, numero_lote: e.target.value }))}
                    placeholder="Ej: L-2025-05-001" style={{ padding: '8px 10px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Cantidad *</label>
                    <Input value={nuevoLote.cantidad} onChange={e => setNuevoLote(p => ({ ...p, cantidad: e.target.value }))}
                      type="number" placeholder="0" style={{ padding: '8px 10px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Fecha vencimiento</label>
                    <Input value={nuevoLote.fecha_vencimiento} onChange={e => setNuevoLote(p => ({ ...p, fecha_vencimiento: e.target.value }))}
                      type="date" style={{ padding: '8px 10px' }} />
                  </div>
                </div>
                <Button variant="success" onClick={guardarNuevoLote} loading={guardandoLote} style={{ marginTop: 4 }}>
                  {guardandoLote ? 'Agregando...' : 'Agregar lote al stock'}
                </Button>
              </div>
            </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}