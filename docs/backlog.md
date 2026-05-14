# Backlog — features e ideas a futuro

Este archivo es para **features de producto e ideas de mejora** que todavía
no están planificadas para implementar.

Para bugs, hallazgos de QA y checklist de validación → ver `qa-review.md`.

---

## Features pendientes

### Editar lote (completo)

Hoy un lote solo se puede crear o borrar. Falta poder editarlo.

**Enfoque preliminar (a confirmar en sesión dedicada):**

- **Modal aparte**, no inline. Más espacio para los 3 campos + warnings.
- **Campos editables**: cantidad, fecha de vencimiento, número de lote.
- **Warnings antes que bloqueos agresivos** — avisar, no impedir, salvo
  casos que rompan integridad de datos.
- **Sin auditoría en v1** — no registrar historial de cambios todavía,
  para no complejizar de más. Se puede sumar después si hace falta.

**Pendiente de definir — colisión de fusión:**

La regla actual de fusión de lotes es por `numero_lote + fecha_vencimiento`
(ver `lib/supabase/stock.ts:agregarLote`). Editar cualquiera de esos dos
campos puede dejar el lote "fusionable" con otro existente. Hay que decidir
el comportamiento:

- ¿El modal detecta la colisión y ofrece fusionar?
- ¿La bloquea con un error?
- ¿La permite y quedan dos lotes con misma clave (rompe la invariante)?

Es el punto más jugoso del diseño — requiere discusión antes de codear.

---

## Future UX / P2

Mejoras que no son bugs críticos pero suman. Sin prioridad asignada todavía.

### Design system

- **Extraer primitivas restantes**: `<KpiCard>` (unificar las 3 versiones
  divergentes — dashboard premium vs flat de ventas/caja), `<Card>`,
  `<Pill>`/`<Badge>`, `<PageHeader>`, `<EmptyState>`, `<Toolbar>`.
- **Consolidar opacidades del rojo danger**: hoy hay ~8 niveles de
  `rgba(255,71,87, X)` distintos. Llevar a 3 tokens (`--r-bg`,
  `--r-bg-strong`, `--r-border`).
- **Typography scale formal**: definir tokens (`--text-xs` … `--text-3xl`)
  en vez de fontSizes sueltos.
- **Tokenizar la sub-paleta del sidebar** (`--sidebar-bg/fg/border`) —
  hoy es literal `#111118`. Habilita un sidebar light a futuro.

### Dark mode

- **QA visual completo página por página** en dark. El toggle existe y
  los tokens están bien, pero falta una pasada de validación visual.
- **Charts en dark**: los tick fills de recharts (`fill='#6b6b72'`) no
  resuelven CSS vars → se ven mal en dark. Requiere un hook `useTheme()`
  o pasar `currentColor`.

### POS

- **Card-collapse de la tabla de ventas en mobile**: hoy las tablas usan
  scroll horizontal; para `ventas` específicamente, colapsar cada fila a
  card stack <768px sería más legible. Postergado hasta extraer
  `<DataTable>`.
- **Layout del POS sin depender de `dvh`**: el modo responsive de Chrome
  DevTools se ve raro porque `dvh` se calcula contra la ventana del
  DevTools. En dispositivo real anda bien — solo valdría la pena si se
  quiere que DevTools también se vea perfecto. Refactor del Bloque A.

### Lotes / stock

- **Badge de "por vencer" en la grilla de productos** y/o alerta en el
  dashboard cuando hay lotes próximos a vencer. El helper
  `formatVencimiento()` ya existe; faltaría exponer el dato a otras vistas.

### Login / registro

- **Migrar a tokens del design system**: hoy tienen surfaces fijo-light
  y branding shadow propio, no tokenizados. Migración completa = PR aparte.
