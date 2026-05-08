'use client'
import { useEffect, useState } from 'react'
import { getStockCritico } from '@/lib/supabase/productos'
import Link from 'next/link'

export function NotificacionesStock() {
  const [criticos, setCriticos] = useState<any[]>([])
  const [visible, setVisible] = useState(false)
  const [visto, setVisto] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const productos = await getStockCritico()
      const c = productos.filter((p: any) => p.stock_actual <= p.stock_minimo * 0.3)
      setCriticos(c)
    }
    cargar()
    // Revisar cada 5 minutos
    const interval = setInterval(cargar, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (criticos.length === 0) return null

  return (
    <div style={{ position: 'relative' }}>
      {/* Botón campana */}
      <button
        onClick={() => { setVisible(!visible); setVisto(true) }}
        style={{ position: 'relative', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
        
        {!visto && (
          <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: '#ff4757', borderRadius: '50%', fontSize: 9, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {criticos.length}
          </span>
        )}
      </button>

      {/* Panel desplegable */}
      {visible && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setVisible(false)} />
          <div style={{ position: 'absolute', top: 40, right: 0, width: 300, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 99, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Stock crítico</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{criticos.length} producto{criticos.length > 1 ? 's' : ''} requieren reposición</div>
              </div>
              <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {criticos.map((p: any) => (
                <div key={p.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,71,87,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: '#ff4757' }}>Stock: {p.stock_actual} / Mínimo: {p.stock_minimo}</div>
                  </div>
                  <span style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757', padding: '2px 7px', borderRadius: 5, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>Crítico</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 16px' }}>
              <Link href="/stock" onClick={() => setVisible(false)}
                style={{ display: 'block', textAlign: 'center', padding: '8px', borderRadius: 8, background: '#ff4757', color: 'white', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                Ver control de stock
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}