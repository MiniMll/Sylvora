'use client'
import { useEffect, useState } from 'react'
import { getProductos, actualizarProducto } from '@/lib/supabase/productos'
import { toast } from 'sonner'
import { TrendingUp, Check, Package } from 'lucide-react'

export default function PreciosPage() {
  const [productos, setProductos] = useState<any[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [aumento, setAumento] = useState('')
  const [tipo, setTipo] = useState<'porcentaje' | 'fijo'>('porcentaje')
  const [aplicaA, setAplicaA] = useState<'venta' | 'costo' | 'ambos'>('venta')
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)

  useEffect(() => {
    getProductos().then(data => { setProductos(data); setCargando(false) })
  }, [])

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const seleccionarTodos = () => {
    if (seleccionados.size === productos.length) setSeleccionados(new Set())
    else setSeleccionados(new Set(productos.map(p => p.id)))
  }

  const calcularNuevoPrecio = (precio: number) => {
    if (!aumento) return precio
    if (tipo === 'porcentaje') return Math.round(precio * (1 + Number(aumento) / 100))
    return Math.round(precio + Number(aumento))
  }

  const aplicarAumento = async () => {
    if (!aumento || seleccionados.size === 0) {
      toast.error('Seleccioná productos y un valor de aumento')
      return
    }
    setActualizando(true)
    let ok = 0
    for (const id of seleccionados) {
      const p = productos.find(x => x.id === id)
      if (!p) continue
      const cambios: any = {}
      if (aplicaA === 'venta' || aplicaA === 'ambos') {
        if (p.unidad_venta === 'kg') cambios.precio_por_kg = calcularNuevoPrecio(p.precio_por_kg || 0)
        else cambios.precio_venta = calcularNuevoPrecio(p.precio_venta)
      }
      if (aplicaA === 'costo' || aplicaA === 'ambos') {
        cambios.precio_costo = calcularNuevoPrecio(p.precio_costo)
      }
      await actualizarProducto(id, cambios)
      ok++
    }
    setProductos(await getProductos())
    toast.success(`${ok} productos actualizados`)
    setActualizando(false)
    setSeleccionados(new Set())
    setAumento('')
  }

  const formatPeso = (n: number) => '$' + n.toLocaleString('es-AR')

  if (cargando) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Actualización de Precios</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>Actualizá precios de varios productos a la vez</p>
      </div>

      {/* Panel de aumento */}
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: 20, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          <TrendingUp size={16} color="#5b4cff" /> Configurar aumento
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Tipo de aumento</label>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {(['porcentaje', 'fijo'] as const).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  style={{ flex: 1, padding: '8px', border: 'none', background: tipo === t ? '#5b4cff' : 'var(--bg2)', color: tipo === t ? 'white' : 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t === 'porcentaje' ? '% Porcentaje' : '$ Fijo'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
              {tipo === 'porcentaje' ? 'Porcentaje de aumento' : 'Monto fijo a agregar'}
            </label>
            <input
              type="number"
              value={aumento}
              onChange={e => setAumento(e.target.value)}
              placeholder={tipo === 'porcentaje' ? 'Ej: 15' : 'Ej: 500'}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Aplicar a</label>
            <select value={aplicaA} onChange={e => setAplicaA(e.target.value as any)}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)' }}>
              <option value="venta">Precio de venta</option>
              <option value="costo">Precio de costo</option>
              <option value="ambos">Ambos precios</option>
            </select>
          </div>
        </div>

        {seleccionados.size > 0 && aumento && (
          <div style={{ marginTop: 14, background: 'rgba(91,76,255,0.06)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              <b style={{ color: '#5b4cff' }}>{seleccionados.size}</b> productos seleccionados
              {tipo === 'porcentaje' ? ` · +${aumento}%` : ` · +$${Number(aumento).toLocaleString('es-AR')}`}
            </div>
            <button onClick={aplicarAumento} disabled={actualizando}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <TrendingUp size={13} />
              {actualizando ? 'Actualizando...' : 'Aplicar aumento'}
            </button>
          </div>
        )}
      </div>

      {/* Tabla productos */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox"
              checked={seleccionados.size === productos.length && productos.length > 0}
              onChange={seleccionarTodos}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {seleccionados.size === 0 ? 'Seleccionar todos' : `${seleccionados.size} seleccionados`}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{productos.length} productos</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg3)' }}>
              {['', 'Producto', 'Precio costo', 'Precio venta', 'Margen', 'Nuevo precio venta'].map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productos.map((p: any) => {
              const sel = seleccionados.has(p.id)
              const precioActual = p.unidad_venta === 'kg' ? (p.precio_por_kg || 0) : p.precio_venta
              const precioNuevo = aumento ? calcularNuevoPrecio(precioActual) : null
              const mg = p.precio_venta > 0 ? Math.round((1 - p.precio_costo / p.precio_venta) * 100) : 0
              return (
                <tr key={p.id} onClick={() => toggleSeleccion(p.id)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: sel ? 'rgba(91,76,255,0.05)' : 'transparent' }}
                  onMouseEnter={e => !sel && (e.currentTarget.style.background = 'var(--bg3)')}
                  onMouseLeave={e => !sel && (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? '#5b4cff' : 'var(--border)'}`, background: sel ? '#5b4cff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sel && <Check size={10} color="white" />}
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text)' }}>
                    <div>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)' }}>{p.sku}</div>
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: 'var(--text)' }}>{formatPeso(p.precio_costo)}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#5b4cff', fontWeight: 600 }}>
                    {p.unidad_venta === 'kg' ? `${formatPeso(precioActual)}/kg` : formatPeso(precioActual)}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: mg >= 35 ? 'rgba(0,200,150,0.1)' : 'rgba(255,184,0,0.1)', color: mg >= 35 ? '#00c896' : '#ffb800', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>
                      {mg}%
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 600 }}>
                    {precioNuevo && sel ? (
                      <span style={{ color: '#00c896' }}>
                        {formatPeso(precioNuevo)}
                        <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 4 }}>
                          +{formatPeso(precioNuevo - precioActual)}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text2)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}