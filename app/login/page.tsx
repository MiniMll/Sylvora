'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import { Brand } from '@/components/Brand'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const router = useRouter()

  const handleLogin = async () => {
    setCargando(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos')
      setCargando(false)
      return
    }
    router.push('/dashboard')
  }

  const inp: React.CSSProperties = {
    width: '100%',
    border: '1.5px solid var(--border, rgba(0,0,0,0.12))',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13.5,
    outline: 'none',
    fontFamily: 'inherit',
    background: '#fafaf9',
    color: '#1a1a1e',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #f0eefc 0%, #f5f4f0 50%, #edf5f2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'DM Sans, sans-serif',
      padding: 16,
    }}>
      {/* Decorative blobs */}
      <div style={{ position: 'fixed', top: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(91,76,255,0.06)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -80, right: -80, width: 280, height: 280, borderRadius: '50%', background: 'rgba(0,200,150,0.05)', filter: 'blur(60px)', pointerEvents: 'none' }} />

      <div style={{
        background: '#ffffff',
        borderRadius: 22,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
        border: '1px solid rgba(0,0,0,0.06)',
        animation: 'fadeIn 0.3s ease',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Brand */}
        <div style={{ marginBottom: 32 }}>
          <Brand variant="wordmark" size={22} color="dark" />
        </div>

        <div style={{ fontSize: 21, fontWeight: 700, color: '#1a1a1e', letterSpacing: '-0.4px', marginBottom: 6 }}>Iniciar sesión</div>
        <div style={{ fontSize: 13.5, color: '#888898', marginBottom: 28, lineHeight: 1.5 }}>Ingresá con tu cuenta del comercio</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b6b72', fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.01em' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              onFocus={e => { e.target.style.borderColor = 'var(--ac)'; e.target.style.boxShadow = '0 0 0 3px rgba(91,76,255,0.1)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              style={inp}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#6b6b72', fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.01em' }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              onFocus={e => { e.target.style.borderColor = 'var(--ac)'; e.target.style.boxShadow = '0 0 0 3px rgba(91,76,255,0.1)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              style={inp}
            />
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 16,
            background: 'rgba(255,71,87,0.06)',
            border: '1px solid rgba(255,71,87,0.18)',
            borderRadius: 10,
            padding: '9px 14px',
            fontSize: 12.5,
            color: 'var(--r)',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={cargando}
          style={{
            width: '100%',
            marginTop: 22,
            padding: '12px',
            borderRadius: 11,
            background: cargando ? '#7a6fff' : 'var(--ac)',
            color: 'white',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            cursor: cargando ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 2px 10px rgba(91,76,255,0.25)',
            transition: 'all 0.15s',
            letterSpacing: '-0.1px',
          }}
          onMouseEnter={e => { if (!cargando) (e.currentTarget.style.background = 'var(--ac-hover)') }}
          onMouseLeave={e => { if (!cargando) (e.currentTarget.style.background = 'var(--ac)') }}>
          {cargando
            ? <><Loader2 size={15} style={{ animation: 'spin 0.75s linear infinite' }} /> Ingresando...</>
            : <>Ingresar <ArrowRight size={15} /></>
          }
        </button>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13, color: '#888898' }}>
          ¿No tenés cuenta?{' '}
          <a href="/registro" style={{ color: 'var(--ac)', textDecoration: 'none', fontWeight: 600 }}>
            Crear cuenta gratis
          </a>
        </div>
      </div>
    </div>
  )
}
