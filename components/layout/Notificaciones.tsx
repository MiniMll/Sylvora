'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, AlertTriangle, ChevronRight } from 'lucide-react'
import { getStockCritico } from '@/lib/supabase/productos'
import { esStockCritico } from '@/lib/utils'
import type { Producto } from '@/types/database'

export function Notificaciones() {
  const [criticos, setCriticos] = useState<Producto[]>([])
  const [visible, setVisible] = useState(false)
  const [visto, setVisto] = useState(false)
  const router = useRouter()

  useEffect(() => {
    getStockCritico().then(productos => {
      setCriticos(productos.filter(p => esStockCritico(p.stock_actual, p.stock_minimo)))
    })
  }, [])

  if (criticos.length === 0) return null

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => { setVisible(!visible); setVisto(true) }}
        style={{
          position: 'relative',
          background: visto ? 'rgba(255,71,87,0.1)' : 'rgba(255,71,87,0.18)',
          border: '1px solid rgba(255,71,87,0.25)',
          borderRadius: 8,
          width: 30,
          height: 30,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
        <Bell size={13} color="#ff4757" />
        {!visto && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 14, height: 14,
            background: 'var(--r)',
            borderRadius: '50%',
            fontSize: 8, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700,
            border: '2px solid #13131a',
          }}>
            {criticos.length}
          </span>
        )}
      </button>

      {visible && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setVisible(false)} />
          <div className="notif-dropdown" style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 99,
            overflow: 'hidden',
            animation: 'slideUp 0.2s ease',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,184,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={13} color="#ffb800" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Stock crítico</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{criticos.length} producto{criticos.length > 1 ? 's' : ''} para reponer</div>
              </div>
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {criticos.map(p => (
                <div key={p.id} style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--r)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)' }}>Stock: {p.stock_actual} · Mín: {p.stock_minimo}</div>
                  </div>
                  <span style={{ background: 'rgba(255,71,87,0.1)', color: 'var(--r)', padding: '2px 7px', borderRadius: 5, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>Crítico</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 16px' }}>
              <button onClick={() => { setVisible(false); router.push('/stock') }}
                style={{ width: '100%', padding: '8px', borderRadius: 9, background: 'var(--r)', color: 'white', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                Ver control de stock <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
