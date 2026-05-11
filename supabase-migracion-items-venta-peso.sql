-- =====================================================
-- Migración: items_venta.peso_kg
-- =====================================================
-- Hasta ahora items_venta sólo guardaba `cantidad`. Para productos
-- por peso (kg/litro/metro) la cantidad siempre era 1, y el peso
-- real (ej. 0.5 kg) vivía sólo en el cart de Zustand — no se
-- persistía. Esto generaba un problema al anular ventas: para un
-- fiambre de 0.5 kg se restituía cantidad=1 (1 kg de más).
--
-- Esta migración agrega la columna nullable. El código está
-- preparado con fallback:
--   - Sin migración corrida: nuevas ventas se insertan sin peso_kg
--     (el insert detecta error y reintenta sin esa columna).
--     Anulaciones restituyen por `cantidad` (sub-óptimo para kg).
--   - Con migración corrida: nuevas ventas persisten peso_kg.
--     Anulaciones de ventas POST-migración son 100% exactas.
--     Anulaciones de ventas PRE-migración siguen el fallback legacy.
--
-- IMPORTANTE: idempotente (IF NOT EXISTS). Se puede correr sin riesgo.
-- =====================================================

ALTER TABLE items_venta
  ADD COLUMN IF NOT EXISTS peso_kg NUMERIC;
