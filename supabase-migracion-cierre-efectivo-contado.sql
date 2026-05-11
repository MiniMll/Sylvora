-- =====================================================
-- Migración: cierres_caja con efectivo_contado y diferencia
-- =====================================================
-- Agrega 2 columnas para cerrar el ciclo de conteo físico de caja:
--
--   - efectivo_contado: lo que el cajero contó físicamente en la
--     caja registradora al cerrar el turno.
--   - diferencia_efectivo: contado - esperado. Esperado se calcula
--     en el cliente como (ventas_efectivo - egresos_efectivo).
--     Positivo = sobrante, negativo = faltante, 0 = caja cuadra.
--
-- Persistir la diferencia (en vez de recalcularla) preserva el
-- valor histórico aunque cambien ventas o egresos posteriormente.
--
-- Backward-compat: el código tiene fallback que omite ambas columnas
-- si todavía no existen, así que el deploy puede ir antes que la
-- migración sin romper.
--
-- IMPORTANTE: idempotente. Se puede correr sin riesgo.
-- =====================================================

ALTER TABLE cierres_caja
  ADD COLUMN IF NOT EXISTS efectivo_contado NUMERIC,
  ADD COLUMN IF NOT EXISTS diferencia_efectivo NUMERIC;
