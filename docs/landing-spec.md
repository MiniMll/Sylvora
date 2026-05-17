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

### Imagery

- **Screenshots reales** del producto. No mockups stock.
- **Mockups de celular**: usar uno mínimo (no marca específica de
  teléfono). Mostrar la mano sosteniéndolo en algunas.
- **Foto de un kiosco real** si conseguís: 1–2 fotos máximo, no
  abusar.
- **Cero ilustraciones flat genéricas** (las de "personas con laptops
  flotantes"). Mata credibilidad instantáneo.

### Tono visual

- Aireado, mucho whitespace.
- Borders sutiles `var(--border)`.
- Sombras suaves (`var(--shadow-sm)`).
- Cards rounded `var(--radius-lg)`.
- Sin "glassmorphism", "neumorphism" ni efectos 2021. Atemporal.

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

Lista priorizada para sacar capturas del producto actual:

1. **POS cobrando** con productos reales (Galletitas Oreo, Coca,
   etc.) — el hero shot.
2. **Modal de cobrar** con efectivo + vuelto calculado destacado.
3. **Bloque "Caja cerrada"** del rework reciente (con responsable
   + hora + saldo).
4. **Lista de productos** con chip "Crítico" en rojo y "OK" en
   verde.
5. **Detalle de producto** con lotes + vencimiento ("Vence en 5
   días" amarillo).
6. **Ticket impreso** (foto real del papel térmico saliendo, si
   conseguís) + screenshot del TicketReceipt en pantalla.
7. **POS en mockup de celular** con la mano (hero alternativa).

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
