'use client'
import { memo } from 'react'
import Link from 'next/link'
import { Sun, Moon, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Notificaciones } from './Notificaciones'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  section: string
}

interface Props {
  pathname: string
  sections: string[]
  nav: NavItem[]
  dark: boolean
  onToggleTheme: () => void
  nombreUsuario: string
  iniciales: string
  onCerrarSesion: () => void
  onNavigate?: () => void
}

function SidebarInnerImpl({
  pathname, sections, nav,
  dark, onToggleTheme,
  nombreUsuario, iniciales, onCerrarSesion,
  onNavigate,
}: Props) {
  return (
    <aside style={{
      width: 216,
      height: '100vh',
      background: '#111118',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      borderRight: '1px solid rgba(255,255,255,0.04)',
    }}>

      {/* Logo */}
      <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 30, height: 30,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #5b4cff 0%, #8b7fff 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(91,76,255,0.35)',
            }}>
              <span style={{ color: 'white', fontWeight: 800, fontSize: 13, letterSpacing: '-0.5px' }}>Sy</span>
            </div>
            <div>
              <div style={{ color: 'white', fontSize: 14, fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1 }}>Sylvora</div>
              <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 9, marginTop: 2, letterSpacing: '0.3px' }}>Gestión inteligente</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Notificaciones />
            <button onClick={onToggleTheme}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, width: 30, height: 30,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
              {dark
                ? <Sun size={13} color="rgba(255,255,255,0.6)" />
                : <Moon size={13} color="rgba(255,255,255,0.6)" />
              }
            </button>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {sections.map(section => (
          <div key={section} style={{ marginBottom: 4 }}>
            <div style={{
              padding: '10px 6px 4px',
              fontSize: 9,
              color: 'rgba(255,255,255,0.2)',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              fontWeight: 600,
            }}>
              {section}
            </div>
            {nav.filter(i => i.section === section).map(item => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 9px',
                    borderRadius: 8,
                    marginBottom: 1,
                    color: active ? 'white' : 'rgba(255,255,255,0.48)',
                    background: active ? 'rgba(91,76,255,0.22)' : 'transparent',
                    fontWeight: active ? 500 : 400,
                    fontSize: 12.5,
                    textDecoration: 'none',
                    transition: 'all 0.12s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)' }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.48)' } }}>
                  {active && (
                    <span style={{
                      position: 'absolute', left: -8, top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3, height: 16,
                      background: '#5b4cff',
                      borderRadius: '0 3px 3px 0',
                    }} />
                  )}
                  <Icon size={14} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 10, marginBottom: 4 }}>
          <div style={{
            width: 28, height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#ff6b35,#ffd23f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 10, fontWeight: 700,
            flexShrink: 0,
            boxShadow: '0 1px 4px rgba(255,107,53,0.3)',
          }}>
            {iniciales}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'white', fontSize: 11.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreUsuario}</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 1 }}>Administrador</div>
          </div>
        </div>
        <button
          onClick={onCerrarSesion}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 9px',
            borderRadius: 8,
            background: 'none', border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.3)',
            fontSize: 12, fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget.style.background = 'rgba(255,71,87,0.1)'); (e.currentTarget.style.color = '#ff4757') }}
          onMouseLeave={e => { (e.currentTarget.style.background = 'none'); (e.currentTarget.style.color = 'rgba(255,255,255,0.3)') }}>
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

// Memo: el padre `Sidebar` re-renderiza al togglear el theme y al
// abrir/cerrar el menú mobile. Si los props no cambian, evitamos
// volver a montar el árbol completo del sidebar.
export const SidebarInner = memo(SidebarInnerImpl)
