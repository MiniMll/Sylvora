'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getVentas, anularVenta } from '@/lib/supabase/ventas'
import { formatPeso, formatTicketText, shareOrCopy, formatFechaTicket, labelMetodoPago } from '@/lib/utils'
import { puedeAnularVenta } from '@/lib/permissions'
import { Search, TrendingUp, Receipt, Hash, X, AlertTriangle, Printer, Share2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePermissions } from '@/components/PermissionsProvider'
import { TicketReceipt } from '@/components/TicketReceipt'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import type { Venta } from '@/types/database'

export default function VentasPage() {
  const { rol } = usePermissions()
  const [ventas, setVentas] = useState<Venta[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<Venta | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroMetodo, setFiltroMetodo] = useState('todos')
  const [filtroFecha, setFiltroFecha] = useState('todo')
  const [confirmarAnular, setConfirmarAnular] = useState(false)
  const [anulando, setAnulando] = useState(false)

  useEffect(() => {
    getVentas().then(data => { setVentas(data); setCargando(false) })
  }, [])

  const ventasFiltradas = ventas.filter(v => {
    const matchMetodo = filtroMetodo === 'todos' || v.metodo_pago === filtroMetodo
    // Búsqueda mejorada (P0-5): si el query es un número >0 lo
    // comparamos como monto exacto (evita "1500" matchee $115.000).
    // Strings buscan por ticket o método.
    const matchBusq = (() => {
      if (!busqueda) return true
      const numBusq = Number(busqueda)
      if (Number.isFinite(numBusq) && numBusq > 0 && Number(v.total) === numBusq) return true
      const q = busqueda.toLowerCase()
      return String(v.numero_ticket).includes(busqueda) ||
        v.metodo_pago.toLowerCase().includes(q)
    })()
    const hoy = new Date()
    const fechaVenta = new Date(v.created_at)
    const matchFecha = filtroFecha === 'todo' ? true
      : filtroFecha === 'hoy' ? fechaVenta.toDateString() === hoy.toDateString()
      : filtroFecha === 'semana' ? (hoy.getTime() - fechaVenta.getTime()) < 7 * 24 * 60 * 60 * 1000
      : filtroFecha === 'mes' ? fechaVenta.getMonth() === hoy.getMonth() && fechaVenta.getFullYear() === hoy.getFullYear()
      : true
    return matchMetodo && matchBusq && matchFecha
  })

  const handleImprimir = () => {
    // El printable off-screen tiene data-printable; CSS @media print
    // se encarga de aislar solo ese subtree. Tiny delay para asegurar
    // que cualquier render pendiente del componente esté commiteado
    // antes de invocar window.print().
    setTimeout(() => window.print(), 50)
  }

  const handleCompartir = async () => {
    if (!detalle) return
    const text = formatTicketText(detalle)
    const r = await shareOrCopy(text, `Ticket #${String(detalle.numero_ticket).padStart(4, '0')}`)
    if (r === 'copied') toast.success('Ticket copiado al portapapeles', { id: 'venta-share' })
    else if (r === 'error') toast.error('No se pudo compartir', { id: 'venta-share' })
    // 'shared' y 'cancelled' → silencioso (el OS ya dio feedback)
  }

  const handleAnular = async () => {
    if (!detalle || anulando) return
    setAnulando(true)
    const r = await anularVenta(detalle)
    if (!r.ok) {
      toast.error(r.error || 'No se pudo anular la venta', { id: 'venta-anular' })
      setAnulando(false)
      setConfirmarAnular(false)
      return
    }
    // Update local — venta marcada como anulada en la lista y en el modal.
    setVentas(prev => prev.map(v => v.id === detalle.id ? { ...v, estado: 'anulada' } : v))
    setDetalle(prev => prev ? { ...prev, estado: 'anulada' } : null)
    toast.success(`Ticket #${String(detalle.numero_ticket).padStart(4, '0')} anulado. Stock restituido.`, { id: 'venta-anular' })
    setAnulando(false)
    setConfirmarAnular(false)
  }

  const totalFiltrado = ventasFiltradas.reduce((s, v) => s + Number(v.total), 0)
  const ticketProm = ventasFiltradas.length ? Math.round(totalFiltrado / ventasFiltradas.length) : 0

  if (cargando) return (
    <div className="page-in" style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Skeleton width={200} height={26} radius={6} />
        <Skeleton width={280} height={13} radius={4} style={{ marginTop: 8 }} />
      </div>
      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ background: 'var(--card)', borderRadius: 16, padding: '14px 16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Skeleton width={80} height={10} radius={3} style={{ marginBottom: 8 }} />
            <Skeleton width={120} height={22} radius={5} />
          </div>
        ))}
      </div>
      {/* Filtros */}
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: '12px 16px', border: '1px solid var(--border)', marginBottom: 12, display: 'flex', gap: 8 }}>
        <Skeleton style={{ flex: 1, minWidth: 180 }} height={28} radius={6} />
        <Skeleton width={160} height={28} radius={6} />
        <Skeleton width={140} height={28} radius={6} />
      </div>
      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <Skeleton width={100} height={14} radius={4} />
          <Skeleton width={70} height={11} radius={3} />
        </div>
        {Array.from({ length: 8 }).map((_, j) => (
          <div key={j} style={{ padding: '11px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'center' }}>
            <Skeleton width={70} height={11} radius={3} />
            <Skeleton width={50} height={11} radius={3} />
            <Skeleton width={80} height={11} radius={3} />
            <Skeleton style={{ flex: 1 }} height={11} radius={3} />
            <Skeleton width={70} height={13} radius={4} />
            <Skeleton width={55} height={16} radius={999} />
          </div>
        ))}
      </div>
    </div>
  )

  // Estilo del search con icono inline — wrapping con <Search> requiere
  // estructura propia, se mantiene fuera de la primitiva <Input>.
  const inpSearch: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px',
    fontSize: 12, outline: 'none', fontFamily: 'inherit',
    background: 'var(--bg2)', color: 'var(--text)'
  }

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Historial de Ventas</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>Hacé click en una venta para ver el detalle</p>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {[
          { label: 'Total período', value: formatPeso(totalFiltrado), icon: TrendingUp, color: '#5b4cff' },
          { label: 'Ticket promedio', value: formatPeso(ticketProm), icon: Receipt, color: '#00c896' },
          { label: 'Transacciones', value: ventasFiltradas.length.toString(), icon: Hash, color: '#ff6b35' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} style={{ background: 'var(--card)', borderRadius: 16, padding: '14px 16px', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{k.value}</div>
                </div>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={15} color={k.color} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: '12px 16px', border: '1px solid var(--border)', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} color="var(--text2)" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por ticket, monto..."
            style={{ ...inpSearch, width: '100%', paddingLeft: 28 }} />
        </div>
        <Select value={filtroMetodo} onChange={e => setFiltroMetodo(e.target.value)} style={{ width: 'auto' }}>
          <option value="todos">Todos los métodos</option>
          <option value="efectivo">Efectivo</option>
          <option value="debito">Débito</option>
          <option value="credito">Crédito</option>
          <option value="mercadopago">Mercado Pago</option>
        </Select>
        <Select value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} style={{ width: 'auto' }}>
          <option value="todo">Todo el historial</option>
          <option value="hoy">Hoy</option>
          <option value="semana">Esta semana</option>
          <option value="mes">Este mes</option>
        </Select>
        {(busqueda || filtroMetodo !== 'todos' || filtroFecha !== 'todo') && (
          <button onClick={() => { setBusqueda(''); setFiltroMetodo('todos'); setFiltroFecha('todo') }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 11, color: 'var(--text2)', fontFamily: 'inherit' }}>
            <X size={11} /> Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Ventas</span>
          <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>{ventasFiltradas.length} resultados</span>
        </div>
        {ventasFiltradas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Search size={18} color="var(--text2)" strokeWidth={1.8} /></div>
            <div className="empty-sub">No hay ventas que coincidan con los filtros</div>
          </div>
        ) : (
          <div className="table-scroll">
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Fecha', 'Ticket', 'Método', 'Descuento', 'Recargo', 'Total', 'Estado', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map((v) => {
                const isAnulada = v.estado === 'anulada'
                return (
                  <tr key={v.id}
                    // Sin hover si anulada: comunica "esta fila ya está
                    // cerrada, no hay acción nueva". Sigue clickeable
                    // para abrir el detalle (acción primaria = leer).
                    className={isAnulada ? undefined : 'row-hover'}
                    style={{
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                      opacity: isAnulada ? 0.55 : 1,
                    }}
                    onClick={() => setDetalle(v)}>
                    <td style={{ padding: '9px 12px', color: 'var(--text2)', fontSize: 11 }}>
                      {new Date(v.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
                      #{String(v.numero_ticket).padStart(4, '0')}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text)', textTransform: 'capitalize' }}>{v.metodo_pago}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--g)', fontWeight: 500 }}>
                      {v.descuento_porcentaje > 0 ? `-${v.descuento_porcentaje}%` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--r)', fontWeight: 500 }}>
                      {v.recargo_porcentaje > 0 ? `+${v.recargo_porcentaje}%` : '—'}
                    </td>
                    <td style={{
                      padding: '9px 12px',
                      fontFamily: 'DM Mono, monospace',
                      fontWeight: 600,
                      color: isAnulada ? 'var(--text2)' : 'var(--ac)',
                      textDecoration: isAnulada ? 'line-through' : 'none',
                    }}>
                      {formatPeso(v.total)}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: isAnulada ? 'rgba(255,71,87,0.12)' : 'rgba(0,200,150,0.1)',
                        color: isAnulada ? 'var(--r)' : 'var(--g)',
                        padding: '3px 9px', borderRadius: 999,
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
                        // Cursor not-allowed sólo en el badge anulada para
                        // reforzar "este estado es final, no hay acción".
                        cursor: isAnulada ? 'not-allowed' : 'default',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: isAnulada ? 'var(--r)' : 'var(--g)' }} />
                        {isAnulada ? 'Anulada' : v.estado}
                      </span>
                    </td>
                    <td style={{
                      padding: '9px 12px',
                      // En anulada el "Ver" se vuelve neutro: la fila
                      // sigue clickeable para leer pero no sugiere
                      // acción nueva.
                      color: isAnulada ? 'var(--text2)' : 'var(--ac)',
                      fontSize: 11,
                    }}>Ver</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {detalle && (() => {
        const isAnulada = detalle.estado === 'anulada'
        const permiso = puedeAnularVenta(detalle, { rol })
        return (
        <Modal open onClose={() => setDetalle(null)} size="md">
          <div style={{ margin: -18 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  Ticket #{String(detalle.numero_ticket).padStart(4, '0')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, textTransform: 'capitalize' }}>
                  {formatFechaTicket(detalle.created_at)}
                </div>
              </div>
              <button onClick={() => setDetalle(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Banner anulada — feedback visual fuerte. */}
            {isAnulada && (
              <div style={{
                background: 'rgba(255,71,87,0.08)',
                borderBottom: '1px solid rgba(255,71,87,0.18)',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <AlertTriangle size={16} color="#ff4757" strokeWidth={1.8} />
                <div style={{ fontSize: 12, color: 'var(--r)', fontWeight: 600 }}>
                  Esta venta fue anulada. El stock fue restituido al inventario.
                </div>
              </div>
            )}

            <div style={{ padding: 20 }}>
              {/* Items */}
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 10 }}>
                  Productos vendidos
                </div>
                {detalle.items_venta && detalle.items_venta.length > 0 ? (
                  detalle.items_venta.map((item: any) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{item.nombre_producto}</div>
                        <div style={{ fontSize: 10, color: 'var(--text2)' }}>
                          {item.cantidad} x {formatPeso(item.precio_unitario)}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--ac)' }}>
                        {formatPeso(item.subtotal)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Sin detalle de productos</div>
                )}
              </div>

              {/* Totales */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
                  <span>Subtotal</span>
                  <span style={{ fontFamily: 'DM Mono, monospace' }}>{formatPeso(detalle.subtotal)}</span>
                </div>
                {detalle.descuento_porcentaje > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--g)', marginBottom: 5 }}>
                    <span>Descuento -{detalle.descuento_porcentaje}%</span>
                    <span style={{ fontFamily: 'DM Mono, monospace' }}>-{formatPeso(detalle.descuento_monto)}</span>
                  </div>
                )}
                {detalle.recargo_porcentaje > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--r)', marginBottom: 5 }}>
                    <span>Recargo +{detalle.recargo_porcentaje}%</span>
                    <span style={{ fontFamily: 'DM Mono, monospace' }}>+{formatPeso(detalle.recargo_monto)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text)' }}>TOTAL</span>
                  <span style={{
                    fontFamily: 'DM Mono, monospace',
                    color: isAnulada ? 'var(--text2)' : 'var(--ac)',
                    textDecoration: isAnulada ? 'line-through' : 'none',
                  }}>{formatPeso(detalle.total)}</span>
                </div>
              </div>

              {/* Método */}
              <div style={{ marginTop: 12, background: 'rgba(91,76,255,0.05)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text2)' }}>Método de pago</span>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{labelMetodoPago(detalle.metodo_pago)}</span>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <Button variant="ghost" icon={<Printer size={14} />} onClick={handleImprimir} title="Imprimir ticket"
                  style={{ flex: '1 1 auto', minWidth: 100 }}>
                  Imprimir
                </Button>
                <Button variant="ghost" icon={<Share2 size={14} />} onClick={handleCompartir} title="Compartir ticket"
                  style={{ flex: '1 1 auto', minWidth: 100 }}>
                  Compartir
                </Button>
                {permiso.allowed && (
                  <button
                    onClick={() => setConfirmarAnular(true)}
                    disabled={anulando}
                    style={{
                      flex: '1 1 auto', minWidth: 100,
                      padding: '10px', borderRadius: 8,
                      background: 'var(--bg2)', color: 'var(--r)',
                      border: '1px solid rgba(255,71,87,0.3)',
                      fontSize: 13, fontWeight: 600,
                      cursor: anulando ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: anulando ? 0.6 : 1,
                    }}>
                    Anular venta
                  </button>
                )}
                <Button variant="primary" onClick={() => setDetalle(null)} style={{ flex: '1 1 100%' }}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </Modal>
        )
      })()}

      {/* Ticket printable off-screen — usado solo por window.print().
          Mismo componente que POSPayment para garantizar consistencia
          entre el flujo post-cobro y el de historial. */}
      {detalle && (
        <div data-printable className="print-only">
          <TicketReceipt venta={detalle} />
        </div>
      )}

      {/* Confirmación anular */}
      <Modal
        open={!!confirmarAnular && !!detalle}
        onClose={() => { if (!anulando) setConfirmarAnular(false) }}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmarAnular(false)} disabled={anulando} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleAnular} loading={anulando} style={{ flex: 1 }}>
              {anulando ? 'Anulando…' : 'Sí, anular'}
            </Button>
          </>
        }>
        {detalle && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(255,71,87,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <AlertTriangle size={26} color="#ff4757" strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              ¿Anular esta venta?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.5 }}>
              Se marcará el ticket #{String(detalle.numero_ticket).padStart(4, '0')} como anulado
              y se devolverá el stock al inventario.
            </div>
            <div style={{
              fontSize: 12, color: 'var(--r)',
              background: 'rgba(255,71,87,0.06)',
              borderRadius: 8, padding: '8px 12px',
            }}>
              Esta acción no se puede deshacer.
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}