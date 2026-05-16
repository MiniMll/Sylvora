# Spec — P2.1 Roles y permisos (admin / empleado)

Estado: **aprobada, pendiente de correr migration e implementar.**

## Contexto / objetivo

La app está estable funcionalmente, pero hoy **todos los usuarios de un
comercio tienen acceso total**: cualquier cajero puede reabrir caja, editar
precios masivamente, eliminar productos o anular ventas. Para un comercio
real con uno o más empleados, esto es un riesgo operativo y de seguridad.

P2.1 introduce un modelo simple de 2 roles (`admin` y `empleado`) con
permisos diferenciados, defendido a nivel de UI (gating visual) **y** de
DB (RLS), sin romper la app actual.

## Modelo conceptual

- **2 roles fijos en V1**: `admin` y `empleado`. Modelo extensible (agregar
  un tercer rol = 1 línea en la tabla de permisos) pero sin sobre-diseñar.
- **Permisos derivados del rol**, no per-usuario. RBAC clásico, sin
  capabilities ad-hoc.
- **Defensa en profundidad**: UI esconde lo que el rol no puede hacer, y
  RLS lo bloquea a nivel DB. La UI sola no es seguridad — RLS es la
  fuente de verdad.
- **Read = libre dentro del comercio**. Empleado puede VER productos,
  stock, ventas, caja, dashboard. Solo se gatea la ESCRITURA.

## Permission matrix

Acción columna ✓ = permitida.

| Acción | admin | empleado |
|---|---|---|
| Ver productos, stock, ventas, caja, dashboard, reportes | ✓ | ✓ |
| Crear venta (POS) | ✓ | ✓ |
| Registrar egreso (con caja abierta) | ✓ | ✓ |
| **Cerrar caja** | ✓ | ✓ |
| Reabrir caja | ✓ | ✗ |
| Anular venta | ✓ | ✗ |
| Crear producto | ✓ | ✗ |
| Editar producto (datos básicos, precio, stock manual) | ✓ | ✗ |
| Eliminar producto | ✓ | ✗ |
| Gestionar lotes (agregar / borrar) | ✓ | ✗ |
| Actualizar precios masivamente (`/precios`) | ✓ | ✗ |
| Gestionar usuarios y roles | ✓ | ✗ |

**Nota sobre stock**: el stock_actual se modifica indirectamente por
ventas (POS), lotes (admin) o edición del producto (admin). No hay
"edición manual de stock" como acción separada — está cubierta por
`producto.editar`, que es admin-only. Empleado nunca puede tocar el
campo stock_actual directamente.

## Modelo de datos

`perfiles.rol` (text, ya existe) toma valores `'admin'` | `'empleado'`.

```sql
-- 1. Backfill: existentes pasan a admin (todos son dueños hoy).
UPDATE perfiles SET rol = 'admin' WHERE rol IS NULL OR rol NOT IN ('admin', 'empleado');

-- 2. Constraint de valores válidos.
ALTER TABLE perfiles
  ADD CONSTRAINT perfiles_rol_check CHECK (rol IN ('admin', 'empleado'));

-- 3. Default para nuevos signups (el que crea el comercio es admin).
ALTER TABLE perfiles ALTER COLUMN rol SET DEFAULT 'admin';
ALTER TABLE perfiles ALTER COLUMN rol SET NOT NULL;
```

**Sin tabla aparte de permisos**: los permisos se derivan en código (constante
`PERMISSIONS_BY_ROL`). Cambiar permisos de un rol = deploy de código, no
update de DB. Trade-off aceptable para V1 (2 roles fijos, cambios raros).

## Función `get_rol()`

Análoga a `get_comercio_id()` que ya existe. Resuelve el rol del usuario
actual desde RLS.

```sql
CREATE OR REPLACE FUNCTION get_rol() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT rol FROM perfiles WHERE id = auth.uid()
$$;
```

`SECURITY DEFINER` para bypassear RLS de `perfiles` al consultar. Mismo
patrón que `get_comercio_id()`.

## RLS — defensa a nivel DB

Estrategia: **una policy de SELECT abierta (todos en el comercio leen)
+ una policy de escritura con `get_rol() = 'admin'` para tablas
admin-only**. Para escrituras mixtas (ej. ventas: empleado puede crear,
admin puede anular), policies separadas por operación.

### Tablas admin-only para escritura

`productos`, `categorias`, `proveedores`, `lotes`, `cierres_caja`,
`movimientos_stock`:

```sql
-- Ejemplo productos. Mismo patrón para las otras.
DROP POLICY IF EXISTS "productos_comercio" ON productos;

CREATE POLICY "productos_read" ON productos
  FOR SELECT USING (comercio_id = get_comercio_id());

CREATE POLICY "productos_write_admin" ON productos
  FOR ALL
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');
```

`FOR ALL` cubre INSERT/UPDATE/DELETE. Postgres combina policies con OR
para SELECT — la policy de read deja pasar a empleado; la de write solo
matchea admin. Ambos roles ven, solo admin escribe.

### `ventas` — mixto

Empleado CREA (POS), admin UPDATE (anular).

```sql
DROP POLICY IF EXISTS "ventas_comercio" ON ventas;

CREATE POLICY "ventas_read" ON ventas
  FOR SELECT USING (comercio_id = get_comercio_id());

CREATE POLICY "ventas_insert" ON ventas
  FOR INSERT WITH CHECK (comercio_id = get_comercio_id());

CREATE POLICY "ventas_update_admin" ON ventas
  FOR UPDATE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- No DELETE policy → nadie puede borrar (anular es UPDATE estado).
```

### `movimientos_caja` (egresos)

Si decisión 1 = empleado puede egresar → policy abierta de INSERT como
ventas. Si no → admin-only.

```sql
-- Caso decisión 1 = sí (recomendado):
DROP POLICY IF EXISTS "movimientos_caja_comercio" ON movimientos_caja;
CREATE POLICY "movimientos_caja_read" ON movimientos_caja
  FOR SELECT USING (comercio_id = get_comercio_id());
CREATE POLICY "movimientos_caja_insert" ON movimientos_caja
  FOR INSERT WITH CHECK (comercio_id = get_comercio_id());
```

### `cierres_caja`

Empleado puede cerrar (INSERT) pero no reabrir (DELETE). Admin todo.

```sql
DROP POLICY IF EXISTS "cierres_caja_comercio" ON cierres_caja;

CREATE POLICY "cierres_caja_read" ON cierres_caja
  FOR SELECT USING (comercio_id = get_comercio_id());

CREATE POLICY "cierres_caja_insert" ON cierres_caja
  FOR INSERT WITH CHECK (comercio_id = get_comercio_id());

CREATE POLICY "cierres_caja_delete_admin" ON cierres_caja
  FOR DELETE USING (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- Sin UPDATE policy: el cierre es inmutable. Para corregir, se reabre
-- (admin) y se cierra de nuevo.
```

### `perfiles`

Hoy: `FOR ALL USING (id = auth.uid())` — cada uno solo el suyo. Admin no
puede ver/editar a otros. Cambio: admin puede leer/editar a otros del mismo
comercio; cada usuario sigue viendo el suyo.

```sql
DROP POLICY IF EXISTS "perfiles_propio" ON perfiles;

-- Leer: todos los perfiles del mismo comercio (para listar usuarios y
-- resolver responsables).
CREATE POLICY "perfiles_read" ON perfiles
  FOR SELECT USING (comercio_id = get_comercio_id() OR id = auth.uid());

-- Editar el propio (datos básicos, sin tocar rol).
CREATE POLICY "perfiles_update_self" ON perfiles
  FOR UPDATE USING (id = auth.uid());

-- Admin gestiona otros perfiles del mismo comercio (rol, nombre, etc.).
CREATE POLICY "perfiles_update_admin" ON perfiles
  FOR UPDATE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- Admin invita empleados nuevos (INSERT). UPDATE de su propio rol
-- queda implícitamente bloqueado porque la policy de self update no
-- restringe columnas — eso lo maneja la app (no exponer el campo rol
-- en el form de "Mi perfil").
CREATE POLICY "perfiles_insert_admin" ON perfiles
  FOR INSERT WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');
```

**Nota de seguridad**: un admin no podría auto-degradarse a empleado
desde la UI si el form no expone el campo `rol` para "Mi perfil". Pero
sí desde la consola si quisiera. Para V1, app-level check: "no podés
bajar a empleado al último admin del comercio" se valida en el server
action / API route que cambia roles.

## Helper / `usePermissions`

### Permission matrix en código

```ts
// lib/permissions.ts
export type Rol = 'admin' | 'empleado'

export type Permission =
  | 'caja.cerrar'              // ambos roles
  | 'caja.reabrir'             // admin only
  | 'caja.egreso'              // ambos
  | 'producto.crear'           // admin
  | 'producto.editar'          // admin — incluye precio individual y stock manual
  | 'producto.eliminar'        // admin
  | 'lote.gestionar'           // admin
  | 'precio.actualizar_masivo' // admin — /precios page
  | 'venta.crear'              // ambos
  | 'venta.anular'             // admin
  | 'usuario.gestionar'        // admin

const PERMISSIONS_BY_ROL: Record<Rol, Set<Permission>> = {
  admin: new Set<Permission>([
    'caja.cerrar', 'caja.reabrir', 'caja.egreso',
    'producto.crear', 'producto.editar', 'producto.eliminar',
    'lote.gestionar',
    'precio.actualizar_masivo',
    'venta.crear', 'venta.anular',
    'usuario.gestionar',
  ]),
  empleado: new Set<Permission>([
    'venta.crear',
    'caja.egreso',
    'caja.cerrar',     // no reabrir
  ]),
}

export function rolPuede(rol: Rol | string | null | undefined, perm: Permission): boolean {
  if (rol !== 'admin' && rol !== 'empleado') return false
  return PERMISSIONS_BY_ROL[rol].has(perm)
}

export function esRolValido(rol: string | null | undefined): rol is Rol {
  return rol === 'admin' || rol === 'empleado'
}
```

### Context provider

```tsx
// components/PermissionsProvider.tsx
'use client'
const PermsContext = createContext<{ rol: Rol | null; loading: boolean; has: (p: Permission) => boolean; isAdmin: boolean }>(...)

export function PermissionsProvider({ children }) {
  const [rol, setRol] = useState<Rol | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPerfilActual().then(p => {
      setRol(esRolValido(p?.rol) ? p.rol : null)
      setLoading(false)
    })
  }, [])

  return <PermsContext.Provider value={{
    rol, loading,
    has: (p) => rolPuede(rol, p),
    isAdmin: rol === 'admin',
  }}>{children}</PermsContext.Provider>
}

export function usePermissions() { return useContext(PermsContext) }
```

Wireado en `app/layout.tsx` para que sea singleton de sesión, una sola
query al montar.

`getPerfilActual()` resuelve `auth.uid()` → `perfiles` (id, comercio_id,
rol, nombre). Reusa el patrón de `getComercioId` pero cachea más.

## Estrategia de gating UI

Tres capas, en orden de aplicabilidad:

### 1. Esconder botones / acciones (más usado)

```tsx
const { has } = usePermissions()

{has('venta.anular') && <Button onClick={anular}>Anular venta</Button>}
```

Si el usuario no puede ejecutar la acción, no se ve. Mejor UX que
deshabilitar — no hay "tease" de funcionalidad inaccesible.

### 2. Bloqueo de página completa

Para `/precios` (admin-only): wrapper en la page que redirige a `/pos`
o renderiza un placeholder "No tenés permiso" si rol = empleado.

```tsx
const { has, loading } = usePermissions()
if (loading) return <Spinner />
if (!has('precio.actualizar_masivo')) return <NoPermiso />
```

### 3. Middleware (defensa en profundidad)

`proxy.ts` ya intercepta requests. Agregar tabla de rutas → permiso, y
si el rol del usuario no la satisface, redirect server-side.

```ts
const RUTAS_ADMIN_ONLY = ['/precios', '/usuarios']
// en el middleware:
if (RUTAS_ADMIN_ONLY.some(r => pathname.startsWith(r))) {
  const rol = await getRolFromCookie(...)
  if (rol !== 'admin') return NextResponse.redirect(new URL('/pos', req.url))
}
```

V1: capa 1 + 2 obligatorias, capa 3 opcional (se puede agregar después).

## Estrategia de migración segura

Riesgo principal: aplicar RLS nuevas y romper la app para usuarios
existentes. Mitigación:

1. **Backfill primero**: todos los perfiles existentes pasan a `'admin'`.
   Esto garantiza que ningún flujo existente se rompa (admin = puede todo).
2. **Constraint + default después**: NOT NULL + CHECK + DEFAULT 'admin'.
3. **RLS por tabla, una a la vez**: el SQL del spec hace todas juntas,
   pero si querés verificar página por página, se puede partir.
4. **Verificar app con admin existente**: nada cambia. Si algo se rompe,
   indica un bug pre-existente o una RLS mal escrita.
5. **Solo después de verificar admin OK**: invitar primer empleado de
   prueba, verificar que las acciones admin-only fallen como se espera.

Reversibilidad: si algo sale mal, las RLS se pueden revertir a las
originales (`FOR ALL USING (comercio_id = get_comercio_id())`) sin
perder data. El backfill de rol = 'admin' es no-destructivo.

## Plan de implementación

Por commits:

1. **Spec doc** (este).
2. **Migration SQL** (manual en Supabase, igual que cierre-caja):
   backfill + constraint + default + `get_rol()` + RLS nuevas.
3. **types/database.ts**: tipar `rol` como `'admin' | 'empleado'`.
4. **`lib/permissions.ts`** + **`components/PermissionsProvider.tsx`**
   + wireado en `app/layout.tsx`.
5. **Gating UI por página** (1 commit por página o agrupado):
   - `productos/page.tsx`: ocultar botones Nuevo / Editar / Borrar.
   - `productos/components/ProductDetail.tsx`: ocultar Editar / Borrar /
     gestión de lotes.
   - `app/precios/page.tsx`: bloqueo de página completa.
   - `app/ventas/page.tsx`: ocultar Anular venta.
   - `app/caja/page.tsx`: ocultar Cerrar / Reabrir.
   - `app/stock/page.tsx`: ocultar gestión de lotes.
6. **`/usuarios` page V1** (básica): lista de usuarios del comercio,
   cambiar rol entre admin/empleado. Sin invite flow.
7. **Middleware (opcional)** en `proxy.ts` para rutas admin-only.

Aprox. 5-7 commits después de la migration.

## Decisiones confirmadas

1. **Empleado registra egresos**: sí.
2. **Empleado gestiona lotes**: no (admin-only).
3. **Empleado ve dashboard/reportes**: sí, read-only.
4. **Default rol al signup**: `admin`.
5. **`/usuarios` page en P2.1**: sí, versión básica (listar + cambiar
   rol). Sin invite flow.
6. **"Al menos 1 admin" como invariante**: sí, validación app-level
   en el server action que cambia roles.
7. **Middleware route-level**: deferido a P2.2.

**Ajuste explícito del user**: empleado **SÍ puede cerrar caja**
(no reabrir). El stock manual se bloquea como efecto secundario de
`producto.editar` siendo admin-only.

## Out of scope V1

- **Invite flow por email** con service role. → P2.2.
- **Multi-comercio user** (mismo email en varios comercios). YAGNI.
- **Permisos per-usuario** (override del rol). YAGNI.
- **Roles custom** (ej. "supervisor" entre admin y empleado). El sistema
  los soporta agregando entradas a la tabla; UI para definirlos = futuro
  si surge la necesidad.
- **Activity log / auditoría** (quién hizo qué cuándo). Futuro.
- **2FA / sesiones múltiples / device management**. Futuro.
