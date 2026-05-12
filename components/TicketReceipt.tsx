/**
 * TicketReceipt — layout único del ticket impreso (papel térmico 80mm).
 *
 * Usado tanto en el flujo post-cobro (POSPayment) como en el modal de
 * historial (ventas/page). Tener un solo componente garantiza que el
 * output impreso sea idéntico en ambos puntos de entrada.
 *
 * Diseño:
 * - Header brand (SYLVORA) en sans-serif, peso fuerte, centrado.
 * - Sub-header con número de ticket monospace + fecha legible.
 * - Sección items: separadores dashed (look de ticket real), filas
 *   con qty + nombre + monto alineado a la derecha (monospace).
 * - Bloque totales: subtotal/descuento/recargo solo si aplican, TOTAL
 *   prominente con borders sólidos arriba y abajo.
 * - Método de pago en línea separada.
 * - Footer "Gracias por tu compra" centrado, pequeño.
 *
 * Forzamos colores oscuros en negro para que rinda bien tanto en
 * impresora térmica como en print-to-PDF. No depende de variables CSS
 * porque @media print suele descartar background-color.
 */
import { formatPeso, formatFechaTicket, labelMetodoPago } from '@/lib/utils'
import type { Venta } from '@/types/database'

const COLOR_INK = '#000'
const COLOR_INK_SOFT = '#333'

export function TicketReceipt({ venta }: { venta: Venta }) {
  const ticketN = String(venta.numero_ticket).padStart(4, '0')
  const fecha = formatFechaTicket(venta.created_at)
  const items = venta.items_venta || []
  const hayAjustes = venta.descuento_porcentaje > 0 || venta.recargo_porcentaje > 0
  const isAnulada = venta.estado === 'anulada'

  return (
    <div
      style={{
        fontFamily: '"DM Sans", system-ui, sans-serif',
        fontSize: 11,
        lineHeight: 1.45,
        color: COLOR_INK,
        background: '#fff',
        padding: '10px 6px',
        width: '100%',
      }}
    >
      {/* ───── Brand header ───── */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 800,
          fontSize: 16,
          letterSpacing: '0.18em',
          marginBottom: 2,
        }}
      >
        SYLVORA
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: 9,
          color: COLOR_INK_SOFT,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: 10,
        }}
      >
        Comprobante no fiscal
      </div>

      {/* ───── Ticket meta ───── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: 10, color: COLOR_INK_SOFT }}>Ticket</span>
        <span style={{ fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: 12 }}>
          #{ticketN}
        </span>
      </div>
      <div style={{ fontSize: 10, color: COLOR_INK_SOFT, textTransform: 'capitalize' }}>
        {fecha}
      </div>

      {/* ───── Items ───── */}
      <div
        style={{
          borderTop: `1px dashed ${COLOR_INK}`,
          borderBottom: `1px dashed ${COLOR_INK}`,
          padding: '8px 0',
          margin: '10px 0',
        }}
      >
        {items.length > 0 ? items.map((item, i) => {
          const qty = item.peso_kg ? `${item.peso_kg} kg` : `${item.cantidad} ×`
          const unit = item.peso_kg
            ? `${formatPeso(item.precio_unitario)}/kg`
            : formatPeso(item.precio_unitario)
          return (
            <div key={item.id ?? i} style={{ marginBottom: i === items.length - 1 ? 0 : 6 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <span style={{ flex: 1, fontWeight: 500 }}>
                  {item.nombre_producto}
                </span>
                <span
                  style={{
                    fontFamily: '"DM Mono", monospace',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatPeso(item.subtotal)}
                </span>
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: COLOR_INK_SOFT,
                  fontFamily: '"DM Mono", monospace',
                }}
              >
                {qty} {unit}
              </div>
            </div>
          )
        }) : (
          <div style={{ fontSize: 10, color: COLOR_INK_SOFT, fontStyle: 'italic' }}>
            (sin detalle de items)
          </div>
        )}
      </div>

      {/* ───── Totales ───── */}
      {hayAjustes && (
        <>
          <Row label="Subtotal" value={formatPeso(venta.subtotal)} muted />
          {venta.descuento_porcentaje > 0 && (
            <Row
              label={`Descuento -${venta.descuento_porcentaje}%`}
              value={`-${formatPeso(venta.descuento_monto)}`}
              muted
            />
          )}
          {venta.recargo_porcentaje > 0 && (
            <Row
              label={`Recargo +${venta.recargo_porcentaje}%`}
              value={`+${formatPeso(venta.recargo_monto)}`}
              muted
            />
          )}
        </>
      )}

      {/* TOTAL prominente */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderTop: `2px solid ${COLOR_INK}`,
          borderBottom: `2px solid ${COLOR_INK}`,
          marginTop: 8,
          padding: '6px 0',
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.04em' }}>TOTAL</span>
        <span
          style={{
            fontFamily: '"DM Mono", monospace',
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          {formatPeso(venta.total)}
        </span>
      </div>

      {/* Método */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: 10,
        }}
      >
        <span style={{ color: COLOR_INK_SOFT }}>Método de pago</span>
        <span style={{ fontWeight: 600 }}>{labelMetodoPago(venta.metodo_pago)}</span>
      </div>

      {/* Banner anulada */}
      {isAnulada && (
        <div
          style={{
            marginTop: 12,
            border: `1.5px solid ${COLOR_INK}`,
            padding: '6px 0',
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: '0.1em',
          }}
        >
          ** VENTA ANULADA **
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          textAlign: 'center',
          marginTop: 16,
          fontSize: 10,
          color: COLOR_INK_SOFT,
        }}
      >
        Gracias por tu compra
      </div>
      <div
        style={{
          textAlign: 'center',
          marginTop: 4,
          fontSize: 8,
          color: COLOR_INK_SOFT,
          letterSpacing: '0.15em',
        }}
      >
        sylvora.app
      </div>
    </div>
  )
}

// Fila auxiliar para subtotales/ajustes. Mantenemos el componente local
// porque sólo se usa acá y simplifica el JSX del bloque totales.
function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 10,
        color: muted ? COLOR_INK_SOFT : COLOR_INK,
        marginBottom: 2,
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: '"DM Mono", monospace' }}>{value}</span>
    </div>
  )
}
