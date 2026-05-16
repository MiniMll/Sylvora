# Spec — P2.2.1 Invite flow de usuarios

Estado: **propuesta, pendiente de confirmar decisiones abiertas.**

Sigue del rework de roles (`docs/roles-permissions-spec.md`). Hoy
`/usuarios` lista y permite cambiar rol; agregar nuevos empleados
requiere meter mano al dashboard de Supabase. Esta spec mete ese flow
adentro de la app.

---

## 1. Modelo conceptual

**Invitación = perfil creado + magic link enviado por email.**

- Admin completa email + (opcional) nombre + rol.
- El servidor crea el auth user vía service role, dispara el email de
  Supabase con magic link, y crea el row de `perfiles` (id =
  auth.users.id, comercio_id del admin, rol elegido).
- El empleado recibe el email, hace click, setea su password, queda
  logueado y con perfil válido.
- No hay tabla `invites` separada en V1. **La existencia del perfil ES
  la invitación.** Si el empleado nunca acepta, el perfil queda
  "dormant" (auth user existe pero `email_confirmed_at` es null).

Mental model: **un usuario, un comercio.** No hay multi-tenancy del
lado del usuario en V1. Si el email ya existe en cualquier otro
comercio, se rechaza la invitación.

---

## 2. Approach elegido: `auth.admin.inviteUserByEmail`

Tres caminos posibles:

| Approach | Cómo funciona | Veredicto |
|---|---|---|
| **A — invite by email** (recomendado) | Service role crea user + envía magic link. Empleado setea su password. | **Elegido.** Standard, seguro, sin password en tránsito. |
| B — admin setea password inicial | Admin tipea email + temp password. Empleado debe cambiarlo al primer login. | Descartado. Password handoff por canal externo (WhatsApp/voz) es inseguro. |
| C — híbrido | Crea user con random password + envía email. | Sobrecomplicado, sin ganancia. |

Approach A es el flow nativo de Supabase, no requiere implementar
"forzar cambio de password al primer login" ni "página de seteo
inicial" — todo lo maneja Supabase.

---

## 3. Arquitectura

### Endpoint server-side

`POST /api/usuarios/invite` (route handler en `app/api/usuarios/invite/route.ts`).

Es server-only porque usa **service role key** (poder total sobre la
DB y auth — nunca puede llegar al cliente).

**Body de la request:**
```ts
{ email: string, rol: 'admin' | 'empleado', nombre?: string }
```

**Responses:**
- `200 { ok: true, user_id }` — invitación enviada.
- `400 { error: 'Email inválido' | 'Rol inválido' }`.
- `401 { error: 'No autenticado' }` — sesión inválida.
- `403 { error: 'Solo admin' }` — caller no es admin.
- `409 { error: 'Email en uso' | 'Email en uso en otro comercio' }`.
- `500 { error: <mensaje> }` — fallo de Supabase u otro inesperado.

### Flujo del handler (5 pasos)

```
1. Parsear y validar inputs (email regex, rol enum).
2. Resolver session.user vía cookies (anon client). Si no hay → 401.
3. Con service role, SELECT perfil del caller. Si rol !== 'admin' → 403.
4. Service role: listar auth.users filtrando por email.
   - No existe → continuar.
   - Existe sin perfil → posible si alguna vez se borró el perfil.
     Reusamos el user_id, solo creamos el perfil.
   - Existe con perfil en OTRO comercio → 409.
   - Existe con perfil en ESTE comercio → 409 (ya está adentro).
5. Service role: auth.admin.inviteUserByEmail(email) →
   crea auth user (si no existía) + dispara email.
6. Service role: INSERT perfiles { id, comercio_id, nombre, rol }.
   Si falla → rollback (delete auth user creado) → 500.
7. 200.
```

### Cliente (UI)

Botón "Invitar usuario" arriba de la tabla en `/usuarios`. Modal con:
- `<Input>` email *
- `<Input>` nombre (opcional)
- `<Select>` rol (default empleado)
- `<Button>` "Enviar invitación" (loading + disabled mientras la
  request está pendiente)

Submit → fetch al endpoint → toast success o error específico → si
success, modal cierra + refresh de la lista.

---

## 4. Variables de entorno

Necesitamos agregar UNA nueva env var:

```
SUPABASE_SERVICE_ROLE_KEY=<key del dashboard Supabase>
```

- **NO prefijo `NEXT_PUBLIC_`** — server-only, jamás cliente.
- Disponible en Supabase → Settings → API → "service_role" key.
- Agregar a `.env.local` para dev y al provider de hosting para prod.
- Documentar en `.env.example` con valor placeholder.

SMTP: Supabase tiene SMTP default que sirve para V1 (limitado a ~3
emails/hora en proyectos free). Para producción seria conviene
configurar SMTP propio (Resend, Postmark, etc.) en Supabase Auth
Settings. Fuera de scope V1.

---

## 5. Manejo de errores y edge cases

| Caso | Comportamiento |
|---|---|
| Email mal formado | 400 → toast "Email inválido". |
| Email en uso en ESTE comercio | 409 → toast "Ya hay un usuario con ese email". |
| Email en uso en OTRO comercio | 409 → toast "Ese email ya tiene cuenta en otro comercio". V1 = un usuario por comercio. |
| Email tiene auth user pero sin perfil (zombie post-delete) | 200 → crea solo el perfil, reusa el user_id. |
| Falla SMTP | El user se crea igual; el email no llega. Admin puede reintentar (rate-limited por Supabase). Toast: "Invitación creada — si no llega el email, decile al usuario que pruebe 'olvidé mi contraseña'". |
| Falla INSERT perfil después de crear user | Rollback: delete auth user. Si el rollback falla también, queda zombie — log y reportar. |
| Click duplicado en "Enviar" | Botón disabled mientras pending. Doble request → segunda devuelve 409. |
| Admin se invita a sí mismo | El check de email-en-uso lo rechaza (su propio email ya tiene perfil). 409. |

---

## 6. UX completa

### Estado actual de `/usuarios`
- Banner "Invitación por email: próximamente. Mientras tanto, agregá
  desde Supabase."
- Tabla con users + Select rol.

### Después de P2.2.1
- **Banner removido.**
- Botón **"+ Invitar usuario"** arriba de la tabla (admin only).
- Modal de invitación.
- Tras invitar, el nuevo usuario aparece en la tabla. Su `nombre` es
  el que tipeó admin (o vacío); el empleado puede actualizarlo desde
  `/perfil` cuando acepte.

### Indicador de "pendiente" (opcional V1)
- Mostrar badge "Invitado, pendiente de aceptar" si `auth.users.email_confirmed_at`
  es null. Requiere el server-side fetch (service role) en el load de
  `/usuarios` o un endpoint separado.
- **Mi voto:** dejar para V1.5. La complejidad agregada (otro endpoint
  para enriquecer la lista) no compensa la info — el admin igual puede
  ver `last_sign_in_at` en Supabase si necesita confirmar que entraron.

---

## 7. Out of scope V1 (futuros)

- **Resend invitación**: si el user no aceptó, "reinvitar" reenvía el
  magic link. Easy de implementar (Supabase reusa user existente) pero
  agrega 1 botón + 1 endpoint. P2.2.2.
- **Cancelar invitación**: para users que no aceptaron, "cancelar"
  borra el perfil + auth user. Cubierto cuando hagamos delete usuarios
  (P2.2.3).
- **Badge "pendiente vs aceptado"**: ver sección 6.
- **Email template custom**: Supabase Auth permite custom templates.
  Para V1 usamos el default.
- **Multi-comercio por usuario**: si en el futuro un dueño tiene varios
  comercios, el mismo email tendría varios perfiles. Para V1 = no.

---

## 8. Decisiones abiertas

Necesito que confirmes antes de implementar:

1. **¿Permitir invitar otros admin?** Mi voto: **sí**. El owner puede
   delegar permisos completos a una persona de confianza (socio,
   contador). Pero el `Select rol` en el modal va con default
   `empleado` y el admin debe elegir explícitamente.

2. **¿Nombre obligatorio o opcional al invitar?** Mi voto: **opcional**.
   El empleado puede completarlo después desde su perfil. Forzarlo
   agrega fricción.

3. **¿Mostrar el "estado" de la invitación (pendiente/aceptada) en la
   tabla?** Mi voto: **no en V1**. Decisión documentada en sección 6.
   Reabrible si te parece importante.

4. **¿El admin que invita debería poder copiar un "link de respaldo"
   por si el email no llega?** Mi voto: **no en V1**. Magic links son
   bearer tokens — exponerlos en clipboard es riesgo de seguridad sin
   beneficio claro. Si falla email, el empleado usa "olvidé mi
   contraseña" en login.

5. **¿Bloquear emails con dominio personal vs corporate?** Mi voto:
   **no**. Cualquier email válido. Negocios chicos usan gmail/hotmail
   habitualmente.

---

## 9. Plan de implementación (cuando confirmes decisiones)

1. **Env**: agregar `SUPABASE_SERVICE_ROLE_KEY` a `.env.example` y a
   tu `.env.local`. Commit del example.
2. **Helpers de server**: `lib/supabase/server-admin.ts` con un
   `getServiceClient()` que crea el cliente con service role. Lazy
   import — nunca se incluye en bundle del cliente.
3. **Endpoint**: `app/api/usuarios/invite/route.ts` con los 5 pasos
   descritos. Tests manuales con cURL antes de la UI.
4. **UI**: agregar botón "Invitar usuario" + `<InvitarUsuarioModal>` en
   `/usuarios`. Estado de loading, manejo de los errores HTTP.
5. **Cleanup**: remover banner "próximamente" del page.

Estimado: 3 commits (env + helper, endpoint, UI). El endpoint es el
más sensible — vamos despacio ahí.

---

## 10. Riesgos

- **Service role key leaked**: poder total. Mitigación: no prefijo
  `NEXT_PUBLIC_`, nunca log, nunca pasar al cliente, solo en server
  components / route handlers. Si alguna vez se filtra → rotar
  inmediatamente en Supabase dashboard.
- **Privilege escalation via endpoint**: si la validación de "caller
  es admin" tiene un bug, cualquier user logueado podría invitar.
  Mitigación: doble check (cookies + perfil.rol via service role) en
  el handler. Test con cURL como empleado para validar.
- **Email spam / rate limit**: SMTP default de Supabase tiene límite
  estricto. Mitigación: documentar el límite, esperar SMTP custom en
  prod.
- **Race condition crear user + crear perfil**: si el segundo paso
  falla, el primer paso queda zombie. Mitigación: rollback explícito
  (delete user) en el catch.
