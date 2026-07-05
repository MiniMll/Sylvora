# Recuperación de cobros MP — cola de revisión

Spec técnica de la épica `requiere_revision`. Estado: **implementada
y en main** (Commits 1-6 de la épica). El lifecycle resumido está en
[mp-lifecycle-cobro.md](mp-lifecycle-cobro.md).

## Objetivo

**Ningún cobro aprobado de Mercado Pago puede quedar invisible si la
venta no se registró.** El dinero entró a la cuenta MP del
comerciante; Sylvora tiene que mostrarlo, permitir resolverlo y dejar
rastro auditable de la resolución. Sin pérdida de dinero, sin borrar
historial.

Prioridad de diseño: seguridad > auditoría > trazabilidad > UX.

## Las 4 clases de huérfanos y su detección

| Clase | Escenario | Detección | Motivo persistido |
|---|---|---|---|
| **A** | El cliente paga justo después de que el cajero canceló o el QR venció. El webhook llega con `approved` sobre un intento `cancelado`/`expirado` | `lib/mp/webhook-handler.ts` paso 6.a: transición atómica a `requiere_revision` (`marcarPagoPostCancelacion`, `WHERE estado IN ('cancelado','expirado')`) | `pago_post_cancelacion` |
| **B** | MP aprobó pero `guardarVenta` falló (stock cambió en paralelo, drift de lotes, error de red) | El POS llama `POST /api/mp/cobros/:id/requiere-revision` con la razón (`marcarIntentoRequiereRevision`, `WHERE estado='aprobado'`) | `stock_insuficiente:<producto>`, `drift_lotes`, etc. |
| **C** | El cajero cierra el navegador entre la aprobación y `crear_venta` — nadie marca nada | **Lazy-promote**: `promoverHuerfanosSilenciosos` — UPDATE atómico multi-fila `estado='aprobado' AND venta_id IS NULL AND pagado_en < now()−15min` | `huerfano_detectado` |
| **D** | La venta SÍ se creó pero `asociarVentaAIntentoMP` (best-effort) falló — falso huérfano | Mismo barrido que C (el intento no tiene `venta_id`). El admin lo diagnostica y usa "Asociar" | `huerfano_detectado` |

El lazy-promote corre en cada `GET /api/mp/revision` — que se dispara
al abrir la cola en Configuración **y** al cargar el Dashboard como
admin (fetch del banner). Sin cron. Umbral: **15 minutos**
(`MP_HUERFANO_UMBRAL_MS`), mayor que el TTL del QR (10 min) + margen.

## Arquitectura de la resolución

```
UI (MPRevisionSection, admin-only)
  │  POST /api/mp/revision/:id/resolver { accion, venta_id?, nota? }
  ▼
Endpoint — valida UUID/acción/venta/nota + rol admin      (capa 1)
  │  resolverIntentoMP() — wrapper tipado
  ▼
RPC resolver_intento_mp — SECURITY INVOKER, transaccional (capa 2)
  ├─ get_rol() = 'admin' (RAISE solo_admin si no)
  ├─ SELECT intento FOR UPDATE + validar comercio + estado
  ├─ validar acción (venta del mismo comercio, nota en descartado)
  ├─ INSERT mp_resoluciones_cobro  ── RLS INSERT admin-only (capa 3)
  └─ UPDATE intento → 'resuelto' (WHERE estado='requiere_revision')
     Cualquier falla ⇒ rollback completo. Sin estado intermedio.
```

- **Cero UPDATE manual** del estado `resuelto` fuera de la RPC.
- Race entre dos admins: el `FOR UPDATE` + WHERE serializan; el
  segundo recibe `estado_invalido` (HTTP 409) sin doble auditoría.
- `mp_resoluciones_cobro` es **INSERT-only**: la RLS tiene
  exactamente 2 policies (SELECT + INSERT, admin del comercio). Sin
  UPDATE. Sin DELETE. El historial no se toca.
- La FK `intento_id` no tiene CASCADE: no se puede borrar un intento
  que tiene resolución.

### Acciones

| Acción | Precondición | Efecto extra |
|---|---|---|
| `venta_registrada` | `items_snapshot` presente; la UI crea la venta primero con el flow existente (`guardarVenta`, misma RPC atómica de stock, `metodo_pago='mercadopago'`, **timestamp actual** — `pagado_en` queda como dato histórico) | `venta_id` requerido; la RPC valida que la venta sea del comercio |
| `venta_asociada` | La venta ya existe (clase D). Búsqueda por N° de ticket con verificación de monto en la UI | `venta_id` requerido + validado |
| `reembolsado` | El admin ya devolvió el dinero desde el panel MP | Solo auditoría |
| `descartado` | Conciliado por fuera | `nota` obligatoria (CHECK en DB + validación en RPC + UI) |

### El snapshot (`items_snapshot`)

Congelado al crear el cobro (POS → endpoint → sanitizador →
`intentos_cobro_mp.items_snapshot`). Formato versionado — ver
`lib/mp/snapshot.ts`. El sanitizador server-side valida shape, tipos,
límites y **consistencia aritmética triple** (items ≈ subtotal;
subtotal − descuento + recargo ≈ total; total ≈ monto cobrado): un
snapshot manipulado no puede recrear una venta distinta de lo cobrado.
Un snapshot inválido no bloquea el cobro (queda NULL + warn).
Intentos históricos sin snapshot solo ofrecen asociar / reembolsar /
descartar.

## Piezas del sistema

| Pieza | Archivo |
|---|---|
| Migración (estado `resuelto`, tabla auditoría, snapshot, RPC) | `scripts/migration-mp-revision-v1.sql` |
| Webhook clase A | `lib/mp/webhook-handler.ts` (paso 6.a) |
| Sanitizador de snapshot | `lib/mp/snapshot.ts` |
| Data layer (promote, listar, resolver, snapshot) | `lib/supabase/mp.ts` |
| Endpoints cola | `app/api/mp/revision/route.ts` + `[id]/resolver/route.ts` |
| UI | `app/configuracion/components/MPRevisionSection.tsx` |
| Banner | `app/dashboard/page.tsx` |
| Umbral | `lib/mp/config.ts` → `MP_HUERFANO_UMBRAL_MS` |

## Smokes

| Script | Cubre |
|---|---|
| `scripts/smoke-mp-e2e-revision.ts` | **E2E de las 4 clases A/B/C/D**: del pago al `resuelto` con auditoría |
| `scripts/smoke-mp-revision.ts` | Lazy-promote (umbral, venta_id, idempotencia, aislamiento) + wrapper RPC |
| `scripts/smoke-mp-webhook-handler.ts` | Clase A + matriz de idempotencia del webhook |
| `scripts/smoke-mp-snapshot.ts` | Sanitizador + persistencia del snapshot |
| `scripts/smoke-mp-requiere-revision.ts` | Transición aprobado→requiere_revision (clase B) |

Correr todos: `npx tsx scripts/smoke-mp-<nombre>.ts`

## Checklist de QA manual (preview/staging)

1. **Cola vacía**: admin → Configuración → Mercado Pago → card verde
   "No hay cobros pendientes". Dashboard sin banner.
2. **Clase C (huérfano)**: cobro QR sandbox → pagar → cerrar el
   navegador antes de que registre la venta. Acelerar el umbral:
   `UPDATE intentos_cobro_mp SET pagado_en = now() - interval '20 minutes' WHERE id = '<ID>';`
   → abrir Dashboard como admin → banner con contador → "Ir a
   revisar" → fila con motivo "Venta sin completar" + badge snapshot.
3. **Registrar venta**: modal muestra los items → confirmar → toast →
   la fila pasa a "Resueltos" con tu nombre → verificar la venta en
   /ventas y el stock descontado.
4. **Clase A**: generar cobro → cancelar desde el POS → pagar igual
   con la app de prueba → webhook llega → la fila aparece con motivo
   "Pagó tras cancelar/vencer" → resolver como reembolsado.
5. **Clase D**: con un intento en cola cuya venta ya existe → "Asociar"
   → buscar por N° de ticket → verificar alerta si el monto difiere →
   asociar → resuelto.
6. **Descartar**: sin nota el botón queda deshabilitado; con nota
   resuelve y la nota aparece en el historial.
7. **Banner desaparece**: resolver todo → Dashboard sin banner.
8. **Permisos**: como encargado el tab MP no aparece;
   `GET /api/mp/revision` con su cookie → 403; la RPC además rechaza
   `solo_admin` si se llamara directo.
9. **Race**: dos pestañas admin → resolver el mismo cobro en ambas →
   la segunda recibe "ya no está en revisión" + refresh.
10. **Inmutabilidad**: en SQL editor,
    `UPDATE mp_resoluciones_cobro SET nota='x'` → 0 filas (sin policy).

## Riesgos residuales (aceptados)

| Riesgo | Por qué se acepta |
|---|---|
| Webhook app-level roto PERMANENTEMENTE + pago sobre cancelado/expirado: ni el polling (solo corre en `pendiente`) ni la cola lo ven | Requiere falla de configuración persistente; en instalación normal no ocurre. **V2**: re-check activo contra MP de cancelados/expirados recientes |
| Admin registra venta desde snapshot cuando la venta YA existía (clase D mal diagnosticada) → venta duplicada + doble descuento de stock | Decisión humana con la info a la vista (fecha del pago original en el modal); "Asociar" existe para el caso correcto. Reversible anulando la venta duplicada |
| `guardarVenta` OK pero la resolución falla (red) → venta creada, intento sigue en cola | El admin resuelve con "Asociar" al ticket recién creado. Sin dinero perdido |
| Banner con contador desactualizado entre pestañas | Informativo; el link lleva a la fuente de verdad que re-fetchea |

## Fuera de alcance — V2 explícito

- **Refund vía API MP** (hoy: manual en el panel MP + registro acá).
- **Re-check activo contra MP** de intentos cancelados/expirados de
  las últimas 48 h (cubre el riesgo residual del webhook roto).
- **Endpoint dedicado `POST /api/mp/revision/:id/registrar-venta`**
  que reutilice `guardarVenta` server-side — hoy la UI llama el flow
  directo. Registrar venta nueva desde el POS y reconstruir una venta
  ya cobrada son casos de negocio distintos aunque compartan
  implementación (deuda anotada en backlog).
- **Notificaciones push/email** al admin cuando entra un cobro a la
  cola (hoy: banner en dashboard).
- **Métricas** de tiempo-hasta-resolución.
