'use client'
import { InputHTMLAttributes, SelectHTMLAttributes, CSSProperties, forwardRef } from 'react'

// Primitivas <Input> y <Select>. Reemplazan los 3 inpStyle locales y
// los inputs/select inline duplicados en formularios y filtros.
//
// El focus ring violeta lo aplica :focus global en globals.css con
// !important — no necesita repetirse acá. Para que ese override
// funcione, no pisamos border en focus desde inline.
//
// Default size='sm' preserva el visual existente (padding 7/10
// fontSize 12, que es lo que tenían los inpStyle migrados).

type FieldSize = 'sm' | 'md'

const SIZE_STYLES: Record<FieldSize, { padding: string; fontSize: number }> = {
  sm: { padding: '7px 10px', fontSize: 12 },
  md: { padding: '9px 12px', fontSize: 13 },
}

function baseStyle(size: FieldSize): CSSProperties {
  return {
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: 8,
    outline: 'none',
    fontFamily: 'inherit',
    background: 'var(--bg2)',
    color: 'var(--text)',
    padding: SIZE_STYLES[size].padding,
    fontSize: SIZE_STYLES[size].fontSize,
  }
}

// Omit 'size' del HTMLAttributes porque conflicta con nuestra prop
// custom de tamaño visual (el size nativo de <input> es character-width,
// raramente útil en práctica).
type InputBaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>
interface InputProps extends InputBaseProps {
  size?: FieldSize
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'sm', style, ...rest }, ref) => (
    <input ref={ref} {...rest} style={{ ...baseStyle(size), ...style }} />
  )
)
Input.displayName = 'Input'

type SelectBaseProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>
interface SelectProps extends SelectBaseProps {
  size?: FieldSize
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'sm', style, children, ...rest }, ref) => (
    <select ref={ref} {...rest} style={{ ...baseStyle(size), ...style }}>
      {children}
    </select>
  )
)
Select.displayName = 'Select'
