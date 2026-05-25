import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TrialBanner } from '@/components/ui/TrialBanner'

// Shell único para las pantallas autenticadas. Antes había 9 layouts
// copia-pegada con el mismo div+sidebar+main; este componente
// extrae el patrón para que TrialBanner (y cualquier futuro slot
// global tipo "modo offline" o "nueva versión disponible") se monte
// en UN SOLO lugar.
//
// Estructura visual:
//   ┌──────────┬───────────────────────────────────┐
//   │          │  <TrialBanner />  ← si aplica    │
//   │ Sidebar  ├───────────────────────────────────┤
//   │          │  {children}        ← scrollable  │
//   └──────────┴───────────────────────────────────┘
//
// El banner vive DENTRO del <main> (a la derecha del sidebar) y
// ARRIBA de children. Por qué ahí:
//   - Si lo pongo fuera del main, ocupa el ancho del sidebar también
//     y queda raro al lado del logo.
//   - Adentro del main pero fuera del contenedor scrolleable de la
//     página → se mantiene fijo arriba mientras el contenido
//     scrollea por debajo. Mejor que sticky para este layout porque
//     el scroll vive en {children}, no en main.
//
// NO se usa en rutas públicas (/, /login, /registro, /precios,
// /guia, /terminos, /privacidad). Esas no importan AppShell, y por
// lo tanto nunca renderizan TrialBanner — un visitante anónimo no
// debería ver un aviso sobre su trial.

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          background: 'var(--bg)',
        }}
      >
        <TrialBanner />
        {children}
      </main>
    </div>
  )
}
