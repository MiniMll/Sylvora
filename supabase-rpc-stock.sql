-- =====================================================
-- RPC: descontar_stock
-- =====================================================
-- Descuenta stock de un producto de forma atómica.
-- Usa un UPDATE en una sola query, evitando race conditions
-- entre cajeros simultáneos.
--
-- IMPORTANTE: ejecutar este archivo en el SQL editor de
-- Supabase una sola vez después del despliegue inicial.
-- =====================================================

CREATE OR REPLACE FUNCTION descontar_stock(
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
  SET stock_actual = GREATEST(0, stock_actual - p_cantidad)
  WHERE id = p_producto_id
  RETURNING stock_actual INTO nuevo_stock;

  RETURN nuevo_stock;
END;
$$;

-- Permitir invocarla desde el cliente autenticado
GRANT EXECUTE ON FUNCTION descontar_stock(UUID, NUMERIC) TO authenticated;
