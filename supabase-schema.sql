-- ================================================
-- FÁCIL STOCK — Schema de base de datos (Supabase)
-- ================================================
-- Ejecutá este SQL en el SQL Editor de Supabase
-- Supabase → SQL Editor → New query → pegá todo y ejecutá
-- ================================================

-- Habilitar la extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- TABLA: comercios
-- Cada comercio es un "tenant" (cliente del SaaS)
-- ================================================
CREATE TABLE comercios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT 'general', -- 'kiosco', 'almacen', 'ferreteria', 'otro'
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  logo_url TEXT,
  plan TEXT DEFAULT 'basico', -- 'basico', 'pro', 'negocio'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLA: perfiles de usuario
-- Extiende el sistema de auth de Supabase
-- ================================================
CREATE TABLE perfiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  comercio_id UUID REFERENCES comercios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rol TEXT DEFAULT 'cajero', -- 'admin', 'cajero', 'supervisor'
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLA: categorias
-- Para organizar productos
-- ================================================
CREATE TABLE categorias (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  comercio_id UUID REFERENCES comercios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  icono TEXT DEFAULT '📦',
  color TEXT DEFAULT '#5b4cff',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLA: proveedores
-- ================================================
CREATE TABLE proveedores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  comercio_id UUID REFERENCES comercios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLA: productos
-- El catálogo completo de productos del comercio
-- ================================================
CREATE TABLE productos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  comercio_id UUID REFERENCES comercios(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,

  -- Identificación
  nombre TEXT NOT NULL,
  codigo_barras TEXT,          -- Código EAN / UPC (ej: 7790001001234)
  sku TEXT,                     -- Código interno (ej: SKU-BEB-001)

  -- Descripción
  descripcion TEXT,
  imagen_url TEXT,
  unidad_venta TEXT DEFAULT 'unidad', -- 'unidad', 'kg', 'litro', 'metro', 'caja'

  -- Precios
  precio_costo DECIMAL(12,2) DEFAULT 0,
  precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_mayorista DECIMAL(12,2),
  precio_por_kg DECIMAL(12,2),       -- Si se vende por peso
  iva_porcentaje DECIMAL(5,2) DEFAULT 21,

  -- Stock
  stock_actual INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 10,   -- Por debajo de esto: alerta
  stock_ideal INTEGER DEFAULT 50,
  ubicacion TEXT,                    -- Ej: "Góndola A3"

  -- Estado
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLA: lotes
-- Cada producto puede tener múltiples lotes con fecha de vencimiento
-- ================================================
CREATE TABLE lotes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
  numero_lote TEXT NOT NULL,         -- Ej: "L-2025-04"
  cantidad INTEGER DEFAULT 0,
  fecha_vencimiento DATE,
  fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),
  notas TEXT
);

-- ================================================
-- TABLA: aperturas_caja
-- Registro de cada turno / apertura de caja
-- ================================================
CREATE TABLE aperturas_caja (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  comercio_id UUID REFERENCES comercios(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES perfiles(id),
  monto_apertura DECIMAL(12,2) DEFAULT 0,
  monto_cierre DECIMAL(12,2),
  diferencia DECIMAL(12,2),         -- cierre - (apertura + ventas - egresos)
  estado TEXT DEFAULT 'abierta',    -- 'abierta', 'cerrada'
  notas_apertura TEXT,
  notas_cierre TEXT,
  abierta_at TIMESTAMPTZ DEFAULT NOW(),
  cerrada_at TIMESTAMPTZ
);

-- ================================================
-- TABLA: ventas
-- Cada transacción / ticket
-- ================================================
CREATE TABLE ventas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  comercio_id UUID REFERENCES comercios(id) ON DELETE CASCADE,
  caja_id UUID REFERENCES aperturas_caja(id),
  usuario_id UUID REFERENCES perfiles(id),

  numero_ticket SERIAL,              -- Número de ticket autoincremental
  subtotal DECIMAL(12,2) NOT NULL,
  descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
  descuento_monto DECIMAL(12,2) DEFAULT 0,
  recargo_porcentaje DECIMAL(5,2) DEFAULT 0,
  recargo_monto DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,

  metodo_pago TEXT DEFAULT 'efectivo', -- 'efectivo', 'transferencia', 'debito', 'credito', 'mercadopago'
  estado TEXT DEFAULT 'completada',    -- 'completada', 'anulada'
  notas TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLA: items_venta
-- Cada línea (producto) dentro de una venta
-- ================================================
CREATE TABLE items_venta (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,

  -- Guardamos el estado del producto AL MOMENTO de la venta
  -- (los precios pueden cambiar después)
  nombre_producto TEXT NOT NULL,
  codigo_barras TEXT,
  precio_unitario DECIMAL(12,2) NOT NULL,
  cantidad DECIMAL(10,3) NOT NULL DEFAULT 1, -- Decimal para ventas por peso
  subtotal DECIMAL(12,2) NOT NULL
);

-- ================================================
-- TABLA: movimientos_caja
-- Egresos e ingresos manuales (no ventas)
-- ================================================
CREATE TABLE movimientos_caja (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  comercio_id UUID REFERENCES comercios(id) ON DELETE CASCADE,
  caja_id UUID REFERENCES aperturas_caja(id),
  usuario_id UUID REFERENCES perfiles(id),

  tipo TEXT NOT NULL,               -- 'ingreso', 'egreso'
  monto DECIMAL(12,2) NOT NULL,
  descripcion TEXT NOT NULL,
  metodo_pago TEXT DEFAULT 'efectivo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLA: movimientos_stock
-- Historial de cambios de stock (auditoría)
-- ================================================
CREATE TABLE movimientos_stock (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
  comercio_id UUID REFERENCES comercios(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES perfiles(id),

  tipo TEXT NOT NULL,               -- 'venta', 'compra', 'ajuste', 'devolucion'
  cantidad_anterior INTEGER,
  cantidad_cambio INTEGER,          -- Positivo = entra, negativo = sale
  cantidad_nueva INTEGER,
  referencia_id UUID,               -- ID de la venta o compra que lo generó
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- ÍNDICES para mejorar velocidad de búsquedas
-- ================================================
CREATE INDEX idx_productos_comercio ON productos(comercio_id);
CREATE INDEX idx_productos_barcode ON productos(codigo_barras);
CREATE INDEX idx_productos_sku ON productos(sku);
CREATE INDEX idx_ventas_comercio ON ventas(comercio_id);
CREATE INDEX idx_ventas_fecha ON ventas(created_at);
CREATE INDEX idx_items_venta ON items_venta(venta_id);
CREATE INDEX idx_movimientos_stock ON movimientos_stock(producto_id);

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- Cada comercio solo puede ver SUS PROPIOS datos
-- Esto es fundamental para la seguridad del SaaS
-- ================================================
ALTER TABLE comercios ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE aperturas_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;

-- Función helper: obtener el comercio_id del usuario logueado
CREATE OR REPLACE FUNCTION get_comercio_id()
RETURNS UUID AS $$
  SELECT comercio_id FROM perfiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Políticas RLS: cada tabla solo accesible por su comercio
CREATE POLICY "productos_comercio" ON productos
  FOR ALL USING (comercio_id = get_comercio_id());

CREATE POLICY "categorias_comercio" ON categorias
  FOR ALL USING (comercio_id = get_comercio_id());

CREATE POLICY "proveedores_comercio" ON proveedores
  FOR ALL USING (comercio_id = get_comercio_id());

CREATE POLICY "ventas_comercio" ON ventas
  FOR ALL USING (comercio_id = get_comercio_id());

CREATE POLICY "movimientos_caja_comercio" ON movimientos_caja
  FOR ALL USING (comercio_id = get_comercio_id());

CREATE POLICY "aperturas_caja_comercio" ON aperturas_caja
  FOR ALL USING (comercio_id = get_comercio_id());

CREATE POLICY "movimientos_stock_comercio" ON movimientos_stock
  FOR ALL USING (comercio_id = get_comercio_id());

CREATE POLICY "perfiles_propio" ON perfiles
  FOR ALL USING (id = auth.uid());

-- ================================================
-- TRIGGER: actualizar updated_at automáticamente
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER comercios_updated_at
  BEFORE UPDATE ON comercios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================
-- DATOS DE EJEMPLO (opcional, para probar)
-- ================================================
-- Podés descomentar esto para cargar datos de prueba
-- INSERT INTO categorias (comercio_id, nombre, icono) VALUES 
--   ('TU_COMERCIO_ID', 'Bebidas', '🥤'),
--   ('TU_COMERCIO_ID', 'Almacén', '🛒'),
--   ('TU_COMERCIO_ID', 'Ferretería', '🔩');
