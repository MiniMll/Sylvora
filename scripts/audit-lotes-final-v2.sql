-- ═══════════════════════════════════════════════════════════════════
-- AUDIT FINAL — invariante stock_actual == SUM(lotes), drift, lotes 0
-- ═══════════════════════════════════════════════════════════════════
--
-- Diagnóstico read-only del estado de integridad del catálogo. Pegar
-- en Supabase SQL Editor → Run cuando quieras ver el estado actual
-- (post sprint fix/stock-lotes-integrity-v2).
--
-- Diferente de los 2 audits previos:
--   - audit-lotes-drift.sql           → drift positivo, detalle por
--                                       producto. Útil para investigar.
--   - audit-lotes-drift-negativo.sql  → drift negativo, mismo formato.
--   - audit-lotes-final-v2.sql (este) → resumen UNIFICADO en una sola
--                                       fila. Útil para "está todo OK?".
--
-- Esperado tras el sprint v2 con prod limpio:
--   sin_lotes        = N    (productos en modo legacy, OK)
--   sincronizados    = M    (productos con lotes, SUM == stock_actual)
--   drift_positivo   = 0    (audit-lotes-drift.sql para detalle si > 0)
--   drift_negativo   = 0    (audit-lotes-drift-negativo.sql idem)
--   lotes_en_cero    = 0    (cleanup permanente activo)
--   ratio_drift      = '0%' (sobre el total con lotes)
--
-- Si algún número se va de 0 → investigar con los audits específicos.

WITH suma_por_producto AS (
  SELECT
    p.id,
    p.stock_actual,
    COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = p.id), 0) AS sum_lotes,
    (SELECT COUNT(*) FROM lotes WHERE producto_id = p.id) AS lotes_count
  FROM productos p
  WHERE p.activo = true
),
clasificado AS (
  SELECT *,
    CASE
      WHEN lotes_count = 0                 THEN 'legacy'
      WHEN sum_lotes = stock_actual        THEN 'ok'
      WHEN sum_lotes > stock_actual        THEN 'drift_positivo'
      ELSE                                      'drift_negativo'
    END AS categoria
  FROM suma_por_producto
),
conteos AS (
  SELECT
    count(*) FILTER (WHERE categoria = 'legacy')         AS sin_lotes,
    count(*) FILTER (WHERE categoria = 'ok')             AS sincronizados,
    count(*) FILTER (WHERE categoria = 'drift_positivo') AS drift_positivo,
    count(*) FILTER (WHERE categoria = 'drift_negativo') AS drift_negativo,
    count(*) FILTER (WHERE categoria <> 'legacy')        AS total_con_lotes
  FROM clasificado
)
SELECT
  c.sin_lotes,
  c.sincronizados,
  c.drift_positivo,
  c.drift_negativo,
  (SELECT count(*) FROM lotes WHERE cantidad = 0) AS lotes_en_cero,
  CASE
    WHEN c.total_con_lotes = 0 THEN '—'
    ELSE round(
      100.0 * (c.drift_positivo + c.drift_negativo) / c.total_con_lotes,
      2
    )::text || '%'
  END AS ratio_drift,
  CASE
    WHEN c.drift_positivo = 0
     AND c.drift_negativo = 0
     AND (SELECT count(*) FROM lotes WHERE cantidad = 0) = 0
    THEN '✓ OK — invariante respetado, sin lotes en cero'
    ELSE '⚠ Investigar con audit-lotes-drift{,-negativo}.sql'
  END AS estado
FROM conteos c;


-- ═══════════════════════════════════════════════════════════════════
-- BONUS: presencia de las RPCs y guards del sprint v2
-- ═══════════════════════════════════════════════════════════════════

SELECT
  exists_funcion AS estado,
  funcion
FROM (
  SELECT
    'descontar_stock_validado' AS funcion,
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'descontar_stock_validado') AS exists_funcion
  UNION ALL SELECT
    'restituir_stock',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'restituir_stock')
  UNION ALL SELECT
    'agregar_lote_atomico',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'agregar_lote_atomico')
  UNION ALL SELECT
    'eliminar_lote_atomico',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'eliminar_lote_atomico')
  UNION ALL SELECT
    'ajustar_stock_atomico',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ajustar_stock_atomico')
) t;
-- Esperado: 5 filas, todas con estado=true.
