-- ═══════════════════════════════════════════════════════════════════
-- Recuperación RLS: regenerar funciones + TODAS las policies que
-- dependen de get_comercio_id() / get_rol().
-- ═══════════════════════════════════════════════════════════════════
--
-- Cuándo usar este script:
-- - Si por error corriste `DROP FUNCTION get_comercio_id() CASCADE` o
--   `DROP FUNCTION get_rol() CASCADE` → todas las policies dependientes
--   se borraron en silencio. Síntoma: el cliente authenticated no
--   puede leer NI SU PROPIO perfil ni el comercio, etc.
-- - Si querés "resetear" la capa RLS a un estado conocido. Es
--   idempotente, así que no rompe nada.
-- - Si copiaste un staging desde otro proyecto y faltan policies.
--
-- Qué hace:
-- 1. Recrea get_comercio_id() y get_rol() con SECURITY DEFINER +
--    search_path explícito (public, pg_temp) — buena práctica para
--    funciones que corren como owner.
-- 2. GRANT EXECUTE explícito a authenticated, anon, service_role.
--    Sin estos grants, la función falla silente dentro del eval de
--    una policy → la policy devuelve NULL → la fila se oculta.
-- 3. ALTER TABLE ... ENABLE ROW LEVEL SECURITY en las 12 tablas.
-- 4. Recrea las policies de las 12 tablas con DROP-and-recreate
--    idempotente. NO usa CASCADE.
--
-- Equivale exactamente al bloque RLS del bootstrap principal
-- (scripts/landing-staging-bootstrap.sql §6-9). Si modificás policies
-- en el bootstrap, sincronizá este archivo también.
--
-- Aplicar:
--   psql $DATABASE_URL -f scripts/migration-rls-recovery.sql
-- o Supabase Dashboard → SQL Editor → pegar entero + Run.

BEGIN;

-- ───── 1. Funciones (CREATE OR REPLACE = sin drop, sin cascade) ───
CREATE OR REPLACE FUNCTION get_comercio_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT comercio_id FROM perfiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT rol FROM perfiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION get_comercio_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_rol()         TO authenticated, anon, service_role;

-- ───── 2. RLS habilitado en todas las tablas (idempotente) ────────
ALTER TABLE comercios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_venta        ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_caja       ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aperturas_caja     ENABLE ROW LEVEL SECURITY;

-- ───── 3. comercios ───────────────────────────────────────────────
DROP POLICY IF EXISTS "comercios_read_propio"  ON comercios;
DROP POLICY IF EXISTS "comercios_update_admin" ON comercios;
CREATE POLICY "comercios_read_propio" ON comercios FOR SELECT
  USING (id = get_comercio_id());
CREATE POLICY "comercios_update_admin" ON comercios FOR UPDATE
  USING      (id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (id = get_comercio_id() AND get_rol() = 'admin');

-- ───── 4. perfiles ────────────────────────────────────────────────
-- perfiles_read incluye `OR id = auth.uid()` para que el user pueda
-- leer su propio perfil aunque get_comercio_id() devuelva NULL —
-- así se rompe el caso huevo-y-gallina del bootstrap inicial.
DROP POLICY IF EXISTS "perfiles_read"         ON perfiles;
DROP POLICY IF EXISTS "perfiles_update_self"  ON perfiles;
DROP POLICY IF EXISTS "perfiles_update_admin" ON perfiles;
DROP POLICY IF EXISTS "perfiles_insert_admin" ON perfiles;
CREATE POLICY "perfiles_read" ON perfiles FOR SELECT
  USING (comercio_id = get_comercio_id() OR id = auth.uid());
CREATE POLICY "perfiles_update_self" ON perfiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "perfiles_update_admin" ON perfiles FOR UPDATE
  USING      (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');
CREATE POLICY "perfiles_insert_admin" ON perfiles FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- ───── 5. categorias ──────────────────────────────────────────────
DROP POLICY IF EXISTS "categorias_read"        ON categorias;
DROP POLICY IF EXISTS "categorias_write_admin" ON categorias;
CREATE POLICY "categorias_read" ON categorias FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "categorias_write_admin" ON categorias FOR ALL
  USING      (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- ───── 6. proveedores ─────────────────────────────────────────────
DROP POLICY IF EXISTS "proveedores_read"        ON proveedores;
DROP POLICY IF EXISTS "proveedores_write_admin" ON proveedores;
CREATE POLICY "proveedores_read" ON proveedores FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "proveedores_write_admin" ON proveedores FOR ALL
  USING      (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- ───── 7. productos ───────────────────────────────────────────────
DROP POLICY IF EXISTS "productos_read"        ON productos;
DROP POLICY IF EXISTS "productos_write_admin" ON productos;
CREATE POLICY "productos_read" ON productos FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "productos_write_admin" ON productos FOR ALL
  USING      (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- ───── 8. lotes ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "lotes_read"        ON lotes;
DROP POLICY IF EXISTS "lotes_write_admin" ON lotes;
CREATE POLICY "lotes_read" ON lotes FOR SELECT
  USING (producto_id IN (SELECT id FROM productos WHERE comercio_id = get_comercio_id()));
CREATE POLICY "lotes_write_admin" ON lotes FOR ALL
  USING (
    producto_id IN (SELECT id FROM productos WHERE comercio_id = get_comercio_id())
    AND get_rol() = 'admin'
  )
  WITH CHECK (
    producto_id IN (SELECT id FROM productos WHERE comercio_id = get_comercio_id())
    AND get_rol() = 'admin'
  );

-- ───── 9. ventas ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "ventas_read"         ON ventas;
DROP POLICY IF EXISTS "ventas_insert"       ON ventas;
DROP POLICY IF EXISTS "ventas_update_admin" ON ventas;
CREATE POLICY "ventas_read" ON ventas FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "ventas_insert" ON ventas FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id());
CREATE POLICY "ventas_update_admin" ON ventas FOR UPDATE
  USING      (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- ───── 10. items_venta ────────────────────────────────────────────
DROP POLICY IF EXISTS "items_venta_read"   ON items_venta;
DROP POLICY IF EXISTS "items_venta_insert" ON items_venta;
CREATE POLICY "items_venta_read" ON items_venta FOR SELECT
  USING (venta_id IN (SELECT id FROM ventas WHERE comercio_id = get_comercio_id()));
CREATE POLICY "items_venta_insert" ON items_venta FOR INSERT
  WITH CHECK (venta_id IN (SELECT id FROM ventas WHERE comercio_id = get_comercio_id()));

-- ───── 11. movimientos_caja ───────────────────────────────────────
DROP POLICY IF EXISTS "movimientos_caja_read"   ON movimientos_caja;
DROP POLICY IF EXISTS "movimientos_caja_insert" ON movimientos_caja;
CREATE POLICY "movimientos_caja_read" ON movimientos_caja FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "movimientos_caja_insert" ON movimientos_caja FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id());

-- ───── 12. cierres_caja ───────────────────────────────────────────
DROP POLICY IF EXISTS "cierres_caja_read"         ON cierres_caja;
DROP POLICY IF EXISTS "cierres_caja_insert"       ON cierres_caja;
DROP POLICY IF EXISTS "cierres_caja_delete_admin" ON cierres_caja;
CREATE POLICY "cierres_caja_read" ON cierres_caja FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "cierres_caja_insert" ON cierres_caja FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id());
CREATE POLICY "cierres_caja_delete_admin" ON cierres_caja FOR DELETE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- ───── 13. movimientos_stock ──────────────────────────────────────
DROP POLICY IF EXISTS "movimientos_stock_read"        ON movimientos_stock;
DROP POLICY IF EXISTS "movimientos_stock_write_admin" ON movimientos_stock;
CREATE POLICY "movimientos_stock_read" ON movimientos_stock FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "movimientos_stock_write_admin" ON movimientos_stock FOR ALL
  USING      (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- ───── 14. aperturas_caja ─────────────────────────────────────────
DROP POLICY IF EXISTS "aperturas_caja_read"        ON aperturas_caja;
DROP POLICY IF EXISTS "aperturas_caja_write_admin" ON aperturas_caja;
CREATE POLICY "aperturas_caja_read" ON aperturas_caja FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "aperturas_caja_write_admin" ON aperturas_caja FOR ALL
  USING      (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-RECUPERACIÓN
-- ═══════════════════════════════════════════════════════════════════
-- Conteo de policies por tabla. Cada tabla debe tener ≥1.
--
-- SELECT tablename, COUNT(*) AS policies
-- FROM pg_policies WHERE schemaname = 'public'
--   AND tablename IN (
--     'comercios','perfiles','categorias','proveedores','productos',
--     'lotes','ventas','items_venta','movimientos_caja','cierres_caja',
--     'movimientos_stock','aperturas_caja'
--   )
-- GROUP BY tablename ORDER BY tablename;
