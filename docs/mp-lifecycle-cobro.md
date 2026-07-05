# Lifecycle de un cobro Mercado Pago en Sylvora

Documento corto. El detalle de la cola de revisión está en
[mp-revision-recuperacion.md](mp-revision-recuperacion.md); la
integración MP completa en [mercado-pago-cobros-spec.md](mercado-pago-cobros-spec.md).

## Las 5 etapas

```
INTENTO ──► PAGO ──► VENTA ──► (REVISIÓN) ──► (RESOLUCIÓN)
```

### 1. Intento

El cajero elige "Mercado Pago" y aprieta Cobrar. `POST /api/mp/cobros`
crea un row en `intentos_cobro_mp` con estado `pendiente`, un
`external_reference` propio (`sy_<uuid>`), un **snapshot completo del
carrito** (`items_snapshot`) y crea la Order QR en MP. El POS muestra
el QR y pollea el estado cada 2 s.

**La venta NO existe todavía.** Si el cliente nunca paga, no se toca
stock ni contabilidad.

### 2. Pago

El cliente escanea y paga. MP notifica por webhook (con firma HMAC
verificada) o el polling de Orders lo detecta. El intento pasa a
`aprobado` con `mp_payment_id` y `pagado_en`. **El dinero ya está en
la cuenta MP del comerciante** — desde este punto, el cobro no puede
"desaparecer" jamás.

Si el cajero cancela o el QR vence antes del pago → `cancelado` /
`expirado` (sin dinero, fin del ciclo).

### 3. Venta

El POS, al ver `aprobado`, ejecuta el flow normal de venta
(`guardarVenta` → RPC atómica de stock) y asocia `venta_id` al
intento. Camino feliz: acá termina todo.

### 4. Revisión (solo si algo falló)

Si hay dinero cobrado pero la venta no quedó registrada, el intento
pasa a `requiere_revision` por alguno de estos caminos:

| Clase | Qué pasó | Quién lo detecta | Motivo |
|---|---|---|---|
| A | Cliente pagó justo después de cancelar/vencer el QR | Webhook (`approved` sobre `cancelado`/`expirado`) | `pago_post_cancelacion` |
| B | `guardarVenta` falló post-aprobación (stock cambió, etc.) | El POS lo marca explícitamente | `stock_insuficiente:*`, `drift_lotes`, etc. |
| C | Cajero cerró el navegador entre el pago y la venta | Lazy-promote (aprobado sin venta > 15 min) | `huerfano_detectado` |
| D | La venta SÍ existe pero la asociación falló | Lazy-promote (mismo barrido que C) | `huerfano_detectado` |

El lazy-promote corre al abrir la cola **y** al entrar al Dashboard
como admin (sin cron). El admin ve un banner: *"Hay X cobros de
Mercado Pago que requieren revisión."*

### 5. Resolución (admin-only)

Desde Configuración → Mercado Pago → "Cobros a revisar", el admin
elige una de 4 acciones. Todas pasan por la RPC transaccional
`resolver_intento_mp` (valida rol admin adentro; auditoría + cierre
en una sola tx):

| Acción | Cuándo | Efecto |
|---|---|---|
| `venta_registrada` | Hay snapshot y el stock alcanza | Crea la venta con los items exactos (fecha de hoy) y asocia |
| `venta_asociada` | La venta ya existía (clase D) | Linkea por N° de ticket |
| `reembolsado` | Se devolvió el dinero desde el panel MP | Solo registra (refund vía API = V2) |
| `descartado` | Conciliado por fuera | Nota obligatoria |

El intento queda `resuelto` (terminal absoluto) y la resolución queda
en `mp_resoluciones_cobro` — **inmutable**: sin UPDATE ni DELETE,
con quién, cuándo, cómo y por qué.

## Máquina de estados completa

```
              ┌─────────── pendiente ───────────┐
              │                │                │
          aprobado         cancelado         expirado
              │                │                │
     ┌────────┼────────┐       └───(webhook approved tardío)──┐
  venta OK    │   requiere_revision ◄─────────────────────────┘
 (venta_id)   │        │
              │    resuelto  ◄── RPC resolver_intento_mp (admin)
              │
          rechazado
```

Invariantes:

- Todo estado con dinero (`aprobado` sin venta, `requiere_revision`)
  es **visible** — por cola, banner o ambos.
- `resuelto` solo se alcanza vía RPC con fila de auditoría en la misma
  transacción.
- Ningún webhook pisa un estado terminal absoluto (`aprobado`,
  `rechazado`, `requiere_revision`, `resuelto`).
- Los intentos nunca se borran (sin DELETE policy).
