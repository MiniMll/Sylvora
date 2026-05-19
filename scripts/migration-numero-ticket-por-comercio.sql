-- ═══════════════════════════════════════════════════════════════════
-- Migración: numero_ticket per-comercio (no global)
-- ═══════════════════════════════════════════════════════════════════
--
-- Problema que resuelve:
-- - Schema legacy (supabase-schema.sql) define `numero_ticket SERIAL`,
--   que es una SEQUENCE GLOBAL de Postgres compartida entre TODOS los
--   comercios. Resultado: un comercio nuevo arranca con #58 si ya
--   había 57 ventas en otros comercios (ej. el seed Kiosco El Faro).
-- - Schema nuevo (landing-staging-bootstrap.sql) usa `INTEGER` sin
--   default ni trigger, así que numero_ticket queda NULL.
--
-- Ninguno es lo correcto. Queremos numeración INDEPENDIENTE por
-- comercio, arrancando en #1 para cada uno.
--
-- Esta migración:
--   1. Drop del default + sequence legacy (si existen).
--   2. Backfill: renumera las ventas existentes 1..N por comercio,
--      ordenadas por created_at (las primeras quedan #1, #2, etc.).
--   3. Unique constraint (comercio_id, numero_ticket) → defensa
--      contra race condition entre 2 cajeros del mismo comercio.
--   4. Trigger BEFORE INSERT que asigna MAX(numero_ticket)+1 dentro
--      del mismo comercio_id si el cliente no lo envía.
--
-- Race condition: dos cajeros cobrando simultáneamente en el mismo
-- comercio podrían leer el mismo MAX y querer insertar el mismo
-- número. La unique constraint hace fallar el segundo INSERT con
-- code 23505, y el cliente (lib/supabase/ventas.ts) hace retry.
-- Suficiente para 2-3 cajas concurrentes; multi-sucursal con docenas
-- de cajas requeriría advisory locks, no estamos ahí todavía.
--
-- Aplicar al staging actual UNA VEZ:
--   psql $DATABASE_URL -f scripts/migration-numero-ticket-por-comercio.sql
--
-- IDEMPOTENTE: se puede correr 2 veces sin romper. El backfill solo
-- corre la primera vez (después MAX(numero_ticket) ya es > 0 y el
-- ROW_NUMBER coincide con lo que ya está en la DB).
--
-- ⚠️  ADVERTENCIA: el backfill RENUMERA ventas existentes. Si tenés
-- PDFs/tickets impresos con números viejos en circulación, NO van a
-- coincidir más con la DB. En staging es aceptable.

BEGIN;

-- ───── 1. Drop default + sequence legacy ──────────────────────────
-- Si la columna fue creada como SERIAL, tiene un default `nextval(...)`
-- y una sequence asociada. Las drop-eamos para que el trigger del
-- paso 4 sea la única fuente de verdad.
-- Si la columna era INTEGER pelado, ambos DROP son no-op.
ALTER TABLE ventas ALTER COLUMN numero_ticket DROP DEFAULT;
DROP SEQUENCE IF EXISTS ventas_numero_ticket_seq;

-- ───── 2. Backfill — renumerar por comercio ───────────────────────
-- ROW_NUMBER() particionado por comercio, ordenado por created_at
-- (con id como desempate determinístico cuando dos ventas tienen el
-- mismo timestamp al microsegundo).
WITH renumeradas AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY comercio_id
      ORDER BY created_at, id
    ) AS nuevo_numero
  FROM ventas
)
UPDATE ventas v
SET numero_ticket = r.nuevo_numero
FROM renumeradas r
WHERE v.id = r.id;

-- ───── 3. Unique constraint (comercio_id, numero_ticket) ──────────
-- DROP-and-recreate para ser idempotente. Sin esta constraint, dos
-- cajeros del mismo comercio podrían terminar con el mismo número
-- en un escenario de race muy improbable pero posible.
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_comercio_numero_ticket_unique;
ALTER TABLE ventas
  ADD CONSTRAINT ventas_comercio_numero_ticket_unique
  UNIQUE (comercio_id, numero_ticket);

-- ───── 4. Trigger function + trigger ──────────────────────────────
-- BEFORE INSERT: si el cliente no envía numero_ticket (caso normal),
-- asigna MAX+1 dentro del mismo comercio. Si el cliente envía valor
-- (caso de re-insert manual o seed), lo respeta.
CREATE OR REPLACE FUNCTION asignar_numero_ticket()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_ticket IS NULL THEN
    SELECT COALESCE(MAX(numero_ticket), 0) + 1
      INTO NEW.numero_ticket
      FROM ventas
      WHERE comercio_id = NEW.comercio_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ventas_set_numero_ticket ON ventas;
CREATE TRIGGER ventas_set_numero_ticket
  BEFORE INSERT ON ventas
  FOR EACH ROW
  EXECUTE FUNCTION asignar_numero_ticket();

COMMIT;

-- ───── Verificación post-migración ────────────────────────────────
-- Ejecutar después del COMMIT para confirmar que cada comercio empieza
-- en #1 y los números son contiguos. Si algún comercio tiene huecos
-- (ej. 1, 2, 4) es porque hay ventas anuladas con borrado físico —
-- no debería pasar porque anular cambia estado, no borra.
--
-- SELECT comercio_id, MIN(numero_ticket), MAX(numero_ticket), COUNT(*)
-- FROM ventas
-- GROUP BY comercio_id
-- ORDER BY comercio_id;
