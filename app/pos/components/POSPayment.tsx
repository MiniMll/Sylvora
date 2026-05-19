'use client'
import { memo, useEffect, useRef, useState } from 'react'
import { CheckCircle, Loader2, Printer, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatPeso, formatTicketText, shareOrCopy } from '@/lib/utils'
import { usePOSStore } from '@/lib/store'
import { guardarVenta } from '@/lib/supabase/ventas'
import { getComercio } from '@/lib/supabase/_base'
import { TicketReceipt } from '@/components/TicketReceipt'
import type { MetodoPago } from '@/types'
import type { Venta, Comercio } from '@/types/database'

const METODOS: { id: MetodoPago; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'debito', label: 'Débito' },
  { id: 'credito', label: 'Crédito' },
  { id: 'mercadopago', label: 'Mercado Pago' },
]

const COBRADO_FEEDBACK_MS = 800

function POSPaymentImpl() {
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

  useEffect(() => {
    let cancelled = false
    getComercio().then(c => { if (!cancelled) setComercio(c) })
    return () => { cancelled = true }
  }, [])

  const cobrarRef = useRef<() => void>(() => {})

  const cobrar = async () => {
    // Guard contra doble-submit: el flag global cargandoVenta también
    // deshabilita el input del scanner durante el await (P0-7).
    if (store.cargandoVenta || cobrado) return
    if (!store.items.length) {
      toast.error('El ticket está vacío', { id: 'pos-cobrar' })
      return
    }

    store.setCargandoVenta(true)

    const itemsParaVenta = store.items.map(i => ({
      producto_id: i.producto_id.includes('_') ? i.producto_id.split('_')[0] : i.producto_id,
      nombre_producto: i.nombre,
      precio_unitario: i.precio_unitario,
      cantidad: i.cantidad,
      subtotal: i.subtotal,
      peso_kg: i.peso_kg,
    }))

    const totalActual = store.total()

    try {
      const result = await guardarVenta({
        subtotal: store.subtotal(),
        descuento_porcentaje: store.descuentoPct,
        descuento_monto: store.descuentoMonto(),
        recargo_porcentaje: store.recargoPct,
        recargo_monto: store.recargoMonto(),
        total: totalActual,
        metodo_pago: store.metodoPago,
        items: itemsParaVenta,
      })

      if (!result) {
        toast.error('No se pudo guardar la venta. Probá de nuevo.', { id: 'pos-cobrar' })
        store.setCargandoVenta(false)
        return
      }

      store.setCargandoVenta(false)
      setCobrado(true)
      setMontoRecibido('')

      // Construir Venta enriquecida (con items_venta) para
      // print/share desde el toast. La función guardarVenta sólo
      // retorna el row de la tabla ventas; los items los tenemos
      // del input local.
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

      // Toast con acciones inline (Sonner custom JSX).
      toast.custom((t) => (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderLeft: '4px solid var(--g)',
          borderRadius: 12,
          padding: '12px 16px',
          minWidth: 320,
          maxWidth: 400,
          boxShadow: 'var(--shadow-md)',
          fontFamily: 'DM Sans, sans-serif',
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
              onClick={() => {
                // Pequeño delay para que el toast se cierre antes del print
                // (sino el toast aparece en la preview de impresión).
                toast.dismiss(t)
                setTimeout(() => window.print(), 100)
              }}
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
        // Devuelve foco al input del scanner para la próxima venta.
        store.requestRefocus()
      }, COBRADO_FEEDBACK_MS)

      // Liberar la venta retenida después de la duración del toast,
      // para que el printable off-screen no quede colgado en DOM
      // indefinidamente.
      setTimeout(() => setVentaParaTicket(null), 30_000)
    } catch {
      toast.error('Error al guardar la venta. Probá de nuevo.', { id: 'pos-cobrar' })
      store.setCargandoVenta(false)
    }
  }

  cobrarRef.current = cobrar

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
      {/* Método pago */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
          {METODOS.map(m => {
            const active = store.metodoPago === m.id
            return (
              <button key={m.id} onClick={() => store.setMetodoPago(m.id)}
                aria-pressed={active}
                style={{
                  minHeight: 40,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid',
                  borderColor: active ? 'var(--ac)' : 'var(--border)',
                  background: active ? 'var(--ac)' : 'var(--bg2)',
                  color: active ? 'white' : 'var(--text)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '-0.01em',
                  boxShadow: active ? '0 2px 8px rgba(91,76,255,0.25)' : 'none',
                  transition: 'all 0.15s var(--ease-out)',
                }}>
                {m.label}
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
          ) : cobrado ? '¡Cobrado!' : 'Cobrar'}
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
    </>
  )
}

export const POSPayment = memo(POSPaymentImpl)
