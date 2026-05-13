'use client'
import { useState, useEffect } from 'react'
import type { Producto } from '@/types/database'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

const inp: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
  fontSize: 12, outline: 'none', fontFamily: 'inherit',
  background: 'var(--bg2)', color: 'var(--text)', width: '100%',
}

export interface EditFormValues {
  nombre: string
  codigo_barras: string
  sku: string
  precio_costo: string
  precio_venta: string
  precio_por_kg: string
  stock_actual: string
  stock_minimo: string
  unidad_venta: string
}

interface Props {
  producto: Producto
  guardando: boolean
  onClose: () => void
  onGuardar: (values: EditFormValues, imgFile: File | null) => Promise<void>
}

export function EditProductModal({ producto, guardando, onClose, onGuardar }: Props) {
  const [form, setForm] = useState<EditFormValues>({
    nombre: producto.nombre || '',
    codigo_barras: producto.codigo_barras || '',
    sku: producto.sku || '',
    precio_costo: producto.precio_costo?.toString() || '',
    precio_venta: producto.precio_venta?.toString() || '',
    precio_por_kg: producto.precio_por_kg?.toString() || '',
    stock_actual: producto.stock_actual?.toString() || '',
    stock_minimo: producto.stock_minimo?.toString() || '',
    unidad_venta: producto.unidad_venta || 'unidad',
  })
  const [imgPreview, setImgPreview] = useState<string | null>(producto.imagen_url || null)
  const [imgFile, setImgFile] = useState<File | null>(null)

  // Si cambia el producto editado (rara vez), resetea el form.
  useEffect(() => {
    setForm({
      nombre: producto.nombre || '',
      codigo_barras: producto.codigo_barras || '',
      sku: producto.sku || '',
      precio_costo: producto.precio_costo?.toString() || '',
      precio_venta: producto.precio_venta?.toString() || '',
      precio_por_kg: producto.precio_por_kg?.toString() || '',
      stock_actual: producto.stock_actual?.toString() || '',
      stock_minimo: producto.stock_minimo?.toString() || '',
      unidad_venta: producto.unidad_venta || 'unidad',
    })
    setImgPreview(producto.imagen_url || null)
    setImgFile(null)
  }, [producto])

  const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImgPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="✏️ Editar producto"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => onGuardar(form, imgFile)} loading={guardando} style={{ flex: 1 }}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </>
      }>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Imagen</label>
          <label style={{ width: 80, height: 70, borderRadius: 10, overflow: 'hidden', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--bg3)', fontSize: 28 }}>
            {imgPreview ? <img src={imgPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' style={{ color: 'var(--text2)' }}><path d='M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z'/><circle cx='12' cy='13' r='4'/></svg>}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImg} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {([
            { label: 'Nombre *', key: 'nombre', full: true },
            { label: 'Código de barras', key: 'codigo_barras' },
            { label: 'SKU', key: 'sku' },
            { label: 'Precio de costo', key: 'precio_costo', type: 'number' },
            ...(form.unidad_venta !== 'kg' ? [{ label: 'Precio de venta', key: 'precio_venta', type: 'number' }] : []),
            { label: 'Precio por kg', key: 'precio_por_kg', type: 'number' },
            { label: 'Stock actual', key: 'stock_actual', type: 'number' },
            { label: 'Stock mínimo', key: 'stock_minimo', type: 'number' },
          ] as { label: string; key: keyof EditFormValues; type?: string; full?: boolean }[]).map(f => (
            <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>{f.label}</label>
              <input type={f.type || 'text'} value={form[f.key] || ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={inp} />
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>Unidad de venta</label>
            <select value={form.unidad_venta || 'unidad'}
              onChange={e => setForm(prev => ({ ...prev, unidad_venta: e.target.value }))}
              style={inp}>
              <option value="unidad">Unidad</option>
              <option value="kg">Kilogramo (kg)</option>
              <option value="litro">Litro</option>
              <option value="metro">Metro</option>
            </select>
          </div>
        </div>
    </Modal>
  )
}
