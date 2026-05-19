'use client'
import Link from 'next/link'
import { Users, ArrowRight } from 'lucide-react'
import { SectionHeader } from './TabComercio'

// Tab "Equipo" — entrypoint a /usuarios.
//
// Decisión explícita: NO embedebar la lista de usuarios acá.
// /usuarios ya tiene su flow de invitaciones, edit de rol, etc.
// Duplicar la lógica sería deuda. Cuando tenga sentido funcional
// (ej. agregar widgets de actividad reciente), ahí evaluamos.

export function TabEquipo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader Icon={Users} title="Equipo"
        subtitle="Usuarios con acceso al comercio y sus roles" />

      <Link
        href="/usuarios"
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '18px 20px',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'transform 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out), border-color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--ac)'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(91,76,255,0.08)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <div style={{
          width: 44, height: 44,
          borderRadius: 12,
          background: 'var(--ac-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Users size={20} color="var(--ac)" strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text)',
            letterSpacing: '-0.01em',
          }}>
            Gestionar equipo
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
            Invitá empleados, asigná roles, revocá accesos.
          </div>
        </div>
        <ArrowRight size={16} color="var(--text2)" strokeWidth={2.2} style={{ flexShrink: 0 }} />
      </Link>
    </div>
  )
}
