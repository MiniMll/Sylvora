-- ═══════════════════════════════════════════════════════════════════
-- Migración: Mercado Pago Cobros V1 — credenciales + intentos
-- ═══════════════════════════════════════════════════════════════════
--
-- Habilita el flow de cobros con MP (QR dinámico + link de pago) en
-- el modelo "Opción A": Sylvora NO toca dinero, NO cobra comisión.
-- Cada comerciante conecta SU cuenta MP vía OAuth (Authorization
-- Code Flow + PKCE) y el dinero va directo del cliente a su cuenta.
--
-- Aprobado en feat/mercado-pago-cobros-v1 (Commit 2). Ver spec
-- completo en docs/mercado-pago-cobros-spec.md.
--
-- ───────────────────────────────────────────────────────────────────
-- Qué crea esta migración:
--
--   1. mp_credenciales        — 1 fila por comercio. Tokens OAuth +
--                                store_id_mp + external_pos_id creados
--                                en el onboarding.
--   2. intentos_cobro_mp      — 1 fila por intento de cobro (estado:
--                                pendiente → aprobado/rechazado/cancelado/
--                                expirado). La venta se persiste recién
--                                cuando estado='aprobado'.
--   3. ALTER ventas           — agrega FK metodo_pago_mp_intento_id
--                                para trazabilidad bidireccional.
--   4. RLS                    — credenciales admin-only; intentos
--                                accesibles por cualquier rol del
--                                comercio (cajero los crea desde POS).
--   5. Trigger actualizado_en — mantiene timestamp en intentos_cobro_mp.
--
-- ───────────────────────────────────────────────────────────────────
-- Notas de seguridad:
--
--   - access_token y refresh_token se guardan CIFRADOS app-level
--     (AES-256-GCM con clave en env, ver lib/mp/crypto.ts del próximo
--     commit). La DB nunca ve el plaintext. RLS contiene como segunda
--     capa.
--   - El webhook handler de MP usa service role (no tiene cookie del
--     usuario). RLS no aplica a service role.
--   - user_id_mp es el seller ID de MP — el campo que mandan los
--     webhooks para identificar a qué comercio pertenece el evento.
--     UNIQUE para que el webhook handler haga lookup directo.
--
-- ───────────────────────────────────────────────────────────────────
-- IDEMPOTENTE: re-runnable. CREATE TABLE IF NOT EXISTS, ADD COLUMN
-- IF NOT EXISTS, DROP POLICY + CREATE POLICY, CREATE OR REPLACE
-- FUNCTION. Si ya corrió, la segunda corrida es no-op.
--
-- Aplicar:
--   Pegar todo el archivo en Supabase SQL Editor → Run.
--   Smoke tests al final (comentados) — descomentar para verificar.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;


-- ═══════════════════════════════════════════════════════════════════
-- 1. mp_credenciales — credenciales OAuth por comercio
-- ═══════════════════════════════════════════════════════════════════
--
-- 1 fila por comercio. El PK es comercio_id porque un comercio puede
-- tener UNA sola cuenta MP conectada en V1. Si en el futuro se
-- soporta multi-cuenta MP por comercio, se rompe el PK y se agrega
-- un id propio.
--
-- Tokens van cifrados app-level (los campos son text pero el contenido
-- es base64 del ciphertext). DB nunca ve plaintext.
--
-- user_id_mp UNIQUE: para que el webhook handler (que recibe
-- payload.user_id) haga un lookup O(1) → comercio_id.

CREATE TABLE IF NOT EXISTS mp_credenciales (
  comercio_id      uuid PRIMARY KEY REFERENCES comercios(id) ON DELETE CASCADE,

  -- OAuth tokens (cifrados app-level antes del INSERT).
  access_token     text   NOT NULL,
  refresh_token    text   NOT NULL,
  expira_en        timestamptz NOT NULL,   -- expiración del access_token

  -- Identificadores de la cuenta MP del comerciante.
  user_id_mp       bigint NOT NULL UNIQUE, -- seller id en MP
  public_key       text   NOT NULL,        -- key pública del comerciante (no sensible)

  -- Setup post-OAuth: Store + POS creados en la cuenta del seller via API.
  -- Necesarios para usar la Orders API (campo config.qr.external_pos_id).
  -- Se crean en el callback del OAuth y se guardan acá.
  store_id_mp      text   NOT NULL,
  external_pos_id  text   NOT NULL,

  -- Lifecycle / auditoría.
  conectado_en     timestamptz NOT NULL DEFAULT now(),
  conectado_por    uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mp_credenciales IS
  'Credenciales OAuth de Mercado Pago por comercio. Tokens cifrados app-level. 1 cuenta MP por comercio en V1.';

COMMENT ON COLUMN mp_credenciales.access_token IS
  'Cifrado app-level (AES-256-GCM). Válido 180 días según MP.';

COMMENT ON COLUMN mp_credenciales.user_id_mp IS
  'Seller ID del comerciante en MP. Coincide con el campo user_id de los webhooks — clave para enrutar notificaciones al comercio correcto.';

COMMENT ON COLUMN mp_credenciales.external_pos_id IS
  'External ID del POS creado en la cuenta MP del seller (POST /pos via API). Requerido por Orders API en cada create order.';


-- ═══════════════════════════════════════════════════════════════════
-- 2. intentos_cobro_mp — intentos de cobro con su estado
-- ═══════════════════════════════════════════════════════════════════
--
-- Un intento = un QR/link generado para cobrar UNA venta específica.
-- Vive antes de la venta: la venta se persiste cuando estado='aprobado'.
-- Si el intento expira o se cancela, no se gasta stock.
--
-- external_reference: id que mandamos a MP en la Order y que vuelve
-- en el webhook. Formato sugerido (app-level): "sy_<intento_id_sin_hyphens>"
-- → 32+3 = 35 chars (dentro del límite MP de 64).
--
-- mp_payment_id: id del Payment en MP. Se llena cuando llega el
-- webhook payment.* — ANTES del primer webhook es NULL.

CREATE TABLE IF NOT EXISTS intentos_cobro_mp (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id         uuid NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,

  -- Venta asociada. NULL mientras pendiente — se llena cuando el cobro
  -- se aprueba y el frontend dispara crear_venta.
  venta_id            uuid REFERENCES ventas(id) ON DELETE SET NULL,

  -- Identificadores hacia MP.
  external_reference  text   NOT NULL UNIQUE,    -- ida: lo mandamos al crear la Order
  order_id_mp         text,                       -- vuelta: id de Order que devuelve MP
  qr_data             text,                       -- contenido para renderizar el QR dinámico
  checkout_url        text,                       -- URL de "link de pago" (fallback)

  -- Datos de la transacción.
  monto               numeric(12, 2) NOT NULL CHECK (monto > 0),
  metodo              text NOT NULL CHECK (metodo IN ('qr', 'link')),

  -- Estado del lifecycle.
  estado              text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'expirado')),

  -- Resultado del webhook.
  mp_payment_id       bigint,            -- llega en el webhook payment.created/updated
  mp_status_detail    text,              -- razón del rechazo (cuando aplica)
  pagado_en           timestamptz,       -- timestamp de aprobación

  -- Auditoría.
  creado_por          uuid NOT NULL REFERENCES perfiles(id) ON DELETE RESTRICT,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  expira_en           timestamptz NOT NULL,        -- creado_en + 10 min (configurable app-level)
  actualizado_en      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE intentos_cobro_mp IS
  'Intentos de cobro MP. Estado pendiente → aprobado/rechazado/cancelado/expirado. La venta asociada se crea recién cuando estado=aprobado.';

COMMENT ON COLUMN intentos_cobro_mp.external_reference IS
  'Id propio que mandamos a MP. Vuelve en el webhook. Lookup primario para idempotencia.';

COMMENT ON COLUMN intentos_cobro_mp.expira_en IS
  'Timestamp de expiración del QR. Si webhook no llega antes, estado pasa lazy a expirado en el próximo lookup.';


-- ═══════════════════════════════════════════════════════════════════
-- 3. Trigger — mantener actualizado_en en intentos_cobro_mp
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION intentos_cobro_mp_set_actualizado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS intentos_cobro_mp_actualizado ON intentos_cobro_mp;
CREATE TRIGGER intentos_cobro_mp_actualizado
  BEFORE UPDATE ON intentos_cobro_mp
  FOR EACH ROW
  EXECUTE FUNCTION intentos_cobro_mp_set_actualizado();

-- Mismo trigger para mp_credenciales.
DROP TRIGGER IF EXISTS mp_credenciales_actualizado ON mp_credenciales;
CREATE TRIGGER mp_credenciales_actualizado
  BEFORE UPDATE ON mp_credenciales
  FOR EACH ROW
  EXECUTE FUNCTION intentos_cobro_mp_set_actualizado();


-- ═══════════════════════════════════════════════════════════════════
-- 4. ALTER ventas — FK al intento de cobro
-- ═══════════════════════════════════════════════════════════════════
--
-- Trazabilidad bidireccional. Una venta cobrada con MP queda apuntando
-- al intento que la originó. NULL para ventas cobradas en efectivo,
-- débito, etc.
--
-- ON DELETE SET NULL: si por algún motivo se borra el intento (no
-- debería pasar — borramos lógicamente con estado=cancelado), la
-- venta no se rompe.

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS metodo_pago_mp_intento_id uuid
  REFERENCES intentos_cobro_mp(id) ON DELETE SET NULL;

COMMENT ON COLUMN ventas.metodo_pago_mp_intento_id IS
  'FK al intento_cobro_mp que originó la venta. NULL si la venta no se cobró por MP.';


-- ═══════════════════════════════════════════════════════════════════
-- 5. Índices
-- ═══════════════════════════════════════════════════════════════════

-- Listado del admin: "intentos de mi comercio, los pendientes primero".
CREATE INDEX IF NOT EXISTS intentos_cobro_mp_comercio_estado_idx
  ON intentos_cobro_mp (comercio_id, estado, creado_en DESC);

-- Lookup por mp_payment_id (webhook handler busca el intento por
-- payment_id si el external_reference no matchea). Partial: la mayoría
-- de intentos pendientes no tienen payment_id todavía.
CREATE INDEX IF NOT EXISTS intentos_cobro_mp_payment_id_idx
  ON intentos_cobro_mp (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

-- Lookup desde ventas → intento (cuando hay reverse query).
CREATE INDEX IF NOT EXISTS intentos_cobro_mp_venta_id_idx
  ON intentos_cobro_mp (venta_id)
  WHERE venta_id IS NOT NULL;

-- Cleanup / sweep de expirados pendientes. Partial para que sea chico.
CREATE INDEX IF NOT EXISTS intentos_cobro_mp_pendientes_expira_idx
  ON intentos_cobro_mp (expira_en)
  WHERE estado = 'pendiente';

-- ventas → intento (poco usado, pero la FK lo va a aprovechar).
CREATE INDEX IF NOT EXISTS ventas_mp_intento_idx
  ON ventas (metodo_pago_mp_intento_id)
  WHERE metodo_pago_mp_intento_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════
-- 6. RLS — mp_credenciales (admin only)
-- ═══════════════════════════════════════════════════════════════════
--
-- Solo el admin del comercio puede leer/escribir credenciales. Encargado
-- y cajero no las ven (contienen tokens, aún cifrados). El webhook
-- handler usa service role y bypasea RLS.

ALTER TABLE mp_credenciales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mp_credenciales_admin_read"   ON mp_credenciales;
DROP POLICY IF EXISTS "mp_credenciales_admin_write"  ON mp_credenciales;
DROP POLICY IF EXISTS "mp_credenciales_admin_update" ON mp_credenciales;
DROP POLICY IF EXISTS "mp_credenciales_admin_delete" ON mp_credenciales;

CREATE POLICY "mp_credenciales_admin_read" ON mp_credenciales
  FOR SELECT
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin');

CREATE POLICY "mp_credenciales_admin_write" ON mp_credenciales
  FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

CREATE POLICY "mp_credenciales_admin_update" ON mp_credenciales
  FOR UPDATE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin')
  WITH CHECK (comercio_id = get_comercio_id() AND get_rol() = 'admin');

CREATE POLICY "mp_credenciales_admin_delete" ON mp_credenciales
  FOR DELETE
  USING (comercio_id = get_comercio_id() AND get_rol() = 'admin');


-- ═══════════════════════════════════════════════════════════════════
-- 7. RLS — intentos_cobro_mp (todos los roles del comercio)
-- ═══════════════════════════════════════════════════════════════════
--
-- Cualquier rol del comercio puede:
--   - SELECT: para el polling del POS (incluye cajero).
--   - INSERT: al iniciar un cobro desde el POS (cualquiera con venta.crear,
--             que son los 3 roles).
--   - UPDATE: para cancelar el intento. Sin restricción de "solo el
--             creador" — encargado/admin puede cancelar el cobro que
--             arrancó un cajero (caso real: cajero abandonó la pantalla).
--
-- DELETE: NADIE. Los intentos se conservan para auditoría. Cancelar
-- es UPDATE estado='cancelado'.
--
-- Service role (webhook) bypasea todo esto.

ALTER TABLE intentos_cobro_mp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intentos_cobro_mp_read"   ON intentos_cobro_mp;
DROP POLICY IF EXISTS "intentos_cobro_mp_insert" ON intentos_cobro_mp;
DROP POLICY IF EXISTS "intentos_cobro_mp_update" ON intentos_cobro_mp;

CREATE POLICY "intentos_cobro_mp_read" ON intentos_cobro_mp
  FOR SELECT
  USING (comercio_id = get_comercio_id());

CREATE POLICY "intentos_cobro_mp_insert" ON intentos_cobro_mp
  FOR INSERT
  WITH CHECK (comercio_id = get_comercio_id());

CREATE POLICY "intentos_cobro_mp_update" ON intentos_cobro_mp
  FOR UPDATE
  USING (comercio_id = get_comercio_id())
  WITH CHECK (comercio_id = get_comercio_id());

-- Sin policy de DELETE → nadie puede borrar (ni siquiera admin).


COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- SMOKE TESTS — descomentar y correr DESPUÉS del COMMIT
-- ═══════════════════════════════════════════════════════════════════
--
-- Estos checks NO modifican data. Son SELECTs de verificación.
-- Si todos devuelven OK, la migración quedó bien aplicada.

-- 1. Tablas existen.
-- SELECT
--   to_regclass('public.mp_credenciales')   AS mp_credenciales,
--   to_regclass('public.intentos_cobro_mp') AS intentos_cobro_mp;
-- Esperado: ambas devuelven el oid (no NULL).

-- 2. Columna nueva en ventas.
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'ventas' AND column_name = 'metodo_pago_mp_intento_id';
-- Esperado: 1 fila, data_type=uuid, is_nullable=YES.

-- 3. CHECK constraints en intentos_cobro_mp.
-- SELECT con.conname, pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- WHERE con.conrelid = 'intentos_cobro_mp'::regclass
--   AND con.contype = 'c';
-- Esperado: 2 CHECK (monto > 0, estado IN (...), metodo IN (...)).

-- 4. Índices creados.
-- SELECT indexname
-- FROM pg_indexes
-- WHERE tablename IN ('mp_credenciales', 'intentos_cobro_mp', 'ventas')
--   AND indexname LIKE '%mp%'
-- ORDER BY indexname;
-- Esperado: 5+ índices listados.

-- 5. Policies de RLS activas.
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('mp_credenciales', 'intentos_cobro_mp')
-- ORDER BY tablename, policyname;
-- Esperado: 7 policies (4 en mp_credenciales, 3 en intentos_cobro_mp).

-- 6. RLS habilitada.
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN ('mp_credenciales', 'intentos_cobro_mp');
-- Esperado: relrowsecurity = true en ambas.

-- 7. Triggers de actualizado_en.
-- SELECT trigger_name, event_object_table
-- FROM information_schema.triggers
-- WHERE trigger_name LIKE '%mp%actualizado%' OR trigger_name LIKE '%intentos%actualizado%';
-- Esperado: 2 triggers (uno por tabla).

-- ═══════════════════════════════════════════════════════════════════
-- SMOKE TEST FUNCIONAL (manual) — opcional
-- ═══════════════════════════════════════════════════════════════════
--
-- Estos sí escriben data. Solo correr en sandbox / staging.
-- Reemplazar <COMERCIO_ID> y <PERFIL_ADMIN_ID> con valores reales.
--
-- a) Insertar credencial dummy (debe pasar como admin del comercio):
-- INSERT INTO mp_credenciales (
--   comercio_id, access_token, refresh_token, expira_en,
--   user_id_mp, public_key, store_id_mp, external_pos_id, conectado_por
-- ) VALUES (
--   '<COMERCIO_ID>',
--   'CIPHER_PLACEHOLDER_AT',
--   'CIPHER_PLACEHOLDER_RT',
--   now() + interval '180 days',
--   9999999999,
--   'TEST-pub-key',
--   'STORE_TEST',
--   'POS_TEST',
--   '<PERFIL_ADMIN_ID>'
-- );
--
-- b) Insertar intento (debe pasar como cualquier rol del comercio):
-- INSERT INTO intentos_cobro_mp (
--   comercio_id, external_reference, monto, metodo,
--   expira_en, creado_por
-- ) VALUES (
--   '<COMERCIO_ID>',
--   'sy_smoke_' || gen_random_uuid()::text,
--   1500.00, 'qr',
--   now() + interval '10 minutes',
--   '<PERFIL_ADMIN_ID>'
-- ) RETURNING id, estado, creado_en;
--
-- c) Update simulando webhook aprobado:
-- UPDATE intentos_cobro_mp
-- SET estado = 'aprobado', mp_payment_id = 1111111, pagado_en = now()
-- WHERE id = '<INTENTO_ID>';
-- → verificar que actualizado_en > creado_en.
--
-- d) Intento de DELETE (debe fallar — sin policy):
-- DELETE FROM intentos_cobro_mp WHERE id = '<INTENTO_ID>';
-- → "new row violates row-level security policy" o "0 rows" según
--    cómo combine PG. Lo importante: la fila sigue existiendo.
--
-- Cleanup smoke test:
-- DELETE FROM intentos_cobro_mp WHERE external_reference LIKE 'sy_smoke_%';
-- (solo posible vía service role / dashboard SQL editor.)
