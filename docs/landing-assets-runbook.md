# Runbook — Generar los assets de la landing

Procedimiento operativo para producir las capturas del Kiosco El
Faro y dejarlas listas en `public/landing/` antes de codear la
landing.

**Tiempo estimado total**: 2–3 horas si no hay imprevistos.

**Prerequisitos**:
- Cuenta de Supabase activa (gratis sirve).
- Node.js instalado y el repo clonado localmente.
- Chrome o Chromium para las capturas (Chrome DevTools es el mejor).

---

## Paso 1 — Crear proyecto Supabase staging

**Objetivo**: tener una DB separada exclusivamente para los assets
de landing. **No mezclar con la DB de producción ni con la de
testing diario.**

1. Entrar a [supabase.com](https://supabase.com) → Dashboard.
2. Click **"New Project"**.
3. Completar:
   - **Organization**: la que tengas (la misma de producción está OK).
   - **Project name**: `sylvora-landing` (o lo que quieras, claro
     para identificarlo después).
   - **Database password**: generar uno random y guardarlo en tu
     password manager. No se usa en el seed pero podés necesitarlo
     si entrás al SQL Editor con permisos elevados.
   - **Region**: la más cercana (South America - São Paulo si está,
     sino la más cercana a vos).
   - **Pricing plan**: Free.
4. Click **"Create new project"** y esperar 2–3 minutos a que se
   provisione.

Cuando termine, en el dashboard del proyecto nuevo, vas a tener
acceso a Settings → API → donde está la URL y las keys.

**Validación del paso**:
- En Settings → API ves un `Project URL` con formato
  `https://<algo>.supabase.co`.
- Ves dos keys: `anon public` y `service_role secret`.

---

## Paso 2 — Aplicar todas las migrations

**Objetivo**: que el schema del staging matchee exactamente el de
producción para que el seed corra sin errores y el producto se
comporte igual.

Las migrations no están como archivos `.sql` versionados en el repo
(no usamos Supabase CLI). Están dispersas en los specs que fueron
acumulando schema changes. Hay que correrlas en orden.

**Cómo correrlas**:

1. En el dashboard del staging: **SQL Editor** (icono lateral
   izquierdo).
2. Click **"+ New query"**.
3. Pegar cada bloque SQL, ejecutar, y pasar al siguiente.

### Bloque 2.1 — Schema base

Si no tenés el schema base como dump exportable de producción, te
recomiendo este atajo: **Supabase Dashboard → Database → Backups
del proyecto de producción → Download** un backup reciente. Lo
restaurás en el staging via SQL Editor (es una operación de pegar
el SQL completo).

Si no podés acceder a un dump, vas a tener que recrear el schema
manualmente leyendo `types/database.ts` y las funciones de
`lib/supabase/*`. Estimado: ~1 hora extra. **Mi recomendación
fuerte: usar el dump.**

### Bloque 2.2 — Migration de roles (P2.1)

Pegar y ejecutar en SQL Editor (está en
`docs/roles-permissions-spec.md` sección "Migration SQL"):

- Agrega CHECK constraint en `perfiles.rol`.
- Crea función `get_rol()`.
- Reescribe las policies RLS de todas las tablas para gatear admin
  vs empleado.
- Setup completo del split insert/delete en `cierres_caja`.

### Bloque 2.3 — Migration de cierre de caja (rework)

Pegar y ejecutar (está en `docs/cierre-caja-spec.md` sección
"Cambios de schema"):

- ALTER TABLE `cierres_caja` ADD COLUMN `usuario_id UUID`.
- ALTER TABLE `cierres_caja` ADD COLUMN `retiro_efectivo NUMERIC`.
- Dedupe (en staging vacío no hace nada, no falla).
- UNIQUE constraint `(comercio_id, fecha)`.

**Validación del paso**:

Correr esta query en SQL Editor:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cierres_caja'
ORDER BY ordinal_position;
```

Verificá que aparezcan `usuario_id`, `retiro_efectivo`,
`efectivo_contado`, `diferencia_efectivo` entre las columnas.
Si alguna falta, no aplicaste todas las migrations.

---

## Paso 3 — Configurar env vars

**Objetivo**: que el script de seed apunte al staging recién
creado, no al proyecto de producción ni a tu staging diario.

1. Abrir Supabase Dashboard → **Settings → API** del proyecto
   `sylvora-landing`.
2. Copiar:
   - `Project URL`
   - `service_role secret` (la key larga que dice "Reveal").
3. En una **nueva terminal** (separada de la que usás para dev de
   producción — importante para no confundir):

**Linux/macOS**:
```bash
export NEXT_PUBLIC_SUPABASE_URL='https://<staging-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='eyJ...'
```

**Windows PowerShell**:
```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='https://<staging-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='eyJ...'
```

**Validación del paso**:

```bash
echo $NEXT_PUBLIC_SUPABASE_URL   # Linux/mac
echo $env:NEXT_PUBLIC_SUPABASE_URL   # PowerShell
```

Tiene que mostrar la URL del **staging**, no la de producción.
Confirmá visualmente que es el `<staging-ref>` correcto.

**Importante**: estas env vars existen solo en esa terminal. Si
abrís otra terminal, no las hereda. Es a propósito — evita que
accidentalmente uses el seed contra producción desde tu shell
habitual.

---

## Paso 4 — Correr el seed

**Objetivo**: poblar el staging con el Kiosco El Faro completo.

Desde la terminal con las env vars exportadas:

```bash
cd <path-al-repo>
npm run seed:landing
```

Vas a ver output así:

```
🌱 Seed de landing — Kiosco El Faro

✓ Comercio: Kiosco El Faro (xxxxxxxx-xxxx-...)
✓ Usuarios: 3
✓ Categorías: 5
✓ Productos: 12
✓ Lotes: 3
✓ Ventas hoy: 22
✓ Egresos hoy: 2
✓ Cierres pasados: 7
   → Cierre de hoy: ventas $XXX.XXX, egresos $XX.XXX, saldo $XXX.XXX
✓ Cierre de hoy

✅ Seed completado.

Login para capturar:
  sofia@kioscoelfaro.com.ar  / sylvora123  (admin)
  martin@kioscoelfaro.com.ar / sylvora123  (empleado)
  laura@kioscoelfaro.com.ar  / sylvora123  (empleado)
```

**Si falla**:
- Error tipo `relation "..." does not exist` → faltan migrations
  (volver al Paso 2).
- Error `auth.admin.createUser ...: ...` → la service role key es
  inválida o es de otro proyecto. Re-chequear paso 3.
- Error `policy violation` o RLS → falta correr la migration de
  roles (Paso 2.2).

---

## Paso 5 — Verificar que el staging quedó bien

**Objetivo**: confirmar visualmente en Supabase Dashboard que TODO
está en su lugar antes de invertir tiempo en capturas.

Dashboard del staging → **Table Editor**:

| Tabla | Esperado |
|---|---|
| `comercios` | 1 row "Kiosco El Faro" |
| `perfiles` | 3 rows (Sofía admin, Martín y Laura empleados) |
| `categorias` | 5 rows |
| `productos` | 12 rows con SKU KEF-001 a KEF-012 |
| `lotes` | 3 rows (todos para Yerba Playadito) |
| `ventas` | 22 rows con `created_at` de HOY |
| `items_venta` | ~35-40 rows (cada venta tiene 1-3 items) |
| `movimientos_caja` | 2 rows tipo `egreso` de hoy |
| `cierres_caja` | 8 rows (7 pasados + 1 de hoy) |

**Checks específicos** (correr en SQL Editor):

```sql
-- Productos con sus estados de stock (debe haber variedad)
SELECT nombre, stock_actual, stock_minimo,
  CASE
    WHEN stock_actual = 0 THEN 'SIN STOCK'
    WHEN stock_actual <= stock_minimo * 0.3 THEN 'CRITICO'
    WHEN stock_actual <= stock_minimo THEN 'BAJO'
    ELSE 'OK'
  END as estado
FROM productos
ORDER BY stock_actual;
```

Debe mostrar al menos 1 SIN STOCK (Agua Villavicencio), 1 CRITICO
(Galletitas Sonrisas), 1 BAJO (Leche), y el resto OK.

```sql
-- Cierres por fecha
SELECT fecha, total_ventas, total_egresos, saldo_neto, diferencia_efectivo
FROM cierres_caja
ORDER BY fecha DESC;
```

Debe mostrar 8 rows. El primero (fecha = hoy) tiene los números
calculados desde las ventas reales del seed. Diferencia 0.

```sql
-- Ventas del día con métodos mezclados
SELECT metodo_pago, COUNT(*), SUM(total)
FROM ventas
WHERE created_at >= CURRENT_DATE
  AND estado = 'completada'
GROUP BY metodo_pago;
```

Mix realista (~60% efectivo, ~24% MP, ~10% débito, resto crédito).

**Si algo no cuadra**: volver a correr el seed. Es idempotente, no
duplica nada.

---

## Paso 6 — Loguearte con los usuarios demo

**Objetivo**: poder ver la app conectada al staging, lista para
capturar.

Necesitás que tu app local apunte al staging, no a tu DB habitual.
Dos opciones:

### Opción A (recomendada) — `.env.local.landing` separado

1. En el repo, crear un archivo `.env.local.landing` con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # la anon, no la service role
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

2. Renombrar temporalmente tu `.env.local` actual a `.env.local.dev`.
3. Renombrar `.env.local.landing` a `.env.local`.
4. Reiniciar el dev server: `npm run dev`.

Cuando termines las capturas, revertís los nombres y volvés a tu
DB habitual sin tocar nada más.

Ventaja: no editás manualmente, no riesgo de mezclar.

### Opción B — Comentar/descomentar en `.env.local`

Editar `.env.local`, comentar las líneas de producción y agregar
las del staging:

```
# === Producción (comentado durante captura de landing) ===
# NEXT_PUBLIC_SUPABASE_URL=https://prod-ref.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...prod

# === Staging landing ===
NEXT_PUBLIC_SUPABASE_URL=https://staging-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...staging
SUPABASE_SERVICE_ROLE_KEY=eyJ...staging
```

Reiniciar `npm run dev`. Cuando termines, revertir.

Más manual pero menos archivos en el disco. Yo iría con A.

### Validar el login

1. `npm run dev` → http://localhost:3000.
2. Ir a `/login`.
3. Email: `sofia@kioscoelfaro.com.ar`. Password: `sylvora123`.
4. Deberías entrar como admin al dashboard del Kiosco El Faro.

Si entra y ves la sidebar con todas las opciones (incluido
Usuarios), estás listo.

---

## Paso 7 — Preparar el entorno para las capturas

**Objetivo**: configurar tu browser y workspace para que las
capturas salgan consistentes y limpias.

### 7.1 Browser

**Usar Chrome o Chromium dedicado** (no tu browser habitual con
extensiones y bookmarks):

- Abrir Chrome en **modo incógnito**, O
- Crear un perfil de Chrome nuevo "Sylvora capture" sin extensions
  ni bookmarks bar.

Razones: extensiones tipo Grammarly o adblockers inyectan elementos
visibles. La bookmarks bar ocupa espacio. Capturas limpias requieren
chrome del browser limpio.

### 7.2 DevTools setup

1. F12 para abrir DevTools.
2. **Toggle device mode**: `Ctrl+Shift+M` (Cmd+Shift+M en Mac).
3. Setear viewport según necesidad:
   - **Para capturas desktop**: "Responsive" con ancho **1440** y
     alto **900**. NO un device preset.
   - **Para captura mobile (2.8)**: preset **Pixel 7** (393×852) o
     **iPhone 14** (390×844).
4. **Zoom del browser al 100%** (`Ctrl+0` / `Cmd+0`).

### 7.3 Limpieza de UI antes de capturar

Antes de cada captura:

- [ ] Sin tooltips activos (mover el mouse fuera del viewport).
- [ ] Sin notificaciones / toasts (esperar 5s para que se vayan).
- [ ] Sin modales abiertos (a menos que la captura específica los
      necesite).
- [ ] Sin sidebar en hover state.
- [ ] Sin scroll en medio de una sección (cada captura empieza en
      su top natural).
- [ ] Tema **claro** (verificar el toggle en sidebar — debe estar
      en sol/light).

### 7.4 Datos correctos visibles

Antes de capturar, navegá a la página específica y verificá que ves:

- **Para captura 2.1 (Hero POS)**: ir a `/pos`. Verificar que se
  ven productos. Si no ves nada, refrescar.
- **Para captura 2.4 (Productos lista)**: cambiar a vista lista
  (toggle arriba). Verificar que ves el chip "Crítico" en
  Galletitas Sonrisas, "Sin stock" en Agua, "Bajo" en Leche.
- **Para captura 2.3 (Caja cerrada)**: ir a `/caja`. El header
  debe decir "Caja cerrada · jueves XX de mes · Cerrada a las
  20:45 · por Sofía Méndez".

Si algún dato no aparece, el seed no se aplicó completo. Volver
al Paso 4 o 5.

---

## Paso 8 — Tomar las screenshots

**Objetivo**: las 8 capturas core siguiendo el brief, en una sola
sesión, todas coherentes entre sí.

**Tiempo estimado**: 60–90 minutos para las 8.

### Mecánica por captura

Para cada captura del brief (§2 del `landing-screenshots-brief.md`):

1. **Setup**: ir a la pantalla indicada en la sección
   correspondiente del brief.
2. **Verificar estado UX**: matchear EXACTAMENTE el "Estado UX a
   mostrar" del brief (productos, valores, métodos, etc.). Si algún
   detalle no matchea (ej. el carrito tiene otra combinación de
   productos), ajustar manualmente en la app antes de capturar.
3. **Limpieza pre-captura** (checklist 7.3).
4. **Capturar**:
   - Para capturas full viewport: en DevTools, abrir command palette
     con `Ctrl+Shift+P` (`Cmd+Shift+P` Mac) y tipear
     `Capture full size screenshot`. Enter.
   - Para capturas de un modal/elemento específico: en el panel
     Elements de DevTools, hacer right-click sobre el nodo que
     querés capturar → `Capture node screenshot`.
5. **Guardar** el PNG resultante en `public/landing/_raw/` con
   nombre coherente (ej. `01-hero-pos.png`).
6. **Revisar** la captura antes de pasar a la siguiente. Si hay
   algo raro (tooltip que apareció, scroll mal posicionado, datos
   inconsistentes), re-tomar inmediatamente — no acumular para
   después.

### Orden recomendado de captura

Para minimizar navegación entre pantallas:

1. **2.1 Hero POS** — en `/pos`, viewport desktop 1440×900.
2. **2.2 Cobrar con vuelto** — en `/pos`, sumar 3 productos al
   carrito hasta llegar a $2.580 (1× Sonrisas + 1× Cofler + 1×
   Pan), apretar Cobrar, tipear $5.000 en "Recibe", capturar el
   modal con node screenshot.
3. **2.8 POS mobile** — cambiar viewport a Pixel 7, sumar 3
   productos al carrito ($6.400 total), capturar full viewport.
   (Hacelo acá mientras ya estás en POS, evitás cambiar viewport
   varias veces.)
4. Volver a desktop 1440×900.
5. **2.4 Productos lista** — ir a `/productos`, modo lista. Full
   viewport.
6. **2.5 Detalle producto con lotes** — desde la lista, click en
   Yerba Playadito. Modal abre. Node screenshot del modal.
7. **2.6 Usuarios con roles** — ir a `/usuarios`. Full viewport.
8. **2.3 Caja cerrada** — ir a `/caja`. Full viewport (o node
   screenshot del bloque + tabla si querés más control).
9. **2.7 Ticket** — desde `/ventas`, abrir el detalle de cualquier
   venta cobrada. Capturar el TicketReceipt component.

### Si una captura no sale bien al primer intento

Es normal. Re-tomar es barato. Si después de 2 intentos sigue sin
quedar bien, posibles causas:

- **Estado UX no exacto al brief** → ajustar la app (sumar/quitar
  productos del carrito, etc.).
- **DevTools captura el viewport mal** (raro pero pasa) → cerrar
  y reabrir DevTools.
- **Producto/dato no aparece** → el seed no quedó completo, volver
  al Paso 5.

---

## Paso 9 — Optimizar y exportar a WebP

**Objetivo**: las capturas pesan poco, se ven nítidas, y van al
repo en `public/landing/`.

### Por qué WebP

PNG retina pesa 800KB-2MB por captura. WebP de calidad 85 baja a
~80-150KB con calidad visualmente idéntica. La landing carga
3–4x más rápido.

### Herramienta recomendada

**[squoosh.app](https://squoosh.app)** — herramienta web de Google,
gratis, interactiva. No requiere instalación.

Por captura:

1. Abrir squoosh.app.
2. Drag-drop el PNG original.
3. Panel derecho: cambiar formato a **WebP**.
4. **Quality: 85**.
5. Verificar el preview side-by-side — si ves degradación, subir
   a 90.
6. **Download** → guardar como `01-hero-pos.webp` (mismo nombre
   pero `.webp`).
7. Mover el `.webp` a `public/landing/`.

### Alternativa CLI

Si preferís comando:

```bash
# Instalar cwebp (Mac: brew install webp | Linux: apt install webp)
cwebp -q 85 public/landing/_raw/01-hero-pos.png \
      -o public/landing/01-hero-pos.webp
```

Para hacer todos juntos:

```bash
cd public/landing/_raw
for f in *.png; do
  cwebp -q 85 "$f" -o "../${f%.png}.webp"
done
```

### Validación

Cada `.webp` final debe pesar:

- Desktop captures: **<150KB** (idealmente <100KB).
- Mobile captures: **<80KB**.

Si pesa más, bajá la quality o achicá las dimensiones del PNG
original.

### Naming final

En `public/landing/`:

```
01-hero-pos.webp
02-cobrar-vuelto.webp
03-caja-cerrada.webp
04-productos-stock.webp
05-producto-lotes.webp
06-usuarios-roles.webp
07-ticket.webp
08-pos-mobile.webp
```

Los originales `.png` quedan en `public/landing/_raw/` (gitignored
— no se commitean al repo).

---

## Paso 10 — Checklist final antes de codear la landing

Antes de avisarme "listo para código", recorré este checklist:

### Coherencia entre capturas

- [ ] Mismo nombre de comercio en todos los headers/tickets visibles
      ("Kiosco El Faro").
- [ ] Mismos productos con mismos precios entre capturas (Coca
      $4.500 en todas, Oreo $1.250 en todas, etc.).
- [ ] Misma fecha visible donde aparece (todas tomadas en el mismo
      día).
- [ ] Mismo modo (todas en light, ninguna mezclada con dark).
- [ ] Mismos usuarios mencionados (Sofía / Martín / Laura, no
      "User 1").

### Calidad técnica

- [ ] Cada `.webp` está en `public/landing/` con el nombre exacto
      de la convención.
- [ ] Originales `.png` en `public/landing/_raw/` (no se commitean,
      solo para tu reproducción).
- [ ] Cada WebP pesa menos de 150KB desktop / 80KB mobile.
- [ ] Abriendo cada WebP a tamaño real, no se ve degradación
      visual.
- [ ] Ninguna captura tiene tooltips/notifications/modales
      accidentales.
- [ ] Ninguna captura tiene chrome del browser visible (address
      bar, tabs).
- [ ] Ninguna captura tiene DevTools visible.

### Narrativa

- [ ] Captura 2.1 (Hero) muestra carrito con productos argentinos
      reconocibles, total realista, botón Cobrar prominente.
- [ ] Captura 2.2 (Vuelto) muestra el cálculo automático en grande.
- [ ] Captura 2.3 (Caja cerrada) muestra hora + responsable + saldo
      + diferencia OK.
- [ ] Captura 2.4 (Stock) muestra LOS 4 ESTADOS visibles (SIN
      stock, CRÍTICO, BAJO, OK) en una sola imagen.
- [ ] Captura 2.5 (Lotes) muestra al menos 2-3 lotes con countdown
      distinto (lejos / cerca / mañana).
- [ ] Captura 2.6 (Usuarios) muestra 3 usuarios con roles claros
      + chip "Último admin" si Sofía es la única admin.
- [ ] Captura 2.7 (Ticket) muestra ticket con 4-5 productos
      argentinos y total realista.
- [ ] Captura 2.8 (Mobile) muestra el POS en aspect ratio mobile
      real con carrito poblado.

### Commitear

Cuando esté todo OK:

```bash
git add public/landing/*.webp
git commit -m "feat(landing): assets de capturas — Kiosco El Faro"
```

Push si corresponde, y avisame que está listo. Arrancamos código
inmediatamente.

---

## Cosas que pueden salir mal — y cómo resolverlas

| Síntoma | Causa probable | Fix |
|---|---|---|
| `seed:landing` falla con "relation does not exist" | Faltan migrations en staging | Volver al Paso 2 |
| Login en staging no funciona ("invalid credentials") | El seed no creó los users o falló a mitad | Re-correr `npm run seed:landing`, mirar el output |
| App apunta a producción cuando creía estar en staging | `.env.local` no se cambió | Verificar `Settings → API` del proyecto activo en el dashboard |
| Captura sale con bordes blancos raros | DevTools capturó más de lo que esperabas | Usar "Capture node screenshot" en vez de "full size" |
| WebP se ve degradado | Quality muy baja | Subir a 90 o 95 en squoosh |
| Fechas en capturas no coinciden | Capturaste en sesiones distintas | Re-tomar todas en una sola sesión (o aceptar la inconsistencia si es menor) |
| Producto/lote falta en la pantalla | El seed no terminó o se borró el comercio | Volver al Paso 4-5 |

---

## Una nota sobre disciplina

Vas a sentir tentación de "ajustar una captura en Photoshop"
cuando algo no salga perfecto. **Resistila.** Si una captura no se
ve bien tal como sale del producto, eso es información útil — algo
del producto necesita ajuste. Mejor pulir el producto antes de
fotografiar que disfrazar la foto.

Si encontrás cosas chicas para arreglar mientras capturás, anotalas
en una lista. Cuando termines, me las pasás y las arreglamos
juntos antes de codear la landing.

---

**Fin del runbook.** Cuando los `.webp` estén commiteados en
`public/landing/`, arrancamos el código de la landing.
