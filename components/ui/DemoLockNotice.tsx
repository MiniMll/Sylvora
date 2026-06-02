'use client'
import { Lock } from 'lucide-react'

// Aviso inline reusable que se muestra dentro de una pantalla
// cuando una acción está bloqueada por estar en modo demo. Pensado
// para REEMPLAZAR el botón de guardar/enviar (no aparecer al lado),
// para que sea obvio que la sección está en modo lectura.
//
// Usa el mismo lenguaje visual del DemoBanner (var(--ac-light) +
// var(--ac)) — coherencia: "modo demo" tiene un color identitario
// en toda la UI.
//
// Anti-patrón intencional: NO mostramos esto cuando el bloqueo es
// trivial (ej. un campo que ya está disabled por otra razón). Solo
// donde el visitante esperaría poder accionar algo y necesita
// entender por qué no puede.

interface DemoLockNoticeProps {
  /** Texto principal. Default es genérico; pasá uno específico al
   *  contexto donde se usa (ej. "Cambiar la contraseña no está
   *  disponible en la demo"). */
  texto?: string
  /** Texto opcional debajo, en menor jerarquía. Útil para invitar
   *  a registrarse sin repetir el CTA visualmente pesado del
   *  DemoBanner. */
  detalle?: string
}

export function DemoLockNotice({
  texto = 'Esto está deshabilitado en la demo.',
  detalle,
}: DemoLockNoticeProps) {
  return (
    <div
      role="note"
      style={{
        background: 'var(--ac-light)',
        border: '1px solid rgba(91,76,255,0.20)',
        borderRadius: 10,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        lineHeight: 1.5,
      }}
    >
      <Lock
        size={13}
        color="var(--ac)"
        strokeWidth={2.2}
        style={{ flexShrink: 0, marginTop: 2 }}
        aria-hidden="true"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>
          {texto}
        </div>
        {detalle && (
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3 }}>
            {detalle}
          </div>
        )}
      </div>
    </div>
  )
}
