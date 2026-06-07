-- ═══════════════════════════════════════════════════════════════════
-- AUDITORÍA — drift NEGATIVO (stock_actual > SUM(lotes.cantidad))
-- ═══════════════════════════════════════════════════════════════════
--
-- Reporta SIN MODIFICAR datos qué productos tienen el patrón inverso
-- del audit anterior:
--
--   stock_actual = 80
--   SUM(lotes)   = 42
--   drift        = -38 (faltan 38 unidades en los lotes)
--
-- Background:
--   Después del fix v1 (sprint fix/stock-lotes-integrity-v1) corregimos
--   el drift POSITIVO: SUM(lotes) > stock_actual, causado por ventas
--   que no descontaban lotes.
--
--   En producción apareció el patrón INVERSO: stock_actual > SUM(lotes).
--   Esto pasa cuando alguien edita stock_actual a mano desde:
--     - "Editar producto" → form con campo Stock actual
--     - /stock → función ajustarStock()
--   en un producto que ya tenía lotes. La RPC no se invoca, se hace
--   UPDATE directo de productos.stock_actual. Los lotes quedan atrás.
--
--   Documentamos el gap en lib/supabase/productos.ts comentario JSDoc
--   de actualizarProducto. Ahora lo cerramos.
--
-- Estrategia de remediación APROBADA (opción A):
--   Crear un lote sintético "L-AJUSTE" por la diferencia, NO bajar
--   stock_actual. Razón: stock_actual representa la realidad física
--   que el comerciante cargó manualmente. Si bajamos a SUM(lotes)
--   perdemos esa información. Con L-AJUSTE reconocemos que hubo
--   ajuste manual no trazado.
--
-- Aplicar SIN miedo: SELECT only. Pegá las 5 queries de a una en
-- Supabase SQL Editor para ver cada panel.


-- ═══════════════════════════════════════════════════════════════════
-- 1. RESUMEN GLOBAL — conteos por categoría
-- ═══════════════════════════════════════════════════════════════════
-- Misma estructura del audit-lotes-drift.sql pero ampliando para
-- exponer las 4 categorías (legacy / sincronizados / drift positivo /
-- drift negativo). Esperado tras el sprint v1: drift_positivo = 0.
-- Si aparece > 0 acá también, hay regresión.

WITH suma_por_producto AS (
  SELECT p.id,
         p.comercio_id,
         p.stock_actual,
         COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) AS sum_lotes,
         (SELECT COUNT(*) FROM lotes WHERE producto_id = p.id) AS lotes_count
  FROM productos p
  WHERE p.activo = true
),
clasificado AS (
  SELECT *,
         CASE
           WHEN lotes_count = 0 THEN 'legacy'
           WHEN sum_lotes = stock_actual THEN 'ok'
           WHEN sum_lotes > stock_actual THEN 'drift_positivo'
           ELSE 'drift_negativo'
         END AS categoria
  FROM suma_por_producto
)
SELECT
  count(*) FILTER (WHERE categoria = 'legacy')         AS sin_lotes,
  count(*) FILTER (WHERE categoria = 'ok')             AS sincronizados,
  count(*) FILTER (WHERE categoria = 'drift_positivo') AS drift_positivo,
  count(*) FILTER (WHERE categoria = 'drift_negativo') AS drift_negativo,
  count(*)                                             AS total
FROM clasificado;


-- ═══════════════════════════════════════════════════════════════════
-- 2. DETALLE DEL DRIFT NEGATIVO — top 50 productos
-- ═══════════════════════════════════════════════════════════════════
-- Productos con stock_actual > SUM(lotes), ordenados por magnitud.
-- Las columnas clave:
--   stock_actual = lo que el comercio CREE que tiene físicamente.
--   sum_lotes    = lo que los lotes registran.
--   diferencia   = stock_actual - sum_lotes
--                   → es la cantidad que va a tener el lote L-AJUSTE.

SELECT
  c.nombre AS comercio,
  p.nombre AS producto,
  p.id     AS producto_id,
  p.stock_actual,
  COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) AS sum_lotes,
  p.stock_actual
    - COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) AS diferencia,
  (SELECT COUNT(*) FROM lotes WHERE producto_id = p.id) AS lotes_count,
  p.unidad_venta,
  p.updated_at
FROM productos p
JOIN comercios c ON c.id = p.comercio_id
WHERE p.activo = true
  AND EXISTS (SELECT 1 FROM lotes WHERE producto_id = p.id)
  AND p.stock_actual > COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
ORDER BY p.stock_actual
  - COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) DESC
LIMIT 50;


-- ═══════════════════════════════════════════════════════════════════
-- 3. DISTRIBUCIÓN DEL DRIFT NEGATIVO — histograma por tamaño
-- ═══════════════════════════════════════════════════════════════════
-- Si la mayoría son drift chico (<5), el ajuste con L-AJUSTE va a
-- crear muchos lotes pequeños — ok. Si hay productos con drift de
-- 50+ unidades, conviene revisarlos a mano (¿realmente el comerciante
-- tenía 80 cuando los lotes decían 30?).

WITH drifts AS (
  SELECT p.id,
         p.stock_actual
           - COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) AS drift
  FROM productos p
  WHERE p.activo = true
    AND EXISTS (SELECT 1 FROM lotes WHERE producto_id = p.id)
    AND p.stock_actual > COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
)
SELECT
  count(*) FILTER (WHERE drift BETWEEN 1 AND 5)    AS drift_1_a_5,
  count(*) FILTER (WHERE drift BETWEEN 6 AND 20)   AS drift_6_a_20,
  count(*) FILTER (WHERE drift BETWEEN 21 AND 50)  AS drift_21_a_50,
  count(*) FILTER (WHERE drift > 50)               AS drift_mayor_50,
  count(*)                                         AS total_con_drift_negativo
FROM drifts;


-- ═══════════════════════════════════════════════════════════════════
-- 4. POR COMERCIO — drift negativo agregado
-- ═══════════════════════════════════════════════════════════════════
-- Útil para saber si el problema está concentrado en algún comercio
-- particular (= un tester que usa /stock o "Editar producto" mucho)
-- o disperso.

SELECT
  c.id     AS comercio_id,
  c.nombre AS comercio,
  count(*) FILTER (
    WHERE p.stock_actual > COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
  ) AS productos_con_drift_negativo,
  COALESCE(SUM(
    p.stock_actual
      - COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
  ) FILTER (
    WHERE p.stock_actual > COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
  ), 0) AS unidades_a_crear_en_L_AJUSTE
FROM comercios c
JOIN productos p ON p.comercio_id = c.id
WHERE p.activo = true
  AND EXISTS (SELECT 1 FROM lotes WHERE producto_id = p.id)
GROUP BY c.id, c.nombre
HAVING count(*) FILTER (
  WHERE p.stock_actual > COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
) > 0
ORDER BY unidades_a_crear_en_L_AJUSTE DESC;


-- ═══════════════════════════════════════════════════════════════════
-- 5. LOTES "ZOMBIE" — cantidad=0 (también van a limpiarse en V2)
-- ═══════════════════════════════════════════════════════════════════
-- Sin trazabilidad item↔lote, mantener lotes en 0 no aporta nada y
-- ensucia la UI. El sprint v2 incluye cleanup permanente (en RPCs)
-- + one-off para los existentes.

SELECT
  'lotes_en_cero' AS tipo,
  count(*)        AS cantidad
FROM lotes
WHERE cantidad = 0;


-- ═══════════════════════════════════════════════════════════════════
-- ESTRATEGIA DE REMEDIACIÓN — opción A (aprobada)
-- ═══════════════════════════════════════════════════════════════════
-- (NO ejecutar manual desde acá. La migración del commit 2 lo hace
--  atómicamente. Lo dejo de referencia para entender el plan.)
--
-- Para cada producto con stock_actual > SUM(lotes):
--   diferencia = stock_actual - SUM(lotes)
--   INSERT INTO lotes (producto_id, numero_lote, cantidad, fecha_vencimiento, fecha_ingreso)
--     VALUES (producto_id, 'L-AJUSTE', diferencia, NULL, now());
--
-- Resultado: SUM(lotes) sube a stock_actual, drift = 0.
-- El lote L-AJUSTE no tiene vencimiento → se consume al final por
-- FIFO (después de los perecederos).
--
-- Lo que NO hacemos:
--   - Bajar stock_actual a SUM(lotes) → perdemos info que el
--     comerciante metió manualmente.
--   - Editar el lote más viejo para inflarlo → sería implícito,
--     L-AJUSTE es explícito y trazable.
--   - Borrar lotes en 0 acá → el commit 2 lo hace en una sola pasada
--     después de la reconciliación.
