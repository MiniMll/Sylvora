-- ═══════════════════════════════════════════════════════════════════
-- Migración: RPC descontar_stock_validado atómica con lock pesimista.
-- ═══════════════════════════════════════════════════════════════════
--
-- Contexto del bug (reportado por tester):
--   Stock 10 → vendí 20 → cancelé → stock terminó en 20.
--
-- Causas identificadas:
--   1. UI permitía ventas excediendo stock (toast decorativo).
--   2. RPC `descontar_stock` clampeaba con GREATEST(0, ...) → perdía
--      la info de "se vendieron unidades fantasma" pero la venta se
--      guardaba igual.
--   3. RPC `restituir_stock` suma ciega → al cancelar esa venta
--      devolvía el bug "stock inflado" del comentario del tester.
--   4. `guardarVenta` no revalidaba stock antes del insert.
--
-- Fix server-side (esta migración):
--   Nueva RPC `descontar_stock_validado(p_items jsonb)` que:
--     - Recibe TODOS los items de la venta en un round-trip.
--     - SELECT ... FOR UPDATE → lock pesimista, ORDER BY id para
--       evitar deadlocks entre cajeros concurrentes que vendan los
--       mismos productos en orden distinto.
--     - Valida que cada `stock_actual >= cantidad` después de tomar
--       los locks (estado fresco, sin race con otra sesión).
--     - Si algún item no alcanza → RAISE EXCEPTION con DETAIL en
--       JSON. PostgREST lo expone como `error.details` al cliente,
--       que parsea y muestra mensaje humano.
--     - Si todos pasan → descuenta TODOS dentro de la misma
--       transacción. Atómico: cualquier error hace rollback.
--
-- La RPC vieja `descontar_stock` se marca como DEPRECATED pero NO
-- se elimina — backward-compat por si quedan llamadas viejas en
-- código que no migraron. El nuevo `guardarVenta` deja de llamarla
-- en el commit siguiente.
--
-- `restituir_stock` NO se toca — su rol al cancelar venta es
-- correcto siempre y cuando ninguna venta haya descontado más
-- de lo que había. Lo cual queda garantizado por la nueva RPC.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION. Re-runable.
-- Aplicar:
--   psql $DATABASE_URL -f scripts/migration-stock-validado.sql
-- o desde Supabase Dashboard → SQL Editor.

BEGIN;

-- ───── Nueva RPC: descontar_stock_validado ──────────────────────────
-- Atómica, validada, con lock pesimista ordenado.

CREATE OR REPLACE FUNCTION descontar_stock_validado(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_item            jsonb;
  v_producto_id     uuid;
  v_cantidad        numeric;
  v_stock_actual    numeric;
  v_nombre          text;
BEGIN
  -- 1. Lock pesimista de TODAS las filas involucradas en una sola
  --    pasada, ordenadas por id para que dos transacciones concurrentes
  --    siempre tomen los locks en el mismo orden (sin deadlock).
  --    Las filas quedan lockeadas hasta el COMMIT/ROLLBACK de la
  --    transacción que envuelve esta función.
  PERFORM 1 FROM productos
  WHERE id IN (
    SELECT (elem->>'producto_id')::uuid
    FROM jsonb_array_elements(p_items) elem
  )
  ORDER BY id
  FOR UPDATE;

  -- 2. Validar cada item con los locks ya tomados. Cualquier RAISE
  --    deja todas las filas sin tocar (rollback automático del fn).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad    := (v_item->>'cantidad')::numeric;

    IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
      RAISE EXCEPTION 'cantidad_invalida'
        USING DETAIL = jsonb_build_object(
          'producto_id', v_producto_id,
          'cantidad', v_cantidad
        )::text;
    END IF;

    SELECT stock_actual, nombre
      INTO v_stock_actual, v_nombre
      FROM productos
     WHERE id = v_producto_id;

    -- Producto borrado entre el lock y este SELECT no debería pasar
    -- (el lock previene DELETE), pero defendemos.
    IF v_stock_actual IS NULL THEN
      RAISE EXCEPTION 'producto_no_encontrado'
        USING DETAIL = jsonb_build_object(
          'producto_id', v_producto_id
        )::text;
    END IF;

    IF v_stock_actual < v_cantidad THEN
      RAISE EXCEPTION 'stock_insuficiente'
        USING DETAIL = jsonb_build_object(
          'producto_id', v_producto_id,
          'nombre',      v_nombre,
          'disponible',  v_stock_actual,
          'pedido',      v_cantidad
        )::text;
    END IF;
  END LOOP;

  -- 3. Descontar TODOS. Si llegamos acá, validación pasó para todos.
  --    Cualquier UPDATE que falle hace rollback de los previos
  --    (transacción única del function call).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad    := (v_item->>'cantidad')::numeric;

    UPDATE productos
       SET stock_actual = stock_actual - v_cantidad
     WHERE id = v_producto_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION descontar_stock_validado(jsonb) TO authenticated;

-- ───── Comentario DEPRECATED en la RPC vieja ────────────────────────
-- No la borramos por backward-compat. El nuevo flujo de guardarVenta
-- deja de llamarla a partir del commit siguiente; cuando confirmemos
-- que ninguna ruta del código la usa, se puede DROP en una migración
-- de limpieza futura.

COMMENT ON FUNCTION descontar_stock(uuid, numeric) IS
  'DEPRECATED: usar descontar_stock_validado(jsonb). Esta función '
  'clampea stock a 0 con GREATEST() y NO valida ni lockea — permitía '
  'ventas que excedían el stock disponible. Se mantiene por '
  'backward-compat hasta confirmar que no hay callers en código.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. Función creada:
--    SELECT proname, pg_get_function_arguments(oid)
--    FROM pg_proc WHERE proname = 'descontar_stock_validado';
--    → Debe devolver 1 fila con args "p_items jsonb".
--
-- 2. Smoke test happy path (reemplazar UUIDs por productos reales
--    con stock_actual >= 1 antes de correr):
--    BEGIN;
--      SELECT descontar_stock_validado('[
--        {"producto_id":"<uuid-real>","cantidad":1}
--      ]'::jsonb);
--      -- Verificá que stock_actual bajó en 1.
--    ROLLBACK;  -- no comitee el smoke test
--
-- 3. Smoke test rechazo:
--    BEGIN;
--      SELECT descontar_stock_validado('[
--        {"producto_id":"<uuid-real>","cantidad":99999}
--      ]'::jsonb);
--      -- Debe fallar con SQLSTATE P0001, MESSAGE 'stock_insuficiente'
--      -- y DETAIL con producto_id/nombre/disponible/pedido.
--    ROLLBACK;
