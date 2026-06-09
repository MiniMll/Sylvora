'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check, AlertTriangle, Smartphone, X, Clock, Loader2 } from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatPeso } from '@/lib/utils'
import {
  crearCobroMP,
  obtenerEstadoCobroMP,
  cancelarCobroMP,
  MPClientFetchError,
  type EstadoIntentoCobro,
} from '@/lib/mp/client-fetch'

// Modal de cobro Mercado Pago. Se abre cuando el cajero elige
// "Mercado Pago" como método en el POS:
//
//   1. POST /api/mp/cobros (crearCobroMP) → recibe QR + link.
//   2. Polling cada 2s a GET /api/mp/cobros/:id (obtenerEstadoCobroMP)
//      hasta llegar a un estado terminal.
//   3. Si estado='aprobado' → llama onAprobado(intentoId) y el caller
//      (POSPayment) ejecuta el flow de crear_venta.
//   4. Si estado='expirado'/'rechazado' → ofrece "Reintentar" o "Cerrar".
//   5. Si el cajero aprieta "Cancelar cobro" → POST /:id/cancelar.
//      Si MP cobró entre tanto, la respuesta lo marca como aprobado
//      y seguimos como si nada (toast informativo).
//
// El modal NO ejecuta crear_venta — eso es responsabilidad del
// componente padre. El modal solo orquesta el cobro MP.

const POLL_INTERVAL_MS = 2_000

type FaseModal =
  | 'creando'        // POST /cobros pendiente
  | 'esperando'     // pendiente, polling activo
  | 'aprobado'      // estado='aprobado', avisamos al padre
  | 'rechazado'
  | 'cancelado'
  | 'expirado'
  | 'requiere_revision'
  | 'error'         // fallo de red / 5xx al crear

export interface MPCobroModalProps {
  open: boolean
  /** Monto a cobrar en pesos. */
  monto: number
  /** Descripción opcional (mostrar en ticket MP). */
  descripcion?: string
  /** Se llama cuando el cobro es aprobado por MP. El caller debe
   *  ejecutar el flow de crear_venta y, si OK, llamar onClose. */
  onAprobado: (intentoId: string) => Promise<void> | void
  /** Se llama si el modal se cierra sin haber cobrado (cancelado,
   *  expirado, rechazado, o user cerró). */
  onClose: () => void
}

function estadoToFase(e: EstadoIntentoCobro): FaseModal {
  switch (e) {
    case 'pendiente':         return 'esperando'
    case 'aprobado':          return 'aprobado'
    case 'rechazado':         return 'rechazado'
    case 'cancelado':         return 'cancelado'
    case 'expirado':          return 'expirado'
    case 'requiere_revision': return 'requiere_revision'
  }
}

export function MPCobroModal({ open, monto, descripcion, onAprobado, onClose }: MPCobroModalProps) {
  const [fase, setFase] = useState<FaseModal>('creando')
  const [intentoId, setIntentoId] = useState<string | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [expiraEn, setExpiraEn] = useState<string | null>(null)
  const [mensajeError, setMensajeError] = useState<string>('')
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [segundosRestantes, setSegundosRestantes] = useState<number>(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aprobadoDisparadoRef = useRef(false)

  // Limpieza del polling. Importante porque el modal puede desmontarse
  // antes de que llegue el último estado terminal.
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  // ── Crear el cobro al montar ──────────────────────────────────────
  // El componente se monta fresh en cada apertura (el parent lo
  // renderiza condicionalmente con `open && <MPCobroModal />`), así
  // que no hace falta resetear estado — los useState arrancan con
  // sus defaults. Solo disparamos la creación del cobro.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    crearCobroMP(monto, descripcion).then(res => {
      if (cancelled) return
      setIntentoId(res.intento_id)
      setQrData(res.qr_data)
      setCheckoutUrl(res.checkout_url)
      setExpiraEn(res.expira_en)
      setFase('esperando')
    }).catch((e: unknown) => {
      if (cancelled) return
      setFase('error')
      if (e instanceof MPClientFetchError) {
        // 409 = MP no conectado. 502/503 = MP caído.
        setMensajeError(e.message || 'No pudimos generar el cobro.')
      } else {
        setMensajeError('No pudimos conectar con el servidor.')
      }
    })

    return () => { cancelled = true; stopPolling() }
  }, [open, monto, descripcion, stopPolling])

  // ── Renderizar QR en canvas cuando llega qr_data ──────────────────
  useEffect(() => {
    if (!qrData || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, qrData, {
      width: 260,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    }).catch(err => {
      console.error('[MPCobroModal] QR render falló:', err)
    })
  }, [qrData])

  // ── Countdown del expira_en ───────────────────────────────────────
  useEffect(() => {
    if (!expiraEn || fase !== 'esperando') return
    const update = () => {
      const ms = new Date(expiraEn).getTime() - Date.now()
      setSegundosRestantes(Math.max(0, Math.floor(ms / 1000)))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [expiraEn, fase])

  // ── Polling del estado ────────────────────────────────────────────
  useEffect(() => {
    if (fase !== 'esperando' || !intentoId) return
    let cancelled = false

    const poll = async () => {
      try {
        const estado = await obtenerEstadoCobroMP(intentoId)
        if (cancelled) return
        setStatusDetail(estado.mp_status_detail)
        const nuevaFase = estadoToFase(estado.estado)
        if (nuevaFase !== 'esperando') {
          setFase(nuevaFase)
          return  // dejar de pollear; el efecto se reinicia si vuelve a 'esperando'
        }
        // Programar el siguiente poll.
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
      } catch (e) {
        if (cancelled) return
        // Error transitorio del polling — log + reintento. No
        // movemos el estado del modal, el cajero ve el QR aún.
        console.warn('[MPCobroModal] poll falló:', e instanceof Error ? e.message : e)
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    return () => { cancelled = true; stopPolling() }
  }, [fase, intentoId, stopPolling])

  // ── Cuando llega 'aprobado', avisar al padre (una sola vez) ───────
  useEffect(() => {
    if (fase !== 'aprobado' || !intentoId) return
    if (aprobadoDisparadoRef.current) return
    aprobadoDisparadoRef.current = true
    Promise.resolve(onAprobado(intentoId)).catch(e => {
      // El padre (POSPayment) maneja crear_venta + requiere_revision.
      // Si llega un throw acá es bug — solo loguear.
      console.error('[MPCobroModal] onAprobado tiró:', e)
    })
  }, [fase, intentoId, onAprobado])

  // ── Acciones del cajero ───────────────────────────────────────────
  const handleCopiarLink = useCallback(async () => {
    if (!checkoutUrl) return
    try {
      await navigator.clipboard.writeText(checkoutUrl)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
      toast.success('Link copiado al portapapeles', { id: 'mp-copiar' })
    } catch {
      toast.error('No pudimos copiar. Probá manual.', { id: 'mp-copiar' })
    }
  }, [checkoutUrl])

  const handleCancelar = useCallback(async () => {
    if (!intentoId || cancelando) return
    setCancelando(true)
    stopPolling()
    try {
      const res = await cancelarCobroMP(intentoId)
      if (res.cancelado) {
        setFase('cancelado')
      } else if (res.estado === 'aprobado') {
        // MP cobró entre el click y el UPDATE. Seguir el flow de
        // aprobado — el comerciante igual recibió el dinero.
        toast.message('Mercado Pago ya confirmó el cobro. La venta se registrará normalmente.', { duration: 4000 })
        setFase('aprobado')
      } else {
        // Otro estado terminal (rechazado/expirado).
        setFase(estadoToFase(res.estado))
      }
    } catch (e) {
      console.error('[MPCobroModal] cancelar falló:', e)
      toast.error('No pudimos cancelar. Reintentá.', { id: 'mp-cancelar' })
    } finally {
      setCancelando(false)
    }
  }, [intentoId, cancelando, stopPolling])

  const handleCerrar = useCallback(() => {
    stopPolling()
    onClose()
  }, [onClose, stopPolling])

  // Cerrar permitido solo en estados terminales (o "creando" si falló).
  const puedeCerrar =
    fase === 'cancelado' || fase === 'expirado' || fase === 'rechazado' ||
    fase === 'requiere_revision' || fase === 'error'

  // ── Render ────────────────────────────────────────────────────────
  return (
    <Modal
      open={open}
      onClose={puedeCerrar ? handleCerrar : () => {}}
      title="Cobrar con Mercado Pago"
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 320 }}>
        {/* Monto siempre visible */}
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Total a cobrar
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--ac)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em', marginTop: 4 }}>
            {formatPeso(monto)}
          </div>
        </div>

        {/* Render condicional por fase */}
        {fase === 'creando' && (
          <FaseInline icon={<Loader2 size={20} className="spin" color="var(--ac)" />} title="Generando QR..." subtitle="Conectando con Mercado Pago" />
        )}

        {fase === 'esperando' && qrData && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                padding: 12, background: 'white',
                borderRadius: 12, border: '1px solid var(--border)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              }}>
                <canvas ref={canvasRef} style={{ display: 'block' }} />
              </div>
            </div>

            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
              Pedile al cliente que escanee con la app Mercado Pago.
            </div>

            {/* Countdown */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, fontSize: 12, color: 'var(--text2)',
            }}>
              <Clock size={12} />
              <span>Vence en {Math.floor(segundosRestantes / 60)}:{String(segundosRestantes % 60).padStart(2, '0')}</span>
            </div>

            {/* Link de pago alternativo */}
            {checkoutUrl && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>
                  ¿No tiene la app?
                </div>
                <Button
                  variant="ghost" size="sm" onClick={handleCopiarLink}
                  icon={copiado ? <Check size={13} color="var(--g)" /> : <Copy size={13} />}
                  style={{ width: '100%' }}>
                  {copiado ? 'Link copiado' : 'Copiar link de pago'}
                </Button>
              </div>
            )}
          </>
        )}

        {fase === 'aprobado' && (
          <FaseInline icon={<Loader2 size={20} className="spin" color="var(--g)" />} title="Cobro confirmado" subtitle="Registrando la venta..." color="var(--g)" />
        )}

        {fase === 'cancelado' && (
          <FaseInline icon={<X size={20} color="var(--text2)" />} title="Cobro cancelado" subtitle="No se registró ninguna venta." />
        )}

        {fase === 'expirado' && (
          <FaseInline
            icon={<Clock size={20} color="var(--w)" />}
            title="El QR expiró"
            subtitle="El cliente no completó el pago a tiempo. Cerralo y volvé a intentar."
            color="var(--w)"
          />
        )}

        {fase === 'rechazado' && (
          <FaseInline
            icon={<AlertTriangle size={20} color="var(--r)" />}
            title="Pago rechazado"
            subtitle={statusDetail ? `Motivo: ${statusDetail}` : 'Mercado Pago rechazó el pago.'}
            color="var(--r)"
          />
        )}

        {fase === 'requiere_revision' && (
          <FaseInline
            icon={<AlertTriangle size={20} color="var(--r)" />}
            title="⚠️ Pago cobrado pero NO registrado"
            subtitle="El cliente pagó por Mercado Pago pero la venta no se pudo guardar. Avisá al administrador."
            color="var(--r)"
          />
        )}

        {fase === 'error' && (
          <FaseInline
            icon={<AlertTriangle size={20} color="var(--r)" />}
            title="No pudimos generar el cobro"
            subtitle={mensajeError || 'Probá de nuevo en unos segundos.'}
            color="var(--r)"
          />
        )}

        {/* Footer con acciones */}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {fase === 'esperando' && (
            <Button
              variant="ghost" onClick={handleCancelar} loading={cancelando}
              icon={<Smartphone size={14} />}
              style={{ flex: 1 }}>
              Cancelar cobro
            </Button>
          )}
          {puedeCerrar && (
            <Button variant={fase === 'requiere_revision' ? 'primary' : 'ghost'} onClick={handleCerrar} style={{ flex: 1 }}>
              {fase === 'requiere_revision' ? 'Entendido' : 'Cerrar'}
            </Button>
          )}
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </div>
    </Modal>
  )
}

function FaseInline({ icon, title, subtitle, color = 'var(--text)' }: {
  icon: React.ReactNode
  title: string
  subtitle: string
  color?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      padding: 24, textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--bg3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, maxWidth: 320 }}>{subtitle}</div>
      </div>
    </div>
  )
}
