-- ═══════════════════════════════════════════════════════════════════
-- AUDITORÍA — drift entre productos.stock_actual y SUM(lotes.cantidad)
-- ═══════════════════════════════════════════════════════════════════
--
-- Reporta SIN MODIFICAR datos qué productos tienen desincronización
-- entre el master numérico (productos.stock_actual) y los lotes.
--
-- Background:
--   Hasta esta migración, descontar_stock_validado() y restituir_stock()
--   tocaban solo productos.stock_actual. Los lotes nunca se actualizaron
--   tras ventas/anulaciones → drift acumulado desde la primera venta de
--   cualquier producto loteado.
--
--   El fix viene en migration-lotes-integrity.sql (siguiente). Antes de
--   aplicarlo conviene saber CUÁNTOS productos están desincronizados y
--   CUÁNTO drift hay — para decidir si se limpia caso por caso o si
--   se acepta el estado y se sincroniza de oficio.
--
-- Categorías que clasifica el script:
--   A) "legacy" — producto SIN lotes. stock_actual es la única fuente
--      de verdad. NO hay drift posible. La migración los va a manejar
--      en "modo legacy" sin cambios.
--   B) "ok" — producto CON lotes y SUM(lotes) == stock_actual. Sano.
--   C) "drift positivo" — SUM(lotes) > stock_actual. Significa que se
--      vendió y stock_actual bajó pero los lotes no. Caso más común.
--   D) "drift negativo" — SUM(lotes) < stock_actual. Raro. Podría
--      indicar lotes borrados manualmente sin actualizar stock_actual,
--      o que stock_actual fue inflado por bug previo (ej. el bug del
--      tester de hace dos sprints antes del fix de stock_validado).
--
-- Aplicar SIN miedo: todas las queries son SELECT. Pegá una a una en
-- Supabase SQL Editor para ver los resultados, o pegá todo y mirá
-- cada panel de output.
--
-- ───────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════
-- 1. RESUMEN GLOBAL — cuántos productos hay en cada categoría
-- ═══════════════════════════════════════════════════════════════════
-- Una sola fila con conteos. Es el primer "vistazo" para decidir si
-- el drift es problema masivo (cientos de productos) o puntual (un
-- puñado).

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
  count(*) FILTER (WHERE categoria = 'legacy')          AS sin_lotes,
  count(*) FILTER (WHERE categoria = 'ok')              AS sincronizados,
  count(*) FILTER (WHERE categoria = 'drift_positivo')  AS drift_positivo,
  count(*) FILTER (WHERE categoria = 'drift_negativo')  AS drift_negativo,
  count(*)                                              AS total
FROM clasificado;


-- ═══════════════════════════════════════════════════════════════════
-- 2. DETALLE DEL DRIFT — productos con desincronización, top 50
-- ═══════════════════════════════════════════════════════════════════
-- Muestra los productos con drift ordenados por magnitud absoluta.
-- Sirve para decisión caso por caso:
--   - ¿Es un producto activo o discontinuado?
--   - ¿La diferencia tiene sentido (ventas históricas) o es bug raro?
--   - ¿Qué valor es el "real" — el stock_actual o el SUM(lotes)?
--
-- columnas:
--   drift = sum_lotes - stock_actual
--          > 0 → lotes inflados respecto al stock (drift positivo)
--          < 0 → lotes faltantes respecto al stock (drift negativo)

SELECT
  c.nombre        AS comercio,
  p.nombre        AS producto,
  p.id            AS producto_id,
  p.stock_actual,
  COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) AS sum_lotes,
  COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
    - p.stock_actual AS drift,
  (SELECT COUNT(*) FROM lotes WHERE producto_id = p.id) AS lotes_count,
  p.unidad_venta,
  p.created_at
FROM productos p
JOIN comercios c ON c.id = p.comercio_id
WHERE p.activo = true
  AND EXISTS (SELECT 1 FROM lotes WHERE producto_id = p.id)
  AND p.stock_actual <> COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
ORDER BY abs(
  COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) - p.stock_actual
) DESC
LIMIT 50;


-- ═══════════════════════════════════════════════════════════════════
-- 3. DISTRIBUCIÓN DEL DRIFT — histograma por tamaño
-- ═══════════════════════════════════════════════════════════════════
-- Cuántos productos tienen drift "chico" vs "grande". Si la mayoría
-- son <5 unidades, el ajuste de oficio es razonable; si hay productos
-- con drift de 50+ unidades, conviene revisarlos a mano.

WITH drifts AS (
  SELECT p.id,
         abs(
           COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
           - p.stock_actual
         ) AS drift_abs
  FROM productos p
  WHERE p.activo = true
    AND EXISTS (SELECT 1 FROM lotes WHERE producto_id = p.id)
)
SELECT
  count(*) FILTER (WHERE drift_abs = 0)                       AS sincronizados,
  count(*) FILTER (WHERE drift_abs BETWEEN 1 AND 5)           AS drift_1_a_5,
  count(*) FILTER (WHERE drift_abs BETWEEN 6 AND 20)          AS drift_6_a_20,
  count(*) FILTER (WHERE drift_abs BETWEEN 21 AND 50)         AS drift_21_a_50,
  count(*) FILTER (WHERE drift_abs > 50)                      AS drift_mayor_50,
  count(*)                                                    AS total_con_lotes
FROM drifts;


-- ═══════════════════════════════════════════════════════════════════
-- 4. POR COMERCIO — agregado para saber si el problema es localizado
-- ═══════════════════════════════════════════════════════════════════
-- Si un comercio en particular tiene 80% del drift, ese tester
-- probablemente fue el que disparó el bug. Útil para priorizar la
-- conversación.

SELECT
  c.id   AS comercio_id,
  c.nombre AS comercio,
  count(*)                                            AS productos_con_lotes,
  count(*) FILTER (
    WHERE p.stock_actual <> COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
  ) AS productos_con_drift,
  COALESCE(SUM(
    abs(COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) - p.stock_actual)
  ), 0) AS drift_total_abs
FROM comercios c
JOIN productos p ON p.comercio_id = c.id
WHERE p.activo = true
  AND EXISTS (SELECT 1 FROM lotes WHERE producto_id = p.id)
GROUP BY c.id, c.nombre
HAVING count(*) FILTER (
  WHERE p.stock_actual <> COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0)
) > 0
ORDER BY drift_total_abs DESC;


-- ═══════════════════════════════════════════════════════════════════
-- 5. LOTES "ZOMBIE" — cantidad=0 o fecha_vencimiento pasada
-- ═══════════════════════════════════════════════════════════════════
-- Informativo, no es drift. Los lotes en 0 no rompen consistencia
-- pero son ruido visual en /productos. Los vencidos requieren acción
-- del comerciante (descartar o marcar como vencido).
-- NO se tocan en la migración del fix. Decisión humana posterior.

SELECT
  'lotes_en_cero' AS tipo,
  count(*)        AS cantidad
FROM lotes
WHERE cantidad = 0
UNION ALL
SELECT
  'lotes_vencidos',
  count(*)
FROM lotes
WHERE fecha_vencimiento IS NOT NULL
  AND fecha_vencimiento < CURRENT_DATE
  AND cantidad > 0;


-- ═══════════════════════════════════════════════════════════════════
-- POSIBLES ESTRATEGIAS DE REMEDIACIÓN POST-AUDITORÍA
-- ═══════════════════════════════════════════════════════════════════
-- (Para correr DESPUÉS de revisar los resultados — NO automáticas)
--
-- Estrategia A — "trust productos.stock_actual"
--   Si confiás en que stock_actual es el valor real (fue el master
--   numérico todo este tiempo) y querés ajustar los lotes:
--
--     -- ESCRIBE — revisar antes
--     -- Para cada producto con drift_positivo (sum_lotes > stock_actual):
--     -- Achicar el lote más viejo (FIFO inverso) hasta nivelar.
--
-- Estrategia B — "trust lotes"
--   Si confiás en que la SUM(lotes) representa el inventario físico
--   real (porque el cajero los va contando), ajustá stock_actual:
--
--     -- ESCRIBE — revisar antes
--     -- UPDATE productos
--     -- SET stock_actual = (SELECT COALESCE(SUM(cantidad),0) FROM lotes WHERE producto_id = productos.id)
--     -- WHERE id IN (<ids del reporte detallado>);
--
-- Estrategia C — "dejar como está"
--   No tocar nada y dejar que la migración del fix asuma stock_actual
--   como verdad. La PRIMERA venta post-migración intentará descontar
--   de lotes en FIFO y va a tirar assert si SUM(lotes) > stock_actual.
--   Bloqueante hasta limpiar caso por caso. NO recomendado a menos que
--   confirmemos por reporte que hay muy pocos casos.
--
-- La recomendación general (luego de ver el reporte):
--   - Drift chico y disperso → Estrategia A automatizada con script
--     que ajusta el lote más viejo hacia abajo.
--   - Drift puntual y grande → Estrategia B caso por caso con el dueño.
--   - Si hay productos activos vendiéndose con drift, primero
--     congelar (productos.activo = false temporalmente) hasta resolver.
