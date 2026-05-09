'use client'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { CheckCircle } from 'lucide-react'

// Formatea peso argentino
function formatPeso(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }

// Sonido de notificación suave (beep via Web Audio)
function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 880
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4)
  } catch {}
}

export function MPPagosListener() {
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel('pagos-mp-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pagos_mp' },
        (payload) => {
          const pago = payload.new as any
          playBeep()
          toast.custom(
            () => (
              <div style={{
                background: 'white',
                border: '1px solid rgba(0,200,150,0.25)',
                borderLeft: '4px solid #00c896',
                borderRadius: 14,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
                fontFamily: 'DM Sans, sans-serif',
                minWidth: 300,
              }}>
                <div style={{
                  width: 40, height: 40,
                  borderRadius: '50%',
                  background: 'rgba(0,200,150,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <CheckCircle size={20} color="#00c896" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1e', marginBottom: 2 }}>
                    Pago recibido por Mercado Pago
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#00c896', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
                    {formatPeso(pago.monto)}
                  </div>
                  {pago.pagador && (
                    <div style={{ fontSize: 11, color: '#6b6b72', marginTop: 2 }}>
                      De: {pago.pagador}
                    </div>
                  )}
                </div>
              </div>
            ),
            { duration: 10000 }
          )
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return null
}
