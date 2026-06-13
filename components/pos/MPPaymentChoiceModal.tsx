'use client'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, BadgeCheck, QrCode, Smartphone } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatPeso } from '@/lib/utils'

export interface MPPaymentChoiceModalProps {
  open: boolean
  monto: number
  loading?: boolean
  onGenerarQR: () => void
  onConfirmarManual: () => Promise<void> | void
  onClose: () => void
}

export function MPPaymentChoiceModal({
  open,
  monto,
  loading = false,
  onGenerarQR,
  onConfirmarManual,
  onClose,
}: MPPaymentChoiceModalProps) {
  const [confirmandoManual, setConfirmandoManual] = useState(false)

  const confirmarManual = async () => {
    await onConfirmarManual()
  }

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title="Cobrar con Mercado Pago"
      size="md"
      footer={confirmandoManual ? (
        <>
          <Button
            variant="ghost"
            icon={<ArrowLeft size={14} />}
            onClick={() => setConfirmandoManual(false)}
            disabled={loading}>
            Volver
          </Button>
          <Button
            variant="success"
            icon={<BadgeCheck size={14} />}
            loading={loading}
            onClick={confirmarManual}>
            Confirmar cobro
          </Button>
        </>
      ) : (
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cerrar
        </Button>
      )}>
      {confirmandoManual ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: 8,
            background: 'rgba(0,200,150,0.08)',
            border: '1px solid rgba(0,200,150,0.22)',
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(0,200,150,0.14)',
              color: 'var(--g)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <BadgeCheck size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                Confirmar cobro manual
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                Se registrará una venta de {formatPeso(monto)} como Mercado Pago.
              </div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--text2)' }}>
            Usá esta confirmación solo si el dinero ya fue recibido en Mercado Pago. Sylvora no va a consultar ni conciliar este cobro automáticamente.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '0 2px 4px',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Total a cobrar</span>
            <strong style={{ fontSize: 18, color: 'var(--text)' }}>{formatPeso(monto)}</strong>
          </div>

          <OptionCard
            icon={<QrCode size={20} />}
            title="Generar QR"
            description="Crea un QR dinámico, espera la aprobación y registra la venta automáticamente."
            disabled={loading}
            onClick={onGenerarQR}
          />

          <OptionCard
            icon={<Smartphone size={20} />}
            title="Ya cobré con Mercado Pago"
            description="Usá esta opción si el cliente pagó con QR impreso, QR de mesa, transferencia de Mercado Pago o Point."
            disabled={loading}
            onClick={() => setConfirmandoManual(true)}
          />
        </div>
      )}
    </Modal>
  )
}

interface OptionCardProps {
  icon: ReactNode
  title: string
  description: string
  disabled?: boolean
  onClick: () => void
}

function OptionCard({ icon, title, description, disabled = false, onClick }: OptionCardProps) {
  const [hover, setHover] = useState(false)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: 14,
        borderRadius: 8,
        border: hover && !disabled ? '1px solid var(--ac)' : '1px solid var(--border)',
        background: hover && !disabled ? 'var(--bg2)' : 'var(--card)',
        color: 'var(--text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        transition: 'background 0.12s, border-color 0.12s',
      }}>
      <span style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: hover && !disabled ? 'rgba(53,118,255,0.12)' : 'var(--bg2)',
        color: hover && !disabled ? 'var(--ac)' : 'var(--text2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 12, lineHeight: 1.35, color: 'var(--text2)' }}>
          {description}
        </span>
      </span>
    </button>
  )
}
