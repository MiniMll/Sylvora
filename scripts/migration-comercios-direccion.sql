-- ═══════════════════════════════════════════════════════════════════
-- Migración: agregar columna `direccion` a comercios
-- ═══════════════════════════════════════════════════════════════════
--
-- Problema que resuelve:
-- - app/perfil/page.tsx ya hace lectura y escritura de `direccion` en
--   comercios (form.direccion → UPDATE), pero la columna nunca existió
--   en los schemas SQL del repo. Resultado: input vacío al cargar +
--   UPDATE silenciosamente ignorado por Supabase.
-- - La feature de "ticket con datos del comercio" (B del backlog
--   post-QA) necesita dirección para el header del ticket impreso.
--
-- Aplicar UNA VEZ:
--   psql $DATABASE_URL -f scripts/migration-comercios-direccion.sql
--
-- El bootstrap SQL ya quedó actualizado en paralelo, así que una DB
-- fresca no necesita esta migración.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS.

BEGIN;

ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS direccion TEXT;

COMMIT;
