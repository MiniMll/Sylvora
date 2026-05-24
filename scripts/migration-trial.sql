-- ═══════════════════════════════════════════════════════════════════
-- Migración: trial de 30 días + estados de plan en comercios.
-- ═══════════════════════════════════════════════════════════════════
--
-- Cambios:
-- 1. Nueva columna `trial_ends_at TIMESTAMPTZ`. Default para filas
--    NUEVAS = now() + 30 días. Para filas existentes se backfillea
--    (ver opción C abajo).
-- 2. CHECK constraint sobre `plan` para que solo acepte
--    'trial' | 'active' | 'expired'.
--
-- Cómo se deriva el estado en V1 (sin cron):
--   - plan='trial' && now <= trial_ends_at  → TRIAL activo (uso pleno)
--   - plan='trial' && now >  trial_ends_at  → EXPIRADO (soft-lock)
--   - plan='active'                          → pago manual confirmado
--   - plan='expired'                         → marcado a mano por
--                                              admin si querés cortar
--                                              sin esperar al reloj
--
-- Cuando un tester paga, UPDATE manual: `plan='active'`.
-- No hace falta job ni webhook.
--
-- Backfill (opción C — discutida): GREATEST(created_at + 30d, now() + 7d).
-- - Si el comercio tiene <23 días → mantiene su reloj original (created+30d).
-- - Si tiene ≥23 días → recibe 7 días de gracia desde la migración
--   para no expirar testers de golpe sin aviso.
--
-- Aplicar UNA VEZ por DB:
--   psql $DATABASE_URL -f scripts/migration-trial.sql
-- o desde Supabase Dashboard → SQL Editor.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS +
-- UPDATE filtrado por NULL. Se puede correr múltiples veces sin
-- romper nada ni resetear trial_ends_at de comercios ya backfilleados.

BEGIN;

-- ───── 1. trial_ends_at ─────────────────────────────────────────────
ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Default para INSERT-s futuros. No toca filas existentes.
ALTER TABLE comercios
  ALTER COLUMN trial_ends_at SET DEFAULT now() + interval '30 days';

-- ───── 2. Backfill (solo filas con trial_ends_at NULL) ──────────────
-- Filtrar por NULL garantiza que NO pisamos trial_ends_at de
-- comercios que ya fueron backfilleados en una corrida anterior.
UPDATE comercios
  SET trial_ends_at = GREATEST(
        created_at + interval '30 days',
        now()       + interval '7 days'
      )
  WHERE trial_ends_at IS NULL;

-- ───── 3. CHECK sobre plan ──────────────────────────────────────────
-- Patrón DROP-and-recreate para idempotencia.
ALTER TABLE comercios DROP CONSTRAINT IF EXISTS comercios_plan_check;
ALTER TABLE comercios
  ADD CONSTRAINT comercios_plan_check
  CHECK (plan IN ('trial','active','expired'));

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
-- Listar el estado de cada comercio. La columna `expirado_ahora` es
-- la derivación que va a hacer el frontend (V1, sin cron).
--
-- SELECT
--   id, nombre, plan,
--   trial_ends_at,
--   (plan = 'trial' AND now() > trial_ends_at) AS expirado_ahora,
--   GREATEST(0, EXTRACT(DAY FROM (trial_ends_at - now()))::int) AS dias_restantes
-- FROM comercios
-- ORDER BY trial_ends_at;
