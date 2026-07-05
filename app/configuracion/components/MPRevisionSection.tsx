'use client'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Layers, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatPeso } from '@/lib/utils'
import { guardarVenta, esErrorStockInsuficiente, esErrorDriftLotes, buscarVentaPorTicket } from '@/lib/supabase/ventas'
import {
  obtenerColaRevisionMP,
  resolverCobroRevisionMP,
  MPClientFetchError,
  type ColaRevisionResponse,
  type IntentoRevisionMP,
} from '@/lib/mp/client-fetch'

// Sección "Cobros a revisar" del Tab Mercado Pago. ADMIN-ONLY (el
// tab entero ya está gateado; el endpoint devuelve 403 igual como
// segunda capa).
//
// Cola: intentos donde MP cobró pero la venta no quedó registrada
// (requiere_revision + huérfanos detectados por el lazy-promote del
// GET). Cada fila ofrece las 4 resoluciones; TODAS pasan por el
// endpoint del Commit 4 → RPC transaccional. Cero lógica manual de
// estados en el frontend.
//
// "Registrar venta" es el único camino con paso previo client-side:
// reusa el flow guardarVenta EXISTENTE (misma RPC de stock que el
// POS — la venta se crea con timestamp actual, decisión aprobada) y
// recién después resuelve vía RPC con la venta creada.

type ModalAccion =
  | { tipo: 'registrar'; intento: IntentoRevisionMP }
  | { tipo: 'asociar'; intento: IntentoRevisionMP }
  | { tipo: 'reembolsado'; intento: IntentoRevisionMP }
  | { tipo: 'descartar'; intento: IntentoRevisionMP }
  | null

function formatAntiguedad(minutos: number | null): string {
  if (minutos === null) return '—'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

function formatFechaHora(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

const MOTIVO_LABEL: Record<string, string> = {
  huerfano_detectado: 'Venta sin completar',
  pago_post_cancelacion: 'Pagó tras cancelar/vencer',
}

function labelMotivo(motivo: string | null): string {
  if (!motivo) return 'Sin motivo registrado'
  return MOTIVO_LABEL[motivo] ?? motivo
}

const ACCION_LABEL: Record<string, string> = {
  venta_registrada: 'Venta registrada',
  venta_asociada: 'Venta asociada',
  reembolsado: 'Reembolsado',
  descartado: 'Descartado',
}

export function MPRevisionSection() {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ColaRevisionResponse | null>(null)
  const [modal, setModal] = useState<ModalAccion>(null)
  const [resolviendo, setResolviendo] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(false)
  // Estado del modal "descartar".
  const [nota, setNota] = useState('')
  // Estado del modal "asociar".
  const [ticketInput, setTicketInput] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [ventaEncontrada, setVentaEncontrada] = useState<Awaited<ReturnType<typeof buscarVentaPorTicket>>>(null)
  const [busquedaHecha, setBusquedaHecha] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await obtenerColaRevisionMP()
      setData(res)
    } catch (e) {
      if (e instanceof MPClientFetchError && e.status === 403) {
        // El tab ya es admin-only — si igual llega un 403, mostramos
        // vacío silencioso (no es un error operativo).
        setData({ intentos: [], resueltos: [], promovidos: 0 })
      } else {
        setError(e instanceof Error ? e.message : 'No pudimos cargar la cola de revisión')
      }
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    // Mismo patrón que TabMercadoPago: cargar() setea loading al
    // arrancar — fetch inicial legítimo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
  }, [cargar])

  const cerrarModal = () => {
    if (resolviendo) return
    setModal(null)
    setNota('')
    setTicketInput('')
    setVentaEncontrada(null)
    setBusquedaHecha(false)
  }

  // ── Resoluciones (todas vía endpoint → RPC) ───────────────────────

  const resolver = async (
    intentoId: string,
    accion: 'venta_registrada' | 'venta_asociada' | 'reembolsado' | 'descartado',
    opts?: { ventaId?: string; nota?: string },
  ): Promise<boolean> => {
    try {
      await resolverCobroRevisionMP(intentoId, accion, opts)
      toast.success(`Cobro resuelto: ${ACCION_LABEL[accion].toLowerCase()}`)
      return true
    } catch (e) {
      if (e instanceof MPClientFetchError && e.status === 409) {
        toast.error('El cobro ya no está en revisión — puede haberlo resuelto otro administrador.')
        return true   // refrescar igual: el estado real cambió
      }
      toast.error(e instanceof Error ? e.message : 'No pudimos resolver el cobro')
      return false
    }
  }

  const onRegistrarVenta = async () => {
    if (modal?.tipo !== 'registrar' || resolviendo) return
    const snap = modal.intento.items_snapshot
    if (!snap) return
    setResolviendo(true)
    try {
      // 1. Crear la venta con el flow existente (misma validación
      //    atómica de stock que el POS). Timestamp actual — decisión
      //    aprobada; pagado_en queda como dato histórico del cobro.
      const result = await guardarVenta({
        subtotal: snap.subtotal,
        descuento_porcentaje: snap.descuento_porcentaje,
        descuento_monto: snap.descuento_monto,
        recargo_porcentaje: snap.recargo_porcentaje,
        recargo_monto: snap.recargo_monto,
        total: snap.total,
        metodo_pago: 'mercadopago',
        items: snap.items.map(i => ({
          producto_id: i.producto_id ?? '',
          nombre_producto: i.nombre_producto,
          precio_unitario: i.precio_unitario,
          cantidad: i.cantidad,
          subtotal: i.subtotal,
          peso_kg: i.peso_kg,
        })),
      })

      if (esErrorStockInsuficiente(result)) {
        toast.error(
          `Sin stock de ${result.nombre} (quedan ${result.disponible}, la venta pedía ${result.pedido}). Ajustá el stock o resolvé por otra vía.`,
          { duration: 8000 },
        )
        return
      }
      if (esErrorDriftLotes(result)) {
        toast.error('Hay una inconsistencia de stock/lotes que impide registrar la venta. Corregila primero desde Stock.', { duration: 8000 })
        return
      }
      if (!result || !('id' in result)) {
        toast.error('No pudimos registrar la venta. Probá de nuevo.')
        return
      }

      // 2. Resolver vía RPC con la venta recién creada.
      const ok = await resolver(modal.intento.intento_id, 'venta_registrada', { ventaId: result.id })
      if (ok) {
        cerrarModal()
        await cargar()
      }
    } finally {
      setResolviendo(false)
    }
  }

  const onBuscarTicket = async () => {
    const numero = Number(ticketInput.trim())
    if (!Number.isInteger(numero) || numero <= 0) {
      toast.error('Ingresá un número de ticket válido')
      return
    }
    setBuscando(true)
    try {
      const venta = await buscarVentaPorTicket(numero)
      setVentaEncontrada(venta)
      setBusquedaHecha(true)
    } finally {
      setBuscando(false)
    }
  }

  const onAsociarVenta = async () => {
    if (modal?.tipo !== 'asociar' || !ventaEncontrada || resolviendo) return
    setResolviendo(true)
    try {
      const ok = await resolver(modal.intento.intento_id, 'venta_asociada', { ventaId: ventaEncontrada.id })
      if (ok) {
        cerrarModal()
        await cargar()
      }
    } finally {
      setResolviendo(false)
    }
  }

  const onReembolsado = async () => {
    if (modal?.tipo !== 'reembolsado' || resolviendo) return
    setResolviendo(true)
    try {
      const ok = await resolver(modal.intento.intento_id, 'reembolsado')
      if (ok) {
        cerrarModal()
        await cargar()
      }
    } finally {
      setResolviendo(false)
    }
  }

  const onDescartar = async () => {
    if (modal?.tipo !== 'descartar' || resolviendo) return
    if (!nota.trim()) {
      toast.error('La nota es obligatoria para descartar')
      return
    }
    setResolviendo(true)
    try {
      const ok = await resolver(modal.intento.intento_id, 'descartado', { nota: nota.trim() })
      if (ok) {
        cerrarModal()
        await cargar()
      }
    } finally {
      setResolviendo(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="var(--w)" strokeWidth={2} />
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Cobros a revisar
          </h3>
          {data && data.intentos.length > 0 && (
            <span style={{
              background: 'rgba(255,60,60,0.12)', color: 'var(--r)',
              padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            }}>
              {data.intentos.length}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void cargar()} disabled={cargando}
          icon={<RefreshCw size={13} className={cargando ? 'mp-rev-spin' : undefined} />}>
          Actualizar
        </Button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Pagos que Mercado Pago confirmó pero cuya venta no quedó registrada en Sylvora.
        El dinero está en tu cuenta de Mercado Pago — resolvé cada caso para que la
        contabilidad cierre.
      </p>

      {/* Estados */}
      {cargando && !data && (
        <div style={{ padding: 24 }}><Spinner texto="Cargando cobros..." /></div>
      )}

      {error && (
        <EmptyState
          icon={<AlertTriangle size={20} color="var(--r)" strokeWidth={2} />}
          title="No pudimos cargar la cola."
          description={error}
          actions={[{ label: 'Reintentar', onClick: () => void cargar(), variant: 'primary' }]}
        />
      )}

      {data && data.intentos.length === 0 && !error && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <CheckCircle size={17} color="var(--g)" strokeWidth={2} />
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>
            No hay cobros pendientes de revisión. Todo conciliado.
          </span>
        </div>
      )}

      {/* Cola */}
      {data && data.intentos.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div className="table-scroll">
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Monto', 'Pagado', 'Antigüedad', 'Motivo', 'Payment ID', 'Snapshot', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.intentos.map(i => (
                  <tr key={i.intento_id} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--text)' }}>
                      {formatPeso(i.monto)}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{formatFechaHora(i.pagado_en)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{formatAntiguedad(i.antiguedad_minutos)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        background: i.tipo === 'huerfano_detectado' ? 'rgba(255,184,0,0.14)' : 'rgba(255,60,60,0.10)',
                        color: i.tipo === 'huerfano_detectado' ? 'var(--w)' : 'var(--r)',
                        padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      }}>
                        {labelMotivo(i.motivo)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text2)' }}>
                      {i.mp_payment_id ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {i.tiene_snapshot ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--g)', fontSize: 11, fontWeight: 600 }}>
                          <Layers size={11} /> {i.items_snapshot?.items.length ?? 0} items
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text2)', fontSize: 11 }}>Sin snapshot</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Button variant="primary" size="sm" disabled={!i.tiene_snapshot}
                          title={i.tiene_snapshot ? undefined : 'Este cobro no guardó el detalle del carrito'}
                          onClick={() => setModal({ tipo: 'registrar', intento: i })}>
                          Registrar venta
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setModal({ tipo: 'asociar', intento: i })}>
                          Asociar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setModal({ tipo: 'reembolsado', intento: i })}>
                          Reembolsado
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setModal({ tipo: 'descartar', intento: i })}>
                          Descartar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial de resueltos */}
      {data && data.resueltos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => setHistorialAbierto(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none',
              border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600, color: 'var(--text2)',
            }}>
            {historialAbierto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Resueltos ({data.resueltos.length})
          </button>
          {historialAbierto && (
            <div style={{ marginTop: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg3)' }}>
                      {['Fecha', 'Monto', 'Acción', 'Resuelto por', 'Venta', 'Nota'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.resueltos.map(r => (
                      <tr key={r.resolucion_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{formatFechaHora(r.fecha)}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>
                          {r.monto !== null ? formatPeso(r.monto) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--text)' }}>{ACCION_LABEL[r.accion] ?? r.accion}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{r.resuelto_por ?? '—'}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>
                          {r.venta_numero_ticket !== null ? `#${String(r.venta_numero_ticket).padStart(4, '0')}` : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--text2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nota ?? undefined}>
                          {r.nota ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Registrar venta desde snapshot ── */}
      <Modal
        open={modal?.tipo === 'registrar'}
        onClose={cerrarModal}
        title="Registrar venta"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarModal} disabled={resolviendo} style={{ flex: 1 }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void onRegistrarVenta()} loading={resolviendo} style={{ flex: 1 }}>
              {resolviendo ? 'Registrando...' : 'Registrar venta'}
            </Button>
          </>
        }>
        {modal?.tipo === 'registrar' && modal.intento.items_snapshot && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              Se va a crear la venta con los items exactos del cobro (descuenta stock,
              con fecha de hoy). El pago original fue el {formatFechaHora(modal.intento.pagado_en)}.
            </p>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
              {modal.intento.items_snapshot.items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ color: 'var(--text)' }}>
                    <b style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text2)', fontWeight: 500, marginRight: 6 }}>×{it.cantidad}</b>
                    {it.nombre_producto}
                  </span>
                  <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>{formatPeso(it.subtotal)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--ac)' }}>{formatPeso(modal.intento.items_snapshot.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Asociar venta existente ── */}
      <Modal
        open={modal?.tipo === 'asociar'}
        onClose={cerrarModal}
        title="Asociar a venta existente"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarModal} disabled={resolviendo} style={{ flex: 1 }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void onAsociarVenta()} loading={resolviendo}
              disabled={!ventaEncontrada || resolviendo} style={{ flex: 1 }}>
              Asociar
            </Button>
          </>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            Si la venta ya quedó registrada (por ejemplo, la cargaste a mano), buscala
            por número de ticket y asociala a este cobro.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              size="md"
              type="number"
              inputMode="numeric"
              placeholder="N° de ticket"
              value={ticketInput}
              onChange={e => { setTicketInput(e.target.value); setBusquedaHecha(false); setVentaEncontrada(null) }}
              disabled={buscando || resolviendo}
            />
            <Button variant="ghost" onClick={() => void onBuscarTicket()} loading={buscando} icon={<Search size={13} />}>
              Buscar
            </Button>
          </div>
          {busquedaHecha && !ventaEncontrada && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--r)' }}>No encontramos una venta con ese ticket.</p>
          )}
          {ventaEncontrada && (
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>Ticket #{String(ventaEncontrada.numero_ticket).padStart(4, '0')}</span>
                <b style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{formatPeso(Number(ventaEncontrada.total))}</b>
              </div>
              <div style={{ color: 'var(--text2)' }}>
                {formatFechaHora(ventaEncontrada.created_at)} · {ventaEncontrada.metodo_pago}
                {ventaEncontrada.estado === 'anulada' && <span style={{ color: 'var(--r)', fontWeight: 600 }}> · ANULADA</span>}
              </div>
              {modal?.tipo === 'asociar' && Math.abs(Number(ventaEncontrada.total) - modal.intento.monto) > 0.01 && (
                <div style={{ color: 'var(--w)', fontWeight: 600 }}>
                  ⚠️ El total de la venta no coincide con el monto cobrado ({formatPeso(modal.intento.monto)}).
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Modal: Reembolsado ── */}
      <Modal
        open={modal?.tipo === 'reembolsado'}
        onClose={cerrarModal}
        title="Marcar como reembolsado"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarModal} disabled={resolviendo} style={{ flex: 1 }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void onReembolsado()} loading={resolviendo} style={{ flex: 1 }}>
              Confirmar
            </Button>
          </>
        }>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Confirmá que ya le devolviste el dinero al cliente <b>desde el panel de
          Mercado Pago</b>{modal?.tipo === 'reembolsado' ? <> (pago <span style={{ fontFamily: 'DM Mono, monospace' }}>{modal.intento.mp_payment_id ?? 'sin id'}</span>, {formatPeso(modal.intento.monto)})</> : null}.
          Sylvora solo registra la resolución — no ejecuta la devolución.
        </p>
      </Modal>

      {/* ── Modal: Descartar ── */}
      <Modal
        open={modal?.tipo === 'descartar'}
        onClose={cerrarModal}
        title="Descartar cobro"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarModal} disabled={resolviendo} style={{ flex: 1 }}>Cancelar</Button>
            <Button variant="danger" onClick={() => void onDescartar()} loading={resolviendo}
              disabled={!nota.trim() || resolviendo} style={{ flex: 1 }}>
              Descartar
            </Button>
          </>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            Usalo solo si conciliaste este cobro por fuera de Sylvora. La nota es
            obligatoria y queda en la auditoría — es lo único que va a explicar este
            dinero en el futuro.
          </p>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Ej: venta cargada como efectivo por error, conciliada en caja del 04/07"
            rows={3}
            disabled={resolviendo}
            style={{
              width: '100%', resize: 'vertical', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg2)',
              color: 'var(--text)', padding: '8px 10px', fontSize: 13,
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
      </Modal>

      <style>{`
        @keyframes mp-rev-rotate { from { transform: rotate(0) } to { transform: rotate(360deg) } }
        .mp-rev-spin { animation: mp-rev-rotate 0.9s linear infinite; }
      `}</style>
    </div>
  )
}
