-- ═══════════════════════════════════════════════════════════════════
-- Seed: cuenta demo compartida de Sylvora.
-- ═══════════════════════════════════════════════════════════════════
--
-- Objetivo: que cualquier visitante que clickee "Ver demo" en la
-- landing entre a un comercio con productos, ventas, caja y métricas
-- que se vean reales. Argentino, creíble, vivo desde el segundo 1.
--
-- Arquitectura V1 (ver propuesta del sprint feat/demo-cuenta-v1):
--   - UN comercio demo fijo con UUID estable.
--   - UN usuario auth fijo (demo@sylvora.app).
--   - plan='active' permanente → nunca aparece TrialBanner ni
--     TrialBlocked en la demo.
--   - DemoBanner sticky (commit siguiente) avisa "Estás viendo una demo".
--   - Reset cron diario (commit posterior) restaura este estado.
--   - Escudo UX (commit posterior) deshabilita acciones destructivas
--     (cambiar password, invitar usuarios, etc.) cuando el comercio
--     activo es el demo.
--
-- ───── ANTES DE EJECUTAR ─────────────────────────────────────────────
--
-- 1. Crear el usuario demo VÍA SUPABASE DASHBOARD (NO desde SQL).
--    Auth.users / auth.identities son frágiles de seedear a mano —
--    GoTrue agrega columnas y validadores entre versiones, y un
--    INSERT directo que pasaba ayer puede dejar el user en estado
--    inválido (500 al login). El Dashboard usa la API interna y
--    siempre genera filas válidas.
--
--    Dashboard → Authentication → Users → Add user → Create new user:
--      - Email: demo@sylvora.app
--      - Password: la misma que vas a poner en DEMO_PASSWORD de Vercel
--      - Auto Confirm User: SÍ (sin esto, login falla pidiendo verificación)
--
-- 2. Verificar que el UID generado coincide con el hardcodeado abajo
--    (673d3398-9581-4744-8bfd-5ec472ec3a84). Si Supabase generó otro,
--    hacer find-and-replace de ese UUID en todo este archivo (3
--    ocurrencias) antes de aplicar.
--
-- 3. Aplicar pegando el contenido completo en Supabase Dashboard →
--    SQL Editor → Run. NO usa variables psql, corre tal cual.
--
-- 4. Verificación rápida post-run al final del archivo.
--
-- IDEMPOTENTE: el script es re-runnable. DELETE selectivo del
-- comercio demo + INSERT fresh garantiza que repetir nunca duplica
-- ni deja basura. Si rotás la password del user demo desde el
-- Dashboard, NO hace falta re-correr este seed — la pass vive en
-- auth.users (que no tocamos), y este script solo gestiona datos
-- de aplicación.
--
-- DATOS ARGENTINOS:
--   - Productos con marcas reales (Coca-Cola, Quilmes, Marlboro,
--     La Serenísima, Matarazzo, Sancor, Playadito, etc.).
--   - Precios calibrados a contexto AR 2025-2026.
--   - Mix de categorías típicas de almacén/kiosco: Bebidas, Lácteos,
--     Almacén, Snacks, Cigarrillos, Limpieza, Fiambres.
--   - Stocks variados: 5 productos con stock crítico (1-5) para
--     que el dashboard de stock bajo tenga señal real.
--   - Ventas distribuidas en los últimos 7 días con timestamps
--     relativos a now() → la demo siempre se ve reciente.

-- ═══════════════════════════════════════════════════════════════════
-- UUIDs hardcodeados — editar SOLO si cambia el comercio o usuario
-- ═══════════════════════════════════════════════════════════════════
-- USUARIO_DEMO_ID = '673d3398-9581-4744-8bfd-5ec472ec3a84'
--   UID del user auth demo@sylvora.app (creado vía Dashboard).
--   Si rotás el user en otra DB, reemplazá todas las apariciones
--   del UUID con find-and-replace (3 ocurrencias).
--
-- COMERCIO_DEMO_ID = 'dddddddd-1111-1111-1111-111111111111'
--   Lo referencia el frontend en lib/demo.ts para detectar
--   "modo demo". Si lo cambiás, actualizá también esa constante.
--
-- NOTA: este archivo NO usa variables psql (\set) — corre tal cual
-- en Supabase SQL Editor. Si querés generalizarlo, hacé find-and-
-- replace de los UUIDs antes de pegar.

BEGIN;

-- pgcrypto NO se usa más (antes era para crypt() del password). Si
-- la habías instalado por este seed, no hace falta dropearla — no
-- molesta y otros usos futuros la pueden necesitar.

-- ───── Guard: el auth user debe existir ─────────────────────────────
-- Si no existe (te olvidaste de crear el user en el Dashboard o de
-- pegar el UID arriba), fallamos rápido con mensaje claro en lugar
-- de fallar más adelante al insertar perfiles con FK rota.

DO $$
DECLARE
  v_existe boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = '673d3398-9581-4744-8bfd-5ec472ec3a84'::uuid)
    INTO v_existe;
  IF NOT v_existe THEN
    RAISE EXCEPTION
      'auth.users no contiene el UUID demo (673d3398-9581-4744-8bfd-5ec472ec3a84). Crear demo@sylvora.app en Supabase Dashboard → Authentication → Users (Auto Confirm = SÍ) y luego reemplazar el UUID literal en este script si el dashboard generó uno distinto.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 1. COMERCIO DEMO
-- ═══════════════════════════════════════════════════════════════════
-- plan='active' permanente, trial_ends_at en el futuro lejano por si
-- alguna validación lo chequea aunque plan ya esté activo.

INSERT INTO comercios (id, nombre, tipo, telefono, email, direccion, plan, trial_ends_at)
VALUES (
  'dddddddd-1111-1111-1111-111111111111',
  'Almacén La Esquina',
  'almacen',
  '+54 11 4555-1234',
  'demo@sylvora.app',
  'Av. Rivadavia 5500, CABA',
  'active',
  now() + interval '100 years'
)
ON CONFLICT (id) DO UPDATE
  SET nombre        = EXCLUDED.nombre,
      tipo          = EXCLUDED.tipo,
      telefono      = EXCLUDED.telefono,
      email         = EXCLUDED.email,
      direccion     = EXCLUDED.direccion,
      plan          = 'active',
      trial_ends_at = EXCLUDED.trial_ends_at;

-- ═══════════════════════════════════════════════════════════════════
-- 2. PERFIL (link comercio ←→ usuario auth creado vía Dashboard)
-- ═══════════════════════════════════════════════════════════════════
-- El usuario auth.users ya existe (creado vía Dashboard, pasos 1-2
-- del header). Acá solo gestionamos el perfil que linkea ese user
-- al comercio demo.
--
-- Nota: si el perfil quedó borrado por ON DELETE CASCADE al re-crear
-- el user demo en el Dashboard, este INSERT lo recrea limpio.

INSERT INTO perfiles (id, comercio_id, nombre, rol)
VALUES (
  '673d3398-9581-4744-8bfd-5ec472ec3a84'::uuid,
  'dddddddd-1111-1111-1111-111111111111',
  'Demo Sylvora',
  'admin'
)
ON CONFLICT (id) DO UPDATE
  SET comercio_id = EXCLUDED.comercio_id,
      nombre      = EXCLUDED.nombre,
      rol         = 'admin';

-- ═══════════════════════════════════════════════════════════════════
-- 3. LIMPIEZA — borrar datos del comercio demo antes del re-seed
-- ═══════════════════════════════════════════════════════════════════
-- ON DELETE CASCADE en ventas → items_venta → no hace falta tocar
-- items_venta a mano. Borramos en orden de dependencia.

DELETE FROM movimientos_stock WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111';
DELETE FROM movimientos_caja  WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111';
DELETE FROM cierres_caja      WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111';
DELETE FROM aperturas_caja    WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111';
DELETE FROM ventas            WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111';
DELETE FROM lotes             WHERE producto_id IN (
  SELECT id FROM productos WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111'
);
DELETE FROM productos         WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111';

-- ═══════════════════════════════════════════════════════════════════
-- 4. PRODUCTOS — catálogo realista de almacén argentino
-- ═══════════════════════════════════════════════════════════════════
-- 36 productos. Mix de categorías. 5 con stock crítico (1-5) para que
-- el dashboard de stock bajo y los hints de reposición tengan señal.

INSERT INTO productos (
  id, comercio_id, nombre, sku, codigo_barras, categoria,
  precio_costo, precio_venta, precio_por_kg, stock_actual,
  stock_minimo, stock_ideal, unidad_venta, activo
) VALUES
  -- ─── Bebidas ─────────────────────────────────────────────────────
  ('dddddddd-3333-3333-3333-000000000001', 'dddddddd-1111-1111-1111-111111111111',
    'Coca-Cola 2.25L',          'COC-225',   '7790895000232', 'Bebidas',
    1950, 2890, NULL, 24, 6, 30, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000002', 'dddddddd-1111-1111-1111-111111111111',
    'Coca-Cola 500ml',          'COC-500',   '7790895000218', 'Bebidas',
    560, 850, NULL, 36, 12, 48, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000003', 'dddddddd-1111-1111-1111-111111111111',
    'Sprite 2.25L',             'SPR-225',   '7790895001147', 'Bebidas',
    1900, 2790, NULL, 18, 6, 24, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000004', 'dddddddd-1111-1111-1111-111111111111',
    'Agua Villavicencio 1.5L',  'AGU-VIL',   '7791675000018', 'Bebidas',
    640, 980, NULL, 30, 8, 40, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000005', 'dddddddd-1111-1111-1111-111111111111',
    'Cerveza Quilmes 1L',       'QUI-1L',    '7790895007026', 'Bebidas',
    1290, 1850, NULL, 4, 8, 36, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000006', 'dddddddd-1111-1111-1111-111111111111',
    'Cerveza Brahma 473ml',     'BRA-473',   '7790895045158', 'Bebidas',
    890, 1290, NULL, 24, 8, 36, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000007', 'dddddddd-1111-1111-1111-111111111111',
    'Speed energizante 250ml',  'SPD-250',   '7790070401427', 'Bebidas',
    980, 1450, NULL, 0, 6, 24, 'unidad', true),

  -- ─── Lácteos ─────────────────────────────────────────────────────
  ('dddddddd-3333-3333-3333-000000000008', 'dddddddd-1111-1111-1111-111111111111',
    'Leche La Serenísima 1L',   'LSE-1L',    '7790070038418', 'Lácteos',
    1050, 1490, NULL, 12, 6, 24, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000009', 'dddddddd-1111-1111-1111-111111111111',
    'Yogur Yogurísimo Frutilla 200g', 'YOG-FRU', '7790580127145', 'Lácteos',
    590, 890, NULL, 3, 6, 18, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000000a', 'dddddddd-1111-1111-1111-111111111111',
    'Queso Crema Casancrem 290g', 'CAS-290',  '7790070100023', 'Lácteos',
    1990, 2890, NULL, 6, 4, 12, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000000b', 'dddddddd-1111-1111-1111-111111111111',
    'Manteca La Paulina 200g',  'PAU-200',   '7790580010117', 'Lácteos',
    1490, 2190, NULL, 10, 4, 14, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000000c', 'dddddddd-1111-1111-1111-111111111111',
    'Dulce de Leche Sancor 400g', 'SAN-DDL', '7790070801593', 'Lácteos',
    1690, 2490, NULL, 14, 4, 18, 'unidad', true),

  -- ─── Almacén ─────────────────────────────────────────────────────
  ('dddddddd-3333-3333-3333-00000000000d', 'dddddddd-1111-1111-1111-111111111111',
    'Fideos Matarazzo Spaghetti 500g', 'MAT-SPA', '7793620007003', 'Almacén',
    790, 1190, NULL, 24, 8, 30, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000000e', 'dddddddd-1111-1111-1111-111111111111',
    'Arroz Gallo Oro 1kg',      'GAL-1KG',   '7790070080011', 'Almacén',
    1290, 1890, NULL, 18, 6, 24, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000000f', 'dddddddd-1111-1111-1111-111111111111',
    'Aceite Natura 900ml',      'NAT-900',   '7790070401120', 'Almacén',
    2390, 3490, NULL, 12, 4, 18, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000010', 'dddddddd-1111-1111-1111-111111111111',
    'Azúcar Ledesma 1kg',       'LED-1KG',   '7791675000605', 'Almacén',
    890, 1290, NULL, 15, 5, 20, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000011', 'dddddddd-1111-1111-1111-111111111111',
    'Sal Celusal 500g',         'CEL-500',   '7790070401205', 'Almacén',
    390, 590, NULL, 22, 6, 30, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000012', 'dddddddd-1111-1111-1111-111111111111',
    'Yerba Mate Playadito 1kg', 'PLA-1KG',   '7790070300034', 'Almacén',
    3290, 4890, NULL, 8, 4, 16, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000013', 'dddddddd-1111-1111-1111-111111111111',
    'Café La Virginia 250g',    'VIR-250',   '7790070401311', 'Almacén',
    1990, 2890, NULL, 6, 4, 12, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000014', 'dddddddd-1111-1111-1111-111111111111',
    'Harina 000 Pureza 1kg',    'PUR-1KG',   '7790070401456', 'Almacén',
    690, 990, NULL, 20, 6, 25, 'unidad', true),

  -- ─── Snacks ──────────────────────────────────────────────────────
  ('dddddddd-3333-3333-3333-000000000015', 'dddddddd-1111-1111-1111-111111111111',
    'Galletitas Oreo 117g',     'ORE-117',   '7622300858520', 'Snacks',
    890, 1390, NULL, 18, 6, 24, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000016', 'dddddddd-1111-1111-1111-111111111111',
    'Chocolate Milka Leche 100g', 'MIL-100', '7622210493210', 'Snacks',
    1290, 1890, NULL, 12, 6, 18, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000017', 'dddddddd-1111-1111-1111-111111111111',
    'Alfajor Jorgito Triple',   'JOR-TRI',   '7790070401601', 'Snacks',
    390, 590, NULL, 30, 10, 40, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000018', 'dddddddd-1111-1111-1111-111111111111',
    'Papas Lays Clásicas 110g', 'LAY-110',   '7790070401724', 'Snacks',
    990, 1450, NULL, 14, 6, 20, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000019', 'dddddddd-1111-1111-1111-111111111111',
    'Chicles Beldent Menta',    'BEL-MEN',   '7790070401831', 'Snacks',
    260, 390, NULL, 36, 12, 48, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000001a', 'dddddddd-1111-1111-1111-111111111111',
    'Caramelos Sugus',          'SUG-50',    '7790070401933', 'Snacks',
    180, 290, NULL, 40, 12, 60, 'unidad', true),

  -- ─── Cigarrillos ─────────────────────────────────────────────────
  ('dddddddd-3333-3333-3333-00000000001b', 'dddddddd-1111-1111-1111-111111111111',
    'Marlboro Box 20',          'MAR-BOX',   '7790580101015', 'Cigarrillos',
    3100, 4200, NULL, 8, 6, 20, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000001c', 'dddddddd-1111-1111-1111-111111111111',
    'Philip Morris Box 20',     'PHI-BOX',   '7790580102012', 'Cigarrillos',
    2950, 3950, NULL, 12, 6, 20, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000001d', 'dddddddd-1111-1111-1111-111111111111',
    'Lucky Strike Box 20',      'LUC-BOX',   '7790580103019', 'Cigarrillos',
    3050, 4100, NULL, 2, 6, 20, 'unidad', true),

  -- ─── Limpieza ────────────────────────────────────────────────────
  ('dddddddd-3333-3333-3333-00000000001e', 'dddddddd-1111-1111-1111-111111111111',
    'Lavandina Ayudín 1L',      'AYU-1L',    '7791293022017', 'Limpieza',
    890, 1290, NULL, 14, 6, 20, 'unidad', true),
  ('dddddddd-3333-3333-3333-00000000001f', 'dddddddd-1111-1111-1111-111111111111',
    'Detergente Magistral 750ml', 'MAG-750', '7793100150018', 'Limpieza',
    1290, 1890, NULL, 10, 4, 16, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000020', 'dddddddd-1111-1111-1111-111111111111',
    'Papel Higiénico Higienol x4', 'HIG-4',  '7793100250015', 'Limpieza',
    1690, 2490, NULL, 16, 6, 24, 'unidad', true),
  ('dddddddd-3333-3333-3333-000000000021', 'dddddddd-1111-1111-1111-111111111111',
    'Esponja Salvauñas',        'SAL-ESP',   '7793100350012', 'Limpieza',
    390, 590, NULL, 24, 8, 30, 'unidad', true),

  -- ─── Productos por peso ──────────────────────────────────────────
  ('dddddddd-3333-3333-3333-000000000022', 'dddddddd-1111-1111-1111-111111111111',
    'Pan Lactal',               'PAN-LAC',   NULL, 'Almacén',
    2900, 0, 4500, 3.5, 2, 8, 'kg', true),
  ('dddddddd-3333-3333-3333-000000000023', 'dddddddd-1111-1111-1111-111111111111',
    'Jamón Cocido',             'FIA-JAM',   NULL, 'Fiambres',
    7800, 0, 12000, 2.2, 1, 5, 'kg', true),
  ('dddddddd-3333-3333-3333-000000000024', 'dddddddd-1111-1111-1111-111111111111',
    'Queso Cremoso',            'FIA-QUE',   NULL, 'Fiambres',
    6500, 0, 10500, 1.8, 1, 4, 'kg', true);

-- ═══════════════════════════════════════════════════════════════════
-- 5. VENTAS HISTÓRICAS (últimos 7 días)
-- ═══════════════════════════════════════════════════════════════════
-- 20 ventas con timestamps relativos a now() → siempre se ven recientes.
-- Distribución: más ventas en tardes, mix de métodos de pago,
-- algunos descuentos. numero_ticket lo asigna el trigger.
--
-- Patrón: una venta por INSERT con sus items_venta inmediatamente
-- después. Los UUIDs de items son derivados del UUID de la venta
-- para que sea fácil entender el agrupamiento al leer.

-- Helper local: comodidad para no escribir el UUID del comercio en
-- cada línea. PL/pgSQL en un DO block.

-- Cada venta tiene un bloque (cabecera + items) donde subtotal =
-- sum(items.subtotal) y total = subtotal - descuento + recargo. Si
-- editás cualquier item, recalculá el subtotal/total de su venta.

DO $$
DECLARE
  v_comercio uuid := 'dddddddd-1111-1111-1111-111111111111';
  v_venta_id uuid;
BEGIN

-- ── Venta 1: hace 6 días, 10 AM — $4280 ─────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000001';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 4280, 0, 0, 0, 0, 4280, 'efectivo', 'completada',
        now() - interval '6 days' + interval '10 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000101', v_venta_id, 'dddddddd-3333-3333-3333-000000000001', 'Coca-Cola 2.25L', 1, 2890, 2890),
  ('dddddddd-5555-5555-5555-000000000102', v_venta_id, 'dddddddd-3333-3333-3333-000000000015', 'Galletitas Oreo 117g', 1, 1390, 1390);

-- ── Venta 2: hace 6 días, 5 PM — $6290 ──────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000002';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 6290, 0, 0, 0, 0, 6290, 'debito', 'completada',
        now() - interval '6 days' + interval '17 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000201', v_venta_id, 'dddddddd-3333-3333-3333-00000000001b', 'Marlboro Box 20', 1, 4200, 4200),
  ('dddddddd-5555-5555-5555-000000000202', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390),
  ('dddddddd-5555-5555-5555-000000000203', v_venta_id, 'dddddddd-3333-3333-3333-000000000002', 'Coca-Cola 500ml', 2, 850, 1700);

-- ── Venta 3: hace 5 días, 11 AM — $9120 ─────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000003';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 9120, 0, 0, 0, 0, 9120, 'efectivo', 'completada',
        now() - interval '5 days' + interval '11 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000301', v_venta_id, 'dddddddd-3333-3333-3333-000000000008', 'Leche La Serenísima 1L', 2, 1490, 2980),
  ('dddddddd-5555-5555-5555-000000000302', v_venta_id, 'dddddddd-3333-3333-3333-00000000000d', 'Fideos Matarazzo Spaghetti 500g', 3, 1190, 3570),
  ('dddddddd-5555-5555-5555-000000000303', v_venta_id, 'dddddddd-3333-3333-3333-00000000000e', 'Arroz Gallo Oro 1kg', 1, 1890, 1890),
  ('dddddddd-5555-5555-5555-000000000304', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390),
  ('dddddddd-5555-5555-5555-000000000305', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290);

-- ── Venta 4: hace 5 días, 7 PM — descuento 10% — $5982 / $5384 ──────
v_venta_id := 'dddddddd-4444-4444-4444-000000000004';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 5980, 10, 598, 0, 0, 5382, 'mercadopago', 'completada',
        now() - interval '5 days' + interval '19 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000401', v_venta_id, 'dddddddd-3333-3333-3333-000000000003', 'Sprite 2.25L', 1, 2790, 2790),
  ('dddddddd-5555-5555-5555-000000000402', v_venta_id, 'dddddddd-3333-3333-3333-000000000018', 'Papas Lays Clásicas 110g', 2, 1450, 2900),
  ('dddddddd-5555-5555-5555-000000000403', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290);

-- ── Venta 5: hace 4 días, 9 AM — $3530 ──────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000005';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 3530, 0, 0, 0, 0, 3530, 'efectivo', 'completada',
        now() - interval '4 days' + interval '9 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000501', v_venta_id, 'dddddddd-3333-3333-3333-000000000004', 'Agua Villavicencio 1.5L', 2, 980, 1960),
  ('dddddddd-5555-5555-5555-000000000502', v_venta_id, 'dddddddd-3333-3333-3333-000000000017', 'Alfajor Jorgito Triple', 2, 590, 1180),
  ('dddddddd-5555-5555-5555-000000000503', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390);

-- ── Venta 6: hace 4 días, 8 PM — $7160 ──────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000006';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 7160, 0, 0, 0, 0, 7160, 'efectivo', 'completada',
        now() - interval '4 days' + interval '20 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000601', v_venta_id, 'dddddddd-3333-3333-3333-00000000001c', 'Philip Morris Box 20', 1, 3950, 3950),
  ('dddddddd-5555-5555-5555-000000000602', v_venta_id, 'dddddddd-3333-3333-3333-000000000005', 'Cerveza Quilmes 1L', 1, 1850, 1850),
  ('dddddddd-5555-5555-5555-000000000603', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 2, 290, 580),
  ('dddddddd-5555-5555-5555-000000000604', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 2, 390, 780);

-- ── Venta 7: hace 3 días, mediodía — $12530 ─────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000007';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 12530, 0, 0, 0, 0, 12530, 'debito', 'completada',
        now() - interval '3 days' + interval '12 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000701', v_venta_id, 'dddddddd-3333-3333-3333-000000000012', 'Yerba Mate Playadito 1kg', 1, 4890, 4890),
  ('dddddddd-5555-5555-5555-000000000702', v_venta_id, 'dddddddd-3333-3333-3333-00000000000f', 'Aceite Natura 900ml', 1, 3490, 3490),
  ('dddddddd-5555-5555-5555-000000000703', v_venta_id, 'dddddddd-3333-3333-3333-000000000010', 'Azúcar Ledesma 1kg', 2, 1290, 2580),
  ('dddddddd-5555-5555-5555-000000000704', v_venta_id, 'dddddddd-3333-3333-3333-000000000011', 'Sal Celusal 500g', 2, 590, 1180),
  ('dddddddd-5555-5555-5555-000000000705', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390);

-- ── Venta 8: hace 3 días, 6 PM — fiambre por peso — $6905 ───────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000008';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 6905, 0, 0, 0, 0, 6905, 'efectivo', 'completada',
        now() - interval '3 days' + interval '18 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, peso_kg, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000801', v_venta_id, 'dddddddd-3333-3333-3333-000000000023', 'Jamón Cocido (0.3 kg)', 1, 0.3, 3600, 3600),
  ('dddddddd-5555-5555-5555-000000000802', v_venta_id, 'dddddddd-3333-3333-3333-000000000024', 'Queso Cremoso (0.25 kg)', 1, 0.25, 2625, 2625);
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000803', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390),
  ('dddddddd-5555-5555-5555-000000000804', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290);

-- ── Venta 9: hace 2 días, 10 AM — $3470 ─────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000009';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 3470, 0, 0, 0, 0, 3470, 'efectivo', 'completada',
        now() - interval '2 days' + interval '10 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000000901', v_venta_id, 'dddddddd-3333-3333-3333-00000000000c', 'Dulce de Leche Sancor 400g', 1, 2490, 2490),
  ('dddddddd-5555-5555-5555-000000000902', v_venta_id, 'dddddddd-3333-3333-3333-000000000017', 'Alfajor Jorgito Triple', 1, 590, 590),
  ('dddddddd-5555-5555-5555-000000000903', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390);

-- ── Venta 10: hace 2 días, 4 PM — $9390 ─────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-00000000000a';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 9390, 0, 0, 0, 0, 9390, 'mercadopago', 'completada',
        now() - interval '2 days' + interval '16 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001001', v_venta_id, 'dddddddd-3333-3333-3333-00000000001b', 'Marlboro Box 20', 1, 4200, 4200),
  ('dddddddd-5555-5555-5555-000000001002', v_venta_id, 'dddddddd-3333-3333-3333-000000000016', 'Chocolate Milka Leche 100g', 1, 1890, 1890),
  ('dddddddd-5555-5555-5555-000000001003', v_venta_id, 'dddddddd-3333-3333-3333-000000000005', 'Cerveza Quilmes 1L', 1, 1850, 1850),
  ('dddddddd-5555-5555-5555-000000001004', v_venta_id, 'dddddddd-3333-3333-3333-000000000018', 'Papas Lays Clásicas 110g', 1, 1450, 1450);

-- ── Venta 11: ayer, 9 AM — $2760 ────────────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-00000000000b';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 2760, 0, 0, 0, 0, 2760, 'efectivo', 'completada',
        now() - interval '1 day' + interval '9 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001101', v_venta_id, 'dddddddd-3333-3333-3333-000000000008', 'Leche La Serenísima 1L', 1, 1490, 1490),
  ('dddddddd-5555-5555-5555-000000001102', v_venta_id, 'dddddddd-3333-3333-3333-000000000017', 'Alfajor Jorgito Triple', 1, 590, 590),
  ('dddddddd-5555-5555-5555-000000001103', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290),
  ('dddddddd-5555-5555-5555-000000001104', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390);

-- ── Venta 12: ayer, 5 PM — pan por kg — $5140 ───────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-00000000000c';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 5140, 0, 0, 0, 0, 5140, 'debito', 'completada',
        now() - interval '1 day' + interval '17 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, peso_kg, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001201', v_venta_id, 'dddddddd-3333-3333-3333-000000000022', 'Pan Lactal (0.5 kg)', 1, 0.5, 2250, 2250);
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001202', v_venta_id, 'dddddddd-3333-3333-3333-00000000000a', 'Queso Crema Casancrem 290g', 1, 2890, 2890);

-- ── Venta 13: hoy, 9:15 AM — $1730 ──────────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-00000000000d';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 1730, 0, 0, 0, 0, 1730, 'efectivo', 'completada',
        date_trunc('day', now()) + interval '9 hours' + interval '15 minutes');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001301', v_venta_id, 'dddddddd-3333-3333-3333-000000000002', 'Coca-Cola 500ml', 1, 850, 850),
  ('dddddddd-5555-5555-5555-000000001302', v_venta_id, 'dddddddd-3333-3333-3333-000000000017', 'Alfajor Jorgito Triple', 1, 590, 590),
  ('dddddddd-5555-5555-5555-000000001303', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290);

-- ── Venta 14: hoy, 11 AM — $5560 ────────────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-00000000000e';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 5560, 0, 0, 0, 0, 5560, 'mercadopago', 'completada',
        date_trunc('day', now()) + interval '11 hours');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001401', v_venta_id, 'dddddddd-3333-3333-3333-00000000000e', 'Arroz Gallo Oro 1kg', 1, 1890, 1890),
  ('dddddddd-5555-5555-5555-000000001402', v_venta_id, 'dddddddd-3333-3333-3333-00000000000d', 'Fideos Matarazzo Spaghetti 500g', 2, 1190, 2380),
  ('dddddddd-5555-5555-5555-000000001403', v_venta_id, 'dddddddd-3333-3333-3333-000000000010', 'Azúcar Ledesma 1kg', 1, 1290, 1290);

-- ── Venta 15: hoy, 1:20 PM — $2970 ──────────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-00000000000f';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 2970, 0, 0, 0, 0, 2970, 'efectivo', 'completada',
        date_trunc('day', now()) + interval '13 hours' + interval '20 minutes');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001501', v_venta_id, 'dddddddd-3333-3333-3333-00000000000b', 'Manteca La Paulina 200g', 1, 2190, 2190),
  ('dddddddd-5555-5555-5555-000000001502', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 2, 390, 780);

-- ── Venta 16: hoy, 4:40 PM — $4780 ──────────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000010';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 4780, 0, 0, 0, 0, 4780, 'efectivo', 'completada',
        date_trunc('day', now()) + interval '16 hours' + interval '40 minutes');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001601', v_venta_id, 'dddddddd-3333-3333-3333-000000000001', 'Coca-Cola 2.25L', 1, 2890, 2890),
  ('dddddddd-5555-5555-5555-000000001602', v_venta_id, 'dddddddd-3333-3333-3333-000000000016', 'Chocolate Milka Leche 100g', 1, 1890, 1890);

-- ── Venta 17: hoy, 5:50 PM — $8440 ──────────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000011';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 8440, 0, 0, 0, 0, 8440, 'debito', 'completada',
        date_trunc('day', now()) + interval '17 hours' + interval '50 minutes');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001701', v_venta_id, 'dddddddd-3333-3333-3333-00000000001b', 'Marlboro Box 20', 1, 4200, 4200),
  ('dddddddd-5555-5555-5555-000000001702', v_venta_id, 'dddddddd-3333-3333-3333-000000000003', 'Sprite 2.25L', 1, 2790, 2790),
  ('dddddddd-5555-5555-5555-000000001703', v_venta_id, 'dddddddd-3333-3333-3333-000000000018', 'Papas Lays Clásicas 110g', 1, 1450, 1450);

-- ── Venta 18: hoy, 7:15 PM — $6540 ──────────────────────────────────
v_venta_id := 'dddddddd-4444-4444-4444-000000000012';
INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto,
                    recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
VALUES (v_venta_id, v_comercio, 6540, 0, 0, 0, 0, 6540, 'efectivo', 'completada',
        date_trunc('day', now()) + interval '19 hours' + interval '15 minutes');
INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
  ('dddddddd-5555-5555-5555-000000001801', v_venta_id, 'dddddddd-3333-3333-3333-000000000005', 'Cerveza Quilmes 1L', 2, 1850, 3700),
  ('dddddddd-5555-5555-5555-000000001802', v_venta_id, 'dddddddd-3333-3333-3333-000000000018', 'Papas Lays Clásicas 110g', 1, 1450, 1450),
  ('dddddddd-5555-5555-5555-000000001803', v_venta_id, 'dddddddd-3333-3333-3333-000000000015', 'Galletitas Oreo 117g', 1, 1390, 1390);

END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 6. MOVIMIENTOS DE CAJA — hoy
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO movimientos_caja (id, comercio_id, tipo, monto, descripcion, metodo_pago, created_at) VALUES
  ('dddddddd-6666-6666-6666-000000000001',
    'dddddddd-1111-1111-1111-111111111111',
    'ingreso', 50000, 'Apertura del día', 'efectivo',
    date_trunc('day', now()) + interval '8 hours'),
  ('dddddddd-6666-6666-6666-000000000002',
    'dddddddd-1111-1111-1111-111111111111',
    'egreso', 8500, 'Pago a proveedor de bebidas', 'efectivo',
    date_trunc('day', now()) + interval '10 hours' + interval '30 minutes'),
  ('dddddddd-6666-6666-6666-000000000003',
    'dddddddd-1111-1111-1111-111111111111',
    'egreso', 2400, 'Compra repuesto cortinas', 'efectivo',
    date_trunc('day', now()) + interval '14 hours' + interval '15 minutes'),
  ('dddddddd-6666-6666-6666-000000000004',
    'dddddddd-1111-1111-1111-111111111111',
    'ingreso', 15000, 'Pago de cliente cuenta corriente', 'transferencia',
    date_trunc('day', now()) + interval '15 hours' + interval '40 minutes');

-- ═══════════════════════════════════════════════════════════════════
-- 7. CIERRES DE CAJA — históricos
-- ═══════════════════════════════════════════════════════════════════
-- 2 cierres recientes para que /caja tenga historial. Los montos se
-- estiman a partir de las ventas históricas (no necesitan cuadrar
-- exacto — es demo).

-- Montos calculados a partir de las ventas históricas de cada fecha:
--   hace 2 días: ventas 9 (3470 efectivo) + 10 (9390 mp) = 12860
--   hace 1 día:  ventas 11 (2760 efectivo) + 12 (5140 debito) = 7900

INSERT INTO cierres_caja (
  id, comercio_id, fecha,
  total_ventas, total_egresos, saldo_neto, cantidad_ventas,
  efectivo, transferencia, debito, credito, mercadopago,
  efectivo_contado, diferencia_efectivo, retiro_efectivo
) VALUES
  ('dddddddd-7777-7777-7777-000000000001',
    'dddddddd-1111-1111-1111-111111111111',
    (now() - interval '2 days')::date,
    12860, 0, 12860, 2,
    3470, 0, 0, 0, 9390,
    3500, 30, 0),
  ('dddddddd-7777-7777-7777-000000000002',
    'dddddddd-1111-1111-1111-111111111111',
    (now() - interval '1 day')::date,
    7900, 0, 7900, 2,
    2760, 0, 5140, 0, 0,
    2780, 20, 0);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-SEED
-- ═══════════════════════════════════════════════════════════════════
-- Esperás (sobre el comercio demo):
--   SELECT count(*) FROM productos
--     WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111';
--   → 36
--
--   SELECT count(*) FROM ventas
--     WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111';
--   → 18
--
--   SELECT count(*) FROM items_venta
--     WHERE venta_id IN (SELECT id FROM ventas WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111');
--   → 58
--
-- Sanity: total = subtotal - descuento + recargo en cada venta.
--   SELECT count(*) FROM ventas
--     WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111'
--       AND total != subtotal - descuento_monto + recargo_monto;
--   → 0
--
-- Sanity: subtotal de cada venta = sum de items_venta.subtotal.
--   SELECT v.id, v.subtotal,
--          (SELECT sum(subtotal) FROM items_venta WHERE venta_id = v.id) AS suma_items
--   FROM ventas v
--   WHERE v.comercio_id = 'dddddddd-1111-1111-1111-111111111111'
--     AND v.subtotal != (SELECT sum(subtotal) FROM items_venta WHERE venta_id = v.id);
--   → 0 filas
--
-- Perfil linkeado al user del Dashboard:
--   SELECT u.email, p.comercio_id, p.rol
--   FROM auth.users u
--   JOIN perfiles p ON p.id = u.id
--   WHERE u.email = 'demo@sylvora.app';
--   → 1 fila: demo@sylvora.app | dddddddd-1111-... | admin
--
-- Test de login (en el navegador, NO en SQL):
--   Ir a /login, email demo@sylvora.app + password que pusiste en el
--   Dashboard al crear el user → debe entrar y ver el dashboard con
--   datos.
