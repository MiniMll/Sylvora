-- =====================================================
-- RPC: restituir_stock
-- =====================================================
-- Inverso atómico de descontar_stock. Se usa al anular ventas.
-- Suma la cantidad al stock_actual del producto en una sola query.
--
-- IMPORTANTE: ejecutar este archivo en el SQL editor de Supabase
-- una vez. La anulación de ventas no devuelve stock correctamente
-- hasta que esté creada.
-- =====================================================

CREATE OR REPLACE FUNCTION restituir_stock(
  p_producto_id UUID,
  p_cantidad NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  nuevo_stock NUMERIC;
BEGIN
  UPDATE productos
  SET stock_actual = stock_actual + p_cantidad
  WHERE id = p_producto_id
  RETURNING stock_actual INTO nuevo_stock;

  RETURN nuevo_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION restituir_stock(UUID, NUMERIC) TO authenticated;
