'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { Brand } from '@/components/brand/Brand'

// /recuperar — pide el email y dispara el mail de recuperación de
// Supabase. El link del mail aterriza en /auth/callback (que setea la
// sesión de recuperación) y de ahí a /reset-password.
//
// Anti-enumeración: mostramos SIEMPRE el mismo mensaje de éxito, exista
// o no la cuenta. No revelamos qué emails están registrados.

export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [cargando, setCargando] = useState(false)

  const enviar = async () => {
    if (!email.trim()) { setError('Ingresá tu email'); return }
    setCargando(true)
    setError('')
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    // No distinguimos "email no existe" de éxito (anti-enumeración). Solo
    // mostramos error si fue un fallo real de red/servidor.
    if (error && !/rate|limit|too many/i.test(error.message)) {
      console.warn('[recuperar] resetPasswordForEmail:', error.message)
    }
    setEnviado(true)
    setCargando(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10,
    padding: '10px 14px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit',
    background: '#fafaf9', color: '#1a1a1e', transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div className="auth-light" style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #f0eefc 0%, #f5f4f0 50%, #edf5f2 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Sans, sans-serif', padding: 16,
    }}>
      <div style={{ position: 'fixed', top: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(91,76,255,0.06)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -80, right: -80, width: 280, height: 280, borderRadius: '50%', background: 'rgba(0,200,150,0.05)', filter: 'blur(60px)', pointerEvents: 'none' }} />

      <div style={{
        background: '#ffffff', borderRadius: 22, padding: '40px 36px', width: '100%', maxWidth: 400,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
        border: '1px solid rgba(0,0,0,0.06)', animation: 'fadeIn 0.3s ease', position: 'relative', zIndex: 1,
      }}>
        <div style={{ marginBottom: 32 }}>
          <Brand size={34} withText style={{ color: '#1a1a1e' }} />
        </div>

        {enviado ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <CheckCircle2 size={22} color="var(--g)" strokeWidth={2} />
              <div style={{ fontSize: 19, fontWeight: 700, color: '#1a1a1e', letterSpacing: '-0.3px' }}>Revisá tu email</div>
            </div>
            <div style={{ fontSize: 13.5, color: '#888898', marginBottom: 24, lineHeight: 1.55 }}>
              Si hay una cuenta asociada a <b style={{ color: '#1a1a1e' }}>{email.trim()}</b>, te
              enviamos un link para restablecer tu contraseña. El link vence en una hora.
              Revisá también spam.
            </div>
            <Link href="/login" style={{ color: 'var(--ac)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
              ← Volver a iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#1a1a1e', letterSpacing: '-0.4px', marginBottom: 6 }}>Recuperar contraseña</div>
            <div style={{ fontSize: 13.5, color: '#888898', marginBottom: 28, lineHeight: 1.5 }}>
              Ingresá tu email y te mandamos un link para crear una nueva contraseña.
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#6b6b72', fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.01em' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                onKeyDown={e => e.key === 'Enter' && enviar()}
                onFocus={e => { e.target.style.borderColor = 'var(--ac)'; e.target.style.boxShadow = '0 0 0 3px rgba(91,76,255,0.1)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                style={inp}
                autoFocus
              />
            </div>

            {error && (
              <div style={{ marginTop: 16, background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.18)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, color: 'var(--r)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            <button
              onClick={enviar}
              disabled={cargando}
              style={{
                width: '100%', marginTop: 22, padding: '12px', borderRadius: 11,
                background: cargando ? '#7a6fff' : 'var(--ac)', color: 'white', border: 'none',
                fontSize: 14, fontWeight: 600, cursor: cargando ? 'wait' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 2px 10px rgba(91,76,255,0.25)', transition: 'all 0.15s', letterSpacing: '-0.1px',
              }}>
              {cargando
                ? <><Loader2 size={15} style={{ animation: 'spin 0.75s linear infinite' }} /> Enviando...</>
                : <>Enviar link <ArrowRight size={15} /></>}
            </button>

            <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13, color: '#888898' }}>
              <Link href="/login" style={{ color: 'var(--ac)', textDecoration: 'none', fontWeight: 600 }}>
                ← Volver a iniciar sesión
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
