'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { getStockCritico } from '@/lib/supabase/productos'
import {
  LayoutDashboard, ShoppingCart, History, Package, ArchiveX,
  PlusCircle, Wallet, BarChart2, Download, Bell, Sun, Moon,
  LogOut, AlertTriangle, ChevronRight, Store, TrendingUp, Settings
} from 'lucide-react'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Principal' },
  { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart, section: 'Ventas' },
  { href: '/ventas', label: 'Historial de Ventas', icon: History, section: 'Ventas' },
  { href: '/productos', label: 'Productos', icon: Package, section: 'Inventario' },
  { href: '/stock', label: 'Control de Stock', icon: ArchiveX, section: 'Inventario' },
  { href: '/productos/nuevo', label: 'Nuevo Producto', icon: PlusCircle, section: 'Inventario' },
  { href: '/precios', label: 'Actualizar Precios', icon: TrendingUp, section: 'Inventario' },
  { href: '/caja', label: 'Caja Diaria', icon: Wallet, section: 'Finanzas' },
  { href: '/reportes', label: 'Reportes', icon: BarChart2, section: 'Finanzas' },
  { href: '/exportar', label: 'Exportar PDF / Excel', icon: Download, section: 'Finanzas' },
  { href: '/perfil', label: 'Configuración', icon: Settings, section: 'Cuenta' },
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
      <button onClick={() => { setVisible(!visible); setVisto(true) }}
        style={{ position: 'relative', background: 'rgba(255,71,87,0.15)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Bell size={13} color="#ff4757" />
        {!visto && (
          <span style={{ position: 'absolute', top: -5, right: -5, width: 15, height: 15, background: '#ff4757', borderRadius: '50%', fontSize: 8, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {criticos.length}
          </span>
        )}
      </button>

      {visible && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setVisible(false)} />
          <div style={{ position: 'fixed', top: 60, left: 218, width: 280, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 99, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} color="#ffb800" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Stock crítico</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{criticos.length} producto{criticos.length > 1 ? 's' : ''} para reponer</div>
              </div>
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {criticos.map((p: any) => (
                <div key={p.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: '#ff4757' }}>Stock: {p.stock_actual} / Mín: {p.stock_minimo}</div>
                  </div>
                  <span style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600 }}>Crítico</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 14px' }}>
              <button onClick={() => { setVisible(false); router.push('/stock') }}
                style={{ width: '100%', padding: '8px', borderRadius: 8, background: '#ff4757', color: 'white', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                Ver stock <ChevronRight size={12} />
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
    <aside style={{ width: 210, height: '100vh', background: '#13131a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#5b4cff,#9b8fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Store size={14} color="white" />
          </div>
          <div>
            <div style={{ color: 'white', fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>Sylvora</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace' }}>Gestión inteligente</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Notificaciones />
          <button onClick={toggleTheme}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {dark ? <Sun size={13} color="rgba(255,255,255,0.7)" /> : <Moon size={13} color="rgba(255,255,255,0.7)" />}
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 6, overflowY: 'auto' }}>
        {sections.map(section => (
          <div key={section}>
            <div style={{ padding: '10px 12px 2px', fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1 }}>{section}</div>
            {nav.filter(i => i.section === section).map(item => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', margin: '1px 7px', borderRadius: 7, color: active ? 'white' : 'rgba(255,255,255,0.55)', background: active ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: active ? 500 : 400, fontSize: 12, textDecoration: 'none', position: 'relative', transition: 'all 0.15s' }}>
                  {active && <span style={{ position: 'absolute', left: -7, top: '50%', transform: 'translateY(-50%)', width: 3, height: 14, background: '#5b4cff', borderRadius: '0 3px 3px 0' }} />}
                  <Icon size={14} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, marginBottom: 2 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#ff6b35,#ffd23f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
          {iniciales}
        </div>
        <div>
          <div style={{ color: 'white', fontSize: 11, fontWeight: 500 }}>{nombreUsuario}</div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>Administrador</div>
        </div>
        <button onClick={cerrarSesion}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'inherit', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ff4757')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )

  return (
    <>
      <div className="desktop-sidebar"><Inner /></div>
      <button onClick={() => setOpen(true)} className="mobile-menu-btn"
        style={{ position: 'fixed', top: 12, left: 12, zIndex: 200, width: 36, height: 36, borderRadius: 9, background: '#13131a', border: 'none', color: 'white', cursor: 'pointer', display: 'none', alignItems: 'center', justifyContent: 'center' }}>
        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' strokeWidth='2'><line x1='3' y1='6' x2='21' y2='6'/><line x1='3' y1='12' x2='21' y2='12'/><line x1='3' y1='18' x2='21' y2='18'/></svg>
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setOpen(false)} />
          <div style={{ position: 'relative', zIndex: 1 }}><Inner /></div>
        </div>
      )}
    </>
  )
}