'use client'
import { useRef } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Producto } from '@/types/database'

interface Props {
  productos: Producto[]
  value: string
  onChange: (v: string) => void
  /** Llamado al confirmar un producto (Enter sobre match exacto o único resultado). */
  onSelect: (p: Producto) => void
  /** Resultados ya filtrados — habilitan el atajo "Enter cuando hay 1 sólo resultado". */
  resultados: Producto[]
}

/**
 * Input único de búsqueda del POS. Soporta:
 *
 * - Tipeo manual del cajero (busca por nombre / código / SKU).
 * - Scanner físico USB/Bluetooth: estos lectores actúan como teclado,
 *   tipean rápidamente el código y emiten Enter al final. La lógica
 *   de Enter intenta primero match exacto contra codigo_barras y SKU
 *   (caso scanner) y cae a "único resultado" si no hay exacto.
 *
 * No hay scanner por cámara — eliminado por inestabilidad de ZXing.
 */
export function POSSearch({ productos, value, onChange, onSelect, resultados }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleEnter = () => {
    const buscado = value.trim()
    if (!buscado) return

    // Match exacto: lectores físicos siempre devuelven el código completo.
    const exacto = productos.find(p => p.codigo_barras === buscado || p.sku === buscado)
    if (exacto) {
      onSelect(exacto)
      toast.success(`${exacto.nombre} agregado`, { id: 'pos-input' })
      // Refocus defensivo: si el flujo abre un modal (ej. cantidad para
      // kg), el modal le robará el foco; si es venta directa, esto
      // mantiene el cursor listo para el siguiente código.
      inputRef.current?.focus()
      return
    }

    // Fallback: búsqueda parcial con 1 sólo resultado.
    if (resultados.length === 1) {
      onSelect(resultados[0])
      toast.success(`${resultados[0].nombre} agregado`, { id: 'pos-input' })
      inputRef.current?.focus()
      return
    }

    // Cero resultados → feedback de error. Múltiples resultados → no
    // auto-agregamos (el cajero elige tocando un resultado de la lista).
    if (resultados.length === 0) {
      toast.error(`No encontrado: ${buscado}`, { id: 'pos-input' })
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <Search
        size={14}
        color="var(--text2)"
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleEnter()
          }
          if (e.key === 'Escape') onChange('')
        }}
        placeholder="Buscar producto, código o SKU..."
        autoFocus
        style={{
          width: '100%',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '9px 12px 9px 32px',
          fontSize: 13,
          outline: 'none',
          fontFamily: 'inherit',
          background: 'var(--bg2)',
          color: 'var(--text)',
        }}
      />
    </div>
  )
}
