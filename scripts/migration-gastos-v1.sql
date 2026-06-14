-- Migracion: Gastos operativos V1
-- Sprint: feat(gastos): gestion de gastos v1
--
-- Objetivo:
--   Registrar gastos simples por comercio para calcular ganancia
--   estimada = ventas - gastos. Sin contabilidad avanzada en V1.
--
-- Seguridad:
--   - SECURITY/RLS por comercio_id.
--   - Solo admin y encargado pueden ver/crear/editar/eliminar.
--   - Cajero no ve gastos ni metricas financieras asociadas.

BEGIN;

CREATE TABLE IF NOT EXISTS gastos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id    uuid NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  descripcion    text NOT NULL,
  monto          numeric(12,2) NOT NULL CHECK (monto > 0),
  categoria      text NOT NULL CHECK (
    categoria IN (
      'alquiler',
      'servicios',
      'proveedores',
      'impuestos',
      'sueldos',
      'mantenimiento',
      'transporte',
      'otros'
    )
  ),
  fecha          date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  observaciones text,
  creado_por     uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE gastos IS
  'Gastos operativos simples por comercio. V1: categorias fijas, sin contabilidad avanzada.';

CREATE INDEX IF NOT EXISTS idx_gastos_comercio_fecha
  ON gastos (comercio_id, fecha DESC, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_gastos_comercio_categoria_fecha
  ON gastos (comercio_id, categoria, fecha DESC);

ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gastos_select_admin_encargado" ON gastos;
DROP POLICY IF EXISTS "gastos_insert_admin_encargado" ON gastos;
DROP POLICY IF EXISTS "gastos_update_admin_encargado" ON gastos;
DROP POLICY IF EXISTS "gastos_delete_admin_encargado" ON gastos;

CREATE POLICY "gastos_select_admin_encargado" ON gastos
  FOR SELECT
  USING (comercio_id = get_comercio_id() AND es_admin_o_encargado());

CREATE POLICY "gastos_insert_admin_encargado" ON gastos
  FOR INSERT
  WITH CHECK (
    comercio_id = get_comercio_id()
    AND es_admin_o_encargado()
    AND (creado_por IS NULL OR creado_por = auth.uid())
  );

CREATE POLICY "gastos_update_admin_encargado" ON gastos
  FOR UPDATE
  USING (comercio_id = get_comercio_id() AND es_admin_o_encargado())
  WITH CHECK (comercio_id = get_comercio_id() AND es_admin_o_encargado());

CREATE POLICY "gastos_delete_admin_encargado" ON gastos
  FOR DELETE
  USING (comercio_id = get_comercio_id() AND es_admin_o_encargado());

COMMIT;

-- Verificacion rapida:
-- SELECT to_regclass('public.gastos') AS gastos;
-- SELECT policyname FROM pg_policies WHERE tablename = 'gastos';
