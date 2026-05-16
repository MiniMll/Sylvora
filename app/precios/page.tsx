'use client'
import { useEffect, useState, useMemo } from 'react'
import { getProductos, actualizarProducto } from '@/lib/supabase/productos'
import { toast } from 'sonner'
import { TrendingUp, ChevronDown, AlertTriangle, X } from 'lucide-react'
import { formatPeso } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePermissions } from '@/components/PermissionsProvider'
import type { Producto } from '@/types/database'

// Página de actualización de precios.
// UX primaria: editar el precio final directo por producto (input inline).
// UX secundaria: batch %/$ colapsado, que precarga los inputs inline
// para que el usuario pueda ajustar excepciones antes de confirmar.
// Save: sticky bar inferior con "Aplicar N cambios" — una sola ruta
// de persistencia para todo, sea edición manual o batch.

export default function PreciosPage() {
  const { has, loading: permsLoading } = usePermissions()
  const [productos, setProductos] = useState<Producto[]>([])
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)

  // Batch state
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchTipo, setBatchTipo] = useState<'porcentaje' | 'fijo'>('porcentaje')
  const [batchValor, setBatchValor] = useState('')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())

  useEffect(() => {
    getProductos().then(data => { setProductos(data as Producto[]); setCargando(false) })
  }, [])

  const precioActualOf = (p: Producto) =>
    p.unidad_venta === 'kg' ? (p.precio_por_kg || 0) : p.precio_venta

  const dirtyIds = useMemo(() => {
    return productos
      .filter(p => overrides[p.id] !== undefined && overrides[p.id] !== precioActualOf(p))
      .map(p => p.id)
  }, [productos, overrides])

  const setOverride = (id: string, valor: string) => {
    setOverrides(prev => {
      const next = { ...prev }
      const n = Number(valor)
      if (valor === '' || Number.isNaN(n)) delete next[id]
      else next[id] = n
      return next
    })
  }

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

  const previsualizarBatch = () => {
    const n = Number(batchValor)
    if (!batchValor || Number.isNaN(n) || seleccionados.size === 0) {
      toast.error('Seleccioná productos y un valor')
      return
    }
    const next: Record<string, number> = { ...overrides }
    for (const p of productos) {
      if (!seleccionados.has(p.id)) continue
      const actual = precioActualOf(p)
      const nuevo = batchTipo === 'porcentaje'
        ? Math.round(actual * (1 + n / 100))
        : Math.round(actual + n)
      next[p.id] = nuevo
    }
    setOverrides(next)
    toast.success(`${seleccionados.size} productos precargados — revisá y aplicá`)
  }

  const descartarCambios = () => {
    setOverrides({})
    setSeleccionados(new Set())
    setBatchValor('')
  }

  const aplicarCambios = async () => {
    if (dirtyIds.length === 0) return
    setActualizando(true)
    let ok = 0
    for (const id of dirtyIds) {
      const p = productos.find(x => x.id === id)
      if (!p) continue
      const nuevo = overrides[id]
      const cambios: Partial<Producto> = p.unidad_venta === 'kg'
        ? { precio_por_kg: nuevo }
        : { precio_venta: nuevo }
      try {
        await actualizarProducto(id, cambios)
        ok++
      } catch {
        // ignore per-row error, count via ok
      }
    }
    setProductos(await getProductos() as Producto[])
    setOverrides({})
    setSeleccionados(new Set())
    setActualizando(false)
    toast.success(`${ok} precios actualizados`)
  }

  if (cargando || permsLoading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      Cargando...
    </div>
  )

  // Gating de página completa: empleado no accede a precios.
  // El middleware (P2.2) lo va a interceptar antes; mientras tanto este
  // guard cliente + la RLS en producto.update son suficientes.
  if (!has('precio.actualizar_masivo')) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,184,0,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <AlertTriangle size={22} color="var(--w)" strokeWidth={1.8} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 6, color: 'var(--text)' }}>Acceso restringido</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
          Solo administradores pueden actualizar precios. Si necesitás
          hacer cambios, pedile al dueño del comercio.
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto', paddingBottom: dirtyIds.length > 0 ? 120 : 24 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Actualización de Precios</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>Editá el precio de venta directamente en cada fila. Para subir todo un porcentaje, usá el aumento masivo.</p>
      </div>

      {/* Batch colapsable — secundario */}
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 16, overflow: 'hidden' }}>
        <button
          onClick={() => setBatchOpen(o => !o)}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: 'var(--text2)',
            fontSize: 12,
            fontWeight: 500,
          }}
          aria-expanded={batchOpen}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={13} />
            Aumento masivo a varios productos
          </span>
          <ChevronDown size={14} style={{ transform: batchOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {batchOpen && (
          <div style={{ padding: '4px 14px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, marginTop: 12, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {(['porcentaje', 'fijo'] as const).map(t => (
                  <button key={t} onClick={() => setBatchTipo(t)}
                    style={{ padding: '0 12px', border: 'none', background: batchTipo === t ? 'var(--ac)' : 'var(--bg2)', color: batchTipo === t ? 'white' : 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t === 'porcentaje' ? '%' : '$'}
                  </button>
                ))}
              </div>
              <Input
                size="md"
                type="number"
                value={batchValor}
                onChange={e => setBatchValor(e.target.value)}
                placeholder={batchTipo === 'porcentaje' ? 'Ej: 15' : 'Ej: 500'}
                style={{ padding: '8px 10px' }}
              />
              <Button variant="primary" size="sm" onClick={previsualizarBatch}>
                Precargar
              </Button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
              {seleccionados.size === 0
                ? 'Marcá productos en la tabla con el checkbox para aplicar.'
                : <><b style={{ color: 'var(--ac)' }}>{seleccionados.size}</b> productos seleccionados — el valor se va a precargar en los inputs para que puedas ajustar excepciones antes de confirmar.</>}
            </div>
          </div>
        )}
      </div>

      {/* Tabla principal */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox"
              checked={seleccionados.size === productos.length && productos.length > 0}
              onChange={seleccionarTodos}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
              aria-label="Seleccionar todos" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {seleccionados.size === 0 ? 'Productos' : `${seleccionados.size} seleccionados`}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{productos.length} productos · {dirtyIds.length > 0 && <b style={{ color: 'var(--ac)' }}>{dirtyIds.length} con cambios</b>}</span>
        </div>
        <div className="table-scroll">
        <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg3)' }}>
              {['', 'Producto', 'Costo', 'Precio actual', 'Margen', 'Nuevo precio'].map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productos.map(p => {
              const sel = seleccionados.has(p.id)
              const actual = precioActualOf(p)
              const override = overrides[p.id]
              const dirty = override !== undefined && override !== actual
              const delta = override !== undefined ? override - actual : 0
              const deltaPct = actual > 0 ? Math.round((delta / actual) * 1000) / 10 : 0
              const mg = p.precio_venta > 0 ? Math.round((1 - p.precio_costo / p.precio_venta) * 100) : 0
              const bajoCosto = override !== undefined && override < p.precio_costo

              return (
                <tr key={p.id} style={{
                  borderTop: '1px solid var(--border)',
                  background: dirty ? 'rgba(91,76,255,0.04)' : 'transparent',
                  boxShadow: dirty ? 'inset 3px 0 0 var(--ac)' : 'none',
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}>
                  <td style={{ padding: '9px 12px', width: 36 }}>
                    <input type="checkbox" checked={sel} onChange={() => toggleSeleccion(p.id)}
                      style={{ width: 14, height: 14, cursor: 'pointer' }}
                      aria-label={`Seleccionar ${p.nombre}`} />
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text)' }}>
                    <div>{p.nombre}</div>
                    {p.sku && <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>{p.sku}</div>}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>{formatPeso(p.precio_costo)}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--text)', fontWeight: 500 }}>
                    {p.unidad_venta === 'kg' ? `${formatPeso(actual)}/kg` : formatPeso(actual)}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: mg >= 35 ? 'rgba(0,200,150,0.1)' : 'rgba(255,184,0,0.1)', color: mg >= 35 ? 'var(--g)' : 'var(--w)', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>
                      {mg}%
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 }}>
                      <input
                        type="number"
                        value={override !== undefined ? override : ''}
                        onChange={e => setOverride(p.id, e.target.value)}
                        placeholder={String(actual)}
                        style={{
                          width: '100%',
                          border: `1px solid ${dirty ? 'var(--ac)' : 'var(--border)'}`,
                          borderRadius: 6,
                          padding: '6px 8px',
                          fontSize: 13,
                          fontFamily: 'DM Mono, monospace',
                          fontWeight: 600,
                          color: dirty ? 'var(--ac)' : 'var(--text)',
                          background: 'var(--bg2)',
                          outline: 'none',
                        }}
                      />
                      {dirty && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                          <span>{delta >= 0 ? '+' : ''}{formatPeso(delta).replace('$', '$')} · {delta >= 0 ? '+' : ''}{deltaPct}%</span>
                          {bajoCosto && (
                            <span title="Precio bajo el costo" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--w)' }}>
                              <AlertTriangle size={10} /> bajo costo
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Sticky bar inferior — Aplicar / Descartar */}
      {dirtyIds.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-lg)',
          padding: '10px 12px 10px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          zIndex: 50,
          animation: 'slideUp 0.2s ease',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            <b style={{ color: 'var(--ac)' }}>{dirtyIds.length}</b> {dirtyIds.length === 1 ? 'cambio pendiente' : 'cambios pendientes'}
          </span>
          <Button variant="subtle" size="sm" icon={<X size={12} />} onClick={descartarCambios} disabled={actualizando} style={{ whiteSpace: 'nowrap' }}>
            Descartar
          </Button>
          <Button variant="primary" size="sm" onClick={aplicarCambios} loading={actualizando} style={{ whiteSpace: 'nowrap' }}>
            {actualizando ? 'Aplicando...' : `Aplicar ${dirtyIds.length}`}
          </Button>
        </div>
      )}
    </div>
  )
}
