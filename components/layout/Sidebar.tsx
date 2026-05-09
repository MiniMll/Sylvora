'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { getStockCritico } from '@/lib/supabase/productos'
import {
  LayoutDashboard, ShoppingCart, History, Package, ArchiveX,
  PlusCircle, Wallet, BarChart2, Download, Bell, Sun, Moon,
  LogOut, AlertTriangle, ChevronRight, TrendingUp, Settings
} from 'lucide-react'

const nav = [
  { href: '/dashboard',       label: 'Dashboard',          icon: LayoutDashboard, section: 'Principal' },
  { href: '/pos',             label: 'Punto de Venta',     icon: ShoppingCart,    section: 'Ventas' },
  { href: '/ventas',          label: 'Historial',          icon: History,         section: 'Ventas' },
  { href: '/productos',       label: 'Productos',          icon: Package,         section: 'Inventario' },
  { href: '/stock',           label: 'Control de Stock',   icon: ArchiveX,        section: 'Inventario' },
  { href: '/productos/nuevo', label: 'Nuevo Producto',     icon: PlusCircle,      section: 'Inventario' },
  { href: '/precios',         label: 'Actualizar Precios', icon: TrendingUp,      section: 'Inventario' },
  { href: '/caja',            label: 'Caja Diaria',        icon: Wallet,          section: 'Finanzas' },
  { href: '/reportes',        label: 'Reportes',           icon: BarChart2,       section: 'Finanzas' },
  { href: '/exportar',        label: 'Exportar',           icon: Download,        section: 'Finanzas' },
  { href: '/perfil',          label: 'Configuración',      icon: Settings,        section: 'Cuenta' },
]

const sections = ['Principal', 'Ventas', 'Inventario', 'Finanzas', 'Cuenta']

function Notificaciones() {
  const [criticos, setCriticos] = useState<any[]>([])
  const [visible, setVisible] = useState(false)
  const [visto, setVisto] = useState(false)
  const router = useRouter()

  useEffect(() => {
    getStockCritico().then(productos => {
      setCriticos(productos.filter((p: any) => p.stock_actual <= p.stock_minimo * 0.3))
    })
  }, [])

  if (criticos.length === 0) return null

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => { setVisible(!visible); setVisto(true) }}
        style={{
          position: 'relative',
          background: visto ? 'rgba(255,71,87,0.1)' : 'rgba(255,71,87,0.18)',
          border: '1px solid rgba(255,71,87,0.25)',
          borderRadius: 8,
          width: 30,
          height: 30,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
        <Bell size={13} color="#ff4757" />
        {!visto && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 14, height: 14,
            background: '#ff4757',
            borderRadius: '50%',
            fontSize: 8, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700,
            border: '2px solid #13131a',
          }}>
            {criticos.length}
          </span>
        )}
      </button>

      {visible && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setVisible(false)} />
          <div style={{
            position: 'fixed', top: 58, left: 220,
            width: 292,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 99,
            overflow: 'hidden',
            animation: 'slideUp 0.2s ease',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,184,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={13} color="#ffb800" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Stock crítico</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{criticos.length} producto{criticos.length > 1 ? 's' : ''} para reponer</div>
              </div>
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {criticos.map((p: any) => (
                <div key={p.id} style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff4757', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)' }}>Stock: {p.stock_actual} · Mín: {p.stock_minimo}</div>
                  </div>
                  <span style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757', padding: '2px 7px', borderRadius: 5, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>Crítico</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 16px' }}>
              <button onClick={() => { setVisible(false); router.push('/stock') }}
                style={{ width: '100%', padding: '8px', borderRadius: 9, background: '#ff4757', color: 'white', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                Ver control de stock <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [dark, setDark] = useState(false)
  const [open, setOpen] = useState(false)
  const [nombreUsuario, setNombreUsuario] = useState('Usuario')
  const [iniciales, setIniciales] = useState('U')

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') { setDark(true); document.documentElement.classList.add('dark') }
  }, [])

  useEffect(() => {
    const cargarUsuario = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre')
        .eq('id', user.id)
        .single()
      if (perfil?.nombre) {
        setNombreUsuario(perfil.nombre)
        setIniciales(perfil.nombre.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))
      }
    }
    cargarUsuario()
  }, [])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    if (next) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark') }
    else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light') }
  }

  const cerrarSesion = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const Inner = () => (
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
            {/* Wordmark */}
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
            <button onClick={toggleTheme}
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
                  onClick={() => setOpen(false)}
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
          onClick={cerrarSesion}
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

  return (
    <>
      <div className="desktop-sidebar"><Inner /></div>
      <button
        onClick={() => setOpen(true)}
        className="mobile-menu-btn"
        style={{
          position: 'fixed', top: 14, left: 14, zIndex: 200,
          width: 38, height: 38,
          borderRadius: 10,
          background: '#111118',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'white', cursor: 'pointer',
          display: 'none', alignItems: 'center', justifyContent: 'center',
        }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setOpen(false)} />
          <div style={{ position: 'relative', zIndex: 1, animation: 'slideUp 0.2s ease' }}><Inner /></div>
        </div>
      )}
    </>
  )
}
