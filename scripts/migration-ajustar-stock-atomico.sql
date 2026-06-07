-- ═══════════════════════════════════════════════════════════════════
-- RPC ajustar_stock_atomico — ajuste manual de stock con historial
-- ═══════════════════════════════════════════════════════════════════
--
-- Cierra el último entry point que rompía el invariante stock_actual
-- == SUM(lotes): la función ajustarStock() del cliente hacía UPDATE
-- directo de productos.stock_actual, lo que en productos con lotes
-- generaba drift negativo (caso reportado del jamón en producción).
--
-- Esta RPC:
--   1. Lockea el producto (FOR UPDATE).
--   2. Si el producto tiene lotes → RAISE 'usa_lotes'.
--      Defensa server-side: la UI no debería llegar acá (commit 4
--      bloquea el botón), pero si por alguna razón pasa, fallamos
--      visible en lugar de drift silencioso.
--   3. Si NO tiene lotes (modo legacy) → UPDATE stock_actual al
--      valor nuevo. Insert en movimientos_stock con tipo
--      'ajuste_manual' para historial.
--
-- Tipo del movimiento: 'ajuste_manual'. La tabla movimientos_stock
-- no tiene CHECK sobre tipo — se puede usar libre. Un futuro sprint
-- puede agregar pantalla de historial que consuma esta data.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION.

BEGIN;

CREATE OR REPLACE FUNCTION ajustar_stock_atomico(
  p_producto_id    uuid,
  p_cantidad_nueva numeric,
  p_motivo         text DEFAULT 'Ajuste manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_comercio_id    uuid;
  v_stock_anterior numeric;
  v_sum_lotes      numeric;
  v_delta          numeric;
BEGIN
  -- 1. Validación de cantidad. NULL o negativa = no aceptamos.
  --    Cero sí es valor válido (vaciar stock de un producto sin lotes).
  IF p_cantidad_nueva IS NULL OR p_cantidad_nueva < 0 THEN
    RAISE EXCEPTION 'cantidad_invalida'
      USING DETAIL = jsonb_build_object('cantidad', p_cantidad_nueva)::text;
  END IF;

  -- 2. Lock producto + obtener stock anterior + comercio.
  SELECT stock_actual, comercio_id
    INTO v_stock_anterior, v_comercio_id
    FROM productos
   WHERE id = p_producto_id
   FOR UPDATE;

  IF v_stock_anterior IS NULL THEN
    RAISE EXCEPTION 'producto_no_encontrado'
      USING DETAIL = jsonb_build_object('producto_id', p_producto_id)::text;
  END IF;

  -- 3. Guard: si el producto tiene lotes, este ajuste rompería el
  --    invariante SUM(lotes) == stock_actual. La UI debe usar el
  --    flujo lote-aware (agregar_lote_atomico / eliminar_lote_atomico).
  SELECT COALESCE(SUM(cantidad), 0) INTO v_sum_lotes
    FROM lotes WHERE producto_id = p_producto_id;

  IF v_sum_lotes > 0 THEN
    RAISE EXCEPTION 'usa_lotes'
      USING DETAIL = jsonb_build_object(
        'producto_id', p_producto_id,
        'sum_lotes',   v_sum_lotes,
        'hint',        'Este producto tiene lotes. Ajustá stock agregando o eliminando lotes.'
      )::text;
  END IF;

  -- 4. Aplicar el cambio.
  v_delta := p_cantidad_nueva - v_stock_anterior;

  IF v_delta = 0 THEN
    -- No-op: ya estaba en el valor pedido. No registramos movimiento
    -- ni tocamos updated_at para no ensuciar el historial.
    RETURN;
  END IF;

  UPDATE productos
     SET stock_actual = p_cantidad_nueva,
         updated_at   = now()
   WHERE id = p_producto_id;

  -- 5. Historial — movimientos_stock.
  -- tipo='ajuste_manual'. cantidad guarda el DELTA (positivo si
  -- aumentó, negativo si bajó). Esto permite reconstruir el
  -- historial sin tener que cruzar con valores intermedios.
  INSERT INTO movimientos_stock (
    comercio_id, producto_id, tipo, cantidad, motivo
  ) VALUES (
    v_comercio_id, p_producto_id, 'ajuste_manual', v_delta, p_motivo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ajustar_stock_atomico(uuid, numeric, text) TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. Función creada:
--    SELECT proname FROM pg_proc WHERE proname = 'ajustar_stock_atomico';
--    → 1 fila.
--
-- 2. Smoke test producto SIN lotes (modo legacy):
--    BEGIN;
--      -- Pickear un producto sin lotes con stock_actual conocido:
--      SELECT id, stock_actual FROM productos
--      WHERE NOT EXISTS (SELECT 1 FROM lotes WHERE producto_id = productos.id)
--      LIMIT 1;
--      -- Llamar la RPC con stock_actual + 5:
--      SELECT ajustar_stock_atomico('<uuid>', <stock_actual + 5>::numeric, 'Test V2');
--      -- Verificar:
--      SELECT stock_actual FROM productos WHERE id = '<uuid>';
--      -- → stock_actual + 5
--      SELECT tipo, cantidad, motivo FROM movimientos_stock
--      WHERE producto_id = '<uuid>' ORDER BY created_at DESC LIMIT 1;
--      -- → ajuste_manual, +5, 'Test V2'
--    ROLLBACK;
--
-- 3. Smoke test producto CON lotes (debe RAISE):
--    BEGIN;
--      SELECT id FROM productos
--      WHERE EXISTS (SELECT 1 FROM lotes WHERE producto_id = productos.id)
--      LIMIT 1;
--      SELECT ajustar_stock_atomico('<uuid>', 999, 'Test V2');
--      -- → ERROR: usa_lotes con DETAIL { producto_id, sum_lotes, hint }
--    ROLLBACK;
