# Plan técnico — Implementación de la landing

Plan operativo para codear la landing. Cubre arquitectura, decisiones
técnicas, y commit-by-commit plan.

**Pre-requisito**: assets generados y commiteados en `public/landing/`.

---

## 1. Arquitectura frontend

### Ubicación en el App Router

```
app/
├── page.tsx                  ← Landing (NEW, server component)
├── layout.tsx                ← Root, ya existe
├── login/page.tsx            ← Auth, ya existe
├── registro/page.tsx         ← Signup, ya existe (revisar/update)
├── dashboard/
├── pos/
├── productos/
├── ...                       ← Resto de la app autenticada
```

**Decisión**: la landing vive directamente en `/` (`app/page.tsx`),
no en un route group separado. Razones:

- Es la URL pública canónica.
- Comparte el root layout (fonts, metadata base, PermissionsProvider).
- Más simple que crear `(public)` group.

### Server vs Client component

`app/page.tsx` será un **server component**. Razones:

1. **No flash de autenticación**: lee cookies en el server, decide
   `isAuthenticated` antes del primer paint. Si el user está logueado,
   el nav muestra "Ir al dashboard" desde el primer pixel, no parpadea.
2. **Performance**: no hace `supabase.auth.getUser()` desde el cliente
   en cada pageview anónimo. Una sola lectura de cookie en el server.
3. **Mejor LCP**: HTML completo desde el server, sin esperar hydration
   para mostrar el hero.

El server component renderiza un `<Landing isAuthenticated={bool} />`
client component que contiene la mayoría del DOM (las secciones con
animaciones, FAQ accordion, etc. necesitan client).

### Auth state en cookies

```tsx
// app/page.tsx (server component)
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export default async function HomePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(URL, ANON_KEY, { cookies: ... })
  const { data: { user } } = await supabase.auth.getUser()
  return <Landing isAuthenticated={!!user} />
}
```

### Cambios necesarios en `proxy.ts`

Hoy `RUTAS_PUBLICAS = ['/login', '/registro']`. El proxy redirige a
`/login` cualquier ruta no-pública si el user no está autenticado.

**Cambio**: agregar `/` a las rutas públicas, exactly como un string
literal (no prefix match, porque cualquier ruta empieza con `/`).
Mejor: invertir la lógica — `/` es público, todo lo bajo `/dashboard`,
`/pos`, etc. es protegido. Una forma:

```ts
const RUTAS_PROTEGIDAS = ['/dashboard', '/pos', '/productos', '/stock', '/ventas', '/caja', '/reportes', '/exportar', '/precios', '/perfil', '/usuarios']

const esProtegida = RUTAS_PROTEGIDAS.some(r => pathname.startsWith(r))
if (!user && esProtegida) return redirect('/login')
```

Esto deja `/`, `/login`, `/registro`, y cualquier nuevo subpath
público (futuro `/precios-publicos`, `/terminos`, etc.) accesible sin
auth.

---

## 2. Estructura de componentes

```
components/
└── landing/
    ├── Landing.tsx           ← Client component que orquesta todo
    ├── Nav.tsx               ← Nav superior (auth-aware)
    ├── Hero.tsx              ← H1 + sub + CTA + screenshot
    ├── Problema.tsx          ← 3 viñetas de dolor
    ├── ComoFunciona.tsx      ← 3 pasos zig-zag
    ├── ParaQuien.tsx         ← Kiosco / Minimarket / Almacén
    ├── Features.tsx          ← Grid 2x3 de features
    ├── Pricing.tsx           ← Card de precio único
    ├── FAQ.tsx               ← Acordeón
    ├── CTAFinal.tsx          ← Último empujón violet
    ├── Footer.tsx            ← Minimal
    └── lib/
        ├── Section.tsx       ← Wrapper de sección (padding consistente)
        ├── Container.tsx     ← Max-width + padding lateral
        ├── ScreenshotCard.tsx ← Img con radius + border + shadow
        ├── useInView.ts      ← Hook para fade-in al scrollear
        └── styles.ts         ← Constantes compartidas (colors, gaps)
```

**Por qué carpeta `landing/` separada**: las secciones no se reusan
fuera de la landing. Tener `components/Hero.tsx` al mismo nivel que
`components/ui/Modal.tsx` sería raro semánticamente. Carpeta dedicada
deja claro el scope.

**Por qué `landing/lib/`**: utilidades específicas de landing que
tampoco se reusan en la app autenticada. Mantiene separación.

---

## 3. Layout system

### Container

```tsx
// components/landing/lib/Container.tsx
export function Container({ children, maxWidth = 1200 }) {
  return (
    <div style={{
      width: '100%',
      maxWidth,
      margin: '0 auto',
      padding: '0 20px',     // mobile
      // desktop padding controlado por media queries en globals.css
    }}>
      {children}
    </div>
  )
}
```

Variantes de `maxWidth`:
- `720` — para texto centrado (H2 + sub de secciones).
- `900` — para FAQ.
- `1200` — default, layouts amplios.
- `1100` — para screenshots del hero.

### Section

```tsx
// components/landing/lib/Section.tsx
export function Section({ children, background = 'bg', paddingY = 'md' }) {
  const bg = background === 'card' ? 'var(--bg2)' : 'var(--bg)'
  const py = paddingY === 'lg' ? 96 : 64
  return (
    <section style={{ background: bg, padding: `${py}px 0` }}>
      {children}
    </section>
  )
}
```

Esto centraliza el ritmo vertical y los backgrounds alternados que
la spec definió.

### Sistema de spacing

Mantenemos el ritmo 8px que la app ya usa:
- xs: 8, sm: 16, md: 24, lg: 40, xl: 64, xxl: 96.

Las secciones alternan padding vertical:
- 64 (sm) en mobile.
- 96 (lg) en desktop.

Backgrounds alternados entre secciones:
- Hero, "Problema", "Para quién", "Pricing": `var(--bg)` warm off-white.
- "Cómo funciona", "Features", "FAQ", "Footer": `var(--bg2)` white.
- "CTA final": `var(--ac)` violet brand.

---

## 4. Responsive strategy

### Mobile-first con 4 breakpoints

| Breakpoint | Width | Uso |
|---|---|---|
| Mobile | < 768 | Default. Todo el CSS arranca acá. |
| Tablet | ≥ 768 | Layout 2 cols donde aplique. |
| Desktop | ≥ 1024 | Layout 3 cols, H1 grande. |
| Wide | ≥ 1440 | Max-width container kicks in. |

### Implementación

El proyecto usa inline styles + globals.css. Para landing seguimos
el mismo patrón:

- **Inline styles** para layout específico de cada elemento
  (composición, colores, fontSizes default = mobile).
- **globals.css** para media queries que ajustan tipografía y grids:

```css
/* En globals.css, sección "landing" */
.landing-h1 { font-size: 36px; }
@media (min-width: 768px) { .landing-h1 { font-size: 56px; } }
@media (min-width: 1024px) { .landing-h1 { font-size: 72px; } }
@media (min-width: 1440px) { .landing-h1 { font-size: 80px; } }
```

Patrón: cada estilo que cambia entre viewports usa una clase con
media queries en globals.css. Cada componente JSX usa esas clases
+ inline para lo único.

### Hero adaptativo

El hero tiene comportamiento responsive importante:
- H1 line breaks: 4 líneas mobile → 2 líneas desktop. Implementado
  con `<br className="show-mobile">` y `<br className="show-desktop">`
  o con `<span style={{ display: 'block' }}>` controlados por media.
- Screenshot: 2 archivos distintos (`01-hero-pos.webp` desktop +
  `08-pos-mobile.webp` mobile). Servidos con `<picture>` + `<source
  media="(max-width: 767px)">`.

---

## 5. Loading / performance strategy

### Targets

- **LCP** (Largest Contentful Paint): < 1.5s en 4G. El LCP probable
  es el screenshot del hero.
- **CLS** (Cumulative Layout Shift): 0. Reservamos espacio para
  imágenes con `width`/`height` attrs.
- **FCP** (First Contentful Paint): < 1s.
- **Lighthouse Performance**: 95+.

### Estrategias

**Fonts**:
- Ya usamos `<link>` para Google Fonts en `app/layout.tsx`. Eso es OK.
- Asegurar `font-display: swap` (Google Fonts lo hace por default).

**Hero screenshot preload**:

```tsx
// En app/page.tsx (server component)
export const metadata = {
  other: {
    'link-preload-hero': '<link rel="preload" as="image" href="/landing/01-hero-pos.webp" />'
  }
}
```

(O directamente con `<link>` en el head via metadata API de Next.)

**Screenshots below-fold**:
- `<img loading="lazy" />` para que no bloqueen.
- Decoding async.

**Critical CSS**:
- Next.js inline-ea CSS critical por default en App Router. No
  necesitamos hacer nada extra.

**No JS innecesario en la landing inicial**:
- El FAQ accordion es lo único que necesita JS interactivo.
- Si querés optimizar más, FAQ podría ser `<details>` HTML nativo
  (zero JS) — decisión propuesta abajo en sección de animaciones.

**Tamaño total apuntado**:
- HTML: < 20KB.
- CSS: < 30KB.
- Imágenes inline: 0.
- Imágenes WebP: 8 capturas × ~80KB = ~640KB total, pero solo el
  hero shot se carga inicialmente (~100KB).
- JS: < 50KB para el FAQ + animaciones.

Total inicial (above-fold): ~200KB. 4G arrastra en < 1s.

---

## 6. Image handling

### Plain `<img>` con `<picture>`, NO `next/image`

Razones contra `next/image`:
- Las imágenes ya están optimizadas a WebP en `public/landing/`.
- `next/image` re-procesa y genera múltiples sizes. Para 8 imágenes
  no vale el overhead.
- Plain `<img>` con `loading=lazy/eager` y `<picture>` para responsive
  cumple los mismos targets.

### Pattern del hero (responsive image)

```tsx
<picture>
  <source media="(max-width: 767px)" srcSet="/landing/08-pos-mobile.webp" />
  <img
    src="/landing/01-hero-pos.webp"
    alt="Sylvora — POS cobrando un ticket"
    width={1440}
    height={900}
    loading="eager"
    fetchPriority="high"
    decoding="async"
  />
</picture>
```

- `width`/`height`: reservan espacio, evitan CLS.
- `loading="eager"` + `fetchPriority="high"`: prioridad alta.
- Decoding async para no bloquear el main thread.

### Pattern de imágenes below-fold

```tsx
<img
  src="/landing/04-productos-stock.webp"
  alt="Lista de productos con estados de stock"
  width={1200}
  height={700}
  loading="lazy"
  decoding="async"
/>
```

### Wrapper ScreenshotCard

```tsx
// components/landing/lib/ScreenshotCard.tsx
export function ScreenshotCard({ src, srcMobile, alt, width, height, priority = false }) {
  return (
    <div style={{
      borderRadius: 18,
      overflow: 'hidden',
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.06)',
    }}>
      <picture>
        {srcMobile && <source media="(max-width: 767px)" srcSet={srcMobile} />}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </picture>
    </div>
  )
}
```

Este componente encapsula el tratamiento editorial definido en la
spec (radius + border + shadow). Cualquier screenshot en la landing
lo usa.

---

## 7. Animaciones

### Principio: sutiles, no llamativas

Spec definió:
- Fade-in al scrollear cada sección.
- Stagger de elementos del hero (h1 → sub → CTA → micro → screenshot).
- Respeta `prefers-reduced-motion`.

### IntersectionObserver hook

```ts
// components/landing/lib/useInView.ts
import { useEffect, useRef, useState } from 'react'

export function useInView(options = { threshold: 0.1, rootMargin: '0px 0px -10% 0px' }) {
  const ref = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) { setInView(true); return }

    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        obs.disconnect()  // una sola vez
      }
    }, options)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return { ref, inView }
}
```

Uso:

```tsx
function Problema() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
    }}>
      ...
    </section>
  )
}
```

### Hero stagger

Stagger entre H1 → sub → CTA → micro → screenshot. Implementado con
`transition-delay` por elemento, todos triggering al cargar la page
(no IntersectionObserver — el hero está above-fold siempre).

```tsx
// Cada elemento con su delay propio
<h1 style={{ transitionDelay: '0.1s' }}>...</h1>
<p style={{ transitionDelay: '0.25s' }}>...</p>
<button style={{ transitionDelay: '0.4s' }}>...</button>
```

Total reveal del hero: ~1.2s. Suficientemente rápido para que
parezca instant pero el ojo lo sigue.

### FAQ — `<details>` HTML nativo vs JS state

**Decisión propuesta**: usar `<details>` y `<summary>` nativos.

```tsx
<details>
  <summary>¿Tengo que comprar algo además del celular?</summary>
  <p>No. Si tu celular tiene cámara y conexión...</p>
</details>
```

Pros:
- Zero JS.
- Accesible por default (keyboard, screen reader).
- Animaciones de expand/collapse pueden agregarse con CSS si querés.

Cons:
- Estilo default feo. Hay que customizar `<summary>` con CSS.
- Animación de expand requiere CSS `interpolate-size` (cobertura
  ~75%) o un truco con `grid-template-rows`.

Para V1, animación instant (no smooth expand) es aceptable. Si
después querés smooth, agregamos CSS.

---

## 8. SEO / meta structure

### Metadata en `app/page.tsx`

```tsx
export const metadata: Metadata = {
  title: 'Sylvora — Punto de venta y control de stock para comercios',  // sin template
  description: 'Cobrá, controlá stock y cerrá tu caja desde el celular. Hecho para kioscos, almacenes y minimarkets. Empezás gratis en 2 minutos.',
  openGraph: {
    title: 'Sylvora — Punto de venta y control de stock para comercios',
    description: 'Hecho para kioscos, almacenes y minimarkets. Probá 30 días gratis.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
    locale: 'es_AR',
    type: 'website',
  },
  twitter: { ... },
  alternates: { canonical: '/' },
}
```

### Structured data (JSON-LD)

Para que Google entienda que somos una SaaS application:

```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Sylvora',
  description: '...',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '15000',
    priceCurrency: 'ARS',
    description: '30 días gratis, luego AR$15.000/mes',
  },
}) }} />
```

Esto va inline en el HTML del server component.

### sitemap.xml y robots.txt

- `app/sitemap.ts` que exporte `[{ url: '/' }, { url: '/login' }, { url: '/registro' }]`.
- `app/robots.ts` ya existe (verificar) o crear con:
  ```ts
  export default function robots() {
    return {
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://<domain>/sitemap.xml',
    }
  }
  ```

---

## 9. Navegación pública vs app autenticada

### Estado actual

- `/login`, `/registro`: páginas chrome propio (sin sidebar, branded).
- `/dashboard`, `/pos`, etc.: cada una con `layout.tsx` que renderiza
  `<Sidebar />`.
- `proxy.ts`: redirige a `/login` si no auth y la ruta no es pública.

### Cambios necesarios

1. **`proxy.ts`**: cambiar a la lógica "lista de rutas PROTEGIDAS"
   (sección 1). `/` queda público.
2. **`app/page.tsx`** nuevo: la landing.
3. **Nav de la landing**: muestra "Entrar" si !auth, "Ir al dashboard"
   si auth. CTAs cambian a "Ir al dashboard" si auth.
4. **CTAs apuntan a `/registro`** (signup) si !auth, a `/dashboard`
   si auth.

### `/registro` — ajustes opcionales

El signup actual ya crea comercio + perfil + 5 categorías default.
La spec (sección 14k del landing-spec) sugiere también:
- Crear seed inicial: 3 productos demo + caja abierta.
- Redirigir a `/pos` (no `/dashboard`) post-signup.
- Tooltips de onboarding inline en POS.

**Para V1 de landing**: dejar `/registro` como está. Es funcional.
**Para V1.5**: hacer el rework de onboarding según spec. Lo
documento en backlog.md cuando arranquemos.

### Footer del landing

Tiene un link a "Entrar" / "Crear cuenta". Si user logueado, podría
redirigir o esconderse. Decisión simple: en footer mostramos siempre
"Entrar" como link a `/login`. Si el user está logueado, `/login`
mismo redirige a `/dashboard` (ya pasa por `proxy.ts`). No necesita
lógica adicional.

---

## 10. Plan de implementación por commits

Total estimado: **7 commits** que se pueden mergear independientemente.
Cada uno deja la landing en un estado mejorable pero funcional.

### Commit 1 — Foundation + Nav + Footer (chrome)

**Archivos**:
- `app/page.tsx` (server component básico).
- `proxy.ts` (update de rutas públicas).
- `components/landing/Landing.tsx` (cliente que orquesta).
- `components/landing/Nav.tsx` (con "Entrar" / "Ir al dashboard").
- `components/landing/Footer.tsx`.
- `components/landing/lib/Container.tsx`.
- `components/landing/lib/Section.tsx`.
- `app/globals.css` (agrega clases responsive `.landing-h1`,
  `.landing-h2`, `.landing-sub`, etc.).

**Resultado**: visitando `/` se ve un nav, un main vacío con padding
correcto, y un footer. Responsive funciona. Auth state correctamente
detectado.

### Commit 2 — Hero

**Archivos**:
- `components/landing/Hero.tsx`.
- `components/landing/lib/ScreenshotCard.tsx`.
- `app/page.tsx` agrega `<link rel="preload">` para hero image.

**Resultado**: visitando `/` se ve el hero completo: H1, sub, CTA,
micro, screenshot con tratamiento editorial. Responsive funciona.
Stagger animation al cargar.

### Commit 3 — Secciones "El problema", "Cómo funciona", "Para quién"

3 secciones de baja complejidad técnica, todas con texto + cards o
texto + screenshot.

**Archivos**:
- `components/landing/Problema.tsx` (3 cards con icon + dolor).
- `components/landing/ComoFunciona.tsx` (3 pasos zig-zag desktop /
  stack mobile).
- `components/landing/ParaQuien.tsx` (3 perfiles con etiqueta
  uppercase + ejemplo).
- `components/landing/lib/useInView.ts` (hook fade-in al scrollear).

**Resultado**: 3 secciones más visibles, cada una fade-in al
scrollear.

### Commit 4 — Features grid

**Archivos**:
- `components/landing/Features.tsx` (grid 2×3 desktop, stack mobile).

**Resultado**: la sección de features con sus 6 cards y
mini-screenshots.

### Commit 5 — Pricing

**Archivos**:
- `components/landing/Pricing.tsx`.

**Resultado**: card de precio centrada con chip "30 DÍAS GRATIS",
número grande DM Mono, lista de features, CTA. Sola sección
relativamente compleja visualmente, separada para que el code
review se enfoque en ella.

### Commit 6 — FAQ + CTA final

**Archivos**:
- `components/landing/FAQ.tsx` (acordeón con `<details>` nativos).
- `components/landing/CTAFinal.tsx` (sección violet).

**Resultado**: las últimas dos secciones de contenido. La landing
está visualmente completa.

### Commit 7 — SEO, metadata, sitemap, structured data

**Archivos**:
- `app/page.tsx` (metadata final + JSON-LD).
- `app/sitemap.ts` (si no existe).
- `app/robots.ts` (verificar/actualizar).
- `app/layout.tsx` (ajustes si necesario al template de title).

**Resultado**: landing producción-ready en SEO. Lighthouse 95+.

---

## 11. Riesgos y decisiones a tomar durante implementación

### Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| H1 line breaks raros en breakpoints intermedios (768-1023) | Test visual en cada breakpoint principal. Markup explícito de breaks (`<br className="...">`). |
| CLS por imágenes que no reservan espacio | `width`/`height` obligatorios en todos los `<img>`. Verificar con Lighthouse CLS=0. |
| Animations triggering antes que la imagen cargue | Stagger del hero NO depende del screenshot — solo del onLoad de la page. El screenshot tiene su propio fade-in cuando carga. |
| LCP > 1.5s en 4G | `<link rel="preload">` del hero image. WebP optimizado < 100KB. Verificar con Lighthouse. |
| `prefers-reduced-motion` ignorado en algún componente | Hook `useInView` lo respeta. Animaciones inline en hero también deben chequear. |

### Decisiones a tomar durante implementación

1. **¿FAQ con animación smooth de expand o instant?** Mi voto: instant
   en V1 (más simple, menos JS). Smooth en V1.5 si querés pulir.
2. **¿Sticky CTA bottom bar en mobile después del hero?** Mi voto:
   probarlo en commit 7. A/B test mental — si se siente intrusivo,
   sacarlo.
3. **¿Toggle dark mode en landing?** Mi voto: **no**. La landing es
   light only (spec lo confirmó).
4. **¿Link a documentación / soporte en footer?** Por ahora solo
   WhatsApp + Términos + Privacidad. Si después tenés docs, agregamos.

---

## 12. Cosas que NO hacemos en este plan

Para resistir scope creep, lista explícita de lo que NO va en el
sprint de landing:

- **Rework de `/registro`** con seed de demos + tooltips inline.
  Backlog. La landing apunta a `/registro` actual.
- **Páginas estáticas adicionales** (`/terminos`, `/privacidad`,
  `/precios-detalle`). Para V1, los links del footer pueden ir a
  `mailto:` o ser placeholders. Crear las páginas después.
- **Multi-idioma**. Solo español. Si después llega multi-idioma,
  refactor.
- **Blog / changelog**. No es V1.
- **Página de "Para quién" expandida** ("/kiosco", "/minimarket",
  "/almacen"). Solo la sección de la landing.
- **Pricing comparativo** con competidores. Cero.
- **Calculadora de "cuánto ahorrás"**. Gimmick.
- **Animaciones complejas** (Lottie, Framer Motion). Solo fade-in
  con CSS transitions.
- **Newsletter signup form**. No.
- **Cookie banner**. Solo si el deploy lo requiere por compliance.

---

## 13. Listo para arrancar

Cuando confirmes que el plan está OK:

1. Empiezo por **Commit 1** (foundation + nav + footer).
2. Lo commiteo y vos lo revisás visualmente en `/`.
3. Continuamos secuencialmente.

Si en algún commit pinta que algo del plan no funciona en código
real, lo discutimos antes de seguir — mejor un ajuste de plan que
forzar la implementación.
