-- ═══════════════════════════════════════════════════════════════════
-- RPC: get_reporte_dashboard
-- ═══════════════════════════════════════════════════════════════════
--
-- Devuelve en UN solo round-trip todo lo que /reportes necesita:
--   - KPIs (ventas/tickets del rango + hoy fijo + mes fijo).
--   - Top 10 productos por facturación descendente (del rango).
--   - Stock crítico (estado actual, independiente del rango).
--
-- Decisiones del sprint feat/reportes-v1 (V1):
--   - KPIs "Hoy" y "Mes" SIEMPRE relativos al ahora, independientes
--     del rango. El rango solo afecta ventas_total / tickets_total
--     y la tabla de top productos.
--   - Top productos ordenados por SUM(subtotal) DESC (facturación).
--   - Stock crítico excluye productos con stock_minimo = 0
--     (interpretación: "no estoy controlando mínimos para ese
--     producto").
--
-- Performance:
--   - KPIs: una sola pasada sobre ventas con FILTER per agg →
--     usa idx_ventas_comercio_created. Para 18k ventas/año (50/día)
--     es instantáneo. Si un comercio supera 100k filas/año,
--     evaluar materialized view.
--   - Top productos: hash join items_venta → ventas con filtro de
--     rango. Index hits idx_items_venta_venta + idx_ventas_comercio_
--     created. GROUP BY in-memory para ~200-1000 productos
--     distintos.
--   - Stock crítico: scan productos del comercio (~200-1000 filas).
--     Filtros simples + LIMIT 50.
--
-- Seguridad:
--   - SECURITY INVOKER → respeta RLS de ventas/items_venta/productos.
--   - Filtra explícitamente por get_comercio_id() (helper existente
--     en scripts/landing-staging-bootstrap.sql).
--   - p_rango validado contra whitelist; RAISE EXCEPTION si inválido.
--
-- Timezone:
--   - p_tz parametrizado, default 'America/Argentina/Buenos_Aires'.
--     Sin esto, "hoy" arrancaría a las 21hs del día anterior (UTC).
--     El cliente puede override para tests en otras zonas.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION.
-- Aplicar:
--   psql $DATABASE_URL -f scripts/migration-reportes-rpc.sql
--   o desde Supabase Dashboard → SQL Editor.

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
  v_dia_fin     timestamptz;
  v_mes_inicio  timestamptz;
  v_mes_fin     timestamptz;
  v_desde       timestamptz;
  v_hasta       timestamptz := now();
  v_kpis        jsonb;
  v_top         jsonb;
  v_stock       jsonb;
BEGIN
  -- ───── 1. Resolver comercio del caller ──────────────────────────
  v_comercio := get_comercio_id();
  IF v_comercio IS NULL THEN
    RAISE EXCEPTION 'no_session'
      USING DETAIL = 'auth.uid() no resuelve a un comercio. ¿Sesión expirada?';
  END IF;

  -- ───── 2. Límites de "hoy" y "este mes" en TZ del usuario ──────
  -- date_trunc retorna timestamp sin zona en la TZ pasada; al
  -- castearlo back a timestamptz se interpreta como UTC. Para
  -- llevarlo a la zona correcta hacemos AT TIME ZONE p_tz dos veces:
  -- la primera convierte UTC → tz local, date_trunc trunca, y la
  -- segunda interpreta el resultado como hora local → UTC.
  v_dia_inicio := date_trunc('day',   now() AT TIME ZONE p_tz) AT TIME ZONE p_tz;
  v_dia_fin    := v_dia_inicio + interval '1 day';
  v_mes_inicio := date_trunc('month', now() AT TIME ZONE p_tz) AT TIME ZONE p_tz;
  v_mes_fin    := v_mes_inicio + interval '1 month';

  -- ───── 3. Calcular v_desde según el rango ──────────────────────
  -- "Últimos N días" interpretado como N días calendario incluyendo
  -- hoy → desde = hoy - (N-1) días al 00:00.
  CASE p_rango
    WHEN 'hoy'    THEN v_desde := v_dia_inicio;
    WHEN 'semana' THEN v_desde := v_dia_inicio - interval '6 days';
    WHEN 'mes'    THEN v_desde := v_dia_inicio - interval '29 days';
    ELSE RAISE EXCEPTION 'rango_invalido'
      USING DETAIL = format('rango "%s" no soportado. Valores: hoy | semana | mes', p_rango);
  END CASE;

  -- ───── 4. KPIs en una sola pasada sobre ventas ─────────────────
  -- FILTER agrega varias métricas leyendo el subset una sola vez.
  -- COALESCE para que SUM con cero filas devuelva 0 en vez de NULL.
  -- ticket_promedio_hoy: NULL si no hubo tickets (división por cero).
  SELECT jsonb_build_object(
    'ventas_total',  COALESCE(SUM(total)   FILTER (WHERE created_at >= v_desde      AND created_at <= v_hasta),   0),
    'ventas_hoy',    COALESCE(SUM(total)   FILTER (WHERE created_at >= v_dia_inicio AND created_at <  v_dia_fin), 0),
    'ventas_mes',    COALESCE(SUM(total)   FILTER (WHERE created_at >= v_mes_inicio AND created_at <  v_mes_fin), 0),
    'tickets_total',          COUNT(*)     FILTER (WHERE created_at >= v_desde      AND created_at <= v_hasta),
    'tickets_hoy',            COUNT(*)     FILTER (WHERE created_at >= v_dia_inicio AND created_at <  v_dia_fin),
    'ticket_promedio_hoy',
      CASE
        WHEN COUNT(*) FILTER (WHERE created_at >= v_dia_inicio AND created_at < v_dia_fin) > 0
        THEN ROUND(
          SUM(total) FILTER (WHERE created_at >= v_dia_inicio AND created_at < v_dia_fin) /
          COUNT(*)   FILTER (WHERE created_at >= v_dia_inicio AND created_at < v_dia_fin),
          2
        )
        ELSE NULL
      END
  ) INTO v_kpis
  FROM ventas
  WHERE comercio_id = v_comercio
    AND estado = 'completada';

  -- ───── 5. Top 10 productos por facturación del rango ───────────
  -- GROUP BY producto_id + nombre_producto:
  -- nombre_producto es snapshot del momento de la venta. Si un
  -- producto fue renombrado entre ventas, puede aparecer 2 veces
  -- (caso raro, aceptado para V1 — el dueño lo entiende). Alternativa:
  -- agrupar solo por producto_id + join con productos.nombre, pero
  -- productos eliminados (FK SET NULL) pierden nombre.
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
  -- Ordena por ratio stock_actual/stock_minimo ASC: productos en 0
  -- van primero, después los más cerca del mínimo.
  -- LIMIT 50 defensivo — para un comercio sano la lista nunca debería
  -- ser tan larga; si lo es, hay un problema mayor que un reporte.
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
    'kpis',          v_kpis,
    'top_productos', v_top,
    'stock_critico', v_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_reporte_dashboard(text, text) TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. Función creada:
--    SELECT proname, pg_get_function_arguments(oid)
--    FROM pg_proc WHERE proname = 'get_reporte_dashboard';
--    → 1 fila con args 'p_rango text, p_tz text DEFAULT ...'.
--
-- 2. Smoke test desde un cliente autenticado (NO desde SQL Editor,
--    porque ahí no hay auth.uid() y get_comercio_id() devuelve NULL):
--    En la consola del browser después de login:
--      const { data, error } = await window.supabase.rpc('get_reporte_dashboard', { p_rango: 'semana' })
--      console.log(data, error)
--
--    Esperado:
--      data = { rango: {...}, kpis: {...}, top_productos: [...], stock_critico: [...] }
--      error = null
--
-- 3. Test de rango inválido:
--    Pasando p_rango = 'invalido' → debe devolver error con MESSAGE
--    'rango_invalido' y DETAIL con la lista de valores válidos.
