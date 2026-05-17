# Brief — Screenshots de la landing

Documento operativo para capturar las imágenes del producto que van
en la landing. Cada captura es un asset narrativo, no un "screenshot
genérico". Si una captura no cuenta una parte de la historia, no se
toma.

Estado: **listo para ejecutar.** Una vez generados los assets, se
guardan en `public/landing/` y se pasa a codear.

---

## 0. Principios — qué hace una captura "buena" para Sylvora

Antes de cada captura, chequear:

1. **¿Cuenta algo?** Cada imagen tiene un beat narrativo asignado
   (sección 2). Si no cuenta, no va.
2. **¿Parece real?** Productos argentinos con precios coherentes
   2026 (no "$100" abstracto, no "Product A"). Decimales que cuadran
   (vuelto bien calculado, totales bien sumados).
3. **¿Está viva?** No carrito vacío, no lista de 1 producto, no
   gráficos planos. La captura muestra el producto **en uso**.
4. **¿Es limpia?** Sin notificaciones del sistema operativo, sin
   pestañas del browser, sin extensiones de Chrome, sin barra de
   marcadores. El producto ocupa todo el frame.
5. **¿Es consistente?** Mismo comercio ficticio, mismos productos,
   mismos precios entre capturas. Si la coca cuesta $4.500 en una,
   cuesta $4.500 en todas.

**Sobre todo**: la captura tiene que dar la sensación de
"esto ya está pasando en un kiosco real ahora mismo", no de
"setup demo para una keynote".

---

## 1. El comercio ficticio — establecer el mundo

Para que TODAS las capturas sean coherentes, definimos primero el
comercio que vamos a mostrar.

### Identidad del comercio ficticio

- **Nombre**: "Kiosco El Faro" (sugerencia, podés cambiar — algo
  común, no aspiracional).
- **Tipo**: Kiosco / autoservicio chico en Argentina.
- **Dueño/responsable visible en capturas**: "Sofía Méndez"
  (admin). "Martín Vega" (empleado). Nombres comunes, neutrales.
- **Fecha del "día actual" en las capturas**: usar fecha real del
  día que se capturan, NO hardcoded. Así envejece bien (si dice
  "12 de mayo" todo el año, alguien lo va a notar).
- **Hora visible en capturas con timestamp**: entre 18:00 y 21:00
  (peak de actividad de un kiosco). NO mañana temprano (carrito
  vacío esperable, transmite "no funciona").

### Catálogo de productos del Kiosco El Faro

Lista cerrada de productos que aparecen en TODAS las capturas. No
inventar productos sueltos por captura.

| Producto | SKU | Precio venta | Stock |
|---|---|---|---|
| Coca-Cola 1.5L | KEF-001 | $4.500 | 24 |
| Coca-Cola 2.25L | KEF-002 | $6.200 | 8 |
| Galletitas Oreo 118g | KEF-003 | $1.250 | 36 |
| Galletitas Sonrisas 130g | KEF-004 | $980 | 5 (CRÍTICO) |
| Pan flauta unidad | KEF-005 | $850 | 18 |
| Yerba Playadito 1kg | KEF-006 | $3.800 | 12 |
| Cigarrillos Marlboro | KEF-007 | $4.200 | 40 |
| Alfajor Jorgito | KEF-008 | $650 | 22 |
| Agua Villavicencio 1.5L | KEF-009 | $1.800 | 0 (SIN STOCK) |
| Chocolate Cofler 30g | KEF-010 | $750 | 15 |
| Papas Lays 75g | KEF-011 | $1.450 | 28 |
| Leche La Serenísima 1L | KEF-012 | $1.950 | 9 (BAJO) |

Notas sobre los precios:
- Reflejan inflación AR 2026 razonable. No son aspiracionales ni
  retro.
- Múltiplos prolijos (terminan en $0 o $50). El kiosco real no
  usa centavos.
- Mezcla de precios bajos (caramelo $650) y medios (Coca $4.500)
  → da sensación de catálogo real.

Notas sobre los stocks:
- Cada estado visible (OK / Bajo / Crítico / Sin stock) está
  representado. Es lo que la captura de stock tiene que mostrar.
- Variación entre productos refuerza la sensación de "esto se
  usa todos los días".

### Categorías

- Bebidas
- Almacén
- Golosinas
- Snacks
- Cigarrillos

(5 categorías. Suficiente para que el filtro de categorías de
ProductFilters se vea poblado.)

### Empleados/usuarios para `/usuarios`

- **Sofía Méndez** — Administrador
- **Martín Vega** — Empleado
- **Laura Romero** — Empleado

(3 usuarios. Suficiente para que la tabla no se vea vacía, no tan
poblada que distraiga.)

---

## 2. Las capturas — narrativa por captura

Total: **8 capturas core + 2 opcionales**. Cada una está asignada
a una sección específica de la landing.

### 2.1 — Hero shot: POS cobrando ⭐ la más importante

**Sección de la landing**: 14b (Hero).
**Tamaño**: 1440×900 (capturar a viewport ~1440px, sin chrome).
**Estado UX a mostrar**:

- Layout: split POS (panel de búsqueda izquierda + carrito derecha)
  en viewport desktop wide.
- **Panel búsqueda izquierda**:
  - Input de búsqueda con texto tipeado: `galleti` (parcial, da
    sensación de "estoy buscando").
  - Resultados visibles: Galletitas Oreo, Galletitas Sonrisas.
  - Oreo destacada como hover/preseleccionada (border violet sutil).
  - Categorías visibles abajo o filtro de categoría con "Todas" o
    "Golosinas".
- **Panel carrito derecha**:
  - Título "Ticket" con icono 🛒.
  - 3 items:
    - 2× Coca-Cola 1.5L = $9.000
    - 1× Galletitas Oreo = $1.250
    - 1× Pan flauta = $850
  - Total visible: $11.100
- **Método de pago**:
  - 4 botones (Efectivo / Débito / Crédito / Mercado Pago).
  - "Efectivo" destacado en violet (active state).
- **Botón Cobrar**:
  - Verde gradient grande, dice "Cobrar $11.100".
  - Visible, llamativo, "listo para apretarse".

**Qué NO mostrar**:
- Tooltips de onboarding (cerrarlos antes de capturar si aparecen).
- Estados de error o warning.
- Modal abierto (esta captura es la vista "lista para cobrar", no
  "cobrando").
- Sidebar de la app — recortar para que solo aparezca el área POS.

**Por qué esta composición**:
- Muestra el flow completo en una sola imagen: buscar → carrito →
  cobrar.
- Productos argentinos reconocibles instantáneo.
- Total en monto realista de un ticket de kiosco real.
- El botón verde grande es el "happy place" — donde quiere llegar
  el cajero.

---

### 2.2 — Cobrando con efectivo + vuelto calculado

**Sección de la landing**: 14f Feature #1 ("Cobrá en segundos").
**Tamaño**: 800×600 o el crop natural del modal (sin pantalla
completa — solo el modal de cobrar enfocado).
**Estado UX a mostrar**:

- Modal de cobrar abierto.
- Total a cobrar: **$2.300** (algo simple, fácil de hacer el cambio
  mental: "le dio $5.000, le doy $2.700 de vuelto").
- Carrito visible al fondo (opacidad reducida) con 2 items:
  - 1× Galletitas Oreo $1.250
  - 1× Alfajor Jorgito $650
  - 1× Chocolate Cofler 30g $750 → wait, ese suma $2.650, ajustar.
  - **Corrección**: 1× Oreo $1.250 + 1× Pan flauta $850 + 1× Cofler
    $750 = $2.850 → tampoco.
  - **Final**: 1× Galletitas Sonrisas $980 + 1× Cofler $750 + 1×
    Pan flauta $850 = **$2.580**. Que el total sea $2.580.
- Input "Recibe": **$5.000** (un billete típico, mental math
  fácil).
- **Vuelto calculado en grande**: **$2.420** en verde, DM Mono.
- Método: Efectivo (destacado).
- Botón "Cobrar" verde abajo.

**Qué NO mostrar**:
- Estados de loading o "Procesando…".
- Errores de validación.
- Otros modales encimados.

**Por qué esta composición**:
- El "vuelto calculado solo" es el feature más fácil de entender
  para un cajero. Esta imagen lo demuestra en 1 segundo.
- Total y vuelto en cifras "redondas-pero-creíbles". Calcular un
  vuelto de $2.420 sobre $5.000 es exactamente lo que un cajero
  hace todo el día.

---

### 2.3 — Bloque "Caja cerrada" del header de Caja

**Sección de la landing**: 14d (Cómo funciona, paso 3) y 14f
Feature #3 ("Caja cerrada de verdad").
**Tamaño**: capturar el bloque de estado completo del header de
`/caja` cuando el día ya está cerrado. Crop del bloque + algo del
contexto arriba (h1 "Caja Diaria"). Ancho ~1100px.
**Estado UX a mostrar**:

- Bloque de estado en modo "Caja cerrada".
- Icon `CheckCircle` violet a la izquierda.
- Texto: "Caja cerrada · jueves 14 de mayo".
- Detalle (3 líneas):
  - "Cerrada a las **20:45** · por **Sofía Méndez**"
  - "Saldo neto: **$87.500** · Diferencia: **OK** (verde)"
  - "Retiro: **$50.000** · Queda en caja: **$12.300**"
- Botón "Reabrir caja" subtle a la derecha.

**Cálculos coherentes**:
- Ventas totales del día: $145.200 (ej.)
- Egresos: $57.700
- Saldo neto = ventas − egresos = **$87.500** ✓
- Efectivo contado: $62.300 (ej. depende de qué % fue efectivo).
- Retiro: $50.000.
- Queda en caja = contado − retiro = $62.300 − $50.000 = **$12.300** ✓
- Diferencia: OK (efectivo contado matcheó al esperado).

**Qué NO mostrar**:
- Estado "Caja abierta" (esta captura específica es para mostrar
  el cierre).
- Modal de reabrir abierto.
- Toast / banners encimados.

**Por qué esta composición**:
- Este bloque es **el momento más identitario del producto**: el
  cajero ve esto al final del día y sabe que cerró bien.
- Combina hora, responsable, números coherentes, y opción de
  reabrir. Cuenta toda la historia del cierre.
- Los números coherentes son críticos — si alguien suma y no le da,
  todo se rompe.

---

### 2.4 — Lista de productos con estados de stock

**Sección de la landing**: 14f Feature #2 ("Stock que te avisa") y
14d (Cómo funciona, paso 1).
**Tamaño**: capturar la vista `/productos` en modo lista (no
cards), recortar al área útil. ~1200×700.
**Estado UX a mostrar**:

- Vista lista de productos.
- Filtros visibles arriba (categoría = "Todas").
- ~8-10 filas de productos visibles, MOSTRANDO estados variados:
  - 1 producto SIN stock (Agua Villavicencio) → chip gris.
  - 2 productos CRÍTICO (Galletitas Sonrisas, otro) → chip rojo.
  - 2 productos BAJO (Leche, otro) → chip amarillo.
  - El resto OK → chip verde.
- Columnas visibles: Producto / SKU / Categoría / Precio / Stock /
  Estado.
- Botón "Nuevo producto" arriba a la derecha.

**Cálculos coherentes**:
- Que los stocks de cada producto matcheen exactamente la tabla
  del comercio ficticio (sección 1).

**Qué NO mostrar**:
- Tooltips, modales, hover states.
- Productos sin nombre / placeholders.
- Filtros activos que reducen a 1 fila (queremos ver variedad).

**Por qué esta composición**:
- Mostrar TODOS los estados de stock en una sola captura cuenta
  la historia del feature "stock que te avisa" sin necesidad de
  texto adicional.
- Los chips de colores son visualmente memorables — el dueño
  entiende sin leer.

---

### 2.5 — Detalle de producto con lotes y vencimiento

**Sección de la landing**: 14d (Cómo funciona, paso 1, alternativa)
o 14f Feature #2.
**Tamaño**: capturar el modal `ProductDetail` completo. ~600×800
(modal size md).
**Estado UX a mostrar**:

- Modal de detalle de un producto, ej. "Yerba Playadito 1kg".
- Hero del modal: imagen del producto (foto real de yerba si
  conseguís, o placeholder limpio).
- Datos principales: nombre, SKU, precio, stock.
- **Sección "Lotes"** mostrando 3 lotes con countdown:
  - Lote `L-2026-04-001` — vence en 45 días — color text2 (gris).
  - Lote `L-2026-05-002` — **Vence en 12 días** — color amarillo.
  - Lote `L-2026-05-003` — **Vence mañana** — color rojo.
- Botones de acción abajo: Editar / Borrar / Cerrar.

**Qué NO mostrar**:
- Productos sin lotes (no cuenta nada).
- Solo 1 lote (queremos mostrar variedad de countdown).
- Modales encimados.

**Por qué esta composición**:
- El countdown de vencimiento es feature único del producto. Esta
  captura lo destaca.
- 3 lotes con 3 estados distintos (lejos / cerca / mañana) cuenta
  la lógica completa en una imagen.

---

### 2.6 — Página `/usuarios` con roles

**Sección de la landing**: 14f Feature #4 ("Tu equipo, con
control").
**Tamaño**: vista completa de `/usuarios` recortada al área útil.
~1100×600.
**Estado UX a mostrar**:

- Header: "Usuarios" con count "3 usuarios · 1 admin".
- Botón "Invitar usuario" arriba a la derecha.
- Tabla con 3 filas:
  - **Sofía Méndez** — chip "Administrador" violet con ShieldCheck.
  - **Martín Vega** — chip "Empleado" verde.
  - **Laura Romero** — chip "Empleado" verde.
- Select de rol visible en cada fila (cerrados).
- Sofía con hint "Último admin — no se puede degradar" porque solo
  es ella sola? **Corrección**: si Sofía es la única admin, sí
  aparece el hint. Si querés mostrar que NO está el hint, agregás
  un segundo admin a la lista. Mi recomendación: dejar a Sofía
  como única admin con el hint visible — refuerza el "guard de
  último admin" como diferencial.

**Qué NO mostrar**:
- Modal de invitación abierto (es otra captura si la necesitamos).
- Estado de loading.
- Tabla vacía.

**Por qué esta composición**:
- Roles claros + guard de "último admin" → muestra que el sistema
  es **serio sobre control**, no juguete.
- 3 usuarios es suficiente para que se vea poblado sin saturar.

---

### 2.7 — Ticket de venta (TicketReceipt)

**Sección de la landing**: 14f Feature #5 ("Tickets
profesionales") y 14d (alternativa para paso 3).
**Tamaño**: capturar el componente `TicketReceipt` solo, no en
modal. Crop ajustado al ancho del ticket (~80mm que se ve como
~300-400px en pantalla). Aspect ratio alargado vertical.
**Estado UX a mostrar**:

- Header del ticket: "Kiosco El Faro" (o lo que sea el comercio
  ficticio).
- Fecha y hora: viernes 15 de mayo · 19:34
- Número de ticket: #0142
- Cajero: Martín Vega.
- Items del ticket (4-5 items para que se vea sustancial):
  - 1× Coca-Cola 1.5L — $4.500
  - 2× Galletitas Oreo — $2.500
  - 1× Yerba Playadito — $3.800
  - 1× Pan flauta — $850
  - 1× Chocolate Cofler — $750
- Subtotal: $12.400.
- Total: $12.400.
- Método: Efectivo.
- Footer: "¡Gracias por tu compra!" o lo que tenga el
  TicketReceipt actual.

**Qué NO mostrar**:
- Ticket vacío con 1 sola línea.
- Items con precios irracionales.

**Por qué esta composición**:
- El ticket es el artefacto físico que el cliente se lleva. Es
  prueba tangible de que el sistema funciona.
- Mostrarlo limpio + alargado + con productos reales transmite
  "esto sale por la impresora térmica real".

**Variante editorial opcional (2.7b)**:
Foto REAL del ticket saliendo de una impresora térmica de papel,
con la mano levemente visible. Esta foto reemplazaría la captura
del componente si se consigue. Pero solo si la foto sale bien
(iluminación pareja, sin reflejos raros, sin background distractor).
Si no, la captura del componente es suficiente.

---

### 2.8 — POS mobile (vista celular real)

**Sección de la landing**: 14f Feature #6 ("Funciona en cualquier
celular") + alternativa para hero mobile.
**Tamaño**: capturar viewport mobile real (375×812 iPhone 14 size,
o 393×852 Pixel/Android). NO usar herramientas de mockup, NO
agregar frame de teléfono.
**Estado UX a mostrar**:

- POS mobile con el carrito visible (panel inferior, no el
  buscador).
- 2-3 items en el carrito:
  - 1× Galletitas Oreo $1.250
  - 1× Coca-Cola 1.5L $4.500
  - 1× Alfajor Jorgito $650
- Total: $6.400.
- Métodos de pago visibles (en mobile el grid puede ser 2x2).
- Botón "Cobrar $6.400" verde grande abajo (sticky).

**Qué NO mostrar**:
- Status bar del sistema operativo (recortarla al capturar, o usar
  modo screenshot que la oculta).
- Modal de cantidad abierto.
- Estado de loading.

**Por qué esta composición**:
- Refuerza el mensaje "desde el celular" del headline.
- Aspect ratio mobile real → el dueño visualmente entiende "esto
  es lo que voy a usar".

**Variante editorial opcional (2.8b)**:
Foto REAL de una mano sosteniendo un celular con el POS visible.
Tomada cerca, en mostrador real (con un poco de mostrador de fondo
desenfocado). Si conseguís hacerla bien, es **la foto más
poderosa** de toda la landing — más que cualquier captura digital.
Pero requiere:
- Celular real (no maqueta).
- Iluminación natural decente.
- Background sutil (mostrador, productos desenfocados detrás).
- Sin caras visibles (privacidad).

Si la foto sale bien, va al hero como hero alternativo para
mobile. Si no, omitimos.

---

### 2.9 — Modal de invitar usuario (opcional)

**Sección de la landing**: 14f Feature #4 (refuerzo).
**Tamaño**: modal solo, ~480×600.
**Estado UX a mostrar**:

- Modal abierto sobre la página `/usuarios` (background blureado o
  con overlay sutil).
- Title: "Invitar usuario".
- Texto descriptivo arriba: "Se va a enviar un email con un link
  mágico..."
- Form rellenado parcialmente:
  - Email: `laura.romero@gmail.com`
  - Nombre: `Laura Romero`
  - Rol select: `Empleado`
- Botones footer: Cancelar / "Enviar invitación".

**Por qué opcional**:
La feature de "tu equipo con control" ya está cubierta por la
captura 2.6. Esta es bonus si querés mostrar el invite flow
específicamente.

**Mi voto**: omitirla en V1. Si la feature 4 necesita refuerzo
visual, ya tenemos 2.6.

---

### 2.10 — Dashboard / Reportes (opcional)

**Sección de la landing**: ninguna específica todavía.
**Por qué opcional**:
El dashboard tiene charts de recharts que pueden no verse bien en
landing (líneas finas, ejes con colores no tokenizados que se ven
mal). Es más riesgo que beneficio. Si querés mostrar "Sylvora te
da datos", el bloque "Caja cerrada" (2.3) ya transmite eso.

**Mi voto**: omitir en V1.

---

## 3. Resumen — qué capturas vamos a tomar

| # | Captura | Sección landing | Prioridad |
|---|---|---|---|
| 2.1 | Hero POS desktop | 14b | **Crítica** |
| 2.2 | Cobrar con vuelto | 14f-1 | **Crítica** |
| 2.3 | Bloque caja cerrada | 14d-3, 14f-3 | **Crítica** |
| 2.4 | Lista productos con stocks | 14f-2, 14d-1 | **Crítica** |
| 2.5 | Detalle producto con lotes | 14f-2 | Alta |
| 2.6 | /usuarios con roles | 14f-4 | Alta |
| 2.7 | Ticket TicketReceipt | 14f-5, 14d-3 | Alta |
| 2.8 | POS mobile | 14f-6, hero mobile | Alta |
| 2.7b | Foto ticket impreso real | (reemplaza 2.7 si sale bien) | Opcional |
| 2.8b | Foto celular + mano | (reemplaza 2.8 si sale bien) | Opcional |
| 2.9 | Modal invitar | 14f-4 refuerzo | **Omitir V1** |
| 2.10 | Dashboard | — | **Omitir V1** |

**Total**: 8 capturas core + 2 fotos editoriales opcionales.

**Disciplina aplicada**: 6 capturas por debajo de las que serían
fáciles de tomar. Cada una con propósito narrativo claro.

---

## 4. Setup técnico para capturar

### Resoluciones por viewport

| Viewport | Resolución de captura | Resolución final WebP |
|---|---|---|
| Desktop wide | 1440×900 (browser ventana) | 1440×900 @ 1x |
| Desktop crop | viewport real | 1100-1200 ancho según componente |
| Modal | viewport ajustado | crop tight al modal |
| Mobile | 393×852 (Pixel 7) o 375×812 (iPhone) | 1x |

Capturar a **densidad 2x (retina)** para que se vean nítidos en
displays HiDPI. La herramienta (Chrome DevTools, macOS screenshot
nativo) lo hace automático en displays retina.

### Cómo capturar limpio en Chrome (recomendado)

1. **Chrome DevTools → Device Mode** (Cmd+Shift+M / Ctrl+Shift+M).
2. Setear viewport custom según necesidad:
   - Desktop: 1440×900 (responsive mode, sin device específico).
   - Mobile: Pixel 7 preset (393×852) o iPhone 14 (390×844).
3. **Capturar full-page screenshot**:
   - DevTools Cmd Palette: `Cmd+Shift+P` → "Capture full size
     screenshot".
   - O "Capture node screenshot" para capturar un elemento
     específico (modal, card).
4. **Sin chrome del browser** — DevTools captura solo el viewport
   del sitio, no el address bar.

### Limpieza pre-captura — checklist obligatorio

- [ ] Tema light mode.
- [ ] Sin DevTools abierta (toggle off).
- [ ] Sidebar de la app en estado normal (no en hover ni
      expanded).
- [ ] Sin tooltips ni hovers activos.
- [ ] Sin modales abiertos (salvo capturas que SÍ los muestran).
- [ ] Sin notificaciones / toasts visibles (esperar que se
      autodescarten).
- [ ] Browser extensions deshabilitadas / modo incógnito.
- [ ] Idioma del sistema: español (formato fechas / moneda
      correcto).
- [ ] Zoom del browser al 100%.

### Datos del Kiosco El Faro — cómo cargarlos

**Opción A** (recomendada): Crear un seed SQL que inserte el
comercio ficticio + productos + categorías + usuarios + lotes con
fechas calculadas relativas a `now()` (para que el countdown sea
preciso al momento de capturar).

**Opción B**: Cargar manualmente desde el admin. Más lento, propenso
a errores de tipeo en precios/stocks.

**Mi voto: A.** Crear `scripts/seed-landing.sql` que dejamos en el
repo (gitignored del deploy real). Se puede correr en una DB de
staging dedicada a generar capturas.

### Carpeta y nomenclatura de outputs

Guardar en `public/landing/`:

```
public/landing/
├── 01-hero-pos.webp                  (2.1)
├── 02-cobrar-vuelto.webp             (2.2)
├── 03-caja-cerrada.webp              (2.3)
├── 04-productos-stock.webp           (2.4)
├── 05-producto-lotes.webp            (2.5)
├── 06-usuarios-roles.webp            (2.6)
├── 07-ticket.webp                    (2.7)
├── 08-pos-mobile.webp                (2.8)
├── 07b-ticket-foto.webp              (opcional)
├── 08b-celular-mano.webp             (opcional)
└── _raw/
    ├── 01-hero-pos.png               (originales sin optimizar)
    └── ...
```

**Naming**: número-descripción-corta.webp. El número refleja el
orden narrativo en la landing.

### Optimización antes de subir

- Convertir PNG → WebP con calidad 85.
- Target peso: ≤100KB por captura desktop, ≤60KB mobile.
- Verificar que no se vea degradado (artifacts visibles).
- Mantener PNG original en `_raw/` por si hay que re-exportar.

Herramientas: `cwebp -q 85 input.png -o output.webp` o
[squoosh.app](https://squoosh.app/) interactivo.

---

## 5. Consistencia entre capturas — reglas duras

Estas reglas se aplican a TODAS las capturas. Romper una rompe la
coherencia narrativa.

1. **Misma fecha del "día actual"** en todas las capturas. Tomarlas
   en una sola sesión, en una sola jornada.
2. **Mismo comercio (Kiosco El Faro)** en headers, tickets, perfiles.
3. **Mismos productos con mismos precios**. Si la Coca 1.5L cuesta
   $4.500 en la 2.1, también cuesta $4.500 en la 2.7.
4. **Mismos usuarios (Sofía, Martín, Laura)** en cualquier captura
   que muestre nombres de cajero / responsable.
5. **Tema light**, sin excepción.
6. **Viewport horizontal full o crop ajustado**, sin black bars ni
   gris de DevTools.
7. **Mismo nivel de "fullness" de carrito**: 3-5 items, no 1 ni
   15.

---

## 6. Estrategia mobile vs desktop — qué muestra cada uno

Decisión arquitectural: **mostrar AMBOS, pero con propósitos
distintos**.

| Captura | Desktop | Mobile |
|---|---|---|
| Hero (2.1) | **Sí** — vista wide muestra "es un sistema completo". | **Sí, alternativa** (2.8) — refuerza el "desde el celular" del headline. |
| Cobrar (2.2) | **Sí** — modal con vuelto, claro y grande. | No necesaria, 2.2 funciona en ambos viewports al renderizarse responsive en la landing. |
| Caja cerrada (2.3) | **Sí** — bloque con detalles. | No necesaria. |
| Productos lista (2.4) | **Sí**. | No necesaria. |
| Producto detalle (2.5) | **Sí**, modal. | No necesaria. |
| Usuarios (2.6) | **Sí**. | No necesaria. |
| Ticket (2.7) | **Sí**, formato vertical. | Lo mismo. |
| POS mobile (2.8) | — | **Sí** — exclusiva mobile. |

**Conclusión**: tomamos **2.1 a 2.7 en desktop**, **2.8 en mobile**.
En la landing, las 2.1 a 2.7 se sirven igual en cualquier viewport
(la imagen se escala). La 2.8 se sirve **solo cuando se necesita el
viewport mobile**.

**Excepción**: el hero. La 2.1 (desktop) puede no leerse bien en
mobile chico (detalles muy chicos al achicarse). En ese caso,
servimos la 2.8 al hero mobile y la 2.1 al hero desktop. Esto es
**responsive image swapping**, no "comprimir la misma imagen".

---

## 7. Qué NO hacer

Lista explícita de errores comunes a evitar:

- **Capturar con datos genéricos** ("Producto 1", "$100", "User X").
  Mata credibilidad instantáneo.
- **Carrito con 1 producto**. Da sensación de "demo", no de uso real.
- **Capturar el sidebar de la app dentro del frame** del screenshot
  (a menos que sea relevante a la sección). Recortar.
- **Capturar la barra del browser** (URL, tabs, marcadores).
- **Capturar con DevTools abierta**.
- **Editar/manipular la captura en Photoshop** para "embellecer"
  más allá de optimización (cambiar colores, ajustar contraste
  agresivo, etc.). Si la captura no se ve bien tal cual sale,
  arreglar el producto, no la imagen.
- **Mockups fake de teléfono** (recordatorio del spec — esto NO
  se hace).
- **Tilt 3D / rotación isométrica** de las capturas. Las imágenes
  van planas, frontales.
- **Capturas en horario "muerto"** del comercio (8 AM, carrito
  vacío). Captura en horario de actividad real.
- **Capturas con bugs visibles** (textos cortados, layout roto,
  errores de consola visibles). Si hay un bug, arreglarlo antes
  de capturar.

---

## 8. Próximos pasos operativos

1. **Crear el seed SQL** `scripts/seed-landing.sql` con datos del
   Kiosco El Faro (~30 minutos).
2. **Setear una DB de staging Supabase** (proyecto separado, gratis
   tier alcanza) dedicada a capturas. Aplicar las migrations + el
   seed.
3. **Loguearse como Sofía Méndez (admin)** en esa DB de staging.
4. **Capturar las 8 capturas core** en una sola sesión (~1-2
   horas).
5. **Opcional**: intentar las 2 fotos editoriales (ticket impreso,
   mano + celular). Si no salen bien, se omiten sin drama.
6. **Optimizar a WebP** las 8 capturas.
7. **Guardar en `public/landing/`** con la nomenclatura definida.
8. **Validación final**: abrir las 8 capturas seguidas, mirar
   coherencia (fechas, precios, productos). Si algo desentona,
   re-tomar.
9. **Listo para codear** la landing.

Estimado total: **medio día** entre seed + setup + capturas +
optimización.
