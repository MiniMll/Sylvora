'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard, ShoppingCart, History, Package, ArchiveX,
  PlusCircle, Wallet, BarChart2, Download,
  TrendingUp, Settings, Users, BookOpen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { invalidarCacheComercio } from '@/lib/supabase/_base'
import { useAuthListener } from '@/lib/hooks/useAuthListener'
import { usePermissions } from '@/components/PermissionsProvider'
import { labelRol } from '@/lib/permissions'
import { SidebarInner, type NavItem } from './SidebarInner'

const nav: NavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',          icon: LayoutDashboard, section: 'Principal' },
  { href: '/pos',             label: 'Punto de Venta',     icon: ShoppingCart,    section: 'Ventas' },
  { href: '/ventas',          label: 'Historial',          icon: History,         section: 'Ventas' },
  { href: '/productos',       label: 'Productos',          icon: Package,         section: 'Inventario' },
  { href: '/stock',           label: 'Control de Stock',   icon: ArchiveX,        section: 'Inventario' },
  { href: '/productos/nuevo', label: 'Nuevo Producto',     icon: PlusCircle,      section: 'Inventario', requierePermiso: 'producto.crear' },
  { href: '/precios',         label: 'Actualizar Precios', icon: TrendingUp,      section: 'Inventario', requierePermiso: 'precio.actualizar_masivo' },
  { href: '/caja',            label: 'Caja Diaria',        icon: Wallet,          section: 'Finanzas' },
  { href: '/reportes',        label: 'Reportes',           icon: BarChart2,       section: 'Finanzas',   requierePermiso: 'reporte.ver_completo' },
  { href: '/exportar',        label: 'Exportar',           icon: Download,        section: 'Finanzas' },
  { href: '/usuarios',        label: 'Usuarios',           icon: Users,           section: 'Cuenta',     requierePermiso: 'usuario.gestionar' },
  { href: '/configuracion',   label: 'Configuración',      icon: Settings,        section: 'Cuenta' },
  { href: '/guia',            label: 'Guía rápida',        icon: BookOpen,        section: 'Cuenta' },
]

const sections = ['Principal', 'Ventas', 'Inventario', 'Finanzas', 'Cuenta']

export function Sidebar() {
  useAuthListener()
  const pathname = usePathname()
  const router = useRouter()
  const { has, rol } = usePermissions()
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

  const toggleTheme = useCallback(() => {
    setDark(prev => {
      const next = !prev
      if (next) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark') }
      else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light') }
      return next
    })
  }, [])

  const cerrarSesion = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    invalidarCacheComercio()
    router.push('/login')
  }, [router])

  const cerrarMobile = useCallback(() => setOpen(false), [])

  // Filtrar nav según permisos del rol actual. Items sin requierePermiso
  // visibles para todos. La gating real vive en page-level guards + RLS.
  const navFiltrado = nav.filter(item => !item.requierePermiso || has(item.requierePermiso))

  const innerProps = {
    pathname, sections, nav: navFiltrado,
    dark, onToggleTheme: toggleTheme,
    nombreUsuario, iniciales,
    rolLabel: rol ? labelRol(rol) : '',
    onCerrarSesion: cerrarSesion,
  }

  return (
    <>
      <div className="desktop-sidebar"><SidebarInner {...innerProps} /></div>
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
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={cerrarMobile} />
          <div style={{ position: 'relative', zIndex: 1, animation: 'slideUp 0.2s ease' }}>
            <SidebarInner {...innerProps} onNavigate={cerrarMobile} />
          </div>
        </div>
      )}
    </>
  )
}
