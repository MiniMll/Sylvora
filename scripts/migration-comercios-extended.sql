-- ═══════════════════════════════════════════════════════════════════
-- Migración: extender tabla `comercios` con campos de onboarding.
-- ═══════════════════════════════════════════════════════════════════
--
-- Problema que resuelve:
-- El bootstrap inicial (landing-staging-bootstrap.sql) creó `comercios`
-- minimal — solo (id, nombre, created_at) — porque el seed del Kiosco
-- El Faro no necesitaba más. Pero el flujo de registro real envía
-- también { tipo, telefono, email, plan } al crear el comercio, y
-- esos campos no existían → insert fallaba.
--
-- Esta migración agrega las columnas. Idempotente: se puede correr
-- múltiples veces sin romper nada (IF NOT EXISTS en cada ADD).
--
-- Aplicar al staging actual UNA VEZ:
--   psql $DATABASE_URL -f scripts/migration-comercios-extended.sql
--
-- Para deploys nuevos: NO hace falta — el bootstrap ya quedó actualizado
-- en paralelo, así que una DB fresca queda directo con el schema final.
--
-- Por qué default 'trial': la landing promete 30 días gratis. Cuando
-- arranque la facturación, el sistema transiciona de 'trial' → 'pro'
-- (o 'expired' si no paga). Setear 'pro' por default sería mentirle al
-- propio sistema.

BEGIN;

ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS tipo      TEXT,
  ADD COLUMN IF NOT EXISTS telefono  TEXT,
  ADD COLUMN IF NOT EXISTS email     TEXT,
  ADD COLUMN IF NOT EXISTS plan      TEXT NOT NULL DEFAULT 'trial';

COMMIT;
