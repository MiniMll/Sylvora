'use client'
import { useState } from 'react'
import { Building2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { invalidarCacheComercio } from '@/lib/supabase/_base'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { DemoLockNotice } from '@/components/ui/DemoLockNotice'
import {
  normalizarConfigDiaOperativo,
  serializeConfigDiaOperativo,
} from '@/lib/operacion/diaOperativo'
import type { Comercio } from '@/types/database'

// Tab "Comercio" — datos del negocio que aparecen en tickets, PDFs
// y comunicaciones. Es admin-only en la RLS: ver
// scripts/migration-comercios-update-policy.sql.
//
// La verificación de permisos no se duplica acá — si el UPDATE
// devuelve 0 filas, mostramos el mensaje específico al usuario.

interface Props {
  comercio: Comercio
  onSaved: () => void
  /** Si true, el form se muestra en modo lectura — inputs disabled y
   *  el botón Guardar se reemplaza por un DemoLockNotice. Para la
   *  cuenta demo compartida (evita que un visitante cambie nombre
   *  del comercio y rompa la demo para los siguientes). */
  bloqueado?: boolean
}

export function TabComercio({ comercio, onSaved, bloqueado = false }: Props) {
  const configCaja = normalizarConfigDiaOperativo(comercio.settings)
  const [form, setForm] = useState({
    nombre:    comercio.nombre || '',
    tipo:      comercio.tipo || 'almacen',
    telefono:  comercio.telefono || '',
    email:     comercio.email || '',
    direccion: comercio.direccion || '',
    caja_24hs: configCaja.caja_24hs,
    hora_apertura_caja: configCaja.hora_apertura_caja,
    hora_cierre_caja: configCaja.hora_cierre_caja,
  })
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    const supabase = createClient()

    const { data: rows, error } = await supabase
      .from('comercios')
      .update({
        nombre:    form.nombre.trim(),
        tipo:      form.tipo,
        telefono:  form.telefono.trim() || null,
        email:     form.email.trim() || null,
        direccion: form.direccion.trim() || null,
        settings: {
          ...(comercio.settings ?? {}),
          ...serializeConfigDiaOperativo({
            caja_24hs: form.caja_24hs,
            hora_apertura_caja: form.hora_apertura_caja,
            hora_cierre_caja: form.hora_cierre_caja,
            timezone: 'America/Argentina/Buenos_Aires',
          }),
        },
      })
      .eq('id', comercio.id)
      .select()

    if (error) {
      console.error('[/configuracion] UPDATE comercios falló:', error)
      toast.error('No se pudieron guardar los datos del comercio')
      setGuardando(false)
      return
    }
    if (!rows || rows.length === 0) {
      toast.error('No tenés permisos para editar los datos del comercio.')
      setGuardando(false)
      return
    }

    // Sin esto, getComercio() devuelve datos viejos en cualquier
    // lugar que los lea (tickets, exports, debug endpoint).
    invalidarCacheComercio()
    onSaved()
    toast.success('Datos del comercio actualizados')
    setGuardando(false)
  }

  return (
    <div>
      <SectionHeader Icon={Building2} title="Datos del comercio"
        subtitle="Lo que aparece en tickets, PDFs y comunicaciones del negocio" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
        <Field label="Nombre del comercio" full>
          <Input size="md" value={form.nombre} disabled={bloqueado}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Almacén Don Juan" />
        </Field>
        <Field label="Tipo de comercio">
          <Select size="md" value={form.tipo} disabled={bloqueado}
            onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
            <option value="kiosco">Kiosco</option>
            <option value="almacen">Almacén</option>
            <option value="ferreteria">Ferretería</option>
            <option value="supermercado">Supermercado</option>
            <option value="otro">Otro</option>
          </Select>
        </Field>
        <Field label="Teléfono">
          <Input size="md" value={form.telefono} disabled={bloqueado}
            onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
            placeholder="+54 11 1234-5678" />
        </Field>
        <Field label="Email del comercio">
          <Input size="md" type="email" value={form.email} disabled={bloqueado}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="contacto@micomercio.com" />
        </Field>
        <Field label="Dirección" full>
          <Input size="md" value={form.direccion} disabled={bloqueado}
            onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
            placeholder="Av. Corrientes 1234, CABA" />
        </Field>
        <Field label="Caja diaria" full>
          <Select
            size="md"
            value={form.caja_24hs ? '24hs' : 'horario'}
            disabled={bloqueado}
            onChange={e => setForm(f => ({ ...f, caja_24hs: e.target.value === '24hs' }))}
          >
            <option value="24hs">DÃ­a calendario Argentina (24 horas)</option>
            <option value="horario">Horario operativo personalizado</option>
          </Select>
        </Field>
        {!form.caja_24hs && (
          <>
            <Field label="Apertura de caja">
              <Input
                size="md"
                type="time"
                value={form.hora_apertura_caja}
                disabled={bloqueado}
                onChange={e => setForm(f => ({ ...f, hora_apertura_caja: e.target.value }))}
              />
            </Field>
            <Field label="Cierre de caja">
              <Input
                size="md"
                type="time"
                value={form.hora_cierre_caja}
                disabled={bloqueado}
                onChange={e => setForm(f => ({ ...f, hora_cierre_caja: e.target.value }))}
              />
            </Field>
          </>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        {bloqueado ? (
          <DemoLockNotice
            texto="Editar los datos del comercio está deshabilitado en la demo."
            detalle="Creá tu cuenta para personalizar nombre, dirección y datos que aparecen en tickets y PDFs."
          />
        ) : (
          <Button
            variant="primary"
            onClick={guardar}
            loading={guardando}
            icon={!guardando ? <Save size={14} /> : undefined}
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        )}
      </div>
    </div>
  )
}

// ───── Helpers locales — reusados por TabCuenta también ─────────────
// (DRY entre tabs. Si más adelante se usan en otras tabs, los movemos
// a un archivo compartido.)

export function SectionHeader({
  Icon, title, subtitle,
}: { Icon: typeof Building2; title: string; subtitle?: string }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 15, fontWeight: 700, color: 'var(--text)',
        letterSpacing: '-0.01em',
      }}>
        <Icon size={16} color="var(--ac)" strokeWidth={2.2} />
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

export function Field({
  label, full, children,
}: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text2)',
        display: 'block', marginBottom: 5,
        letterSpacing: '0.01em', textTransform: 'uppercase',
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}
