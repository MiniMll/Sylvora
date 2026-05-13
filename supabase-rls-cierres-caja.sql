-- =====================================================
-- Migración: RLS policy para cierres_caja
-- =====================================================
-- supabase-schema.sql crea la tabla cierres_caja (vía migraciones
-- separadas que agregaron columnas) pero nunca se definió su
-- policy de Row Level Security. Resultado: cualquier INSERT del
-- cliente da 403 Forbidden porque RLS está habilitado por default
-- en supabase y bloquea todo sin policy explícita.
--
-- Esta migración:
--   1. Garantiza que RLS esté habilitada en la tabla.
--   2. Crea la policy "comercio_owner" que solo permite acceso a
--      filas del mismo comercio_id del usuario logueado.
--
-- Mismo patrón que las otras tablas del SaaS (productos, ventas,
-- movimientos_caja, etc.) — usa la función get_comercio_id() ya
-- definida en supabase-schema.sql.
--
-- IDEMPOTENTE: usa IF NOT EXISTS / DROP IF EXISTS antes de crear,
-- safe para correr múltiples veces.
-- =====================================================

ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cierres_caja_comercio" ON cierres_caja;

CREATE POLICY "cierres_caja_comercio" ON cierres_caja
  FOR ALL USING (comercio_id = get_comercio_id());
