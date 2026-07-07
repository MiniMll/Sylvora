# QA — Invitaciones y primer acceso (hallazgo U4)

Cierre del hallazgo **U4** de `qa-auditoria-integral-2026-07.md` §1.10
(invitaciones dependían del SMTP default) ampliado con el gap detectado al
cerrar L1: **`inviteUserByEmail` se llamaba sin `redirectTo`**, así que el
link de invitación no pasaba por `/auth/callback` y el primer acceso quedaba
incompleto (el invitado no tenía una pantalla para fijar su primera
contraseña).

Reutiliza al máximo la infraestructura de V1 (recuperación): el mismo
`/auth/callback`, la misma pantalla `/reset-password`, el mismo validador
`validarPasswordNueva` y el mismo `rutaInternaSegura`.

Método: **[V]** verificado contra el código · **[I]** por inspección,
requiere reproducción manual contra el proyecto Supabase real.

---

## 1. Lifecycle de una invitación (estado tras U4)

```
Admin (/usuarios) → modal → POST /api/usuarios/invite
  1. valida body (email, rol, nombre?)
  2. resuelve caller por cookies · exige rol admin
  3. inviteUserByEmail(email, { redirectTo:
        {NEXT_PUBLIC_APP_URL}/auth/callback?tipo=invitacion })
        → crea auth user (si no existía) + manda email
  4. INSERT perfil { id, comercio_id, nombre, rol }

Empleado (email) → click link
  → Supabase /auth/v1/verify → {SITE_URL}/auth/callback?tipo=invitacion&code=...
  → exchangeCodeForSession(code)  (setea cookies sb-*  ⇒  crea sesión)
  → redirect a /reset-password?bienvenida=1
  → fija su PRIMERA contraseña (updateUser) → /dashboard
```

| Etapa | Comportamiento | Estado |
|---|---|---|
| **Creación** | `POST /api/usuarios/invite`, admin-only (cookies + `perfil.rol==='admin'` con service role). Crea perfil con el rol elegido; la existencia del perfil **es** la invitación (sin tabla `invites`). | **[V]** sin cambios |
| **Envío del email** | `inviteUserByEmail` con `redirectTo` al callback. Base URL desde `NEXT_PUBLIC_APP_URL` (sin dominios hardcodeados; fallback al origin del request). | **[V]** nuevo `redirectTo` |
| **Redirect al callback** | El link aterriza en `/auth/callback?tipo=invitacion` — **la misma pieza que recuperación**. `tipo` selecciona el "sabor" del flujo. | **[V]** |
| **Creación de sesión** | `exchangeCodeForSession` setea las cookies. Aplica el comportamiento conocido de Supabase (issue #45210): el link crea sesión **antes** de fijar la contraseña — que es justo lo que `/reset-password` necesita para mostrar el formulario. | **[V]** / **[I]** e2e |
| **Primer acceso** | Ya no aterriza en el Site URL `/` sin sesión (gap anterior). Ahora llega a `/reset-password?bienvenida=1`. | **[V]** corregido |
| **Fijación inicial de contraseña** | `/reset-password` en modo "bienvenida": copy de primer acceso ("¡Te damos la bienvenida!" / "Te invitaron a usar Sylvora. Creá una contraseña…", botón "Crear contraseña y entrar"). Misma validación `validarPasswordNueva` (mín. 6 + coinciden) que recuperación y Configuración. `updateUser({password})` → `/dashboard`. | **[V]** |
| **Expiración del enlace** | Link vencido → `exchangeCodeForSession` falla → `/login?auth=invite_expirado` con copy de invitación ("pedile al admin que te reenvíe"). Expiry configurable en Supabase (ver §5). | **[V]** copy · **[I]** expiry real |
| **Reenvío** | Reinvitar a un pendiente: `inviteUserByEmail` reenvía el email; el endpoint detecta el perfil ya existente **en este comercio** y devuelve **200 `reenviada:true`** (antes devolvía 409 "ya pertenece" pese a haber reenviado). La UI muestra "Invitación reenviada". No cambia el rol existente. | **[V]** bug corregido |
| **Invitación ya utilizada** | Link single-use: reabrir un link ya usado → exchange falla → `/login?auth=invite_expirado`. Si el usuario ya fijó contraseña, entra normal con email+contraseña. | **[V]** / **[I]** |
| **Usuario existente** | Confirmado (ya tiene cuenta activa): `inviteUserByEmail` corta con "already registered" → 409 con mensaje claro. En otro comercio: 409 "ya tiene cuenta en otro comercio" (modelo un-usuario-un-comercio). | **[V]** sin cambios |
| **Mensajes de error** | 400 email/rol inválido · 401 no auth · 403 no admin · 409 confirmado / otro comercio · 500 fallo Supabase. Fallos de link → aviso en `/login` (`invite_invalido` / `invite_expirado`). | **[V]** |
| **UX desktop/mobile** | `/reset-password` usa el mismo card responsive (`maxWidth 400`, padding fluido) que login/recuperar. El modal de invitar usa la primitiva `Modal size="sm"`. | **[V]** |
| **Consistencia con recuperación** | Mismo callback, misma pantalla, mismo validador, mismo sanitizador. La única diferencia es el copy (`?bienvenida=1`) y el sabor del aviso de error (`tipo=invitacion`). | **[V]** |

### 1.1 Garantías del reenvío (verificado contra el código)

Reinvitar a un email **pendiente del mismo comercio** devuelve 200
`reenviada:true`. Ese camino (bloque `mismoComercio` en el endpoint) **NO**:

| Garantía | Por qué se cumple |
|---|---|
| **No crea otro perfil** | El `INSERT` ya falló con `23505` (PK duplicada). Se llega al bloque *después* de que el insert no prosperó → no hay perfil nuevo. **[V]** |
| **No modifica el rol** | No hay ningún `UPDATE` en ese camino. El perfil existente queda con el rol que ya tenía. Para cambiarlo, la tabla de usuarios. **[V]** |
| **No modifica el comercio** | Ídem: sin `UPDATE`. Solo se hace un `SELECT comercio_id` (lectura) para decidir el mensaje. **[V]** |
| **No modifica permisos** | Los permisos derivan del rol (`PERMISSIONS_BY_ROL`). Rol intacto → permisos intactos. **[V]** |
| **No genera duplicados** | `inviteUserByEmail` **reutiliza** el auth user existente (no crea otro para el mismo email); el perfil ya existe y no se toca. Un email = un auth user = un perfil. **[V]** |

Lo único que cambia es el lado de Supabase Auth (reenvía el email y refresca
su timestamp interno de invitación). Nada de `perfiles`/rol/comercio/permisos
se altera.

### 1.2 Usuario ya autenticado abre un link de invitación

Comportamiento **esperado** si un admin (u otro usuario) ya logueado abre por
error un link de invitación de otra persona:

- El link de invitación es un **bearer token del usuario invitado** (como
  cualquier magic link). Si el `code` es válido, `exchangeCodeForSession`
  **reemplaza la sesión activa** por la del invitado y aterriza en
  `/reset-password?bienvenida=1`. Es decir: el que hace click queda operando
  como el usuario invitado en ESE navegador, no como sí mismo.
- Si el link ya fue usado o venció → `exchangeCodeForSession` falla →
  `/login?auth=invite_expirado`. La sesión previa puede o no sobrevivir según
  cómo Supabase maneje el fallo; en el peor caso el usuario original solo
  tiene que volver a entrar con su email + contraseña (su credencial sigue
  siendo válida).
- **No es una fuga cross-comercio:** el token corresponde a un usuario que el
  propio admin acaba de invitar a SU comercio. No expone datos de otros
  comercios.
- **No agregamos guard** en el callback para este caso: bloquear "usuario ya
  logueado" rompería el caso legítimo de un usuario logueado que abre su
  propio link de **recuperación**. Se documenta el comportamiento en vez de
  restringirlo.

Recomendación operativa: el admin no debería abrir los links de invitación de
sus empleados. Para probar el flujo, usar un email/navegador distinto o modo
incógnito. **[V razonamiento]** / **[I]** confirmar el detalle del reemplazo
de sesión en la corrida real.

---

## 2. Reutilización de V1 (sin código nuevo salvo lo necesario)

| Pieza V1 | Reutilizada en U4 |
|---|---|
| `app/auth/callback/route.ts` | **La misma ruta.** Ahora lee `?tipo` para elegir destino/aviso. Recuperación sin `tipo` se comporta idéntico (back-compat). |
| `app/reset-password/page.tsx` | **La misma pantalla.** `?bienvenida=1` cambia solo el copy. |
| `lib/auth/password.ts` | Mismo validador de contraseña. |
| `lib/auth/redirect.ts` | Mismo anti open-redirect (recuperación); en invitación el destino es fijo. |
| `/login` `AUTH_MENSAJES` | Extendido con `invite_invalido` / `invite_expirado`. |

Único código nuevo: `lib/auth/callback-flow.ts` (helper puro que decide
destino y aviso según flujo) — para no meter `if (tipo)` sueltos en la ruta y
poder testearlo.

---

## 3. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Redirect URL no cargada en Supabase** | El invite reusa `{SITE_URL}/auth/callback` (misma entrada que recuperación). Si falta, Supabase rechaza el `redirectTo` → verificar en §5. |
| **SMTP no confiable** | El SMTP default (~3-4/h) rompe el onboarding de equipo (2º invite de la hora no llega). SMTP propio = **requisito** (§5). |
| **Reenvío cambia el rol sin querer** | El reenvío **no** toca el rol existente; se cambia desde la tabla de usuarios. Decisión explícita para no sorprender. |
| **Sesión antes de contraseña** (#45210) | Si el invitado abre el link y abandona, queda con sesión activa sin contraseña. Puede volver a `/reset-password?bienvenida=1` o cerrar sesión. Aceptable para V1 (mismo trade-off que recuperación). |
| **`NEXT_PUBLIC_APP_URL` mal seteada** | El link apuntaría a un dominio equivocado. Fallback al origin del request si falta; documentar que en prod debe estar seteada. |
| **Open redirect vía invitación** | En invitación el destino es **fijo** (`/reset-password?bienvenida=1`), no depende de `next` → sin superficie de open redirect. |

---

## 4. Archivos

**Nuevos:** `lib/auth/callback-flow.ts`, `scripts/smoke-auth-invitaciones.ts`,
`docs/qa-invitaciones.md`.
**Modificados:** `app/auth/callback/route.ts` (lee `tipo`, usa el helper),
`app/api/usuarios/invite/route.ts` (`redirectTo` + reenvío 200),
`app/reset-password/page.tsx` (modo bienvenida + Suspense),
`app/login/page.tsx` (mensajes `invite_*`), `app/usuarios/page.tsx` (toast
"reenviada"), `docs/invite-flow-spec.md` (estado actualizado).

---

## 5. Smoke tests

`scripts/smoke-auth-invitaciones.ts` — 8 casos sobre la lógica pura del flujo
(`flujoDesdeParam`, `destinoExito`, `avisoError`): invitación va a
`/reset-password?bienvenida=1` ignorando `next`; recuperación respeta `next`
saneado y cae al fallback ante open-redirect; los avisos de error usan el
sabor correcto por flujo. Todos verdes.

El endpoint de invitación y el intercambio de sesión no son unit-testeables
sin Supabase real → van al QA manual.

---

## 6. QA manual

Requiere Redirect URLs (§5) cargadas, SMTP configurado y un email real.

- [ ] **I-1** `/usuarios` → "Invitar usuario" → email + rol → "Invitación
      enviada". El invitado aparece en la tabla.
- [ ] **I-2** Abrir el email → aterriza en `/reset-password` en modo
      **bienvenida** ("Creá tu contraseña"), **con sesión**.
- [ ] **I-3** Contraseña < 6 / no coinciden → error inline. Válida →
      "Crear contraseña y entrar" → `/dashboard` logueado con su rol.
- [ ] **I-4 (reenvío):** invitar de nuevo al **mismo** email pendiente →
      toast **"Invitación reenviada"** (no error), llega un nuevo email.
- [ ] **I-5 (link usado):** reabrir el link ya usado de I-2 →
      `/login?auth=invite_expirado` con copy de invitación.
- [ ] **I-6 (expirado):** dejar vencer un link (o forzar) → mismo aviso.
- [ ] **I-7 (usuario existente confirmado):** invitar un email que ya tiene
      cuenta activa → 409 con mensaje claro. En otro comercio → 409 acorde.
- [ ] **I-8** Acceso directo a `/reset-password?bienvenida=1` sin sesión →
      "Invitación inválida o vencida" → link a iniciar sesión.
- [ ] **I-9 (dos flujos no se pisan):** un link de **recuperación** sigue
      cayendo en "Nueva contraseña" (no en modo bienvenida).
- [ ] **I-10** Mobile: modal de invitar y `/reset-password` responsive.
- [ ] **I-11** El invitado, ya con contraseña, hace login normal con
      email+contraseña.
- [ ] **I-12 (primer acceso, una sola vez):** tras crear la contraseña en
      I-3, el usuario queda **autenticado** en `/dashboard`. Cerrar sesión y
      volver a entrar → usa el **login normal** (email+contraseña), **no**
      vuelve a ver el modo "bienvenida". El modo bienvenida solo se alcanza
      por el link de invitación, que ya quedó usado; además, al estar
      confirmado, un re-invite devolvería "already registered" (409).
- [ ] **I-13 (admin ya logueado abre un invite):** con un admin logueado,
      abrir un link de invitación de otro empleado → la sesión se reemplaza
      por la del invitado y cae en "bienvenida" (el link es un bearer token
      del invitado). Confirmar que, si el link ya venció/usó, cae en
      `/login?auth=invite_expirado` y el admin puede reloguearse con su
      credencial. Ver §1.2.

---

## 7. Configuración en Supabase requerida

**No hay migración SQL.** Es configuración en Authentication:

1. **Redirect URLs** — **no requiere entrada nueva**: reusa
   `{SITE_URL}/auth/callback` (dev/preview/prod) que ya pidió V1. Verificar
   que esté cargada. **[crítico]**
2. **Email template "Invite user"** — habilitado y usando
   `{{ .ConfirmationURL }}` (el default sirve). Es un template **distinto**
   al de "Reset Password"; verificar el copy y que el link apunte al
   ConfirmationURL. **[verificar]**
3. **Expiración del link de invitación** — configurable en Authentication.
   Confirmar el valor y alinear expectativas con el copy de error. **[I]**
4. **SMTP propio (Resend/Postmark)** — **REQUISITO antes de producción**, no
   opcional. Sin él, el rate-limit del SMTP default rompe el onboarding de
   equipo. Ya reclasificado con L1 (ver `qa-recuperacion-password.md` §8 e
   `invite-flow-spec.md` §4/§10). **[config]**

**No requiere migración SQL** (ningún cambio de schema; el perfil ya se crea
en el flujo actual).
