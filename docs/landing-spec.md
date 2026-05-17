# Spec — Landing de Sylvora

Estado: **propuesta, primera versión.** Pendiente de feedback antes de
empezar a diseñar/codear.

---

## 0. Resumen de un párrafo

La landing tiene que vender a un dueño de kiosco/minimarket/almacén
de barrio en LATAM que entre desde el celular, en 30 segundos, una
sola idea: *"esto te ordena la caja y te avisa cuando se acaba el
stock, y arranca gratis en tu celular sin tarjeta."* Cualquier cosa
que no aporte a esa idea es ruido y la sacamos.

---

## 1. Audiencia y dolor real

### A quién le hablamos

- **Dueño de kiosco / minimarket / almacén** (decisor + usuario).
- 1–3 empleados (a veces familia).
- Factura entre AR$3M–AR$15M/mes (de un kiosco chico a un
  autoservicio de barrio).
- 35–60 años, no tech-savvy, **opera todo desde el celular**.
- Comunica por WhatsApp. Aprende mirando videos cortos.
- Usa Excel/cuaderno/Mercado Pago QR. Algunos probaron sistemas más
  grandes y los dejaron por complejos.

### Dolores en orden de intensidad

1. **No sabe cuánto vendió hoy ni dónde está la plata.**
   "Sé que cobré, pero no sé cuánto neto me quedó."
2. **El stock se le acaba sin avisar.**
   Pierde ventas, productos vencidos, mercadería estancada.
3. **El empleado puede hacer cualquier cosa con la caja.**
   No tiene control de quién anuló qué, ni a qué hora cerró.
4. **Sumar mal y dar mal el vuelto.** Errores diarios = plata perdida.
5. **Los sistemas grandes son caros, complicados, o solo desktop.**
   No quiere instalar nada, no quiere comprar una compu.

### Lo que NO le importa (no obsesionarnos)

- Integraciones complejas (AFIP fiscal, e-commerce, marketplaces).
- Multi-comercio / multi-sucursal (futuro).
- Reportes BI sofisticados.
- API / webhooks / customización.
- "Powered by AI".

---

## 2. La idea central — un solo mensaje

**"Cobrá, controlá stock y cerrá tu caja desde el celular."**

Tres verbos accionables, en orden de prioridad para el target. Es la
brújula: cada sección de la landing tiene que reforzar uno de estos
tres o salir del scope.

Submensaje (más chico, debajo): *"Hecho para kioscos, almacenes y
minimarkets. Empezás gratis en 2 minutos, sin tarjeta."*

### Por qué este wording

- "Cobrá": acción primaria, la que pega el cajero todo el día.
  Resonante.
- "Controlá stock": el dolor #2.
- "Cerrá tu caja": el dolor #1 (saber cuánto vendiste hoy).
- "Desde el celular": diferenciador inmediato vs los sistemas que
  conoce (caros, desktop, con hardware caro).

Lo descarté: "Tu punto de venta digital", "Gestioná tu comercio",
"Todo en uno". Todos genéricos, no movilizan.

---

## 3. Los primeros 5 segundos

Cuando el dueño abre la landing en el celular, **sin scrollear**,
tiene que ver:

```
┌─────────────────────────────────────┐
│  Sylvora                  [Entrar] │ ← nav minimal, login esquina
│─────────────────────────────────────│
│                                     │
│  Cobrá, controlá stock              │ ← H1, grande
│  y cerrá tu caja                    │
│  desde el celular.                  │
│                                     │
│  Hecho para kioscos, almacenes      │ ← sub, gris
│  y minimarkets.                     │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  Probar 30 días gratis    →  │   │ ← CTA primario grande
│  └──────────────────────────────┘   │
│  Sin tarjeta · 2 min                │ ← micro-trust
│                                     │
│  [ screenshot real del POS con      │ ← visual product proof
│    productos argentinos reales,     │
│    en mockup de celular ]           │
│                                     │
└─────────────────────────────────────┘
```

### Las 5 preguntas que tiene que responder el hero

1. **¿Qué es?** → POS móvil. (titular)
2. **¿Para quién?** → Comercios chicos. (sub)
3. **¿Cuánto cuesta?** → Empezás gratis. (micro-trust)
4. **¿Cómo empiezo?** → Apretás el botón. (CTA)
5. **¿Es real?** → Mostrar el producto, no ilustración. (screenshot)

### Lo que NO va en el hero

- Logos de inversores / "as seen on" (no aplica).
- Métricas tipo "+5.000 comercios" si no son reales.
- Video autoplay (es mobile, datos limitados, autoplay molesta).
- Stack tecnológico ("Powered by Next.js"). No le importa.
- "Schedule a demo". Esto no es B2B enterprise.

---

## 4. Estructura de secciones (orden completo)

```
1. HERO                       — mensaje + CTA + visual
2. EL PROBLEMA                — empatía, sin tecnicismos
3. CÓMO FUNCIONA              — 3 pasos en visual claro
4. PARA QUIÉN ES              — kiosco / minimarket / almacén
5. LO QUE PODÉS HACER         — features como "qué resuelven"
6. PRUEBA SOCIAL              — testimonios reales (si los hay)
7. PRECIO                     — 1 plan, transparente, simple
8. PREGUNTAS FRECUENTES       — objeciones reales contestadas
9. CTA FINAL                  — el "último empujón"
10. FOOTER                    — minimal
```

### 4.1 Hero

Cubierto en sección 3.

### 4.2 El problema

**Título**: *"Hoy seguramente perdés plata sin darte cuenta."*

3 viñetas con icono + frase corta:

- 💸 Sumás mal el vuelto y se pierden cientos al día.
- 📦 Se te acaba un producto que vendía como pan caliente.
- 🌙 Cerrás caja a las 11 de la noche y no sabés cuánto te quedó.

**No**: "Optimizá tu gestión", "Centralizá tu operación".
**Sí**: frases que el dueño dice en voz alta cuando se queja.

### 4.3 Cómo funciona — 3 pasos

Visual: 3 columnas (mobile: stack vertical), cada una con un mini-
screenshot real:

1. **Cargás tus productos.** Una vez. Foto, precio, stock.
   [screenshot: pantalla productos]
2. **Cobrás desde el celular.** Tu empleado solo necesita su teléfono.
   [screenshot: POS cobrando con efectivo + vuelto]
3. **Al final del día, cerrás caja.** Ves qué vendiste, qué te falta,
   qué ganaste.
   [screenshot: bloque "Caja cerrada" del rework actual]

Bloque súper visual. **No texto largo.** Cada paso = 1 frase + 1
captura.

### 4.4 Para quién es

Tres "personas" con foto/ilustración mínima:

- **Kiosco** — "Cobrar rápido, controlar gaseosas y golosinas."
- **Minimarket / autoservicio** — "Gestionar 200+ productos, precios
  por kg, vencimientos."
- **Almacén de barrio** — "Caja diaria, cuenta corriente* y stock al
  día." (*si no está la feature, sacar)

Por qué importa: ayuda al dueño a auto-identificarse ("ah, esto es
para mí"). Específico > genérico.

### 4.5 Lo que podés hacer — features como soluciones

NO listar features tipo "Punto de venta · Gestión de stock · Reportes".
SÍ presentar cada una como **el problema que resuelve**:

| Headline | Sub | Visual |
|---|---|---|
| **Cobrá en segundos** | Efectivo, débito, crédito, Mercado Pago. Calcula el vuelto solo. | screenshot POS cobrar |
| **Stock que te avisa** | Te marca los productos por agotarse y los que están por vencer. | screenshot Stock con chips críticos |
| **Caja cerrada de verdad** | Al final del día sabés exactamente cuánto vendiste, cuánto retiraste y cuánto queda. | screenshot bloque caja cerrada |
| **Tu equipo, con control** | Cada empleado tiene su cuenta. Vos decidís qué puede hacer cada uno. | screenshot /usuarios o gating |
| **Tickets profesionales** | Imprimís ticket o lo mandás por WhatsApp. | screenshot del TicketReceipt |
| **Funciona offline (parcial)** | *si Service Worker está, prometer; si no, sacar.* | — |

5–6 cards. Más no.

### 4.6 Prueba social

**Si HAY testimonios reales:**
3 cards con foto + nombre + comercio + frase corta. Ej:

> "Antes anotaba todo en un cuaderno. Ahora cierro caja en 2 minutos
> y sé cuánto vendí."
> — **Juan Pérez**, Kiosco San Martín (Mar del Plata)

**Si NO hay testimonios reales (estado actual):**
- **NO inventar**. Es muerte de credibilidad si lo detectan.
- Reemplazar por "Diseñado con cajeros y dueños reales de
  comercios argentinos" + 2-3 fotos de comercios reales (con permiso)
  o stock photos genéricos pero realistas.
- O directamente saltar esta sección hasta tener testimonios.

### 4.7 Precio

**Título**: *"Un precio. Cero sorpresas."*

```
┌──────────────────────────────────────┐
│  GRATIS POR 30 DÍAS                  │
│                                       │
│  Sin tarjeta de crédito              │
│  Sin instalación                     │
│  Todas las funciones                 │
│                                       │
│  Después: AR$<X>/mes                 │
│  Usuarios ilimitados                 │
│  Soporte por WhatsApp                │
│                                       │
│  [ Empezar gratis ]                  │
└──────────────────────────────────────┘
```

Un solo plan. Sin tiers. Sin "Pro / Business / Enterprise".

Por qué un solo plan en V1: la audiencia no quiere comparar
features, quiere saber si entra o no. Cuando aparezca un cliente que
pida "multi-sucursal", introducís un tier superior. No antes.

Monto exacto **a definir con vos** — opciones para discutir:

- AR$10.000/mes → barato, casi impulse buy. Riesgo: percepción de
  "es muy barato, debe ser malo".
- AR$15.000–20.000/mes → ~2 cajas de cigarrillos. Balanceado.
- AR$25.000+/mes → premium feel, requiere onboarding más
  cuidado y soporte.

Ancla mental: lo que paga por su línea de celular (~AR$10–20k).

### 4.8 Preguntas frecuentes

8–10 preguntas que el dueño REALMENTE se hace. Tono conversacional:

- ¿Tengo que comprar algo además del celular?
  → No. Si tu celular tiene cámara y conexión, ya está.
- ¿Funciona con cualquier impresora?
  → Con cualquier impresora térmica 80mm con USB o Bluetooth.
- ¿Y si se me corta internet?
  → *(responder según estado real del Service Worker)*
- ¿Qué pasa con mis datos si dejo de usarlo?
  → Te los exportamos en Excel y los borramos. Son tuyos.
- ¿Pueden ver mis ventas otras personas?
  → Solo vos y los empleados que invites con tu cuenta.
- ¿Sirve para vender por peso (kg/L)?
  → Sí, podés vender por kilo, litro o metro.
- ¿Puedo anular una venta?
  → Sí, pero solo los administradores.
- ¿Cómo pago? ¿Me debitan automáticamente?
  → *(definir: MP, transferencia, etc.)*
- ¿Hay contrato?
  → No. Pagás mes a mes. Cancelás cuando quieras.

**Cada respuesta**: máximo 2 frases. Cero corporate-speak.

### 4.9 CTA final

Sección corta, fondo violeta brand, una sola CTA visible:

> ### Probalo este sábado.
> En 2 minutos tenés tu primera venta cobrada.
>
> [ Empezar gratis ]
> Sin tarjeta. Sin instalación.

Por qué "este sábado": especifica un día concreto. "Probalo ahora"
es abstracto. "Este sábado" se imagina haciéndolo. Funciona.

### 4.10 Footer

Minimalist:
- Sylvora © 2026
- Términos · Privacidad · Contacto (WhatsApp link)
- Link social (Instagram si hay)

**No** sitemap, "press kit", "investors", "careers". Innecesario.

---

## 5. Visual direction

### Paleta

- **Fondo principal**: `var(--bg)` = `#f5f4f0` (warm off-white,
  consistente con la app).
- **Acento**: `var(--ac)` = `#5b4cff` brand violeta. Para CTAs +
  highlights.
- **Texto**: `var(--text)` = `#1a1a1e`, `var(--text2)` = `#6b6b72`.
- **Verde success / rojo danger**: usar SOLO en screenshots, no en
  chrome de la landing.
- **Gradients**: max 1, sutilísimo, en CTA final. No abusar.

### Tipografía

- **Headlines**: DM Sans, weight 700–800, letter-spacing -0.02 a
  -0.03em, leading apretado. Tamaños: H1 desktop 64–80px, mobile
  36–44px.
- **Body**: DM Sans, 500–600, 16–18px desktop / 14–16px mobile.
- **Numbers / dinero**: DM Mono. Consistente con la app.
- **Micro-text**: 11–12px, color `--text2`.

### Imagery — sin mockups fake, screenshots como producto real

**Decisión confirmada**: NO usar el clásico mockup tipo ventana macOS
con barra negra arriba y los tres botones rojo/amarillo/verde. Es un
cliché de template que delata "ilustración de producto" en vez de
"producto". Mata exactamente la credibilidad que estamos buscando.

**Cómo mostramos los screenshots en su lugar:**

- **Screenshots integrados directamente**, sin chrome de browser ni
  chrome de OS. La captura ES la imagen.
- **Border radius generoso** (16–20px) en las esquinas del screenshot,
  para que no se vea como "captura cuadrada pegada al fondo".
- **Border de 1px** sutilísimo (`rgba(0,0,0,0.06)`) que recorta el
  screenshot del fondo de la página sin que se note.
- **Shadow de 2 capas, muy difusa**, tipo:
  `0 4px 16px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.06)`
  → la captura "flota" un poquito, no parece pegada con scotch.
- **El fondo de la landing** (`#f5f4f0`) se ve a través del shadow,
  no es shadow contra blanco puro. Eso es lo que da el feel editorial.
- **Sin tilt / rotación 3D**. La captura va plana, frontal. Las
  rotaciones isométricas también son cliché de template.
- **Sin "frame" de teléfono físico** tipo "este es un iPhone".
  Si mostramos mobile, el screenshot del POS mobile va solo, con
  el mismo tratamiento (radius + border + shadow). El user
  reconoce que es mobile por el aspect ratio y el contenido, no
  porque le pongamos un dibujo de teléfono.

**Excepción mínima**: si en alguna sección queremos enfatizar que
es mobile (ej. el hero secundario "funciona desde el celular"),
podemos mostrar UNA foto real (no ilustración) de una mano
sosteniendo un teléfono real con el POS en pantalla. **Una sola foto
así en toda la landing**, no más.

**Composición**:

- Screenshots en sus aspect ratios reales (desktop 16:10 o 16:9,
  mobile 9:19.5 aprox). No forzar cuadrados ni stretching.
- Una captura por sección, grande, protagonista — no grids de 4
  miniaturas tipo "feature gallery".
- En el hero la captura puede ocupar 50–60% del ancho desktop, full
  width en mobile.

**Ilustraciones / iconos**:

- **Cero ilustraciones flat genéricas** (personas con laptops
  flotando, plantas, oficinas isométricas, etc.).
- **Iconos**: lucide-react (mismo set que la app), tamaño contenido,
  monocromo `var(--text2)`. Solo cuando refuerzan, no como adorno.
- **Emoji**: con criterio. 1-2 en toda la landing como mucho, en
  el lugar correcto (ej. CTA final, sección problema). No en cada
  título.

### Tono visual — editorial, no template

- **Aireado**, mucho whitespace. La landing respira.
- **Densidad de texto baja**: cada sección tiene una idea, no un
  ensayo.
- **Borders sutilísimos** `rgba(0,0,0,0.06)`, casi imperceptibles.
  No "boxes con borde marcado".
- **Sombras suaves de 2 capas** (definidas arriba). Nunca shadow
  dura tipo `0 2px 4px rgba(0,0,0,0.2)`.
- **Cards rounded** `var(--radius-lg)` = 18px.
- **Grids con gap generoso** (32–48px en desktop, 24px mobile).
- **Color dominante = warm off-white**. El violeta brand aparece
  acentuado: CTAs, links, 1-2 highlights, y eso es todo. Si
  llenás de violeta se siente "Stripe genérico".
- **Sin "glassmorphism", "neumorphism", gradients ruidosos,
  blur backgrounds**. Atemporal > trendy.

**Referencias mentales** (no copiar, mirar para sintonizar):
- Linear, pero menos "tech" y más "comercial".
- Stripe, pero menos corporate.
- Pacific.app, Plain.com — el feel "editorial moderno limpio".

**Anti-referencias** (NO parecernos):
- Salesforce, SAP, Tango: tech enterprise viejo.
- Cualquier landing con "Hero illustration" de figuras humanas
  flotando.
- Cualquier "AI-powered" / "All-in-one" con badges de "Featured on
  Product Hunt".

### Animaciones

- Fade-in sutil al scrollear (intersection observer).
- Hover states discretos en CTAs.
- **No** parallax (rompe mobile).
- **No** auto-play video.
- **No** carrouseles (los dueños no rotan, leen lineal).

---

## 6. Mobile-first specifics

70%+ del tráfico va a entrar de mobile (link de WhatsApp, redes).
Diseñar mobile primero, expandir a desktop:

- Breakpoints: 360px, 768px, 1024px+.
- Hero H1 cabe en 2 líneas en 360px.
- CTAs full-width en mobile, ≥48px de alto.
- **Sticky CTA bottom bar** opcional cuando el user scrollea pasa el
  hero (siempre tenés "Probar gratis" a mano). Probar A/B después.
- Cada section tiene un punto de "respiro" — no marear con
  scroll-jacking.
- Touch targets ≥44×44px.
- Imágenes lazy-loaded, máx 100KB cada una. WebP/AVIF.
- Sin hover states críticos (móvil no tiene hover).

---

## 7. Screenshots — qué tomar

Lista priorizada para sacar capturas del producto actual. Cada una
va con el tratamiento editorial definido en sección 5: radius
generoso + border sutil + shadow difusa de 2 capas, SIN mockup
de ventana ni frame de teléfono.

1. **POS cobrando** con productos reales (Galletitas Oreo, Coca,
   etc.) — el hero shot. Aspect ratio del viewport real (desktop o
   mobile, no recortar).
2. **Modal de cobrar** con efectivo + vuelto calculado destacado.
3. **Bloque "Caja cerrada"** del rework reciente (con responsable
   + hora + saldo).
4. **Lista de productos** con chip "Crítico" en rojo y "OK" en
   verde.
5. **Detalle de producto** con lotes + vencimiento ("Vence en 5
   días" amarillo).
6. **Ticket impreso**: dos opciones — (a) screenshot del
   TicketReceipt en pantalla con el tratamiento editorial, o (b)
   foto real del papel térmico saliendo de la impresora. La (b)
   es más poderosa si conseguís impresora térmica + buena foto,
   pero opcional.
7. **Mobile real**: una sola foto editorial (no mockup, no frame)
   de un celular real sostenido por una mano, mostrando el POS.
   Reservada para enfatizar "funciona desde el celular" en una
   sola sección — no abusar.

**Cómo prepararlas**:

- **Data dummy realista** con productos argentinos y precios
  coherentes ($4.200 una Coca de 1.5L, no $42 ni $4.200.000).
- **Sin nombres de empleados reales** (privacidad).
- **Sin pantallas vacías ni Lorem ipsum**. Si la captura sale
  pobre (carrito vacío, lista de 2 productos), no la usamos.
- **Resolución 2x retina** mínimo.
- **Recorte limpio** sin chrome del browser ni address bar.
- **Mismo modo (light)** en toda la landing. No mezclar light
  con dark dentro de capturas.
- Exportar **WebP** optimizado, fallback PNG. Apuntar a
  <100KB por captura.

Capturas en **modo claro** (el target casi seguro usa light). Dark
mode lo dejamos para una sección secundaria.

### Cómo prepararlas

- Data dummy con productos argentinos reales y precios coherentes.
- Sin nombres de empleados reales (privacidad).
- Resolución 2x para retina.
- Recorte limpio, sin chrome del browser.
- Exportar PNG/WebP optimizado.

---

## 8. Qué NO mostrar

Lista explícita para evitar:

- Pantallas vacías o con Lorem ipsum.
- Features no implementadas o medio rotas (ej. dark mode si tiene
  bugs).
- Comparativas vs competidores ("vs Bsale", "vs Tango").
- Listas de 30 features tipo "+ todo lo que necesitás".
- Dashboards aspiracionales que no representan el producto real.
- Tecnología por debajo ("powered by AI", "real-time sync"). No
  vende.
- Sección Enterprise. No es el target.
- Logos de "as featured in" si no son reales.
- Newsletter signup. No vino a leer un blog.
- Cookie banner gigante intrusivo (mínimo legal y listo).

---

## 9. Pricing & free trial strategy

### Recomendación

- **30 días free trial.** Tiempo suficiente para vivir 1 ciclo
  completo (lunes a lunes × 4 + cierre mensual).
- **Sin tarjeta de crédito al signup.** Decisivo.
- **Un solo plan** con todo incluido.
- **Después del trial**: paywall blando — el user sigue viendo sus
  datos pero no puede cobrar/cerrar caja hasta pagar.
- **Pago**: Mercado Pago suscripción (preautorización) o
  transferencia mensual. Empezar con MP por adopción.

### Por qué NO pedir tarjeta

- En LATAM la mayoría no tiene tarjeta internacional / Stripe-ready.
- Tarjeta al signup convierte 70–80% peor.
- Pedirla implica "te voy a cobrar cuando no estés mirando" y
  desconfianza.
- Pedir tarjeta al final del trial (día 28) cuando ya ves valor =
  conversion mucho mejor.

### Mecánica del trial

- Día 0: signup → acceso completo.
- Día 0–25: silencio (no spam de "te quedan X días").
- Día 25: email "Tu prueba termina en 5 días. Mantené tu cuenta
  activa por AR$X/mes. [Pagar]".
- Día 28: in-app banner sutil "Tu prueba termina en 2 días".
- Día 30: paywall. UI sigue navegable pero acciones críticas
  bloqueadas. Botón "Reactivar" gigante. Data se conserva 90 días.
- Día 120: si no pagó, anonimizar + borrar. Email de aviso 30 días
  antes.

### Métricas a trackear

- Signup rate (visitas → cuenta creada).
- Activación (cuenta creada → primera venta cobrada).
- Retención día 7, día 30.
- Conversión trial → pago.
- Churn mensual.

---

## 10. Onboarding desde landing hasta primera venta

Flujo completo del momento que apretó "Probar gratis":

```
Landing CTA
   │
   ▼
Signup (1 form, 3 campos)
   email + password + nombre del comercio
   │
   ▼
Auto-login + redirect → /pos
   con un seed mínimo:
     · 3 productos demo (Coca, Galletitas, Pan)
     · Categoría "Bebidas" creada
     · Caja del día = abierta (saldo 0)
   │
   ▼
POS con onboarding inline minimal:
   tooltip flecha → "Tocá un producto para sumarlo al ticket"
   (descartable, no modal bloqueante)
   │
   ▼
Usuario suma producto → tooltip → "Listo, ahora apretá Cobrar"
   │
   ▼
Primera venta cobrada → toast grande:
   "¡Primera venta cobrada! 🎉 Esto es Sylvora."
   + "¿Querés cargar tus productos reales ahora?" → /productos/nuevo
   │
   ▼
(día 1) Email: "Bienvenido. 3 tips para arrancar:
   1. Cargá 10 productos · 2. Hacé 5 ventas reales · 3. Cerrá caja"
   │
   ▼
(día 7) Email: "¿Cómo va? Si te trabaste, respondé este email"
   (de una persona real, no noreply@)
```

### Reglas del onboarding

- **No** tour interactivo de 10 pasos. La gente no lo termina.
- **No** wizard de "configuración inicial" (categorías, proveedores,
  etc.). Si querés, va después.
- **Sí** seed mínimo para que el POS no esté vacío.
- **Sí** tooltips inline progresivos, descartables.
- **Sí** email humano día 7 — diferencia entre churn y retención.
- **No** pedir teléfono / DNI / dirección hasta que pague.

---

## 11. Conversion strategy resumida

Los 6 momentos críticos de la landing y qué tiene que pasar en cada
uno:

| Momento | Objetivo | Cómo |
|---|---|---|
| Primera 1s | "¿Es para mí?" | Headline específico + foto de producto real |
| Segundos 2–5 | "¿Qué hace?" | Subtítulo + screenshot |
| 5–15s | "¿Cuesta plata?" | Micro-trust "sin tarjeta · gratis" |
| 15–60s | "¿Cómo funciona?" | Sección 3 pasos + features-como-soluciones |
| 1–3 min | "¿Me animo?" | Prueba social + FAQ + pricing claro |
| Click | Cero fricción | Signup 3 campos, auto-login, POS con seed |

---

## 12. Riesgos / cosas a evitar

- **Hacer landing genérica tipo "SaaS template"** y perder la
  identidad regional. El target NO es B2B silicon valley.
- **Prometer features que no están** (offline-first sin Service
  Worker, multi-sucursal, AFIP, etc.). Decepción al primer uso = churn.
- **Pricing escondido** o "contactá ventas". El target abandona.
- **Tour intrusivo** después del signup. Mata la activación.
- **Pedir tarjeta** al signup. Cubierto.
- **Newsletter / popup de email** en la landing. No vino para eso.
- **Animaciones excesivas** que distraen del mensaje.

---

## 13. Open questions — necesito tu input antes de codear

1. **Precio mensual exacto** post-trial. Mi rango sugerido:
   AR$15.000–20.000/mes. ¿Te suena? ¿Querés algo más bajo (entry)
   o más alto (premium feel)?

2. **¿Tenés testimonios reales de comercios** o arrancamos sin esa
   sección hasta tenerlos?

3. **¿Hay un logo / wordmark final de "Sylvora"** o usamos el "Sy"
   actual del favicon como base para el wordmark de la landing?

4. **¿Beta cerrada o abierta?** Si abierta (mi voto): signup público
   directo. Si cerrada: una lista de espera con un waitlist form
   simple.

5. **Soporte por WhatsApp**: ¿hay un número operativo para poner en
   FAQ + footer? Si no, dejar email y ya.

6. **Domain / URL final**: ¿`sylvora.com`, `sylvora.app`,
   `sylvora.ar`? Cambia el footer y el OG.

7. **Dark mode en landing**: mi voto = NO, light only. El target
   casi seguro usa light. ¿Acuerdo?

8. **¿Algún competidor cuya landing querés que mire** para
   inspiración o para evitar parecernos?

9. **¿Hay algo del producto actual que NO querés mostrar todavía**
   (ej. ciertas pantallas en beta, gating roles)?

10. **Mecánica de signup**: actualmente piden email + password +
    nombre. ¿Querés que el signup desde landing pida también el
    nombre del comercio? Mi voto: sí, para precarga UX.

---

## 14b. Hero — diseño detallado (primera entrega concreta)

Esta sección es el spec operativo del hero. Cada decisión está
tomada — no hay placeholders ni "tbd". Cuando codeemos, esto es la
referencia.

### Composición — qué va arriba del fold

**Solo estos 7 elementos. Nada más.**

1. **Wordmark** (Sy isotipo + "Sylvora").
2. **Link "Entrar"** alineado a la derecha.
3. **H1** con line breaks controlados.
4. **Sub-headline** de 2 líneas.
5. **CTA primaria** "Probar 30 días gratis".
6. **Micro-trust** "Sin tarjeta · 2 minutos".
7. **Screenshot** del producto (peek arriba del fold).

Cada uno gana su lugar. Si querés agregar algo más al hero, tenés
que sacar uno de los 7 — no se suma.

### Layout: single-column centrado

**Decisión**: layout columna única centrada, screenshot debajo del
texto. NO el clásico two-column "texto izquierda / dashboard
derecha".

Razones:
- Two-column es THE template SaaS pattern (Stripe, todo YC). Lo
  que queremos evitar.
- Editorial = headline tiene su momento, screenshot tiene el suyo.
- El screenshot puede ser grande, protagonista — no comprimido al
  50% del ancho.
- Funciona idéntico en mobile sin reconfigurar.

### Nav superior

```
┌────────────────────────────────────────────────────────────┐
│ [Sy] Sylvora                                       Entrar  │
└────────────────────────────────────────────────────────────┘
```

- **Wordmark**:
  - Isotipo "Sy" 28×28px (mobile) / 32×32 (desktop), `bg var(--ac)`,
    `borderRadius 8`, "Sy" white DM Sans 700, fontSize 13/15.
  - Wordmark "Sylvora" al lado, DM Sans 700, 18px mobile / 20px
    desktop, color `var(--text)`, letter-spacing -0.02em.
  - Gap entre iso y wordmark: 10px.
- **"Entrar"** a la derecha:
  - Link a `/login`.
  - DM Sans 500, 14px, color `var(--text2)`.
  - Hover: color `var(--text)`.
  - No badge ni icon — link plano.
- **Sin menú** de navegación (Productos / Precio / Blog). Single
  page, scroll a las secciones.
- Altura nav: 56px mobile / 72px desktop.
- Padding lateral: 20px mobile / 32px desktop / `max-width: 1200px`
  con auto-margins en desktop muy ancho.

### Headline (H1) — line breaks controlados

**Copy**: *"Cobrá, controlá stock y cerrá tu caja desde el celular."*

Los line breaks NO son naturales del flow CSS — son controlados con
markup explícito (`<br>` o `\n` con `white-space: pre-line`). Razón:
el ritmo del headline es parte del diseño, no podemos dejarlo a la
suerte del ancho del viewport.

**Mobile (≤768px)**:

```
Cobrá,
controlá stock
y cerrá tu caja
desde el celular.
```

4 líneas. Cada una es una unidad conceptual (verbo + objeto, o frase
adverbial). Crea un "drumbeat" — el lector hace pausa en cada uno.

**Desktop (≥1024px)**:

```
Cobrá, controlá stock y cerrá tu caja
desde el celular.
```

2 líneas. La primera contiene las 3 acciones, la segunda es el
diferenciador ("celular" = no es desktop legacy).

**Specs tipográficos**:

| | Mobile | Desktop |
|---|---|---|
| `font-size` | 36px | 72px (1024-1280) → 80px (>1280) |
| `font-weight` | 800 | 800 |
| `letter-spacing` | -0.025em | -0.03em |
| `line-height` | 1.1 | 1.05 |
| `color` | `var(--text)` | `var(--text)` |
| `font-family` | DM Sans | DM Sans |

**Última palabra "celular." en color brand** (`var(--ac)`)? **No**.
Tentación grande pero rompe el feel editorial. El violeta lo
reservamos para el CTA y 1-2 acentos. Headline queda monocromo
sobrio.

### Sub-headline

**Copy**:

> "Hecho para kioscos, almacenes y minimarkets.
> Empezás gratis en 2 minutos."

2 líneas. Primera línea identifica al target (auto-identificación).
Segunda baja la barrera (gratis + fácil).

**Specs**:

| | Mobile | Desktop |
|---|---|---|
| `font-size` | 16px | 20px |
| `font-weight` | 500 | 500 |
| `line-height` | 1.4 | 1.5 |
| `color` | `var(--text2)` | `var(--text2)` |
| `max-width` | 100% | 640px (no se estira a 1200) |

Gap H1 → sub: 16px mobile / 32px desktop.

### CTA primaria

**Copy**: `Probar 30 días gratis →`

(La flecha es parte del texto, no icon separado — más editorial.
Alternativa: ArrowRight de lucide tamaño 16, ml-2.)

**Style**:

```
bg: var(--ac)
color: white
font-family: DM Sans
font-weight: 600
font-size: 17px (todos los viewports)
padding: 16px 28px (desktop) / 18px (mobile full width)
border-radius: 12px
border: none
box-shadow: 0 1px 2px rgba(0,0,0,0.04)
transition: all 0.15s ease
```

**Hover desktop**:

```
bg: var(--ac-hover)
box-shadow: 0 4px 16px rgba(91,76,255,0.25)
transform: translateY(-1px)
```

(Lift sutil. Sin esto se siente plano. Con más es exagerado.)

**Active**: `transform: scale(0.98)`.

**Width**:
- Mobile: `width: calc(100% - 40px)` (full menos padding lateral).
- Desktop: `width: auto`, padding lateral generoso, centrado.

**Alto mínimo**: 56px (touch target).

**NO** segunda CTA tipo "Ver demo" / "Cómo funciona". Single action.
Si el usuario quiere más info, scrollea.

### Micro-trust

**Copy**: `Sin tarjeta · 2 minutos`

(Notar el separator `·` middle-dot, no `•` bullet, no `|`. Más
editorial.)

**Specs**:

| | Valor |
|---|---|
| `font-size` | 13px mobile / 14px desktop |
| `font-weight` | 500 |
| `color` | `var(--text2)` |
| `text-align` | center |
| Gap CTA → micro | 12-16px |

**NO**: no agregar más promesas acá. "Sin instalación", "Funciona en
cualquier celular", "Soporte humano" pueden parecer naturales pero
diluyen el mensaje. Las dos micro-promesas más fuertes son: **no te
pido tarjeta** + **es rápido**. Eso es suficiente.

### Screenshot del hero

**Qué muestra**:

Vista del POS con un ticket en curso, listo para cobrar. Composición
sugerida:

- Panel de búsqueda (izquierda en desktop, arriba en mobile) con
  algún producto buscado: "Galletitas" con un resultado destacado.
- Panel del carrito (derecha en desktop, debajo en mobile) con
  **3 items reales argentinos**:
  - 1× Galletitas Oreo 118g — $1.250
  - 2× Coca-Cola 1.5L — $7.400
  - 1× Pan flauta — $850
- Sección de método de pago con "Efectivo" destacado.
- Botón "Cobrar $9.500" prominente en verde abajo.

Por qué este screenshot: el cajero lo ve y reconoce "esto es lo que
hago todos los días". El dueño lo ve y entiende "este sistema
maneja mi negocio". Productos reales = credibilidad inmediata.

**Tratamiento visual** (igual que sección 5 imagery):

```
border-radius: 18px (mobile 14px)
border: 1px solid rgba(0,0,0,0.06)
box-shadow:
  0 4px 16px rgba(0,0,0,0.04),
  0 24px 64px rgba(0,0,0,0.06)
```

Sin chrome de browser, sin chrome de OS, sin frame de teléfono. El
screenshot ES la imagen. Plana, frontal, sin tilt.

**Dimensiones**:

- Desktop: `max-width: 1100px`, ancho real escalado al viewport.
  Aspect ratio del screenshot real (probablemente 16:10 si tomamos
  captura de una ventana ~1440×900, o 16:9 si full-screen).
- Mobile: full width menos padding (16px cada lado), aspect ratio
  natural del screenshot mobile. Puede ser desktop screenshot
  recortado al área principal (cart + cobrar), mostrando "esto
  cabe en mi celular" pero con composición desktop más rica.

**Mejor opción**: capturar el POS **a un viewport intermedio
(~1024px)** que conserve detalle visible pero no tenga whitespace
gigante. Recorte de la imagen ajustado al contenido (panel búsqueda
+ carrito + cobrar), sin headers ni navegación de la app.

### Espaciado vertical (mobile)

| Elemento | Alto | Gap inferior |
|---|---|---|
| Nav | 56 | — |
| Top breathing | — | 24 |
| H1 (4 líneas × 40 lh) | 160 | 16 |
| Sub (3 líneas × ~22 lh) | 66 | 32 |
| CTA | 56 | 12 |
| Micro | 18 | 40 |
| Screenshot peek | (resto) | — |

Total antes del screenshot: ~480px. En un celular típico (740px
viewport menos chrome 100 = 640 visible), el screenshot tiene
**~160px visibles arriba del fold** → buen peek.

### Espaciado vertical (desktop, viewport 1080p)

| Elemento | Alto | Gap inferior |
|---|---|---|
| Nav | 72 | — |
| Top breathing | — | 96 |
| H1 (2 líneas × 88 lh) | 176 | 32 |
| Sub (2 líneas × 30 lh) | 60 | 40 |
| CTA | 56 | 16 |
| Micro | 22 | 96 |
| Screenshot peek | (resto) | — |

Total antes del screenshot: ~666px. En 1080p (864 visible), el
screenshot tiene **~198px visibles** → buen peek.

### Qué NO va en el hero

Lista exhaustiva (re-confirma sección 3 + agrega):

- **No segunda CTA** ("Ver demo", "Mirar video"). Single action.
- **No badges de "Trusted by"** / "As featured in".
- **No métricas** ("+5.000 comercios", "98% uptime") si no son
  reales. Y aunque sean reales: distraen del mensaje en V1.
- **No barra de "🎉 Nuevo: feature X"** arriba del nav.
- **No cookie banner gigante** tapando el hero. Si necesitamos
  cookie consent, va en footer + banner mínimo no-modal.
- **No 3+ screenshots** en el hero (collage / carousel).
  **Uno solo**, grande.
- **No scroll indicator** ("↓ scroll for more"). El usuario sabe
  scrollear.
- **No video autoplay** ni iframe de YouTube.
- **No language picker** (es-AR único en V1).
- **No social icons** en el nav. Van en footer.
- **No "Free for first 100 signups" countdown**. Genera urgencia
  falsa.
- **No frame de teléfono físico**, no mockup de ventana macOS, no
  tilt 3D del screenshot.

### Responsive behavior — transiciones

**Breakpoints** del hero:

- `< 768px`: layout mobile (todo vertical, H1 4 líneas, CTA full
  width).
- `768-1023px`: transition zone — H1 puede ser 56-64px (entre los
  dos extremos), sub mantiene 18px, CTA auto-width.
- `≥ 1024px`: layout desktop full (H1 72-80px, breathing 96px,
  screenshot 1100 max).
- `≥ 1440px`: container max-width 1200px, no se sigue estirando.

**No hay layout intermedio "tablet"** con composición distinta —
solo escalado de tamaños.

### Animación de entrada (opcional)

Mínima y elegante:

- Nav: aparece instantáneo (no animado, evita flash).
- H1: `opacity 0 → 1` + `translateY(8px → 0)` en 400ms, ease-out,
  delay 100ms.
- Sub: mismo timing, delay 250ms.
- CTA: mismo timing, delay 400ms.
- Micro: mismo timing, delay 500ms.
- Screenshot: `opacity 0 → 1` (sin translate) en 600ms, delay 600ms.

Total reveal: ~1.2s desde paint. Suficientemente rápido para no
sentir "loading", suficientemente lento para que el ojo lo siga.

`prefers-reduced-motion: reduce` → todo aparece instantáneo, sin
translate.

### Lighthouse / performance targets

- LCP (Largest Contentful Paint) < 1.5s en 4G. Probable que el LCP
  sea el screenshot — preload + WebP optimizado.
- CLS (Cumulative Layout Shift) = 0. El screenshot tiene
  `width`/`height` attributes para reservar espacio.
- Tipografía: `font-display: swap` en DM Sans y DM Mono. Sin FOIT.
- Preload del screenshot del hero específicamente (`<link rel="preload"
  as="image" href="...">`).

---

## 14. Próximos pasos cuando confirmemos

1. **Diseño** (Figma o equivalente): 1 mock mobile + 1 mock desktop
   del hero + 1 mock de cada sección clave. Iteración antes de
   codear.
2. **Capturas reales**: tomar las 7 capturas listadas en sección 7.
3. **Copy final** sección por sección.
4. **Implementación**: `/` route, secciones componibles, lazy-load
   imágenes, performance target Lighthouse 95+.
5. **Onboarding seed**: agregar seed de 3 productos demo + flag
   `onboarding_completado` en perfil.
6. **Tracking**: instrumentar los eventos de conversion strategy
   (signup, primera venta, etc.).

Estimado total: **2 semanas** entre diseño + copy + impl + onboarding
+ tracking. Se puede acortar a 1 semana si arrancamos por landing
"mínima viable" y dejamos onboarding seed + tracking para el sprint
siguiente.
