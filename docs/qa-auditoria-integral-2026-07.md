# QA Integral de Sylvora — Auditoría (julio 2026)

Rol: Senior QA + Product Engineer + Software Architect.
Alcance: toda la aplicación, sin implementar cambios.
Método: revisión de código dirigida + verificación puntual de cada
sospecha (los hallazgos marcados **[V]** fueron verificados contra el
código; los marcados **[I]** son por inspección y requieren
reproducción manual antes de corregir).

Convenciones: P0 = pérdida de dinero/datos o bloqueo total ·
P1 = corregir antes de clientes reales · P2 = primeras semanas con
clientes · P3 = deuda/backlog. Esfuerzo: S (<½ día), M (1-2 días),
L (3+ días).

---

## 0. Aclaración de alcance — módulos que NO existen

| Módulo pedido | Estado real |
|---|---|
| **Clientes** | No existe (ni tabla ni UI). `ultimas_ventas.cliente` del dashboard devuelve `null` hardcodeado. Si se espera para V1, es un feature nuevo, no un bug. **[V]** |
| **Categorías (UI)** | La tabla existe y `productos.categoria` está migrada, pero no hay UI de gestión (documentado en migration-roles-v1: "nadie las gestiona activamente en UI V1"). **[V]** |
| **Onboarding** | No hay wizard post-registro. El registro crea comercio+admin y aterriza directo. La página `/guia` cumple parcialmente ese rol. **[V]** |

---

## 1. Hallazgos por módulo

### 1.1 Login / Registro

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| L1 | **No existe flujo "olvidé mi contraseña"** en `/login`. Peor: el copy del flujo de invitaciones y del endpoint invite lo referencian como salida oficial ("pedile que use olvidé mi contraseña") — se recomienda un botón que no existe. **[V]** | **P1** | Usuario bloqueado sin salida → soporte manual vía Supabase dashboard. Con clientes reales es incidente semanal | M | `supabase.auth.resetPasswordForEmail` + página `/reset-password`. Corregir el copy de invitaciones si se posterga |
| L2 | Sin rate-limit ni captcha en login/registro. **[I]** | P2 | Abuso de registro (comercios basura) y fuerza bruta de login (Supabase tiene throttling propio parcial) | M | Rate limit por IP en `/api/registro`; evaluar Turnstile en registro |
| L3 | Registro: sin verificación de email obligatoria antes de operar. **[I]** | P3 | Emails inválidos → no recuperables (se agrava con L1) | S | Decidir política; al menos warning |

### 1.2 Landing

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| LA1 | MiniPreviews muestran los 3 roles y features actuales — consistente tras el sprint de roles. Sin bugs conocidos. **[V]** | — | — | — | — |
| LA2 | Verificar que los CTAs y screenshots reflejen Mercado Pago (feature nuevo grande que la landing quizás no vende). **[I]** | P2 | Marketing desactualizado = pérdida de conversión | S | Card/preview de cobro QR en features |

### 1.3 POS

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| P1a | **Cobro "manual" de Mercado Pago** (MPPaymentChoiceModal): el cajero declara que el cliente pagó, sin verificación contra MP ni `mp_payment_id`. La venta queda `metodo_pago='mercadopago'` indistinguible de una verificada. **[V]** | **P2** | Conciliación imposible entre ventas MP manuales y reales; un cajero deshonesto registra "pagó por MP" sin pago. Feature intencional, pero sin marca diferencial | S | Persistir la distinción (ej. `metodo_pago='mercadopago_manual'` o flag) + mostrarla en caja/reportes |
| P1b | Race multi-cajero sobre stock: **bien cubierto** por la RPC atómica `descontar_stock_validado` + manejo de `stock_insuficiente` en UI. Fortaleza, no bug. **[V]** | — | — | — | — |
| P1c | Carrito persistido con guard `carrito_comercio_mismatch` — cubre el cambio de comercio en la misma máquina. **[V]** | — | — | — | — |
| P1d | Layout POS depende de `dvh` (ya en backlog): raro en DevTools, OK en dispositivo. **[V]** | P3 | Cosmético | M | Backlog existente |
| P1e | Atajos F8/Ctrl+Enter suprimidos con modal abierto vía `[data-modal-card]` — correcto. Accesibilidad: botones de método con `aria-pressed`. **[V]** | — | — | — | — |

### 1.4 Ventas (historial + anulación)

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| V1 | **Anular una venta cobrada por MP no avisa ni registra nada sobre el dinero.** La anulación restituye stock y marca `anulada`, pero el pago MP sigue cobrado: no hay prompt de "acordate de devolver desde el panel MP", ni marca de devolución, ni vínculo con el intento (que queda `resuelto`/asociado y no reaparece en la cola). Es el espejo exacto del problema que resolvió la épica requiere_revision, en la dirección inversa. **[V]** | **P1** | Dinero cobrado + venta anulada + stock restituido = descuadre real; el cliente final pagó por algo anulado y nada lo recuerda | M | Al anular venta con `metodo_pago='mercadopago'`: modal de confirmación con aviso de devolución manual + registrar el evento (nota en el intento o tabla de conciliación) |
| V2 | Listado `/ventas` y `getVentas()` sin límite por defecto (`select('*, items_venta(*)')` completo). **[V]** | P2 | Con 6-12 meses de datos, carga lenta + memoria | M | Paginación o rango de fechas por defecto (últimos 30 días) |
| V3 | Búsqueda y filtros por método funcionan; venta anulada excluida de totales pero visible — correcto. **[V]** | — | — | — | — |

### 1.5 Caja

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| C1 | Día operativo integrado (épica cerrada, 27 tests). Cierre por día operativo con UNIQUE. Fortaleza. **[V]** | — | — | — | — |
| C2 | `useState<any[]>` + un `set-state-in-effect` preexistentes (10 errores de lint conocidos, verificados idénticos en HEAD desde antes). **[V]** | P3 | Sin impacto runtime; fricción de mantenimiento | S | Tipar en un PR de limpieza |
| C3 | El "efectivo esperado" asume caja inicial 0 (sin saldo de apertura) — documentado en el código como decisión V1. **[V]** | P2 | Diferencias de arqueo confusas para comercios que dejan fondo de caja | M | Campo "fondo inicial" en el cierre anterior o apertura explícita (V2) |

### 1.6 Gastos

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| G1 | **Fecha default del form usa `new Date().toISOString().slice(0,10)` = fecha UTC.** Desde las 21:00 hora Argentina, el gasto se precarga con fecha de MAÑANA. Es el mismo bug UTC que se corrigió en caja/dashboard, vivo acá. Afecta el "gastos del mes" del dashboard y reportes (el gasto cae en el día/mes equivocado). **[V]** `app/gastos/page.tsx:43` y helper del primer día de mes (43-48) | **P1** | Datos financieros en el día equivocado, sistemáticamente para comercios nocturnos y cualquier carga nocturna | S | Usar `fechaLocalArgentina()` del helper de día operativo (ya existe) |
| G2 | Gastos usa día calendario, no día operativo (decisión consciente al cerrar la épica — dashboard consulta por fechas operativas pero la carga es calendario). **[V]** | P2 | Coherencia parcial para nocturnos | S-M | Alinear el default de carga con `fechaOperativaDeTimestamp` |
| G3 | RLS correcta (admin+encargado, policies verificadas). **[V]** | — | — | — | — |

### 1.7 Productos / Lotes / Stock

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| S1 | Integridad stock↔lotes: invariante `SUM(lotes) == stock_actual` defendida en 3 capas (UI + guard cliente + RPC), `restituir_stock` es lotes-aware (agrega al lote más viejo o crea `L-RESTITUIDO`). Fortaleza post-sprint integrity-v2. **[V]** | — | — | — | — |
| S2 | Editar lote fue removido (workaround borrar+agregar) — UX áspera pero segura, documentada. **[V]** | P3 | Fricción menor | M | Reintroducir edición vía RPC atómica (V2) |
| S3 | Badge "por vencer" en grilla/dashboard no existe (backlog). FEFO comunicado con Hint. **[V]** | P3 | Vencimientos se descubren tarde | M | Backlog existente |
| S4 | Importación de productos: revisar límites de tamaño de archivo y sanitización (requisito declarado "límite 500 filas / sanitizar") — no verificado en esta pasada. **[I]** | P2 | Import gigante puede colgar el browser | S | Verificar y capear |

### 1.8 Dashboard / Reportes

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| R1 | Día operativo integrado en ambos con fuente única + test de consistencia C1-C4. Fortaleza. **[V]** | — | — | — | — |
| R2 | **RPC legacy `get_reporte_dashboard(text, text)` sigue viva en Supabase** — el cleanup post-deploy (DROP de la firma V2) quedó documentado pero no confirmado ejecutado. **[V]** (pendiente operativo) | P2 | Superficie muerta llamable por clientes viejos; confusión futura | S | Ejecutar el DROP comentado en `migration-reportes-dia-operativo.sql` tras confirmar deploy |
| R3 | Endpoint dashboard carga TODO el período (mes) con items embebidos y agrega en JS. **[V]** | P2 | Con volumen alto (~5k ventas/mes) response pesada y lenta | M | Mover agregaciones a RPC (patrón de reportes) cuando duela |
| R4 | Banner MP en dashboard dispara lazy-promote al navegar — detección temprana. Fortaleza. **[V]** | — | — | — | — |

### 1.9 Mercado Pago

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| M1 | **Limpieza pre-producción**: `MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX` (bypass de firma) y `MP_MODE=manual_sandbox` existen con hard-guards (solo sandbox), pero son código y envs que NO deben llegar a prod activos. **[V]** | **P1** (checklist operativa) | Si un guard se relajara por error, webhooks sin firma en prod | S | Checklist de deploy: envs fuera de prod; considerar borrar el bypass cuando OAuth real esté estable |
| M2 | Throttle de polling de Orders usa `Map` in-memory a nivel módulo (`lastMpOrderPollAt`) — en serverless cada instancia tiene el suyo: throttle inefectivo entre lambdas y el Map crece sin poda. **[V]** | P3 | Llamadas extra a MP (rate limit lejano); leak de memoria menor | S | Poda por tamaño/TTL; aceptar imprecisión multi-instancia o mover a DB |
| M3 | Snapshot con `producto_id: null` (producto borrado): "Registrar venta" desde la cola lo mapea a `''` para `guardarVenta` → probable rechazo del insert de `items_venta` (columna uuid) con toast genérico. Caso borde real: producto vendido y luego eliminado antes de resolver. **[I]** | P2 | La resolución "registrar venta" falla sin explicación para ese caso | S | Mapear null→null y aceptar nullable en `ItemVentaInput` (la columna ya es SET NULL) |
| M4 | Cola de revisión + auditoría inmutable + 4 clases cubiertas (85 tests). Riesgo residual del webhook roto documentado para V2. Fortaleza. **[V]** | — | — | — | — |
| M5 | "Registrar venta" corre client-side (guardarVenta desde UI) — deuda anotada en backlog por decisión de producto. **[V]** | P3 | Ya documentado | M | V2: endpoint dedicado |

### 1.10 Configuración / Usuarios / Roles / Seguridad

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| U1 | RBAC 3 roles con defensa en profundidad (sidebar + page guards + RLS + RPCs con validación interna). Auditado en su épica (16 call sites). Fortaleza. **[V]** | — | — | — | — |
| U2 | `proxy.ts` solo gatea auth, no rol (gap documentado; page guards + RLS contienen). **[V]** | P3 | Documentado, sin data expuesta | M | V2 si aparecen server components sensibles |
| U3 | Admin puede auto-degradarse vía SQL directo (gap documentado; imposible desde UI). **[V]** | P3 | Solo con acceso a consola | S | Trigger de protección (V2) |
| U4 | Invitaciones dependen del SMTP default de Supabase (~3 emails/hora en free tier, deliverability pobre). **[V]** (documentado en invite-flow-spec) | **P1** (operativo pre-clientes) | Onboarding de equipo roto en la práctica: el 2º invite de la hora no llega | S (config) | SMTP propio (Resend/Postmark) antes de clientes reales |
| U5 | **Trial no se aplica server-side**: `TrialBlocked` es overlay cliente; los endpoints y RLS no verifican `trial_ends_at`. Un comercio vencido puede seguir operando por API o quitando el overlay. **[V]** (solo `/api/registro` toca trial) | P2 | Hoy sin clientes pagos es teórico; al monetizar es evasión del paywall | M | Check de trial en RLS helper o middleware de API cuando se active cobro |
| U6 | Modo demo: locks en configuración/productos/usuarios, pero POS/caja/gastos del comercio demo son editables por visitantes — mitigado si el cron de reset (`migration-demo-cron`) restaura todo. **[V parcial]** | P3 | Datos demo sucios entre resets | S | Confirmar cobertura del cron; agregar locks si falta |

### 1.11 Accesibilidad / UX transversal

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| A1 | `Modal` sin focus-trap completo (Tab escapa del modal) — limitación documentada en el propio componente. ESC y restore de focus sí funcionan. **[V]** | P2 | Teclado/lectores de pantalla pueden perderse | M | Focus trap en la primitiva (beneficia a los ~15 call sites) |
| A2 | Badges y estados comunican solo por color en varias tablas (roles, motivos MP, stock). Los de rol tienen texto — bien; verificar contraste del amarillo `--w` sobre fondos claros. **[I]** | P2 | Daltonismo / contraste AA | S-M | Iconos + verificar ratios |
| A3 | 28 archivos usan `aria-*` — hay conciencia; falta pasada sistemática (labels de inputs sin `<label for>`, tablas sin caption/scope). **[I]** | P2 | Accesibilidad parcial | M | Pasada dedicada con axe |
| A4 | Tablas en mobile: scroll horizontal (patrón `table-scroll`) en ventas/caja/usuarios/revisión MP — utilizable pero áspero; card-collapse ya en backlog. **[V]** | P3 | UX mobile mediocre en tablas | L | Backlog `<DataTable>` |
| A5 | Estados loading/vacío/error: consistentemente cubiertos con Spinner/EmptyState/Skeleton en los módulos revisados (dashboard, reportes, caja, usuarios, MP). Fortaleza. **[V]** | — | — | — | — |

### 1.12 Exportar

| # | Hallazgo | Prioridad | Riesgo / Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| E1 | **`getVentas()` se llama 3 veces sin límite ni rango**: descarga TODAS las ventas con TODOS los items al browser para armar el XLSX/CSV. Con un año de operación (~15-20k ventas) es congelamiento de pestaña y payload de decenas de MB. Incumple el requisito declarado de "límite de filas razonable para V1". **[V]** `app/exportar/page.tsx:88,200,236` | **P1** | Browser freeze / export imposible con datos reales de meses | S-M | Selector de rango obligatorio (mes por defecto) + `opts.desde/limit` que ya existen en `getVentas` |
| E2 | Nombres de archivo con `toLocaleDateString` — cosmético, no define día de negocio. **[V]** | — | — | — | — |

---

## 2. Lista priorizada de bugs

**P0 — ninguno encontrado.** No hay pérdida silenciosa de dinero ni de datos activa: las épocas de integridad (stock-lotes, día operativo, requiere_revision) cerraron los agujeros de esa clase. Los hallazgos de dinero restantes son visibles u operativos.

**P1 — corregir antes de clientes reales (6):**

1. **V1 — Anular venta MP sin aviso/registro de devolución** (dinero descuadrado, espejo de la épica de revisión). M
2. **G1 — Fecha UTC en gastos** (dato financiero en el día equivocado desde las 21:00 AR). S
3. **E1 — Exportar sin límites** (inusable con datos reales). S-M
4. **L1 — Sin "olvidé mi contraseña"** (usuarios bloqueados; el copy de invitaciones lo promete). M
5. **U4 — SMTP default de Supabase para invitaciones** (límite ~3/h). S, es configuración
6. **M1 — Checklist de limpieza MP pre-prod** (bypass de firma + manual_sandbox fuera de prod; DROP de la RPC legacy R2 va en el mismo paquete operativo). S

**P2 — primeras semanas con clientes (10):** P1a (marca de cobro MP manual), U5 (trial server-side, al monetizar), V2 (paginación ventas), G2 (gastos día operativo), R3 (dashboard a RPC), M3 (snapshot con producto borrado), A1 (focus trap), A2/A3 (pasada a11y), S4 (límites de import), L2 (rate limit registro), LA2 (landing MP).

**P3 — backlog (9):** C2 (tipado caja), C3 (fondo de caja), S2 (editar lote), S3 (badge vencimientos), M2 (Map polling), M5 (endpoint registrar-venta), U2/U3 (gaps documentados), A4 (DataTable mobile), P1d (dvh), U6 (locks demo), L3 (verificación email).

## 3. Roadmap recomendado

**Sprint QA-1 — "Listo para clientes" (~1 semana):** los 6 P1 en este orden: G1 (trivial y corrige datos financieros) → E1 → L1 → V1 → U4 + M1/R2 (operativos, mismo día). Cada fix con smoke.

**Sprint QA-2 — "Primeras semanas" (~1-2 semanas):** P1a + M3 + V2 + G2 + S4 (los de datos/negocio), luego A1-A3 (accesibilidad) y L2.

**Continuo:** P3 se drena en PRs de limpieza oportunistas; U5 se agenda junto con la épica de monetización (es su prerequisito, no un bug de hoy).

## 4. Qué corregir antes de ofrecer Sylvora a clientes reales

Los 6 P1 + dos verificaciones operativas: (a) confirmar que el cron de reset del comercio demo cubre POS/caja/gastos (U6), (b) correr el checklist de QA manual de la cola MP en el entorno real con OAuth (pendiente desde la épica). Con eso, el producto queda sin caminos conocidos de pérdida de dinero/datos, con recuperación de cuenta, exportación usable y onboarding de equipo funcional.

## 5. Qué puede esperar a V2

Todo P2 no-financiero y P3: trial server-side (con monetización), fondo de caja inicial, edición de lotes, badge de vencimientos, DataTable mobile, focus trap + pasada axe completa, endpoint registrar-venta dedicado, re-check activo MP, refund por API, notificaciones, módulo Clientes y UI de Categorías (features nuevos, no deuda), onboarding wizard.

## 6. Fortalezas verificadas (para no romperlas)

Integridad stock↔lotes en 3 capas · RPC atómica de venta multi-cajero ·
día operativo con fuente única y test de consistencia entre módulos ·
cola de revisión MP con auditoría inmutable (85 tests) · RBAC con
defensa en profundidad · estados loading/vacío/error consistentes ·
tokens MP cifrados AES-256-GCM server-only.
