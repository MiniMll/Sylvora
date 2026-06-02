'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight } from 'lucide-react'
import { useTrial } from '@/lib/hooks/useTrial'
import { esComercioDemo } from '@/lib/demo'
import { createClient } from '@/lib/supabase/client'

// Banner sticky que aparece SOLO cuando la sesión actual está usando
// el comercio demo compartido. Cumple dos roles:
//
//   1. Honestidad: el visitante entiende que esta NO es su cuenta
//      real. Sin esto, alguien podría confundirse pensando que ya
//      se registró, y después no entender por qué sus productos
//      desaparecen tras el reset diario.
//
//   2. Conversión: CTA "Crear mi cuenta" → /registro. Es la única
//      fricción explícita que ponemos en la experiencia demo
//      (el resto del producto se ve idéntico al real).
//
// Decisiones de diseño:
//   - NO es dismissible. A diferencia del TrialBanner, este aviso es
//     el ÚNICO recordatorio de que estás en demo — silenciarlo
//     anularía el rol #1.
//   - Color informativo (var(--ac-light) bg + var(--ac) accent),
//     no de urgencia. La demo no tiene problema, solo es demo.
//   - Reusa la clase .trial-banner-inner para el offset mobile que
//     evita tapar el botón hamburguesa fijo (ya armado en globals.css
//     para el TrialBanner).
//
// Por qué useTrial: ya carga el comercio cacheado vía getComercio()
// para el TrialBanner. Reusarlo evita una query extra. La info que
// necesitamos (comercio.id) está en `trial.comercio`.

export function DemoBanner() {
  const router = useRouter()
  const { comercio, loading } = useTrial()
  const [saliendo, setSaliendo] = useState(false)

  // No flashear durante el primer render mientras se resuelve la
  // sesión. Mejor 1 frame sin banner que un parpadeo del banner.
  if (loading) return null
  if (!esComercioDemo(comercio)) return null

  // CTA → /registro. Cerramos la sesión demo PRIMERO. Sin esto, el
  // visitante llega a /registro con cookies de demo@sylvora.app vivas;
  // al registrarse, el flujo arma una sesión nueva por encima de la
  // vieja y dejaba estados raros (ej. router.push bounce-back, página
  // que parece no cargar). Con signOut explícito empezamos desde
  // estado limpio.
  async function irARegistro() {
    if (saliendo) return
    setSaliendo(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (e) {
      // signOut puede fallar si la red está caída, pero igual queremos
      // que el visitante llegue al registro (la página pública es
      // accesible sin sesión válida). Log pero no bloquea.
      console.error('[DemoBanner] signOut falló', e)
    }
    // router.push respeta el client routing; usamos push (no replace)
    // para que el back del navegador devuelva al demo si el visitante
    // se arrepiente.
    router.push('/registro')
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        width: '100%',
        background: 'var(--ac-light)',
        borderBottom: '1px solid rgba(91,76,255,0.30)',
        backdropFilter: 'saturate(140%) blur(6px)',
        WebkitBackdropFilter: 'saturate(140%) blur(6px)',
      }}
    >
      <div
        className="trial-banner-inner"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '8px 16px',
          minHeight: 36,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.3,
        }}
      >
        <Sparkles
          size={14}
          strokeWidth={2.2}
          color="var(--ac)"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        />

        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ color: 'var(--ac)', fontWeight: 600 }}>
            Estás viendo una demo de Sylvora.
          </strong>
          <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
            Los datos son ficticios y se restauran cada día.
          </span>
        </span>

        <button
          onClick={irARegistro}
          disabled={saliendo}
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 12px',
            minHeight: 28,
            background: 'var(--ac)',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: saliendo ? 'progress' : 'pointer',
            opacity: saliendo ? 0.7 : 1,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {saliendo ? 'Saliendo...' : 'Crear mi cuenta'}
          {!saliendo && <ArrowRight size={12} strokeWidth={2.4} />}
        </button>
      </div>
    </div>
  )
}
