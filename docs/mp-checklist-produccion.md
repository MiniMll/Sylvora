# Checklist de producción — Mercado Pago (hallazgos M1 + R2)

Cierre de los hallazgos **M1** (limpieza pre-producción de sandbox/bypass) y
**R2** (RPC legacy) de `qa-auditoria-integral-2026-07.md`. Último ítem del
Sprint QA-1.

Método: **[V]** verificado contra el código · **[I]** por inspección /
requiere acción o verificación manual en el entorno real.

**Conclusión de fondo:** el código **ya es seguro para producción por
construcción**. Todo lo sandbox/bypass está detrás de hard-guards que exigen
`MP_ENV=sandbox` + `MP_MODE=manual_sandbox` y nunca se activan en producción.
La "limpieza" es por eso **mínima**: una acción de base de datos (R2), higiene
de variables de entorno, un **guard fail-loud de arranque** que aborta el
deploy si la config de prod es insegura, y un smoke que fija el comportamiento.
**No se borra código sandbox** (justificado abajo).

---

## 1. Auditoría — inventario de código sandbox / bypass / temporal

| Elemento | Ubicación | Qué es | ¿Solo dev? | Guard de producción |
|---|---|---|---|---|
| `MP_ENV` | `lib/mp/config.ts` `getMPEnv()` | selector de entorno (default `sandbox`) | No — define prod | — |
| `MP_MODE=manual_sandbox` | `lib/mp/token-provider.ts` | usa un token del env en vez de OAuth | **Sí** | `resolveManualSandbox` tira `mode_blocked` si `MP_ENV=production` **[V]** |
| `MP_SANDBOX_*` (4 vars) | token-provider + webhook-handler | token/user/pos/comercio manual | **Sí** | solo se leen dentro de `manual_sandbox`+`sandbox` **[V]** |
| `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX` | `lib/mp/webhook-handler.ts` | permite webhook sin firma válida | **Sí** | `unsignedAllowed` exige `sandbox`+`manual_sandbox`; en prod se ignora y se loguea `..._blocked_production` **[V]** |
| `getManualSandboxWebhookCredenciales` | webhook-handler | credenciales del webhook desde env | **Sí** | retorna `null` si `MP_ENV=production` **[V]** |
| bypass de firma (`canBypassSignature`) | webhook-handler | saltea el 401 de firma inválida | **Sí** | requiere `unsignedAllowed` (falso en prod) **[V]** |
| `buildLegacyExternalId` | `lib/mp/stores.ts` | reusa stores/POS creados con el esquema de external-id viejo | No — **compat**, no sandbox | — |
| Logs verbose del webhook/cobros | webhook-handler, cobros | tracing operativo estructurado (sin tokens) | No | — |
| RPC legacy `get_reporte_dashboard(text, text)` | Supabase (def en `migration-reportes-rpc.sql`) | firma V2 muerta (R2) | — | — |

### ¿Qué es exclusivo de desarrollo?
`MP_MODE=manual_sandbox`, las 4 `MP_SANDBOX_*`, `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX`
y los caminos que dependen de ellas (`resolveManualSandbox`,
`getManualSandboxWebhookCredenciales`, `canBypassSignature`). **Todos
hard-guardeados contra producción** — verificado en el código y en los smokes.

### ¿Eliminarlo rompe el flujo normal?
**No.** El flujo normal de producción usa OAuth (`resolveOAuth`) + webhook
**firmado** (`verifyMPWebhookSignature`). Ninguna de esas rutas toca el código
sandbox. Los smokes lo confirman (§5). Es decir: el flujo normal ya funciona
sin depender de nada de lo temporal — por eso la limpieza es segura.

---

## 2. Propuesta — limpieza mínima y segura

### Hacer ahora
1. **R2 — DROP de la RPC legacy.** Migración dedicada
   `scripts/migration-drop-reporte-dashboard-legacy.sql` (idempotente). El
   cliente ya llama solo la V3 de 6 args → la V2 `(text, text)` es superficie
   muerta. **Acción en Supabase (Tobias).**
2. **Higiene de env en producción.** En el entorno de producción de Vercel:
   `MP_ENV=production`, `MP_MODE=oauth` (o ausente → default oauth), y **NO
   setear** `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX` ni ninguna `MP_SANDBOX_*`. El
   código ya bloquea todo eso en prod; esto es defensa en profundidad para no
   depender del guard.
3. **Guard fail-loud de arranque** (`assertMPProductionConfig` en
   `lib/mp/config.ts`, invocado desde `instrumentation.ts`). Con
   `MP_ENV=production`, aborta el arranque del server con un mensaje claro si:
   `MP_MODE=manual_sandbox`, `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX=true`, hay
   alguna `MP_SANDBOX_*` presente, o falta una var obligatoria de prod. Reúne
   todos los problemas en un solo mensaje. En sandbox/dev es no-op. Los
   hard-guards runtime siguen como defensa en profundidad — esto es la primera
   línea, no la única. **Ya implementado y verde.**
4. **Smoke de guardrails** (`scripts/smoke-mp-prod-guardrails.ts`) — fija el
   comportamiento prod-safe del bypass **y del guard**. **Ya implementado y verde.**

### NO hacer ahora — y por qué (no se elimina sin justificar)
- **No borrar el código `manual_sandbox` / bypass / `MP_SANDBOX_*`:** está
  hard-guardeado, es la **única forma de testear MP en preview/dev sin OAuth
  real**, y el flujo normal no lo toca. Borrarlo es un cambio aparte, para
  cuando OAuth esté probado estable en producción (el propio M1 dice
  "considerar borrar el bypass cuando OAuth real esté estable"). Mientras
  tanto, la higiene de env (punto 2) lo mantiene inerte en prod.
- **No borrar `buildLegacyExternalId`:** es compat de onboarding MP (no
  sandbox). Removerlo arriesga **duplicar stores/POS** en MP para comercios
  conectados con el esquema de id viejo. Costo de mantenerlo: un lookup extra
  solo cuando el id legacy difiere. Se mantiene.
- **No borrar los logs verbose:** dan observabilidad temprana durante los
  pilotos (diagnóstico de cobros MP). No filtran tokens ni datos
  cross-comercio (verificado en `smoke-mp-webhook-handler` test 14). Gatearlos
  o reducirlos conviene **post-piloto**, no ahora.


---

## 3. Riesgos

| Elemento | Riesgo de eliminarlo | Cómo verificar |
|---|---|---|
| RPC legacy `get_reporte_dashboard(text, text)` | **Bajo.** Ningún cliente la llama (el código usa la V3 de 6 args). | `grep` de `get_reporte_dashboard(` en el repo → solo la llamada V3 en `reportes.ts`. Post-DROP: `/reportes` carga normal + query a `pg_proc` deja 1 sola firma (§7). |
| `MP_MODE=manual_sandbox` (código) | **Medio.** Se pierde testear MP en preview sin OAuth. No afecta prod. | Smoke `token-provider` (manual_sandbox bloqueado en prod) + `prod-guardrails`. No se elimina → riesgo evitado. |
| `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX` (código) | **Medio.** Se pierde el simulador de webhooks de MP en sandbox. No afecta prod. | `smoke-mp-prod-guardrails` casos 1–4. No se elimina → riesgo evitado. |
| `MP_SANDBOX_*` (código) | **Medio.** Idem: rompe el modo manual de preview. | Cubierto por los guards; no se elimina. |
| `buildLegacyExternalId` | **Alto.** Puede **duplicar** stores/POS en MP para comercios con id viejo. | Onboarding MP reusa el store en vez de crear uno nuevo (`store_reused_legacy_external_id` en logs). No se elimina. |
| Logs verbose | **Bajo** (funcional), pero **pierde observabilidad** en pilotos. | Revisar logs de Vercel durante los primeros cobros reales. No se elimina ahora. |
| Higiene de env en prod (no es "eliminar código") | **Nulo** — el código ya bloquea sandbox en prod; esto es belt-and-suspenders. | `smoke-mp-prod-guardrails` + revisar el scope Production de envs en Vercel. |

---

## 4. Archivos

**Nuevos:**
- `lib/mp/config.ts` **(modificado)** — agrega `assertMPProductionConfig()`.
- `instrumentation.ts` **(nuevo)** — invoca el guard al arrancar el server.
- `scripts/smoke-mp-prod-guardrails.ts` — smoke de guardrails (11 casos).
- `scripts/migration-drop-reporte-dashboard-legacy.sql` — DROP de R2.
- `docs/mp-checklist-produccion.md` — este documento.

**Sobre el runtime de producción:** el único cambio de código es **aditivo** —
un guard de arranque que valida la config y NO altera ninguna ruta ni lógica
existente de cobro/webhook/OAuth. El flujo normal queda igual; el guard solo
puede abortar un deploy mal configurado (que igual habría fallado en runtime).

---

## 5. Smoke tests

**Flujos normales (baseline, existentes, corridos verdes):**

| Flujo pedido | Smoke | Resultado |
|---|---|---|
| Webhook firmado | `smoke-mp-webhook-signature` + `smoke-mp-webhook-handler` | 18/18 + 19/19 |
| requiere_revision | `smoke-mp-requiere-revision` | 11/11 |
| Cola de revisión | `smoke-mp-revision` | 12/12 |
| Resolver | `smoke-mp-e2e-revision` | 10/10 |
| Dashboard/reportes | `smoke-dia-operativo` | 27/27 |

**Guardrails de producción (nuevo):** `smoke-mp-prod-guardrails` — **11/11**:
1. prod + flag + manual_sandbox + firma mala → **401** (bypass NO aplica en prod).
2. sandbox + flag + manual_sandbox + firma mala → **200** (bypass solo acá).
3. sandbox + manual_sandbox + **sin** flag → **401** (exige el flag).
4. sandbox + **oauth** + flag → **401** (exige manual_sandbox).
5. prod + oauth + firma **válida** + approved → **200** + intento aprobado
   (flujo normal intacto).
6–11. **Guard de arranque** (`assertMPProductionConfig`): prod+manual_sandbox,
   prod+flag, prod+`MP_SANDBOX_*`, prod+falta-var → **tira** con mensaje que
   nombra el problema; prod+oauth+config-completa y sandbox+config-sandbox →
   **no tira**.

`tsc=0`, `eslint` limpio.

---

## 6. QA manual — producción

Correr en el entorno real con OAuth conectado (una vez hechas las acciones del §7).

- [ ] **MP-1** Un comercio real conecta MP por OAuth (Configuración → Mercado
      Pago) y queda `mp_credenciales` con `user_id_mp`.
- [ ] **MP-2** Cobro QR real: POS → generar QR → pagar con app MP → el POS
      pasa a aprobado (webhook firmado) → se crea la venta.
- [ ] **MP-3** Cobro rechazado/expirado → el intento refleja el estado y el
      POS lo comunica.
- [ ] **MP-4** Pago post-cancelación: cancelar el intento y pagar igual →
      entra a la cola `requiere_revision`.
- [ ] **MP-5** Cola de revisión: el admin ve el intento, lo resuelve
      (registrar venta / marcar resuelto) con auditoría.
- [ ] **MP-6** `/reportes` carga KPIs / ventas por día / top / stock (post-DROP R2).
- [ ] **MP-7** Revisar logs de Vercel: sin tokens, sin `manual_sandbox_*`, sin
      datos cross-comercio.
- [ ] **MP-8** Confirmar en logs que NO aparece
      `manual_sandbox_unsigned_webhook_blocked_production` (si aparece, hay una
      env sandbox mal seteada en prod).
- [ ] **MP-9 — PASO FINAL antes de dar MP por operativo:** hacer una **compra
      real de $1** (o el mínimo permitido, `MP_MIN_AMOUNT_ARS`) en producción,
      con una cuenta MP real, pagando el QR de verdad. Confirmar el ciclo
      completo: QR generado → pago → webhook firmado → intento aprobado →
      venta creada → aparece en caja/reportes. Recién con esto verde, Mercado
      Pago se considera **operativo en producción**.

---

## 7. Configuración externa — **Cosas que Tobias debe hacer**

Lo que requiere acción manual (el código NO lo hace por vos), separado por lugar.

### 🟩 Supabase
- [ ] **R2:** correr `scripts/migration-drop-reporte-dashboard-legacy.sql` en
      el SQL editor. Verificar con la query del pie del archivo que queda **1
      sola** firma de `get_reporte_dashboard`.
- [ ] (De V1/U4, si falta) **Redirect URLs** con `{SITE_URL}/auth/callback`,
      **Site URL** de prod, template **"Invite user"** habilitado. Ver
      `docs/qa-recuperacion-password.md` §6 y `docs/qa-invitaciones.md` §7.

### 🟦 Vercel (entorno **Production**)
- [ ] `MP_ENV=production`.
- [ ] `MP_MODE=oauth` (o no setearla → default oauth).
- [ ] **NO** definir `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX` (ni `=false`
      siquiera; mejor ausente).
- [ ] **NO** definir ninguna `MP_SANDBOX_*`.
- [ ] `NEXT_PUBLIC_APP_URL` = dominio de producción (define OG, y el
      `redirectTo` de invitaciones).
- [ ] Confirmar que estas envs están en el scope **Production** y que las de
      preview/dev (sandbox) están **solo** en Preview/Development.

### 🟨 Mercado Pago Developers
- [ ] Usar **credenciales de producción** de la app (no las de prueba).
- [ ] **Redirect URI OAuth** de prod registrada, matcheando exacto
      `SYLVORA_MP_REDIRECT_URI` (`https://<dominio-prod>/api/mp/oauth/callback`).
- [ ] **Webhook**: en Notificaciones → Webhooks, apuntar a
      `https://<dominio-prod>/api/mp/webhook` y generar el **secret** de firma.
- [ ] Confirmar que el webhook está en modo producción (no simulador).

### 🟪 Variables de entorno (resumen del set de producción)
**Presentes en prod:**
- [ ] `SYLVORA_MP_CLIENT_ID`, `SYLVORA_MP_CLIENT_SECRET` (app MP prod).
- [ ] `SYLVORA_MP_REDIRECT_URI` (dominio prod).
- [ ] `SYLVORA_MP_WEBHOOK_SECRET` (el generado en MP para el webhook prod).
- [ ] `SYLVORA_MP_TOKEN_ENCRYPTION_KEY` (32 bytes base64; **no** reusar la de dev).
- [ ] `MP_ENV=production`, `MP_MODE=oauth`.
- [ ] (Opcional) `SYLVORA_MP_WEBHOOK_URL` para flows que la soporten.

**Ausentes en prod (dev-only):**
- [ ] `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX`, `MP_SANDBOX_ACCESS_TOKEN`,
      `MP_SANDBOX_USER_ID_MP`, `MP_SANDBOX_EXTERNAL_POS_ID`,
      `MP_SANDBOX_COMERCIO_ID`.

### 🟫 DNS (si usás dominio propio, ej. `app.sylvora.com.ar`)
- [ ] Apuntar el DNS al proyecto de Vercel y validar el dominio.
- [ ] Con el dominio final, alinear **en simultáneo**: `NEXT_PUBLIC_APP_URL`,
      `SYLVORA_MP_REDIRECT_URI`, la Redirect URI en MP Developers, la URL del
      webhook en MP, y las **Redirect URLs** de Supabase Auth. Un desajuste
      rompe OAuth de MP o los links de auth (recuperación/invitación).

---

**Nada de esto requiere migración de schema salvo el DROP de R2 (que es un
DROP, no un cambio de datos).**

---

## 8. Tabla de cierre — para ir tachando

| Estado | Acción | Responsable |
|:---:|---|---|
| ☐ | **Supabase** → correr DROP de la RPC legacy (`migration-drop-reporte-dashboard-legacy.sql`) + verificar 1 firma | Tobias |
| ☐ | **Supabase** → Redirect URLs con `{SITE_URL}/auth/callback` | Tobias |
| ☐ | **Supabase** → Site URL de producción | Tobias |
| ☐ | **Supabase** → template "Invite user" habilitado | Tobias |
| ☐ | **SMTP** propio (Resend/Postmark) configurado | Tobias |
| ☐ | **Vercel** → variables de Production seteadas (`MP_ENV=production`, `MP_MODE=oauth`, `NEXT_PUBLIC_APP_URL`, creds MP prod) | Tobias |
| ☐ | **Vercel** → sin `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX` ni `MP_SANDBOX_*` en Production | Tobias |
| ☐ | **MP Developers** → OAuth: credenciales prod + Redirect URI registrada | Tobias |
| ☐ | **MP Developers** → Webhook prod (`{prod}/api/mp/webhook`) + secret | Tobias |
| ☐ | **DNS** (si aplica) → dominio propio + alinear todas las URLs | Tobias |
| ☐ | **QA producción** → checklist §6 (MP-1 … MP-8) | Tobias |
| ☐ | **QA producción** → **compra real de $1** (MP-9, paso final) | Tobias |

Marcá cada fila (☐ → ☑) a medida que la completás. Cuando estén todas, Mercado
Pago queda operativo en producción y el Sprint QA-1 cerrado.

**No commiteo hasta tu revisión.**
