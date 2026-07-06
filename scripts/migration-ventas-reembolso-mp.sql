-- ═══════════════════════════════════════════════════════════════════
-- Migración: reembolso_mp_pendiente en ventas — Sprint QA-1, L1
-- ═══════════════════════════════════════════════════════════════════
--
-- Hallazgo V1 de la auditoría QA (docs/qa-auditoria-integral-2026-07.md):
-- anular una venta cobrada por Mercado Pago restituye stock y marca
-- 'anulada', pero el dinero MP sigue cobrado y NADA lo registra ni lo
-- recuerda. Es el espejo inverso del problema que resolvió la épica
-- requiere_revision.
--
-- Fix: flag booleano en ventas.
--   - Al anular una venta con metodo_pago='mercadopago', la app setea
--     reembolso_mp_pendiente=true en el MISMO UPDATE de anulación
--     (atómico — no puede quedar anulada sin flag).
--   - La UI muestra "Reembolso MP pendiente" en el detalle y permite
--     marcarlo como hecho cuando el comerciante ejecutó la devolución
--     desde el panel de MP (Sylvora no devuelve dinero — V1).
--
-- Por qué columna y no tabla: es UN bit de estado operativo del ciclo
-- de vida de la venta, consultable ("¿qué reembolsos debo?") con un
-- partial index. Una tabla de conciliación completa queda para V2.
--
-- IDEMPOTENTE: re-runnable.
--
-- Aplicar: pegar en Supabase SQL Editor → Run. Smoke al final.

BEGIN;

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS reembolso_mp_pendiente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ventas.reembolso_mp_pendiente IS
  'true = la venta se anuló habiendo sido cobrada por Mercado Pago y el comerciante todavía no confirmó la devolución manual desde el panel MP. Se apaga con marcarReembolsoMPHecho (lib/supabase/ventas.ts).';

-- Listado operativo "reembolsos que debo" — chico por diseño.
CREATE INDEX IF NOT EXISTS ventas_reembolso_mp_pendiente_idx
  ON ventas (comercio_id, created_at DESC)
  WHERE reembolso_mp_pendiente = true;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- SMOKE TESTS — correr después del COMMIT
-- ═══════════════════════════════════════════════════════════════════

-- 1. Columna con default correcto.
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'ventas' AND column_name = 'reembolso_mp_pendiente';
-- ✓ Esperado: boolean, default false, NO nullable.

-- 2. Ventas existentes quedaron en false.
-- SELECT count(*) FROM ventas WHERE reembolso_mp_pendiente = true;
-- ✓ Esperado: 0.

-- 3. Partial index creado.
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'ventas' AND indexname = 'ventas_reembolso_mp_pendiente_idx';
-- ✓ Esperado: 1 fila.
