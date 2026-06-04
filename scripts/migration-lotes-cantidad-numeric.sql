-- ═══════════════════════════════════════════════════════════════════
-- Migración: lotes.cantidad de INTEGER a NUMERIC
-- ═══════════════════════════════════════════════════════════════════
--
-- Contexto del bug detectado durante la reconciliación de drift:
--   El producto "Jamón Cocido 42 de los calvos" tiene stock_actual
--   1.75 (venta por peso, 250g restantes) y sum_lotes = 2. El UPDATE
--   `SET cantidad = cantidad - 0.25` no podía dejar el lote en 1.75
--   porque PostgreSQL redondea silenciosamente al castear 1.75 a
--   INTEGER → quedaba en 2 (o 1, según modo de redondeo).
--
-- Causa raíz schema:
--   supabase-schema.sql (con el que se creó prod):
--     cantidad INTEGER DEFAULT 0
--   scripts/landing-staging-bootstrap.sql (más nuevo):
--     cantidad NUMERIC NOT NULL DEFAULT 0
--   productos.stock_actual ya fue migrado a NUMERIC en prod en algún
--   momento (por eso 1.75 funciona ahí). Lotes.cantidad nunca pasó
--   por esa migración. Esta corrige.
--
-- Estrategia:
--   ALTER COLUMN ... TYPE NUMERIC USING cantidad::numeric.
--   Es safe: PostgreSQL convierte INTEGER → NUMERIC sin pérdida
--   (NUMERIC es superset exacto). Toda fila existente queda con el
--   mismo valor numérico (5 INT = 5.0 NUMERIC).
--
-- Idempotente: guard de tipo previo. Si ya es NUMERIC, salta el
-- ALTER y emite NOTICE.
--
-- NO TOCA NADA MÁS:
--   - Las RPCs nuevas (descontar_stock_validado, restituir_stock,
--     agregar_lote_atomico, eliminar_lote_atomico) usan NUMERIC en
--     todas sus variables internas. Ya soportan decimales — solo
--     estaban bloqueadas por la columna.
--   - types/database.ts ya tiene cantidad: number (sirve para
--     INTEGER y NUMERIC).
--   - lib/supabase/stock.ts no necesita cambios — los valores ya
--     entran como Number(...).
--
-- Aplicar:
--   Pegar en Supabase SQL Editor → Run.
--   Después de esto, re-ejecutar el SQL de reconciliación del
--   "Jamón Cocido" para llevarlo a SUM(lotes) = 1.75.

BEGIN;

-- ───── ALTER COLUMN con guard de tipo previo ────────────────────────

DO $$
DECLARE
  v_tipo_actual text;
BEGIN
  SELECT data_type INTO v_tipo_actual
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'lotes'
     AND column_name = 'cantidad';

  IF v_tipo_actual = 'numeric' THEN
    RAISE NOTICE 'lotes.cantidad ya es NUMERIC. Nada que migrar.';
  ELSIF v_tipo_actual = 'integer' THEN
    -- USING cantidad::numeric es la conversión explícita. Sin esto,
    -- PG pide que digamos cómo castear (aunque INT → NUMERIC es
    -- trivial, el ALTER lo requiere para evitar ambigüedad).
    ALTER TABLE lotes
      ALTER COLUMN cantidad TYPE NUMERIC USING cantidad::numeric;
    RAISE NOTICE 'lotes.cantidad migrada de INTEGER a NUMERIC.';
  ELSE
    -- Tipo inesperado (smallint, bigint, real, double precision, etc.).
    -- Mejor abortar que asumir.
    RAISE EXCEPTION
      'Tipo inesperado para lotes.cantidad: %. Revisar a mano.',
      v_tipo_actual;
  END IF;
END $$;

-- ───── Normalizar default y NOT NULL ────────────────────────────────
-- supabase-schema.sql original tenía DEFAULT 0 sin NOT NULL.
-- bootstrap.sql tiene NUMERIC NOT NULL DEFAULT 0.
-- Dejamos el estado canónico del bootstrap.

ALTER TABLE lotes
  ALTER COLUMN cantidad SET DEFAULT 0;

-- SET NOT NULL falla si hay filas con cantidad NULL. Las hay
-- raramente, pero por las dudas las defaulteamos a 0 antes.
UPDATE lotes SET cantidad = 0 WHERE cantidad IS NULL;

ALTER TABLE lotes
  ALTER COLUMN cantidad SET NOT NULL;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. Tipo correcto:
--    SELECT data_type, is_nullable, column_default
--      FROM information_schema.columns
--     WHERE table_name = 'lotes' AND column_name = 'cantidad';
--    Esperado:
--      data_type = 'numeric'
--      is_nullable = 'NO'
--      column_default = '0'
--
-- 2. Datos preservados (debe devolver el mismo conteo que antes):
--    SELECT count(*), SUM(cantidad) FROM lotes;
--
-- 3. Test de precisión decimal — UPDATE puntual sin commit:
--    BEGIN;
--      -- Pick un lote real cualquiera con cantidad >= 1:
--      UPDATE lotes SET cantidad = cantidad - 0.25
--        WHERE id = (SELECT id FROM lotes WHERE cantidad >= 1 LIMIT 1)
--        RETURNING id, cantidad;
--      -- La cantidad devuelta debe terminar en .75 (no redondear a entero).
--    ROLLBACK;
--
-- Siguiente paso:
--   Re-ejecutar el DO block de reconciliación del producto
--   90f8a53e-a1ec-480d-8553-3b5e817d13fb (Jamón Cocido). Ahora sí
--   va a dejar SUM(lotes) = 1.75 exacto.
