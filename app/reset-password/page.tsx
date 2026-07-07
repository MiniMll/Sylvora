'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Brand } from '@/components/brand/Brand'
import { validarPasswordNueva } from '@/lib/auth/password'

// /reset-password — pantalla de fijación de contraseña. Sirve a DOS flujos
// (mismo código, distinto copy según ?bienvenida):
//   - Recuperación (V1, default): "Nueva contraseña".
//   - Invitación / primer acceso (U4, ?bienvenida=1): el empleado invitado
//     fija su PRIMERA contraseña.
//
// En ambos requiere la sesión que estableció /auth/callback. Si se llega
// sin sesión (link vencido/usado o acceso directo), muestra el estado
// "link inválido" con la salida acorde al flujo.

type Estado = 'verificando' | 'listo' | 'sin_sesion'

function ResetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const esBienvenida = searchParams.get('bienvenida') === '1'
  const [estado, setEstado] = useState<Estado>('verificando')
  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const verificarSesion = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    setEstado(user ? 'listo' : 'sin_sesion')
  }, [])

  useEffect(() => {
    // El callback recién seteó las cookies; damos un tick y verificamos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void verificarSesion()
  }, [verificarSesion])

  const guardar = async () => {
    const v = validarPasswordNueva(pwd1, pwd2)
    if (!v.ok) { setError(v.error); return }
    setGuardando(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pwd1 })
    if (error) {
      console.warn('[reset-password] updateUser:', error.message)
      setError('No pudimos guardar la contraseña. Puede que el link haya vencido — pedí uno nuevo.')
      setGuardando(false)
      return
    }
    // Sesión ya activa tras updateUser → entramos directo.
    router.push('/dashboard')
  }

  const inp: React.CSSProperties = {
    width: '100%', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10,
    padding: '10px 14px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit',
    background: '#fafaf9', color: '#1a1a1e', transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  const card = (children: React.ReactNode) => (
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
        border: '1px solid rgba(0,0,0,0.06)', position: 'relative', zIndex: 1,
      }}>
        <div style={{ marginBottom: 32 }}><Brand size={34} withText style={{ color: '#1a1a1e' }} /></div>
        {children}
      </div>
    </div>
  )

  if (estado === 'verificando') {
    return card(
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#888898', fontSize: 13.5 }}>
        <Loader2 size={16} style={{ animation: 'spin 0.75s linear infinite' }} /> Verificando el link...
      </div>
    )
  }

  if (estado === 'sin_sesion') {
    return card(
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <AlertCircle size={20} color="var(--r)" strokeWidth={2} />
          <div style={{ fontSize: 19, fontWeight: 700, color: '#1a1a1e', letterSpacing: '-0.3px' }}>
            {esBienvenida ? 'Invitación inválida o vencida' : 'Link inválido o vencido'}
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: '#888898', marginBottom: 24, lineHeight: 1.55 }}>
          {esBienvenida
            ? 'El link de invitación no es válido o ya venció. Pedile al administrador de tu comercio que te reenvíe la invitación.'
            : 'El link de recuperación no es válido o ya venció. Pedí uno nuevo para crear tu contraseña.'}
        </div>
        {esBienvenida ? (
          <Link href="/login" style={{ color: 'var(--ac)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
            ← Ir a iniciar sesión
          </Link>
        ) : (
          <Link href="/recuperar" style={{ color: 'var(--ac)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
            Pedir un nuevo link →
          </Link>
        )}
      </>
    )
  }

  return card(
    <>
      <div style={{ fontSize: 21, fontWeight: 700, color: '#1a1a1e', letterSpacing: '-0.4px', marginBottom: 6 }}>
        {esBienvenida ? '¡Te damos la bienvenida!' : 'Nueva contraseña'}
      </div>
      <div style={{ fontSize: 13.5, color: '#888898', marginBottom: 28, lineHeight: 1.5 }}>
        {esBienvenida
          ? 'Te invitaron a usar Sylvora. Creá una contraseña para entrar a tu cuenta.'
          : 'Elegí una contraseña nueva para tu cuenta.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: '#6b6b72', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            {esBienvenida ? 'Contraseña' : 'Nueva contraseña'}
          </label>
          <input type="password" value={pwd1} onChange={e => setPwd1(e.target.value)} placeholder="••••••••"
            onFocus={e => { e.target.style.borderColor = 'var(--ac)'; e.target.style.boxShadow = '0 0 0 3px rgba(91,76,255,0.1)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
            style={inp} autoFocus />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#6b6b72', fontWeight: 600, display: 'block', marginBottom: 6 }}>Repetir contraseña</label>
          <input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && guardar()}
            onFocus={e => { e.target.style.borderColor = 'var(--ac)'; e.target.style.boxShadow = '0 0 0 3px rgba(91,76,255,0.1)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
            style={inp} />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 16, background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.18)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, color: 'var(--r)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <AlertCircle size={13} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      <button onClick={guardar} disabled={guardando}
        style={{
          width: '100%', marginTop: 22, padding: '12px', borderRadius: 11,
          background: guardando ? '#7a6fff' : 'var(--ac)', color: 'white', border: 'none',
          fontSize: 14, fontWeight: 600, cursor: guardando ? 'wait' : 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 2px 10px rgba(91,76,255,0.25)', transition: 'all 0.15s', letterSpacing: '-0.1px',
        }}>
        {guardando
          ? <><Loader2 size={15} style={{ animation: 'spin 0.75s linear infinite' }} /> Guardando...</>
          : <>{esBienvenida ? 'Crear contraseña y entrar' : 'Guardar contraseña'} <ArrowRight size={15} /></>}
      </button>
    </>
  )
}

// Suspense boundary — useSearchParams en Next 16 requiere el wrap para no
// romper el static render. Fallback mínimo (mismo fondo) para no parpadear.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="auth-light" style={{ minHeight: '100vh', background: 'linear-gradient(145deg, #f0eefc 0%, #f5f4f0 50%, #edf5f2 100%)' }} />
    }>
      <ResetPasswordInner />
    </Suspense>
  )
}
