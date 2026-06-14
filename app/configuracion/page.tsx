'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, User, CreditCard, Users, WalletCards, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'
import { esComercioDemo } from '@/lib/demo'
import { rolPuede } from '@/lib/permissions'
import type { Comercio, Rol } from '@/types/database'

import { TabComercio } from './components/TabComercio'
import { TabCuenta }   from './components/TabCuenta'
import { TabPlan }     from './components/TabPlan'
import { TabEquipo }   from './components/TabEquipo'
import { TabMercadoPago } from './components/TabMercadoPago'

// /configuracion — shell con tabs comercio/cuenta/plan/equipo.
//
// Estado dividido por tab: cada uno maneja su propio form +
// guardar(). El shell solo se ocupa de:
//   - cargar perfil + comercio una vez
//   - parsear el tab activo del URL (?tab=)
//   - re-fetchear data después de un save (callback onSaved)
//
// Sub-tabs son URL params en vez de páginas para evitar re-mount
// del shell entre tabs (estado del fetch se mantiene). Trade-off:
// no se puede tener pre-render por tab. Aceptable porque toda la
// data viene del cliente authenticado de Supabase.

type TabId = 'comercio' | 'cuenta' | 'plan' | 'equipo' | 'mercado-pago'

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: 'comercio',      label: 'Comercio',     Icon: Building2  },
  { id: 'cuenta',        label: 'Cuenta',       Icon: User       },
  { id: 'plan',          label: 'Plan',         Icon: CreditCard },
  { id: 'equipo',        label: 'Equipo',       Icon: Users      },
  { id: 'mercado-pago',  label: 'Mercado Pago', Icon: WalletCards },
]

const TAB_IDS: TabId[] = ['comercio', 'cuenta', 'plan', 'equipo', 'mercado-pago']

interface DataConfiguracion {
  userId:        string
  userEmail:     string
  perfilNombre:  string | null
  rol:           Rol
  comercio:      Comercio | null
  comercioId:    string | null
}

function ConfiguracionShell() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tabParam = searchParams.get('tab') as TabId | null

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DataConfiguracion | null>(null)

  const puedeGestionarMP = Boolean(data && rolPuede(data.rol, 'mp.gestionar'))
  const tabsVisibles = TABS.filter(t => t.id !== 'mercado-pago' || puedeGestionarMP)
  const tabActivo: TabId =
    tabParam && TAB_IDS.includes(tabParam) && (tabParam !== 'mercado-pago' || puedeGestionarMP)
      ? tabParam
      : 'comercio'

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: perfil, error: perfilErr } = await supabase
      .from('perfiles')
      .select('*, comercios(*)')
      .eq('id', user.id)
      .maybeSingle()

    if (perfilErr) {
      console.error('[/configuracion] No se pudo cargar el perfil:', perfilErr)
      toast.error('No se pudo cargar tu perfil')
      setLoading(false)
      return
    }
    if (!perfil) {
      toast.error('Tu perfil no existe en el sistema. Contactá al soporte.')
      setLoading(false)
      return
    }

    if (!perfil.comercios) {
      // Comercio huérfano — mismo flow defensivo que tenía la versión
      // pre-tabs (ver scripts/migration-rls-recovery.sql para historia).
      toast.error(
        'Tu perfil apunta a un comercio que ya no existe. ' +
        'Contactá al soporte con tu email para reparar la cuenta.'
      )
    }

    setData({
      userId:       user.id,
      userEmail:    user.email ?? '',
      perfilNombre: perfil.nombre,
      rol:          perfil.rol as Rol,
      comercio:     (perfil.comercios as Comercio | null) ?? null,
      comercioId:   perfil.comercio_id ?? null,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    // Fetch-on-mount estándar (Next + Supabase client). El lint
    // react-hooks/set-state-in-effect prefiere useSyncExternalStore
    // o SWR/react-query, pero acá el effect dispara cargar() que
    // setea data + loading. Caso legítimo documentado por React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar()
  }, [cargar])

  // Cambio de tab — `replace` evita inflar el history (no querés
  // que el botón "atrás" del browser navegue tab-por-tab dentro
  // de la misma página). scroll: false mantiene la posición.
  const cambiarTab = (id: TabId) => {
    router.replace(`/configuracion?tab=${id}`, { scroll: false })
  }

  if (loading) {
    return (
      <div style={{ padding: 24, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner texto="Cargando configuración..." />
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: 24, color: 'var(--text2)' }}>
        No se pudo cargar la configuración.
      </div>
    )
  }

  return (
    <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
      {/* Header de página */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: 24, fontWeight: 700, margin: 0,
          letterSpacing: '-0.02em', color: 'var(--text)',
        }}>
          Configuración
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>
          Tu comercio, cuenta, plan, equipo e integraciones
        </p>
      </div>

      {/* Tabs nav — underline style. Scroll horizontal en mobile
          si los 4 tabs no entran (cada uno ~110px). */}
      <div style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--border)',
        marginBottom: 24,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {tabsVisibles.map(t => {
          const active = tabActivo === t.id
          const Icon = t.Icon
          return (
            <button
              key={t.id}
              onClick={() => cambiarTab(t.id)}
              aria-pressed={active}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                // Underline activo: borde inferior violet que sobresale
                // del border del container. -1px de offset lo alinea
                // perfecto sobre el border-bottom del wrapper.
                borderBottom: `2px solid ${active ? 'var(--ac)' : 'transparent'}`,
                marginBottom: -1,
                color: active ? 'var(--text)' : 'var(--text2)',
                fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 0.12s ease, border-color 0.12s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={15} strokeWidth={2} color={active ? 'var(--ac)' : 'var(--text2)'} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenido del tab — max-width 720 para que los forms no se
          estiren absurdamente en monitores anchos. */}
      {/* Si el comercio activo es el demo compartido, pasamos el flag
          a las tabs sensibles. Cada tab decide cómo presentar el
          bloqueo (inputs disabled + DemoLockNotice en vez de Guardar).
          NO ocultamos las tabs en sí — el visitante puede explorar
          el layout completo de Configuración para entender qué
          ofrece el producto real. */}
      <div style={{ maxWidth: 720 }}>
        {tabActivo === 'comercio' && data.comercio && (
          <TabComercio
            comercio={data.comercio}
            onSaved={cargar}
            bloqueado={esComercioDemo(data.comercio)}
          />
        )}
        {tabActivo === 'comercio' && !data.comercio && (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>
            No se puede editar el comercio porque no se pudo cargar.
          </div>
        )}
        {tabActivo === 'cuenta' && (
          <TabCuenta
            perfilId={data.userId}
            perfilNombre={data.perfilNombre}
            email={data.userEmail}
            onSaved={cargar}
            bloqueado={esComercioDemo(data.comercio)}
          />
        )}
        {tabActivo === 'plan' && (
          <TabPlan plan={data.comercio?.plan ?? 'trial'} />
        )}
        {tabActivo === 'equipo' && (
          <TabEquipo />
        )}
        {tabActivo === 'mercado-pago' && puedeGestionarMP && (
          <TabMercadoPago />
        )}
      </div>
    </div>
  )
}

// Suspense boundary — useSearchParams en Next 16 requiere que el
// componente esté envuelto en Suspense para que el static render
// no rompa.
export default function ConfiguracionPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 24, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner texto="Cargando configuración..." />
      </div>
    }>
      <ConfiguracionShell />
    </Suspense>
  )
}
