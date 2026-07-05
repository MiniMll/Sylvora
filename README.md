# Sylvora

Punto de venta y control de stock para comercios.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Supabase (auth + Postgres + Storage)
- Zustand para estado del carrito
- Tailwind CSS 4
- Recharts para visualizaciones

## Desarrollo local

```bash
cp .env.example .env.local   # completar credenciales Supabase
npm install
npm run dev
```

Después, en el SQL editor de Supabase, ejecutar una vez:

- `supabase-schema.sql` — schema base
- `supabase-rpc-stock.sql` — RPC de descuento atómico de stock
- `supabase-migracion-credito.sql` — columna `credito` en cierres de caja
- `supabase-vista-stock-bajo.sql` — vista opcional para alertas (futuro)

## Comandos

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción |
| `npm run lint` | ESLint |

## Estructura

```
app/
  pos/            — punto de venta
  productos/      — catálogo + alta + edición
  ventas/         — historial
  caja/           — caja diaria + cierres
  reportes/       — métricas
  dashboard/      — panel principal
components/       — UI reutilizable
lib/
  supabase/       — capa de datos por dominio (productos, ventas, stock, caja)
  hooks/          — hooks compartidos
  store.ts        — zustand del POS
  utils.ts        — formatPeso, stockColor, stockLabel
types/database.ts — row types de Supabase
proxy.ts          — middleware de auth (Next 16 lo llama "proxy")
```

## Notas de operación

- El POS usa scanner físico USB/Bluetooth (actúa como teclado). El input está siempre en focus, scan + Enter agrega el producto.
- F8 o Ctrl+Enter cierran la venta sin tocar el mouse.
- Productos por kilo/litro/metro abren un modal de cantidad. Productos por unidad sin stock están bloqueados.
- Si una venta falla guardándose (red, etc.), el ticket queda intacto para reintentar.

## Mercado Pago

Cobros QR dinámicos con la cuenta MP propia de cada comercio (OAuth;
Sylvora no toca dinero ni cobra comisión). Documentación:

- [docs/mp-lifecycle-cobro.md](docs/mp-lifecycle-cobro.md) — lifecycle
  de un cobro: Intento → Pago → Venta → Revisión → Resolución.
- [docs/mp-revision-recuperacion.md](docs/mp-revision-recuperacion.md) —
  cola de "Cobros a revisar": cómo se garantiza que ningún pago
  aprobado quede invisible si la venta no se registró. Incluye el
  checklist de QA manual.
- [docs/mercado-pago-cobros-spec.md](docs/mercado-pago-cobros-spec.md) —
  spec completa de la integración.

Migraciones MP (SQL editor de Supabase, en orden):
`migration-mp-cobros-v1.sql` → `migration-mp-intentos-requiere-revision.sql`
→ `migration-mp-revision-v1.sql`.

Invariante operativa: si MP cobró y la venta no quedó registrada, el
cobro aparece en Configuración → Mercado Pago → "Cobros a revisar"
(admin-only) y el Dashboard muestra un banner hasta que se resuelva.
Las resoluciones quedan en `mp_resoluciones_cobro` (auditoría
inmutable).
