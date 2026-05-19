'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { invalidarCacheComercio } from '@/lib/supabase/_base'
import { toast } from 'sonner'
import { Building2, Save, User, Phone, Mail, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'

export default function PerfilPage() {
  const [loading, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [usuario, setUsuario] = useState<any>(null)
  const [form, setForm] = useState({
    nombre_comercio: '',
    tipo: '',
    telefono: '',
    email: '',
    direccion: '',
    nombre_admin: '',
  })

  useEffect(() => {
    const cargar = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('*, comercios(*)')
        .eq('id', user.id)
        .single()

      if (perfil) {
        setUsuario(perfil)
        setForm({
          nombre_comercio: perfil.comercios?.nombre || '',
          tipo: perfil.comercios?.tipo || '',
          telefono: perfil.comercios?.telefono || '',
          email: perfil.comercios?.email || user.email || '',
          direccion: perfil.comercios?.direccion || '',
          nombre_admin: perfil.nombre || '',
        })
      }
      setCargando(false)
    }
    cargar()
  }, [])

  const guardar = async () => {
    setGuardando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Sesión expirada — volvé a entrar')
      setGuardando(false)
      return
    }

    // UPDATE del comercio. Usamos .select() para que Supabase nos
    // devuelva las filas afectadas — si RLS bloquea o la fila no
    // existe, devuelve [] sin error. Sin esto, el toast.success se
    // mostraba incluso cuando el UPDATE afectaba 0 rows (bug previo:
    // la policy comercios_update_admin no existía, todos los UPDATEs
    // fallaban silente, /perfil parecía guardar pero nada persistía).
    const { data: comercioUpdated, error: comercioErr } = await supabase
      .from('comercios')
      .update({
        nombre: form.nombre_comercio,
        tipo: form.tipo,
        telefono: form.telefono,
        email: form.email,
        direccion: form.direccion,
      })
      .eq('id', usuario.comercio_id)
      .select()

    if (comercioErr) {
      console.error('[/perfil] UPDATE comercios falló:', comercioErr)
      toast.error('No se pudieron guardar los datos del comercio')
      setGuardando(false)
      return
    }
    if (!comercioUpdated || comercioUpdated.length === 0) {
      // 0 rows afectadas = RLS bloqueó o id no coincide. En cualquier
      // caso, NO mostramos success.
      toast.error('No tenés permisos para editar los datos del comercio. Pedile al admin que actualice esto.')
      setGuardando(false)
      return
    }

    // UPDATE del nombre del admin en perfiles. Misma defensa.
    const { error: perfilErr } = await supabase
      .from('perfiles')
      .update({ nombre: form.nombre_admin })
      .eq('id', user.id)

    if (perfilErr) {
      console.error('[/perfil] UPDATE perfiles falló:', perfilErr)
      toast.error('Datos del comercio guardados, pero tu nombre no se pudo actualizar')
      setGuardando(false)
      return
    }

    // Invalidar caché de comercio/perfil. Sin esto, el ticket impreso
    // y cualquier otro lugar que use getComercio() seguiría mostrando
    // los datos viejos hasta el próximo full reload.
    invalidarCacheComercio()

    toast.success('Perfil actualizado correctamente')
    setGuardando(false)
  }

  const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 5 }
  const sec: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: 20, border: '1px solid var(--border)', marginBottom: 14 }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Perfil y Configuración</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>Datos de tu comercio y cuenta</p>
      </div>

      <div style={{ maxWidth: 600 }}>
        {/* Comercio */}
        <div style={sec}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            <Building2 size={16} color="#5b4cff" /> Datos del comercio
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Nombre del comercio</label>
              <Input size="md" value={form.nombre_comercio} onChange={e => setForm(f => ({ ...f, nombre_comercio: e.target.value }))} placeholder="Almacén Don Juan" />
            </div>
            <div>
              <label style={lbl}>Tipo de comercio</label>
              <Select size="md" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="kiosco">Kiosco</option>
                <option value="almacen">Almacén</option>
                <option value="ferreteria">Ferretería</option>
                <option value="supermercado">Supermercado</option>
                <option value="otro">Otro</option>
              </Select>
            </div>
            <div>
              <label style={lbl}>Teléfono</label>
              <Input size="md" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+54 11 1234-5678" />
            </div>
            <div>
              <label style={lbl}>Email del comercio</label>
              <Input size="md" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Dirección</label>
              <Input size="md" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Av. Corrientes 1234, CABA" />
            </div>
          </div>
        </div>

        {/* Admin */}
        <div style={sec}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            <User size={16} color="#5b4cff" /> Tu cuenta
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Tu nombre</label>
              <Input size="md" value={form.nombre_admin} onChange={e => setForm(f => ({ ...f, nombre_admin: e.target.value }))} placeholder="Juan García" />
            </div>
            <div>
              <label style={lbl}>Email de acceso</label>
              <Input size="md" style={{ opacity: 0.6 }} value={form.email} disabled />
            </div>
          </div>
        </div>

        {/* Plan */}
        <div style={sec}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Plan activo
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, var(--ac), #9b8fff)', borderRadius: 12, padding: '16px 20px' }}>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Plan Pro</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>Productos ilimitados · 3 usuarios</div>
            </div>
            <div style={{ color: 'white', fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 700 }}>$17.990<span style={{ fontSize: 11, fontWeight: 400 }}>/mes</span></div>
          </div>
        </div>

        <Button variant="primary" onClick={guardar} loading={guardando} icon={!guardando ? <Save size={14} /> : undefined}>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  )
}