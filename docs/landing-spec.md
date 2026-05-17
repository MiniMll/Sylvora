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

## 14c. Sección "El problema" — spec detallado

Esta es la sección de mayor riesgo emocional de toda la landing. Si
suena a "10 razones por las que tu negocio necesita un POS", se
convierte en marketing genérico y perdemos al dueño en segundos.
Si suena a "estoy describiendo exactamente lo que te pasa el sábado
a las 9 de la noche", queda enganchado.

### Principios

- **Empatía, no diagnóstico.** No le decimos "tu problema es X".
  Mostramos la escena que él ya vivió. Él reconoce.
- **Palabras que él usa**, no traducciones tech. "Sumo mal el vuelto",
  no "ineficiencias operativas en la conciliación".
- **Tres viñetas, no diez.** Disciplina "menos pero mejor". Los 3
  problemas dominantes del comerciante chico LATAM.
- **Sin solución todavía.** Esta sección NO menciona Sylvora ni
  features. Solo el dolor. La solución aparece en la siguiente
  sección ("Cómo funciona"). Separar dolor y solución crea ritmo —
  el usuario lee el dolor, asiente mentalmente, y cuando le aparece
  la solución, el contraste pega.

### Copy final

**Título** (H2):

> "Lo más difícil no es vender.
> Es saber qué pasó al final del día."

Dos líneas. Primera es contraintuitiva (sorprende, retiene). Segunda
explica el dolor real. Tono casi resignado, no acusatorio.

**Lead opcional** (sub-título, gris, debajo del H2):

> Si tenés un comercio, ya conocés esto.

Una sola línea. Establece complicidad — "vos sabés de lo que hablo".

**3 viñetas** (cards con icon + frase + descripción corta):

| Icon (lucide) | Headline (negrita) | Descripción (1-2 frases, tono coloquial) |
|---|---|---|
| `Wallet` | **No sabés cuánto te quedó.** | Vendiste todo el día, pero cerrar caja te lleva una hora — y los números nunca cuadran. |
| `Package` | **Te enterás del stock cuando ya no hay.** | El cliente pide el producto que vendía como pan caliente. Mirás el depósito y no queda. Otra venta perdida. |
| `UserCheck` | **No sabés qué hizo tu empleado.** | Anuló una venta, retiró efectivo, cobró por fuera. Lo descubrís dos semanas después, si lo descubrís. |

Cada headline arranca con un verbo en negativo ("no sabés", "te
enterás cuando ya...", "no sabés"). Triple punch que martilla la
misma sensación: **te falta visibilidad**. Esa es la palabra clave
implícita que el dueño después va a reemplazar mentalmente con
"Sylvora me da visibilidad".

### Layout

**Mobile** (vertical stack):

```
        Lo más difícil
        no es vender.
        Es saber qué pasó
        al final del día.

   Si tenés un comercio, ya conocés esto.

  ┌──────────────────────────────────┐
  │ [Wallet icon, var(--r) 40%]       │
  │                                    │
  │ No sabés cuánto te quedó.         │
  │                                    │
  │ Vendiste todo el día, pero cerrar│
  │ caja te lleva una hora — y los   │
  │ números nunca cuadran.            │
  └──────────────────────────────────┘

  [siguiente card abajo, mismo tratamiento]
  [tercera card abajo]
```

3 cards stack vertical, gap 16px entre ellas.

**Desktop** (≥1024px): 3 columnas lado a lado, gap 24px.

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│             Lo más difícil no es vender.                  │
│         Es saber qué pasó al final del día.               │
│                                                            │
│           Si tenés un comercio, ya conocés esto.          │
│                                                            │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│   │ [Wallet] │  │ [Package]│  │ [UserCh] │               │
│   │          │  │          │  │          │               │
│   │ No sabés │  │ Te enterás│  │ No sabés │               │
│   │ cuánto te│  │ del stock│  │ qué hizo │               │
│   │ quedó.   │  │ cuando ya│  │ tu empl. │               │
│   │          │  │ no hay.  │  │          │               │
│   │ Vendiste │  │ El client│  │ Anuló una│               │
│   │ todo el  │  │ pide el  │  │ venta,   │               │
│   │ día...   │  │ que...   │  │ retiró...│               │
│   └──────────┘  └──────────┘  └──────────┘               │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Specs visuales

**Sección container**:
- Background: continúa `var(--bg)` = `#f5f4f0` (no break visual con el hero — la landing es un solo flujo).
- Padding vertical: 96px desktop / 64px mobile.
- Padding lateral: igual que el hero (20px mobile, max-width 1200px desktop).
- Separación con el hero arriba: ya está dada por el padding del screenshot del hero + esta sección. Sin divider line ni cambio de fondo.

**Título H2**:
- `font-size`: 48px desktop / 32px mobile.
- `font-weight`: 700 (un toque menos que el H1 del hero, que era 800 — jerarquía clara).
- `letter-spacing`: -0.025em desktop / -0.02em mobile.
- `line-height`: 1.15.
- `color`: `var(--text)`.
- `text-align`: center.
- `max-width`: 720px desktop centered.

**Lead (sub-título)**:
- `font-size`: 17px desktop / 15px mobile.
- `font-weight`: 500.
- `color`: `var(--text2)`.
- `text-align`: center.
- Margin top desde H2: 16px.

**Gap H2/lead → cards**: 56px desktop / 40px mobile.

**Cards**:
- Background: **white** (`#ffffff`) o **`var(--card)`**. Esto las despega del fondo cálido off-white de la sección y le da el tratamiento editorial "papel sobre mesa".
- Padding: 28px desktop / 24px mobile.
- `border-radius`: 16px.
- `border`: 1px solid `rgba(0,0,0,0.06)` (sutil, igual que los screenshots).
- `box-shadow`: `0 1px 2px rgba(0,0,0,0.04)` (apenas un assentamiento, no protagonismo).
- Sin hover state — no son clickeables, no deben prometer interacción.

**Icon**:
- Lucide-react, tamaño 28px.
- Color: `var(--text2)` (gris, NO rojo). Razón: si pintamos los iconos de rojo "alerta", se siente exagerado, melodramático. Gris neutro deja que las palabras carguen la emoción.
- Container del icon opcional: cuadrado 48×48, `border-radius` 12, `background: var(--bg3)` (gris muy claro). Más limpio que solo el icon flotando.

**Headline de card**:
- `font-size`: 18px desktop / 17px mobile.
- `font-weight`: 700.
- `color`: `var(--text)`.
- `letter-spacing`: -0.015em.
- Margin top desde icon: 16px.

**Descripción de card**:
- `font-size`: 15px desktop / 14px mobile.
- `font-weight`: 400 (regular — contraste claro con el headline 700).
- `color`: `var(--text2)`.
- `line-height`: 1.55.
- Margin top desde headline: 10px.

### Por qué estos 3 problemas y no otros

Descarté:
- "Sumás mal el vuelto" — sí pasa, pero es chico y específico. No es el dolor estructural.
- "Tus reportes son un Excel" — el dueño LATAM probablemente no piensa en reportes, no es su mental model.
- "Tu sistema actual es caro" — es un argumento competitivo, no un dolor real del dueño.
- "Perdés tiempo entre 3 herramientas" — abstracto, no resuena.

Los 3 elegidos son **dolores con consecuencias económicas claras**:
1. **No sabés cuánto te quedó** → plata invisible.
2. **Te enterás del stock cuando ya no hay** → ventas perdidas.
3. **No sabés qué hizo tu empleado** → fugas y desconfianza.

Cada uno es un eje de control que Sylvora resuelve. Pero esta
sección NO menciona la solución todavía — solo refleja el espejo.

### Qué NO va en esta sección

- **Cero menciones de "Sylvora"** o features del producto.
- **Cero CTAs** ("Probá ahora"). Esta sección es para que el lector
  asiente, no para que actúe. La acción viene después.
- **Cero estadísticas** ("el 73% de los comercios pierden $X al año").
  Datos fake o atribuidos genéricamente suenan a venta. Si tenemos
  estadísticas REALES futuras, las podemos sumar — no en V1.
- **Cero comparaciones con la competencia**. "Otros sistemas son
  complicados" — no es nuestro tono, es bajón.
- **Sin animaciones de números subiendo / contadores**. Marketing
  agresivo.
- **Sin imágenes de personas frustradas** o stock photos. Texto y un
  ícono. Mínimo.

### Tono — la disciplina más importante

Esta sección es donde más fácil se cae en el tono startup-tech. Dos
versiones del mismo concepto, para calibrar:

**Tono incorrecto** ("startup-tech", lo que NO queremos):

> "Optimizá tu gestión operativa con visibilidad en tiempo real.
> Reducí pérdidas, aumentá márgenes y tomá decisiones basadas en
> datos."

Suena a consultora. El dueño de kiosco no se reconoce.

**Tono correcto** (lo que SÍ queremos):

> "Vendiste todo el día, pero cerrar caja te lleva una hora — y los
> números nunca cuadran."

Suena a alguien que ya vivió esto. El dueño asiente.

**Regla**: si la frase la podría haber dicho un dueño de almacén en
voz alta, está bien. Si suena a powerpoint corporativo, está mal.

### Espaciado vertical de la sección

| Elemento | Alto aprox | Gap inferior |
|---|---|---|
| Padding superior sección | 96 (desktop) / 64 (mobile) | — |
| H2 (2 líneas × ~56 lh desktop) | 112 / 76 | 16 |
| Lead (1 línea × 26 lh) | 26 / 22 | 56 / 40 |
| Cards (3 col desktop / stack mobile) | ~220 / ~3 × 180 + 32 gaps | — |
| Padding inferior sección | 96 / 64 | — |

Total sección: ~620px desktop / ~840px mobile. Bien aireada.

### Transición con la sección siguiente

El siguiente bloque es "Cómo funciona" (la solución a estos 3
problemas). Para que el contraste pegue, la sección "El problema"
NO debe terminar con una flecha visual ni "↓ leé cómo lo
solucionamos". El silencio entre las dos secciones es el ritmo —
el lector llega solo al insight.

Solo el padding genera el respiro. No agregamos chevrons, líneas
divisorias, ni separadores visuales entre secciones. Es una sola
página continua, el contenido marca el ritmo.

---

## 14d. Sección "Cómo funciona" — spec detallado

Esta sección es donde el dueño pasa de "sí, ése es mi problema" a
"ah, esto es lo que hace". Tiene que ser **simple, visual, y rápida
de leer**. Si no entiende cómo funciona en 15 segundos, perdimos.

### Principio rector

**3 pasos. Una imagen por paso. Una frase por paso.**

No "10 features", no "explicación detallada del producto". Tres
acciones secuenciales que el dueño hace una vez, y después el
sistema "vive solo".

### Copy final

**Título** (H2):

> "Tres pasos. Y ya está."

(Voluntariamente bajo en pretensión. Inversa del SaaS típico
"Discover the power of...". El dueño LATAM responde mejor a "esto
es simple" que a "esto es poderoso".)

**Lead opcional**:

> Si sabés usar WhatsApp, sabés usar Sylvora.

Esta línea hace mucho. Establece una referencia mental concreta
(WhatsApp = lo más fácil que el dueño conoce) y promete simpleza
sin tecnicismos.

**Los 3 pasos**:

| # | Headline | Sub | Visual |
|---|---|---|---|
| 1 | **Cargás tus productos.** | Una vez. Foto, precio, stock. Listo. | Screenshot de `/productos` con un grid de productos cargados (Coca, Galletitas, Pan, etc.) |
| 2 | **Cobrás desde el celular.** | Tu empleado solo necesita su teléfono. El sistema calcula el vuelto. | Screenshot del POS con un ticket en curso, botón "Cobrar" verde grande |
| 3 | **Cerrás caja al final del día.** | Ves qué vendiste, cuánto te quedó y qué falta reponer. | Screenshot del bloque de estado "Caja cerrada" del rework reciente |

### Layout

**Mobile**: stack vertical, cada paso ocupa toda la pantalla en su
turno. Cada paso es:

```
┌──────────────────────────────────┐
│                                    │
│  01                                │  ← número 01 grande, sutil,
│                                    │     color var(--text2) opacity 50%
│  Cargás tus productos.            │  ← headline
│                                    │
│  Una vez. Foto, precio, stock.    │  ← sub
│  Listo.                            │
│                                    │
│  ┌────────────────────────────┐  │
│  │                              │  │  ← screenshot, mismo
│  │   [screenshot del grid      │  │     tratamiento editorial
│  │    de productos]            │  │     que el hero
│  │                              │  │
│  └────────────────────────────┘  │
│                                    │
└──────────────────────────────────┘
```

Gap entre pasos: 80px mobile.

**Desktop**: cada paso se alterna izquierda/derecha (zig-zag). Esto
crea ritmo visual y aprovecha el ancho:

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│   01    Cargás tus productos.        ┌──────────────┐    │
│         Una vez. Foto, precio,       │              │    │
│         stock. Listo.                │  screenshot  │    │
│                                       │              │    │
│                                       └──────────────┘    │
│                                                            │
│   ┌──────────────┐    02    Cobrás desde el celular.     │
│   │              │           Tu empleado solo necesita   │
│   │  screenshot  │           su teléfono. El sistema     │
│   │              │           calcula el vuelto.          │
│   └──────────────┘                                        │
│                                                            │
│   03    Cerrás caja al final del día. ┌──────────────┐   │
│         Ves qué vendiste, cuánto te    │              │   │
│         quedó y qué falta reponer.    │  screenshot  │   │
│                                        │              │   │
│                                        └──────────────┘   │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

Cada paso: ~360px alto desktop. Gap entre pasos: 96px.

### Specs visuales

**Sección container**:
- Background: cambio sutil — `var(--bg2)` = `white` puro. Genera un
  break visual respecto a la sección "El problema" (que estaba sobre
  `#f5f4f0` warm off-white). Apenas perceptible pero crea ritmo
  visual.
- Padding vertical: 96px desktop / 80px mobile.

**Título H2**: igual que sección "El problema" — 48/32 desktop/mobile.

**Lead**: igual que sección "El problema" — 17/15.

**Gap título → pasos**: 80px desktop / 56px mobile.

**Número de paso (01, 02, 03)**:
- `font-family`: DM Mono (mono, refuerza el feel "técnico-limpio"
  consistente con la app).
- `font-size`: 14px en todos los viewports.
- `font-weight`: 500.
- `color`: `var(--text2)` con `opacity: 0.6` (sutil).
- `letter-spacing`: 0.05em.

**Headline del paso**:
- `font-size`: 32px desktop / 24px mobile.
- `font-weight`: 700.
- `letter-spacing`: -0.02em.
- `color`: `var(--text)`.
- Margin top desde número: 12px.

**Sub del paso**:
- `font-size`: 16px desktop / 14px mobile.
- `font-weight`: 400.
- `color`: `var(--text2)`.
- `line-height`: 1.55.
- `max-width`: 380px (no se estira).
- Margin top desde headline: 12px.

**Screenshot del paso**:
- Tratamiento idéntico al hero: radius 18px, border 1px
  `rgba(0,0,0,0.06)`, shadow de 2 capas.
- Tamaño: ~500-560px ancho desktop / full width menos 16px mobile.
- Aspect ratio natural del screenshot.

### Qué NO va en esta sección

- **Más de 3 pasos.** Si necesitás 4, sacaste mal el problema.
- **CTAs dentro de los pasos** ("Probá este paso"). La acción es al
  final.
- **Iconos de paso** (engranaje, flecha, etc.) — el número 01 ya
  sirve.
- **Animaciones step-by-step** que se "iluminan" cuando scrollea.
  Llamativo pero distrae.
- **Lista numerada CSS estándar** — el número 01 sutil con DM Mono
  es parte del feel editorial. No usamos `<ol>` con marker default.
- **"Setup wizard" / "Instalación en 5 minutos"** — son frases tech
  que erran de tono.

### Transición a la siguiente sección

Después de "Cómo funciona" viene "Para quién es" (los 3 perfiles:
kiosco, minimarket, almacén). El usuario terminó de entender el
producto a nivel acción — ahora se identifica a nivel categoría
de negocio.

---

## 14e. Sección "Para quién es" — spec detallado

Sección de auto-identificación. El dueño se ve en uno de los 3
perfiles y piensa "esto es para mí". Si no se identifica, asume que
es para otro y se va.

### Principio

**3 perfiles concretos, no abstracciones.** No "comercios pequeños"
ni "PyMEs" — kiosco, minimarket, almacén. Palabras que el dueño usa
para describirse.

### Copy final

**Título** (H2):

> "Hecho para tu negocio.
> No para el de una multinacional."

Dos líneas. La segunda es el contraste necesario — establece
"no somos SAP, no somos enterprise, somos para vos".

**Lead opcional**:

> Si tu comercio entra acá abajo, Sylvora está hecho para vos.

**Los 3 perfiles**:

| Negocio | Headline | Punto de dolor específico | Ejemplo de uso |
|---|---|---|---|
| **Kiosco / maxikiosco** | Cobrá rápido, no perdás vueltos. | Decenas de operaciones chicas por día, sumar a mano cansa. | Galletitas, gaseosas, cigarrillos. Cobrás con efectivo y MP por igual. |
| **Minimarket / autoservicio** | Controlá 200+ productos sin volverte loco. | Stock que se mueve rápido, vencimientos que pasás por alto. | Lácteos, fiambres, panadería. Lotes con fecha. Precios por kg. |
| **Almacén de barrio** | Cerrá tu caja en serio, todos los días. | Cuentas mezcladas con la familia, no sabés qué te queda neto. | Almacén con caja chica, varios empleados, retiros parciales. |

### Layout

**Mobile**: 3 cards verticales, una abajo de la otra. Mismo
tratamiento que las cards de "El problema" pero con composición
diferente (más generosa).

**Desktop**: 3 columnas lado a lado, gap 24px.

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│              Hecho para tu negocio.                       │
│       No para el de una multinacional.                    │
│                                                            │
│     Si tu comercio entra acá abajo, Sylvora está hecho   │
│                       para vos.                            │
│                                                            │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│   │            │  │            │  │            │         │
│   │  KIOSCO    │  │ MINIMARKET │  │  ALMACÉN   │         │
│   │            │  │            │  │            │         │
│   │  Cobrá     │  │ Controlá   │  │ Cerrá tu   │         │
│   │  rápido,   │  │ 200+ prod. │  │ caja en    │         │
│   │  no perdás │  │ sin vol-   │  │ serio,     │         │
│   │  vueltos.  │  │ verte loco.│  │ todos los  │         │
│   │            │  │            │  │ días.      │         │
│   │  [dolor]   │  │  [dolor]   │  │  [dolor]   │         │
│   │            │  │            │  │            │         │
│   │  [ej uso]  │  │  [ej uso]  │  │  [ej uso]  │         │
│   │            │  │            │  │            │         │
│   └────────────┘  └────────────┘  └────────────┘         │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Specs visuales

**Sección container**:
- Background: vuelve a `var(--bg)` warm off-white (alterna con la
  blanca anterior, ritmo).
- Padding vertical: 96/64.

**Título H2 y Lead**: mismos specs que las secciones anteriores.

**Cards de perfil**:
- Background: white `var(--card)`.
- Padding: 32px desktop / 24px mobile.
- `border-radius`: 16px.
- `border`: 1px solid `rgba(0,0,0,0.06)`.
- `box-shadow`: `0 1px 2px rgba(0,0,0,0.04)`.
- Sin hover state (no son clickeables).

**Etiqueta de categoría** (KIOSCO / MINIMARKET / ALMACÉN):
- `font-family`: DM Mono.
- `font-size`: 11px.
- `font-weight`: 600.
- `letter-spacing`: 0.1em.
- `color`: `var(--ac)` brand violeta — único uso de violeta en esta
  sección, marca la "categoría".
- `text-transform`: uppercase.

**Headline del perfil**:
- `font-size`: 20px desktop / 18px mobile.
- `font-weight`: 700.
- `letter-spacing`: -0.015em.
- `color`: `var(--text)`.
- Margin top desde etiqueta: 16px.
- `max-width`: idealmente cabe en 2-3 líneas.

**Punto de dolor**:
- `font-size`: 14px.
- `font-weight`: 400.
- `color`: `var(--text2)`.
- Margin top: 12px.

**Ejemplo de uso**:
- `font-size`: 13px.
- `font-weight`: 400.
- `color`: `var(--text2)` con opacity 0.85.
- Margin top: 12px.
- Separador visual con el punto de dolor: ninguno, solo el gap (la
  jerarquía tipográfica los separa).

### Qué NO va en esta sección

- **Iconos representando cada negocio** (carrito, balanza, etc.) —
  caen en cliché tipo "select your industry". El nombre del negocio
  basta.
- **Más de 3 perfiles.** Si querés sumar farmacia, ferretería, etc.,
  diluís el mensaje. Empezamos con 3 nichos claros.
- **Foto de un kiosco/minimarket/almacén** dentro de cada card —
  agrega ruido visual.
- **CTA "Sylvora para kiosco"** que lleva a otra página. V1: una
  sola landing.
- **Tabla comparativa "tu negocio vs sin Sylvora"** — pretencioso.

### Transición

Después viene la sección de **features-como-soluciones** (sección
4.5 del spec original). Ahora que el dueño se identificó, le
mostramos qué resuelve el producto en detalle.

---

## 14f. Sección "Lo que podés hacer" — spec detallado

Esta es donde la mayoría de las landings se rompen — terminan
listando 20 features. Disciplina: **6 cards máximo**, cada una
expresada como **solución a un problema**, no como descripción
técnica.

### Principio

**Features como verbos de acción del dueño, no como sustantivos
técnicos del producto.**

Mal:
> "Punto de venta multidispositivo con sincronización en la nube"

Bien:
> "Cobrá desde el celular, la tablet o la compu — todos sincronizados."

El cambio: pasamos del POV del producto al POV del usuario.

### Copy final

**Título** (H2):

> "Lo que Sylvora resuelve por vos."

**Lead opcional**: se puede omitir acá — el título es suficiente.

**Las 6 features**:

| # | Headline | Sub | Visual sugerido |
|---|---|---|---|
| 1 | **Cobrá en segundos.** | Efectivo, débito, crédito, Mercado Pago. Calcula el vuelto solo. | Screenshot del modal de cobrar con vuelto |
| 2 | **Stock que te avisa.** | Te marca lo que está por agotarse y los lotes por vencer. | Screenshot de productos con chips críticos |
| 3 | **Caja cerrada de verdad.** | Al final del día sabés cuánto vendiste, qué retiraste y cuánto queda. | Screenshot del bloque "Caja cerrada" |
| 4 | **Tu equipo, con control.** | Cada empleado con su cuenta. Vos decidís qué puede tocar cada uno. | Screenshot de `/usuarios` con roles |
| 5 | **Tickets profesionales.** | Imprimís en térmica o mandás por WhatsApp en un toque. | Screenshot del TicketReceipt |
| 6 | **Funciona en cualquier celular.** | No hace falta comprar hardware. Si tenés WhatsApp, tenés Sylvora. | Foto editorial de mano + celular real con POS |

### Layout

**Mobile**: stack vertical, 1 feature por "fila", cada una con
mini-screenshot a su lado o debajo. Gap 56px entre features.

**Desktop**: grid 2x3 (2 columnas, 3 filas). Cada celda contiene una
feature con su mini-screenshot. Gap 32px.

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│            Lo que Sylvora resuelve por vos.               │
│                                                            │
│   ┌────────────────────┐  ┌────────────────────┐         │
│   │ Cobrá en segundos. │  │ Stock que te avisa.│         │
│   │                     │  │                     │         │
│   │ Efectivo, débito... │  │ Te marca lo que... │         │
│   │                     │  │                     │         │
│   │ [screenshot mini]   │  │ [screenshot mini]   │         │
│   └────────────────────┘  └────────────────────┘         │
│                                                            │
│   ┌────────────────────┐  ┌────────────────────┐         │
│   │ Caja cerrada de... │  │ Tu equipo, con...   │         │
│   │ ...                 │  │ ...                 │         │
│   │ [screenshot mini]   │  │ [screenshot mini]   │         │
│   └────────────────────┘  └────────────────────┘         │
│                                                            │
│   ┌────────────────────┐  ┌────────────────────┐         │
│   │ Tickets profes...   │  │ Funciona en cual...│         │
│   │ ...                 │  │ ...                 │         │
│   │ [screenshot mini]   │  │ [foto mano+cel]     │         │
│   └────────────────────┘  └────────────────────┘         │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Specs visuales

**Sección container**:
- Background: white `var(--bg2)` (alterna con la sección anterior).
- Padding vertical: 96/64.

**Cards de feature**:
- Background: `var(--card)` blanco (sobre fondo blanco — el separador
  es border + shadow, no fondo distinto).
- Padding: 28px desktop / 24px mobile.
- `border-radius`: 16px.
- `border`: 1px solid `rgba(0,0,0,0.06)`.
- `box-shadow`: `0 1px 2px rgba(0,0,0,0.04)`.

**Headline de feature**:
- `font-size`: 20px desktop / 18px mobile.
- `font-weight`: 700.
- `letter-spacing`: -0.015em.

**Sub de feature**:
- `font-size`: 14px.
- `font-weight`: 400.
- `color`: `var(--text2)`.
- Margin top: 8px.
- `line-height`: 1.55.

**Screenshot dentro de la card**:
- Tratamiento idéntico al hero pero más chico (radius 12, shadow más
  sutil).
- Aspect ratio: cuadrado o 4:3, recortado al área relevante del
  feature.
- Margin top: 20px desde el sub.

### Qué NO va

- **Más de 6 features.** Si tenés 7, sacaste mal.
- **Iconos al lado del headline.** El screenshot es el visual.
- **Lista de bullets dentro de cada feature.** Sub de 1-2 frases máx.
- **"Coming soon" badges.** Si no está, no la mostramos.
- **Comparativa "antes vs después".** Marketing exagerado.
- **CTAs por feature** ("Aprendé más sobre cobros"). Cero CTAs en
  esta sección.

---

## 14g. Sección "Precio" — spec detallado

Después de mostrar el producto, el dueño piensa "cuánto vale". Hay
que contestarle YA, claro, sin trucos.

### Principio

**Un solo plan. Un solo precio. Cero asteriscos.**

### Copy final

**Título** (H2):

> "Un precio. Cero sorpresas."

**Lead opcional**:

> Pagás cuando lo necesitás. Cancelás cuando quieras.

### Composición del bloque de precio

**Una sola card centrada**, muy clara:

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│                 Un precio. Cero sorpresas.                │
│                                                            │
│       Pagás cuando lo necesitás. Cancelás cuando quieras.│
│                                                            │
│              ┌────────────────────────────┐               │
│              │                              │               │
│              │   30 DÍAS GRATIS             │  ← chip arriba│
│              │                              │     bg ac    │
│              │   Sin tarjeta de crédito     │               │
│              │   Acceso completo            │               │
│              │   Soporte por WhatsApp       │               │
│              │                              │               │
│              │   ─────────────────────      │  ← separator  │
│              │                              │               │
│              │   Después                    │               │
│              │                              │               │
│              │   $15.000                    │  ← número     │
│              │   AR$ / mes                  │     grande    │
│              │                              │     DM Mono   │
│              │                              │               │
│              │   ✓ Usuarios ilimitados      │               │
│              │   ✓ Caja, stock, ventas      │               │
│              │   ✓ Soporte por WhatsApp     │               │
│              │   ✓ Sin contrato de permanen.│               │
│              │                              │               │
│              │   [ Empezar gratis  → ]      │  ← CTA        │
│              │                              │               │
│              └────────────────────────────┘               │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Specs visuales

**Sección container**:
- Background: vuelve a `var(--bg)` warm off-white.
- Padding vertical: 96/64.

**Card de precio**:
- Ancho: 420px desktop centered / full width minus 32px mobile.
- Background: `var(--card)` white.
- `border-radius`: 20px (un toque más generoso que las otras cards,
  reflejando importancia).
- `border`: 1px solid `rgba(0,0,0,0.08)` (un toque más visible).
- `box-shadow`: `0 4px 16px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.06)` (igual que el screenshot del hero — refuerza
  importancia visual).
- Padding: 32px desktop / 28px mobile.

**Chip "30 DÍAS GRATIS"**:
- `background`: `var(--ac)` brand violeta.
- `color`: white.
- `font-family`: DM Mono.
- `font-size`: 11px.
- `font-weight`: 700.
- `letter-spacing`: 0.1em.
- Padding: 6px 12px.
- `border-radius`: 999px (pill).
- Display: inline-block, alineado al inicio de la card.

**Beneficios del trial** (lista debajo del chip):
- `font-size`: 14px.
- `font-weight`: 500.
- `color`: `var(--text)`.
- Sin viñetas. Cada línea separada por 6px de margin.
- Margin top desde el chip: 16px.

**Separator**:
- Border-top: 1px solid `var(--border)`.
- Margin vertical: 24px.

**Texto "Después"**:
- `font-size`: 13px.
- `color`: `var(--text2)`.

**Número del precio**:
- `font-size`: 56px desktop / 48px mobile.
- `font-weight`: 700.
- `font-family`: DM Mono.
- `letter-spacing`: -0.02em.
- `color`: `var(--text)`.
- Margin top: 4px.

**Unidad "AR$ / mes"**:
- `font-size`: 14px.
- `font-weight`: 500.
- `color`: `var(--text2)`.
- Margin top: 4px.

**Lista de features (post-trial)**:
- Cada item con `✓` (un checkmark unicode o lucide `Check` size 14
  color `var(--g)`).
- `font-size`: 14px.
- `font-weight`: 500.
- `color`: `var(--text)`.
- Gap entre items: 8px.
- Margin top desde el precio: 24px.

**CTA**:
- Idéntica al CTA del hero ("Empezar gratis →").
- Full width dentro de la card.
- Margin top: 24px.

### Qué NO va en esta sección

- **Múltiples planes.** "Free / Pro / Business" — para V1 = no.
- **Pricing tier comparativo.** Tabla con check / x — confunde.
- **Toggle "mensual / anual con descuento".** Para V1 = solo mensual.
- **Letra chica con asteriscos.** Si el precio tiene condiciones,
  van en FAQ, no en letra chica.
- **"Cancelá cuando quieras"** dicho dos veces. Está en el lead.
- **Logos de pasarelas de pago** (MP, Visa). Distraen.
- **"Most popular" badge.** Solo hay un plan.

---

## 14h. Sección "Preguntas frecuentes" — spec detallado

FAQ. El último filtro antes del CTA final. Objeciones reales
contestadas en tono conversacional.

### Principio

**Acordeón colapsable, no lista expandida.** Mostrar todo expandido
es muro de texto que nadie lee. Acordeón invita a explorar solo lo
que te importa.

### Copy final

**Título** (H2):

> "Lo que nos preguntan más seguido."

(Suave, conversacional. Evita "FAQ" en mayúscula tech.)

**Las preguntas** (en orden de prioridad — las más críticas
primero):

1. **¿Tengo que comprar algo además del celular?**
   No. Si tu celular tiene cámara y conexión, ya está. Si querés
   imprimir tickets, agregás una impresora térmica que conseguís en
   cualquier librería.

2. **¿Qué pasa si se me corta internet?**
   *(Respuesta condicional según estado real del Service Worker)*
   V1 honesto: Sylvora funciona con internet. Si se corta, podés
   seguir cobrando con efectivo y registrarlo cuando vuelva la
   conexión.

3. **¿Cómo pago la suscripción?**
   Por Mercado Pago, transferencia o débito automático. Sin
   contrato de permanencia — pagás mes a mes.

4. **¿Mis datos están seguros?**
   Sí. Todo viaja encriptado, está alojado en Supabase (la misma
   infraestructura que usan miles de apps en Latinoamérica). Si
   dejás de usarlo, te exportamos todo en Excel y borramos.

5. **¿Sirve para vender por peso (kg, litro, metro)?**
   Sí. Podés vender carne por kilo, aceite por litro, tela por
   metro. Cada producto se configura con su unidad.

6. **¿Cuántos empleados puedo agregar?**
   Los que quieras. Sin límite. Cada uno con su usuario, su rol y
   su control de acceso.

7. **¿Puedo anular una venta o reabrir una caja?**
   Sí, pero solo los administradores. Los empleados pueden cobrar
   y registrar egresos, pero no anular ni reabrir.

8. **¿Sylvora emite factura electrónica AFIP?**
   *(Respuesta honesta)* Todavía no. Estamos trabajando en la
   integración. Por ahora Sylvora es tu sistema operativo de
   caja y stock; la facturación electrónica la seguís haciendo
   donde la hacés hoy.

9. **¿Hay un período de prueba?**
   Sí. 30 días gratis, sin tarjeta de crédito. Al final del trial
   te avisamos por email y decidís si seguís.

10. **¿Cómo es el soporte?**
    WhatsApp directo. Te contesta una persona real, no un chatbot.
    Generalmente respondemos en menos de 2 horas en horario
    comercial.

### Layout

Stack vertical centrado, max-width 720px. Cada pregunta es un row:

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│        Lo que nos preguntan más seguido.                  │
│                                                            │
│   ┌──────────────────────────────────────────────────┐   │
│   │ ¿Tengo que comprar algo además del celular?    + │   │
│   ├──────────────────────────────────────────────────┤   │
│   │ ¿Qué pasa si se me corta internet?             + │   │
│   ├──────────────────────────────────────────────────┤   │
│   │ ¿Cómo pago la suscripción?                     − │   │  ← abierta
│   │                                                    │   │
│   │ Por Mercado Pago, transferencia o débito         │   │
│   │ automático. Sin contrato de permanencia.         │   │
│   ├──────────────────────────────────────────────────┤   │
│   │ ¿Mis datos están seguros?                      + │   │
│   └──────────────────────────────────────────────────┘   │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Specs visuales

**Sección container**:
- Background: white `var(--bg2)` (alterna).
- Padding vertical: 96/64.

**Container del acordeón**:
- `max-width`: 720px centered.
- `border`: 1px solid `rgba(0,0,0,0.06)`.
- `border-radius`: 16px.
- Background: `var(--card)` white.

**Cada row**:
- Padding: 20px 24px.
- Separador entre rows: 1px solid `rgba(0,0,0,0.05)` (más sutil que
  el border externo).
- Sin separador en el último row (overlap visual con el border).

**Pregunta (closed state)**:
- `font-size`: 16px desktop / 15px mobile.
- `font-weight`: 600.
- `color`: `var(--text)`.
- Icon `+` (lucide `Plus`) a la derecha, size 18, color `var(--text2)`.

**Pregunta (open state)**:
- Mismo styling pero icon `−` (lucide `Minus`).
- Background del row: `var(--bg3)` muy sutil (apenas distingue de
  closed).

**Respuesta**:
- `font-size`: 15px.
- `font-weight`: 400.
- `color`: `var(--text2)`.
- `line-height`: 1.6.
- Padding top: 12px (desde la pregunta).
- Animación expand: max-height transition 200ms ease.

### Qué NO va en esta sección

- **Búsqueda en el FAQ.** Tenemos 10 preguntas, no se necesita.
- **Categorías de preguntas** ("Generales / Técnicas / Pago"). El
  orden curado es suficiente.
- **"¿No encontrás tu pregunta? Contactanos"** — redundante, el
  WhatsApp ya está en el footer y soporte.
- **Preguntas filler** que nadie hizo. Si solo tenemos 6 reales,
  6 quedan.

---

## 14i. Sección "CTA final" — spec detallado

El último empujón. Después del FAQ, el dueño está casi convencido.
Esta sección le da el último ping y un solo botón claro.

### Principio

**Una idea. Un botón. Cero ruido.**

### Copy final

**Título** (H2 — un toque más íntimo que las otras secciones):

> "Probalo este sábado."

(Específico. "Hoy" o "ahora" son abstractos, "este sábado" lo
imagina pasando.)

**Sub**:

> En 2 minutos tenés tu primera venta cobrada.

**CTA**: idéntico al del hero.

**Micro-trust**: idéntico al del hero.

### Layout

Sección corta, contenido centrado, **fondo distintivo** —
**violeta brand sutil** o **white sobre fondo violeta**. Decisión:
**white card sobre fondo `var(--ac)` brand violeta**, para que el
final sea visual y memorable.

```
┌──────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← fondo
│ ▓                                                       ▓ │     var(--ac)
│ ▓                                                       ▓ │     o gradient
│ ▓             Probalo este sábado.                     ▓ │     muy sutil
│ ▓                                                       ▓ │     a partir de
│ ▓        En 2 minutos tenés tu primera venta cobrada.  ▓ │     var(--ac)
│ ▓                                                       ▓ │
│ ▓             ┌──────────────────────────┐            ▓ │
│ ▓             │  Empezar gratis  →        │            ▓ │
│ ▓             └──────────────────────────┘            ▓ │
│ ▓                                                       ▓ │
│ ▓             Sin tarjeta · 2 minutos                  ▓ │
│ ▓                                                       ▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
└──────────────────────────────────────────────────────────┘
```

### Specs visuales

**Sección container**:
- Background: `var(--ac)` brand violeta.
- Opcional: gradient sutilísimo de `var(--ac)` a `#4a3dee` para dar
  profundidad.
- Padding vertical: 80/64.
- Padding lateral: 20px mobile / max-width 1200px desktop.

**Título H2**:
- `font-size`: 48px desktop / 32px mobile.
- `font-weight`: 700.
- `letter-spacing`: -0.025em.
- `color`: white.
- `text-align`: center.

**Sub**:
- `font-size`: 18px desktop / 15px mobile.
- `font-weight`: 500.
- `color`: `rgba(255,255,255,0.85)` (white con leve transparencia,
  más suave).
- `text-align`: center.
- Margin top desde título: 12px.

**CTA**:
- Background: **white** (invertido respecto al hero).
- `color`: `var(--ac)` brand violeta.
- Mismo resto de specs que el CTA del hero.
- Hover: background `rgba(255,255,255,0.92)`, sutil.

**Micro-trust**:
- `font-size`: 14px.
- `color`: `rgba(255,255,255,0.7)`.
- Margin top desde CTA: 12px.

### Qué NO va

- **Imagen / screenshot** en esta sección. Solo texto + CTA. Es el
  "final beat" — silencio visual.
- **Lista de últimos beneficios.** Si tenés que recordarle por qué,
  la landing falló antes.
- **Testimonio "Juan ya probó"** — sería forzado.
- **"Última chance" / urgencia falsa.** Ni countdown, ni "oferta
  limitada".

---

## 14j. Sección "Footer" — spec detallado

Minimalista. El usuario llegó hasta acá — no le abrumes con
sitemap.

### Composición

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│   [Sy] Sylvora                                            │
│   Punto de venta y stock para comercios chicos.           │
│                                                            │
│   ─────────────────────────────────────                   │
│                                                            │
│   © 2026 Sylvora    [Términos]  [Privacidad]  [WhatsApp]  │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Specs

**Container**:
- Background: white `var(--bg2)`.
- Padding vertical: 48px desktop / 40px mobile.
- Border top: 1px solid `var(--border)`.

**Bloque izquierdo (mobile: arriba)**:
- Wordmark + isotipo igual que el nav.
- Sub: 13px `var(--text2)`, una línea descriptiva.

**Bloque inferior** (mobile: stack, desktop: row):
- Copyright 12px `var(--text2)`.
- Links 12px `var(--text2)`, separados por gap 16px.
- WhatsApp: link al número real, abre `wa.me/...`.

### Qué NO va

- **Sitemap completo** ("Productos / Precio / Blog / Carreras /
  Inversores").
- **"Made with ❤️ in Argentina"** — para V1, dejarlo simple.
- **Newsletter signup.**
- **Logos de tecnologías** ("Powered by Next.js / Supabase").
- **Iconos sociales** si no hay perfiles activos. Mejor vacío que
  links muertos.

---

## 14k. Onboarding completo — del CTA a la primera venta

Refinamiento de la sección 10 del spec original, con specs concretos.

### Paso a paso del flujo

```
1. Click "Empezar gratis" en landing
   ↓
2. /signup
   Form de 3 campos:
   - Nombre del comercio *
   - Email *
   - Contraseña *
   Botón: "Crear cuenta"
   Link debajo: "¿Ya tenés cuenta? Entrar"
   ↓
3. Backend:
   - Crea auth user con email/password
   - Crea registro de comercio con el nombre
   - Crea perfil con rol='admin', vinculado al comercio
   - Crea seed inicial:
     · Categoría "General"
     · 3 productos demo:
       — Coca-Cola 1.5L (precio $4.500, stock 12)
       — Galletitas Oreo 118g (precio $1.250, stock 24)
       — Pan flauta (precio $850, stock 8)
     · Caja del día abierta con saldo 0
   - Auto-login
   - Redirect → /pos
   ↓
4. /pos primera carga
   Tooltip 1 (esquina superior, descartable con X):
   "Bienvenido. Tocá un producto para sumarlo al ticket."
   ↓
5. Usuario suma producto
   Tooltip 1 desaparece, aparece Tooltip 2:
   "Listo. Apretá Cobrar y elegí cómo te pagan."
   ↓
6. Usuario apreta Cobrar y elige método
   Tooltip 2 desaparece, no aparece nada más.
   ↓
7. Venta confirmada
   Toast grande (Sonner custom):
   "¡Primera venta cobrada! 🎉 Esto es Sylvora.
    [Cargar mis productos reales →] (link a /productos/nuevo)"
   Toast se queda visible 8s o hasta click.
```

### Reglas de los tooltips

- **Descartables**: cada tooltip tiene una `×` para cerrar sin
  ejecutar la acción.
- **Solo 2 tooltips totales.** No 10 pasos. El dueño aprende
  haciendo.
- **No bloquean la UI** — son anchored a un elemento pero el resto
  funciona.
- **No re-aparecen** una vez descartados (flag en localStorage o en
  el perfil del user: `onboarding_completado`).

### Emails de seguimiento

| Día | Asunto | Cuerpo (resumen) |
|---|---|---|
| 0 (inmediato) | "Bienvenido a Sylvora" | Welcome + 3 tips para arrancar (cargá tus productos, hacé 5 ventas, cerrá tu caja). Firma del fundador. |
| 3 | "¿Cómo va, [nombre]?" | Pregunta abierta, "respondé este email si necesitás algo". De una persona real (no noreply@). |
| 7 | "3 cosas que te recomendamos" | Cargar el lote completo, configurar la impresora térmica, invitar a un empleado. |
| 25 | "Tu prueba termina en 5 días" | Recordatorio. Plan AR$15.000/mes. CTA "Activar mi cuenta". |
| 28 | "Tu prueba termina mañana" | Last reminder, mismo CTA. |
| 30 | "Tu prueba terminó" | Acceso limitado, datos conservados 90 días. CTA "Reactivar". |

### Reglas de los emails

- **Firma humana** ("Juan, fundador de Sylvora") con foto si conseguimos.
- **No automated tone**. Cada email se lee como escrito por alguien.
- **No spam de "te quedan X días"** entre día 0 y día 25 — silencio
  productivo.
- **Reply-to real**: que los emails respondan a un humano, no a
  noreply@.

### Cuando termina el trial (día 30)

UI behavior:
- El user puede seguir logueado.
- Puede VER toda su data (productos, ventas históricas, caja
  histórica).
- NO puede ejecutar acciones críticas:
  - Cobrar (botón Cobrar en POS deshabilitado con tooltip "Activá tu
    cuenta para seguir cobrando").
  - Cerrar caja (idem).
  - Agregar producto.
  - Anular venta.
- Banner persistente top: "Tu prueba terminó. Activá tu cuenta por
  AR$15.000/mes." con CTA "Activar".
- Login sigue funcionando — la data sigue ahí.

A los 90 días sin reactivar: anonimizar + borrar definitivamente.
Email de aviso 30 días antes.

### Métricas a trackear desde día 0

- Signup completado.
- Primera venta cobrada (definición de "activado").
- Primer producto cargado (real, no del seed).
- Primer cierre de caja completado.
- Re-login después del día 1 (retención día 2).
- Re-login después del día 7.
- Re-login después del día 30.
- Conversión trial → pago.
- Tiempo desde signup hasta primera venta.

Métrica norte: **% de signups que hacen primera venta cobrada
en menos de 10 minutos**. Si está abajo del 60% en el primer mes,
hay un problema de onboarding que arreglamos antes de seguir
optimizando otras cosas.

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
