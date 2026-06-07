-- ═══════════════════════════════════════════════════════════════════
-- Cleanup de lotes en cero — one-off + permanente
-- ═══════════════════════════════════════════════════════════════════
--
-- Audit del commit 1 confirmó:
--   - drift_negativo = 0 → no hace falta reconciliación L-AJUSTE.
--   - drift_positivo = 0 → el fix v1 sigue intacto.
--   - lotes en cero = N → ruido visual que ensucia /productos y
--     pantallas que listan lotes.
--
-- Este commit cierra DOS cosas:
--
-- A) One-off: borrar los lotes en cantidad=0 que ya existen en prod.
--    Mientras no haya trazabilidad item↔lote (B2 futuro), un lote
--    en 0 no aporta nada — solo ensucia la UI. Estaba documentado
--    en el v1 que no los borrábamos preventivamente; ahora lo hacemos.
--
-- B) Permanente: las 3 RPCs que mutan lotes (descontar_stock_validado,
--    agregar_lote_atomico, eliminar_lote_atomico) ejecutan un DELETE
--    de lotes en 0 antes del assert del invariante. El assert
--    SUM(lotes) == stock_actual sigue funcionando porque las filas
--    borradas tenían cantidad=0 (no contribuyen al SUM).
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION + DELETE filtrado por
-- cantidad=0 (la segunda corrida elimina 0 filas si la primera ya
-- limpió todo).
--
-- IMPACTO en lo existente:
--   - Cero pérdida funcional. Los lotes en 0 ya estaban "consumidos"
--     desde el punto de vista del comerciante.
--   - Si el comerciante tenía esos lotes visibles en la UI por algún
--     motivo (informativo), al refrescar van a desaparecer. Esperado.
--
-- Aplicar:
--   Pegar todo en Supabase SQL Editor → Run.

BEGIN;


-- ═══════════════════════════════════════════════════════════════════
-- A. One-off — borrar lotes en cero existentes
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_borrados integer;
BEGIN
  WITH borrados AS (
    DELETE FROM lotes WHERE cantidad = 0 RETURNING 1
  )
  SELECT count(*) INTO v_borrados FROM borrados;
  RAISE NOTICE 'Cleanup one-off: % lote(s) en cero borrado(s).', v_borrados;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- B. Permanente — cleanup dentro de las RPCs lote-aware
-- ═══════════════════════════════════════════════════════════════════
-- Reescribimos las 3 RPCs agregando DELETE FROM lotes WHERE
-- cantidad = 0 AND producto_id = X justo antes del assert del
-- invariante. El assert sigue verificando SUM(lotes) == stock_actual,
-- y las filas borradas tenían 0 (no afectan).
--
-- Mantenemos la firma de las 3 funciones → callers no cambian.


-- ─── B.1. descontar_stock_validado ─────────────────────────────────
-- FIFO de lotes + decremento de stock_actual.
-- Nuevo: tras decrementar lotes, borrar los que quedaron en 0.

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
  v_sum_lotes       numeric;
  v_nombre          text;
  v_lote            RECORD;
  v_a_descontar     numeric;
  v_descontar_este  numeric;
BEGIN
  -- 1. Lock pesimista.
  PERFORM 1 FROM productos
  WHERE id IN (
    SELECT (elem->>'producto_id')::uuid
    FROM jsonb_array_elements(p_items) elem
  )
  ORDER BY id
  FOR UPDATE;

  -- 2. Validar TODO antes de mutar.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad    := (v_item->>'cantidad')::numeric;

    IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
      RAISE EXCEPTION 'cantidad_invalida'
        USING DETAIL = jsonb_build_object('producto_id', v_producto_id, 'cantidad', v_cantidad)::text;
    END IF;

    SELECT stock_actual, nombre INTO v_stock_actual, v_nombre
      FROM productos WHERE id = v_producto_id;

    IF v_stock_actual IS NULL THEN
      RAISE EXCEPTION 'producto_no_encontrado'
        USING DETAIL = jsonb_build_object('producto_id', v_producto_id)::text;
    END IF;

    IF v_stock_actual < v_cantidad THEN
      RAISE EXCEPTION 'stock_insuficiente'
        USING DETAIL = jsonb_build_object(
          'producto_id', v_producto_id, 'nombre', v_nombre,
          'disponible', v_stock_actual, 'pedido', v_cantidad
        )::text;
    END IF;
  END LOOP;

  -- 3. Descontar para cada item.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad    := (v_item->>'cantidad')::numeric;

    SELECT COALESCE(SUM(cantidad), 0) INTO v_sum_lotes
      FROM lotes WHERE producto_id = v_producto_id;

    IF v_sum_lotes > 0 THEN
      v_a_descontar := v_cantidad;
      FOR v_lote IN
        SELECT id, cantidad
          FROM lotes
         WHERE producto_id = v_producto_id
           AND cantidad > 0
         ORDER BY fecha_vencimiento ASC NULLS LAST,
                  fecha_ingreso     ASC,
                  id                ASC
      LOOP
        EXIT WHEN v_a_descontar <= 0;
        v_descontar_este := LEAST(v_lote.cantidad, v_a_descontar);
        UPDATE lotes SET cantidad = cantidad - v_descontar_este WHERE id = v_lote.id;
        v_a_descontar := v_a_descontar - v_descontar_este;
      END LOOP;

      IF v_a_descontar > 0 THEN
        RAISE EXCEPTION
          'drift_lotes: producto % reportaba SUM(lotes)=%, pero solo % unidades disponibles para descontar',
          v_producto_id, v_sum_lotes, v_cantidad - v_a_descontar;
      END IF;
    END IF;

    -- 4. Descontar stock_actual.
    UPDATE productos
       SET stock_actual = stock_actual - v_cantidad
     WHERE id = v_producto_id;

    -- 5. NUEVO V2: cleanup de lotes en cero del producto.
    --    Las filas con cantidad=0 no aportan al SUM; borrarlas es
    --    cosmético. El assert siguiente sigue verificando correctamente.
    DELETE FROM lotes
     WHERE producto_id = v_producto_id
       AND cantidad = 0;

    -- 6. Assert invariante para productos con lotes.
    SELECT COALESCE(SUM(cantidad), 0) INTO v_sum_lotes
      FROM lotes WHERE producto_id = v_producto_id;
    SELECT stock_actual INTO v_stock_actual
      FROM productos WHERE id = v_producto_id;

    IF EXISTS (SELECT 1 FROM lotes WHERE producto_id = v_producto_id)
       AND v_sum_lotes <> v_stock_actual THEN
      RAISE EXCEPTION
        'invariante_violada: producto % tiene SUM(lotes)=% y stock_actual=% tras descuento',
        v_producto_id, v_sum_lotes, v_stock_actual;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION descontar_stock_validado(jsonb) TO authenticated;


-- ─── B.2. agregar_lote_atomico ────────────────────────────────────
-- Backfill legacy "L-INICIAL" + merge/insert + stock_actual.
-- Nuevo: cleanup de lotes en 0 después del UPDATE de stock.

CREATE OR REPLACE FUNCTION agregar_lote_atomico(
  p_producto_id        uuid,
  p_numero_lote        text,
  p_cantidad           numeric,
  p_fecha_vencimiento  date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_stock_actual    numeric;
  v_sum_lotes       numeric;
  v_producto_creado timestamptz;
  v_lote_existente  uuid;
  v_lote_id         uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'cantidad_invalida'
      USING DETAIL = jsonb_build_object('cantidad', p_cantidad)::text;
  END IF;

  SELECT stock_actual, created_at INTO v_stock_actual, v_producto_creado
    FROM productos WHERE id = p_producto_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'producto_no_encontrado'
      USING DETAIL = jsonb_build_object('producto_id', p_producto_id)::text;
  END IF;

  -- 1. Auto-backfill si veníamos en modo legacy.
  SELECT COALESCE(SUM(cantidad), 0) INTO v_sum_lotes
    FROM lotes WHERE producto_id = p_producto_id;

  IF v_sum_lotes = 0 AND v_stock_actual > 0 THEN
    INSERT INTO lotes (producto_id, numero_lote, cantidad, fecha_vencimiento, fecha_ingreso)
      VALUES (p_producto_id, 'L-INICIAL', v_stock_actual, NULL, v_producto_creado);
  END IF;

  -- 2. ¿Existe lote (numero, vencimiento) idéntico?
  IF p_fecha_vencimiento IS NULL THEN
    SELECT id INTO v_lote_existente
      FROM lotes
     WHERE producto_id = p_producto_id
       AND numero_lote = p_numero_lote
       AND fecha_vencimiento IS NULL
     LIMIT 1;
  ELSE
    SELECT id INTO v_lote_existente
      FROM lotes
     WHERE producto_id = p_producto_id
       AND numero_lote = p_numero_lote
       AND fecha_vencimiento = p_fecha_vencimiento
     LIMIT 1;
  END IF;

  IF v_lote_existente IS NOT NULL THEN
    UPDATE lotes SET cantidad = cantidad + p_cantidad WHERE id = v_lote_existente;
    v_lote_id := v_lote_existente;
  ELSE
    INSERT INTO lotes (producto_id, numero_lote, cantidad, fecha_vencimiento)
      VALUES (p_producto_id, p_numero_lote, p_cantidad, p_fecha_vencimiento)
      RETURNING id INTO v_lote_id;
  END IF;

  -- 3. Incrementar stock_actual.
  UPDATE productos
     SET stock_actual = stock_actual + p_cantidad
   WHERE id = p_producto_id;

  -- 4. NUEVO V2: cleanup de lotes en cero del producto. Defensivo —
  --    raramente quedarían 0s después de un INSERT/UPDATE positivo,
  --    pero podría pasar si el lote backfilleado L-INICIAL fuera 0
  --    en algún edge case (no debería, pero asegurar).
  DELETE FROM lotes
   WHERE producto_id = p_producto_id
     AND cantidad = 0;

  -- 5. Assert invariante.
  SELECT COALESCE(SUM(cantidad), 0) INTO v_sum_lotes
    FROM lotes WHERE producto_id = p_producto_id;
  SELECT stock_actual INTO v_stock_actual
    FROM productos WHERE id = p_producto_id;
  IF v_sum_lotes <> v_stock_actual THEN
    RAISE EXCEPTION
      'invariante_violada: tras agregar lote, SUM(lotes)=% pero stock_actual=%',
      v_sum_lotes, v_stock_actual;
  END IF;

  RETURN v_lote_id;
END;
$$;

GRANT EXECUTE ON FUNCTION agregar_lote_atomico(uuid, text, numeric, date) TO authenticated;


-- ─── B.3. eliminar_lote_atomico ──────────────────────────────────
-- DELETE del lote + UPDATE stock.
-- Nuevo: cleanup de lotes en cero del MISMO producto (por si quedan
-- otros 0s que aún no se habían limpiado).

CREATE OR REPLACE FUNCTION eliminar_lote_atomico(p_lote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_producto_id   uuid;
  v_cantidad      numeric;
  v_stock_actual  numeric;
  v_sum_lotes     numeric;
BEGIN
  SELECT producto_id, cantidad INTO v_producto_id, v_cantidad
    FROM lotes WHERE id = p_lote_id FOR UPDATE;

  IF v_producto_id IS NULL THEN
    RAISE EXCEPTION 'lote_no_encontrado'
      USING DETAIL = jsonb_build_object('lote_id', p_lote_id)::text;
  END IF;

  PERFORM 1 FROM productos WHERE id = v_producto_id FOR UPDATE;

  -- DELETE del lote pedido.
  DELETE FROM lotes WHERE id = p_lote_id;

  -- UPDATE stock_actual.
  UPDATE productos
     SET stock_actual = GREATEST(0, stock_actual - v_cantidad)
   WHERE id = v_producto_id;

  -- NUEVO V2: cleanup de OTROS lotes en cero del mismo producto.
  -- (El lote pedido ya fue borrado; esto barre los zombies de
  -- ediciones anteriores que aún no se hubieran limpiado.)
  DELETE FROM lotes
   WHERE producto_id = v_producto_id
     AND cantidad = 0;

  -- Assert invariante para productos que SIGUEN teniendo lotes.
  IF EXISTS (SELECT 1 FROM lotes WHERE producto_id = v_producto_id) THEN
    SELECT COALESCE(SUM(cantidad), 0) INTO v_sum_lotes
      FROM lotes WHERE producto_id = v_producto_id;
    SELECT stock_actual INTO v_stock_actual
      FROM productos WHERE id = v_producto_id;
    IF v_sum_lotes <> v_stock_actual THEN
      RAISE EXCEPTION
        'invariante_violada: tras eliminar lote, SUM(lotes)=% pero stock_actual=%',
        v_sum_lotes, v_stock_actual;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION eliminar_lote_atomico(uuid) TO authenticated;


COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. No deben quedar lotes en cero:
--    SELECT count(*) FROM lotes WHERE cantidad = 0;
--    → 0
--
-- 2. Las 3 RPCs siguen presentes (CREATE OR REPLACE las reemplazó):
--    SELECT proname FROM pg_proc
--    WHERE proname IN (
--      'descontar_stock_validado',
--      'agregar_lote_atomico',
--      'eliminar_lote_atomico'
--    );
--    → 3 filas
--
-- 3. Smoke: cobrar una venta de un producto con lotes y verificar
--    que un lote consumido al 100% desaparece de la lista (en vez
--    de aparecer con cantidad=0).
--    BEGIN;
--      SELECT descontar_stock_validado('[{"producto_id":"<X>","cantidad":N}]'::jsonb);
--      SELECT count(*) FROM lotes WHERE producto_id = '<X>' AND cantidad = 0;
--      -- → 0 (cleanup automático)
--    ROLLBACK;
--
-- 4. El audit del commit 1 debe seguir devolviendo drift_negativo = 0
--    (esta migración no introduce drift; el cleanup no rompe el
--    invariante porque las filas borradas tenían 0).
