-- =====================================================
-- Vista opcional: productos_stock_bajo
-- =====================================================
-- Optimización para cuando el catálogo crezca: en vez de traer todos
-- los productos activos al cliente y filtrar `stock_actual <= stock_minimo`
-- en JS, esta vista hace el filtro en el server (PostgreSQL).
--
-- Estado actual: la app sigue usando getStockCritico() que hace SELECT *
-- y filtra en cliente. Con < 1000 productos esto está bien. Cuando
-- escale, los consumers pueden migrar a:
--   await supabase.from('productos_stock_bajo').select('*')
--
-- IMPORTANTE: ejecutar este archivo en el SQL editor de Supabase si
-- decidís migrar. La vista respeta RLS porque consulta `productos`.
-- =====================================================

CREATE OR REPLACE VIEW productos_stock_bajo AS
SELECT *
FROM productos
WHERE activo = true
  AND stock_actual <= stock_minimo
ORDER BY stock_actual ASC;

-- Permitir lectura desde el cliente autenticado.
GRANT SELECT ON productos_stock_bajo TO authenticated;
