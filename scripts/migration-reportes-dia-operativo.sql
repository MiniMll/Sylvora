-- ═══════════════════════════════════════════════════════════════════
-- RPC: get_reporte_dashboard — VERSIÓN 3 (día operativo)
-- ═══════════════════════════════════════════════════════════════════
--
-- La V2 definía "hoy" adentro del SQL (date_trunc + AT TIME ZONE).
-- Eso funciona para comercios diurnos pero rompe la consistencia con
-- Caja/Dashboard cuando el comercio configura horario operativo
-- (settings.caja_24hs=false): a la 01:30 de una pizzería 18-02, la
-- caja sigue siendo "ayer" pero la V2 reportaba "hoy" calendario.
--
-- La V3 NO SABE qué significa "hoy". Recibe todos los rangos como
-- parámetros explícitos, calculados por TypeScript con la ÚNICA
-- fuente de verdad: lib/operacion/diaOperativo.ts.
--
-- ───────────────────────────────────────────────────────────────────
-- NUEVA FIRMA (overload — convive con la V2 hasta el cleanup):
--
--   get_reporte_dashboard(
--     p_rango_tipo   text,         -- 'hoy' | 'semana' | 'mes' (SOLO echo
--                                  --  para el JSON de respuesta; NO se usa
--                                  --  para calcular nada)
--     p_desde        timestamptz,  -- inicio del rango completo (inclusive)
--     p_hasta        timestamptz,  -- fin del rango completo (EXCLUSIVE)
--     p_dias         jsonb,        -- buckets de días OPERATIVOS para la
--                                  -- serie temporal:
--                                  -- [{ "fecha": "YYYY-MM-DD",
--                                  --    "inicio": "<timestamptz ISO>",
--                                  --    "fin":    "<timestamptz ISO>" }, ...]
--     p_gastos_desde date,         -- gastos.fecha es DATE → rango de
--     p_gastos_hasta date          -- fechas OPERATIVAS (inclusive ambos)
--   ) RETURNS jsonb
--
-- Todo lo temporal usa [inicio, fin) — semiabierto, igual que Caja y
-- Dashboard. Cero now(), cero CURRENT_DATE, cero date_trunc, cero
-- lógica de timezone.
--
-- ───────────────────────────────────────────────────────────────────
-- ESTRATEGIA DE DEPLOY SIN DOWNTIME
--
-- Postgres soporta overloading por firma: esta migración CREA la
-- firma nueva SIN tocar la vieja get_reporte_dashboard(text, text).
--
--   1. Aplicar esta migración → ambas firmas conviven.
--      Clientes viejos (deploy actual) siguen llamando (p_rango, p_tz)
--      y funcionan igual.
--   2. Deployar el cliente nuevo (lib/supabase/reportes.ts) que llama
--      la firma nueva.
--   3. Verificado el deploy → correr el CLEANUP (comentado al final)
--      para droppear la firma vieja.
--
-- Rollback: si el deploy nuevo falla, la firma vieja sigue viva —
-- basta revertir el deploy del cliente. No hay estado intermedio roto.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION. Re-runnable.

BEGIN;

CREATE OR REPLACE FUNCTION get_reporte_dashboard(
  p_rango_tipo   text,
  p_desde        timestamptz,
  p_hasta        timestamptz,
  p_dias         jsonb,
  p_gastos_desde date,
  p_gastos_hasta date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comercio    uuid;
  v_kpis        jsonb;
  v_ventas_dia  jsonb;
  v_top         jsonb;
  v_stock       jsonb;
  v_gastos      numeric := 0;
  v_ventas      numeric := 0;
  v_tickets     bigint := 0;
  v_unidades    numeric := 0;
  v_dias_count  int;
BEGIN
  -- ───── 1. Resolver comercio del caller ──────────────────────────
  v_comercio := get_comercio_id();
  IF v_comercio IS NULL THEN
    RAISE EXCEPTION 'no_session'
      USING DETAIL = 'auth.uid() no resuelve a un comercio. ¿Sesión expirada?';
  END IF;

  -- ───── 2. Validar parámetros (la RPC no calcula, pero sí valida) ─
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde >= p_hasta THEN
    RAISE EXCEPTION 'rango_invalido'
      USING DETAIL = 'p_desde debe ser anterior a p_hasta';
  END IF;
  -- Cap defensivo: rango máximo ~93 días. Evita que un cliente
  -- bugueado pida años de datos en un solo call.
  IF p_hasta - p_desde > interval '93 days' THEN
    RAISE EXCEPTION 'rango_invalido'
      USING DETAIL = 'rango máximo: 93 días';
  END IF;

  v_dias_count := COALESCE(jsonb_array_length(p_dias), 0);
  IF v_dias_count < 1 OR v_dias_count > 93 THEN
    RAISE EXCEPTION 'dias_invalidos'
      USING DETAIL = format('p_dias debe tener entre 1 y 93 buckets, tiene %s', v_dias_count);
  END IF;

  -- ───── 3. KPIs del rango [p_desde, p_hasta) ─────────────────────
  SELECT
    COALESCE(SUM(total), 0),
    COUNT(*)
  INTO v_ventas, v_tickets
  FROM ventas
  WHERE comercio_id = v_comercio
    AND estado = 'completada'
    AND created_at >= p_desde
    AND created_at <  p_hasta;

  SELECT COALESCE(SUM(iv.cantidad), 0)
  INTO v_unidades
  FROM items_venta iv
  JOIN ventas v2 ON v2.id = iv.venta_id
  WHERE v2.comercio_id = v_comercio
    AND v2.estado = 'completada'
    AND v2.created_at >= p_desde
    AND v2.created_at <  p_hasta;

  SELECT COALESCE(SUM(monto), 0)
  INTO v_gastos
  FROM gastos
  WHERE comercio_id = v_comercio
    AND fecha >= p_gastos_desde
    AND fecha <= p_gastos_hasta;

  SELECT jsonb_build_object(
    'ventas_total',      v_ventas,
    'tickets_total',     v_tickets,
    'ticket_promedio',
      CASE
        WHEN v_tickets > 0
        THEN ROUND(v_ventas / v_tickets, 2)
        ELSE NULL
      END,
    'gastos_total',      v_gastos,
    'ganancia_estimada', v_ventas - v_gastos,
    'unidades_total',    v_unidades
  ) INTO v_kpis;

  -- ───── 4. Serie temporal — ventas por DÍA OPERATIVO ─────────────
  -- Los buckets vienen armados por TypeScript (p_dias). Cada bucket
  -- es [inicio, fin) del día operativo. Los días sin ventas quedan
  -- en 0 por el LEFT JOIN — el eje X del gráfico no tiene gaps.
  -- Para un nocturno 18-02, el bucket del "viernes" cubre
  -- [vie 18:00, sáb 02:00) — imposible de expresar con date_trunc.
  WITH dias AS (
    SELECT
      d->>'fecha'                  AS fecha,
      (d->>'inicio')::timestamptz  AS inicio,
      (d->>'fin')::timestamptz     AS fin
    FROM jsonb_array_elements(p_dias) AS d
  ),
  agg AS (
    SELECT
      dias.fecha,
      COALESCE(SUM(v.total), 0)::numeric AS total,
      COUNT(v.id)                        AS tickets
    FROM dias
    LEFT JOIN ventas v
      ON  v.comercio_id = v_comercio
      AND v.estado = 'completada'
      AND v.created_at >= dias.inicio
      AND v.created_at <  dias.fin
    GROUP BY dias.fecha
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'fecha',   fecha,
        'total',   total,
        'tickets', tickets
      )
      ORDER BY fecha
    ),
    '[]'::jsonb
  )
  INTO v_ventas_dia
  FROM agg;

  -- ───── 5. Top 10 productos por facturación del rango ────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'producto_id', producto_id,
        'nombre',      nombre,
        'cantidad',    cantidad,
        'facturacion', facturacion
      )
      ORDER BY facturacion DESC
    ),
    '[]'::jsonb
  )
  INTO v_top
  FROM (
    SELECT
      iv.producto_id,
      iv.nombre_producto        AS nombre,
      SUM(iv.cantidad)::numeric AS cantidad,
      SUM(iv.subtotal)::numeric AS facturacion
    FROM items_venta iv
    JOIN ventas v ON v.id = iv.venta_id
    WHERE v.comercio_id = v_comercio
      AND v.estado = 'completada'
      AND v.created_at >= p_desde
      AND v.created_at <  p_hasta
    GROUP BY iv.producto_id, iv.nombre_producto
    ORDER BY SUM(iv.subtotal) DESC
    LIMIT 10
  ) t;

  -- ───── 6. Stock crítico (estado actual, NO temporal) ────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'producto_id',  producto_id,
        'nombre',       nombre,
        'stock_actual', stock_actual,
        'stock_minimo', stock_minimo,
        'unidad_venta', unidad_venta
      )
      ORDER BY ratio ASC, nombre ASC
    ),
    '[]'::jsonb
  )
  INTO v_stock
  FROM (
    SELECT
      id                                                AS producto_id,
      nombre,
      stock_actual,
      stock_minimo,
      unidad_venta,
      (stock_actual / NULLIF(stock_minimo, 0))::numeric AS ratio
    FROM productos
    WHERE comercio_id = v_comercio
      AND activo = true
      AND stock_minimo > 0
      AND stock_actual <= stock_minimo
    ORDER BY (stock_actual / NULLIF(stock_minimo, 0)) ASC, nombre
    LIMIT 50
  ) p;

  -- ───── 7. JSON final (misma shape que V2 — el cliente no cambia
  --         sus tipos, solo cómo llama) ────────────────────────────
  RETURN jsonb_build_object(
    'rango', jsonb_build_object(
      'tipo',  p_rango_tipo,
      'desde', p_desde,
      'hasta', p_hasta,
      'tz',    'America/Argentina/Buenos_Aires'
    ),
    'kpis',           v_kpis,
    'ventas_por_dia', v_ventas_dia,
    'top_productos',  v_top,
    'stock_critico',  v_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_reporte_dashboard(text, timestamptz, timestamptz, jsonb, date, date) TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. AMBAS firmas conviven (V2 vieja + V3 nueva):
--    SELECT proname, pg_get_function_arguments(oid)
--    FROM pg_proc WHERE proname = 'get_reporte_dashboard';
--    → 2 filas:
--      'p_rango text, p_tz text DEFAULT ...'          (V2, legacy)
--      'p_rango_tipo text, p_desde timestamptz, ...'  (V3)
--
-- 2. Smoke funcional V3 (reemplazar el comercio del caller):
--    SELECT get_reporte_dashboard(
--      'hoy',
--      '2026-06-13T03:00:00Z'::timestamptz,
--      '2026-06-14T03:00:00Z'::timestamptz,
--      '[{"fecha":"2026-06-13","inicio":"2026-06-13T03:00:00Z","fin":"2026-06-14T03:00:00Z"}]'::jsonb,
--      '2026-06-13'::date,
--      '2026-06-13'::date
--    );
--    → jsonb con kpis / ventas_por_dia (1 elemento) / top / stock.
--
-- 3. Validaciones:
--    - p_desde >= p_hasta → EXCEPTION rango_invalido.
--    - p_dias = '[]' → EXCEPTION dias_invalidos.
--
-- ═══════════════════════════════════════════════════════════════════
-- CLEANUP (correr SOLO después de verificar el deploy del cliente
-- nuevo en producción — típicamente 1-2 días después)
-- ═══════════════════════════════════════════════════════════════════
--
-- DROP FUNCTION IF EXISTS get_reporte_dashboard(text, text);
