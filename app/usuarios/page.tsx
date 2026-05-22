'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Users, AlertTriangle, ShieldCheck, User, UserPlus } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { usePermissions } from '@/components/PermissionsProvider'
import { listUsuariosComercio, cambiarRolUsuario } from '@/lib/supabase/usuarios'
import { labelRol } from '@/lib/permissions'
import type { Perfil, Rol } from '@/types/database'

// Página V1 de gestión de usuarios. Listar + cambiar rol con guard
// de "último admin". Invite flow por email queda para P2.2 (requiere
// service role key, server-side).
//
// El acceso a la página está gateado por:
// - sidebar oculta el link si !has('usuario.gestionar')
// - este guard cliente como defensa adicional
// - middleware (P2.2)
// - RLS sobre perfiles.update (admin-only)

export default function UsuariosPage() {
  const { has, loading: permsLoading } = usePermissions()
  const [usuarios, setUsuarios] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState<string | null>(null)
  // Invite modal state.
  const [invitarOpen, setInvitarOpen] = useState(false)
  const [invitando, setInvitando] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invNombre, setInvNombre] = useState('')
  const [invRol, setInvRol] = useState<Rol>('empleado')

  const resetInviteForm = () => {
    setInvEmail('')
    setInvNombre('')
    setInvRol('empleado')
  }

  const refrescarUsuarios = async () => {
    setUsuarios(await listUsuariosComercio())
  }

  useEffect(() => {
    listUsuariosComercio().then(data => {
      setUsuarios(data)
      setCargando(false)
    })
  }, [])

  if (permsLoading || cargando) return <Spinner texto="Cargando usuarios..." />

  if (!has('usuario.gestionar')) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,184,0,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <AlertTriangle size={22} color="var(--w)" strokeWidth={1.8} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 6, color: 'var(--text)' }}>Acceso restringido</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
          Solo administradores pueden gestionar usuarios y roles.
        </p>
      </div>
    </div>
  )

  const cambiarRol = async (perfil: Perfil, nuevoRol: Rol) => {
    if (perfil.rol === nuevoRol) return
    setActualizando(perfil.id)
    const result = await cambiarRolUsuario(perfil.id, nuevoRol)
    if (result.ok) {
      setUsuarios(prev => prev.map(p => p.id === perfil.id ? { ...p, rol: nuevoRol } : p))
      toast.success(`${perfil.nombre || 'Usuario'} ahora es ${labelRol(nuevoRol)}`)
    } else if (result.reason === 'last_admin') {
      toast.error('No se puede dejar el comercio sin administradores')
    } else if (result.reason === 'rls') {
      toast.error('No tenés permiso para hacer ese cambio.')
    } else {
      toast.error(result.message || 'No pudimos cambiar el rol. Probá de nuevo.')
    }
    setActualizando(null)
  }

  const cantAdmins = usuarios.filter(u => u.rol === 'admin').length

  const enviarInvitacion = async () => {
    if (!invEmail.trim()) {
      toast.error('Ingresá un email')
      return
    }
    setInvitando(true)
    try {
      const res = await fetch('/api/usuarios/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invEmail.trim(),
          rol: invRol,
          nombre: invNombre.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Invitación enviada a ${invEmail.trim()}`)
        await refrescarUsuarios()
        resetInviteForm()
        setInvitarOpen(false)
      } else {
        toast.error(data.error || 'No se pudo enviar la invitación')
      }
    } catch (e) {
      console.error('[invitar]', e)
      toast.error('No pudimos enviar la invitación. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setInvitando(false)
    }
  }

  return (
    <div style={{ padding: 24, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} /> Usuarios
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>
            {usuarios.length} {usuarios.length === 1 ? 'usuario' : 'usuarios'} · {cantAdmins} {cantAdmins === 1 ? 'admin' : 'admins'}
          </p>
        </div>
        <Button variant="primary" size="sm" icon={<UserPlus size={14} />} onClick={() => setInvitarOpen(true)}>
          Invitar usuario
        </Button>
      </div>

      {usuarios.length === 1 && (
        <div style={{ flexShrink: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <EmptyState
            accent
            icon={<UserPlus size={20} color="var(--ac)" strokeWidth={2} />}
            title="Sos el único en tu equipo."
            description="Invitá a tus empleados para que cobren con su propia cuenta. Vos decidís qué puede tocar cada uno."
            actions={[{ label: 'Invitar usuario', onClick: () => setInvitarOpen(true), variant: 'primary', icon: <UserPlus size={15} /> }]}
            guiaHref="/guia"
          />
        </div>
      )}

      <div style={{ flexShrink: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div className="table-scroll">
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Nombre', 'Rol', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>No hay usuarios cargados</td></tr>
              ) : usuarios.map(u => {
                const esAdminUltimo = u.rol === 'admin' && cantAdmins === 1
                const editandoEste = actualizando === u.id
                return (
                  <tr key={u.id} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}>
                        <User size={14} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{u.nombre || '—'}</span>
                        <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>{u.id.slice(0, 8)}…</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: u.rol === 'admin' ? 'rgba(91,76,255,0.12)' : 'rgba(0,200,150,0.10)',
                        color: u.rol === 'admin' ? 'var(--ac)' : 'var(--g)',
                        padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      }}>
                        {u.rol === 'admin' && <ShieldCheck size={11} />}
                        {labelRol(u.rol)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Select
                        value={u.rol}
                        disabled={editandoEste || esAdminUltimo}
                        onChange={e => cambiarRol(u, e.target.value as Rol)}
                        style={{ width: 'auto', minWidth: 130, padding: '6px 10px' }}>
                        <option value="admin">Administrador</option>
                        <option value="empleado">Empleado</option>
                      </Select>
                      {esAdminUltimo && (
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
                          Último admin — no se puede degradar
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal invitar usuario */}
      <Modal
        open={invitarOpen}
        onClose={() => { if (!invitando) { setInvitarOpen(false); resetInviteForm() } }}
        title="Invitar usuario"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setInvitarOpen(false); resetInviteForm() }} disabled={invitando} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={enviarInvitacion} loading={invitando} style={{ flex: 1 }}>
              {invitando ? 'Enviando...' : 'Enviar invitación'}
            </Button>
          </>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            Se va a enviar un email con un link mágico. El usuario hace click,
            elige su contraseña, y queda dentro del comercio.
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Email *</label>
            <Input
              size="md"
              type="email"
              value={invEmail}
              onChange={e => setInvEmail(e.target.value)}
              placeholder="empleado@ejemplo.com"
              disabled={invitando}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Nombre (opcional)</label>
            <Input
              size="md"
              type="text"
              value={invNombre}
              onChange={e => setInvNombre(e.target.value)}
              placeholder="Juan Pérez"
              disabled={invitando}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Rol</label>
            <Select
              size="md"
              value={invRol}
              onChange={e => setInvRol(e.target.value as Rol)}
              disabled={invitando}>
              <option value="empleado">Empleado</option>
              <option value="admin">Administrador</option>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
