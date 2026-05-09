-- =====================================================
-- Migración: agregar columna `credito` a cierres_caja
-- =====================================================
-- Hasta esta migración, los cierres de caja solo desglosaban
-- efectivo / transferencia / debito / mercadopago. Ahora se agrega
-- un nuevo método "Crédito" en el POS y se necesita su columna en
-- el resumen del cierre.
--
-- IMPORTANTE: ejecutar este archivo en el SQL editor de Supabase
-- una sola vez. El código de la app tiene un fallback que ignora
-- esta columna si todavía no existe, así que el deploy puede
-- adelantarse a la migración sin romper la funcionalidad.
-- =====================================================

ALTER TABLE cierres_caja
  ADD COLUMN IF NOT EXISTS credito NUMERIC DEFAULT 0;
