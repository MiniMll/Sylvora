-- ═══════════════════════════════════════════════════════════════════
-- Migración: RLS UPDATE policy para `comercios`
-- ═══════════════════════════════════════════════════════════════════
--
-- Problema que resuelve:
-- - La RLS de `comercios` sólo tenía policy SELECT. NO había UPDATE.
-- - app/perfil/page.tsx intenta UPDATE comercios desde el cliente al
--   guardar (nombre, tipo, telefono, email, direccion).
-- - Sin policy, Postgres permite el UPDATE pero afecta 0 rows. Eso
--   NO genera error desde la perspectiva de Supabase (un UPDATE de
--   0 rows es válido), así que el flujo del cliente sigue como si
--   hubiera guardado bien — pero los datos nunca se persistieron.
-- - Consecuencia visible: el comerciante edita nombre/dirección
--   desde /perfil, ve "guardado correctamente", sale, vuelve y los
--   campos están vacíos. Y los tickets impresos siguen mostrando el
--   header sin nombre del comercio porque ese dato nunca llegó a la
--   columna.
--
-- Fix: agregar policy UPDATE admin-only. Mismo patrón que las otras
-- tablas del comercio (perfiles_update_admin, categorias_write_admin,
-- proveedores_write_admin, etc.).
--
-- Por qué admin-only:
--   Editar nombre/dirección/teléfono del comercio cambia cómo
--   aparece en los tickets de TODOS los empleados. Es decisión del
--   dueño, no del cajero. Mismo criterio que get_rol() = 'admin'
--   para perfiles_update_admin.
--
-- Aplicar UNA VEZ:
--   psql $DATABASE_URL -f scripts/migration-comercios-update-policy.sql
--
-- IDEMPOTENTE: DROP-and-recreate de la policy.

BEGIN;

DROP POLICY IF EXISTS "comercios_update_admin" ON comercios;
CREATE POLICY "comercios_update_admin" ON comercios FOR UPDATE
  USING      (id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (id = get_comercio_id() AND get_rol() = 'admin');

COMMIT;

-- ───── Verificación post-migración ────────────────────────────────
-- Listar todas las policies de comercios. Debería haber:
--   - comercios_read_propio (SELECT)
--   - comercios_update_admin (UPDATE)
--
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'comercios';
