'use client'
import { Clock, MessageCircle, X } from 'lucide-react'
import { useTrial } from '@/lib/hooks/useTrial'
import { useDismissibleToday } from '@/lib/hooks/useDismissibleToday'

/** localStorage key del mute por día. Si más adelante agregamos
 *  más banners (mantenimiento, nueva versión), cada uno usa su
 *  propia key — todas vivirán bajo el namespace sylvora.dismiss.* */
const DISMISS_KEY = 'trial-banner'

// Banner sticky discreto que avisa al comerciante cuántos días de
// trial le quedan. Sin modal, sin bloqueo de navegación, sin
// notificaciones intrusivas: una franja de 36px arriba de todo,
// debajo del header de navegación.
//
// 3 niveles visuales según urgencia (escalan progresivamente sin
// llegar a ser hostiles):
//   7-4 días → amarillo (info: "te estás acercando al final")
//   3-1 días → naranja (warn: "tomá acción esta semana")
//   0       → rojo    (último día — no se puede ocultar)
//
// Render rules (return null silencioso):
//   - loading                → null (no flash)
//   - plan === 'active'      → null (ya pagó)
//   - plan === 'expired'     → null (TrialBlocked overlay se encarga)
//   - diasRestantes === null → null
//   - diasRestantes > 7      → null (todavía no entra en zona caliente)
//
// El botón X persiste el mute por DÍA via useDismissibleToday (ver
// lib/dismissible.ts). Mañana el banner reaparece automáticamente
// sin cron ni TTL — el comparador es la fecha local del usuario.
//
// En día 0 el botón X NO se renderiza — es el último día y no
// queremos que se pueda silenciar. El mute existente de días
// anteriores se ignora en este nivel (forceShow).
//
// El CTA abre WhatsApp con un mensaje que incluye el nombre del
// comercio + días restantes. Si NEXT_PUBLIC_SOPORTE_WHATSAPP no está
// configurada, el CTA degrada a un span (no botón muerto).

type Nivel = 'info' | 'warn' | 'urgent'

interface NivelStyle {
  bg: string
  border: string
  fg: string
  /** Texto del CTA según urgencia. */
  ctaLabel: string
}

const NIVELES: Record<Nivel, NivelStyle> = {
  info: {
    bg: 'rgba(255,184,0,0.08)',
    border: 'rgba(255,184,0,0.30)',
    fg: 'var(--w)',
    ctaLabel: 'Activar plan',
  },
  warn: {
    bg: 'rgba(255,107,53,0.10)',
    border: 'rgba(255,107,53,0.32)',
    fg: 'var(--o)',
    ctaLabel: 'Activar plan',
  },
  urgent: {
    bg: 'rgba(255,71,87,0.10)',
    border: 'rgba(255,71,87,0.36)',
    fg: 'var(--r)',
    ctaLabel: 'Activar ahora',
  },
}

function nivelPorDias(dias: number): Nivel {
  if (dias <= 0) return 'urgent'
  if (dias <= 3) return 'warn'
  return 'info'
}

function mensajePorDias(dias: number): string {
  if (dias <= 0) return 'Hoy es el último día de tu prueba.'
  if (dias === 1) return 'Te queda 1 día de prueba.'
  return `Te quedan ${dias} días de prueba.`
}

function buildWhatsAppHref(numero: string | undefined, comercioNombre: string, dias: number): string | null {
  if (!numero) return null
  const tiempo = dias <= 0
    ? 'mi prueba termina hoy'
    : dias === 1
      ? 'me queda 1 día de prueba'
      : `me quedan ${dias} días de prueba`
  const msg = `Hola! Soy de ${comercioNombre || 'un comercio'}. En Sylvora ${tiempo} y quiero activar mi plan.`
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`
}

export function TrialBanner() {
  const { comercio, estado, diasRestantes, loading } = useTrial()
  const { dismissed, dismiss } = useDismissibleToday(DISMISS_KEY)

  // Returns silenciosos — el componente nunca "ocupa espacio" si no
  // debe mostrarse. Es importante para no shiftear el layout durante
  // la carga inicial.
  if (loading) return null
  if (estado !== 'trial') return null // 'active' o 'expired' → no banner
  if (diasRestantes == null || diasRestantes > 7) return null

  const nivel = nivelPorDias(diasRestantes)
  const style = NIVELES[nivel]
  const esUrgente = nivel === 'urgent'

  // Día 0 es no-silenciable: ignoramos cualquier mute previo.
  // El resto de los niveles respetan el "ocultar hoy".
  if (!esUrgente && dismissed) return null

  const numero = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP
  const waHref = buildWhatsAppHref(numero, comercio?.nombre ?? '', diasRestantes)

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        // sticky con top:0 — el layout que lo monte decide la altura
        // del header de arriba. Para el commit 1 no se monta todavía.
        position: 'sticky',
        top: 0,
        zIndex: 30,
        width: '100%',
        background: style.bg,
        borderBottom: `1px solid ${style.border}`,
        // backdropFilter ayuda en mobile cuando se scrollea contenido
        // debajo del banner (Safari iOS especialmente).
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
        {/* Icono — pequeño, mismo color que el nivel */}
        <Clock
          size={14}
          strokeWidth={2.2}
          color={style.fg}
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        />

        {/* Mensaje principal */}
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ color: style.fg, fontWeight: 600 }}>
            {mensajePorDias(diasRestantes)}
          </strong>
          <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
            {esUrgente
              ? 'Activá tu plan para no perder acceso al POS y a exportar.'
              : 'Activá tu plan para seguir usando Sylvora sin cortes.'}
          </span>
        </span>

        {/* CTA WhatsApp (o span sin link si falta env) */}
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              minHeight: 28,
              background: style.fg,
              color: '#fff',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <MessageCircle size={12} strokeWidth={2.4} />
            {style.ctaLabel}
          </a>
        ) : null}

        {/* X para ocultar hoy — no se muestra en nivel urgent (día 0). */}
        {!esUrgente && (
          <button
            onClick={dismiss}
            aria-label="Ocultar este aviso hoy"
            type="button"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              color: 'var(--text2)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              padding: 0,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
