# Spec — Roles y permisos (v1: admin / encargado / cajero)

Estado: **vigente. Sprint `feat/roles-permisos-v1` aplicado a main.**

Última actualización: 2026-06-07 (Commit 5 — docs + audit final).

## Contexto

V0 tenía 2 roles (`admin` / `empleado`). En la práctica, los comercios
reales pedían un nivel intermedio: alguien que pueda operar el día a día
(agregar productos, anular ventas, cerrar caja, ver reportes) sin tener
control total (eliminar productos, reabrir cierres, gestionar usuarios).

V1 (este sprint) introduce **3 roles** con permisos diferenciados,
defendidos en UI + RLS:

- **Admin** — dueño / encargado superior. Acceso total.
- **Encargado** — operativo elevado. Día a día completo, sin destructivos.
- **Cajero** — operativo base. POS + caja, nada más.

`'empleado'` legacy → migrado a `'cajero'` por `scripts/migration-roles-v1.sql`.

## Modelo

- **3 roles fijos**. RBAC simple, no hay capabilities per-usuario ni
  overrides. Cambiar permisos = editar `PERMISSIONS_BY_ROL` en
  `lib/permissions.ts` y deploy.
- **La fuente de verdad de SEGURIDAD es RLS**. La UI gatea para UX;
  RLS contiene si la UI falla.
- **Read = libre dentro del comercio**. Cualquier rol VE productos,
  stock, ventas, caja, dashboard. Lo que se gatea es ESCRITURA y
  acceso a `/reportes` / `/usuarios` / `/precios`.
- **Default al signup**: el primer perfil del comercio es `admin`
  (el que registra es el dueño).

## Matriz completa de permisos

✓ = permitido. ✗ = denegado.

| Permission key | Admin | Encargado | Cajero | Notas |
|---|:-:|:-:|:-:|---|
| **Caja** | | | | |
| `caja.cerrar` | ✓ | ✓ | ✓ | Cajero puede cerrar el día. |
| `caja.reabrir` | ✓ | ✗ | ✗ | Destructivo (borra cierre). Admin-only. |
| `caja.egreso` | ✓ | ✓ | ✓ | Egreso con caja abierta. |
| **Productos** | | | | |
| `producto.crear` | ✓ | ✓ | ✗ | |
| `producto.editar` | ✓ | ✓ | ✗ | Datos básicos, precio, stock manual. |
| `producto.eliminar` | ✓ | ✗ | ✗ | Destructivo (rompe FK items_venta). Admin-only. |
| `lote.gestionar` | ✓ | ✓ | ✗ | Agregar / borrar lotes. |
| **Precios** | | | | |
| `precio.actualizar_masivo` | ✓ | ✓ | ✗ | `/precios` page. |
| **Ventas** | | | | |
| `venta.crear` | ✓ | ✓ | ✓ | POS. |
| `venta.anular` | ✓ | ✓ | ✗ | |
| **Reportes** | | | | |
| `reporte.ver_completo` | ✓ | ✓ | ✗ | `/reportes` page. |
| **Usuarios** | | | | |
| `usuario.gestionar` | ✓ | ✗ | ✗ | Listar, invitar, cambiar rol. Admin-only. |

### Por rol (resumen)

**Admin** — todos los permisos. Único rol que puede:
- Eliminar productos.
- Reabrir caja (borrar cierres).
- Gestionar usuarios (invitar, cambiar rol).

**Encargado** — operativo elevado. Hace todo lo del día a día:
- Crear / editar productos y lotes.
- Actualizar precios masivamente.
- Crear / anular ventas.
- Cerrar caja, registrar egresos.
- Ver reportes completos.
- **NO**: eliminar productos, reabrir caja, gestionar usuarios.

**Cajero** — POS + caja:
- Crear ventas (POS).
- Registrar egresos.
- Cerrar caja (no reabrir).
- **NO**: tocar productos/lotes/precios, anular ventas, ver reportes,
  gestionar usuarios.

## Implementación

### Fuente única de verdad — `lib/permissions.ts`

```ts
export type Rol = 'admin' | 'encargado' | 'cajero'

const PERMISSIONS_BY_ROL: Record<Rol, ReadonlySet<Permission>> = {
  admin:     new Set([...todos]),
  encargado: new Set([
    'caja.cerrar', 'caja.egreso',
    'producto.crear', 'producto.editar',  // NO eliminar
    'lote.gestionar',
    'precio.actualizar_masivo',
    'venta.crear', 'venta.anular',
    'reporte.ver_completo',
  ]),
  cajero: new Set([
    'venta.crear',
    'caja.egreso',
    'caja.cerrar',  // no reabrir
  ]),
}
```

Helpers: `rolPuede(rol, perm)`, `esRolValido(rol)`, `labelRol(rol)`,
`puedeAnularVenta(venta, { rol })`.

### Capas de defensa

#### 1. UI — esconder botones con `usePermissions().has(...)`

Mejor UX que deshabilitar. El usuario no ve "teaser" de funcionalidad
inaccesible.

#### 2. Page guard — bloqueo de página completa

Para páginas sensibles (`/reportes`, `/usuarios`, `/precios`): si el rol
no puede ver la página, EmptyState "Sin acceso" en lugar de redirect.
Cubre el caso de URL directa o link compartido.

#### 3. Sidebar filter — `requierePermiso` por item

`components/layout/Sidebar.tsx` filtra el nav según el permiso requerido.
Cajero no ve los links de Reportes / Precios / Usuarios / Nuevo Producto.

#### 4. RLS — defensa en profundidad

`scripts/migration-roles-v1.sql` abre RLS de `productos`, `lotes`,
`ventas` a encargado via helper `es_admin_o_encargado()`. Cajero sigue
solo con SELECT (lectura). DELETE de productos / UPDATE de cierres
sigue admin-only.

## Audit de call sites

Todos los puntos donde se evalúa un permiso, con el rol esperado en cada
botón / página. Cruzar contra la matriz: si lo gateado no coincide con
la columna del rol → bug.

### Sidebar (`components/layout/Sidebar.tsx`)

| Item | Permiso | Visible para |
|---|---|---|
| Nuevo Producto | `producto.crear` | Admin, Encargado |
| Actualizar Precios | `precio.actualizar_masivo` | Admin, Encargado |
| Reportes | `reporte.ver_completo` | Admin, Encargado |
| Usuarios | `usuario.gestionar` | Admin |
| (otros — Dashboard, POS, etc.) | sin gating | Todos |

### Page guards

| Ruta | Permiso | Comportamiento si no aplica |
|---|---|---|
| `/usuarios` | `usuario.gestionar` | EmptyState "Acceso restringido" |
| `/reportes` | `reporte.ver_completo` | EmptyState "Sin acceso a reportes" + corta el fetch de la RPC |
| `/precios` | `precio.actualizar_masivo` | EmptyState |

### Botones / acciones con gating

| Componente | Línea | Permiso | Botón |
|---|---|---|---|
| `app/caja/page.tsx` | 293 | `caja.reabrir` | Reabrir caja |
| `app/ventas/page.tsx` | 301 | `venta.anular` (via `puedeAnularVenta`) | Anular venta |
| `app/stock/page.tsx` | 18-19 | `producto.editar`, `lote.gestionar` | Edit stock / lotes |
| `app/productos/components/ProductDetail.tsx` | 45 | `lote.gestionar` | Gestión de lotes |
| `app/productos/components/ProductDetail.tsx` | 189-197 | `producto.editar`, `producto.eliminar` | Editar / Borrar |
| `app/productos/components/ProductFilters.tsx` | 44, 50 | `producto.crear` | Importar / Nuevo |
| `app/productos/components/ProductGrid.tsx` | 153-259 | `producto.editar`, `producto.eliminar` | Acciones por fila |

### Servidor (endpoints)

| Endpoint | Check | Quién pasa |
|---|---|---|
| `POST /api/usuarios/invite` | `callerPerfil.rol !== 'admin'` → 403 | Admin only |
| `POST /api/usuarios/invite` | `!esRolValido(rol)` → 400 | Cualquier rol válido como payload |
| `POST /api/registro` | hardcoded `rol: 'admin'` | El que registra el comercio nuevo |

### Resultado del audit

**Sin botones expuestos a roles incorrectos.** Cada call site fue cruzado
contra la matriz. La UI y el sidebar son consistentes con `PERMISSIONS_BY_ROL`.

## Defensa en profundidad — RLS

`scripts/migration-roles-v1.sql` ya aplicado en prod. Helper:

```sql
CREATE OR REPLACE FUNCTION es_admin_o_encargado() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$ SELECT get_rol() IN ('admin', 'encargado') $$;
```

Policies abiertas a encargado: INSERT/UPDATE en `productos`, `lotes`,
`ventas`. DELETE de productos y UPDATE de `cierres_caja` siguen
admin-only. RLS de `perfiles.update` sigue admin-only (la UI de
`/usuarios` está gateada doblemente).

## Gaps conocidos

Documentados acá para no perderlos — ninguno bloquea V1.

### 1. Middleware `proxy.ts` no chequea rol

`proxy.ts` solo gatea **autenticación** (loggeado vs no). No hay
redirect server-side por rol — un cajero que pega `/reportes` en la URL
sigue entrando al cliente, y ahí el page guard lo recibe con EmptyState
"Sin acceso".

**Por qué no bloquea V1**: page guard + RLS contienen. El cajero no
puede leer data sensible — la RPC de reportes la bloquea RLS, y el
guard cliente no llega a hacer el fetch.

**Cuándo agregarlo**: si V2 mete páginas donde el render *en sí* expone
algo (ej. server components que filtran data sensible). Hoy todas las
páginas hacen fetch desde el cliente.

### 2. Self-degradación de admin

La RLS `perfiles_update_self` permite a un admin editar su propio
perfil, incluido el campo `rol`. La UI de `/usuarios` no expone "Mi
perfil → cambiar mi rol", pero un admin con consola podría auto-degradarse.

**Mitigación actual**: la función `cambiarRolUsuario` (`lib/supabase/usuarios.ts`)
tiene guard app-level "último admin" cuando se baja un admin a no-admin.
No cubre el caso "admin se degrada a sí mismo siendo el único" si se
hace por SQL directo.

**Cuándo blindar**: nunca para usuarios sin acceso a SQL. Si en el
futuro exponemos consola SQL en la app, agregar policy RLS:
`perfiles_update_self WHERE id = auth.uid() AND rol = (SELECT rol FROM perfiles WHERE id = auth.uid())`
o validar en un trigger.

### 3. `MiniPreviews.tsx` tiene tipo local

El componente de la landing define su propio `type RolMini = 'admin' | 'encargado' | 'cajero'`
en vez de importar `Rol` de `types/database.ts`. Intencional: la landing
es marketing y queremos desacoplarla del schema interno (el tipo `Rol`
podría cambiar sin romper la landing). Si se agrega un 4to rol, hay que
acordarse de tocar también `MiniPreviews.tsx` — pero el deploy del
backend no se rompe por esto.

### 4. ESLint preexistente en `Sidebar.tsx:46`

Error `react-hooks/set-state-in-effect` en el `useEffect` del theme
toggle. Commit `29438cce` de mayo, no relacionado a roles. Fuera de
scope de este sprint. TODO separado.

## Decisiones del sprint

1. **Encargado puede anular ventas** — sí.
2. **Encargado ve reportes** — sí (`reporte.ver_completo`).
3. **Encargado puede `caja.reabrir`** — NO. Reabrir borra el cierre y es
   destructivo. Admin-only.
4. **Cajero puede cerrar caja** — sí (mantenemos comportamiento V0).
5. **Encargado gestiona usuarios** — NO. `usuario.gestionar` admin-only.
6. **RLS** — Camino A: helper `es_admin_o_encargado()` + policies abiertas
   a ambos en tablas mixtas.
7. **Rename** — `'empleado'` → `'cajero'`. Migración hace UPDATE en
   `perfiles` + relaxa CHECK constraint.

## Out of scope V1

- **Invite con assignment a multi-comercio**. YAGNI.
- **Permisos per-usuario** (override del rol). YAGNI.
- **Roles custom** (ej. "supervisor" entre admin y encargado).
- **Activity log / auditoría** (quién hizo qué cuándo).
- **Middleware con gating por rol**. Ver gap #1.
- **Blindaje SQL contra self-degradación**. Ver gap #2.

## Histórico

La versión original de este spec (P2.1, 2 roles `admin` / `empleado`)
quedó en git history hasta `feat/roles-permisos-v1`. La forma de razonar
sobre RLS (`get_rol()`, policies por tabla, defensa en profundidad) se
mantuvo — solo cambió el set de roles y los permisos asignados.

Para ver el diff conceptual:
- Tipo `Rol` pasó de 2 → 3 valores.
- Se agregó permiso `reporte.ver_completo` (antes los empleados veían
  reportes).
- Se agregó helper SQL `es_admin_o_encargado()`.
- Se renombró `'empleado'` → `'cajero'` (semántica más clara para AR).
