'use client'
import { useState } from 'react'
import { User, Save, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { invalidarCacheComercio } from '@/lib/supabase/_base'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DemoLockNotice } from '@/components/ui/DemoLockNotice'
import { validarPasswordNueva } from '@/lib/auth/password'
import { SectionHeader, Field } from './TabComercio'

// Tab "Cuenta" — datos de TU cuenta (nombre + email login) +
// cambio de password.
//
// Decisión explícita V1: cambio de password NO pide la actual.
// supabase.auth.updateUser({ password }) no la soporta nativamente.
// Cuando hagamos onboarding security-grave (multi-factor, etc.),
// reemplazamos esto con un re-auth flow.

interface Props {
  perfilId: string
  perfilNombre: string | null
  email: string
  onSaved: () => void
  /** Si true, todas las acciones de edición se reemplazan por un
   *  DemoLockNotice. Para la cuenta demo compartida: cambiar el
   *  nombre del perfil "Demo Sylvora" o la password rompería la
   *  demo para los siguientes visitantes. */
  bloqueado?: boolean
}

export function TabCuenta({ perfilId, perfilNombre, email, onSaved, bloqueado = false }: Props) {
  const [nombre, setNombre] = useState(perfilNombre ?? '')
  const [guardandoNombre, setGuardandoNombre] = useState(false)

  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [cambiandoPwd, setCambiandoPwd] = useState(false)

  const guardarNombre = async () => {
    setGuardandoNombre(true)
    const supabase = createClient()

    const { data: rows, error } = await supabase
      .from('perfiles')
      .update({ nombre: nombre.trim() || null })
      .eq('id', perfilId)
      .select()

    if (error) {
      console.error('[/configuracion] UPDATE perfiles falló:', error)
      toast.error('No se pudo actualizar tu nombre')
      setGuardandoNombre(false)
      return
    }
    if (!rows || rows.length === 0) {
      toast.error('No tenés permisos para actualizar tu cuenta.')
      setGuardandoNombre(false)
      return
    }

    invalidarCacheComercio() // perfil cacheado también se invalida acá
    onSaved()
    toast.success('Cuenta actualizada')
    setGuardandoNombre(false)
  }

  const cambiarPassword = async () => {
    const v = validarPasswordNueva(pwd1, pwd2)
    if (!v.ok) {
      toast.error(v.error)
      return
    }
    setCambiandoPwd(true)
    const supabase = createClient()

    const { error } = await supabase.auth.updateUser({ password: pwd1 })

    if (error) {
      console.error('[/configuracion] updateUser password falló:', error)
      toast.error(error.message || 'No se pudo cambiar la contraseña')
      setCambiandoPwd(false)
      return
    }

    setPwd1('')
    setPwd2('')
    toast.success('Contraseña actualizada')
    setCambiandoPwd(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Bloque 1 — Identidad */}
      <div>
        <SectionHeader Icon={User} title="Tu identidad"
          subtitle="Cómo apareces dentro del comercio" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
          <Field label="Tu nombre" full>
            <Input size="md" value={nombre} disabled={bloqueado}
              onChange={e => setNombre(e.target.value)}
              placeholder="Juan García" />
          </Field>
          <Field label="Email de acceso" full>
            <Input size="md" value={email} disabled style={{ opacity: 0.6 }} />
          </Field>
        </div>
        <div style={{ marginTop: 16 }}>
          {bloqueado ? (
            <DemoLockNotice
              texto="Editar tu nombre está deshabilitado en la demo."
              detalle="Esta cuenta es compartida — la usan otros visitantes para explorar Sylvora."
            />
          ) : (
            <Button
              variant="primary"
              onClick={guardarNombre}
              loading={guardandoNombre}
              icon={!guardandoNombre ? <Save size={14} /> : undefined}
            >
              {guardandoNombre ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          )}
        </div>
      </div>

      {/* Bloque 2 — Cambiar contraseña */}
      <div>
        <SectionHeader Icon={Lock} title="Cambiar contraseña"
          subtitle={bloqueado
            ? 'Bloqueado en la demo para no dejar afuera a los próximos visitantes.'
            : 'Mínimo 6 caracteres. Se aplica inmediatamente.'} />
        {bloqueado ? (
          <div style={{ marginTop: 20 }}>
            <DemoLockNotice
              texto="Cambiar la contraseña no está disponible en la demo."
              detalle="Creá tu cuenta para tener una contraseña personal y permanente."
            />
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
              <Field label="Nueva contraseña">
                <Input size="md" type="password" value={pwd1}
                  onChange={e => setPwd1(e.target.value)} />
              </Field>
              <Field label="Confirmar">
                <Input size="md" type="password" value={pwd2}
                  onChange={e => setPwd2(e.target.value)} />
              </Field>
            </div>
            <div style={{ marginTop: 16 }}>
              <Button
                variant="primary"
                onClick={cambiarPassword}
                loading={cambiandoPwd}
                disabled={!pwd1 || !pwd2}
                icon={!cambiandoPwd ? <Lock size={14} /> : undefined}
              >
                {cambiandoPwd ? 'Actualizando…' : 'Cambiar contraseña'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
