'use client'
import Link from 'next/link'
import { Clock, MessageCircle, HelpCircle } from 'lucide-react'
import type { Comercio } from '@/types/database'

// Overlay (full-page card, NO modal) que reemplaza el contenido de
// una pantalla bloqueada cuando el comercio tiene el trial vencido.
// Consistente con el lenguaje visual del producto:
//   badge ícono accent + título + descripción + CTA primario + link
//   sutil a guía. Mismo idioma que EmptyState pero como pantalla
//   entera, no card embebida.
//
// Por qué NO modal: un modal encima del POS sería hostil (el cajero
// no puede salir, queda atrapado). Reemplazar el contenido es más
// honesto: "esta pantalla específica está bloqueada hasta que
// actives el plan". El resto de la app (dashboard, productos, etc.)
// sigue accesible.
//
// El CTA primario abre WhatsApp con un mensaje pre-poblado que
// incluye el nombre del comercio. El número sale de la env var
// NEXT_PUBLIC_SOPORTE_WHATSAPP (formato 54911XXXXXXXX, sin "+").
// Si la env no está seteada, el botón degrada a un link genérico
// a /guia para no quedar muerto.

interface TrialBlockedProps {
  /** Comercio actual para personalizar el mensaje de WhatsApp. */
  comercio: Comercio | null
  /** Override del título (ej. para reusar el componente en otros
   *  contextos futuros). Default: copy estándar de trial vencido. */
  title?: string
  description?: string
}

function buildWhatsAppHref(numero: string | undefined, comercioNombre: string): string | null {
  if (!numero) return null
  const msg = `Hola! Soy de ${comercioNombre || 'un comercio'}. Mi prueba de Sylvora terminó y quiero activar mi plan.`
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`
}

export function TrialBlocked({
  comercio,
  title = 'Tu período de prueba terminó.',
  description = 'Activá tu plan para seguir cobrando y exportando. Tus datos siguen acá — no se borran.',
}: TrialBlockedProps) {
  const numero = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP
  const waHref = buildWhatsAppHref(numero, comercio?.nombre ?? '')

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg)',
        minHeight: '100%',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px 28px',
          boxShadow: 'var(--shadow-sm)',
          textAlign: 'center',
          animation: 'fadeIn 0.25s var(--ease-out)',
        }}
      >
        {/* Badge accent (consistente con EmptyState accent) */}
        <div
          style={{
            width: 56, height: 56,
            borderRadius: '50%',
            background: 'var(--ac-light)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <Clock size={24} color="var(--ac)" strokeWidth={2} />
        </div>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text)',
            margin: 0,
            letterSpacing: '-0.015em',
            lineHeight: 1.25,
          }}
        >
          {title}
        </h2>

        <p
          style={{
            fontSize: 14,
            color: 'var(--text2)',
            margin: '10px 0 0',
            lineHeight: 1.55,
            maxWidth: 360,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {description}
        </p>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 22px',
                minHeight: 44, // tap target mobile
                background: 'var(--ac)',
                color: '#fff',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(91,76,255,0.20)',
              }}
            >
              <MessageCircle size={16} strokeWidth={2.2} />
              Hablar por WhatsApp
            </a>
          ) : (
            // Fallback si NEXT_PUBLIC_SOPORTE_WHATSAPP no está seteada
            // — no queremos un botón muerto en producción. Apunta a la
            // guía como mejor-que-nada hasta que se configure la env.
            <Link
              href="/guia"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 22px',
                minHeight: 44,
                background: 'var(--ac)',
                color: '#fff',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <MessageCircle size={16} strokeWidth={2.2} />
              Cómo activar mi plan
            </Link>
          )}

          <Link
            href="/guia"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              color: 'var(--text2)',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            <HelpCircle size={13} strokeWidth={2} />
            Ver la guía rápida
          </Link>
        </div>
      </div>
    </div>
  )
}
