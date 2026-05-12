# QA Review — pausa pre-P1

Checklist de validación antes de entrar a la extracción de primitivas
(`<Modal>`, `<Button>`, `<Input>`, `<KpiCard>`).

Estado actual del producto:
- Core operativo cerrado (POS, persistencia, cierre real, tickets, hardening).
- Design system normalizado a tokens (PR-1 `07e5825`, PR-2 `743a99e`).
- Falta validación con uso real antes de abstraer componentes.

---

## 1) Dark / light completo

Togglear en cada página y mirar:

- [ ] **Dashboard** — charts (recharts tick fills se ven mal en dark, deuda conocida — anotar, no arreglar).
- [ ] **Caja** — chart de movimientos, tabla, chips de método.
- [ ] **Reportes** — KPIs, tabla ranking, badges de margen.
- [ ] **Ventas** — KPIs, tabla, modal de detalle (ticket).
- [ ] **Productos** — grid, detail, edit modal.
- [ ] **POS** — search list, carrito, payment, toast post-cobro.
- [ ] **Login / registro** — gradient fijo-light por diseño; confirmar que el toggle no rompe nada (la página queda igual en ambos modos — esperado).
- [ ] **Sidebar** — siempre-dark, no cambia.
- [ ] **Inputs en focus** — ring violeta visible en ambos modos.
- [ ] **Modales** — borrar producto, lote, anular venta, cerrar caja.
- [ ] **Toasts** — post-cobro, errores Supabase.

---

## 2) POS en tablet / celular real

Lo más valioso del review. Foco en lo que no se ve en desktop dev.

- [ ] **Bottom sticky + keyboard-safe** (bloque A): botón Cobrar nunca tapado al tipear cantidad/peso, en iOS y Android.
- [ ] **Toast post-cobro con CTAs**: botones tappables (≥44px), "Compartir" abre sheet nativo.
- [ ] **Print desde toast**: si hay impresora térmica a mano. Si no, `window.print()` preview.
- [ ] **Búsqueda + selección con teclado virtual abierto**: lista scrolleable.
- [ ] **Quantity inline + vuelto**: tipeo rápido sin perder foco.
- [ ] **Safe-area-inset-bottom**: notch de iOS no come UI.
- [ ] **Tablet horizontal**: layout no cae en el peor de los dos mundos (entre mobile y desktop).

---

## 3) Flujo entero punta a punta

Una sola corrida sin atajos. Si algo falla, anotar el step y seguir — no debuggear en vivo.

1. [ ] Abrir caja con monto inicial.
2. [ ] Cargar 3-4 productos con cantidades variadas (uno por kg, uno por unidad).
3. [ ] Cobrar con efectivo + vuelto.
4. [ ] Imprimir + compartir desde el toast.
5. [ ] Cargar otra venta con descuento.
6. [ ] Cobrar con débito o Mercado Pago.
7. [ ] Ir a historial, anular una de las dos ventas.
8. [ ] Verificar ticket marcado "ANULADA".
9. [ ] Cerrar caja con efectivo contado.
10. [ ] Diferencia detectada correctamente.

---

## 4) Consistencia visual general

No corregir ahora — anotar. La lista alimenta la priorización de primitivas en P1.

- [ ] **KPI cards** entre dashboard / ventas / caja — ¿se nota que son 3 versiones distintas? (dashboard tiene shadow + lift-hover, ventas/caja flat).
- [ ] **Botón primary** en distintas páginas — padding `8px 16px` / `10px 18px` / `14px` — ¿se siente raro o pasa desapercibido?
- [ ] **Inputs** productos vs ventas vs filters — ¿micro-shift visible al cambiar de página?
- [ ] **Tablas** caja vs dashboard vs ventas — densidades distintas: ¿molesta?
- [ ] **Modales** — ¿los 4-5 modales actuales se sienten parte del mismo sistema o cada uno es su propia decisión?
- [ ] **Headers de página** — son consistentes (24/700/-0.02em), confirmar que la sensación es uniforme.

---

## Formato sugerido para anotar hallazgos

Una nota por hallazgo:

- **Severidad**: bloqueante / molesto / cosmético.
- **Página o flujo**.
- **Dispositivo** (si aplica).
- **Qué viste**.

Ejemplo:

> **molesto** · POS · iPhone 13 · al abrir el teclado para tipear cantidad,
> el botón Cobrar queda tapado durante ~200ms hasta que se ajusta el dvh.

---

## Decisión al volver

Según lo que salga de la lista:

- **Hay bloqueantes** → arreglos antes de P1.
- **Patrón claro** (ej. "todos los modales se sienten distintos") → confirma qué primitiva extraer primero.
- **Todo OK** → P1 en orden del audit: `<Modal>` → `<Button>` → `<Input>` → `<KpiCard>`.

---

## Deuda conocida (no es parte del QA, ya identificada)

- Recharts tick fills (`fill='#6b6b72'` × 8) no resuelven CSS vars → mal en dark. Requiere fix con `useTheme()` hook o `currentColor`.
- Login / registro tienen surfaces fijo-light no tokenizadas. Migración completa = PR aparte.
- `lib/utils.ts:stockColor()` devuelve hex literal porque consumers concatenan opacidad. Fix conjunto cuando se extraigan primitivas.
- Opacidades de `rgba(255,71,87, X)` en 8 niveles distintos → consolidar a 3 tokens (`--r-bg`, `--r-bg-strong`, `--r-border`).
