'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegistroPage() {
  const router = useRouter()
  const [paso, setPaso] = useState(1)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    nombre: '',
    email: '',
    password: '',
    confirmar: '',
    comercio: '',
    tipo: 'almacen',
    telefono: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const registrar = async () => {
    if (form.password !== form.confirmar) { setError('Las contraseñas no coinciden'); return }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (!form.comercio) { setError('Ingresá el nombre del comercio'); return }

    setCargando(true)
    setError('')
    const supabase = createClient()

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (authError || !authData.user) {
      setError(authError?.message || 'Error al crear la cuenta')
      setCargando(false)
      return
    }

    // 2. Crear el comercio
    const { data: comercio, error: comercioError } = await supabase
      .from('comercios')
      .insert({ nombre: form.comercio, tipo: form.tipo, telefono: form.telefono, email: form.email, plan: 'pro' })
      .select()
      .single()

    if (comercioError || !comercio) {
      setError('Error al crear el comercio')
      setCargando(false)
      return
    }

    // 3. Crear perfil del usuario
    const { error: perfilError } = await supabase
      .from('perfiles')
      .insert({ id: authData.user.id, comercio_id: comercio.id, nombre: form.nombre, rol: 'admin' })

    if (perfilError) {
      setError('Error al crear el perfil')
      setCargando(false)
      return
    }

    // 4. Crear categorías por defecto
    const cats = [
      { nombre: 'Bebidas', icono: 'BV', color: '#5b4cff' },
      { nombre: 'Almacén', icono: 'AL', color: '#00c896' },
      { nombre: 'Lácteos', icono: 'LC', color: '#ff6b35' },
      { nombre: 'Limpieza', icono: 'LM', color: '#ffd23f' },
      { nombre: 'Ferretería', icono: 'FR', color: '#ff4757' },
    ]
    await supabase.from('categorias').insert(cats.map(c => ({ ...c, comercio_id: comercio.id })))

    router.push('/dashboard')
  }

  const inp: React.CSSProperties = { width: '100%', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', background: '#fafaf9', color: '#1a1a1e', transition: 'border-color 0.15s, box-shadow 0.15s' }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6b6b72', fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.01em' }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, #f0eefc 0%, #f5f4f0 50%, #edf5f2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif', padding: 16 }}>
      <div style={{ background: '#ffffff', borderRadius: 22, padding: '40px 36px', width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)', animation: 'fadeIn 0.3s ease' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--ac)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'white', fontWeight: 700, fontSize: 14, letterSpacing: '-0.04em' }}>Sy</span></div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1e', letterSpacing: '-0.01em' }}>Sylvora</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>Crear cuenta gratis</div>
          </div>
        </div>

        {/* Pasos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {[1, 2].map(p => (
            <div key={p} style={{ flex: 1, height: 4, borderRadius: 2, background: paso >= p ? 'var(--ac)' : 'var(--bg3)', transition: 'background 0.3s' }} />
          ))}
        </div>

        {paso === 1 && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>Tu cuenta</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Datos de acceso al sistema</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Nombre completo *</label>
                <input style={inp} placeholder="Juan García" value={form.nombre} onChange={e => set('nombre', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Email *</label>
                <input style={inp} type="email" placeholder="juan@micomercio.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Contraseña *</label>
                <input style={inp} type="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={e => set('password', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Confirmar contraseña *</label>
                <input style={inp} type="password" placeholder="Repetí la contraseña" value={form.confirmar} onChange={e => set('confirmar', e.target.value)} />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 14, background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.18)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, color: 'var(--r)' }}>
                {error}
              </div>
            )}

            <button onClick={() => {
              if (!form.nombre || !form.email || !form.password || !form.confirmar) { setError('Completá todos los campos'); return }
              if (form.password !== form.confirmar) { setError('Las contraseñas no coinciden'); return }
              setError(''); setPaso(2)
            }}
              style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 11, background: 'var(--ac)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(91,76,255,0.25)', letterSpacing: '-0.1px' }}>
              Siguiente
            </button>
          </>
        )}

        {paso === 2 && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>Tu comercio</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Datos del negocio</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Nombre del comercio *</label>
                <input style={inp} placeholder="Almacén Don Juan" value={form.comercio} onChange={e => set('comercio', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Tipo de comercio</label>
                <select style={inp} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                  <option value="kiosco">Kiosco</option>
                  <option value="almacen">Almacén / Despensa</option>
                  <option value="ferreteria">Ferretería</option>
                  <option value="supermercado">Supermercado chico</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Teléfono (opcional)</label>
                <input style={inp} placeholder="+54 11 1234-5678" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 14, background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.18)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, color: 'var(--r)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => { setError(''); setPaso(1) }}
                style={{ flex: 1, padding: '12px', borderRadius: 11, border: '1.5px solid rgba(0,0,0,0.1)', background: 'transparent', color: '#6b6b72', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Atrás
              </button>
              <button onClick={registrar} disabled={cargando}
                style={{ flex: 2, padding: '12px', borderRadius: 11, background: 'var(--ac)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: cargando ? 'wait' : 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(91,76,255,0.25)' }}>
                {cargando ? 'Creando cuenta...' : 'Crear cuenta gratis'}
              </button>
            </div>
          </>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" style={{ color: 'var(--ac)', textDecoration: 'none', fontWeight: 500 }}>Iniciar sesión</Link>
        </div>
      </div>
    </div>
  )
}