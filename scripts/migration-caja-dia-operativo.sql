-- ═══════════════════════════════════════════════════════════════════
-- Migración: settings JSONB en comercios — día operativo configurable
-- ═══════════════════════════════════════════════════════════════════
--
-- Agrega la columna comercios.settings para configuración operativa
-- por comercio. V1 la usa el "día operativo de caja":
--
--   settings: {
--     caja_24hs?: boolean            -- default efectivo: true
--     hora_apertura_caja?: string    -- "HH:MM", solo si caja_24hs=false
--     hora_cierre_caja?: string      -- "HH:MM", solo si caja_24hs=false
--   }
--
-- Semántica (implementada en lib/operacion/diaOperativo.ts — la DB
-- NO interpreta el JSON, solo lo guarda):
--
--   caja_24hs=true  → día operativo = día calendario en TZ Argentina.
--                     COMPORTAMIENTO ACTUAL. Default para todos los
--                     comercios existentes y nuevos.
--   caja_24hs=false → día operativo = [hora_apertura, hora_cierre).
--                     Si cierre <= apertura, cruza medianoche: una
--                     venta a la 01:30 pertenece al día operativo
--                     que abrió a las 18:00 del día anterior.
--
-- Compatibilidad:
--   - DEFAULT '{}': comercios existentes quedan con settings vacío.
--   - normalizarConfigDiaOperativo({}) → caja_24hs=true → cero cambio
--     de comportamiento hasta que un comercio configure lo contrario.
--   - NOT NULL con default: el código nunca ve NULL (pero el type TS
--     acepta null defensivamente para rows pre-migración cacheados).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS. Re-runnable.
--
-- Aplicar:
--   Pegar en Supabase SQL Editor → Run.

BEGIN;

ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN comercios.settings IS
  'Configuración operativa del comercio. V1: caja_24hs, hora_apertura_caja, hora_cierre_caja (día operativo). La app interpreta el JSON via lib/operacion/diaOperativo.ts — la DB no lo valida.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- SMOKE TESTS — correr después del COMMIT
-- ═══════════════════════════════════════════════════════════════════

-- 1. Columna existe con default correcto.
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'comercios' AND column_name = 'settings';
-- ✓ Esperado: jsonb, default '{}'::jsonb, is_nullable=NO.

-- 2. Comercios existentes tienen settings = {}.
-- SELECT id, nombre, settings FROM comercios LIMIT 5;
-- ✓ Esperado: settings = {} en todos.

-- 3. UPDATE de prueba con horario nocturno (revertir después).
-- UPDATE comercios
-- SET settings = '{"caja_24hs": false, "hora_apertura_caja": "18:00", "hora_cierre_caja": "02:00"}'::jsonb
-- WHERE id = '<COMERCIO_TEST_ID>'
-- RETURNING id, settings;
--
-- Revert:
-- UPDATE comercios SET settings = '{}'::jsonb WHERE id = '<COMERCIO_TEST_ID>';
