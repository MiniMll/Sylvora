-- ═══════════════════════════════════════════════════════════════════
-- Integridad de lotes — FIFO atómico + reconciliación de drift histórico
-- ═══════════════════════════════════════════════════════════════════
--
-- Fix del bug donde productos.stock_actual se descontaba en ventas
-- pero lotes.cantidad no. Estrategia aprobada (B1):
--   - productos.stock_actual sigue siendo el master numérico.
--   - lotes se mantienen atómicamente sincronizados via RPCs.
--   - Productos sin lotes siguen funcionando en "modo legacy"
--     (compatible con importador / demo / alta manual).
--   - FIFO al vender: vencimiento ASC NULLS LAST → ingreso ASC → id.
--   - Auto-backfill al primer lote (caso "producto venía con stock
--     sin lotes y ahora se agrega el primer lote real").
--
-- Pre-migración: scripts/audit-lotes-drift.sql confirmó:
--   - 10 productos con drift positivo (sum_lotes > stock_actual)
--   - 0 con drift negativo
--   - drift total ~134 unidades, máximo 30 en una sola fila
--   - decisión: confiar en stock_actual y achicar los lotes FIFO-inverso
--
-- Orden de operaciones en esta migración:
--   PASO 0 → reconciliar el drift histórico (DDL safe: solo UPDATEs
--            sobre lotes existentes, ningún DELETE).
--   PASO 1 → índice FIFO para que la nueva RPC no haga seq-scan.
--   PASO 2 → reescritura de descontar_stock_validado (lotes-aware).
--   PASO 3 → reescritura de restituir_stock (lotes-aware).
--   PASO 4 → nueva agregar_lote_atomico (con auto-backfill).
--   PASO 5 → nueva eliminar_lote_atomico.
--
-- IDEMPOTENTE: re-runnable. Las RPCs usan CREATE OR REPLACE. La
-- reconciliación del paso 0 es no-op en corridas posteriores (porque
-- no hay drift restante después de la primera).
--
-- Aplicar:
--   psql $DATABASE_URL -f scripts/migration-lotes-integrity.sql
--   o pegar todo en Supabase SQL Editor → Run.
--
-- ESTE SCRIPT NO TOCA CÓDIGO DEL CLIENTE. El commit siguiente
-- migra lib/supabase/stock.ts para usar las nuevas RPCs.

BEGIN;


-- ═══════════════════════════════════════════════════════════════════
-- PASO 0 — Reconciliación FIFO-inverso del drift histórico
-- ═══════════════════════════════════════════════════════════════════
-- Para cada producto con sum_lotes > stock_actual, achicar los lotes
-- en orden FIFO (más viejo primero = el que se "habría vendido primero"
-- por el bug). Si un lote queda en 0, NO lo borramos — mantenemos
-- histórico para futuras anulaciones.
--
-- Emite RAISE NOTICE con conteo afectado para auditoría manual.

DO $$
DECLARE
  v_prod          RECORD;
  v_lote          RECORD;
  v_a_quitar      numeric;
  v_quitar_este   numeric;
  v_productos_afectados integer := 0;
  v_unidades_total numeric := 0;
BEGIN
  FOR v_prod IN
    SELECT p.id, p.nombre, p.stock_actual,
           (SELECT COALESCE(SUM(cantidad), 0) FROM lotes WHERE producto_id = p.id) AS sum_lotes
    FROM productos p
    WHERE EXISTS (SELECT 1 FROM lotes WHERE producto_id = p.id)
      AND (SELECT COALESCE(SUM(cantidad), 0) FROM lotes WHERE producto_id = p.id) > p.stock_actual
  LOOP
    v_a_quitar := v_prod.sum_lotes - v_prod.stock_actual;
    v_unidades_total := v_unidades_total + v_a_quitar;
    v_productos_afectados := v_productos_afectados + 1;

    -- Iterar lotes en orden FIFO (más-viejo-primero). Skip los que
    -- ya están en 0 — no aportan al ajuste.
    FOR v_lote IN
      SELECT id, cantidad
      FROM lotes
      WHERE producto_id = v_prod.id
        AND cantidad > 0
      ORDER BY fecha_vencimiento ASC NULLS LAST,
               fecha_ingreso     ASC,
               id                ASC
    LOOP
      EXIT WHEN v_a_quitar <= 0;
      v_quitar_este := LEAST(v_lote.cantidad, v_a_quitar);
      UPDATE lotes
         SET cantidad = cantidad - v_quitar_este
       WHERE id = v_lote.id;
      v_a_quitar := v_a_quitar - v_quitar_este;
    END LOOP;

    -- Sanity: si quedó algo por quitar significa que sum_lotes
    -- declarado y la suma real divergen — bug de concurrencia o algo
    -- raro. Mejor abortar la migración para investigar.
    IF v_a_quitar > 0 THEN
      RAISE EXCEPTION
        'Reconciliación incompleta para producto % (id=%): quedan % unidades por reducir',
        v_prod.nombre, v_prod.id, v_a_quitar;
    END IF;
  END LOOP;

  RAISE NOTICE
    'Reconciliación PASO 0 completada: % productos ajustados, % unidades retiradas de lotes en total.',
    v_productos_afectados, v_unidades_total;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- PASO 1 — Índice FIFO sobre lotes
-- ═══════════════════════════════════════════════════════════════════
-- La nueva RPC de venta itera lotes por producto_id en orden FIFO en
-- cada item. Sin índice, eso es seq-scan + sort por cada venta → mal.
-- IF NOT EXISTS para que la migración sea re-runnable.

CREATE INDEX IF NOT EXISTS idx_lotes_fifo
  ON lotes (producto_id, fecha_vencimiento NULLS LAST, fecha_ingreso, id);


-- ═══════════════════════════════════════════════════════════════════
-- PASO 2 — descontar_stock_validado: FIFO sobre lotes + modo legacy
-- ═══════════════════════════════════════════════════════════════════
-- Reemplaza la versión del sprint stock-integrity. Misma firma —
-- ningún caller del cliente cambia. Internamente:
--
--   Si SUM(lotes) > 0 para el producto:
--     - Iterar lotes FIFO, decrementar cada uno hasta cubrir.
--     - Decrementar productos.stock_actual por el total.
--     - Assert al final: SUM(lotes) == stock_actual.
--   Sino (modo legacy, producto sin lotes):
--     - Solo decrementar productos.stock_actual (comportamiento previo).
--
-- Validaciones (cantidad inválida, producto no encontrado, stock
-- insuficiente) preservadas con los mismos códigos de error y DETAIL
-- en JSON — el cliente (esErrorStockInsuficiente) sigue funcionando
-- sin cambios.

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
  -- 1. Lock pesimista de todos los productos del payload, ordenados
  --    por id (evita deadlocks entre cajeros concurrentes).
  PERFORM 1 FROM productos
  WHERE id IN (
    SELECT (elem->>'producto_id')::uuid
    FROM jsonb_array_elements(p_items) elem
  )
  ORDER BY id
  FOR UPDATE;

  -- 2. Validar TODO antes de mutar nada.
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

    IF v_stock_actual IS NULL THEN
      RAISE EXCEPTION 'producto_no_encontrado'
        USING DETAIL = jsonb_build_object('producto_id', v_producto_id)::text;
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

  -- 3. Descontar para cada item. Decisión legacy vs lotes per-item.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad    := (v_item->>'cantidad')::numeric;

    SELECT COALESCE(SUM(cantidad), 0)
      INTO v_sum_lotes
      FROM lotes
     WHERE producto_id = v_producto_id;

    IF v_sum_lotes > 0 THEN
      -- Modo lotes: iterar FIFO y descontar.
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
        UPDATE lotes
           SET cantidad = cantidad - v_descontar_este
         WHERE id = v_lote.id;
        v_a_descontar := v_a_descontar - v_descontar_este;
      END LOOP;

      -- Si quedó cantidad sin descontar: SUM(lotes) declarado mintió.
      -- Indica drift/race — abortar.
      IF v_a_descontar > 0 THEN
        RAISE EXCEPTION
          'drift_lotes: producto % reportaba SUM(lotes)=%, pero solo % unidades disponibles para descontar',
          v_producto_id, v_sum_lotes, v_cantidad - v_a_descontar;
      END IF;
    END IF;

    -- 4. Descontar productos.stock_actual (ambos modos).
    UPDATE productos
       SET stock_actual = stock_actual - v_cantidad
     WHERE id = v_producto_id;

    -- 5. Assert invariante para productos con lotes.
    SELECT COALESCE(SUM(cantidad), 0)
      INTO v_sum_lotes
      FROM lotes
     WHERE producto_id = v_producto_id;
    SELECT stock_actual
      INTO v_stock_actual
      FROM productos
     WHERE id = v_producto_id;

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


-- ═══════════════════════════════════════════════════════════════════
-- PASO 3 — restituir_stock: agrega al lote más viejo (FIFO inverso)
-- ═══════════════════════════════════════════════════════════════════
-- Misma firma que antes — anularVenta() no cambia. Comportamiento:
--   Si el producto tiene lotes → agrega la cantidad al lote más viejo
--      existente (el primero que la RPC de venta habría consumido).
--      Si todos los lotes fueron borrados después de la venta original
--      (caso raro), crea un nuevo lote 'L-RESTITUIDO' con la cantidad.
--   Sino → solo incrementa productos.stock_actual (modo legacy).
--
-- Trade-off documentado: sin items_venta.lote_id no podemos restaurar
-- al lote EXACTO que se vendió. Para B1 esto es suficiente: el SUM
-- vuelve a estar bien, FIFO posterior funciona, vencimientos quedan
-- aceptablemente cerca del real (el más viejo es lo que se vendería
-- primero ahora también). B2 con trazabilidad item↔lote vendría
-- después si el dueño lo necesita.

CREATE OR REPLACE FUNCTION restituir_stock(
  p_producto_id uuid,
  p_cantidad    numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_nuevo_stock   numeric;
  v_lote_viejo_id uuid;
  v_tiene_lotes   boolean;
  v_sum_lotes     numeric;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    -- No tiene sentido restituir 0/negativo. Devolvemos el stock
    -- actual sin tocar nada.
    SELECT stock_actual INTO v_nuevo_stock FROM productos WHERE id = p_producto_id;
    RETURN v_nuevo_stock;
  END IF;

  -- Lock producto.
  PERFORM 1 FROM productos WHERE id = p_producto_id FOR UPDATE;

  -- ¿Tiene lotes? (Incluye los que estén en 0 — se pueden re-llenar.)
  SELECT EXISTS (SELECT 1 FROM lotes WHERE producto_id = p_producto_id)
    INTO v_tiene_lotes;

  IF v_tiene_lotes THEN
    -- Lote más viejo (FIFO). Si hay alguno en 0 lo reusamos también.
    SELECT id INTO v_lote_viejo_id
      FROM lotes
     WHERE producto_id = p_producto_id
     ORDER BY fecha_vencimiento ASC NULLS LAST,
              fecha_ingreso     ASC,
              id                ASC
     LIMIT 1;

    IF v_lote_viejo_id IS NOT NULL THEN
      UPDATE lotes SET cantidad = cantidad + p_cantidad WHERE id = v_lote_viejo_id;
    ELSE
      -- Defensivo: tiene_lotes era true pero no apareció ninguno
      -- (race con DELETE concurrent). Crear "L-RESTITUIDO".
      INSERT INTO lotes (producto_id, numero_lote, cantidad, fecha_ingreso)
        VALUES (p_producto_id, 'L-RESTITUIDO', p_cantidad, now());
    END IF;
  END IF;

  -- Incrementar productos.stock_actual en cualquier modo.
  UPDATE productos
     SET stock_actual = stock_actual + p_cantidad
   WHERE id = p_producto_id
   RETURNING stock_actual INTO v_nuevo_stock;

  -- Assert invariante para productos con lotes.
  IF v_tiene_lotes THEN
    SELECT COALESCE(SUM(cantidad), 0) INTO v_sum_lotes
      FROM lotes WHERE producto_id = p_producto_id;
    IF v_sum_lotes <> v_nuevo_stock THEN
      RAISE EXCEPTION
        'invariante_violada: tras restituir, producto % tiene SUM(lotes)=% y stock_actual=%',
        p_producto_id, v_sum_lotes, v_nuevo_stock;
    END IF;
  END IF;

  RETURN v_nuevo_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION restituir_stock(uuid, numeric) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- PASO 4 — agregar_lote_atomico (con auto-backfill legacy)
-- ═══════════════════════════════════════════════════════════════════
-- Reemplaza la lógica no-atómica de lib/supabase/stock.ts.agregarLote
-- (dos UPDATEs sueltos). En una sola transacción:
--
--   1. Si el producto venía en "modo legacy" (stock_actual > 0 sin
--      lotes), crear un lote sintético "L-INICIAL" con la cantidad
--      pre-existente, fecha_ingreso = producto.created_at, sin
--      vencimiento. Esto convierte al producto a "modo lotes"
--      manteniendo el SUM correcto.
--   2. Si ya existe un lote con (numero_lote, fecha_vencimiento)
--      iguales → mergear: incrementar su cantidad.
--   3. Sino → insertar un lote nuevo.
--   4. Incrementar productos.stock_actual por la cantidad del lote
--      nuevo (NO por el backfill — eso ya está reflejado).
--   5. Assert SUM(lotes) == stock_actual al final.
--
-- p_fecha_vencimiento puede ser NULL para productos no perecederos.

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

  -- Lock producto.
  SELECT stock_actual, created_at
    INTO v_stock_actual, v_producto_creado
    FROM productos
   WHERE id = p_producto_id
   FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'producto_no_encontrado'
      USING DETAIL = jsonb_build_object('producto_id', p_producto_id)::text;
  END IF;

  -- 1. Auto-backfill si veníamos en modo legacy con stock > 0.
  SELECT COALESCE(SUM(cantidad), 0)
    INTO v_sum_lotes
    FROM lotes
   WHERE producto_id = p_producto_id;

  IF v_sum_lotes = 0 AND v_stock_actual > 0 THEN
    INSERT INTO lotes (producto_id, numero_lote, cantidad, fecha_vencimiento, fecha_ingreso)
      VALUES (p_producto_id, 'L-INICIAL', v_stock_actual, NULL, v_producto_creado);
    -- NO incrementamos stock_actual — esas unidades ya estaban contadas.
  END IF;

  -- 2. ¿Existe lote (numero_lote, fecha_vencimiento) idéntico?
  --    fecha_vencimiento NULL se trata como su propia clase (dos lotes
  --    sin fecha y mismo numero SÍ fusionan).
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
    -- 3a. Merge.
    UPDATE lotes
       SET cantidad = cantidad + p_cantidad
     WHERE id = v_lote_existente;
    v_lote_id := v_lote_existente;
  ELSE
    -- 3b. Insert nuevo.
    INSERT INTO lotes (producto_id, numero_lote, cantidad, fecha_vencimiento)
      VALUES (p_producto_id, p_numero_lote, p_cantidad, p_fecha_vencimiento)
      RETURNING id INTO v_lote_id;
  END IF;

  -- 4. Incrementar stock_actual por la cantidad nueva.
  UPDATE productos
     SET stock_actual = stock_actual + p_cantidad
   WHERE id = p_producto_id;

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


-- ═══════════════════════════════════════════════════════════════════
-- PASO 5 — eliminar_lote_atomico
-- ═══════════════════════════════════════════════════════════════════
-- DELETE del lote + UPDATE de productos.stock_actual en una sola
-- transacción. Reemplaza la lógica no-atómica de lib/supabase/
-- stock.ts.eliminarLote.

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
  -- Lock lote y obtener cantidad + producto.
  SELECT producto_id, cantidad
    INTO v_producto_id, v_cantidad
    FROM lotes
   WHERE id = p_lote_id
   FOR UPDATE;

  IF v_producto_id IS NULL THEN
    RAISE EXCEPTION 'lote_no_encontrado'
      USING DETAIL = jsonb_build_object('lote_id', p_lote_id)::text;
  END IF;

  -- Lock producto.
  PERFORM 1 FROM productos WHERE id = v_producto_id FOR UPDATE;

  -- DELETE lote.
  DELETE FROM lotes WHERE id = p_lote_id;

  -- UPDATE productos.stock_actual. Math.max(0, ...) defensivo por si
  -- el lote tenía cantidad > stock_actual (no debería pasar).
  UPDATE productos
     SET stock_actual = GREATEST(0, stock_actual - v_cantidad)
   WHERE id = v_producto_id;

  -- Assert invariante para productos que SIGUEN teniendo lotes
  -- después del delete.
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
-- 1. Funciones presentes:
--    SELECT proname FROM pg_proc
--    WHERE proname IN (
--      'descontar_stock_validado',
--      'restituir_stock',
--      'agregar_lote_atomico',
--      'eliminar_lote_atomico'
--    );
--    → 4 filas.
--
-- 2. Drift histórico saneado (debe devolver 0):
--    SELECT count(*)
--    FROM productos p
--    WHERE EXISTS (SELECT 1 FROM lotes WHERE producto_id = p.id)
--      AND p.stock_actual <> (
--        SELECT COALESCE(SUM(cantidad), 0) FROM lotes WHERE producto_id = p.id
--      );
--    → 0
--
-- 3. Índice creado:
--    SELECT indexname FROM pg_indexes
--    WHERE indexname = 'idx_lotes_fifo';
--    → 1 fila.
--
-- 4. Smoke test FIFO (sustituir UUIDs por valores reales):
--    BEGIN;
--      -- Producto con lotes — ver SUM y stock antes:
--      SELECT stock_actual,
--             (SELECT SUM(cantidad) FROM lotes WHERE producto_id = '<uuid>') AS sum_lotes
--        FROM productos WHERE id = '<uuid>';
--
--      SELECT descontar_stock_validado('[{"producto_id":"<uuid>","cantidad":1}]'::jsonb);
--
--      -- Después: SUM debe haber bajado en 1, stock también.
--      SELECT stock_actual,
--             (SELECT SUM(cantidad) FROM lotes WHERE producto_id = '<uuid>') AS sum_lotes
--        FROM productos WHERE id = '<uuid>';
--    ROLLBACK;
--
-- 5. Smoke test producto legacy (sin lotes — debe comportarse igual
--    que antes):
--    BEGIN;
--      SELECT descontar_stock_validado('[{"producto_id":"<uuid_legacy>","cantidad":1}]'::jsonb);
--      -- Solo stock_actual baja; lotes sigue vacío.
--    ROLLBACK;
