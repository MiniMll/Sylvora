-- ═══════════════════════════════════════════════════════════════════
-- Cron de reset diario de la cuenta demo (Supabase pg_cron).
-- ═══════════════════════════════════════════════════════════════════
--
-- Objetivo: que la cuenta demo se restaure cada noche al estado base
-- definido por scripts/seed-demo.sql. Sin esto, los visitantes
-- ensucian la demo progresivamente (cargan productos basura,
-- venden todo el stock a 0, cambian configuraciones — aunque el
-- escudo UX cubre lo más sensible, siempre queda margen) y en 1-2
-- semanas la demo deja de ser una buena experiencia comercial.
--
-- Arquitectura:
--   - reset_demo_data(): función SECURITY DEFINER que DELETE +
--     re-INSERT todos los datos del comercio demo. NO toca el row
--     de auth.users (gestionado vía Dashboard) ni el perfil (UUID
--     estable).
--   - cron.schedule(): pg_cron corre la función a las 4am ART
--     (= 7am UTC) — horario muerto para comercios reales.
--
-- ───── Duplicación deliberada de datos ──────────────────────────────
-- Los datos que esta función inserta DEBEN coincidir con los del
-- scripts/seed-demo.sql. Hay duplicación entre los dos archivos
-- (mismo set de productos, ventas, items, caja). Si editás uno,
-- editá el otro — sino el reset cron sobrescribe los cambios con
-- el snapshot viejo.
--
-- Trade-off aceptado para V1: refactorear seed-demo.sql para
-- llamar a reset_demo_data() implicaría tocar lo que ya funciona
-- en prod. En el próximo sprint de mantenimiento de demo lo
-- consolidamos a una sola fuente.
--
-- ───── ANTES DE EJECUTAR ────────────────────────────────────────────
-- 1. Habilitar pg_cron en Supabase Dashboard → Database → Extensions
--    → buscar "pg_cron" → Enable. (No se puede via CREATE EXTENSION
--    desde el SQL Editor — requiere superuser, y Supabase gestiona
--    la activación.)
-- 2. Aplicar este script desde el SQL Editor.
-- 3. Verificación al final del archivo.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION + cron.unschedule antes
-- del schedule. Re-runnable sin efectos colaterales.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- Función reset_demo_data()
-- ═══════════════════════════════════════════════════════════════════
-- SECURITY DEFINER: corre con permisos del owner (postgres en Supabase),
-- así pg_cron puede invocarla sin pelearse con RLS.
-- search_path lock previene path injection.

CREATE OR REPLACE FUNCTION reset_demo_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comercio constant uuid := 'dddddddd-1111-1111-1111-111111111111';
  v_venta_id uuid;
BEGIN
  -- ──────────────────────────────────────────────────────────────────
  -- 1. LIMPIEZA — orden de dependencia. ventas → CASCADE → items_venta.
  -- ──────────────────────────────────────────────────────────────────
  DELETE FROM movimientos_stock WHERE comercio_id = v_comercio;
  DELETE FROM movimientos_caja  WHERE comercio_id = v_comercio;
  DELETE FROM cierres_caja      WHERE comercio_id = v_comercio;
  DELETE FROM aperturas_caja    WHERE comercio_id = v_comercio;
  DELETE FROM ventas            WHERE comercio_id = v_comercio;
  DELETE FROM lotes             WHERE producto_id IN (
    SELECT id FROM productos WHERE comercio_id = v_comercio
  );
  DELETE FROM productos         WHERE comercio_id = v_comercio;

  -- También revertimos cambios cosméticos del comercio que los
  -- visitantes hayan hecho (teléfono, email, dirección — el nombre y
  -- tipo están bloqueados por el escudo UX pero los demás campos no).
  UPDATE comercios SET
    nombre    = 'Almacén La Esquina',
    tipo      = 'almacen',
    telefono  = '+54 11 4555-1234',
    email     = 'demo@sylvora.app',
    direccion = 'Av. Rivadavia 5500, CABA',
    plan      = 'active',
    trial_ends_at = now() + interval '100 years'
  WHERE id = v_comercio;

  -- ──────────────────────────────────────────────────────────────────
  -- 2. PRODUCTOS (36 items — debe matchear seed-demo.sql)
  -- ──────────────────────────────────────────────────────────────────
  INSERT INTO productos (
    id, comercio_id, nombre, sku, codigo_barras, categoria,
    precio_costo, precio_venta, precio_por_kg, stock_actual,
    stock_minimo, stock_ideal, unidad_venta, activo
  ) VALUES
    ('dddddddd-3333-3333-3333-000000000001', v_comercio, 'Coca-Cola 2.25L',          'COC-225',   '7790895000232', 'Bebidas',     1950, 2890, NULL, 24, 6, 30, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000002', v_comercio, 'Coca-Cola 500ml',          'COC-500',   '7790895000218', 'Bebidas',      560,  850, NULL, 36, 12, 48, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000003', v_comercio, 'Sprite 2.25L',             'SPR-225',   '7790895001147', 'Bebidas',     1900, 2790, NULL, 18, 6, 24, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000004', v_comercio, 'Agua Villavicencio 1.5L',  'AGU-VIL',   '7791675000018', 'Bebidas',      640,  980, NULL, 30, 8, 40, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000005', v_comercio, 'Cerveza Quilmes 1L',       'QUI-1L',    '7790895007026', 'Bebidas',     1290, 1850, NULL,  4, 8, 36, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000006', v_comercio, 'Cerveza Brahma 473ml',     'BRA-473',   '7790895045158', 'Bebidas',      890, 1290, NULL, 24, 8, 36, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000007', v_comercio, 'Speed energizante 250ml',  'SPD-250',   '7790070401427', 'Bebidas',      980, 1450, NULL,  0, 6, 24, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000008', v_comercio, 'Leche La Serenísima 1L',   'LSE-1L',    '7790070038418', 'Lácteos',     1050, 1490, NULL, 12, 6, 24, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000009', v_comercio, 'Yogur Yogurísimo Frutilla 200g', 'YOG-FRU', '7790580127145', 'Lácteos', 590,  890, NULL,  3, 6, 18, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000000a', v_comercio, 'Queso Crema Casancrem 290g', 'CAS-290', '7790070100023', 'Lácteos',    1990, 2890, NULL,  6, 4, 12, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000000b', v_comercio, 'Manteca La Paulina 200g',  'PAU-200',   '7790580010117', 'Lácteos',    1490, 2190, NULL, 10, 4, 14, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000000c', v_comercio, 'Dulce de Leche Sancor 400g', 'SAN-DDL', '7790070801593', 'Lácteos',    1690, 2490, NULL, 14, 4, 18, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000000d', v_comercio, 'Fideos Matarazzo Spaghetti 500g', 'MAT-SPA', '7793620007003', 'Almacén', 790, 1190, NULL, 24, 8, 30, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000000e', v_comercio, 'Arroz Gallo Oro 1kg',      'GAL-1KG',   '7790070080011', 'Almacén',    1290, 1890, NULL, 18, 6, 24, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000000f', v_comercio, 'Aceite Natura 900ml',      'NAT-900',   '7790070401120', 'Almacén',    2390, 3490, NULL, 12, 4, 18, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000010', v_comercio, 'Azúcar Ledesma 1kg',       'LED-1KG',   '7791675000605', 'Almacén',     890, 1290, NULL, 15, 5, 20, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000011', v_comercio, 'Sal Celusal 500g',         'CEL-500',   '7790070401205', 'Almacén',     390,  590, NULL, 22, 6, 30, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000012', v_comercio, 'Yerba Mate Playadito 1kg', 'PLA-1KG',   '7790070300034', 'Almacén',    3290, 4890, NULL,  8, 4, 16, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000013', v_comercio, 'Café La Virginia 250g',    'VIR-250',   '7790070401311', 'Almacén',    1990, 2890, NULL,  6, 4, 12, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000014', v_comercio, 'Harina 000 Pureza 1kg',    'PUR-1KG',   '7790070401456', 'Almacén',     690,  990, NULL, 20, 6, 25, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000015', v_comercio, 'Galletitas Oreo 117g',     'ORE-117',   '7622300858520', 'Snacks',      890, 1390, NULL, 18, 6, 24, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000016', v_comercio, 'Chocolate Milka Leche 100g', 'MIL-100', '7622210493210', 'Snacks',     1290, 1890, NULL, 12, 6, 18, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000017', v_comercio, 'Alfajor Jorgito Triple',   'JOR-TRI',   '7790070401601', 'Snacks',      390,  590, NULL, 30, 10, 40, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000018', v_comercio, 'Papas Lays Clásicas 110g', 'LAY-110',   '7790070401724', 'Snacks',      990, 1450, NULL, 14, 6, 20, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000019', v_comercio, 'Chicles Beldent Menta',    'BEL-MEN',   '7790070401831', 'Snacks',      260,  390, NULL, 36, 12, 48, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000001a', v_comercio, 'Caramelos Sugus',          'SUG-50',    '7790070401933', 'Snacks',      180,  290, NULL, 40, 12, 60, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000001b', v_comercio, 'Marlboro Box 20',          'MAR-BOX',   '7790580101015', 'Cigarrillos', 3100, 4200, NULL,  8, 6, 20, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000001c', v_comercio, 'Philip Morris Box 20',     'PHI-BOX',   '7790580102012', 'Cigarrillos', 2950, 3950, NULL, 12, 6, 20, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000001d', v_comercio, 'Lucky Strike Box 20',      'LUC-BOX',   '7790580103019', 'Cigarrillos', 3050, 4100, NULL,  2, 6, 20, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000001e', v_comercio, 'Lavandina Ayudín 1L',      'AYU-1L',    '7791293022017', 'Limpieza',     890, 1290, NULL, 14, 6, 20, 'unidad', true),
    ('dddddddd-3333-3333-3333-00000000001f', v_comercio, 'Detergente Magistral 750ml', 'MAG-750', '7793100150018', 'Limpieza',    1290, 1890, NULL, 10, 4, 16, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000020', v_comercio, 'Papel Higiénico Higienol x4', 'HIG-4', '7793100250015', 'Limpieza',     1690, 2490, NULL, 16, 6, 24, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000021', v_comercio, 'Esponja Salvauñas',        'SAL-ESP',   '7793100350012', 'Limpieza',     390,  590, NULL, 24, 8, 30, 'unidad', true),
    ('dddddddd-3333-3333-3333-000000000022', v_comercio, 'Pan Lactal',               'PAN-LAC',   NULL,           'Almacén',     2900,    0, 4500, 3.5, 2, 8, 'kg', true),
    ('dddddddd-3333-3333-3333-000000000023', v_comercio, 'Jamón Cocido',             'FIA-JAM',   NULL,           'Fiambres',    7800,    0, 12000, 2.2, 1, 5, 'kg', true),
    ('dddddddd-3333-3333-3333-000000000024', v_comercio, 'Queso Cremoso',            'FIA-QUE',   NULL,           'Fiambres',    6500,    0, 10500, 1.8, 1, 4, 'kg', true);

  -- ──────────────────────────────────────────────────────────────────
  -- 3. VENTAS HISTÓRICAS (18 ventas — timestamps relativos a now())
  -- ──────────────────────────────────────────────────────────────────

  v_venta_id := 'dddddddd-4444-4444-4444-000000000001';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 4280, 0, 0, 0, 0, 4280, 'efectivo', 'completada', now() - interval '6 days' + interval '10 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000101', v_venta_id, 'dddddddd-3333-3333-3333-000000000001', 'Coca-Cola 2.25L', 1, 2890, 2890),
    ('dddddddd-5555-5555-5555-000000000102', v_venta_id, 'dddddddd-3333-3333-3333-000000000015', 'Galletitas Oreo 117g', 1, 1390, 1390);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000002';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 6290, 0, 0, 0, 0, 6290, 'debito', 'completada', now() - interval '6 days' + interval '17 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000201', v_venta_id, 'dddddddd-3333-3333-3333-00000000001b', 'Marlboro Box 20', 1, 4200, 4200),
    ('dddddddd-5555-5555-5555-000000000202', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390),
    ('dddddddd-5555-5555-5555-000000000203', v_venta_id, 'dddddddd-3333-3333-3333-000000000002', 'Coca-Cola 500ml', 2, 850, 1700);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000003';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 9120, 0, 0, 0, 0, 9120, 'efectivo', 'completada', now() - interval '5 days' + interval '11 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000301', v_venta_id, 'dddddddd-3333-3333-3333-000000000008', 'Leche La Serenísima 1L', 2, 1490, 2980),
    ('dddddddd-5555-5555-5555-000000000302', v_venta_id, 'dddddddd-3333-3333-3333-00000000000d', 'Fideos Matarazzo Spaghetti 500g', 3, 1190, 3570),
    ('dddddddd-5555-5555-5555-000000000303', v_venta_id, 'dddddddd-3333-3333-3333-00000000000e', 'Arroz Gallo Oro 1kg', 1, 1890, 1890),
    ('dddddddd-5555-5555-5555-000000000304', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390),
    ('dddddddd-5555-5555-5555-000000000305', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000004';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 5980, 10, 598, 0, 0, 5382, 'mercadopago', 'completada', now() - interval '5 days' + interval '19 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000401', v_venta_id, 'dddddddd-3333-3333-3333-000000000003', 'Sprite 2.25L', 1, 2790, 2790),
    ('dddddddd-5555-5555-5555-000000000402', v_venta_id, 'dddddddd-3333-3333-3333-000000000018', 'Papas Lays Clásicas 110g', 2, 1450, 2900),
    ('dddddddd-5555-5555-5555-000000000403', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000005';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 3530, 0, 0, 0, 0, 3530, 'efectivo', 'completada', now() - interval '4 days' + interval '9 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000501', v_venta_id, 'dddddddd-3333-3333-3333-000000000004', 'Agua Villavicencio 1.5L', 2, 980, 1960),
    ('dddddddd-5555-5555-5555-000000000502', v_venta_id, 'dddddddd-3333-3333-3333-000000000017', 'Alfajor Jorgito Triple', 2, 590, 1180),
    ('dddddddd-5555-5555-5555-000000000503', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000006';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 7160, 0, 0, 0, 0, 7160, 'efectivo', 'completada', now() - interval '4 days' + interval '20 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000601', v_venta_id, 'dddddddd-3333-3333-3333-00000000001c', 'Philip Morris Box 20', 1, 3950, 3950),
    ('dddddddd-5555-5555-5555-000000000602', v_venta_id, 'dddddddd-3333-3333-3333-000000000005', 'Cerveza Quilmes 1L', 1, 1850, 1850),
    ('dddddddd-5555-5555-5555-000000000603', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 2, 290, 580),
    ('dddddddd-5555-5555-5555-000000000604', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 2, 390, 780);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000007';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 12530, 0, 0, 0, 0, 12530, 'debito', 'completada', now() - interval '3 days' + interval '12 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000701', v_venta_id, 'dddddddd-3333-3333-3333-000000000012', 'Yerba Mate Playadito 1kg', 1, 4890, 4890),
    ('dddddddd-5555-5555-5555-000000000702', v_venta_id, 'dddddddd-3333-3333-3333-00000000000f', 'Aceite Natura 900ml', 1, 3490, 3490),
    ('dddddddd-5555-5555-5555-000000000703', v_venta_id, 'dddddddd-3333-3333-3333-000000000010', 'Azúcar Ledesma 1kg', 2, 1290, 2580),
    ('dddddddd-5555-5555-5555-000000000704', v_venta_id, 'dddddddd-3333-3333-3333-000000000011', 'Sal Celusal 500g', 2, 590, 1180),
    ('dddddddd-5555-5555-5555-000000000705', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000008';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 6905, 0, 0, 0, 0, 6905, 'efectivo', 'completada', now() - interval '3 days' + interval '18 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, peso_kg, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000801', v_venta_id, 'dddddddd-3333-3333-3333-000000000023', 'Jamón Cocido (0.3 kg)', 1, 0.3, 3600, 3600),
    ('dddddddd-5555-5555-5555-000000000802', v_venta_id, 'dddddddd-3333-3333-3333-000000000024', 'Queso Cremoso (0.25 kg)', 1, 0.25, 2625, 2625);
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000803', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390),
    ('dddddddd-5555-5555-5555-000000000804', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000009';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 3470, 0, 0, 0, 0, 3470, 'efectivo', 'completada', now() - interval '2 days' + interval '10 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000000901', v_venta_id, 'dddddddd-3333-3333-3333-00000000000c', 'Dulce de Leche Sancor 400g', 1, 2490, 2490),
    ('dddddddd-5555-5555-5555-000000000902', v_venta_id, 'dddddddd-3333-3333-3333-000000000017', 'Alfajor Jorgito Triple', 1, 590, 590),
    ('dddddddd-5555-5555-5555-000000000903', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390);

  v_venta_id := 'dddddddd-4444-4444-4444-00000000000a';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 9390, 0, 0, 0, 0, 9390, 'mercadopago', 'completada', now() - interval '2 days' + interval '16 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001001', v_venta_id, 'dddddddd-3333-3333-3333-00000000001b', 'Marlboro Box 20', 1, 4200, 4200),
    ('dddddddd-5555-5555-5555-000000001002', v_venta_id, 'dddddddd-3333-3333-3333-000000000016', 'Chocolate Milka Leche 100g', 1, 1890, 1890),
    ('dddddddd-5555-5555-5555-000000001003', v_venta_id, 'dddddddd-3333-3333-3333-000000000005', 'Cerveza Quilmes 1L', 1, 1850, 1850),
    ('dddddddd-5555-5555-5555-000000001004', v_venta_id, 'dddddddd-3333-3333-3333-000000000018', 'Papas Lays Clásicas 110g', 1, 1450, 1450);

  v_venta_id := 'dddddddd-4444-4444-4444-00000000000b';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 2760, 0, 0, 0, 0, 2760, 'efectivo', 'completada', now() - interval '1 day' + interval '9 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001101', v_venta_id, 'dddddddd-3333-3333-3333-000000000008', 'Leche La Serenísima 1L', 1, 1490, 1490),
    ('dddddddd-5555-5555-5555-000000001102', v_venta_id, 'dddddddd-3333-3333-3333-000000000017', 'Alfajor Jorgito Triple', 1, 590, 590),
    ('dddddddd-5555-5555-5555-000000001103', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290),
    ('dddddddd-5555-5555-5555-000000001104', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 1, 390, 390);

  v_venta_id := 'dddddddd-4444-4444-4444-00000000000c';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 5140, 0, 0, 0, 0, 5140, 'debito', 'completada', now() - interval '1 day' + interval '17 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, peso_kg, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001201', v_venta_id, 'dddddddd-3333-3333-3333-000000000022', 'Pan Lactal (0.5 kg)', 1, 0.5, 2250, 2250);
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001202', v_venta_id, 'dddddddd-3333-3333-3333-00000000000a', 'Queso Crema Casancrem 290g', 1, 2890, 2890);

  v_venta_id := 'dddddddd-4444-4444-4444-00000000000d';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 1730, 0, 0, 0, 0, 1730, 'efectivo', 'completada', date_trunc('day', now()) + interval '9 hours' + interval '15 minutes');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001301', v_venta_id, 'dddddddd-3333-3333-3333-000000000002', 'Coca-Cola 500ml', 1, 850, 850),
    ('dddddddd-5555-5555-5555-000000001302', v_venta_id, 'dddddddd-3333-3333-3333-000000000017', 'Alfajor Jorgito Triple', 1, 590, 590),
    ('dddddddd-5555-5555-5555-000000001303', v_venta_id, 'dddddddd-3333-3333-3333-00000000001a', 'Caramelos Sugus', 1, 290, 290);

  v_venta_id := 'dddddddd-4444-4444-4444-00000000000e';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 5560, 0, 0, 0, 0, 5560, 'mercadopago', 'completada', date_trunc('day', now()) + interval '11 hours');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001401', v_venta_id, 'dddddddd-3333-3333-3333-00000000000e', 'Arroz Gallo Oro 1kg', 1, 1890, 1890),
    ('dddddddd-5555-5555-5555-000000001402', v_venta_id, 'dddddddd-3333-3333-3333-00000000000d', 'Fideos Matarazzo Spaghetti 500g', 2, 1190, 2380),
    ('dddddddd-5555-5555-5555-000000001403', v_venta_id, 'dddddddd-3333-3333-3333-000000000010', 'Azúcar Ledesma 1kg', 1, 1290, 1290);

  v_venta_id := 'dddddddd-4444-4444-4444-00000000000f';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 2970, 0, 0, 0, 0, 2970, 'efectivo', 'completada', date_trunc('day', now()) + interval '13 hours' + interval '20 minutes');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001501', v_venta_id, 'dddddddd-3333-3333-3333-00000000000b', 'Manteca La Paulina 200g', 1, 2190, 2190),
    ('dddddddd-5555-5555-5555-000000001502', v_venta_id, 'dddddddd-3333-3333-3333-000000000019', 'Chicles Beldent Menta', 2, 390, 780);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000010';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 4780, 0, 0, 0, 0, 4780, 'efectivo', 'completada', date_trunc('day', now()) + interval '16 hours' + interval '40 minutes');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001601', v_venta_id, 'dddddddd-3333-3333-3333-000000000001', 'Coca-Cola 2.25L', 1, 2890, 2890),
    ('dddddddd-5555-5555-5555-000000001602', v_venta_id, 'dddddddd-3333-3333-3333-000000000016', 'Chocolate Milka Leche 100g', 1, 1890, 1890);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000011';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 8440, 0, 0, 0, 0, 8440, 'debito', 'completada', date_trunc('day', now()) + interval '17 hours' + interval '50 minutes');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001701', v_venta_id, 'dddddddd-3333-3333-3333-00000000001b', 'Marlboro Box 20', 1, 4200, 4200),
    ('dddddddd-5555-5555-5555-000000001702', v_venta_id, 'dddddddd-3333-3333-3333-000000000003', 'Sprite 2.25L', 1, 2790, 2790),
    ('dddddddd-5555-5555-5555-000000001703', v_venta_id, 'dddddddd-3333-3333-3333-000000000018', 'Papas Lays Clásicas 110g', 1, 1450, 1450);

  v_venta_id := 'dddddddd-4444-4444-4444-000000000012';
  INSERT INTO ventas (id, comercio_id, subtotal, descuento_porcentaje, descuento_monto, recargo_porcentaje, recargo_monto, total, metodo_pago, estado, created_at)
  VALUES (v_venta_id, v_comercio, 6540, 0, 0, 0, 0, 6540, 'efectivo', 'completada', date_trunc('day', now()) + interval '19 hours' + interval '15 minutes');
  INSERT INTO items_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal) VALUES
    ('dddddddd-5555-5555-5555-000000001801', v_venta_id, 'dddddddd-3333-3333-3333-000000000005', 'Cerveza Quilmes 1L', 2, 1850, 3700),
    ('dddddddd-5555-5555-5555-000000001802', v_venta_id, 'dddddddd-3333-3333-3333-000000000018', 'Papas Lays Clásicas 110g', 1, 1450, 1450),
    ('dddddddd-5555-5555-5555-000000001803', v_venta_id, 'dddddddd-3333-3333-3333-000000000015', 'Galletitas Oreo 117g', 1, 1390, 1390);

  -- ──────────────────────────────────────────────────────────────────
  -- 4. MOVIMIENTOS DE CAJA (hoy)
  -- ──────────────────────────────────────────────────────────────────
  INSERT INTO movimientos_caja (id, comercio_id, tipo, monto, descripcion, metodo_pago, created_at) VALUES
    ('dddddddd-6666-6666-6666-000000000001', v_comercio, 'ingreso', 50000, 'Apertura del día', 'efectivo',     date_trunc('day', now()) + interval '8 hours'),
    ('dddddddd-6666-6666-6666-000000000002', v_comercio, 'egreso',   8500, 'Pago a proveedor de bebidas', 'efectivo', date_trunc('day', now()) + interval '10 hours' + interval '30 minutes'),
    ('dddddddd-6666-6666-6666-000000000003', v_comercio, 'egreso',   2400, 'Compra repuesto cortinas', 'efectivo',   date_trunc('day', now()) + interval '14 hours' + interval '15 minutes'),
    ('dddddddd-6666-6666-6666-000000000004', v_comercio, 'ingreso', 15000, 'Pago de cliente cuenta corriente', 'transferencia', date_trunc('day', now()) + interval '15 hours' + interval '40 minutes');

  -- ──────────────────────────────────────────────────────────────────
  -- 5. CIERRES DE CAJA (hace 2 días y hace 1 día)
  -- ──────────────────────────────────────────────────────────────────
  INSERT INTO cierres_caja (
    id, comercio_id, fecha,
    total_ventas, total_egresos, saldo_neto, cantidad_ventas,
    efectivo, transferencia, debito, credito, mercadopago,
    efectivo_contado, diferencia_efectivo, retiro_efectivo
  ) VALUES
    ('dddddddd-7777-7777-7777-000000000001', v_comercio, (now() - interval '2 days')::date, 12860, 0, 12860, 2, 3470, 0, 0,    0, 9390, 3500, 30, 0),
    ('dddddddd-7777-7777-7777-000000000002', v_comercio, (now() - interval '1 day')::date,   7900, 0,  7900, 2, 2760, 0, 5140, 0,    0, 2780, 20, 0);

  -- ──────────────────────────────────────────────────────────────────
  -- 6. ASSERT — guard contra truncamiento del script
  -- ──────────────────────────────────────────────────────────────────
  -- Si la función se aplicó parcialmente (paste cortado en el SQL
  -- Editor, etc.), los conteos no van a matchear y queremos fallar
  -- visible en lugar de dejar la demo a medias. Cada número refleja
  -- lo que realmente declara este script — si lo editás, actualizá
  -- también los esperados.
  DECLARE
    v_count_productos integer;
    v_count_ventas    integer;
    v_count_items     integer;
    v_count_mov       integer;
    v_count_cierres   integer;
  BEGIN
    SELECT count(*) INTO v_count_productos FROM productos WHERE comercio_id = v_comercio;
    SELECT count(*) INTO v_count_ventas    FROM ventas    WHERE comercio_id = v_comercio;
    SELECT count(*) INTO v_count_items     FROM items_venta WHERE venta_id IN (SELECT id FROM ventas WHERE comercio_id = v_comercio);
    SELECT count(*) INTO v_count_mov       FROM movimientos_caja WHERE comercio_id = v_comercio;
    SELECT count(*) INTO v_count_cierres   FROM cierres_caja WHERE comercio_id = v_comercio;

    RAISE NOTICE 'reset_demo_data: productos=%, ventas=%, items=%, mov_caja=%, cierres=%',
      v_count_productos, v_count_ventas, v_count_items, v_count_mov, v_count_cierres;

    IF v_count_productos <> 36 OR v_count_ventas <> 18 OR v_count_mov <> 4 OR v_count_cierres <> 2 THEN
      RAISE EXCEPTION
        'reset_demo_data: conteos inesperados (productos=% esperado 36, ventas=% esperado 18, mov=% esperado 4, cierres=% esperado 2). El cuerpo de la función puede estar truncado — reapliquen scripts/migration-demo-cron.sql completo.',
        v_count_productos, v_count_ventas, v_count_mov, v_count_cierres;
    END IF;
  END;

END;
$$;

GRANT EXECUTE ON FUNCTION reset_demo_data() TO postgres;

-- ═══════════════════════════════════════════════════════════════════
-- Schedule del cron
-- ═══════════════════════════════════════════════════════════════════
-- pg_cron usa el huso UTC del servidor. Argentina = UTC-3, así que
-- 4:00 AM ART = 7:00 AM UTC. Horario muerto para comercios reales
-- (la cuenta demo no tiene tráfico significativo a esa hora).
--
-- Drop primero si existía (idempotencia) — cron.unschedule lanza error
-- si no existe, así que lo envolvemos con un guard.

DO $$
BEGIN
  PERFORM cron.unschedule('reset-demo-data-daily');
EXCEPTION WHEN OTHERS THEN
  -- No existía. Ignorar.
  NULL;
END $$;

SELECT cron.schedule(
  'reset-demo-data-daily',
  '0 7 * * *',         -- 7am UTC = 4am ART
  $cmd$ SELECT reset_demo_data(); $cmd$
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. La función existe:
--    SELECT proname FROM pg_proc WHERE proname = 'reset_demo_data';
--    → 1 fila
--
-- 2. El cron está scheduleado:
--    SELECT jobname, schedule, command, active
--    FROM cron.job WHERE jobname = 'reset-demo-data-daily';
--    → 1 fila con schedule='0 7 * * *' y active=true
--
-- 3. Test manual del reset (cuidado: BORRA y RE-INSERTA datos demo).
--    El propio reset_demo_data() emite RAISE NOTICE con los conteos
--    y RAISE EXCEPTION si no matchean — así detectamos truncamiento
--    silencioso si el script se pegó incompleto.
--
--    BEGIN;
--      SELECT reset_demo_data();
--      -- NOTICE esperado:
--      --   reset_demo_data: productos=36, ventas=18, items=58, mov_caja=4, cierres=2
--      SELECT count(*) FROM productos WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111'; -- → 36
--      SELECT count(*) FROM ventas    WHERE comercio_id = 'dddddddd-1111-1111-1111-111111111111'; -- → 18
--    ROLLBACK;  -- evita aplicar el reset hasta el próximo fire del cron
--
-- 3b. Diagnóstico del cuerpo de la función (útil si los conteos fallan):
--    SELECT
--      length(prosrc) AS chars_funcion,
--      (length(prosrc) - length(replace(prosrc, 'dddddddd-3333-3333-3333', '')))
--        / length('dddddddd-3333-3333-3333') AS refs_productos_en_funcion
--    FROM pg_proc WHERE proname = 'reset_demo_data';
--    Esperado: chars_funcion ~17000, refs_productos_en_funcion = 94.
--    Si refs < 94 → el cuerpo está truncado, reaplicar el script entero.
--
-- 4. Inspeccionar últimas ejecuciones del cron (después de algunos días):
--    SELECT jobname, status, return_message, start_time, end_time
--    FROM cron.job_run_details
--    WHERE jobname = 'reset-demo-data-daily'
--    ORDER BY start_time DESC LIMIT 10;
--
-- ───── Cómo cambiarlo después ───────────────────────────────────────
-- Re-aplicar este archivo. CREATE OR REPLACE actualiza la función y
-- el DO block des-schedulea y re-schedulea el cron de forma idempotente.
--
-- ───── Cómo deshabilitar temporalmente ──────────────────────────────
--    UPDATE cron.job SET active = false WHERE jobname = 'reset-demo-data-daily';
-- Para re-activar: active = true.
