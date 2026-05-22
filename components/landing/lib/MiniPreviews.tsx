import type { ReactNode } from 'react'
import {
  CheckCircle,
  ShoppingCart,
  CreditCard,
  Banknote,
  Smartphone,
  ShieldCheck,
} from 'lucide-react'

// Mini previews recreados en JSX/CSS para la landing.
//
// Por qué no screenshots: los WebP comprimidos a ~80KB en cards de
// ~500px se ven blandos. Acá renderizamos la misma UI del producto
// (mismos tokens, misma tipografía, mismos chips) pero vector-crisp
// y con datos curados de Kiosco El Faro — el universo ficticio que
// definimos en docs/landing-screenshots-brief.md.
//
// Regla de oro (anti bait-and-switch):
// - Mismos tokens (var(--bg), var(--ac), var(--g), --r, --w).
// - Misma DM Sans + DM Mono.
// - Mismas sombras / radios / paddings que las páginas reales.
// - Sin colores exagerados, sin sombras "premium" inventadas.
// Si querés mejorar un detalle visual, hacelo primero en el producto
// real (app/productos, app/caja, etc.) y replicalo acá.

// ───────────────────────────────────────────────────────────────────
// FRAME compartido — equivalente a ScreenshotCard pero para nodos
// react en lugar de <img>. Mismo radius / border / shadow.
// ───────────────────────────────────────────────────────────────────

interface MiniFrameProps {
  children: ReactNode
  /** Padding interno (default 20). El POS mobile usa 0 porque trae su propio frame. */
  padding?: number
  /** Override del background. Por default usa --bg2 (white). */
  background?: string
}

function MiniFrame({ children, padding = 20, background = 'var(--bg2)' }: MiniFrameProps) {
  return (
    <div
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow:
          '0 4px 16px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.06)',
        background,
        padding,
      }}
    >
      {children}
    </div>
  )
}

// Helper de formato (sin importar lib/utils — los Mini* viven en
// landing y queremos zero coupling con el resto del producto).
function fp(n: number) {
  return '$' + n.toLocaleString('es-AR')
}

// ───────────────────────────────────────────────────────────────────
// 1. MiniPOSPreview — usado en Features "Cobrá en segundos"
// ───────────────────────────────────────────────────────────────────

export function MiniPOSPreview() {
  const items = [
    { nombre: 'Coca-Cola 2.25L', cant: 1, total: 1890 },
    { nombre: 'Galletitas Oreo', cant: 2, total: 1780 },
    { nombre: 'Marlboro Box', cant: 1, total: 4200 },
  ]
  const subtotal = items.reduce((s, i) => s + i.total, 0)

  return (
    <MiniFrame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingCart size={14} color="var(--ac)" strokeWidth={2.2} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              Nueva venta
            </span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
            #1247
          </span>
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(i => (
            <div key={i.nombre} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              fontSize: 12,
            }}>
              <span style={{ color: 'var(--text)' }}>
                <b style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text2)', fontWeight: 500, marginRight: 6 }}>
                  ×{i.cant}
                </b>
                {i.nombre}
              </span>
              <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text2)', fontSize: 11 }}>
                {fp(i.total)}
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '12px 14px',
          background: 'var(--ac-light)',
          borderRadius: 12,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Total
          </span>
          <span style={{
            fontSize: 22, fontWeight: 700, color: 'var(--ac)',
            fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em',
          }}>
            {fp(subtotal)}
          </span>
        </div>

        {/* Métodos de pago */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {[
            { label: 'Efectivo', icon: Banknote, active: true },
            { label: 'Débito', icon: CreditCard, active: false },
            { label: 'Crédito', icon: CreditCard, active: false },
            { label: 'MP', icon: Smartphone, active: false },
          ].map(m => {
            const Icon = m.icon
            return (
              <div key={m.label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '8px 4px',
                borderRadius: 10,
                border: m.active ? '1.5px solid var(--ac)' : '1px solid var(--border)',
                background: m.active ? 'var(--ac-light)' : 'var(--bg2)',
              }}>
                <Icon size={14} color={m.active ? 'var(--ac)' : 'var(--text2)'} strokeWidth={2} />
                <span style={{
                  fontSize: 9, fontWeight: 600,
                  color: m.active ? 'var(--ac)' : 'var(--text2)',
                }}>
                  {m.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </MiniFrame>
  )
}

// ───────────────────────────────────────────────────────────────────
// 2. MiniStockPreview — usado en ComoFunciona paso 1 + Features "Stock"
// ───────────────────────────────────────────────────────────────────

interface ProductoMini {
  nombre: string
  sku: string
  precio: number
  stock: number
  estado: 'ok' | 'bajo' | 'critico' | 'sinstock'
}

const PRODUCTOS_MINI: ProductoMini[] = [
  { nombre: 'Coca-Cola 2.25L',    sku: 'COC-225', precio: 1890, stock: 8,  estado: 'bajo'     },
  { nombre: 'Marlboro Box',       sku: 'MAR-BOX', precio: 4200, stock: 2,  estado: 'critico'  },
  { nombre: 'Galletitas Oreo',    sku: 'ORE-118', precio: 890,  stock: 24, estado: 'ok'       },
  { nombre: 'Sprite 600ml',       sku: 'SPR-600', precio: 1100, stock: 0,  estado: 'sinstock' },
]

const ESTADO_META = {
  ok:       { color: 'var(--g)', label: 'OK'        },
  bajo:     { color: 'var(--w)', label: 'Bajo'      },
  critico:  { color: 'var(--r)', label: 'Crítico'   },
  sinstock: { color: 'var(--r)', label: 'Sin stock' },
}

export function MiniStockPreview() {
  return (
    <MiniFrame padding={0}>
      {/* Header tipo página */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Productos
        </span>
        <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
          12 productos · 2 alertas
        </span>
      </div>

      {/* Filas */}
      <div>
        {PRODUCTOS_MINI.map((p, i) => {
          const meta = ESTADO_META[p.estado]
          return (
            <div key={p.sku} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              alignItems: 'center',
              gap: 12,
              padding: '12px 18px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {p.nombre}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                  {p.sku}
                </span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 700, color: 'var(--ac)',
                fontFamily: 'DM Mono, monospace', letterSpacing: '-0.01em',
              }}>
                {fp(p.precio)}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: meta.color === 'var(--g)' ? 'rgba(0,200,150,0.08)'
                          : meta.color === 'var(--w)' ? 'rgba(255,184,0,0.10)'
                          :                              'rgba(255,71,87,0.10)',
                color: meta.color,
                padding: '3px 9px',
                borderRadius: 999,
                fontSize: 10, fontWeight: 600,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color }} />
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>
    </MiniFrame>
  )
}

// ───────────────────────────────────────────────────────────────────
// 3. MiniCajaPreview — usado en ComoFunciona paso 3 + Features "Caja"
// ───────────────────────────────────────────────────────────────────

export function MiniCajaPreview() {
  return (
    <MiniFrame padding={20}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CheckCircle size={15} color="var(--ac)" strokeWidth={2.2} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            Caja cerrada
          </span>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>· lunes, 18 de mayo</span>
        </div>

        {/* Saldo grande */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            fontSize: 10, color: 'var(--text2)',
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
          }}>
            Saldo neto
          </span>
          <span style={{
            fontSize: 28, fontWeight: 700, color: 'var(--text)',
            fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em',
          }}>
            {fp(87500)}
          </span>
        </div>

        {/* Grid de stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
          paddingTop: 12, borderTop: '1px solid var(--border)',
        }}>
          {[
            { label: 'Ventas',     value: fp(112800), color: 'var(--text)' },
            { label: 'Egresos',    value: fp(25300),  color: 'var(--text)' },
            { label: 'Diferencia', value: '+' + fp(200), color: 'var(--w)' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{
                fontSize: 9, color: 'var(--text2)',
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
              }}>
                {s.label}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700, color: s.color,
                fontFamily: 'DM Mono, monospace', letterSpacing: '-0.01em',
              }}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* Retiro */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px',
          background: 'var(--bg)',
          borderRadius: 10,
          fontSize: 11,
        }}>
          <span style={{ color: 'var(--text2)' }}>Retiro · queda en caja</span>
          <span style={{ color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {fp(50000)} → {fp(37300)}
          </span>
        </div>
      </div>
    </MiniFrame>
  )
}

// ───────────────────────────────────────────────────────────────────
// 4. MiniUsersPreview — usado en Features "Tu equipo, con control"
// ───────────────────────────────────────────────────────────────────

interface UserMini {
  nombre: string
  email: string
  iniciales: string
  rol: 'admin' | 'empleado'
  color: string
}

const USERS_MINI: UserMini[] = [
  { nombre: 'Sofía Méndez',  email: 'sofia@elfaro.ar',  iniciales: 'SM', rol: 'admin',    color: '#5b4cff' },
  { nombre: 'Martín Rocha',  email: 'martin@elfaro.ar', iniciales: 'MR', rol: 'empleado', color: '#00c896' },
  { nombre: 'Laura Torres',  email: 'laura@elfaro.ar',  iniciales: 'LT', rol: 'empleado', color: '#ffb800' },
]

export function MiniUsersPreview() {
  return (
    <MiniFrame padding={0}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Usuarios
        </span>
        <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
          3 activos
        </span>
      </div>

      <div>
        {USERS_MINI.map((u, i) => (
          <div key={u.email} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 18px',
            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: u.color,
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
              flexShrink: 0,
            }}>
              {u.iniciales}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{u.nombre}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>{u.email}</div>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: u.rol === 'admin' ? 'var(--ac-light)' : 'var(--bg3)',
              color: u.rol === 'admin' ? 'var(--ac)' : 'var(--text2)',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 10, fontWeight: 600,
              textTransform: 'capitalize',
            }}>
              {u.rol === 'admin' && <ShieldCheck size={10} strokeWidth={2.4} />}
              {u.rol}
            </span>
          </div>
        ))}
      </div>
    </MiniFrame>
  )
}

// ───────────────────────────────────────────────────────────────────
// 5. MiniTicketPreview — usado en Features "Tickets profesionales"
// ───────────────────────────────────────────────────────────────────

export function MiniTicketPreview() {
  const items = [
    { cant: 1, nombre: 'Coca-Cola 2.25L', total: 1890 },
    { cant: 2, nombre: 'Galletitas Oreo', total: 1780 },
    { cant: 1, nombre: 'Marlboro Box',    total: 4200 },
  ]
  const total = items.reduce((s, i) => s + i.total, 0)

  return (
    <MiniFrame padding={0} background="var(--bg)">
      {/* El ticket es más angosto — lo centramos sobre fondo bg para
          dar sensación de "papel sobre escritorio". */}
      <div style={{
        padding: '20px 12px',
        display: 'flex', justifyContent: 'center',
      }}>
        <div className="ticket-paper" style={{
          width: '100%', maxWidth: 240,
          background: '#ffffff',
          padding: '18px 16px',
          borderRadius: 6,
          fontFamily: 'DM Mono, monospace',
          fontSize: 11,
          color: '#1a1a1e',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>KIOSCO EL FARO</div>
            <div style={{ fontSize: 9, color: '#6b6b72', marginTop: 2 }}>Av. Rivadavia 4823 · CABA</div>
          </div>

          {/* Dotted divider */}
          <div style={{
            borderTop: '1px dashed #c8c8d0',
            margin: '8px 0',
          }} />

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map(i => (
              <div key={i.nombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span>{i.cant}× {i.nombre.length > 16 ? i.nombre.slice(0, 16) + '…' : i.nombre}</span>
                <span>{fp(i.total)}</span>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: '1px dashed #c8c8d0',
            margin: '8px 0',
          }} />

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
            <span>TOTAL</span>
            <span>{fp(total)}</span>
          </div>

          <div style={{
            marginTop: 10, paddingTop: 8,
            borderTop: '1px dashed #c8c8d0',
            textAlign: 'center',
            fontSize: 9, color: '#6b6b72',
          }}>
            18/05/2026 · 17:42<br />
            Gracias por tu compra
          </div>
        </div>
      </div>
    </MiniFrame>
  )
}

// ───────────────────────────────────────────────────────────────────
// 5b. MiniPhoneFrame — frame editorial para mockups mobile
// ───────────────────────────────────────────────────────────────────
//
// Usado en ComoFunciona paso 2. Resuelve el problema de que el WebP
// 600×900 estirado a flex:1 se sentía gigante vs los otros Mini*.
//
// El frame es minimalista (NO un iPhone literal): bezel oscuro, notch
// pill arriba, radius generoso. Capped a 260px de ancho via maxWidth.
// La imagen va adentro con radius interior que cierra contra el bezel.
//
// Por qué no recreamos el POS mobile completo en JSX: el screenshot
// real adentro del frame es lo único que sigue diciendo "esto corre
// en mi teléfono de verdad". El frame editorial le da la escala
// correcta sin perder esa señal.

interface MiniPhoneFrameProps {
  src: string
  alt: string
  width: number
  height: number
}

export function MiniPhoneFrame({ src, alt, width, height }: MiniPhoneFrameProps) {
  return (
    <MiniFrame padding={28} background="var(--bg)">
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
      }}>
        <div style={{
          // El "teléfono" en sí — capped angosto para no dominar la fila.
          width: '100%',
          maxWidth: 240,
          background: '#1a1a1e',
          borderRadius: 32,
          padding: 8,
          boxShadow:
            '0 2px 6px rgba(0,0,0,0.12), 0 18px 40px rgba(0,0,0,0.16)',
          position: 'relative',
        }}>
          {/* Notch / Dynamic Island */}
          <div style={{
            position: 'absolute',
            top: 14, left: '50%', transform: 'translateX(-50%)',
            width: 56, height: 14,
            background: '#000',
            borderRadius: 99,
            zIndex: 2,
          }} />

          {/* Pantalla — la imagen real va acá */}
          <div style={{
            borderRadius: 24,
            overflow: 'hidden',
            background: 'var(--bg2)',
            aspectRatio: `${width} / ${height}`,
          }}>
            <img
              src={src}
              alt={alt}
              width={width}
              height={height}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        </div>
      </div>
    </MiniFrame>
  )
}

// ───────────────────────────────────────────────────────────────────
// 6. MiniLotesPreview — usado en Features "Lotes con vencimiento"
// ───────────────────────────────────────────────────────────────────

interface LoteMini {
  producto: string
  lote: string
  cantidad: number
  diasRestantes: number
}

const LOTES_MINI: LoteMini[] = [
  { producto: 'Yogur Serenísima',  lote: '#003', cantidad: 18, diasRestantes: 4  },
  { producto: 'Leche La Serenísima', lote: '#007', cantidad: 24, diasRestantes: 12 },
]

export function MiniLotesPreview() {
  return (
    <MiniFrame padding={0}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Lotes con vencimiento
        </span>
        <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
          1 por vencer
        </span>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LOTES_MINI.map(l => {
          const urgente = l.diasRestantes <= 7
          const color = urgente ? 'var(--w)' : 'var(--g)'
          const bg    = urgente ? 'rgba(255,184,0,0.08)' : 'rgba(0,200,150,0.06)'
          const border = urgente ? 'rgba(255,184,0,0.20)' : 'var(--border)'
          return (
            <div key={l.lote} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px',
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 12,
              gap: 12,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {l.producto}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                  Lote {l.lote} · {l.cantidad} u.
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
                <span style={{
                  fontSize: 16, fontWeight: 700, color,
                  fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em',
                }}>
                  {l.diasRestantes}d
                </span>
                <span style={{ fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  {urgente ? 'Por vencer' : 'Vigente'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </MiniFrame>
  )
}
