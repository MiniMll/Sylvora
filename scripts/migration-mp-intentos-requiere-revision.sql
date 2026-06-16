-- ═══════════════════════════════════════════════════════════════════
-- Migración: estado 'requiere_revision' en intentos_cobro_mp
-- ═══════════════════════════════════════════════════════════════════
--
-- Agrega un sexto estado al lifecycle del intento de cobro:
--
--   pendiente → aprobado     → (crear_venta OK)
--                            → requiere_revision  ← NUEVO
--             → rechazado
--             → cancelado
--             → expirado
--
-- requiere_revision:
--   MP confirmó el cobro al cliente (estado='aprobado'), pero la
--   creación de la venta en Sylvora falló por algún motivo (stock
--   insuficiente porque otro cajero vendió en paralelo, RPC error,
--   etc.). El dinero está EN la cuenta MP del comerciante, pero la
--   venta no quedó registrada en la app.
--
-- Razón de ser:
--   No queremos que el comerciante tenga que "recordar" estos casos.
--   El estado los hace visibles para resolución manual (refund desde
--   dashboard MP + anulación del intento, o ajuste manual de stock
--   + persistencia de venta retroactiva — V1.5 conciliación).
--
-- Es estado TERMINAL en V1: no se transiciona automáticamente desde
-- requiere_revision. El admin lo resuelve fuera de la app.
--
-- IDEMPOTENTE: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT. Si ya
-- corrió, la segunda corrida no falla.
--
-- Aplicar:
--   Pegar en Supabase SQL Editor → Run.
--   Smoke test al final (descomentado).

BEGIN;

-- Postgres asigna el nombre auto cuando el CHECK es inline en CREATE
-- TABLE. Es <table>_<column>_check por convención del schema original
-- (migration-mp-cobros-v1.sql lo creó así).

ALTER TABLE intentos_cobro_mp
  DROP CONSTRAINT IF EXISTS intentos_cobro_mp_estado_check;

ALTER TABLE intentos_cobro_mp
  ADD CONSTRAINT intentos_cobro_mp_estado_check
  CHECK (estado IN (
    'pendiente',
    'aprobado',
    'rechazado',
    'cancelado',
    'expirado',
    'requiere_revision'
  ));

COMMENT ON CONSTRAINT intentos_cobro_mp_estado_check ON intentos_cobro_mp IS
  'Estados del lifecycle. requiere_revision: MP aprobó pero crear_venta falló — resolución manual.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- SMOKE TESTS — descomentar tras el COMMIT para verificar
-- ═══════════════════════════════════════════════════════════════════

-- 1. CHECK constraint acepta los 6 estados.
-- SELECT con.conname, pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- WHERE con.conrelid = 'intentos_cobro_mp'::regclass
--   AND con.conname = 'intentos_cobro_mp_estado_check';
-- ✓ Esperado: CHECK con los 6 valores (incluido 'requiere_revision').

-- 2. INSERT con estado='requiere_revision' es aceptado.
--    Reemplazar UUIDs con valores reales.
-- INSERT INTO intentos_cobro_mp (
--   comercio_id, external_reference, monto, metodo,
--   estado, expira_en, creado_por
-- ) VALUES (
--   '<COMERCIO_ID>',
--   'sy_smoke_revision_' || gen_random_uuid()::text,
--   100.00, 'qr',
--   'requiere_revision',
--   now() + interval '10 minutes',
--   '<PERFIL_ID>'
-- ) RETURNING id, estado;
-- ✓ Esperado: 1 fila insertada.

-- 3. INSERT con estado inválido es rechazado.
-- INSERT INTO intentos_cobro_mp (
--   comercio_id, external_reference, monto, metodo,
--   estado, expira_en, creado_por
-- ) VALUES (
--   '<COMERCIO_ID>',
--   'sy_smoke_invalido',
--   100.00, 'qr',
--   'estado_invalido',
--   now() + interval '10 minutes',
--   '<PERFIL_ID>'
-- );
-- ✓ Esperado: ERROR — "violates check constraint".

-- Cleanup:
-- DELETE FROM intentos_cobro_mp WHERE external_reference LIKE 'sy_smoke_revision_%';
