# Spec — Rework del flujo de Cierre de Caja

Estado: **aprobada, pendiente de implementar.**

## Contexto / problema

El cierre de caja hoy funciona como un "sacar foto": se puede apretar el
botón cuando sea, las veces que sea. Resultado: múltiples cierres el mismo
día, una lista de historial que crece sin control, y la acción pierde el
significado de "cierre de jornada".

## Modelo conceptual

**Cerrar caja = cerrar la jornada.** Es un evento de fin de día: contar el
efectivo, conciliar contra lo esperado, registrar el saldo final y
opcionalmente el retiro. Por naturaleza es **1 por día**.

**El estado de caja se deriva, no se almacena:**

```
estadoCaja(hoy) = ¿existe un cierre con fecha === hoy?
                  → sí: "cerrada"
                  → no: "abierta"
```

La caja está implícitamente **abierta** todos los días. No hay acto de
"abrir caja". Cerrar es el único acto explícito. No se agrega columna de
estado ni máquina de estados.

Cambio de mentalidad central: **el cierre de hoy no es historial, es el
estado actual del día.** Va en el header, no en la lista.

## Decisiones tomadas

| # | Decisión | Resuelto |
|---|---|---|
| A | **Reabrir caja borra el cierre** del día y vuelve el estado a "abierta". Sin estados "anulado", sin múltiples cierres activos. Con confirmación. | Opción 1 |
| B | **Egresos solo con caja abierta.** Si está cerrada, el día quedó consolidado. Para mover algo, se reabre. | No permitir con caja cerrada |
| C | **Fondo inicial = 0 en V1.** Apertura de caja con monto queda como futuro. | Asumir 0 |
| D | **`retiro_efectivo` solo informativo.** Se registra y se muestra ("efectivo contado", "retiro", "queda en caja") pero no se arrastra como fondo del día siguiente. | Informativo |
| E | **Dedupe automático** de los cierres de testing: quedarse con el `created_at` más reciente por `(comercio_id, fecha)`, borrar el resto. | Automático |

## Cambios de schema

`cierres_caja` ya tiene: `fecha` (DATE), totales, métodos, `efectivo_contado`,
`diferencia_efectivo`, `created_at` (TIMESTAMPTZ — ya existe, solo falta
mostrar la hora).

Migration SQL (se corre manualmente en Supabase, como el fix del 403):

```sql
-- 1. Columnas nuevas
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS usuario_id UUID;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS retiro_efectivo NUMERIC;

-- 2. Dedupe — quedarse con el cierre más reciente por comercio+fecha
DELETE FROM cierres_caja a
USING cierres_caja b
WHERE a.comercio_id = b.comercio_id
  AND a.fecha = b.fecha
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.id < b.id));

-- 3. Constraint 1-cierre-por-día (después del dedupe)
ALTER TABLE cierres_caja
  ADD CONSTRAINT cierres_caja_comercio_fecha_unique UNIQUE (comercio_id, fecha);
```

`types/database.ts` → agregar a `CierreCaja`:
- `usuario_id?: string | null`
- `retiro_efectivo?: number | null`

## Flujo

### Caja abierta
- Header: bloque de estado "● Caja abierta" + fecha + saldo esperado en efectivo.
- Botón "Cerrar caja" visible.
- Egresos permitidos.

### Modal de cierre (extiende el actual)
- Campo nuevo opcional: **"Retiro de efectivo"**.
- Derivado mostrado: **"Queda en caja" = efectivo contado − retiro**.
- Al confirmar: persiste `usuario_id = auth.uid()` y `retiro_efectivo`.

### Caja cerrada
- Header cambia a: "✓ Caja cerrada · hoy 20:45 · por [Responsable]" + saldo
  final + diferencia.
- Botón "Cerrar caja" **desaparece** (no se deshabilita — desaparece).
- Aparece "Reabrir caja" en versión sutil/secundaria.
- Egresos **no permitidos** (botón oculto o deshabilitado con tooltip).

### Reabrir caja
- Acción secundaria, con modal de confirmación.
- Borra el row del cierre de hoy → estado vuelve a "abierta".
- El `UNIQUE(comercio_id, fecha)` queda limpio para volver a cerrar.

## Cambios de UI

### Header → bloque de estado
Reemplaza los dos botones sueltos actuales por un bloque de estado que es
la fuente de verdad visual: estado + contexto + acción primaria. Es el
cambio que más mueve la aguja en "se siente como cierre real".

### Historial
- **El cierre de hoy NO va en la lista** — va en el header.
- La lista = solo cierres **anteriores** (`fecha < hoy`), limitada
  visualmente: últimos ~7-10 + "ver más", o agrupados por mes.
- Esto solo ya elimina la sensación de "lista gigante".

### Responsable
- Se guarda `usuario_id` en el cierre.
- Para mostrar el nombre: `getCierresCaja` hace join `perfiles(nombre)`.
- En V1 (single-user por comercio, sin roles) es siempre el mismo, pero
  queda future-proof para cuando lleguen roles.

## Plan de implementación

1. **Migration + types**: correr el SQL en Supabase, actualizar
   `types/database.ts`. (Manual + 1 commit de types.)
2. **Data layer** (`lib/supabase/caja.ts`):
   - `cerrarCaja`: agregar `usuario_id` + `retiro_efectivo` al payload.
     Manejar violación de `UNIQUE` (code 23505) → señal específica para
     que la UI diga "ya cerraste caja hoy". Sumar los campos nuevos al
     retry de columnas faltantes (consistencia con el patrón actual).
   - `reabrirCaja(cierreId)`: borra el row.
   - `getCierreHoy(): Promise<CierreCaja | null>` o derivar en la page.
   - `getCierresCaja`: join `perfiles(nombre)`, y filtrar/dejar que la
     page separe hoy vs anteriores.
3. **UI** (`app/caja/page.tsx`):
   - Estado derivado `estadoCaja` + `cierreHoy`.
   - Header como bloque de estado.
   - Gating de egresos por estado.
   - Modal de cierre con retiro + "queda en caja".
   - Historial solo cierres anteriores, limitado.
   - Acción "Reabrir caja" + confirmación.

Estimado: 2-3 commits después de la migration.

## Fuera de scope V1 (futuro)

- **Apertura de caja con fondo inicial** — hoy se asume 0.
- **Arrastre de saldo**: que el "queda en caja" sea el fondo del día
  siguiente.
- **Aviso "recordá cerrar caja"** cerca de una hora configurable.
- **Días olvidados**: detectar y avisar días con caja abierta sin cerrar.
- **Multi-usuario / roles**: cuando lleguen, el `usuario_id` ya estará
  poblado para distinguir responsables.
