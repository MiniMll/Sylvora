'use client'
import { Plus, LayoutGrid, List } from 'lucide-react'
import { Input, Select } from '@/components/ui/Input'

export type Vista = 'cards' | 'lista'

interface Props {
  busqueda: string
  onBusquedaChange: (v: string) => void
  categoria: string
  onCategoriaChange: (v: string) => void
  categorias: string[]
  vista: Vista
  onVistaChange: (v: Vista) => void
}

export function ProductFilters({
  busqueda, onBusquedaChange,
  categoria, onCategoriaChange, categorias,
  vista, onVistaChange,
}: Props) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Input value={busqueda} onChange={e => onBusquedaChange(e.target.value)}
        placeholder="Buscar por nombre, código, SKU..."
        autoFocus
        style={{ flex: 1, width: 'auto', padding: '8px 12px' }} />
      <Select value={categoria} onChange={e => onCategoriaChange(e.target.value)}
        style={{ width: 'auto', padding: '8px 10px', cursor: 'pointer' }}>
        {categorias.map(c => <option key={c}>{c}</option>)}
      </Select>
      <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {(['cards', 'lista'] as const).map(v => (
          <button key={v} onClick={() => onVistaChange(v)}
            style={{ padding: '8px 12px', border: 'none', background: vista === v ? 'var(--ac)' : 'var(--bg2)', color: vista === v ? 'white' : 'var(--text)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            {v === 'cards' ? <LayoutGrid size={13} /> : <List size={13} />}
          </button>
        ))}
      </div>
      <a href="/productos/nuevo"
        style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--ac)', color: 'white', fontSize: 12, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Plus size={13} /> Nuevo Producto
      </a>
    </div>
  )
}
