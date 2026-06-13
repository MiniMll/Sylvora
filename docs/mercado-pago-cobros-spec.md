# Spec — Mercado Pago cobros v1 (QR dinámico + Link de pago)

Estado: **aprobada, pendiente de implementar.** Sprint `feat/mercado-pago-cobros-v1`.

Última actualización: 2026-06-07 (Commit 1 — spec doc).

---

## 1. Objetivo del sprint

Habilitar a un comerciante de Sylvora a **cobrar a sus clientes finales con Mercado Pago directamente desde el POS**, mostrando un QR dinámico en pantalla o compartiendo un link de pago por canales externos (WhatsApp, etc.).

**Filosofía**: Sylvora es el integrador, no el procesador de pagos. El dinero va de Mercado Pago directo a la cuenta del comerciante. Sylvora no toca el dinero, no cobra fee transaccional, no es marketplace formal de MP.

### Para qué SÍ sirve este sprint

- Cobrar de forma presencial con QR dinámico (cliente escanea con app MP).
- Cobrar de forma remota con link compartible (delivery, fiado, cobro telefónico).
- Onboarding self-service del comerciante con su propia cuenta MP via OAuth.
- Conciliación automática venta ↔ cobro vía webhook.
- Stock se descuenta atómicamente cuando el cobro queda aprobado.

### Para qué NO sirve este sprint

- Cobrar con tarjeta presencial (eso requiere Point hardware → futuro).
- Cobrar suscripciones de Sylvora al comerciante (modelo SaaS → sprint separado).
- Cobrar comisión Sylvora sobre la transacción (decisión de negocio: Opción A, no).
- Reportes financieros consolidados MP↔Sylvora (futuro, requiere settlements API).

---

## 2. Decisiones cerradas

Las que ya están confirmadas con el dueño del producto y NO se rediscuten en este sprint:

| # | Decisión | Valor |
|---|---|---|
| 1 | Modelo comercial | **Opción A — Sylvora NO cobra fee, NO toca dinero, NO se registra como marketplace formal MP.** |
| 2 | Métodos en V1 | QR dinámico (presencial) + Link de pago (remoto). Sin Point hardware. Sin QR estático. |
| 3 | API MP a usar | **Orders API** (lanzada Sep 2025) para QR dinámico. Checkout Pro Preferences para link. |
| 4 | OAuth flow | Authorization Code Flow + **PKCE obligatorio**. |
| 5 | Vida del access token | 180 días (default MP). Refresh proactivo cuando quedan <7 días. |
| 6 | TTL de un intento de cobro | **10 minutos** desde creación. Después → estado `expirado`. |
| 7 | Venta persiste cuándo | **Al aprobarse el cobro**, no al crear el intento. Así no se gasta stock por intentos cancelados. |
| 8 | Realtime + polling | Ambos. Realtime primario (latencia perceptual), polling cada 2s como failsafe del webhook. |
| 9 | Cifrado de tokens MP | App-level AES-256-GCM con clave en env (`SYLVORA_MP_TOKENS_ENC_KEY`). Rotación = redeploy. |
| 10 | Conciliación | Detección + alerta en V1 ("hay cobros MP sin venta"). Panel UI completo → V1.5. |
| 11 | Onboarding crea Store + POS automáticamente | Sí, en el callback OAuth. Ver §5.1. |
| 12 | Certificación de calidad MP | Correr antes del go-live productivo (commit final del sprint). |
| 13 | Quién puede conectar MP | Solo `admin`. Requiere nuevo permission `mp.gestionar`. |
| 14 | Quién puede cobrar con MP | Cualquier rol con `venta.crear` (admin, encargado, cajero). |

---

## 3. Modelo conceptual

```
                        ┌──────────────────────────────┐
                        │   1 app Sylvora en MP        │
                        │   (client_id + client_secret)│
                        └─────────────┬────────────────┘
                                      │
                       OAuth Authorization Code + PKCE
                                      │
   ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
   ▼                  ▼                               ▼                  ▼
Comercio A        Comercio B                       Comercio C        Comercio N
(Kiosco "El Faro")(Almacén "La Esquina")          (Minimarket "X")  ...
   │                  │                               │                  │
   │  access_token    │  access_token                 │ access_token     │
   │  + store/pos     │  + store/pos                  │ + store/pos      │
   │  guardados en    │  guardados en                 │ guardados en     │
   │  mp_credenciales │  mp_credenciales              │ mp_credenciales  │
   ▼                  ▼                               ▼                  ▼
 POS Sylvora ─────►  Orders API MP ──► QR dinámico ──► cliente escanea
                                                       │
                                                       ▼
                                                  pago aprobado
                                                       │
                                                       ▼
                                ┌──────────────────────────────┐
                                │  webhook → /api/mp/webhook   │
                                │  (URL única para TODOS los   │
                                │  comercios — match por       │
                                │  user_id del payload)        │
                                └──────────┬───────────────────┘
                                           │
                                           ▼
                                  intentos_cobro_mp
                                  estado → aprobado
                                           │
                                           ▼
                                  crear_venta RPC
                                  (atómico, descuenta stock)
```

**Una invariante clave**: la venta **no existe en Sylvora hasta que el cobro está aprobado**. El intento de cobro es la entidad pre-venta. Si el cliente nunca paga, no hay venta y no se toca el stock.

---

## 4. Arquitectura validada

### 4.1 Por qué Orders API y no Checkout Pro / Merchant Orders

| Aspecto | Orders API (elegida) | Checkout Pro / Merchant Orders viejo |
|---|---|---|
| Recommended por MP | Sí, nueva default desde Sep 2025 | Camino legacy |
| Conciliación automática | Sí, nativa | Manual |
| QR dinámico in-store | Sí, soporte nativo | Soportado pero más vueltas |
| Single source of truth | 1 endpoint por order | Mezcla preference + order + payment |
| Idempotencia | Header `X-Idempotency-Key` nativo | Manual |
| Futuro | Mantenido y extendido | Coexiste pero MP empuja a migrar |

Usamos Orders API también para el "link de pago" porque desde 2025 unifica ambos casos: el mismo Order con `type: "qr"` tiene un `qr_data` (para mostrar) y se puede extender a un checkout URL. Si en algún caso esto no alcanza (ej. UX específica de Checkout Pro), caemos a Preferences API solo para el link — decisión a tomar en Commit 5 cuando construyamos el cliente HTTP.

### 4.2 Stack y dependencias

- **Backend**: route handlers Next.js (server-only para todo lo que toca MP).
- **HTTP a MP**: `fetch` nativo, sin SDK. Hay un SDK oficial pero la superficie que usamos es chica (5 endpoints) y el SDK agrega ruido + lock-in. Wrapper propio en `lib/mp/client.ts`.
- **Cifrado**: `crypto` de Node (AES-256-GCM).
- **PKCE**: `crypto.randomBytes` + SHA-256.
- **Idempotencia**: UUID v4 por intento, guardado.
- **Realtime UI**: Supabase Realtime (ya usado en el proyecto).
- **Polling fallback**: setInterval cliente, cada 2s, máximo 10 minutos.

### 4.3 Diagrama de componentes

```
┌──────────────────────────────────────────────────────────────────┐
│ Frontend (cliente)                                               │
│  - app/configuracion/mercado-pago/page.tsx (onboarding UI)       │
│  - app/pos/components/POSPayment.tsx (extender con tab "MP")     │
│  - app/pos/components/CobroMpModal.tsx (NEW — QR + estado)       │
│  - lib/hooks/useMpCobroEstado.ts (realtime + polling)            │
└────────────────────────┬─────────────────────────────────────────┘
                         │ fetch
┌────────────────────────▼─────────────────────────────────────────┐
│ Backend (server, Next.js route handlers)                         │
│  - app/api/mp/oauth/start/route.ts        ──► genera PKCE + URL  │
│  - app/api/mp/oauth/callback/route.ts     ──► exchange + store   │
│  - app/api/mp/credenciales/route.ts       ──► GET / DELETE       │
│  - app/api/mp/cobros/route.ts             ──► POST crear intento │
│  - app/api/mp/cobros/[id]/route.ts        ──► GET / PATCH        │
│  - app/api/mp/webhook/route.ts            ──► POST handler       │
│                                                                  │
│  Servicios internos:                                             │
│  - lib/mp/client.ts        (HTTP a MP)                           │
│  - lib/mp/oauth.ts         (PKCE, exchange, refresh)             │
│  - lib/mp/crypto.ts        (AES-256-GCM encrypt/decrypt)         │
│  - lib/mp/orders.ts        (crear Order, leer Order, search)     │
│  - lib/mp/webhooks.ts      (validar firma, idempotencia)         │
│  - lib/mp/stores.ts        (crear Store + POS en onboarding)     │
└────────────────────────┬─────────────────────────────────────────┘
                         │ SQL
┌────────────────────────▼─────────────────────────────────────────┐
│ Postgres (Supabase)                                              │
│  - mp_credenciales       (1 row por comercio)                    │
│  - intentos_cobro_mp     (N por comercio)                        │
│  - ventas (ALTER + col)                                          │
│  - RPCs:                                                         │
│    - aprobar_cobro_mp_y_crear_venta(p_intento_id, p_payment_id) │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Flujos

### 5.1 Onboarding del comerciante

**Quién**: usuario con rol `admin` (permission `mp.gestionar`).
**Dónde**: `/configuracion/mercado-pago`.
**Estado previo**: comercio sin `mp_credenciales` row.

```
1. Admin entra a /configuracion/mercado-pago.
   - Estado: "No conectado". Botón "Conectar con Mercado Pago".

2. Click → GET /api/mp/oauth/start
   - Backend genera:
     - state = uuid v4 (random, 256 bits) → guardado en cookie http-only
     - code_verifier = base64url(crypto.randomBytes(32))
     - code_challenge = base64url(sha256(code_verifier))
     - challenge_method = "S256"
   - Guarda { state, code_verifier, comercio_id } en cookie httpOnly + secure.
   - Redirect a:
     https://auth.mercadopago.com.ar/authorization
       ?client_id=SYLVORA_MP_CLIENT_ID
       &response_type=code
       &platform_id=mp
       &state=<state>
       &redirect_uri=<SYLVORA_MP_REDIRECT_URI>
       &code_challenge=<challenge>
       &code_challenge_method=S256

3. Comerciante autoriza en MP (login con su cuenta personal MP del comercio).

4. MP redirige a /api/mp/oauth/callback?code=...&state=...
   - Validar state contra cookie. Si no coincide → 400 (CSRF protection).
   - POST a https://api.mercadopago.com/oauth/token con:
     - grant_type=authorization_code
     - client_id, client_secret
     - code, code_verifier (PKCE)
     - redirect_uri
   - Response: { access_token, refresh_token, user_id, public_key, expires_in, scope }

5. Crear Store en cuenta del seller:
   - POST https://api.mercadopago.com/stores
     headers: Authorization: Bearer <access_token>
     body: {
       name: "<comercio.nombre> — Sylvora",
       external_id: "sylvora_<comercio_id>",
       location: { ... opcional, podemos enviar solo país AR }
     }
   - Response: { id: <store_id> }

6. Crear POS dentro del Store:
   - POST https://api.mercadopago.com/pos
     headers: Authorization: Bearer <access_token>
     body: {
       name: "POS Sylvora",
       fixed_amount: false,
       store_id: <store_id>,
       external_id: "sylvora_<comercio_id>_pos1",
       category: 621102  // "Other category", placeholder
     }
   - Response: { id: <pos_id>, external_id: "sylvora_<comercio_id>_pos1" }

7. INSERT mp_credenciales:
   { comercio_id, access_token_enc, refresh_token_enc, user_id_mp,
     public_key, store_id_mp, external_pos_id,
     expira_en = now() + expires_in, conectado_por, conectado_en }
   Los tokens van CIFRADOS con AES-256-GCM (lib/mp/crypto.ts).

8. Redirect a /configuracion/mercado-pago con toast success.
   - Estado: "Conectado como <comerciante MP nickname>".
   - Botón "Desconectar".
```

**Fallos posibles en el onboarding**:

| Paso | Fallo | Comportamiento |
|---|---|---|
| 2 | Admin cierra el tab antes de autorizar | Cookie con state expira en 10 min. Próximo intento crea nuevo state. |
| 4 | `state` no coincide | 400 "Autorización inválida — reintentá". |
| 4 | Token exchange falla | 500 + toast. Comerciante reintenta. No queda credencial sucia. |
| 5 | Store creation falla | Rollback: NO insertamos `mp_credenciales`. Toast: "Conectaste tu cuenta MP pero no pudimos crear la tienda. Reintentá en unos segundos." |
| 6 | POS creation falla | Rollback igual. **No queremos credenciales sin Store/POS porque la Order API los exige.** |
| 7 | INSERT falla | Rollback: revocar el access_token en MP (`POST /oauth/revoke`). Sin esto queda un grant zombi. Toast genérico. |

### 5.2 Cobro (cada venta)

**Quién**: cualquier rol con `venta.crear`.
**Estado previo**: ticket armado en POS, monto > 0, comercio tiene `mp_credenciales` válido.

```
1. POS muestra el resumen del ticket → comerciante elige "Mercado Pago".
   Si el comercio NO tiene mp_credenciales:
     → tab "MP" oculto + CTA en empty state: "Conectá tu cuenta MP".

2. Modal CobroMpModal abre y dispara:
   POST /api/mp/cobros
   body: { monto, items: [{nombre, qty, precio_unit}, ...], items_payload: {...} }
   - items_payload es el snapshot del carrito que después se persistirá
     como venta cuando el cobro se apruebe. Lo guardamos en intentos_cobro_mp.

3. Backend:
   a. Verificar permission venta.crear (RLS implícito).
   b. SELECT mp_credenciales del comercio. Si no existe → 412 "Conectá MP".
   c. Si access_token expira en <7d → refresh proactivo (ver §6.2).
   d. Generar:
      - external_reference = "sylvora_<comercio_id>_<uuid>"
      - idempotency_key = uuid v4
   e. POST https://api.mercadopago.com/v1/orders
      headers:
        Authorization: Bearer <access_token decrypted>
        X-Idempotency-Key: <idempotency_key>
      body: {
        type: "qr",
        total_amount: "<monto con 2 decimales>",
        external_reference: "<external_reference>",
        description: "Venta Sylvora <fecha corta>",
        config: {
          qr: {
            external_pos_id: "<credenciales.external_pos_id>",
            mode: "dynamic"
          }
        },
        items: [...mapeo desde items_payload...]
      }
   f. Response: { id: order_id, qr_data, ... }
   g. INSERT intentos_cobro_mp:
      { id, comercio_id, venta_id: NULL, external_reference,
        mp_order_id, qr_data, monto, metodo: 'qr',
        estado: 'pendiente', creado_por, creado_en,
        expira_en: now() + interval '10 minutes',
        items_payload (jsonb) }
   h. Devolver al cliente:
      { intento_id, qr_data, expira_en, checkout_url?  }

4. Frontend renderiza:
   - QR grande (qr_data).
   - Monto.
   - Timer descendente (10 min).
   - Botón secundario "Compartir link" → genera link de pago (ver §5.3).
   - Botón "Cancelar" → PATCH /api/mp/cobros/:id { estado: 'cancelado' }.

5. Frontend suscribe a:
   - Supabase Realtime sobre intentos_cobro_mp filtrado por id=<intento_id>.
   - Polling cada 2s a GET /api/mp/cobros/:id (failsafe).

6. Cliente escanea el QR con app MP → confirma → MP procesa.

7. MP manda webhook a https://app.sylvora.com.ar/api/mp/webhook:
   - Headers incluyen x-signature (HMAC).
   - Body: { id, type: "payment", action: "payment.created", user_id, data: { id: payment_id } }

8. Backend webhook handler:
   a. Validar firma HMAC con SYLVORA_MP_WEBHOOK_SECRET. Si falla → 401.
   b. Buscar mp_credenciales WHERE user_id_mp = body.user_id.
      Si no existe → 200 OK silently (no es nuestro comercio, ignorar).
   c. GET https://api.mercadopago.com/v1/payments/<payment_id>
      headers: Authorization: Bearer <access_token>
      → leer status, external_reference, status_detail, transaction_amount.
   d. Buscar intentos_cobro_mp WHERE external_reference = payment.external_reference.
      Si no existe → loguear "cobro MP sin intento Sylvora" para conciliación + 200.
   e. Validar monto: si payment.transaction_amount != intento.monto → loguear + 200.
   f. Si status='approved': llamar a RPC aprobar_cobro_mp_y_crear_venta(intento_id, payment_id).
   g. Si status='rejected' o 'cancelled': UPDATE intentos_cobro_mp SET estado='rechazado'.
   h. Si status='pending' o 'in_process': no cambiar estado (sigue pendiente).
   i. Devolver 200.

9. RPC aprobar_cobro_mp_y_crear_venta (atómica, SECURITY DEFINER):
   a. SELECT intento FOR UPDATE. Si estado != 'pendiente' → return (idempotente).
   b. INSERT ventas (desde items_payload del intento).
   c. INSERT items_venta (descontar stock via FIFO/FEFO, reusar la lógica existente).
   d. UPDATE intentos_cobro_mp SET estado='aprobado', mp_payment_id=<id>,
      pagado_en=now(), venta_id=<nueva venta id>.
   e. UPDATE ventas SET metodo_pago_mp_intento_id=intento_id.

10. Frontend (suscripto a realtime) detecta el cambio de estado → cierra modal,
    toast "Cobrado!", redirige al ticket impreso de la venta nueva.

11. Si pasan 10 minutos sin aprobación: marcar estado='expirado' (lazy:
    al próximo GET o al próximo intento del mismo comercio detectamos
    expira_en < now() y lo marcamos. No cron, no scheduler.)
    Frontend ve estado=expirado por polling → modal ofrece "Generar nuevo QR".
```

### 5.3 Cobro vía link de pago

Mismo backend que §5.2 pero el cliente arranca con `metodo: 'link'`. Devuelve un `checkout_url` en vez de `qr_data`. El comerciante copia el link y lo comparte por WhatsApp / SMS / mail.

Mientras tanto el modal muestra "Esperando pago" + botón "Copiar link" + mismo timer + mismo realtime/polling.

Cuando el cliente paga → webhook llega igual → mismo flujo.

### 5.4 Cancelación manual

Comerciante aprieta "Cancelar" en el modal:

```
1. Frontend → PATCH /api/mp/cobros/:id { accion: 'cancelar' }
2. Backend:
   a. SELECT intento FOR UPDATE. Si estado != 'pendiente' → 409.
   b. UPDATE intentos_cobro_mp SET estado='cancelado'.
   c. Best-effort: PUT /v1/orders/<mp_order_id> cancelando el order en MP.
      Si falla, no rollbackeamos. El intento queda cancelado en Sylvora
      aunque el order siga "abierto" en MP — si llega un webhook de pago
      después, se detecta en §5.5.
3. Frontend cierra el modal de cobro y vuelve al POS.
```

### 5.5 Edge case: cobro aprobado en MP pero Sylvora canceló

Cliente paga **justo después** de que el comerciante apretó "Cancelar". Webhook llega con status=approved.

```
En el handler webhook §5.2 paso h:
- SELECT intento por external_reference. Estado actual = 'cancelado'.
- NO ejecutar la RPC de creación de venta (estado no es 'pendiente').
- INSERT en tabla mp_cobros_huerfanos (ver §6.6):
  { intento_id, mp_payment_id, monto, motivo: 'cobro_aprobado_intento_cancelado' }
- Devolver 200.
```

En `/configuracion/mercado-pago` muestra una alerta amarilla:
> ⚠️ Hay 1 cobro MP que no se asoció a una venta. Revisá la conciliación.

El comerciante decide: registrar venta manual + reconciliar, o reembolsar al cliente desde MP.

### 5.6 Desconexión

Admin entra a `/configuracion/mercado-pago` → botón "Desconectar":

```
1. Modal de confirmación: "Si desconectás vas a dejar de poder cobrar
   con MP desde Sylvora. Los cobros pendientes que están en pantalla
   no van a poder confirmarse. ¿Continuar?"
2. Frontend → DELETE /api/mp/credenciales
3. Backend:
   a. SELECT mp_credenciales. Si no existe → 404.
   b. UPDATE intentos_cobro_mp SET estado='cancelado'
      WHERE comercio_id = ? AND estado = 'pendiente'.
   c. Best-effort: POST https://api.mercadopago.com/oauth/revoke
      con client_id + client_secret + token=access_token.
   d. DELETE FROM mp_credenciales WHERE comercio_id = ?.
   e. Devolver 200.
```

---

## 6. Detalles de implementación

### 6.1 PKCE flow

```
code_verifier  = base64url(crypto.randomBytes(32))   // 256 bits
code_challenge = base64url(sha256(code_verifier))
challenge_method = "S256"
```

`code_verifier` se guarda en cookie httpOnly + secure + sameSite=lax, expira en 10 min. El callback lo recupera para el exchange.

### 6.2 Refresh proactivo de access token

En `POST /api/mp/cobros`, antes de generar el order:

```
if (credenciales.expira_en - now() < interval '7 days') {
   await refrescarToken(credenciales)
}
```

`refrescarToken` hace `POST /oauth/token` con `grant_type=refresh_token` y reemplaza access_token + refresh_token + expira_en en `mp_credenciales`. Si falla:
- Si el error es `invalid_grant` (refresh_token revocado / expirado): marcar credencial como `inválida` y devolver 412 al cliente con mensaje "Tenés que reconectar MP".
- Si es error de red: dejar el token viejo (sigue válido por 7 días), reintentar en próximo cobro.

### 6.3 Cifrado de tokens

```
SYLVORA_MP_TOKENS_ENC_KEY=<32 bytes hex>  // 256 bits

function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${enc.toString('base64')}.${tag.toString('base64')}`
}
```

Rotación de la clave = redeploy + script de re-cifrado one-off para `mp_credenciales`. Documentar en runbook.

**Nunca loguear** plaintext. Nunca mandar al cliente. Nunca incluir en errores que el frontend pueda ver.

### 6.4 Idempotencia

Tres niveles:

1. **Creación de Order**: `X-Idempotency-Key` UUID v4 por intento. Se guarda en `intentos_cobro_mp.idempotency_key`. Si el frontend reintenta el POST `/api/mp/cobros` con el mismo carrito (decisión: detectarlo o no), reusar el intento pendiente del mismo comercio si existe.
2. **Webhook**: la combinación `(mp_payment_id, action)` es la key. Tabla `mp_webhook_logs` con UNIQUE constraint sobre `(mp_payment_id, action)`. Si llega duplicado, devolvemos 200 sin reprocesar.
3. **RPC `aprobar_cobro_mp_y_crear_venta`**: `SELECT FOR UPDATE` + check `estado='pendiente'`. Si ya está aprobado, no hace nada (no doble venta, no doble descuento de stock).

### 6.5 Validación de firma de webhook

MP firma con HMAC-SHA256. Header `x-signature` viene como `ts=<timestamp>,v1=<hash>`.

```
manifest = `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
expected = hmac_sha256(SYLVORA_MP_WEBHOOK_SECRET, manifest)
if (expected !== v1) reject 401
```

Si la firma falla → log + 401 (no 200) para que MP marque el endpoint como problemático y reintente. Si la firma OK pero el resto falla → 200 silently (no queremos retries en bucle).

### 6.6 Detección de cobros huérfanos

Tabla `mp_cobros_huerfanos`:

```sql
CREATE TABLE mp_cobros_huerfanos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id     uuid NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  mp_payment_id   bigint NOT NULL,
  intento_id      uuid REFERENCES intentos_cobro_mp(id),
  monto           numeric NOT NULL,
  motivo          text NOT NULL CHECK (motivo IN (
                    'cobro_aprobado_intento_cancelado',
                    'cobro_aprobado_intento_expirado',
                    'cobro_aprobado_sin_intento',
                    'monto_no_coincide'
                  )),
  detalle         jsonb,
  detectado_en    timestamptz NOT NULL DEFAULT now(),
  resuelto_en     timestamptz,
  resuelto_por    uuid REFERENCES perfiles(id)
);
```

Mostrar contador en `/configuracion/mercado-pago` como alerta. UI completa de conciliación → V1.5.

---

## 7. Modelo de datos final

### 7.1 `mp_credenciales`

```sql
CREATE TABLE mp_credenciales (
  comercio_id           uuid PRIMARY KEY REFERENCES comercios(id) ON DELETE CASCADE,

  -- Tokens (cifrados con AES-256-GCM, formato iv.cipher.tag base64)
  access_token_enc      text NOT NULL,
  refresh_token_enc     text NOT NULL,

  -- Identidad MP del comerciante
  user_id_mp            bigint NOT NULL UNIQUE,  -- el seller_id en MP (campo "user_id" del webhook)
  public_key            text NOT NULL,
  nickname_mp           text,                    -- para mostrar "Conectado como X"

  -- Store + POS creados en onboarding (necesarios para Orders API)
  store_id_mp           text NOT NULL,
  external_pos_id       text NOT NULL UNIQUE,    -- "sylvora_<comercio_id>_pos1"

  -- Lifecycle
  expira_en             timestamptz NOT NULL,
  estado                text NOT NULL DEFAULT 'activa'
                        CHECK (estado IN ('activa','invalida','desconectada')),

  conectado_en          timestamptz NOT NULL DEFAULT now(),
  conectado_por         uuid REFERENCES perfiles(id),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);
```

RLS:

```sql
-- Solo admin del comercio puede leer / escribir.
CREATE POLICY mp_credenciales_admin ON mp_credenciales
  FOR ALL
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');
```

El webhook handler usa **service role** (no tiene cookie de admin) y matchea por `user_id_mp` — no via RLS.

### 7.2 `intentos_cobro_mp`

```sql
CREATE TABLE intentos_cobro_mp (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id           uuid NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,

  -- Venta asociada (NULL hasta que se aprueba)
  venta_id              uuid REFERENCES ventas(id) ON DELETE SET NULL,
  items_payload         jsonb NOT NULL,       -- snapshot del carrito (productos, precios, cantidades)

  -- Identificadores MP
  external_reference    text NOT NULL UNIQUE, -- "sylvora_<comercio_id>_<uuid>"
  idempotency_key       text NOT NULL UNIQUE,
  mp_order_id           text,                 -- de la Orders API
  mp_payment_id         bigint,               -- llega con el webhook

  -- Datos del cobro
  monto                 numeric(12,2) NOT NULL CHECK (monto > 0),
  metodo                text NOT NULL CHECK (metodo IN ('qr','link')),
  qr_data               text,                 -- para metodo='qr'
  checkout_url          text,                 -- para metodo='link' (y opcionalmente para 'qr')

  -- Estado
  estado                text NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','aprobado','rechazado','cancelado','expirado')),
  mp_status_detail      text,                 -- detalle de MP para debug
  pagado_en             timestamptz,

  -- Lifecycle
  creado_por            uuid NOT NULL REFERENCES perfiles(id),
  creado_en             timestamptz NOT NULL DEFAULT now(),
  expira_en             timestamptz NOT NULL,
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intentos_cobro_mp_comercio_estado_idx
  ON intentos_cobro_mp(comercio_id, estado, creado_en DESC);

CREATE INDEX intentos_cobro_mp_external_ref_idx
  ON intentos_cobro_mp(external_reference);
```

RLS:

```sql
-- Read: cualquier rol con venta.crear del comercio puede ver sus intentos.
-- En la práctica el filtro es por comercio_id; el rol se valida en endpoint.
CREATE POLICY intentos_cobro_mp_read ON intentos_cobro_mp
  FOR SELECT USING (comercio_id = get_comercio_id());

-- Write: solo via endpoints server (que usan service role). Los usuarios
-- nunca insertan/actualizan estos rows directamente — la lógica de estado
-- es delicada.
-- Para defensa en profundidad, permitir INSERT desde admin/encargado/cajero:
CREATE POLICY intentos_cobro_mp_insert ON intentos_cobro_mp
  FOR INSERT WITH CHECK (comercio_id = get_comercio_id());

-- No UPDATE/DELETE policy → solo service role puede modificar.
```

### 7.3 `mp_webhook_logs` (idempotencia + auditoría)

```sql
CREATE TABLE mp_webhook_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id   bigint,
  user_id_mp      bigint,
  action          text NOT NULL,
  body            jsonb NOT NULL,
  procesado_en    timestamptz NOT NULL DEFAULT now(),
  resultado       text NOT NULL CHECK (resultado IN ('ok','firma_invalida','sin_credencial','sin_intento','huerfano','error')),
  detalle         text
);

CREATE UNIQUE INDEX mp_webhook_logs_uniq
  ON mp_webhook_logs(mp_payment_id, action);
```

Sin RLS (solo accedido desde service role). Retención: 90 días vía cron / RPC manual (V1.5).

### 7.4 `mp_cobros_huerfanos`

Ver §6.6.

### 7.5 Modificación a `ventas`

```sql
ALTER TABLE ventas
  ADD COLUMN metodo_pago_mp_intento_id uuid REFERENCES intentos_cobro_mp(id);
```

No reemplaza `metodo_pago` text existente — es metadata adicional para ventas pagadas con MP.

### 7.6 Nuevo Permission

`lib/permissions.ts`:

```ts
export type Permission =
  | ...
  | 'mp.gestionar'   // admin only — conectar/desconectar MP
```

Solo admin lo tiene. `venta.crear` ya cubre el flujo de cobro.

---

## 8. Estados del intento de cobro

```
                ┌─────────────┐
                │  pendiente  │ ← creado por POST /api/mp/cobros
                └─────┬───────┘
                      │
        ┌─────────────┼─────────────┬──────────────┐
        ▼             ▼             ▼              ▼
   ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │aprobado │  │rechazado │  │cancelado │  │ expirado │
   └─────────┘  └──────────┘  └──────────┘  └──────────┘
   webhook       webhook       comerciante   10 min sin
   approved      rejected/     o desconexión actividad
                 cancelled
```

Transiciones permitidas (todas con `WHERE estado='pendiente'`):

| Trigger | De | A |
|---|---|---|
| Webhook `status=approved` | pendiente | aprobado |
| Webhook `status=rejected/cancelled` | pendiente | rechazado |
| PATCH cancelar | pendiente | cancelado |
| Lazy check `expira_en < now()` | pendiente | expirado |
| Desconexión de credencial | pendiente | cancelado |

**Ningún estado terminal cambia.** Si llega webhook `approved` después de `cancelado` o `expirado`, no se reabre — se loguea como huérfano.

---

## 9. Endpoints

| Método | Ruta | Auth | Body | Response | Notas |
|---|---|---|---|---|---|
| `GET` | `/api/mp/oauth/start` | Admin cookie + `mp.gestionar` | — | 302 redirect | Genera PKCE + state. |
| `GET` | `/api/mp/oauth/callback` | Admin cookie + state cookie | — | 302 redirect a `/configuracion/mercado-pago` | Exchange + Store/POS + INSERT. |
| `GET` | `/api/mp/credenciales` | Admin cookie + `mp.gestionar` | — | `{ conectado: bool, nickname?, expira_en?, huerfanos_count? }` | Resumen para la UI. Nunca devuelve tokens. |
| `DELETE` | `/api/mp/credenciales` | Admin cookie + `mp.gestionar` | — | `{ ok: true }` | Desconectar. |
| `POST` | `/api/mp/cobros` | `venta.crear` | `{ monto, items, metodo: 'qr'\|'link' }` | `{ intento_id, qr_data?, checkout_url?, expira_en }` | Crea Order en MP. |
| `GET` | `/api/mp/cobros/:id` | `venta.crear`, mismo comercio | — | `{ estado, mp_status_detail?, venta_id?, expira_en, ... }` | Polling fallback. |
| `PATCH` | `/api/mp/cobros/:id` | `venta.crear`, mismo comercio | `{ accion: 'cancelar' }` | `{ ok: true }` | Cancelación manual. |
| `POST` | `/api/mp/webhook` | Firma HMAC | MP payload | 200 / 401 | Handler. |

### 9.1 Códigos de error específicos

| Código | Cuándo | Mensaje al usuario |
|---|---|---|
| 400 | Body inválido en `/api/mp/cobros` | "Revisá los datos del cobro." |
| 401 | Webhook con firma inválida | (silent, log) |
| 403 | Caller no tiene permission | "No tenés permiso para esto." |
| 404 | Intento no existe / no es del comercio | "Cobro no encontrado." |
| 409 | Transición de estado inválida (cancelar uno ya aprobado) | "Este cobro ya está cerrado." |
| 412 | Comercio sin `mp_credenciales` o `estado='invalida'` | "Conectá tu cuenta MP antes de cobrar." |
| 422 | Monto <= 0 | "El monto tiene que ser mayor a 0." |
| 500 | Falla de MP API | "MP no respondió. Probá de nuevo." |
| 503 | Refresh de token falla por red | "Reintentá en unos segundos." |

---

## 10. UX dentro del POS

### 10.1 Selector de método de pago

POS hoy tiene tabs: Efectivo, Tarjeta (manual), Otro. Agregamos tab **Mercado Pago**.

Estado visual del tab:
- **Conectado**: tab habilitado con icono MP.
- **No conectado**: tab oculto (no aparece). En "Otro" agregamos micro-copy: "¿Querés cobrar con MP? [Conectá tu cuenta]" (link a `/configuracion/mercado-pago` — solo visible para admin).
- **Credencial inválida**: tab aparece pero al click muestra modal "Tu cuenta MP necesita reconectarse" + link.

### 10.2 Modal de cobro `CobroMpModal`

Layout vertical, móvil-friendly:

```
┌────────────────────────────────────────┐
│ Cobrar $4.250                       ✕ │
├────────────────────────────────────────┤
│                                        │
│         ┌──────────────────┐           │
│         │                  │           │
│         │     [QR aquí]    │           │
│         │                  │           │
│         └──────────────────┘           │
│                                        │
│    Que el cliente escanee con          │
│    su app de Mercado Pago              │
│                                        │
│    Vence en 9:42                       │
│                                        │
├────────────────────────────────────────┤
│  ¿No tiene la app?                     │
│  [ Compartir link de pago ]            │
├────────────────────────────────────────┤
│  [Cancelar]                            │
└────────────────────────────────────────┘
```

Estados:
- **Generando** (mientras llega response del backend): skeleton del QR + texto "Generando QR…"
- **Pendiente**: como arriba.
- **Aprobado**: animación de check + "¡Cobrado!" + auto-close en 2s → ticket impreso.
- **Rechazado**: "El pago fue rechazado." + botón "Generar nuevo QR".
- **Expirado**: "El QR venció." + botón "Generar nuevo QR".
- **Cancelado por admin** (desconexión durante cobro): "Se desconectó MP." + cerrar.

### 10.3 `/configuracion/mercado-pago`

Estados:
1. **No conectado**:
   - Hero copy: "Cobrá con QR de MP desde tu POS. El cliente escanea, vos confirmás y la venta queda registrada."
   - Botón "Conectar con Mercado Pago".
   - Lista de bullets: "Sin hardware extra · El dinero va directo a tu cuenta MP · Sylvora no cobra comisión".
2. **Conectado**:
   - Estado: "Conectado como <nickname MP>" + checkmark verde.
   - Info: "Token vence el <fecha>. Lo renovamos solos cuando falten 7 días."
   - Botón "Desconectar" (gris, requiere confirmación).
   - Alerta amarilla SI `huerfanos_count > 0`: "Hay {N} cobros sin asociar a una venta. Te avisamos cuando tengamos el panel de conciliación (próxima versión)."
3. **Credencial inválida**:
   - Banner rojo: "Tu conexión con MP venció o fue revocada. Reconectá para seguir cobrando."
   - Botón "Reconectar".

---

## 11. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|:-:|:-:|---|
| 1 | Webhook no llega (firewall / Vercel downtime) | Media | Alto | Polling 2s + búsqueda activa `GET /payments/search?external_reference=...` al expirar el timer. |
| 2 | Doble cobro al cliente (regenerar QR sin cancelar el anterior) | Media | Alto | El POST `/api/mp/cobros` con un intento `pendiente` activo del mismo comercio (mismo carrito): reusar el intento existente. |
| 3 | Access token cifrado se filtra | Baja | Crítico | Cifrado AES-256-GCM + clave en env nunca en repo. No log en plain. |
| 4 | Refresh token revocado (comerciante desautorizó desde MP web) | Media | Medio | Detectar `invalid_grant` → marcar `estado='invalida'` → UI muestra "Reconectá". |
| 5 | Race condition: webhook + polling actualizan estado simultáneo | Alta | Bajo | `SELECT FOR UPDATE` en la RPC + `WHERE estado='pendiente'`. Idempotente. |
| 6 | MP changes API contract | Baja | Alto | Versionar `lib/mp/client.ts`. Monitorear changelogs MP. Tener tests E2E en sandbox. |
| 7 | Comerciante hace POS y le sale "Conectá MP" sin entender qué es | Alta | Bajo | Empty state explícito + onboarding wizard en 1 click. |
| 8 | Cliente cierra app MP a mitad del pago | Alta | Bajo | MP no genera webhook si no se completó. Intento queda pendiente hasta timeout. |
| 9 | Comerciante cobra en MP por afuera (cuenta MP propia) en simultáneo | Baja | Bajo | Se registra como huérfano. UI alerta. |
| 10 | Stock se descuenta dos veces (race entre RPC y otra venta) | Baja | Alto | RPC ya tiene `FOR UPDATE` sobre productos y lotes (reusa la lógica de venta atómica). |
| 11 | `external_pos_id` colisiona | Muy baja | Medio | UNIQUE constraint + formato `sylvora_<uuid>_pos1`. Si colisiona, regenerar con sufijo. |
| 12 | Certificación de calidad MP arroja items mandatory desconocidos | Media | Medio | Correr la herramienta en sandbox antes de cerrar el sprint. Buffer de 1 día para fixes. |
| 13 | Sandbox de MP no soporta Orders API completa | Baja | Alto | Probar día 1. Si falla, escalar a soporte MP. Plan B: validar con cuenta real de test con CUIT del owner. |

---

## 12. Checklist de QA

### 12.1 Onboarding

- [ ] Admin entra a `/configuracion/mercado-pago` por primera vez → ve "No conectado" + CTA claro.
- [ ] Click "Conectar" → redirige a MP login.
- [ ] Login con cuenta de test MP → MP redirige al callback.
- [ ] Callback termina OK → ve estado "Conectado" + nickname correcto.
- [ ] DB: `mp_credenciales` tiene 1 row, tokens cifrados, store_id_mp y external_pos_id presentes.
- [ ] MP dashboard del seller: aparece un Store "<nombre> — Sylvora" con 1 POS.
- [ ] Refresh de la página → sigue "Conectado".
- [ ] State CSRF: manipular `state` en la URL del callback → 400 sin crear credencial.
- [ ] Tab abierto en 2 lugares + autorizar en uno → el otro tab al callback dice "ya está conectado".
- [ ] Encargado intenta entrar a `/configuracion/mercado-pago` → ve "Sin acceso" (page guard).
- [ ] Cajero idem.

### 12.2 Cobro QR

- [ ] POS armado con 1 producto + monto > 0 + comercio con MP conectado → tab "MP" disponible.
- [ ] Click "Cobrar con MP" → modal abre + QR aparece en <3s.
- [ ] DB: `intentos_cobro_mp` tiene row con estado='pendiente', external_reference, mp_order_id.
- [ ] Cliente test escanea QR con app MP test → confirma pago.
- [ ] Webhook llega → en <5s el modal cambia a "Cobrado" → cierra → ticket impreso.
- [ ] DB: `intentos_cobro_mp.estado='aprobado'`, `venta_id` apuntando a una venta nueva.
- [ ] Stock descontado correctamente del producto vendido (FIFO/FEFO si tiene lotes).
- [ ] Realtime detecta el cambio (no solo polling).

### 12.3 Cobro Link

- [ ] Modal abierto en QR → botón "Compartir link" → toast con URL copiada.
- [ ] Abrir URL en otro browser → checkout MP completo.
- [ ] Pagar → webhook → mismo flow que QR.

### 12.4 Cancelación y errores

- [ ] Cancelar manualmente desde el modal → `estado='cancelado'`.
- [ ] Pagar después de cancelar → genera huérfano + alerta en `/configuracion/mercado-pago`.
- [ ] Esperar 10 min sin pagar → próximo polling lo marca expirado → modal ofrece "Nuevo QR".
- [ ] Cobro rechazado en MP (tarjeta sin saldo en sandbox) → webhook con `rejected` → estado='rechazado' → modal muestra "rechazado" + "Nuevo QR".

### 12.5 Webhook handler

- [ ] Webhook con firma inválida → 401 + log.
- [ ] Webhook duplicado (mismo `mp_payment_id, action`) → 200, no reprocesa (idempotente).
- [ ] Webhook de un `user_id_mp` desconocido → 200 silently, log.
- [ ] Webhook con `external_reference` que no matchea ningún intento → registrado como huérfano "cobro_aprobado_sin_intento".
- [ ] Webhook con monto distinto al intento → huérfano "monto_no_coincide".

### 12.6 Refresh de token

- [ ] Setear `expira_en` a `now() + 6 days` manualmente en DB → próximo `/api/mp/cobros` dispara refresh → DB tiene token nuevo + nueva fecha.
- [ ] Revocar el grant en el dashboard MP del seller → próximo `/api/mp/cobros` → 412 "Reconectá MP" + estado='invalida' en DB.

### 12.7 Desconexión

- [ ] Click "Desconectar" con intento pendiente abierto en otro tab → modal del cobro se cierra con mensaje + intento queda `cancelado`.
- [ ] DELETE `/api/mp/credenciales` → revoca el token en MP (best-effort) + borra row.
- [ ] Después de desconectar, el tab "MP" en POS desaparece.

### 12.8 Seguridad

- [ ] Encargado no puede llamar `POST /api/mp/credenciales/...` (RLS + endpoint guard).
- [ ] Cajero puede crear intento de cobro pero NO puede ver `mp_credenciales` (RLS).
- [ ] Logs de Vercel: no aparece access_token plaintext en ningún sitio.
- [ ] Logs de Vercel: no aparecen secrets de Sylvora (client_secret, webhook secret, enc key).
- [ ] Comercio A no puede ver intentos de comercio B (RLS).
- [ ] Webhook handler nunca devuelve data sensible al payload — solo 200 / 401.

### 12.9 Certificación MP

- [ ] Correr la integration quality measurement en sandbox.
- [ ] Atender todos los items "mandatory".
- [ ] Guardar el reporte en `docs/mp-quality-report.md`.

---

## 13. Criterios de aceptación

El sprint se considera **completo** cuando:

1. Un admin nuevo puede conectar su cuenta MP en <2 minutos desde un comercio nuevo, sin instrucciones externas.
2. Un cajero puede generar un QR y cobrar un ticket en <30 segundos desde que aprieta "Cobrar con MP".
3. La venta queda registrada correctamente con stock descontado en cuanto MP confirma el pago.
4. Si el webhook falla (simulado bloqueando la URL), el polling de fallback detecta el pago en <10s adicionales.
5. Si el cliente no paga, no se gasta stock ni se crea venta.
6. No hay forma de que un cajero acceda a tokens MP en plain (verificado por code review y por logs).
7. La integration quality measurement de MP pasa todos los items "mandatory" en sandbox.
8. La documentación de runbook en `docs/mp-runbook.md` cubre: conectar en prod, rotar enc key, debug webhook, reconectar credencial inválida.

---

## 14. Out of scope V1

Documentado para no perderlo — todos van a sprints futuros:

- **Point hardware** (terminales físicas MP con tarjeta + NFC). V2 si hay demanda.
- **Suscripciones**: cobrar Sylvora SaaS al comerciante con MP recurrente. Sprint propio.
- **Marketplace formal con split**: si en algún momento Sylvora quiere cobrar fee. Requiere acuerdo con MP. **No es opción A.**
- **Reembolsos / devoluciones** desde Sylvora. V1 = el comerciante reembolsa desde su MP web.
- **Notas de crédito y anulaciones contables**: requiere AFIP integration.
- **Multi-cuenta MP por comercio** (1 cuenta para tarjeta, otra para QR). YAGNI.
- **Panel completo de conciliación**. V1 = solo alerta de "hay N huérfanos". V1.5 = panel con resolución.
- **Cron de expiración de intentos**: V1 = lazy. V1.5 = cron horario que limpia.
- **Webhook retry desde nuestro lado**: V1 = confiamos en los retries de MP (hasta 5 con backoff).
- **Reportes financieros consolidados**: requiere `settlements` API de MP. V2.

---

## 15. Plan de commits

| # | Commit | Cambia | Riesgo | Tiempo |
|---|---|---|---|---|
| 1 | **Spec doc** | `docs/mercado-pago-cobros-spec.md` (este). | Nulo | 0.5d |
| 2 | **Migración SQL** | `scripts/migration-mp-cobros-v1.sql`: `mp_credenciales`, `intentos_cobro_mp`, `mp_webhook_logs`, `mp_cobros_huerfanos`, ALTER `ventas`, RLS, RPC `aprobar_cobro_mp_y_crear_venta`. Idempotente. | Medio | 0.5d |
| 3 | **Env + cifrado + permission** | `.env.example` con nuevas vars. `lib/mp/crypto.ts`. `lib/permissions.ts` con `mp.gestionar`. Sidebar oculta `/configuracion/mercado-pago` si no es admin. | Bajo | 0.5d |
| 4 | **OAuth onboarding** | `/api/mp/oauth/start`, `/callback`, `/api/mp/credenciales` GET/DELETE. `/configuracion/mercado-pago` page con los 3 estados. Store + POS creation. | Alto | 1.5d |
| 5 | **Crear intento de cobro** | `lib/mp/client.ts`, `lib/mp/orders.ts`. `POST /api/mp/cobros`. Refresh proactivo. | Alto | 1d |
| 6 | **Webhook handler** | `POST /api/mp/webhook` con validación firma + idempotencia + match user_id + RPC call. | Alto | 1d |
| 7 | **GET / PATCH cobros** | `/api/mp/cobros/:id` para polling + cancelación. | Bajo | 0.5d |
| 8 | **UI POS — modal de cobro** | `CobroMpModal.tsx`. Tab "MP" en `POSPayment`. `useMpCobroEstado` hook (realtime + polling). | Medio | 1d |
| 9 | **Cierre de venta post-cobro** | Wireado fino con `crear_venta`. Manejo de aprobado/rechazado/expirado/cancelado en UI. | Medio | 0.5d |
| 10 | **Cobros huérfanos básico** | Alerta en `/configuracion/mercado-pago` con contador. UI plena → V1.5. | Bajo | 0.5d |
| 11 | **Certificación MP + runbook** | Correr quality measurement en sandbox. `docs/mp-runbook.md` con procedimientos prod. | Medio | 0.5d |

**Total estimado: 7-8 días Claude.**

Los commits **4, 5, 6** son los más sensibles (touch real con MP API y manejo de secrets). Se pueden subdividir si aparecen edge cases.

---

## 16. Glosario

| Término | Significado |
|---|---|
| **Comerciante / seller** | Usuario MP con cuenta de cobros (cuenta personal o de empresa). En Sylvora, el dueño del comercio. |
| **Sylvora MP app** | Una app registrada por Sylvora en MP Developers. 1 client_id + 1 client_secret para toda la plataforma. |
| **OAuth marketplace flow** | Pattern donde una app conecta múltiples cuentas de seller vía OAuth. Cada seller autoriza individualmente. |
| **Access token** | Token de autorización del seller. 180 días de vida. Permite a Sylvora actuar en nombre del seller (crear orders, leer payments). |
| **Refresh token** | Token de larga vida para obtener un nuevo access_token sin re-OAuth. |
| **Order (Orders API)** | Objeto MP que representa una intención de cobro. Tiene un QR data + payment lifecycle. |
| **Payment** | Objeto MP que representa un cobro concreto. Se crea cuando el cliente paga. Triggerea el webhook. |
| **Store / POS** | Entidades MP que organizan los puntos de venta del seller. Sylvora crea 1 store + 1 pos por comercio en el onboarding. |
| **external_reference** | Identificador nuestro que mandamos a MP y nos vuelve en el webhook. Sirve para matchear payment ↔ intento. |
| **external_pos_id** | ID del POS Sylvora en MP. Obligatorio en cada Order. |
| **Intento de cobro** | Entidad Sylvora pre-venta. Tiene estados (pendiente, aprobado, etc.) y se asocia a una venta cuando se aprueba. |
| **Huérfano** | Cobro MP aprobado que Sylvora no pudo asociar a una venta (intento cancelado/expirado, monto distinto, etc.). |
| **PKCE** | Proof Key for Code Exchange. Mejora de seguridad sobre OAuth Authorization Code Flow. |

---

## 17. Histórico de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-06-07 | Versión inicial (Commit 1). | — |
| 2026-06-09 | Agregar estado `requiere_revision` (Commit 12a). | — |
| 2026-06-09 | Body MP `/v1/orders` ahora exige `transactions`. | — |
| 2026-06-13 | Cierre E2E: `manual_sandbox` queda limitado a preview/dev, QR Orders no acepta `notification_url`, y el flujo depende del polling canónico de Orders cuando el webhook no llega. | — |

---

## 19. Schema de Orders API — `transactions` obligatorio

### Hallazgo

Probando manual_sandbox, MP rechazó la primera Order con HTTP 400:

```json
{ "errors": [{ "code": "required_properties", "message": "Missing properties",
               "details": ["missing properties: '$.transactions'"] }] }
```

El spec original de Sylvora (sep 2025) tenía el body sin `transactions`.
Entre la versión beta de la doc y el release actual, MP agregó
`transactions` como obligatorio.

### Body actualizado para QR dinámico V1

```json
{
  "type": "qr",
  "total_amount": "3000.00",
  "external_reference": "sy_<uuid>",
  "config": {
    "qr": {
      "external_pos_id": "<external_pos_id>",
      "mode": "dynamic"
    }
  },
  "transactions": {
    "payments": [
      { "amount": "3000.00" }
    ]
  }
}
```

### Invariante MP

```
total_amount === SUM(transactions.payments[].amount)
```

Sylvora manda **1 sola payment con el monto total** — no soportamos
splits en V1 (un solo cobro por intento). El `formatMontoMP()` se
reutiliza para ambos campos así no hay riesgo de discrepancia.

### Campos que NO mandamos

| Campo | Por qué |
|---|---|
| `transactions.payments[].payment_method_id` | MP lo resuelve cuando el cliente paga el QR. |
| `transactions.payments[].installments` | Idem — el cliente elige en su app MP. |
| `transactions.payments[].payer` | Idem. |
| `items` | Optional. Sylvora tiene items en su propia DB. |
| `expiration_time` | Optional ISO duration. Manejamos TTL server-side con `MP_INTENTO_TTL_MS`. |
| `marketplace_fee` | Optional. Opción A (sin comisión Sylvora). |
| `integration_data` | Optional. Lo agregamos cuando hagamos onboarding con MP Partners. |

---

## 20. Cierre manual_sandbox / preview

### Alcance

`MP_MODE=manual_sandbox` es un modo temporal para preview/dev con
credenciales de prueba. Está bloqueado en `MP_ENV=production` y no debe
usarse para comercios reales ni para deploys productivos.

### QR Orders y webhooks

El schema actual de `POST /v1/orders` para QR dinámico rechaza
`notification_url` con `additionalProperties '$.notification_url' not
allowed`. Por eso Sylvora no manda ese campo en Orders API.

En sandbox/manual_sandbox, el flujo E2E no depende de que Mercado Pago
entregue un webhook real. El polling de `GET /api/mp/cobros/:id`
consulta de forma canónica `GET /v1/orders/{order_id_mp}` cuando el
intento sigue `pendiente`, y actualiza el intento a `aprobado` o
`rechazado` según el estado de la Order y su payment.

### Logs de producción

Los logs productivos deben conservar:

- creación de intento/Order sin payload QR ni tokens;
- actualización de estado por polling o webhook;
- errores de MP/Supabase con códigos y request ids cuando existan.

No deben loguear:

- access tokens, refresh tokens, secrets o claves de cifrado;
- `qr_data`, previews de QR, raw body completo del webhook;
- response completo de Mercado Pago salvo errores 4xx sanitizados.

---

## 18. Estado `requiere_revision` (Commit 12a)

### Por qué existe

El flujo "MP aprueba → frontend dispara `crear_venta`" puede fallar
después del pago aprobado:

- Stock cambió mid-cobro (otro cajero vendió el producto en paralelo).
- RPC error transitorio.
- Conectividad del POS interrumpida justo después del polling.

Cuando esto ocurre, **el dinero ya está en la cuenta MP del
comerciante** pero la venta no se registró en Sylvora. Sin un estado
explícito, la situación quedaría invisible y dependería de que el
comerciante "se acuerde" de que algo salió mal — inaceptable.

### Lifecycle actualizado

```
pendiente
    ├── aprobado ──┬── (crear_venta OK)            → asociado a venta
    │              └── requiere_revision  ← NUEVO  → resolución manual
    ├── rechazado
    ├── cancelado
    └── expirado
```

### Características

- **Terminal en V1**: una vez en `requiere_revision`, no hay transición
  automática. El admin lo resuelve fuera de la app (refund desde
  dashboard MP, ajuste manual de stock, etc.). Conciliación automática
  queda para V1.5.
- **Solo transiciona desde `aprobado`**: `marcarIntentoRequiereRevision`
  hace UPDATE atómico `WHERE estado='aprobado'`. Cualquier otro estado
  origen indica bug del caller.
- **Webhook lo respeta como final**: incluido en `FINAL_STATES` del
  handler. Un webhook posterior con el mismo payment no reprocesa.
- **mp_status_detail guarda el motivo**: truncado a 200 chars para no
  explotar la columna con stack traces.

### Quién dispara

**Solo el frontend**, vía endpoint `POST /api/mp/cobros/:id/requiere-revision`
con `{ motivo }`. Razón: solo el frontend invoca `crear_venta` y sabe
si falló. La RPC de ventas se mantiene desacoplada de MP (no debería
saber que existe).

### UX al cajero

Cuando el frontend recibe error de `crear_venta` después de un cobro
aprobado:
1. Llama al endpoint con motivo descriptivo (ej. "stock_insuficiente_post_aprobado").
2. Muestra alerta crítica bloqueante: "Mercado Pago cobró pero la venta
   no pudo registrarse. Avisá al administrador."
3. El intento queda visible en la base con estado `requiere_revision`
   y el motivo en `mp_status_detail`.

### UX al admin (V1)

V1: el admin descubre el caso por canal manual (cajero le avisa,
revisión periódica de la DB, etc.). V1.5: panel `/configuracion/
mercado-pago/revision` que lista los intentos en este estado.

### Migración

`scripts/migration-mp-intentos-requiere-revision.sql` — idempotente,
solo agrega el valor al CHECK constraint.
