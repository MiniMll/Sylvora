-- ═══════════════════════════════════════════════════════════════════
-- Migración: 3 roles (admin / encargado / cajero) + RLS alineada
-- ═══════════════════════════════════════════════════════════════════
--
-- Pasa de 2 roles (admin/empleado) a 3 (admin/encargado/cajero).
-- Cierra el gap entre UI y RLS — el encargado puede crear/editar
-- productos, gestionar lotes y anular ventas también a nivel DB
-- (no solo en UI).
--
-- Aprobado en feat/roles-permisos-v1:
--   - Encargado: operativa elevada (vender, anular, agregar/editar
--     productos, gestionar lotes, ver reportes, cerrar caja).
--   - Cajero: POS + caja del día (reemplaza al actual "empleado").
--   - Admin: todo.
--
-- Cambios:
--   1. Helper SQL es_admin_o_encargado() — reutilizable en policies.
--   2. UPDATE perfiles SET rol='cajero' WHERE rol='empleado'.
--   3. CHECK acepta los 3 roles.
--   4. RLS: 3 tablas se abren al encargado (productos, lotes, ventas).
--
-- Lo que NO toca esta migración:
--   - categorias / proveedores: nadie las gestiona activamente en UI
--     V1. Quedan admin-only. Si en el futuro se abre el flow de
--     gestión, abrimos también.
--   - cierres_caja DELETE (reabrir): sigue admin-only.
--   - movimientos_stock / aperturas_caja: admin-only (sin usuarios
--     reales en V1, conservadores).
--   - comercios UPDATE, perfiles UPDATE/INSERT: admin-only —
--     configuración y gestión de usuarios son del dueño.
--
-- IDEMPOTENTE: re-runnable. Todos los CREATE OR REPLACE / DROP
-- IF EXISTS / WHERE filtrado. Si ya corrió, la segunda corrida es
-- no-op para el data (UPDATE filtrado por rol='empleado' = 0 filas).
--
-- Aplicar:
--   Pegar todo el archivo en Supabase SQL Editor → Run.

BEGIN;


-- ═══════════════════════════════════════════════════════════════════
-- 1. Helper SQL — es_admin_o_encargado()
-- ═══════════════════════════════════════════════════════════════════
-- SECURITY DEFINER + STABLE para el mismo patrón que get_rol() y
-- get_comercio_id() del bootstrap. search_path lockeado a public.
--
-- Definido en el primer step porque las policies de abajo la usan.

CREATE OR REPLACE FUNCTION es_admin_o_encargado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_rol() IN ('admin', 'encargado')
$$;

GRANT EXECUTE ON FUNCTION es_admin_o_encargado() TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 2. Migración de datos: empleado → cajero
-- ═══════════════════════════════════════════════════════════════════
-- Hacemos esto ANTES del nuevo CHECK. Si lo hiciéramos al revés y el
-- CHECK ya no acepta 'empleado', el UPDATE fallaría con valores
-- inválidos en la mitad de la tabla. Este orden es safe en cualquier
-- estado intermedio.

UPDATE perfiles SET rol = 'cajero' WHERE rol = 'empleado';


-- ═══════════════════════════════════════════════════════════════════
-- 3. CHECK constraint con 3 roles
-- ═══════════════════════════════════════════════════════════════════
-- DROP-and-recreate idempotente. Si quedaba algún valor distinto a los
-- 3 aceptados (improbable; pero defensivo), el ADD CONSTRAINT falla y
-- abortamos toda la migración. Visible.

ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('admin', 'encargado', 'cajero'));


-- ═══════════════════════════════════════════════════════════════════
-- 4. RLS — policies que se abren al encargado
-- ═══════════════════════════════════════════════════════════════════
-- Las 3 tablas que cambian: productos, lotes, ventas.
-- El resto sigue admin-only (ver header).

-- ─── 4a. productos ────────────────────────────────────────────────
-- Antes: una policy "productos_write_admin" FOR ALL solo admin.
-- Ahora: split en 3 policies — INSERT/UPDATE para admin+encargado,
-- DELETE solo admin (eliminar es destructivo, rompe FK en items_venta).

DROP POLICY IF EXISTS "productos_write_admin" ON productos;
DROP POLICY IF EXISTS "productos_insert"       ON productos;
DROP POLICY IF EXISTS "productos_update"       ON productos;
DROP POLICY IF EXISTS "productos_delete_admin" ON productos;

CREATE POLICY "productos_insert" ON productos FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id() AND es_admin_o_encargado());

CREATE POLICY "productos_update" ON productos FOR UPDATE
  USING      (comercio_id = get_comercio_id() AND es_admin_o_encargado())
  WITH CHECK (comercio_id = get_comercio_id() AND es_admin_o_encargado());

CREATE POLICY "productos_delete_admin" ON productos FOR DELETE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin');


-- ─── 4b. lotes ────────────────────────────────────────────────────
-- Antes: "lotes_write_admin" FOR ALL solo admin.
-- Ahora: FOR ALL admin+encargado. Cajero no toca lotes.
-- El cajero al cobrar dispara descontar_stock_validado() vía RPC —
-- esa RPC corre como SECURITY INVOKER y respeta esta policy (que
-- ahora permite operar a admin+encargado). PERO el cajero sigue
-- pudiendo cobrar porque dentro de la RPC, los UPDATEs sobre lotes
-- vienen del lado del cajero como usuario. Eso fallaría con la
-- nueva policy.
--
-- IMPORTANTE: la RPC descontar_stock_validado / restituir_stock
-- usa SECURITY INVOKER y por lo tanto respeta RLS. Para que el
-- cajero pueda cobrar, la UPDATE de lotes hecho desde dentro de
-- la RPC corre con sus permisos. Necesitamos OR get_rol() = 'cajero'
-- en la policy, o cambiar las RPCs a SECURITY DEFINER.
--
-- Decisión V1: las RPCs ya existen y son SECURITY INVOKER. La
-- forma más simple y segura es permitir UPDATE de lotes a cajero
-- TAMBIÉN, pero SOLO restringido a la transacción que ocurre dentro
-- de la RPC. Como no podemos detectar "estoy dentro de una RPC"
-- desde la policy, optamos por permitir UPDATE a todos los roles
-- (cajero incluido). INSERT y DELETE siguen restringidos a
-- admin+encargado.
--
-- Alternativa más limpia: cambiar las RPCs a SECURITY DEFINER. Eso
-- queda para otro sprint. Por ahora seguimos con INVOKER + policy
-- permisiva en UPDATE de lotes.

DROP POLICY IF EXISTS "lotes_write_admin" ON lotes;
DROP POLICY IF EXISTS "lotes_write"       ON lotes;
DROP POLICY IF EXISTS "lotes_insert"      ON lotes;
DROP POLICY IF EXISTS "lotes_update_all"  ON lotes;
DROP POLICY IF EXISTS "lotes_delete"      ON lotes;

CREATE POLICY "lotes_insert" ON lotes FOR INSERT
  WITH CHECK (
    producto_id IN (SELECT id FROM productos WHERE comercio_id = get_comercio_id())
    AND es_admin_o_encargado()
  );

-- UPDATE permitido a cualquier rol del comercio para que el cajero
-- pueda cobrar (la RPC descontar_stock_validado hace UPDATE sobre
-- lotes en SECURITY INVOKER). La validación de qué se puede hacer
-- en UI sigue gateada por permisos TS (lote.gestionar = admin +
-- encargado).
CREATE POLICY "lotes_update_all" ON lotes FOR UPDATE
  USING      (producto_id IN (SELECT id FROM productos WHERE comercio_id = get_comercio_id()))
  WITH CHECK (producto_id IN (SELECT id FROM productos WHERE comercio_id = get_comercio_id()));

CREATE POLICY "lotes_delete" ON lotes FOR DELETE
  USING (
    producto_id IN (SELECT id FROM productos WHERE comercio_id = get_comercio_id())
    AND es_admin_o_encargado()
  );


-- ─── 4c. ventas ───────────────────────────────────────────────────
-- Antes: "ventas_update_admin" FOR UPDATE solo admin.
-- Ahora: FOR UPDATE admin+encargado (caso anular venta).
-- INSERT (ventas_insert) y SELECT (ventas_read) ya estaban abiertos
-- a todos los roles — no cambian.

DROP POLICY IF EXISTS "ventas_update_admin" ON ventas;
DROP POLICY IF EXISTS "ventas_update"       ON ventas;

CREATE POLICY "ventas_update" ON ventas FOR UPDATE
  USING      (comercio_id = get_comercio_id() AND es_admin_o_encargado())
  WITH CHECK (comercio_id = get_comercio_id() AND es_admin_o_encargado());


COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. Función helper creada:
--    SELECT proname FROM pg_proc WHERE proname = 'es_admin_o_encargado';
--    → 1 fila.
--
-- 2. CHECK actualizado a 3 valores:
--    SELECT pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conname = 'perfiles_rol_check';
--    → CHECK (rol IN ('admin','encargado','cajero'))
--
-- 3. Datos migrados (no quedan empleados):
--    SELECT rol, count(*) FROM perfiles GROUP BY rol;
--    → Solo aparecen admin / encargado / cajero. Ningún empleado.
--
-- 4. Policies nuevas presentes:
--    SELECT polname FROM pg_policy
--    WHERE polname IN (
--      'productos_insert', 'productos_update', 'productos_delete_admin',
--      'lotes_insert', 'lotes_update_all', 'lotes_delete',
--      'ventas_update'
--    );
--    → 7 filas.
--
-- 5. Smoke test (browser, logueado como admin):
--    El admin sigue pudiendo todo. Las pantallas existentes (productos,
--    ventas, /caja) no cambian de comportamiento.
--
-- 6. Smoke test con perfil encargado (crear uno a mano via Dashboard
--    o esperar al commit 3 que actualiza /usuarios):
--    UPDATE perfiles SET rol='encargado' WHERE id='<algun-user-id>';
--    Loguearse con ese user → debería poder crear producto + anular
--    venta. No debería poder eliminar producto ni cambiar rol de
--    otro user (queda para commits posteriores que actualizan UI).
