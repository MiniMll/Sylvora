-- ═══════════════════════════════════════════════════════════════════
-- RPC: get_reporte_dashboard
-- ═══════════════════════════════════════════════════════════════════
--
-- VERSIÓN 2 (sprint feat/reportes-v1 — ajuste post-QA inicial):
--   - KPIs dependen del rango seleccionado (antes algunos eran fijos).
--   - Se agrega serie temporal "ventas por día" para el gráfico de barras.
--   - Se elimina ticket_promedio_hoy, ventas_hoy, ventas_mes, tickets_hoy
--     del JSON (ya no se necesitan — todo se ajusta al rango).
--
-- Devuelve en UN solo round-trip todo lo que /reportes necesita:
--   - KPIs (ventas, tickets, ticket promedio, items vendidos — del rango).
--   - Serie diaria "ventas por día" con días en cero rellenados.
--   - Top 10 productos por facturación descendente (del rango).
--   - Stock crítico (estado actual, independiente del rango).
--
-- Decisiones del sprint feat/reportes-v1 reflejadas:
--   - Todo lo temporal depende del rango. KPIs cambian labels y números
--     cuando el cajero toca hoy / 7 días / 30 días.
--   - Top productos ordenados por SUM(subtotal) DESC (facturación).
--   - Stock crítico excluye productos con stock_minimo = 0.
--   - "Items vendidos" = SUM(items_venta.cantidad). Para productos por
--     peso (kg/L/m) cantidad típicamente = 1 con peso real en peso_kg —
--     entonces la métrica cuenta líneas de venta para esos casos.
--     Aceptado como trade-off V1; para kioscos AR (95% por unidad)
--     es preciso.
--
-- Performance:
--   - KPIs: una sola pasada sobre ventas filtradas + subquery sobre
--     items_venta. Usa idx_ventas_comercio_created + idx_items_venta_venta.
--     Para 18k ventas/año es instantáneo.
--   - Ventas por día: generate_series(N días) LEFT JOIN agregación.
--     Para 30 días = 30 filas. Trivial.
--   - Top productos: hash join items_venta → ventas. GROUP BY in-memory.
--   - Stock crítico: scan productos del comercio + filtros simples.
--
-- Seguridad:
--   - SECURITY INVOKER → respeta RLS.
--   - Filtra explícitamente por get_comercio_id().
--   - p_rango validado contra whitelist; RAISE EXCEPTION si inválido.
--
-- Timezone:
--   - p_tz parametrizado, default 'America/Argentina/Buenos_Aires'.
--   - Días del eje X se calculan en TZ del usuario, no UTC.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION. Re-runnable.

BEGIN;

CREATE OR REPLACE FUNCTION get_reporte_dashboard(
  p_rango text,
  p_tz    text DEFAULT 'America/Argentina/Buenos_Aires'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comercio    uuid;
  v_dia_inicio  timestamptz;
  v_desde       timestamptz;
  v_hasta       timestamptz := now();
  v_kpis        jsonb;
  v_ventas_dia  jsonb;
  v_top         jsonb;
  v_stock       jsonb;
BEGIN
  -- ───── 1. Resolver comercio del caller ──────────────────────────
  v_comercio := get_comercio_id();
  IF v_comercio IS NULL THEN
    RAISE EXCEPTION 'no_session'
      USING DETAIL = 'auth.uid() no resuelve a un comercio. ¿Sesión expirada?';
  END IF;

  -- ───── 2. Calcular v_desde según el rango ──────────────────────
  -- v_dia_inicio = arranque del día actual en TZ del usuario.
  -- "Últimos N días" = N días calendario incluyendo hoy → desde =
  -- hoy - (N-1) días al 00:00.
  v_dia_inicio := date_trunc('day', now() AT TIME ZONE p_tz) AT TIME ZONE p_tz;

  CASE p_rango
    WHEN 'hoy'    THEN v_desde := v_dia_inicio;
    WHEN 'semana' THEN v_desde := v_dia_inicio - interval '6 days';
    WHEN 'mes'    THEN v_desde := v_dia_inicio - interval '29 days';
    ELSE RAISE EXCEPTION 'rango_invalido'
      USING DETAIL = format('rango "%s" no soportado. Valores: hoy | semana | mes', p_rango);
  END CASE;

  -- ───── 3. KPIs del rango ───────────────────────────────────────
  -- Una sola pasada sobre ventas filtradas. Subquery anidada para
  -- unidades_total porque agrega sobre items_venta (otra tabla).
  -- ticket_promedio: NULL si no hubo tickets (división por cero).
  SELECT jsonb_build_object(
    'ventas_total',   COALESCE(SUM(total), 0),
    'tickets_total',  COUNT(*),
    'ticket_promedio',
      CASE
        WHEN COUNT(*) > 0
        THEN ROUND(SUM(total) / COUNT(*), 2)
        ELSE NULL
      END,
    'unidades_total', (
      SELECT COALESCE(SUM(iv.cantidad), 0)
      FROM items_venta iv
      JOIN ventas v2 ON v2.id = iv.venta_id
      WHERE v2.comercio_id = v_comercio
        AND v2.estado = 'completada'
        AND v2.created_at >= v_desde
        AND v2.created_at <= v_hasta
    )
  ) INTO v_kpis
  FROM ventas
  WHERE comercio_id = v_comercio
    AND estado = 'completada'
    AND created_at >= v_desde
    AND created_at <= v_hasta;

  -- ───── 4. Serie temporal — ventas por día ──────────────────────
  -- generate_series produce los días del rango EN TZ del usuario.
  -- LEFT JOIN con las ventas agrupadas por día (también en TZ) deja
  -- los días sin ventas en 0 — necesario para que el eje X del
  -- gráfico no quede con gaps.
  --
  -- ((created_at AT TIME ZONE p_tz)::date) extrae la fecha como
  -- la ve el comerciante. generate_series en (timestamp) trabaja
  -- con dates puros, sin TZ.
  WITH dias AS (
    SELECT generate_series(
      (v_desde AT TIME ZONE p_tz)::date,
      (v_hasta AT TIME ZONE p_tz)::date,
      interval '1 day'
    )::date AS dia
  ),
  ventas_agg AS (
    SELECT
      (created_at AT TIME ZONE p_tz)::date AS dia,
      SUM(total)::numeric                  AS total,
      COUNT(*)                             AS tickets
    FROM ventas
    WHERE comercio_id = v_comercio
      AND estado = 'completada'
      AND created_at >= v_desde
      AND created_at <= v_hasta
    GROUP BY 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'fecha',   to_char(d.dia, 'YYYY-MM-DD'),
        'total',   COALESCE(a.total, 0),
        'tickets', COALESCE(a.tickets, 0)
      )
      ORDER BY d.dia
    ),
    '[]'::jsonb
  )
  INTO v_ventas_dia
  FROM dias d
  LEFT JOIN ventas_agg a ON a.dia = d.dia;

  -- ───── 5. Top 10 productos por facturación del rango ───────────
  -- GROUP BY producto_id + nombre_producto:
  -- nombre_producto es snapshot del momento de la venta. Si un
  -- producto fue renombrado entre ventas, puede aparecer 2 veces
  -- (caso raro, aceptado para V1).
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
      iv.nombre_producto                 AS nombre,
      SUM(iv.cantidad)::numeric          AS cantidad,
      SUM(iv.subtotal)::numeric          AS facturacion
    FROM items_venta iv
    JOIN ventas v ON v.id = iv.venta_id
    WHERE v.comercio_id = v_comercio
      AND v.estado = 'completada'
      AND v.created_at >= v_desde
      AND v.created_at <= v_hasta
    GROUP BY iv.producto_id, iv.nombre_producto
    ORDER BY SUM(iv.subtotal) DESC
    LIMIT 10
  ) t;

  -- ───── 6. Stock crítico (estado actual, NO temporal) ───────────
  -- Excluye stock_minimo = 0 → "no estoy controlando mínimos".
  -- Ordena por ratio stock_actual/stock_minimo ASC: stock 0 arriba.
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
      id                                            AS producto_id,
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

  -- ───── 7. Armar el JSON final ──────────────────────────────────
  RETURN jsonb_build_object(
    'rango', jsonb_build_object(
      'tipo',  p_rango,
      'desde', v_desde,
      'hasta', v_hasta,
      'tz',    p_tz
    ),
    'kpis',           v_kpis,
    'ventas_por_dia', v_ventas_dia,
    'top_productos',  v_top,
    'stock_critico',  v_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_reporte_dashboard(text, text) TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. Función actualizada:
--    SELECT proname, pg_get_function_arguments(oid)
--    FROM pg_proc WHERE proname = 'get_reporte_dashboard';
--    → 1 fila con args 'p_rango text, p_tz text DEFAULT ...'
--
-- 2. Smoke test desde el browser logueado en /reportes:
--    Verificar que el JSON respuesta tenga:
--      data.kpis.ventas_total       (numero, no NULL)
--      data.kpis.tickets_total      (numero)
--      data.kpis.ticket_promedio    (numero o NULL si tickets=0)
--      data.kpis.unidades_total     (numero)
--      data.ventas_por_dia          (array con longitud = días del rango)
--      data.ventas_por_dia[0]       { fecha, total, tickets }
--      data.top_productos           (sin cambios)
--      data.stock_critico           (sin cambios)
--
-- 3. Test de rango "hoy" (debe devolver ventas_por_dia con 1 fila):
--    En el browser: getReporteDashboard('hoy')
--    ventas_por_dia.length === 1.
--
-- 4. Test de rango "semana": ventas_por_dia.length === 7.
-- 5. Test de rango "mes":    ventas_por_dia.length === 30.
