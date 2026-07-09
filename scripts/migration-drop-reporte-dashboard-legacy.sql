-- ═══════════════════════════════════════════════════════════════════
-- CLEANUP: DROP de la RPC legacy get_reporte_dashboard(text, text)
-- ═══════════════════════════════════════════════════════════════════
--
-- Hallazgo R2 (Sprint QA-1, docs/qa-auditoria-integral-2026-07.md §1.8):
-- la firma V2 legacy get_reporte_dashboard(text, text) sigue viva en
-- Supabase. El cliente actual (lib/supabase/reportes.ts) llama SOLO la
-- firma V3 de 6 parámetros:
--   get_reporte_dashboard(text, timestamptz, timestamptz, jsonb, date, date)
-- La V2 es superficie muerta llamable — la eliminamos.
--
-- SEGURIDAD DE LA OPERACIÓN:
--   - Postgres identifica funciones por firma → este DROP toca SOLO la
--     firma (text, text). La V3 (6 args) queda intacta.
--   - IF EXISTS → idempotente y seguro si ya se corrió o nunca existió.
--   - Correr DESPUÉS de confirmar que el deploy con la V3 está en
--     producción (ya lo está: reportes.ts llama la V3 desde el sprint
--     de día operativo).
--
-- Rollback: si hiciera falta, la definición V2 está en
-- scripts/migration-reportes-rpc.sql (re-aplicable). No debería
-- necesitarse — ningún cliente llama la firma vieja.

BEGIN;

DROP FUNCTION IF EXISTS get_reporte_dashboard(text, text);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-DROP
-- ═══════════════════════════════════════════════════════════════════
--
-- Debe quedar UNA sola fila (la V3 de 6 args):
--
--   SELECT proname, pg_get_function_arguments(oid)
--   FROM pg_proc
--   WHERE proname = 'get_reporte_dashboard';
--
--   → 1 fila:
--     'p_rango_tipo text, p_desde timestamp with time zone,
--      p_hasta timestamp with time zone, p_dias jsonb,
--      p_gastos_desde date, p_gastos_hasta date'
--
-- Y /reportes debe seguir cargando KPIs / ventas por día / top / stock
-- sin cambios (el cliente ya usa la V3).
