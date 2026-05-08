'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'

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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ background: 'var(--card)', borderRadius: 20, padding: 40, width: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.1)' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#5b4cff,#9b8fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 16 }}>S</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Sylvora</div>
            <div style={{ fontSize: 11, color: '#6b6b72' }}>Gestión inteligente</div>
          </div>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Iniciar sesión</div>
        <div style={{ fontSize: 13, color: '#6b6b72', marginBottom: 24 }}>Ingresá con tu cuenta del comercio</div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#6b6b72', fontWeight: 500, display: 'block', marginBottom: 5 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@micomercio.com"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ width: '100%', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: '#6b6b72', fontWeight: 500, display: 'block', marginBottom: 5 }}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ width: '100%', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ff4757', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <button onClick={handleLogin} disabled={cargando}
          style={{ width: '100%', padding: '11px', borderRadius: 9, background: '#5b4cff', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: cargando ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {cargando
            ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Ingresando...</>
            : <>Ingresar <ArrowRight size={15} /></>
          }
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

        <div style={{ marginTop: 20, padding: 12, background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: '#6b6b72' }}>
          <b>Demo:</b> admin@micomercio.com / facilstock123
        </div>
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
          ¿No tenés cuenta?{' '}
          <a href="/registro" style={{ color: '#5b4cff', textDecoration: 'none', fontWeight: 500 }}>
            Crear cuenta gratis
          </a>
        </div>
      </div>
    </div>
  )
}
