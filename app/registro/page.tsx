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
      { nombre: 'Bebidas', icono: '🥤', color: '#5b4cff' },
      { nombre: 'Almacén', icono: '🛒', color: '#00c896' },
      { nombre: 'Lácteos', icono: '🥛', color: '#ff6b35' },
      { nombre: 'Limpieza', icono: '🧹', color: '#ffd23f' },
      { nombre: 'Ferretería', icono: '🔩', color: '#ff4757' },
    ]
    await supabase.from('categorias').insert(cats.map(c => ({ ...c, comercio_id: comercio.id })))

    router.push('/dashboard')
  }

  const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)' }
  const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 5 }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif', padding: 16 }}>
      <div style={{ background: 'var(--card)', borderRadius: 20, padding: 36, width: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.1)' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#5b4cff,#9b8fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 16 }}>F</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Fácil Stock</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>Crear cuenta gratis</div>
          </div>
        </div>

        {/* Pasos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {[1, 2].map(p => (
            <div key={p} style={{ flex: 1, height: 4, borderRadius: 2, background: paso >= p ? '#5b4cff' : 'var(--bg3)', transition: 'background 0.3s' }} />
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
              <div style={{ marginTop: 12, background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ff4757' }}>
                ⚠️ {error}
              </div>
            )}

            <button onClick={() => {
              if (!form.nombre || !form.email || !form.password || !form.confirmar) { setError('Completá todos los campos'); return }
              if (form.password !== form.confirmar) { setError('Las contraseñas no coinciden'); return }
              setError(''); setPaso(2)
            }}
              style={{ width: '100%', marginTop: 20, padding: '11px', borderRadius: 9, background: '#5b4cff', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Siguiente →
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
                  <option value="kiosco">🥤 Kiosco</option>
                  <option value="almacen">🛒 Almacén / Despensa</option>
                  <option value="ferreteria">🔩 Ferretería</option>
                  <option value="supermercado">🏪 Supermercado chico</option>
                  <option value="otro">📦 Otro</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Teléfono (opcional)</label>
                <input style={inp} placeholder="+54 11 1234-5678" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 12, background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ff4757' }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => { setError(''); setPaso(1) }}
                style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                ← Atrás
              </button>
              <button onClick={registrar} disabled={cargando}
                style={{ flex: 2, padding: '11px', borderRadius: 9, background: '#5b4cff', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: cargando ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {cargando ? '⏳ Creando cuenta...' : '✓ Crear cuenta gratis'}
              </button>
            </div>
          </>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" style={{ color: '#5b4cff', textDecoration: 'none', fontWeight: 500 }}>Iniciar sesión</Link>
        </div>
      </div>
    </div>
  )
}