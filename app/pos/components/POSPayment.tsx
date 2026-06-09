'use client'
import { memo, useEffect, useRef, useState } from 'react'
import {
  Check,
  CheckCircle,
  Loader2,
  Printer,
  Share2,
  Banknote,
  CreditCard,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatPeso, formatTicketText, shareOrCopy } from '@/lib/utils'
import { usePOSStore } from '@/lib/store'
import { guardarVenta, esErrorStockInsuficiente, esErrorDriftLotes, type GuardarVentaResult } from '@/lib/supabase/ventas'
import { getComercio } from '@/lib/supabase/_base'
import { TicketReceipt } from '@/components/TicketReceipt'
import { MPCobroModal } from '@/components/pos/MPCobroModal'
import { asociarVentaAIntentoMP, marcarCobroRequiereRevision } from '@/lib/mp/client-fetch'
import type { MetodoPago } from '@/types'
import type { Venta, Comercio } from '@/types/database'

// Métodos de pago — icono arriba + label abajo. Mismo lenguaje
// visual que MiniPOSPreview en la landing, para coherencia entre
// marketing y producto real.
const METODOS: { id: MetodoPago; label: string; Icon: LucideIcon }[] = [
  { id: 'efectivo',    label: 'Efectivo',     Icon: Banknote   },
  { id: 'debito',      label: 'Débito',       Icon: CreditCard },
  { id: 'credito',     label: 'Crédito',      Icon: CreditCard },
  { id: 'mercadopago', label: 'Mercado Pago', Icon: Smartphone },
]

const COBRADO_FEEDBACK_MS = 800

interface POSPaymentProps {
  /** Callback para refrescar productos + sincronizar stock_disponible
   *  del carrito. Se llama después de cobrar exitosamente (stocks
   *  bajaron) y también después de un error stock_insuficiente
   *  (el carrito tenía stocks viejos, hay que refrescar para que
   *  POSCart bloquee los +). */
  onStockSync: () => Promise<void> | void
}

function POSPaymentImpl({ onStockSync }: POSPaymentProps) {
  const store = usePOSStore()
  const [cobrado, setCobrado] = useState(false)
  // Estado local del campo "monto recibido" para calcular vuelto.
  // No se persiste — vive sólo durante la venta.
  const [montoRecibido, setMontoRecibido] = useState('')
  // Última venta confirmada, retenida brevemente para que el toast
  // de éxito pueda ofrecer Imprimir / Compartir. Se limpia al
  // cobrar la siguiente o tras unos segundos.
  const [ventaParaTicket, setVentaParaTicket] = useState<Venta | null>(null)
  // Datos del comercio para el header del ticket impreso. Se fetchea
  // una vez al montar el POS y se cachea via getComercio() —
  // suficiente para una sesión completa de cobros.
  const [comercio, setComercio] = useState<Comercio | null>(null)
  // Estado del flow MP. Cuando metodoPago='mercadopago' y el cajero
  // aprieta Cobrar, se abre el modal en vez de llamar guardarVenta
  // directamente. La venta se persiste recién cuando el modal nos
  // avisa onAprobado.
  const [mpModalOpen, setMpModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getComercio().then(c => { if (!cancelled) setComercio(c) })
    return () => { cancelled = true }
  }, [])

  const cobrarRef = useRef<() => void>(() => {})

  // Ejecuta el flow de persistencia de la venta + UX de éxito/error.
  // Se invoca desde el camino sincrónico (efectivo/débito/crédito) y
  // también desde el callback onAprobado del MPCobroModal. El mpIntentoId
  // se pasa para asociar la venta al intento MP recién aprobado.
  // Devuelve true si la venta se registró, false en cualquier otro caso
  // (stock_insuficiente, drift, error). El caller MP usa el bool para
  // decidir si marcar requiere_revision.
  const ejecutarVenta = async (mpIntentoId?: string): Promise<{ ok: true; venta: Venta } | { ok: false; razon: string }> => {
    const itemsParaVenta = store.items.map(i => ({
      producto_id: i.producto_id.includes('_') ? i.producto_id.split('_')[0] : i.producto_id,
      nombre_producto: i.nombre,
      precio_unitario: i.precio_unitario,
      cantidad: i.cantidad,
      subtotal: i.subtotal,
      peso_kg: i.peso_kg,
    }))
    const totalActual = store.total()
    let result: GuardarVentaResult
    try {
      result = await guardarVenta({
        subtotal: store.subtotal(),
        descuento_porcentaje: store.descuentoPct,
        descuento_monto: store.descuentoMonto(),
        recargo_porcentaje: store.recargoPct,
        recargo_monto: store.recargoMonto(),
        total: totalActual,
        metodo_pago: store.metodoPago,
        items: itemsParaVenta,
      })
    } catch (e) {
      return { ok: false, razon: e instanceof Error ? e.message : 'error_red' }
    }

    if (esErrorStockInsuficiente(result)) {
      toast.error(
        `Sin stock de ${result.nombre}. Te quedan ${result.disponible}, pediste ${result.pedido}.`,
        { id: 'pos-cobrar', duration: 6000 },
      )
      void onStockSync()
      return { ok: false, razon: `stock_insuficiente:${result.nombre}` }
    }
    if (esErrorDriftLotes(result)) {
      toast.error(
        'No pudimos cobrar — hay diferencia entre el stock total y los lotes de algún producto del ticket. Avisá al administrador.',
        { id: 'pos-cobrar', duration: 8000 },
      )
      return { ok: false, razon: 'drift_lotes' }
    }
    if (!result) {
      return { ok: false, razon: 'guardarVenta_devolvio_null' }
    }

    // ── Éxito: cerrar flow + UX (toast con acciones inline) ─────────
    setCobrado(true)
    setMontoRecibido('')

    const ventaImprimible: Venta = {
      ...(result as Venta),
      items_venta: itemsParaVenta.map((i, idx) => ({
        id: `tmp-${idx}`,
        venta_id: result.id,
        producto_id: i.producto_id || null,
        nombre_producto: i.nombre_producto,
        precio_unitario: i.precio_unitario,
        cantidad: i.cantidad,
        subtotal: i.subtotal,
        peso_kg: i.peso_kg ?? null,
      })),
    }
    setVentaParaTicket(ventaImprimible)

    // Si vino de MP, asociar venta_id al intento (best-effort).
    if (mpIntentoId) {
      void asociarVentaAIntentoMP(mpIntentoId, result.id).catch(e => {
        // Best-effort: la venta ya existe. Loguear y seguir.
        console.warn('[POSPayment] asociarVentaAIntentoMP falló:', e instanceof Error ? e.message : e)
      })
    }

    toast.custom((t) => (
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderLeft: '4px solid var(--g)', borderRadius: 12,
        padding: '12px 16px', minWidth: 320, maxWidth: 400,
        boxShadow: 'var(--shadow-md)', fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(0,200,150,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle size={15} color="var(--g)" strokeWidth={1.8} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Venta de {formatPeso(totalActual)} registrada
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
              Ticket #{String(ventaImprimible.numero_ticket).padStart(4, '0')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { toast.dismiss(t); setTimeout(() => window.print(), 100) }}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '7px 10px', borderRadius: 7,
              background: 'var(--bg2)', color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            <Printer size={12} /> Imprimir
          </button>
          <button
            onClick={async () => {
              toast.dismiss(t)
              const r = await shareOrCopy(
                formatTicketText(ventaImprimible, comercio),
                `Ticket #${String(ventaImprimible.numero_ticket).padStart(4, '0')}`,
              )
              if (r === 'copied') toast.success('Ticket copiado al portapapeles', { id: 'pos-share' })
              else if (r === 'error') toast.error('No se pudo compartir', { id: 'pos-share' })
            }}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '7px 10px', borderRadius: 7,
              background: 'var(--bg2)', color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            <Share2 size={12} /> Compartir
          </button>
        </div>
      </div>
    ), { id: 'pos-cobrar', duration: 6000 })

    setTimeout(() => {
      setCobrado(false)
      store.limpiarTicket()
      store.requestRefocus()
    }, COBRADO_FEEDBACK_MS)

    void onStockSync()
    setTimeout(() => setVentaParaTicket(null), 30_000)
    return { ok: true, venta: result as Venta }
  }

  const cobrar = async () => {
    // Guard contra doble-submit.
    if (store.cargandoVenta || cobrado) return
    if (!store.items.length) {
      toast.error('El ticket está vacío', { id: 'pos-cobrar' })
      return
    }

    // Camino MP: abrir modal en vez de persistir. La persistencia ocurre
    // cuando el modal confirma el cobro (onAprobado → ejecutarVenta).
    if (store.metodoPago === 'mercadopago') {
      setMpModalOpen(true)
      return
    }

    store.setCargandoVenta(true)
    try {
      await ejecutarVenta()
    } finally {
      store.setCargandoVenta(false)
    }
  }

  // Callback del MPCobroModal cuando MP confirma el cobro. Ejecuta
  // crear_venta. Si falla, marca el intento como requiere_revision —
  // el dinero está en la cuenta MP del comerciante y el cajero ve
  // alerta crítica.
  const onMPAprobado = async (intentoId: string) => {
    store.setCargandoVenta(true)
    try {
      const res = await ejecutarVenta(intentoId)
      if (!res.ok) {
        // crear_venta falló POST aprobación MP. Marcar para revisión.
        try {
          await marcarCobroRequiereRevision(intentoId, res.razon)
        } catch (e) {
          console.error('[POSPayment] marcarCobroRequiereRevision falló:', e instanceof Error ? e.message : e)
        }
        toast.error(
          'Mercado Pago cobró pero la venta no se pudo registrar. Avisá al administrador.',
          { id: 'pos-cobrar', duration: 12000 },
        )
      }
    } finally {
      store.setCargandoVenta(false)
      setMpModalOpen(false)
    }
  }


  // Mantener el ref sincronizado con la última versión de `cobrar`
  // para que el listener de F8/Ctrl+Enter siempre invoque la closure
  // más reciente (evita stale closures). React 19 prohíbe actualizar
  // refs durante render — el effect corre después y resuelve ambos.
  useEffect(() => {
    cobrarRef.current = cobrar
  })

  // Atajos F8 / Ctrl+Enter para cobrar sin tocar el mouse.
  // Suprimidos si hay un modal abierto (data-modal-card en DOM).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isShortcut = e.key === 'F8' || (e.ctrlKey && e.key === 'Enter')
      if (!isShortcut) return
      if (document.querySelector('[data-modal-card]')) return
      e.preventDefault()
      cobrarRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const itemsVacio = store.items.length === 0
  const guardando = store.cargandoVenta
  const cobrarDisabled = itemsVacio || guardando || cobrado
  const totalActual = store.total()

  // Cálculo de vuelto: sólo visible si método=efectivo y hay un monto
  // ingresado > 0. No bloquea el botón Cobrar — el cajero puede tener
  // motivos legítimos para cobrar con cualquier monto.
  const esEfectivo = store.metodoPago === 'efectivo'
  const recibidoNum = Number(montoRecibido) || 0
  const diferencia = recibidoNum - totalActual
  const mostrarCalculoVuelto = esEfectivo && recibidoNum > 0

  return (
    <>
      {/* Métodos de pago — icon arriba + label abajo.
          Grid 4 cols fijo en desktop (siempre entran los 4); mobile
          autofit ≥80px para que no se aplasten. */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {METODOS.map(m => {
            const active = store.metodoPago === m.id
            const Icon = m.Icon
            return (
              <button
                key={m.id}
                onClick={() => store.setMetodoPago(m.id)}
                aria-pressed={active}
                style={{
                  // Vertical, icon + label. Altura mínima 60 para
                  // tap-target cómodo en mobile + respiración visual.
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 60,
                  padding: '8px 6px',
                  borderRadius: 10,
                  border: '1px solid',
                  borderColor: active ? 'var(--ac)' : 'var(--border)',
                  background: active ? 'var(--ac)' : 'var(--bg2)',
                  color: active ? 'white' : 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: active ? '0 2px 8px rgba(91,76,255,0.25)' : 'none',
                  transition: 'all 0.15s var(--ease-out)',
                }}
              >
                <Icon size={18} strokeWidth={2} color={active ? 'white' : 'var(--text2)'} />
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '-0.005em',
                  // Truncate de "Mercado Pago" si la columna se aprieta
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}>
                  {m.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Vuelto (sólo efectivo) */}
      {esEfectivo && (
        <div style={{ padding: '8px 12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0, width: 60 }}>Recibe</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="$"
              value={montoRecibido}
              onChange={e => setMontoRecibido(e.target.value)}
              style={{
                flex: 1,
                fontSize: 13,
                fontFamily: 'DM Mono, monospace',
                fontWeight: 600,
                border: '1px solid var(--border)',
                borderRadius: 7,
                padding: '6px 10px',
                background: 'var(--bg2)',
                color: 'var(--text)',
                outline: 'none',
                textAlign: 'right',
              }}
            />
          </div>
          {mostrarCalculoVuelto && (
            <div style={{
              marginTop: 4,
              fontSize: 11,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingLeft: 68,
            }}>
              <span style={{ color: 'var(--text2)' }}>
                {diferencia >= 0 ? 'Vuelto' : 'Falta'}
              </span>
              <span style={{
                color: diferencia >= 0 ? 'var(--g)' : 'var(--r)',
                fontFamily: 'DM Mono, monospace',
                fontWeight: 700,
              }}>
                {formatPeso(Math.abs(diferencia))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Cobrar */}
      <div style={{ padding: '10px 12px 14px' }}>
        <button onClick={cobrar}
          disabled={cobrarDisabled}
          aria-busy={guardando}
          aria-label={`Cobrar ${formatPeso(totalActual)}`}
          title="Atajo: F8 o Ctrl+Enter"
          style={{
            width: '100%',
            minHeight: 52,
            padding: '14px',
            borderRadius: 12,
            background: itemsVacio
              ? 'var(--bg3)'
              : cobrado
                ? 'var(--g)'
                : 'linear-gradient(180deg, #00d4a3 0%, #00b486 100%)',
            color: itemsVacio ? 'var(--text2)' : 'white',
            border: 'none',
            fontSize: 15, fontWeight: 700,
            cursor: cobrarDisabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '-0.01em',
            boxShadow: itemsVacio
              ? 'none'
              : '0 2px 6px rgba(0,200,150,0.25), 0 8px 20px rgba(0,200,150,0.18)',
            transition: 'transform 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out), background 0.15s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: itemsVacio ? 0.85 : 1,
          }}>
          {guardando ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 0.75s linear infinite' }} />
              Guardando…
            </>
          ) : cobrado ? (
            <>
              <CheckCircle size={18} strokeWidth={2.2} />
              ¡Cobrado!
            </>
          ) : (
            <>
              <Check size={18} strokeWidth={2.4} />
              Cobrar
            </>
          )}
        </button>
      </div>

      {/* Ticket printable off-screen. Solo presente cuando hay una
          venta recién cobrada (~30s). CSS @media print lo muestra al
          imprimir; .print-only lo saca de la pantalla normalmente. */}
      {ventaParaTicket && (
        <div data-printable className="print-only">
          <TicketReceipt venta={ventaParaTicket} comercio={comercio} />
        </div>
      )}

      {/* Modal de cobro Mercado Pago. Se abre cuando el cajero aprieta
          Cobrar con metodoPago='mercadopago'. La venta NO se persiste
          hasta que el modal confirma estado='aprobado' via onAprobado.
          Render condicional para que cada apertura monte un component
          fresh (sin estados residuales del cobro anterior). */}
      {mpModalOpen && (
        <MPCobroModal
          open
          monto={totalActual}
          onAprobado={onMPAprobado}
          onClose={() => setMpModalOpen(false)}
        />
      )}
    </>
  )
}

export const POSPayment = memo(POSPaymentImpl)
