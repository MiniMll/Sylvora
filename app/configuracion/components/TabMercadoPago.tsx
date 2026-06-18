'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plug, RefreshCw, Trash2, WalletCards } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SectionHeader } from './TabComercio'

type MPCredencialesPublicas = {
  comercio_id: string
  user_id_mp: number
  public_key: string
  store_id_mp: string
  external_pos_id: string
  expira_en: string
  conectado_en: string
  conectado_por: string | null
  actualizado_en: string
}

type MPStatusResponse =
  | { estado: 'no_conectado'; conectado: false; credenciales: null }
  | { estado: 'conectado'; conectado: true; credenciales: MPCredencialesPublicas }

type EstadoVista = 'loading' | 'no_conectado' | 'conectado' | 'error'

const MP_CALLBACK_MESSAGES: Record<string, { type: 'success' | 'error'; text: string }> = {
  connected: { type: 'success', text: 'Cuenta conectada correctamente' },
  denied: { type: 'error', text: 'La conexión con Mercado Pago fue cancelada' },
  state_error: { type: 'error', text: 'No pudimos validar la conexión. Intentá de nuevo.' },
  auth_required: { type: 'error', text: 'Iniciá sesión para conectar Mercado Pago' },
  forbidden: { type: 'error', text: 'Solo administradores pueden conectar Mercado Pago' },
  missing_config: { type: 'error', text: 'Falta configurar OAuth de Mercado Pago en el servidor' },
  oauth_error: { type: 'error', text: 'Mercado Pago rechazó la conexión. Intentá de nuevo.' },
  setup_error: { type: 'error', text: 'No pudimos preparar Store/POS. Reconectá Mercado Pago.' },
  commerce_error: { type: 'error', text: 'No encontramos el comercio para conectar Mercado Pago' },
  save_error: { type: 'error', text: 'No pudimos guardar la conexión de Mercado Pago' },
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            height: i === 0 ? 88 : 42,
            borderRadius: 10,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            animation: 'pulse 1.2s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  )
}

function MPMark({ tone }: { tone: 'neutral' | 'success' | 'error' }) {
  const color = tone === 'success' ? 'var(--g)' : tone === 'error' ? 'var(--r)' : 'var(--ac)'
  return (
    <div style={{
      width: 48,
      height: 48,
      borderRadius: 12,
      background: tone === 'success' ? 'rgba(0, 190, 142, 0.10)' : tone === 'error' ? 'rgba(255, 82, 97, 0.10)' : 'var(--ac-light)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <WalletCards size={24} color={color} strokeWidth={2.1} />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '140px 1fr',
      gap: 10,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{
        fontSize: 12,
        color: 'var(--text)',
        fontFamily: 'DM Mono, ui-monospace, monospace',
        overflowWrap: 'anywhere',
      }}>
        {value}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function TabMercadoPago() {
  const searchParams = useSearchParams()
  const [estado, setEstado] = useState<EstadoVista>('loading')
  const [credenciales, setCredenciales] = useState<MPCredencialesPublicas | null>(null)
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null)
  const [desconectando, setDesconectando] = useState(false)
  const [confirmarDesconexion, setConfirmarDesconexion] = useState(false)
  const callbackToastShown = useRef<string | null>(null)

  const cargar = useCallback(async () => {
    setEstado('loading')
    setErrorMensaje(null)
    try {
      const res = await fetch('/api/mp/credenciales', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || 'No pudimos leer la conexión de Mercado Pago')
      }
      const data = await res.json() as MPStatusResponse
      if (data.conectado) {
        setCredenciales(data.credenciales)
        setEstado('conectado')
      } else {
        setCredenciales(null)
        setEstado('no_conectado')
      }
    } catch (e) {
      setCredenciales(null)
      setEstado('error')
      setErrorMensaje(e instanceof Error ? e.message : 'No pudimos leer la conexión de Mercado Pago')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar()
  }, [cargar])

  useEffect(() => {
    const status = searchParams.get('mp')
    if (!status || callbackToastShown.current === status) return
    if (status !== 'connected' && estado === 'loading') return
    callbackToastShown.current = status
    const message =
      status !== 'connected' && estado === 'conectado'
        ? MP_CALLBACK_MESSAGES.connected
        : MP_CALLBACK_MESSAGES[status]
    if (!message) return
    if (message.type === 'success') toast.success(message.text)
    else toast.error(message.text)
    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('mp')
    window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
  }, [estado, searchParams])

  const conectar = () => {
    window.location.assign('/api/mp/oauth/start')
  }

  const desconectar = async () => {
    setDesconectando(true)
    try {
      const res = await fetch('/api/mp/credenciales', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || 'No pudimos desconectar Mercado Pago')
      }
      setConfirmarDesconexion(false)
      toast.success('Mercado Pago desconectado')
      await cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pudimos desconectar Mercado Pago')
    } finally {
      setDesconectando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <SectionHeader
        Icon={WalletCards}
        title="Mercado Pago"
        subtitle="Conexión de cobro QR del comercio"
      />

      {estado === 'loading' && <Skeleton />}

      {estado === 'no_conectado' && (
        <section style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          background: 'var(--card)',
          padding: 18,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <MPMark tone="neutral" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              Mercado Pago no conectado
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              Conectá tu cuenta para cobrar con QR dinámico desde Sylvora.
            </div>
          </div>
          <Button
            variant="primary"
            onClick={conectar}
            icon={<Plug size={14} />}
            style={{ flexShrink: 0 }}
          >
            Conectar Mercado Pago
          </Button>
        </section>
      )}

      {estado === 'conectado' && credenciales && (
        <section style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          background: 'var(--card)',
          padding: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <MPMark tone="success" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="var(--g)" strokeWidth={2.3} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  Cuenta conectada correctamente
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                Desde {formatDate(credenciales.conectado_en)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <InfoRow label="user_id_mp" value={credenciales.user_id_mp} />
            <InfoRow label="store_id_mp" value={credenciales.store_id_mp} />
            <InfoRow label="external_pos_id" value={credenciales.external_pos_id} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={conectar} icon={<RefreshCw size={14} />}>
              Reconectar
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirmarDesconexion(true)}
              icon={<Trash2 size={14} />}
            >
              Desconectar
            </Button>
          </div>
        </section>
      )}

      {estado === 'error' && (
        <section style={{
          border: '1px solid rgba(255,82,97,0.35)',
          borderRadius: 14,
          background: 'rgba(255,82,97,0.07)',
          padding: 18,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <MPMark tone="error" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="var(--r)" strokeWidth={2.3} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                Configuración incompleta
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              {errorMensaje || 'Reconectá Mercado Pago para volver a cobrar con QR dinámico.'}
            </div>
          </div>
          <Button
            variant="primary"
            onClick={conectar}
            icon={<RefreshCw size={14} />}
            style={{ flexShrink: 0 }}
          >
            Reconectar Mercado Pago
          </Button>
        </section>
      )}

      <Modal
        open={confirmarDesconexion}
        onClose={() => { if (!desconectando) setConfirmarDesconexion(false) }}
        title="Desconectar Mercado Pago"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmarDesconexion(false)}
              disabled={desconectando}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={desconectar}
              loading={desconectando}
              icon={!desconectando ? <Trash2 size={14} /> : undefined}
            >
              {desconectando ? 'Desconectando...' : 'Desconectar'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text2)' }}>
          Los cobros QR dinámicos dejarán de estar disponibles hasta que vuelvas a conectar la cuenta.
        </p>
      </Modal>
    </div>
  )
}
