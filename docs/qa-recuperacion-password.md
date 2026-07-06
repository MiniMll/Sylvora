# QA — Recuperación de contraseña + flujo de auth (hallazgo L1)

Cierre del hallazgo **L1** de `qa-auditoria-integral-2026-07.md` §1.1
("No existe flujo olvidé mi contraseña"). Documenta el flujo implementado,
el QA de todos los caminos de autenticación que tocan `/auth/callback`, el
comportamiento real de los links de recuperación de Supabase, y la
configuración de Supabase requerida.

Método (misma convención que la auditoría): **[V]** verificado contra el
código · **[I]** por inspección, requiere reproducción manual contra el
proyecto Supabase real antes de darlo por cerrado.

---

## 1. Pieza estructural nueva: `/auth/callback`

Antes de este cambio **no existía una ruta de aterrizaje para los redirects
de Supabase Auth** (solo estaba el callback de OAuth de Mercado Pago, que es
otra cosa). Sin ella, el link de cualquier email de Supabase (recuperación,
invitación, confirmación) no tenía dónde intercambiar el `?code` del flujo
PKCE por una sesión, y el usuario quedaba sin loguear.

`app/auth/callback/route.ts` (GET) es esa pieza:

```
email de Supabase → /auth/v1/verify → redirect a
  {origin}/auth/callback?code=<PKCE>&next=<ruta interna>
    → exchangeCodeForSession(code)   (setea cookies sb-*)
    → redirect a {origin}{next}      (next sanitizado, anti open-redirect)
```

- Sin `code` → `/login?auth=link_invalido`.
- `exchangeCodeForSession` falla (link vencido/usado) → `/login?auth=link_expirado`.
- `next` pasa por `rutaInternaSegura` (ver §4). Default: `/reset-password`.

---

## 2. QA del flujo por camino  — ¿aterriza por `/auth/callback`?

El requisito era confirmar (a) que agregar `/auth/callback` **no rompe** el
flujo existente de invitaciones y (b) qué caminos pasan por el callback.

| Camino | ¿Pasa por `/auth/callback` hoy? | Comportamiento | Estado |
|---|---|---|---|
| **Recuperación de contraseña** | **Sí** | `/recuperar` fija `redirectTo={origin}/auth/callback?next=/reset-password` → callback intercambia el code → `/reset-password` con sesión → nueva contraseña → `/dashboard`. | **[V]** wired · **[I]** confirmar e2e con Redirect URLs cargadas |
| **Usuario ya logueado** (abre un link de recuperación) | **Sí** | `exchangeCodeForSession` reemplaza la sesión activa por la de recuperación y sigue a `/reset-password`. `/reset-password` con sesión previa (sin venir de link) también deja cambiar la contraseña — inofensivo, es equivalente a Configuración → Cuenta. | **[V]** |
| **Sesión expirada** (abre un link de recuperación) | **Sí** | El `code` del email es autónomo: no depende de la sesión previa. El callback establece una sesión nueva y sigue a `/reset-password`. Rutas protegidas sin sesión → el proxy redirige a `/login` (sin cambios). | **[V]** |
| **Invitación nueva** | **NO (hoy)** | `POST /api/usuarios/invite` llama `inviteUserByEmail(email)` **sin `redirectTo`** → el link del email aterriza en el **Site URL `/`**, no en `/auth/callback`. Ahí no hay handler que intercambie el `code`, así que el proxy termina mandando a `/login`. Es un gap **preexistente**, independiente de este cambio. | **[V]** gap · fix en §5 |
| **Primer acceso** (empleado invitado) | **NO (hoy)** | Es el mismo click del link de invitación → mismo gap. Además, aun logueándose, el usuario invitado no tiene una pantalla para **fijar su primera contraseña**. | **[V]** gap · fix en §5 |

**Confirmación pedida — regresión de invitaciones:** agregar `/auth/callback`
y su entrada en Redirect URLs es **puramente aditivo**. El endpoint de
invitación no referencia esa ruta, así que las invitaciones se comportan
**exactamente igual que antes** (no hay regresión). Lo que el QA revela es
que ese "igual que antes" ya era un flujo incompleto — ver §5.

---

## 3. Anti-enumeración y mensajes de error

- **`/recuperar`** muestra **siempre** el mismo mensaje de éxito ("Si hay una
  cuenta asociada a X, te enviamos un link…"), exista o no la cuenta. No
  revela qué emails están registrados. Errores reales (red) se loguean sin
  el email; el rate-limit de Supabase no se distingue del éxito hacia el
  usuario. **[V]**
- **`/reset-password`** distingue solo dos estados hacia el usuario: sesión
  válida (formulario) o "Link inválido o vencido" (con salida a `/recuperar`).
  Nunca expone el token ni el error crudo. **[V]**
- **`/login`** muestra el aviso amarillo `link_invalido` / `link_expirado`
  cuando el callback redirige con `?auth=`. **[V]**

---

## 4. Anti open-redirect (`rutaInternaSegura`)

`lib/auth/redirect.ts` sanea el `next` del callback. Acepta **solo** rutas
internas absolutas y rechaza, evaluando la forma **cruda y percent-decodificada**
(cubre `%2f`, `%5c` y doble codificación como `%252f`):

| Entrada | Resultado |
|---|---|
| `/dashboard`, `/reset-password` | se acepta |
| `//evil.com`, `/\evil.com` | fallback (esquema-relativo) |
| `http://`, `https://`, `javascript:`, `data:` | fallback (esquema) |
| `/%2fevil.com` → `//evil.com` | fallback (`%2f` decodificado) |
| `/%5cevil.com` → `/\evil.com` | fallback (`%5c` decodificado) |
| `/%252f%252fevil.com`, `/%2F%2F…` | fallback (doble cod. / mayúsculas) |
| `/%zz`, `/%` (mal formado) | fallback (decode falla → sospechoso) |
| ` /x`, `\t/x` (whitespace/control inicial) | fallback |
| `/dashboard?q=%20hola`, `/a%2fb` (barra interna benigna) | se acepta |

Cubierto por `scripts/smoke-auth-recuperacion.ts` (19 casos, todos verdes).

---

## 5. Comportamiento real de los links de recuperación de Supabase

Consultas para el QA manual (algunas requieren confirmación contra el
proyecto real — marcadas **[I]**):

- **Single-use [V, documentado por Supabase]:** una vez que se abre el link y
  se intercambia el `code`, el token se consume. Reabrir el **mismo** link
  vuelve a fallar (`otp_expired`) → `/reset-password` muestra "Link inválido
  o vencido".
- **Expiración [V, configurable]:** por defecto **1 hora** (OTP expiry en
  Authentication → configurable). El copy de `/recuperar` dice "vence en una
  hora" — mantener alineado si se cambia el setting.
- **Dos links / cuál invalida a cuál [I — confirmar en vivo]:** cada llamada a
  `resetPasswordForEmail` genera un token nuevo y, por el diseño de GoTrue,
  **sobrescribe** el `recovery_token` del usuario. Por lo tanto el
  comportamiento **esperado** es: *el link más reciente es el válido y los
  anteriores dejan de funcionar*. Ver caso **R-7** en §7 para reproducirlo y
  dejar registrado el resultado observado.
- **Sesión antes de la contraseña [V, gap conocido de Supabase — issue #45210]:**
  abrir un link de recuperación/invitación **crea una sesión autenticada antes
  de que se fije la contraseña** (se comporta como magic link). Nuestro
  `/reset-password` **depende** de esto: detecta la sesión con `getUser()` y por
  eso puede mostrar el formulario. Implicancia: si el usuario abre el link y
  abandona sin guardar, queda con sesión activa en ese dispositivo. Para
  recuperación es aceptable (ya tenía cuenta). Para **invitaciones** es
  justamente lo que hace necesario mandarlas a `/reset-password` a fijar la
  primera contraseña (ver fix de invitaciones abajo).

**Fix recomendado para invitaciones (NO incluido en este commit — pertenece
al hallazgo U4 / invitaciones, para no mezclar correcciones):** en
`app/api/usuarios/invite/route.ts`, pasar `redirectTo` a `inviteUserByEmail`
apuntando al callback, reutilizando la misma infraestructura:

```ts
const base = process.env.NEXT_PUBLIC_APP_URL // ya existe, sin dominios hardcodeados
await admin.auth.admin.inviteUserByEmail(emailNorm, {
  redirectTo: `${base}/auth/callback?next=/reset-password`,
})
```

Con eso, invitación y primer acceso pasarían por `/auth/callback` → el
empleado aterriza en `/reset-password` a fijar su primera contraseña →
`/dashboard`. Requiere que la Redirect URL del callback esté cargada (§6) y
verificación e2e con un invite real. Se deja para U4 junto con el SMTP.

---

## 6. Configuración de Supabase requerida

**No hay migración SQL.** Es configuración en el dashboard de Supabase
(Authentication):

1. **Redirect URLs** (URL Configuration → Redirect URLs) — **crítico**: sin
   esto Supabase rechaza el `redirectTo` del email. Agregar:
   - `http://localhost:3000/auth/callback` (dev)
   - `https://<preview>.vercel.app/auth/callback` (previews)
   - `https://<dominio-prod>/auth/callback` (producción)
2. **Site URL** apuntando al dominio de producción.
3. **Email template "Reset Password"** habilitado (el default con
   `{{ .ConfirmationURL }}` funciona).
4. **SMTP propio** — ver §8. Es **requisito antes de producción**, no opcional.

---

## 7. Checklist de QA manual

Requiere las Redirect URLs del §6 cargadas y un email real.

- [ ] **R-1** Login → "¿Olvidaste tu contraseña?" → `/recuperar`.
- [ ] **R-2** Email registrado → "Revisá tu email". Email inexistente →
      **mismo mensaje** (anti-enumeración).
- [ ] **R-3** Abrir el link del mail → aterriza en `/reset-password` **con
      sesión** (confirma que el callback seteó la cookie).
- [ ] **R-4** Contraseña < 6 / no coinciden → error inline. Válida →
      `/dashboard` logueado.
- [ ] **R-5** Reusar el **mismo** link una 2ª vez → "Link inválido o vencido"
      → salida a `/recuperar` (single-use).
- [ ] **R-6** Abrir `/reset-password` directo, sin venir de link → estado
      "Link inválido o vencido".
- [ ] **R-7 (dos links — documentar resultado):**
      1. Pedir link **A**. 2. Sin abrir A, pedir link **B**.
      3. Abrir **A** (el viejo) → **esperado:** inválido (B lo invalidó).
      4. Abrir **B** (el nuevo) → **esperado:** `/reset-password` OK.
      → Anotar el comportamiento **real** observado. Si A siguiera funcionando,
      registrarlo (diferiría del modelo de sobrescritura de token).
- [ ] **R-8** `/auth/callback?next=//evil.com` (y `%2f`, `%5c`) → redirige a
      `/reset-password`, nunca a un host externo.
- [ ] **R-9** Cambiar contraseña desde Configuración → Cuenta sigue igual
      (misma validación compartida `validarPasswordNueva`).
- [ ] **R-10** Mobile: `/recuperar` y `/reset-password` usan el mismo card
      responsive del login.

Resultado de R-7 (completar tras la corrida real): ____________________

---

## 8. SMTP propio — requisito antes de producción (no opcional)

El flujo de recuperación **depende de que el email llegue de forma
confiable**. El SMTP default de Supabase está limitado (~3-4 mails/hora en
proyectos free) y con deliverability pobre. Un usuario bloqueado que no
recibe el mail de recuperación queda sin salida — el mismo problema que L1
venía a resolver, reintroducido por el transporte de email.

Por eso, y en línea con el hallazgo **U4** (P1) de la auditoría, se
reclasifica explícitamente:

> **SMTP propio (Resend / Postmark, vía Authentication → SMTP Settings) es un
> REQUISITO antes de exponer Sylvora a clientes reales**, no una mejora
> opcional. Afecta por igual a recuperación de contraseña (L1) e invitaciones
> (U4). El código no lo bloquea, pero el flujo no es confiable en producción
> sin él.

(La reclasificación se refleja también en `docs/invite-flow-spec.md` §4 y §10,
que antes lo listaban como "fuera de scope V1 / opcional".)
