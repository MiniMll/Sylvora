-- ═══════════════════════════════════════════════════════════════════
-- Migración: productos.categoria TEXT (desnormalizada).
-- ═══════════════════════════════════════════════════════════════════
--
-- Contexto:
--   El schema ORIGINAL (supabase-schema.sql) creó `productos` con
--   `categoria_id UUID REFERENCES categorias(id)` — categorías
--   normalizadas en tabla aparte.
--
--   La app evolucionó a "categoría = texto libre por producto"
--   (`Producto.categoria: string | null` en types/database.ts).
--   El bootstrap de landing/staging ya tiene la columna TEXT, pero
--   prod nunca se migró y todavía corre con `categoria_id`.
--
--   Hasta este sprint nadie escribía `categoria` desde el cliente
--   (el form /productos/nuevo lo tiene en el UI pero no lo envía).
--   El importador masivo es el primer escritor → revienta con
--   PGRST204: "Could not find the 'categoria' column".
--
-- Estrategia:
--   1. Agregamos `categoria TEXT` (nullable, default NULL).
--   2. NO tocamos `categoria_id` ni la tabla `categorias` — quedan
--      como columnas legacy. Si en algún momento el catálogo de
--      categorías vuelve a ser cerrado, las recuperamos. Mientras
--      tanto: lectura/escritura va por `categoria`.
--   3. Hint a PostgREST para que refresque su schema cache sin
--      tener que esperar al TTL ni reiniciar el servicio
--      (NOTIFY pgrst, 'reload schema').
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS. Se puede correr múltiples
-- veces sin efecto colateral.
--
-- Aplicar UNA VEZ por DB:
--   psql $DATABASE_URL -f scripts/migration-productos-categoria.sql
-- o desde Supabase Dashboard → SQL Editor.

BEGIN;

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Index opcional para filtros por categoría en /productos.
-- partial index excluyendo NULL → más liviano y suficiente para
-- los WHERE categoria = 'Bebidas' del frontend.
CREATE INDEX IF NOT EXISTS idx_productos_categoria
  ON productos(comercio_id, categoria)
  WHERE categoria IS NOT NULL;

COMMIT;

-- ───── Refresh del schema cache de PostgREST ────────────────────────
-- Supabase corre PostgREST con un cache de schema que se invalida
-- automáticamente al recibir esta señal. Sin esto, las queries del
-- cliente pueden seguir devolviendo PGRST204 por unos minutos
-- aunque la columna ya exista en la DB.
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'productos' AND column_name IN ('categoria', 'categoria_id');
--
-- Debe devolver 2 filas: categoria (text, YES) + categoria_id (uuid, YES).
