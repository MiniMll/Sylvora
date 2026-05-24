-- =====================================================================
-- Sylvora — Bootstrap SQL del Supabase staging para landing
-- =====================================================================
-- Crea el schema completo (tablas + funciones + RLS + policies) para
-- que `npm run seed:landing` funcione y la app se comporte igual que
-- en producción.
--
-- USO:
--   1. Crear proyecto Supabase NUEVO (free tier, dedicado a landing).
--   2. Dashboard → SQL Editor → New query.
--   3. Pegar este archivo entero.
--   4. Run.
--   5. Verificar que el bloque final imprime "✅ Bootstrap completo".
--   6. Salir, exportar env vars, correr `npm run seed:landing`.
--
-- IDEMPOTENTE: si se corre dos veces, no falla ni duplica.
--
-- NO INCLUYE:
-- - Trigger handle_new_user() de signup → este staging es solo para
--   capturas; los usuarios los crea el seed (admin API), no signup.
-- - Storage buckets para imágenes de productos → el seed deja
--   imagen_url null (los productos en la captura usan icon fallback).
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Extensiones
-- ─────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()


-- ─────────────────────────────────────────────────────────────────────
-- Tablas — en orden de dependencias (parents antes que children)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comercios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT NOT NULL,
  tipo           TEXT,
  telefono       TEXT,
  email          TEXT,
  direccion      TEXT,
  plan           TEXT NOT NULL DEFAULT 'trial',
  -- Trial de 30 días desde el INSERT. Se deriva al leer:
  --   plan='trial' AND now > trial_ends_at  → expirado (soft-lock).
  -- Cuando un comercio pague, UPDATE manual: plan='active'.
  trial_ends_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comercios_plan_check CHECK (plan IN ('trial','active','expired'))
);

-- Migración defensiva: si la DB ya existía con la versión minimal
-- (solo id/nombre/created_at), agregamos las columnas faltantes sin
-- romper datos existentes. Idempotente. Equivalente a aplicar todas
-- las migraciones de comercios (extended, direccion, trial) al
-- staging actual.
ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS tipo          TEXT,
  ADD COLUMN IF NOT EXISTS telefono      TEXT,
  ADD COLUMN IF NOT EXISTS email         TEXT,
  ADD COLUMN IF NOT EXISTS direccion     TEXT,
  ADD COLUMN IF NOT EXISTS plan          TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Si trial_ends_at viene de la migración (sin default en filas
-- viejas), backfilleamos con opción C: respetar created_at + 30d
-- pero garantizar 7 días de gracia desde la migración. Solo afecta
-- filas con NULL → idempotente.
UPDATE comercios
  SET trial_ends_at = GREATEST(created_at + interval '30 days', now() + interval '7 days')
  WHERE trial_ends_at IS NULL;

-- Después del backfill, fijamos el default para inserts nuevos.
ALTER TABLE comercios
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '30 days');

-- CHECK sobre plan (idempotente DROP-and-recreate).
ALTER TABLE comercios DROP CONSTRAINT IF EXISTS comercios_plan_check;
ALTER TABLE comercios
  ADD CONSTRAINT comercios_plan_check
  CHECK (plan IN ('trial','active','expired'));

CREATE TABLE IF NOT EXISTS perfiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  comercio_id  UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre       TEXT,
  rol          TEXT NOT NULL DEFAULT 'admin',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT perfiles_rol_check CHECK (rol IN ('admin', 'empleado'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id  UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  -- El flow de registro (app/registro/page.tsx) inserta icono + color
  -- al crear las categorías default. Sin estas columnas el insert
  -- falla con "column does not exist".
  icono        TEXT,
  color        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, nombre)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id  UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS productos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id       UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,
  sku               TEXT,
  codigo_barras     TEXT,
  categoria         TEXT,
  precio_costo      NUMERIC NOT NULL DEFAULT 0,
  precio_venta      NUMERIC NOT NULL DEFAULT 0,
  precio_mayorista  NUMERIC,
  precio_por_kg     NUMERIC,
  stock_actual      NUMERIC NOT NULL DEFAULT 0,
  stock_minimo      NUMERIC NOT NULL DEFAULT 0,
  stock_ideal       NUMERIC,
  unidad_venta      TEXT NOT NULL DEFAULT 'unidad',
  ubicacion         TEXT,
  imagen_url        TEXT,
  -- El frontend filtra explícitamente `.eq('activo', true)` en
  -- getProductos / getStockCritico. Sin esta columna, las queries
  -- fallan con error vacío `{}` y el POS aparece sin productos.
  activo            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT productos_unidad_check CHECK (unidad_venta IN ('unidad', 'kg', 'litro', 'metro'))
);

CREATE TABLE IF NOT EXISTS lotes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id        UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  numero_lote        TEXT NOT NULL,
  cantidad           NUMERIC NOT NULL DEFAULT 0,
  fecha_vencimiento  DATE,
  -- type Lote en types/database.ts expone fecha_ingreso. Default a
  -- now() = misma idea que created_at pero el campo del producto.
  fecha_ingreso      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ventas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id            UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  numero_ticket          INTEGER,
  subtotal               NUMERIC NOT NULL DEFAULT 0,
  descuento_porcentaje   NUMERIC NOT NULL DEFAULT 0,
  descuento_monto        NUMERIC NOT NULL DEFAULT 0,
  recargo_porcentaje     NUMERIC NOT NULL DEFAULT 0,
  recargo_monto          NUMERIC NOT NULL DEFAULT 0,
  total                  NUMERIC NOT NULL DEFAULT 0,
  metodo_pago            TEXT NOT NULL,
  estado                 TEXT NOT NULL DEFAULT 'completada',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ventas_estado_check CHECK (estado IN ('completada', 'anulada'))
);

CREATE TABLE IF NOT EXISTS items_venta (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id          UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id       UUID REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto   TEXT NOT NULL,
  cantidad          NUMERIC NOT NULL DEFAULT 1,
  peso_kg           NUMERIC,
  precio_unitario   NUMERIC NOT NULL,
  subtotal          NUMERIC NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id   UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  monto         NUMERIC NOT NULL,
  descripcion   TEXT,
  metodo_pago   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT movimientos_caja_tipo_check CHECK (tipo IN ('ingreso', 'egreso'))
);

CREATE TABLE IF NOT EXISTS cierres_caja (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id           UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  usuario_id            UUID,
  fecha                 DATE NOT NULL,
  total_ventas          NUMERIC NOT NULL DEFAULT 0,
  total_egresos         NUMERIC NOT NULL DEFAULT 0,
  saldo_neto            NUMERIC NOT NULL DEFAULT 0,
  cantidad_ventas       INTEGER NOT NULL DEFAULT 0,
  efectivo              NUMERIC NOT NULL DEFAULT 0,
  transferencia         NUMERIC NOT NULL DEFAULT 0,
  debito                NUMERIC NOT NULL DEFAULT 0,
  credito               NUMERIC NOT NULL DEFAULT 0,
  mercadopago           NUMERIC NOT NULL DEFAULT 0,
  efectivo_contado      NUMERIC,
  diferencia_efectivo   NUMERIC,
  retiro_efectivo       NUMERIC,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cierres_caja_comercio_fecha_unique UNIQUE (comercio_id, fecha)
);

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id   UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  producto_id   UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  cantidad      NUMERIC NOT NULL,
  motivo        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aperturas_caja (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id     UUID NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  monto_inicial   NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────
-- Índices
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_perfiles_comercio          ON perfiles(comercio_id);
CREATE INDEX IF NOT EXISTS idx_productos_comercio         ON productos(comercio_id);
CREATE INDEX IF NOT EXISTS idx_productos_sku              ON productos(comercio_id, sku);
CREATE INDEX IF NOT EXISTS idx_lotes_producto             ON lotes(producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_comercio_created    ON ventas(comercio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_venta_venta          ON items_venta(venta_id);
CREATE INDEX IF NOT EXISTS idx_mov_caja_comercio_created  ON movimientos_caja(comercio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cierres_comercio_fecha     ON cierres_caja(comercio_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_stock_comercio         ON movimientos_stock(comercio_id);
CREATE INDEX IF NOT EXISTS idx_categorias_comercio        ON categorias(comercio_id);


-- ─────────────────────────────────────────────────────────────────────
-- Numeración de tickets per-comercio
-- ─────────────────────────────────────────────────────────────────────
-- numero_ticket arranca en 1 para cada comercio (NO global). El cliente
-- (lib/supabase/ventas.ts) no envía valor: el trigger lo asigna como
-- MAX(numero_ticket)+1 dentro del mismo comercio.
--
-- Unique constraint (comercio_id, numero_ticket) defiende contra race
-- condition entre dos cajeros simultáneos del mismo comercio. Si ocurre
-- el conflicto raro, el cliente hace retry.
--
-- Para staging actuales que tenían SERIAL global, ver
-- scripts/migration-numero-ticket-por-comercio.sql (incluye backfill).

ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_comercio_numero_ticket_unique;
ALTER TABLE ventas
  ADD CONSTRAINT ventas_comercio_numero_ticket_unique
  UNIQUE (comercio_id, numero_ticket);

CREATE OR REPLACE FUNCTION asignar_numero_ticket()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_ticket IS NULL THEN
    SELECT COALESCE(MAX(numero_ticket), 0) + 1
      INTO NEW.numero_ticket
      FROM ventas
      WHERE comercio_id = NEW.comercio_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ventas_set_numero_ticket ON ventas;
CREATE TRIGGER ventas_set_numero_ticket
  BEFORE INSERT ON ventas
  FOR EACH ROW
  EXECUTE FUNCTION asignar_numero_ticket();


-- ─────────────────────────────────────────────────────────────────────
-- Funciones de RLS — resuelven el comercio y rol del auth user actual
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_comercio_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT comercio_id FROM perfiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM perfiles WHERE id = auth.uid()
$$;


-- ─────────────────────────────────────────────────────────────────────
-- Habilitar RLS en todas las tablas
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- Policies — limpiar y recrear
-- Patrón: read del comercio; write admin-only (con excepciones
-- explícitas para ventas/egresos/cierres que empleado también ejecuta).
-- Ver docs/roles-permissions-spec.md.
-- ─────────────────────────────────────────────────────────────────────

-- comercios: lectura del propio comercio + UPDATE admin-only.
-- INSERT no tiene policy: la creación inicial del comercio viaja via
-- service-role en POST /api/registro (caso circular — antes de que
-- exista perfil admin no hay forma de policy con get_rol() = 'admin').
-- Una vez creado, UPDATE sí tiene policy normal admin-only para que
-- /perfil pueda completar nombre/dirección/teléfono.
DROP POLICY IF EXISTS "comercios_read_propio" ON comercios;
DROP POLICY IF EXISTS "comercios_update_admin" ON comercios;
CREATE POLICY "comercios_read_propio" ON comercios FOR SELECT
  USING (id = get_comercio_id());
CREATE POLICY "comercios_update_admin" ON comercios FOR UPDATE
  USING      (id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (id = get_comercio_id() AND get_rol() = 'admin');

-- perfiles
DROP POLICY IF EXISTS "perfiles_propio" ON perfiles;
DROP POLICY IF EXISTS "perfiles_read" ON perfiles;
DROP POLICY IF EXISTS "perfiles_update_self" ON perfiles;
DROP POLICY IF EXISTS "perfiles_update_admin" ON perfiles;
DROP POLICY IF EXISTS "perfiles_insert_admin" ON perfiles;
CREATE POLICY "perfiles_read" ON perfiles FOR SELECT
  USING (comercio_id = get_comercio_id() OR id = auth.uid());
CREATE POLICY "perfiles_update_self" ON perfiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "perfiles_update_admin" ON perfiles FOR UPDATE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');
CREATE POLICY "perfiles_insert_admin" ON perfiles FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- categorias: read libre del comercio, write admin
DROP POLICY IF EXISTS "categorias_comercio" ON categorias;
DROP POLICY IF EXISTS "categorias_read" ON categorias;
DROP POLICY IF EXISTS "categorias_write_admin" ON categorias;
CREATE POLICY "categorias_read" ON categorias FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "categorias_write_admin" ON categorias FOR ALL
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- proveedores
DROP POLICY IF EXISTS "proveedores_comercio" ON proveedores;
DROP POLICY IF EXISTS "proveedores_read" ON proveedores;
DROP POLICY IF EXISTS "proveedores_write_admin" ON proveedores;
CREATE POLICY "proveedores_read" ON proveedores FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "proveedores_write_admin" ON proveedores FOR ALL
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- productos
DROP POLICY IF EXISTS "productos_comercio" ON productos;
DROP POLICY IF EXISTS "productos_read" ON productos;
DROP POLICY IF EXISTS "productos_write_admin" ON productos;
CREATE POLICY "productos_read" ON productos FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "productos_write_admin" ON productos FOR ALL
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- lotes: read via join a productos, write admin
DROP POLICY IF EXISTS "lotes_comercio" ON lotes;
DROP POLICY IF EXISTS "lotes_read" ON lotes;
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

-- ventas: read del comercio, insert libre (POS), update admin (para anular)
DROP POLICY IF EXISTS "ventas_comercio" ON ventas;
DROP POLICY IF EXISTS "ventas_read" ON ventas;
DROP POLICY IF EXISTS "ventas_insert" ON ventas;
DROP POLICY IF EXISTS "ventas_update_admin" ON ventas;
CREATE POLICY "ventas_read" ON ventas FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "ventas_insert" ON ventas FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id());
CREATE POLICY "ventas_update_admin" ON ventas FOR UPDATE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- items_venta: heredan permisos via join a ventas
DROP POLICY IF EXISTS "items_venta_comercio" ON items_venta;
DROP POLICY IF EXISTS "items_venta_read" ON items_venta;
DROP POLICY IF EXISTS "items_venta_insert" ON items_venta;
CREATE POLICY "items_venta_read" ON items_venta FOR SELECT
  USING (venta_id IN (SELECT id FROM ventas WHERE comercio_id = get_comercio_id()));
CREATE POLICY "items_venta_insert" ON items_venta FOR INSERT
  WITH CHECK (venta_id IN (SELECT id FROM ventas WHERE comercio_id = get_comercio_id()));

-- movimientos_caja: read del comercio, insert ambos (egresos)
DROP POLICY IF EXISTS "movimientos_caja_comercio" ON movimientos_caja;
DROP POLICY IF EXISTS "movimientos_caja_read" ON movimientos_caja;
DROP POLICY IF EXISTS "movimientos_caja_insert" ON movimientos_caja;
CREATE POLICY "movimientos_caja_read" ON movimientos_caja FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "movimientos_caja_insert" ON movimientos_caja FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id());

-- cierres_caja: read del comercio, insert ambos (cerrar), delete admin (reabrir)
DROP POLICY IF EXISTS "cierres_caja_comercio" ON cierres_caja;
DROP POLICY IF EXISTS "cierres_caja_read" ON cierres_caja;
DROP POLICY IF EXISTS "cierres_caja_insert" ON cierres_caja;
DROP POLICY IF EXISTS "cierres_caja_delete_admin" ON cierres_caja;
CREATE POLICY "cierres_caja_read" ON cierres_caja FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "cierres_caja_insert" ON cierres_caja FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id());
CREATE POLICY "cierres_caja_delete_admin" ON cierres_caja FOR DELETE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- movimientos_stock: admin only (read y write)
DROP POLICY IF EXISTS "movimientos_stock_comercio" ON movimientos_stock;
DROP POLICY IF EXISTS "movimientos_stock_read" ON movimientos_stock;
DROP POLICY IF EXISTS "movimientos_stock_write_admin" ON movimientos_stock;
CREATE POLICY "movimientos_stock_read" ON movimientos_stock FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "movimientos_stock_write_admin" ON movimientos_stock FOR ALL
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- aperturas_caja: admin
DROP POLICY IF EXISTS "aperturas_caja_comercio" ON aperturas_caja;
DROP POLICY IF EXISTS "aperturas_caja_read" ON aperturas_caja;
DROP POLICY IF EXISTS "aperturas_caja_write_admin" ON aperturas_caja;
CREATE POLICY "aperturas_caja_read" ON aperturas_caja FOR SELECT
  USING (comercio_id = get_comercio_id());
CREATE POLICY "aperturas_caja_write_admin" ON aperturas_caja FOR ALL
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');


-- ─────────────────────────────────────────────────────────────────────
-- Storage — bucket "productos" + policies
-- ─────────────────────────────────────────────────────────────────────
-- La app sube imágenes de productos a un bucket llamado "productos"
-- (ver lib/supabase/productos.ts subirImagen). Sin esto, intentar
-- subir una imagen devuelve "Bucket not found".
--
-- Bucket public=true porque las URLs de las imágenes se sirven sin
-- auth desde POS, productos, ticket, etc. Las policies de WRITE
-- gatean por rol admin, coherentes con la policy de la tabla
-- productos.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productos',
  'productos',
  true,
  5242880,                                                    -- 5MB max
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];

DROP POLICY IF EXISTS "productos_storage_read" ON storage.objects;
CREATE POLICY "productos_storage_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'productos');

DROP POLICY IF EXISTS "productos_storage_insert_admin" ON storage.objects;
CREATE POLICY "productos_storage_insert_admin" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'productos' AND get_rol() = 'admin');

DROP POLICY IF EXISTS "productos_storage_update_admin" ON storage.objects;
CREATE POLICY "productos_storage_update_admin" ON storage.objects FOR UPDATE
  USING (bucket_id = 'productos' AND get_rol() = 'admin');

DROP POLICY IF EXISTS "productos_storage_delete_admin" ON storage.objects;
CREATE POLICY "productos_storage_delete_admin" ON storage.objects FOR DELETE
  USING (bucket_id = 'productos' AND get_rol() = 'admin');


-- ─────────────────────────────────────────────────────────────────────
-- Verificación final — debe imprimir el bloque ✅
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tablas_count int;
  v_policies_count int;
  v_funcs_count int;
  v_bucket_existe boolean;
  v_storage_policies int;
BEGIN
  SELECT count(*) INTO v_tablas_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'comercios', 'perfiles', 'categorias', 'proveedores',
      'productos', 'lotes', 'ventas', 'items_venta',
      'movimientos_caja', 'cierres_caja', 'movimientos_stock', 'aperturas_caja'
    );

  SELECT count(*) INTO v_policies_count
  FROM pg_policies WHERE schemaname = 'public';

  SELECT count(*) INTO v_funcs_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('get_comercio_id', 'get_rol');

  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'productos') INTO v_bucket_existe;

  SELECT count(*) INTO v_storage_policies
  FROM pg_policies
  WHERE schemaname = 'storage' AND policyname LIKE 'productos_storage%';

  IF v_tablas_count <> 12 THEN
    RAISE EXCEPTION 'Faltan tablas: esperadas 12, encontradas %', v_tablas_count;
  END IF;
  IF v_funcs_count <> 2 THEN
    RAISE EXCEPTION 'Faltan funciones RLS: esperadas 2 (get_comercio_id, get_rol), encontradas %', v_funcs_count;
  END IF;
  IF v_policies_count < 20 THEN
    RAISE EXCEPTION 'Faltan policies RLS: esperadas 20+, encontradas %', v_policies_count;
  END IF;
  IF NOT v_bucket_existe THEN
    RAISE EXCEPTION 'Falta storage bucket "productos"';
  END IF;
  IF v_storage_policies < 4 THEN
    RAISE EXCEPTION 'Faltan policies de storage: esperadas 4 (read + insert/update/delete admin), encontradas %', v_storage_policies;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Bootstrap completo:';
  RAISE NOTICE '   • % tablas', v_tablas_count;
  RAISE NOTICE '   • % funciones RLS', v_funcs_count;
  RAISE NOTICE '   • % policies de tablas', v_policies_count;
  RAISE NOTICE '   • bucket "productos" + % policies de storage', v_storage_policies;
  RAISE NOTICE '';
  RAISE NOTICE 'Siguiente paso: correr `npm run seed:landing` desde tu terminal.';
END $$;
