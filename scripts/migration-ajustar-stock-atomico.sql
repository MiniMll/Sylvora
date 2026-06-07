-- ═══════════════════════════════════════════════════════════════════
-- RPC ajustar_stock_atomico — ajuste manual de stock (V2)
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
--      valor nuevo.
--
-- ───── Historial — POSPUESTO A V3 ───────────────────────────────────
-- La primera versión de esta migración intentaba INSERT en
-- movimientos_stock con columnas (cantidad, motivo), pero ese es el
-- schema del bootstrap landing/staging. Prod fue creado desde
-- supabase-schema.sql que usa otro shape:
--   cantidad_anterior INTEGER, cantidad_cambio INTEGER,
--   cantidad_nueva INTEGER, notas TEXT
-- + INTEGER no acepta decimales para productos por peso.
--
-- Para no atrasar el fix de integridad (que es el objetivo del
-- sprint), removemos el INSERT al historial. Se acumulará como
-- deuda técnica para un sprint V3 que:
--   1. Decida un schema canónico de movimientos_stock (con
--      cantidad NUMERIC en lugar de INTEGER).
--   2. Migre prod a ese schema.
--   3. Re-agregue el INSERT en esta RPC.
--   4. Diseñe la pantalla de consulta del historial.
--
-- Mientras tanto: el ajuste manual de stock funciona y bloquea
-- productos con lotes. No queda auditoría de quién/cuándo ajustó.
-- Aceptable para V2 — el bug que el dueño reportó queda cerrado.
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

  -- 2. Lock producto + obtener stock anterior.
  SELECT stock_actual
    INTO v_stock_anterior
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
    -- No-op: ya estaba en el valor pedido. Nada que hacer.
    RETURN;
  END IF;

  UPDATE productos
     SET stock_actual = p_cantidad_nueva,
         updated_at   = now()
   WHERE id = p_producto_id;

  -- 5. (Historial movimientos_stock — POSPUESTO V3, ver header).
  --    p_motivo se acepta y se ignora por ahora para no romper el
  --    contrato del cliente (lib/supabase/productos.ts.ajustarStock
  --    ya lo pasa). Cuando volvamos a habilitar el INSERT, lo
  --    aprovechamos sin cambiar el cliente.
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
--        AND activo = true
--      LIMIT 1;
--      -- Llamar la RPC con stock_actual + 5:
--      SELECT ajustar_stock_atomico('<uuid>', <stock_actual + 5>::numeric, 'Test V2');
--      -- Verificar:
--      SELECT stock_actual FROM productos WHERE id = '<uuid>';
--      -- → stock_actual + 5
--    ROLLBACK;
--
-- 3. Smoke test producto CON lotes (debe RAISE):
--    BEGIN;
--      SELECT id FROM productos
--      WHERE EXISTS (SELECT 1 FROM lotes WHERE producto_id = productos.id)
--        AND activo = true
--      LIMIT 1;
--      SELECT ajustar_stock_atomico('<uuid>', 999, 'Test V2');
--      -- → ERROR: usa_lotes con DETAIL { producto_id, sum_lotes, hint }
--    ROLLBACK;
--
-- NOTA: el INSERT a movimientos_stock está pospuesto a V3 (ver header).
-- Si re-corrés el smoke test 2, no aparecerá fila en movimientos_stock —
-- esperado.
