'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { guardarProducto, agregarLote } from '@/lib/supabase/productos'
import { toast } from 'sonner'

interface Lote { id: string; numero: string; cantidad: string; vencimiento: string }

export default function NuevoProductoPage() {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [lotes, setLotes] = useState<Lote[]>([{ id: '1', numero: '', cantidad: '', vencimiento: '' }])
  const [form, setForm] = useState({
    nombre: '', codigo_barras: '', sku: '', categoria: '',
    unidad_venta: 'unidad', precio_costo: '', precio_venta: '',
    precio_mayorista: '', precio_por_kg: '',
    stock_minimo: '10', stock_ideal: '50', ubicacion: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const esKg = form.unidad_venta === 'kg'

  const margenCalc = form.precio_costo && form.precio_venta && !esKg
    ? Math.round((1 - Number(form.precio_costo) / Number(form.precio_venta)) * 100)
    : null

  const stockInicialTotal = lotes.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)

  const agregarLoteLocal = () => setLotes(l => [...l, { id: Date.now().toString(), numero: '', cantidad: '', vencimiento: '' }])
  const quitarLote = (id: string) => setLotes(l => l.filter(x => x.id !== id))
  const updateLote = (id: string, field: keyof Lote, val: string) =>
    setLotes(l => l.map(x => x.id === id ? { ...x, [field]: val } : x))

  const handleImagen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImgPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const guardar = async () => {
    if (!form.nombre) { toast.error('El nombre es obligatorio'); return }
    if (esKg && !form.precio_por_kg) { toast.error('Ingresá el precio por kg'); return }
    if (!esKg && !form.precio_venta) { toast.error('Ingresá el precio de venta'); return }

    const lotesValidos = lotes.filter(l => l.numero && l.cantidad)
    if (lotesValidos.length === 0) { toast.error('Agregá al menos un lote con número y cantidad'); return }

    setGuardando(true)

    const resultado = await guardarProducto({
      nombre: form.nombre,
      codigo_barras: form.codigo_barras || undefined,
      sku: form.sku || undefined,
      precio_costo: Number(form.precio_costo) || 0,
      precio_venta: esKg ? 0 : Number(form.precio_venta),
      precio_mayorista: form.precio_mayorista ? Number(form.precio_mayorista) : undefined,
      precio_por_kg: esKg ? Number(form.precio_por_kg) : undefined,
      stock_actual: 0, 
      stock_minimo: Number(form.stock_minimo) || 10,
      stock_ideal: Number(form.stock_ideal) || 50,
      unidad_venta: form.unidad_venta,
      ubicacion: form.ubicacion || undefined,
    })

    if (!resultado) {
      toast.error('Error al guardar el producto')
      setGuardando(false)
      return
    }
    if ((resultado as any).error === 'sku_duplicado') {
      toast.error('Ya existe un producto con ese SKU')
      setGuardando(false)
      return
    }
    if ((resultado as any).error === 'codigo_duplicado') {
      toast.error('Ya existe un producto con ese código de barras')
      setGuardando(false)
      return
    }

    // Subir imagen
    if (imgFile) {
      const { subirImagen } = await import('@/lib/supabase/productos')
      const url = await subirImagen(imgFile, resultado.id)
      if (url) {
        const { actualizarProducto } = await import('@/lib/supabase/productos')
        await actualizarProducto(resultado.id, { imagen_url: url })
      }
    }

    // Guardar lotes
    for (const lote of lotesValidos) {
      await agregarLote({
        producto_id: resultado.id,
        numero_lote: lote.numero,
        cantidad: Number(lote.cantidad),
        fecha_vencimiento: lote.vencimiento || undefined,
      })
    }

    toast.success('Producto guardado correctamente')
    router.push('/productos')
  }

  const inp: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
    fontSize: 12, outline: 'none', fontFamily: 'inherit',
    background: 'var(--bg2)', color: 'var(--text)', width: '100%'
  }
  const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }
  const sec: React.CSSProperties = { background: 'var(--card)', borderRadius: 14, padding: 20, border: '1px solid var(--border)', marginBottom: 14 }

  return (
    <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Nuevo Producto</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '2px 0 0' }}>Completá los datos del producto</p>
      </div>

      <div style={{ maxWidth: 680 }}>
        {/* Info básica */}
        <div style={sec}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--text)' }}>◈ Información básica</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Nombre del producto *</label>
              <input style={inp} placeholder="Ej: Coca-Cola 2.25 litros" value={form.nombre} onChange={e => set('nombre', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Tipo de venta *</label>
              <select style={inp} value={form.unidad_venta} onChange={e => set('unidad_venta', e.target.value)}>
                <option value="unidad">Por unidad</option>
                <option value="kg">Por kilogramo (peso)</option>
                <option value="litro">Por litro</option>
                <option value="metro">Por metro</option>
                <option value="caja">Caja / Docena</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Categoría</label>
              <select style={inp} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                <option value="">Seleccionar...</option>
                {['Bebidas', 'Almacén', 'Ferretería', 'Lácteos', 'Limpieza', 'Panadería', 'Fiambrería', 'Otro'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Código de barras (EAN)</label>
              <input style={{ ...inp, fontFamily: 'monospace' }} placeholder="7790001001234" value={form.codigo_barras} onChange={e => set('codigo_barras', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>SKU interno</label>
              <input style={{ ...inp, fontFamily: 'monospace' }} placeholder="SKU-001" value={form.sku} onChange={e => set('sku', e.target.value)} />
            </div>

            {/* Imagen */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Imagen del producto</label>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <label style={{ width: 100, height: 80, border: `2px dashed ${imgPreview ? '#5b4cff' : 'var(--border)'}`, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', flexShrink: 0, background: 'var(--bg3)' }}>
                  {imgPreview
                    ? <img src={imgPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <><span style={{ fontSize: 24 }}>📷</span><span style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>Subir imagen</span></>
                  }
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagen} />
                </label>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
                  PNG, JPG · máx. 2MB<br />
                  {imgPreview && <button onClick={() => { setImgPreview(null); setImgFile(null) }} style={{ marginTop: 6, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.3)', background: 'var(--bg2)', color: '#ff4757', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Quitar</button>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Precios */}
        <div style={sec}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--text)' }}>💰 Precios</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Precio de compra (costo)</label>
              <input style={inp} type="number" placeholder="0.00" value={form.precio_costo} onChange={e => set('precio_costo', e.target.value)} />
            </div>

            {/* Solo si NO es kg */}
            {!esKg && (
              <>
                <div>
                  <label style={lbl}>Precio de venta *</label>
                  <input style={inp} type="number" placeholder="0.00" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Precio mayorista</label>
                  <input style={inp} type="number" placeholder="0.00" value={form.precio_mayorista} onChange={e => set('precio_mayorista', e.target.value)} />
                </div>
              </>
            )}

            {/* Solo si ES kg */}
            {esKg && (
              <div>
                <label style={lbl}>Precio por kilogramo *</label>
                <input style={inp} type="number" placeholder="$ por kg" value={form.precio_por_kg} onChange={e => set('precio_por_kg', e.target.value)} />
              </div>
            )}

            <div>
              <label style={lbl}>IVA</label>
              <select style={inp}>
                <option>21% (General)</option>
                <option>10.5% (Reducido)</option>
                <option>0% (Exento)</option>
              </select>
            </div>

            {/* Margen solo si no es kg */}
            {!esKg && margenCalc !== null && (
              <div>
                <label style={lbl}>Margen calculado</label>
                <div style={{ ...inp, color: margenCalc < 20 ? '#ff4757' : margenCalc < 35 ? '#ffb800' : '#00c896', fontWeight: 600 }}>
                  {margenCalc}% de margen
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stock y lotes */}
        <div style={sec}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>📦 Stock y lotes</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 14, background: 'rgba(91,76,255,0.06)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(91,76,255,0.15)' }}>
            💡 El stock se calcula automáticamente sumando las cantidades de los lotes que cargues abajo.
            {esKg && ' Para productos por kilo, ingresá el peso en kg de cada lote.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Stock mínimo (alerta)</label>
              <input style={inp} type="number" placeholder="10" value={form.stock_minimo} onChange={e => set('stock_minimo', e.target.value)} />
              {esKg && <span style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2, display: 'block' }}>En kg</span>}
            </div>
            <div>
              <label style={lbl}>Stock ideal</label>
              <input style={inp} type="number" placeholder="50" value={form.stock_ideal} onChange={e => set('stock_ideal', e.target.value)} />
              {esKg && <span style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2, display: 'block' }}>En kg</span>}
            </div>
            <div>
              <label style={lbl}>Ubicación en el local</label>
              <input style={inp} placeholder="Ej: Góndola A3" value={form.ubicacion} onChange={e => set('ubicacion', e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <div style={{ background: 'rgba(0,200,150,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 11, border: '1px solid rgba(0,200,150,0.2)', width: '100%' }}>
                <div style={{ color: 'var(--text2)', marginBottom: 2 }}>Stock inicial total</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#00c896' }}>
                  {esKg ? `${stockInicialTotal.toFixed(2)} kg` : stockInicialTotal}
                </div>
              </div>
            </div>
          </div>

          {/* Lotes */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Lotes {esKg ? '(hormas / piezas)' : ''}
          </div>
          {lotes.map((lote, idx) => (
            <div key={lote.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', marginBottom: 6, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 10, color: 'var(--text2)', width: 50, flexShrink: 0 }}>Lote {idx + 1}</span>
              <input value={lote.numero} onChange={e => updateLote(lote.id, 'numero', e.target.value)}
                placeholder="Nro. lote" style={{ ...inp, width: 110 }} />
              <input value={lote.cantidad} onChange={e => updateLote(lote.id, 'cantidad', e.target.value)}
                placeholder={esKg ? 'Kg' : 'Cant.'} type="number" style={{ ...inp, width: 70 }} />
              <input value={lote.vencimiento} onChange={e => updateLote(lote.id, 'vencimiento', e.target.value)}
                type="date" style={{ ...inp, flex: 1 }} />
              {lotes.length > 1 && (
                <button onClick={() => quitarLote(lote.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4757', fontSize: 16, flexShrink: 0 }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={agregarLoteLocal}
            style={{ marginTop: 6, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
            + Agregar otro lote
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, paddingBottom: 24 }}>
          <button onClick={guardar} disabled={guardando}
            style={{ padding: '10px 24px', borderRadius: 8, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: guardando ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {guardando ? '⏳ Guardando...' : '✓ Guardar producto'}
          </button>
          <button onClick={() => router.back()}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}