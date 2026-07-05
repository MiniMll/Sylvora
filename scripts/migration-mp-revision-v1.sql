-- ═══════════════════════════════════════════════════════════════════
-- Migración: cola de revisión MP — estado 'resuelto' + auditoría
-- ═══════════════════════════════════════════════════════════════════
--
-- Épica "MP requiere_revision" — Commit 1.
-- Ver docs/mercado-pago-cobros-spec.md §18 (estado requiere_revision).
--
-- Garantiza que ningún cobro aprobado de MP quede invisible si la
-- venta no se registró. Este commit agrega la infraestructura de
-- resolución; la detección (webhook + lazy-promote) y la UI vienen
-- en commits siguientes.
--
-- Qué crea:
--   1. Estado 'resuelto' en el CHECK de intentos_cobro_mp (7º estado).
--      Única transición nueva permitida: requiere_revision → resuelto,
--      y SOLO vía la RPC resolver_intento_mp (auditoría garantizada).
--   2. Columna items_snapshot jsonb en intentos_cobro_mp — snapshot
--      del carrito al crear el cobro. Habilita "registrar venta"
--      días después con los items exactos. Nullable: los intentos
--      históricos no lo tienen y solo ofrecen reembolso/descarte/
--      asociación.
--   3. Tabla mp_resoluciones_cobro — auditoría INMUTABLE (INSERT-only,
--      sin policies de UPDATE ni DELETE). Quién resolvió qué, cuándo
--      y cómo.
--   4. RPC resolver_intento_mp — transaccional: inserta la resolución
--      + marca el intento como resuelto en una sola tx. Valida rol
--      admin ADENTRO (defensa contra la RLS laxa de UPDATE en
--      intentos_cobro_mp, que permite cualquier rol del comercio).
--
-- Lifecycle completo tras esta migración:
--
--   pendiente ─┬─ aprobado ─┬─ (venta OK, venta_id seteado)
--              │            └─ requiere_revision ── resuelto   ← NUEVO
--              ├─ rechazado
--              ├─ cancelado ──┐ (webhook 'approved' tardío,
--              └─ expirado  ──┴─ requiere_revision — Commit 2)
--
-- IDEMPOTENTE: re-runnable completo.
--
-- Aplicar: pegar en Supabase SQL Editor → Run. Smoke tests al final.

BEGIN;

-- ───── 1. Estado 'resuelto' en el CHECK ─────────────────────────────

ALTER TABLE intentos_cobro_mp
  DROP CONSTRAINT IF EXISTS intentos_cobro_mp_estado_check;

ALTER TABLE intentos_cobro_mp
  ADD CONSTRAINT intentos_cobro_mp_estado_check
  CHECK (estado IN (
    'pendiente',
    'aprobado',
    'rechazado',
    'cancelado',
    'expirado',
    'requiere_revision',
    'resuelto'
  ));

COMMENT ON CONSTRAINT intentos_cobro_mp_estado_check ON intentos_cobro_mp IS
  'Estados del lifecycle. requiere_revision: MP cobró pero la venta no se registró. resuelto: un admin lo resolvió vía resolver_intento_mp (auditoría en mp_resoluciones_cobro).';

-- ───── 2. Snapshot del carrito ──────────────────────────────────────
-- Poblado por POST /api/mp/cobros (Commit 3). Formato versionado
-- (ver lib/mp/snapshot.ts — fuente de verdad de tipos y sanitizado):
--   { "version": 1,
--     "subtotal": num, "descuento_porcentaje": num, "descuento_monto": num,
--     "recargo_porcentaje": num, "recargo_monto": num, "total": num,
--     "items": [{ "producto_id": uuid|null, "nombre_producto": text,
--                 "precio_unitario": num, "cantidad": num,
--                 "subtotal": num, "peso_kg"?: num }, ...] }
-- Contiene TODO lo necesario para reconstruir la venta sin depender
-- del carrito. Sin datos sensibles: mismo contenido que items_venta.

ALTER TABLE intentos_cobro_mp
  ADD COLUMN IF NOT EXISTS items_snapshot jsonb;

COMMENT ON COLUMN intentos_cobro_mp.items_snapshot IS
  'Snapshot versionado del carrito al crear el cobro: {version, subtotal, descuento_*, recargo_*, total, items[]} — ver lib/mp/snapshot.ts. Permite recrear la venta si crear_venta falla post-aprobación. NULL en intentos previos a la épica de revisión.';

-- ───── 3. Tabla de auditoría — INSERT-only ──────────────────────────

CREATE TABLE IF NOT EXISTS mp_resoluciones_cobro (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intento_id    uuid NOT NULL REFERENCES intentos_cobro_mp(id),
  comercio_id   uuid NOT NULL REFERENCES comercios(id),
  accion        text NOT NULL CHECK (accion IN (
                  'venta_registrada',   -- venta recreada desde items_snapshot
                  'venta_asociada',     -- la venta ya existía, se linkeó
                  'reembolsado',        -- refund hecho en dashboard MP (V1 manual)
                  'descartado'          -- conciliado por fuera; nota obligatoria
                )),
  venta_id      uuid REFERENCES ventas(id),
  nota          text,
  resuelto_por  uuid NOT NULL REFERENCES perfiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Nota obligatoria al descartar: si no queda venta ni refund,
  -- el "por qué" es lo único que explica el dinero.
  CONSTRAINT mp_resoluciones_nota_descartado
    CHECK (accion <> 'descartado' OR (nota IS NOT NULL AND length(trim(nota)) > 0)),
  -- venta_id obligatorio cuando la resolución ES una venta.
  CONSTRAINT mp_resoluciones_venta_requerida
    CHECK (accion NOT IN ('venta_registrada', 'venta_asociada') OR venta_id IS NOT NULL)
);

COMMENT ON TABLE mp_resoluciones_cobro IS
  'Auditoría inmutable de resoluciones de cobros MP en revisión. INSERT-only: sin policies de UPDATE/DELETE — el historial no se toca.';

-- Historial por comercio (la UI lista resueltos recientes).
CREATE INDEX IF NOT EXISTS mp_resoluciones_comercio_created_idx
  ON mp_resoluciones_cobro (comercio_id, created_at DESC);

-- Lookup por intento (detalle de un intento resuelto).
CREATE INDEX IF NOT EXISTS mp_resoluciones_intento_idx
  ON mp_resoluciones_cobro (intento_id);

-- Scan de huérfanos silenciosos para la cola (Commit 4):
-- estado='aprobado' AND venta_id IS NULL AND pagado_en < umbral.
CREATE INDEX IF NOT EXISTS intentos_cobro_mp_huerfanos_idx
  ON intentos_cobro_mp (comercio_id, pagado_en)
  WHERE estado = 'aprobado' AND venta_id IS NULL;

-- ───── 4. RLS de mp_resoluciones_cobro ──────────────────────────────
-- SELECT + INSERT solo admin del comercio. SIN UPDATE. SIN DELETE.
-- El INSERT en la práctica siempre entra vía la RPC, pero la policy
-- es idéntica en cualquier caso (SECURITY INVOKER).

ALTER TABLE mp_resoluciones_cobro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mp_resoluciones_admin_read"   ON mp_resoluciones_cobro;
DROP POLICY IF EXISTS "mp_resoluciones_admin_insert" ON mp_resoluciones_cobro;

CREATE POLICY "mp_resoluciones_admin_read" ON mp_resoluciones_cobro
  FOR SELECT
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin');

CREATE POLICY "mp_resoluciones_admin_insert" ON mp_resoluciones_cobro
  FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

-- Sin policy de UPDATE ni DELETE → inmutable para todos los roles.

-- ───── 5. RPC resolver_intento_mp — transaccional ───────────────────
--
-- Única vía legítima para requiere_revision → resuelto. En UNA
-- transacción (la función plpgsql es atómica):
--   a. Valida rol admin (get_rol() — defensa en profundidad; la RLS
--      laxa de intentos_cobro_mp permite UPDATE a cualquier rol del
--      comercio, acá lo cerramos).
--   b. Lockea el intento (FOR UPDATE) + valida comercio y estado.
--   c. Valida la acción y sus requisitos (venta del mismo comercio,
--      nota en descartado).
--   d. INSERT en mp_resoluciones_cobro.
--   e. UPDATE del intento → estado='resuelto' (+ venta_id si aplica).
-- Si cualquier paso falla → rollback completo, sin estado intermedio.
--
-- SECURITY INVOKER: corre con los permisos del caller — las RLS de
-- ambas tablas aplican además de los checks explícitos.

CREATE OR REPLACE FUNCTION resolver_intento_mp(
  p_intento_id uuid,
  p_accion     text,
  p_venta_id   uuid DEFAULT NULL,
  p_nota       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comercio      uuid;
  v_intento       intentos_cobro_mp%ROWTYPE;
  v_venta_comercio uuid;
  v_resolucion_id uuid;
  v_nota          text;
BEGIN
  -- a. Solo admin resuelve.
  IF get_rol() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'solo_admin'
      USING DETAIL = 'Solo un administrador puede resolver cobros en revisión.';
  END IF;

  v_comercio := get_comercio_id();
  IF v_comercio IS NULL THEN
    RAISE EXCEPTION 'no_session';
  END IF;

  -- b. Lock + validación del intento.
  SELECT * INTO v_intento
  FROM intentos_cobro_mp
  WHERE id = p_intento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'intento_no_encontrado';
  END IF;
  IF v_intento.comercio_id <> v_comercio THEN
    -- RLS ya lo filtra (SELECT devolvería 0 filas), pero por si la
    -- policy cambia: check explícito.
    RAISE EXCEPTION 'intento_no_encontrado';
  END IF;
  IF v_intento.estado <> 'requiere_revision' THEN
    RAISE EXCEPTION 'estado_invalido'
      USING DETAIL = format('el intento está en estado "%s"; solo requiere_revision se puede resolver', v_intento.estado);
  END IF;

  -- c. Validar acción + requisitos.
  IF p_accion NOT IN ('venta_registrada', 'venta_asociada', 'reembolsado', 'descartado') THEN
    RAISE EXCEPTION 'accion_invalida'
      USING DETAIL = format('acción "%s" no soportada', p_accion);
  END IF;

  v_nota := NULLIF(trim(COALESCE(p_nota, '')), '');

  IF p_accion IN ('venta_registrada', 'venta_asociada') THEN
    IF p_venta_id IS NULL THEN
      RAISE EXCEPTION 'venta_requerida'
        USING DETAIL = format('la acción "%s" requiere p_venta_id', p_accion);
    END IF;
    SELECT comercio_id INTO v_venta_comercio FROM ventas WHERE id = p_venta_id;
    IF NOT FOUND OR v_venta_comercio <> v_comercio THEN
      RAISE EXCEPTION 'venta_no_encontrada'
        USING DETAIL = 'la venta no existe o no pertenece a este comercio';
    END IF;
  ELSE
    -- reembolsado / descartado no llevan venta.
    IF p_venta_id IS NOT NULL THEN
      RAISE EXCEPTION 'venta_no_corresponde'
        USING DETAIL = format('la acción "%s" no acepta p_venta_id', p_accion);
    END IF;
  END IF;

  IF p_accion = 'descartado' AND v_nota IS NULL THEN
    RAISE EXCEPTION 'nota_requerida'
      USING DETAIL = 'descartar exige una nota explicando la conciliación';
  END IF;

  -- d. Auditoría (INSERT-only).
  INSERT INTO mp_resoluciones_cobro (
    intento_id, comercio_id, accion, venta_id, nota, resuelto_por
  ) VALUES (
    v_intento.id, v_comercio, p_accion, p_venta_id, v_nota, auth.uid()
  )
  RETURNING id INTO v_resolucion_id;

  -- e. Cierre del intento. El WHERE estado repite el guard por si
  -- hubiera una race con otro admin resolviendo en paralelo (el
  -- FOR UPDATE ya serializa, esto es cinturón y tiradores).
  UPDATE intentos_cobro_mp
  SET estado = 'resuelto',
      venta_id = COALESCE(p_venta_id, venta_id)
  WHERE id = v_intento.id
    AND estado = 'requiere_revision';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'race_detectada'
      USING DETAIL = 'el intento cambió de estado durante la resolución';
  END IF;

  RETURN jsonb_build_object(
    'resolucion_id', v_resolucion_id,
    'intento_id',    v_intento.id,
    'accion',        p_accion,
    'estado',        'resuelto'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION resolver_intento_mp(uuid, text, uuid, text) TO authenticated;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- SMOKE TESTS — correr después del COMMIT
-- ═══════════════════════════════════════════════════════════════════

-- 1. CHECK acepta los 7 estados.
-- SELECT pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- WHERE con.conrelid = 'intentos_cobro_mp'::regclass
--   AND con.conname = 'intentos_cobro_mp_estado_check';
-- ✓ Esperado: incluye 'resuelto'.

-- 2. Columna items_snapshot existe.
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'intentos_cobro_mp' AND column_name = 'items_snapshot';
-- ✓ Esperado: 1 fila, jsonb.

-- 3. Tabla + policies de auditoría.
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'mp_resoluciones_cobro';
-- ✓ Esperado: EXACTAMENTE 2 policies (SELECT + INSERT). Ninguna de
--   UPDATE ni DELETE.

-- 4. RPC existe con la firma correcta.
-- SELECT proname, pg_get_function_arguments(oid)
-- FROM pg_proc WHERE proname = 'resolver_intento_mp';
-- ✓ Esperado: p_intento_id uuid, p_accion text, p_venta_id uuid, p_nota text.

-- 5. Funcional (como admin logueado, via SQL editor con rol de servicio
--    NO sirve — get_rol() devuelve NULL. Probar desde el cliente en
--    Commit 4, o impersonando un usuario):
--    a. Crear intento de prueba en requiere_revision:
--       INSERT INTO intentos_cobro_mp (comercio_id, external_reference,
--         monto, metodo, estado, mp_status_detail, expira_en, creado_por, pagado_en)
--       VALUES ('<COMERCIO>', 'sy_smoke_rev_1', 100, 'qr',
--         'requiere_revision', 'smoke', now(), '<PERFIL>', now());
--    b. SELECT resolver_intento_mp('<INTENTO_ID>', 'descartado', NULL, 'smoke test');
--       ✓ jsonb con estado='resuelto'.
--    c. SELECT estado FROM intentos_cobro_mp WHERE id = '<INTENTO_ID>';
--       ✓ 'resuelto'.
--    d. SELECT accion, nota FROM mp_resoluciones_cobro WHERE intento_id = '<INTENTO_ID>';
--       ✓ 1 fila ('descartado', 'smoke test').
--    e. Re-resolver el mismo intento:
--       SELECT resolver_intento_mp('<INTENTO_ID>', 'reembolsado', NULL, NULL);
--       ✓ ERROR estado_invalido (ya está resuelto — idempotencia).
--    f. UPDATE mp_resoluciones_cobro SET nota = 'x' WHERE intento_id = '<INTENTO_ID>';
--       ✓ 0 filas (sin policy de UPDATE — inmutable).
--    Cleanup:
--       (las FK impiden borrar la resolución; dejar los rows de smoke
--        o borrarlos con service role: primero resolución, después intento)
