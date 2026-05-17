/**
 * Seed para tomar capturas de la landing.
 * Crea el comercio ficticio "Kiosco El Faro" con catálogo completo,
 * usuarios, ventas del día, egresos y cierres listos para capturar
 * SIN edición manual.
 *
 * USO:
 *   1. Crear un proyecto Supabase NUEVO (staging dedicado, no la
 *      DB de producción ni la de testing diario).
 *   2. Aplicar todas las migrations del repo en ese staging.
 *   3. Exportar las env vars del staging:
 *        export NEXT_PUBLIC_SUPABASE_URL='https://xxx.supabase.co'
 *        export SUPABASE_SERVICE_ROLE_KEY='eyJ...'
 *   4. Correr:
 *        npx tsx scripts/seed-landing.ts
 *
 * El script es idempotente: si ya corrió, no duplica. Si querés un
 * reseed limpio, borrá el comercio "Kiosco El Faro" desde Supabase
 * Dashboard (cascade borra todo lo demás) y volvé a correr.
 *
 * Credenciales para login después del seed:
 *   sofia@kioscoelfaro.com.ar / sylvora123  (admin)
 *   martin@kioscoelfaro.com.ar / sylvora123 (empleado)
 *   laura@kioscoelfaro.com.ar  / sylvora123 (empleado)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan env vars NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Exportalas antes de correr el script (ver instrucciones arriba).')
  process.exit(1)
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ============================================================
// Datos del comercio ficticio "Kiosco El Faro"
// ============================================================

const COMERCIO_NOMBRE = 'Kiosco El Faro'

const PASSWORD_COMUN = 'sylvora123'

const USUARIOS = [
  { email: 'sofia@kioscoelfaro.com.ar',  nombre: 'Sofía Méndez',  rol: 'admin' as const },
  { email: 'martin@kioscoelfaro.com.ar', nombre: 'Martín Vega',   rol: 'empleado' as const },
  { email: 'laura@kioscoelfaro.com.ar',  nombre: 'Laura Romero',  rol: 'empleado' as const },
]

const CATEGORIAS = ['Bebidas', 'Almacén', 'Golosinas', 'Snacks', 'Cigarrillos']

// Catálogo de productos (matchea exactamente la tabla del screenshots-brief.md §1)
interface ProductoSeed {
  sku: string
  nombre: string
  categoria: string
  precio_costo: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
}

const PRODUCTOS: ProductoSeed[] = [
  { sku: 'KEF-001', nombre: 'Coca-Cola 1.5L',            categoria: 'Bebidas',     precio_costo: 2900, precio_venta: 4500, stock_actual: 24, stock_minimo: 6 },
  { sku: 'KEF-002', nombre: 'Coca-Cola 2.25L',           categoria: 'Bebidas',     precio_costo: 4100, precio_venta: 6200, stock_actual: 8,  stock_minimo: 4 },
  { sku: 'KEF-003', nombre: 'Galletitas Oreo 118g',      categoria: 'Golosinas',   precio_costo: 800,  precio_venta: 1250, stock_actual: 36, stock_minimo: 12 },
  { sku: 'KEF-004', nombre: 'Galletitas Sonrisas 130g',  categoria: 'Golosinas',   precio_costo: 620,  precio_venta: 980,  stock_actual: 5,  stock_minimo: 10 },  // CRÍTICO
  { sku: 'KEF-005', nombre: 'Pan flauta unidad',         categoria: 'Almacén',     precio_costo: 500,  precio_venta: 850,  stock_actual: 18, stock_minimo: 8 },
  { sku: 'KEF-006', nombre: 'Yerba Playadito 1kg',       categoria: 'Almacén',     precio_costo: 2400, precio_venta: 3800, stock_actual: 12, stock_minimo: 6 },
  { sku: 'KEF-007', nombre: 'Cigarrillos Marlboro',      categoria: 'Cigarrillos', precio_costo: 2800, precio_venta: 4200, stock_actual: 40, stock_minimo: 15 },
  { sku: 'KEF-008', nombre: 'Alfajor Jorgito',           categoria: 'Golosinas',   precio_costo: 380,  precio_venta: 650,  stock_actual: 22, stock_minimo: 12 },
  { sku: 'KEF-009', nombre: 'Agua Villavicencio 1.5L',   categoria: 'Bebidas',     precio_costo: 1100, precio_venta: 1800, stock_actual: 0,  stock_minimo: 6 },   // SIN STOCK
  { sku: 'KEF-010', nombre: 'Chocolate Cofler 30g',      categoria: 'Golosinas',   precio_costo: 450,  precio_venta: 750,  stock_actual: 15, stock_minimo: 8 },
  { sku: 'KEF-011', nombre: 'Papas Lays 75g',            categoria: 'Snacks',      precio_costo: 900,  precio_venta: 1450, stock_actual: 28, stock_minimo: 10 },
  { sku: 'KEF-012', nombre: 'Leche La Serenísima 1L',    categoria: 'Almacén',     precio_costo: 1300, precio_venta: 1950, stock_actual: 9,  stock_minimo: 10 },  // BAJO
]

// Lotes solo para Yerba Playadito (KEF-006), con 3 estados de
// countdown para que la captura 2.5 muestre la variedad completa.
interface LoteSeed {
  sku: string
  numero_lote: string
  cantidad: number
  dias_a_vencimiento: number  // negativo = ya vencido
}

const LOTES: LoteSeed[] = [
  { sku: 'KEF-006', numero_lote: 'L-2026-03-101', cantidad: 5, dias_a_vencimiento: 45 },  // text2 gris
  { sku: 'KEF-006', numero_lote: 'L-2026-05-201', cantidad: 4, dias_a_vencimiento: 12 },  // amarillo
  { sku: 'KEF-006', numero_lote: 'L-2026-05-202', cantidad: 3, dias_a_vencimiento: 1  },  // rojo "Vence mañana"
]

// ============================================================
// Ventas del día actual
// 22 ventas con mix de métodos. Total objetivo: ~$145.200
// ============================================================

interface VentaSeed {
  hora: [number, number]      // [h, m] local AR
  items: { sku: string; cantidad: number }[]
  metodo: 'efectivo' | 'debito' | 'credito' | 'mercadopago'
  cajero_idx: number          // 0=Sofía, 1=Martín, 2=Laura
  estado?: 'completada' | 'anulada'
}

const VENTAS_HOY: VentaSeed[] = [
  // Mañana
  { hora: [9, 14],  items: [{ sku: 'KEF-005', cantidad: 1 }],                                                       metodo: 'efectivo',    cajero_idx: 1 },
  { hora: [9, 32],  items: [{ sku: 'KEF-001', cantidad: 1 }, { sku: 'KEF-003', cantidad: 1 }],                      metodo: 'mercadopago', cajero_idx: 1 },
  { hora: [10, 1],  items: [{ sku: 'KEF-007', cantidad: 2 }],                                                       metodo: 'efectivo',    cajero_idx: 1 },
  { hora: [10, 42], items: [{ sku: 'KEF-006', cantidad: 1 }],                                                       metodo: 'efectivo',    cajero_idx: 1 },
  { hora: [11, 18], items: [{ sku: 'KEF-001', cantidad: 1 }, { sku: 'KEF-011', cantidad: 1 }],                      metodo: 'mercadopago', cajero_idx: 1 },
  { hora: [11, 55], items: [{ sku: 'KEF-012', cantidad: 1 }, { sku: 'KEF-005', cantidad: 1 }],                      metodo: 'efectivo',    cajero_idx: 1 },
  // Mediodía
  { hora: [12, 30], items: [{ sku: 'KEF-002', cantidad: 1 }, { sku: 'KEF-008', cantidad: 2 }],                      metodo: 'efectivo',    cajero_idx: 2 },
  { hora: [13, 12], items: [{ sku: 'KEF-007', cantidad: 1 }, { sku: 'KEF-011', cantidad: 2 }],                      metodo: 'debito',      cajero_idx: 2 },
  { hora: [13, 45], items: [{ sku: 'KEF-003', cantidad: 2 }],                                                       metodo: 'efectivo',    cajero_idx: 2 },
  { hora: [14, 20], items: [{ sku: 'KEF-001', cantidad: 1 }],                                                       metodo: 'mercadopago', cajero_idx: 2 },
  // Tarde
  { hora: [15, 38], items: [{ sku: 'KEF-008', cantidad: 3 }, { sku: 'KEF-010', cantidad: 2 }],                      metodo: 'efectivo',    cajero_idx: 2 },
  { hora: [16, 5],  items: [{ sku: 'KEF-006', cantidad: 1 }, { sku: 'KEF-012', cantidad: 1 }],                      metodo: 'efectivo',    cajero_idx: 2 },
  { hora: [16, 47], items: [{ sku: 'KEF-002', cantidad: 1 }],                                                       metodo: 'credito',     cajero_idx: 2 },
  // Esta venta queda anulada para mostrar el caso en la tabla de movimientos
  { hora: [17, 10], items: [{ sku: 'KEF-007', cantidad: 1 }, { sku: 'KEF-001', cantidad: 1 }],                      metodo: 'efectivo',    cajero_idx: 2, estado: 'anulada' },
  { hora: [17, 28], items: [{ sku: 'KEF-011', cantidad: 1 }, { sku: 'KEF-008', cantidad: 1 }],                      metodo: 'efectivo',    cajero_idx: 2 },
  { hora: [18, 5],  items: [{ sku: 'KEF-001', cantidad: 2 }, { sku: 'KEF-003', cantidad: 1 }, { sku: 'KEF-005', cantidad: 2 }], metodo: 'mercadopago', cajero_idx: 1 },
  { hora: [18, 42], items: [{ sku: 'KEF-006', cantidad: 1 }, { sku: 'KEF-012', cantidad: 1 }],                      metodo: 'efectivo',    cajero_idx: 1 },
  // Pico de la tarde-noche
  { hora: [19, 12], items: [{ sku: 'KEF-007', cantidad: 3 }],                                                       metodo: 'efectivo',    cajero_idx: 1 },
  { hora: [19, 35], items: [{ sku: 'KEF-002', cantidad: 1 }, { sku: 'KEF-011', cantidad: 1 }, { sku: 'KEF-010', cantidad: 1 }], metodo: 'mercadopago', cajero_idx: 1 },
  { hora: [20, 4],  items: [{ sku: 'KEF-001', cantidad: 1 }, { sku: 'KEF-008', cantidad: 2 }],                      metodo: 'efectivo',    cajero_idx: 1 },
  { hora: [20, 22], items: [{ sku: 'KEF-005', cantidad: 1 }, { sku: 'KEF-003', cantidad: 1 }],                      metodo: 'efectivo',    cajero_idx: 1 },
  { hora: [20, 38], items: [{ sku: 'KEF-006', cantidad: 2 }, { sku: 'KEF-007', cantidad: 1 }],                      metodo: 'efectivo',    cajero_idx: 1 },
]

// Egresos del día (para captura caja cerrada con números coherentes)
const EGRESOS_HOY = [
  { hora: [15, 30] as [number, number], monto: 50000, descripcion: 'Pago proveedor bebidas (Coca distribuidor)', metodo: 'efectivo' },
  { hora: [17, 45] as [number, number], monto: 7700,  descripcion: 'Cambio menor (a la caja)',                   metodo: 'efectivo' },
]

// Cierres de días anteriores (historial). 7 días para que la
// tabla "Cierres anteriores" se vea sustanciosa.
interface CierrePasado {
  dias_atras: number
  total_ventas: number
  total_egresos: number
  cantidad_ventas: number
  // Porcentajes aproximados por método
  pct_efectivo: number
  pct_debito: number
  pct_credito: number
  pct_mp: number
  efectivo_contado_offset: number  // +0 = OK, positivo = sobrante, negativo = faltante
  retiro_efectivo: number
}

const CIERRES_PASADOS: CierrePasado[] = [
  { dias_atras: 1, total_ventas: 134800, total_egresos: 42000, cantidad_ventas: 19, pct_efectivo: 0.62, pct_debito: 0.10, pct_credito: 0.05, pct_mp: 0.23, efectivo_contado_offset: 0,    retiro_efectivo: 40000 },
  { dias_atras: 2, total_ventas: 95600,  total_egresos: 28000, cantidad_ventas: 14, pct_efectivo: 0.58, pct_debito: 0.12, pct_credito: 0.06, pct_mp: 0.24, efectivo_contado_offset: -800, retiro_efectivo: 30000 },  // faltante
  { dias_atras: 3, total_ventas: 108400, total_egresos: 35200, cantidad_ventas: 16, pct_efectivo: 0.60, pct_debito: 0.10, pct_credito: 0.04, pct_mp: 0.26, efectivo_contado_offset: 0,    retiro_efectivo: 35000 },
  { dias_atras: 4, total_ventas: 75200,  total_egresos: 18500, cantidad_ventas: 11, pct_efectivo: 0.65, pct_debito: 0.08, pct_credito: 0.03, pct_mp: 0.24, efectivo_contado_offset: 200,  retiro_efectivo: 25000 },  // sobrante chico
  { dias_atras: 5, total_ventas: 185700, total_egresos: 65000, cantidad_ventas: 28, pct_efectivo: 0.55, pct_debito: 0.15, pct_credito: 0.08, pct_mp: 0.22, efectivo_contado_offset: 0,    retiro_efectivo: 60000 },  // sábado fuerte
  { dias_atras: 6, total_ventas: 112300, total_egresos: 38500, cantidad_ventas: 17, pct_efectivo: 0.61, pct_debito: 0.11, pct_credito: 0.05, pct_mp: 0.23, efectivo_contado_offset: 0,    retiro_efectivo: 40000 },
  { dias_atras: 7, total_ventas: 98500,  total_egresos: 26000, cantidad_ventas: 15, pct_efectivo: 0.63, pct_debito: 0.09, pct_credito: 0.04, pct_mp: 0.24, efectivo_contado_offset: -300, retiro_efectivo: 32000 },  // faltante chico
]

// ============================================================
// Helpers
// ============================================================

/** Devuelve un timestamp ISO de hoy a [h, m] hora LOCAL del runner. */
function hoyA(h: number, m: number): string {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

/** Devuelve fecha 'YYYY-MM-DD' de hoy o (hoy - n días). */
function fechaDiasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

/** Devuelve fecha 'YYYY-MM-DD' de hoy + n días. */
function fechaEnFuturo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

/** Para cierres pasados: timestamp del cierre, día N atrás a las 20:45. */
function timestampCierre(diasAtras: number): string {
  const d = new Date()
  d.setDate(d.getDate() - diasAtras)
  d.setHours(20, 45, 0, 0)
  return d.toISOString()
}

// ============================================================
// Pasos del seed
// ============================================================

async function ensureComercio(): Promise<{ id: string }> {
  // ¿Ya existe?
  const { data: existing } = await supabase
    .from('comercios')
    .select('id')
    .eq('nombre', COMERCIO_NOMBRE)
    .maybeSingle()
  if (existing) return { id: existing.id }

  const { data, error } = await supabase
    .from('comercios')
    .insert({ nombre: COMERCIO_NOMBRE })
    .select('id')
    .single()
  if (error) throw new Error(`comercio: ${error.message}`)
  return { id: data!.id }
}

async function ensureUsuarios(comercioId: string) {
  const out: { id: string; email: string; rol: 'admin' | 'empleado'; nombre: string }[] = []

  for (const u of USUARIOS) {
    // ¿Ya existe el auth user?
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existingUsers = (list?.users ?? []) as Array<{ id: string; email?: string }>
    let user: { id: string; email?: string } | undefined = existingUsers.find(x => x.email === u.email)

    if (!user) {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: PASSWORD_COMUN,
        email_confirm: true,
        user_metadata: { nombre: u.nombre },
      })
      if (error) throw new Error(`auth.admin.createUser ${u.email}: ${error.message}`)
      user = created.user
    }

    // Upsert del perfil
    const { error: perfilErr } = await supabase
      .from('perfiles')
      .upsert({
        id: user!.id,
        comercio_id: comercioId,
        nombre: u.nombre,
        rol: u.rol,
      })
    if (perfilErr) throw new Error(`perfil ${u.email}: ${perfilErr.message}`)

    out.push({ id: user!.id, email: u.email, rol: u.rol, nombre: u.nombre })
  }
  return out
}

async function ensureCategorias(comercioId: string) {
  for (const nombre of CATEGORIAS) {
    const { data: existing } = await supabase
      .from('categorias')
      .select('id')
      .eq('comercio_id', comercioId)
      .eq('nombre', nombre)
      .maybeSingle()
    if (existing) continue

    const { error } = await supabase.from('categorias').insert({ comercio_id: comercioId, nombre })
    if (error && !error.message.includes('duplicate')) {
      throw new Error(`categoría ${nombre}: ${error.message}`)
    }
  }
}

async function ensureProductos(comercioId: string) {
  const out: Array<ProductoSeed & { id: string }> = []
  for (const p of PRODUCTOS) {
    // ¿Ya existe por SKU?
    const { data: existing } = await supabase
      .from('productos')
      .select('id')
      .eq('comercio_id', comercioId)
      .eq('sku', p.sku)
      .maybeSingle()
    if (existing) {
      // Actualizar para mantener consistencia con el seed.
      const { error } = await supabase
        .from('productos')
        .update({
          nombre: p.nombre,
          categoria: p.categoria,
          precio_costo: p.precio_costo,
          precio_venta: p.precio_venta,
          stock_actual: p.stock_actual,
          stock_minimo: p.stock_minimo,
          unidad_venta: 'unidad',
        })
        .eq('id', existing.id)
      if (error) throw new Error(`update producto ${p.sku}: ${error.message}`)
      out.push({ ...p, id: existing.id })
      continue
    }

    const { data, error } = await supabase
      .from('productos')
      .insert({
        comercio_id: comercioId,
        nombre: p.nombre,
        sku: p.sku,
        categoria: p.categoria,
        precio_costo: p.precio_costo,
        precio_venta: p.precio_venta,
        stock_actual: p.stock_actual,
        stock_minimo: p.stock_minimo,
        unidad_venta: 'unidad',
      })
      .select('id')
      .single()
    if (error) throw new Error(`producto ${p.sku}: ${error.message}`)
    out.push({ ...p, id: data!.id })
  }
  return out
}

async function ensureLotes(productos: Array<ProductoSeed & { id: string }>) {
  for (const l of LOTES) {
    const prod = productos.find(p => p.sku === l.sku)
    if (!prod) continue

    const fechaVenc = fechaEnFuturo(l.dias_a_vencimiento)

    // ¿Ya existe (producto_id + numero_lote + fecha)?
    const { data: existing } = await supabase
      .from('lotes')
      .select('id')
      .eq('producto_id', prod.id)
      .eq('numero_lote', l.numero_lote)
      .maybeSingle()
    if (existing) continue

    const { error } = await supabase.from('lotes').insert({
      producto_id: prod.id,
      numero_lote: l.numero_lote,
      cantidad: l.cantidad,
      fecha_vencimiento: fechaVenc,
    })
    if (error) throw new Error(`lote ${l.numero_lote}: ${error.message}`)
  }
}

interface ProdMap { [sku: string]: ProductoSeed & { id: string } }

function calcularTotal(items: { sku: string; cantidad: number }[], prods: ProdMap): number {
  return items.reduce((s, it) => s + prods[it.sku].precio_venta * it.cantidad, 0)
}

async function crearVentasHoy(comercioId: string, productos: Array<ProductoSeed & { id: string }>, usuarios: Awaited<ReturnType<typeof ensureUsuarios>>) {
  // Limpiar ventas del día primero (idempotencia limpia)
  const hoyInicio = new Date()
  hoyInicio.setHours(0, 0, 0, 0)
  await supabase
    .from('ventas')
    .delete()
    .eq('comercio_id', comercioId)
    .gte('created_at', hoyInicio.toISOString())

  const prodMap: ProdMap = Object.fromEntries(productos.map(p => [p.sku, p]))
  let ticketNum = 130  // arbitrario, así no empieza en 1

  for (const v of VENTAS_HOY) {
    const total = calcularTotal(v.items, prodMap)
    const created_at = hoyA(v.hora[0], v.hora[1])

    const { data: venta, error } = await supabase
      .from('ventas')
      .insert({
        comercio_id: comercioId,
        total,
        subtotal: total,
        descuento_porcentaje: 0,
        descuento_monto: 0,
        recargo_porcentaje: 0,
        recargo_monto: 0,
        metodo_pago: v.metodo,
        estado: v.estado ?? 'completada',
        numero_ticket: ticketNum++,
        created_at,
      })
      .select('id')
      .single()
    if (error) throw new Error(`venta ${v.hora.join(':')}: ${error.message}`)

    for (const it of v.items) {
      const p = prodMap[it.sku]
      const subtotal = p.precio_venta * it.cantidad
      const { error: itemErr } = await supabase.from('items_venta').insert({
        venta_id: venta!.id,
        producto_id: p.id,
        cantidad: it.cantidad,
        peso_kg: null,
        precio_unitario: p.precio_venta,
        subtotal,
        nombre_producto: p.nombre,
      })
      if (itemErr) throw new Error(`items_venta ${it.sku}: ${itemErr.message}`)
    }
  }
}

async function crearEgresosHoy(comercioId: string) {
  // Limpiar egresos del día primero
  const hoyInicio = new Date()
  hoyInicio.setHours(0, 0, 0, 0)
  await supabase
    .from('movimientos_caja')
    .delete()
    .eq('comercio_id', comercioId)
    .gte('created_at', hoyInicio.toISOString())

  for (const e of EGRESOS_HOY) {
    const { error } = await supabase.from('movimientos_caja').insert({
      comercio_id: comercioId,
      tipo: 'egreso',
      monto: e.monto,
      descripcion: e.descripcion,
      metodo_pago: e.metodo,
      created_at: hoyA(e.hora[0], e.hora[1]),
    })
    if (error) throw new Error(`egreso: ${error.message}`)
  }
}

async function crearCierreHoy(comercioId: string, sofiaId: string) {
  // Calcular números reales desde las ventas activas (no anuladas)
  const totalVentasObj = VENTAS_HOY
    .filter(v => v.estado !== 'anulada')
    .reduce((s, v) => {
      const total = v.items.reduce((acc, it) => {
        const p = PRODUCTOS.find(pp => pp.sku === it.sku)!
        return acc + p.precio_venta * it.cantidad
      }, 0)
      return s + total
    }, 0)

  const totalEgresos = EGRESOS_HOY.reduce((s, e) => s + e.monto, 0)
  const cantidadVentas = VENTAS_HOY.filter(v => v.estado !== 'anulada').length

  // Cálculo de breakdown por método
  let efectivo = 0, debito = 0, credito = 0, mercadopago = 0
  for (const v of VENTAS_HOY.filter(v => v.estado !== 'anulada')) {
    const total = v.items.reduce((s, it) => {
      const p = PRODUCTOS.find(pp => pp.sku === it.sku)!
      return s + p.precio_venta * it.cantidad
    }, 0)
    if (v.metodo === 'efectivo')    efectivo += total
    if (v.metodo === 'debito')      debito += total
    if (v.metodo === 'credito')     credito += total
    if (v.metodo === 'mercadopago') mercadopago += total
  }

  const efectivoEsperado = efectivo - totalEgresos
  const efectivoContado = efectivoEsperado  // OK, sin diferencia
  const retiro = 50000

  // Borrar cierre de hoy si existe (idempotencia)
  await supabase.from('cierres_caja')
    .delete()
    .eq('comercio_id', comercioId)
    .eq('fecha', fechaDiasAtras(0))

  // Cierre del día a las 20:45 LOCAL
  const created_at = hoyA(20, 45)

  const { error } = await supabase.from('cierres_caja').insert({
    comercio_id: comercioId,
    usuario_id: sofiaId,
    fecha: fechaDiasAtras(0),
    total_ventas: totalVentasObj,
    total_egresos: totalEgresos,
    saldo_neto: totalVentasObj - totalEgresos,
    cantidad_ventas: cantidadVentas,
    efectivo,
    transferencia: 0,
    debito,
    credito,
    mercadopago,
    efectivo_contado: efectivoContado,
    diferencia_efectivo: 0,
    retiro_efectivo: retiro,
    created_at,
  })
  if (error) throw new Error(`cierre hoy: ${error.message}`)

  console.log(`   → Cierre de hoy: ventas $${totalVentasObj.toLocaleString('es-AR')}, egresos $${totalEgresos.toLocaleString('es-AR')}, saldo $${(totalVentasObj-totalEgresos).toLocaleString('es-AR')}`)
}

async function crearCierresPasados(comercioId: string, sofiaId: string) {
  for (const c of CIERRES_PASADOS) {
    const fecha = fechaDiasAtras(c.dias_atras)

    // Borrar si existe
    await supabase.from('cierres_caja')
      .delete()
      .eq('comercio_id', comercioId)
      .eq('fecha', fecha)

    const efectivo    = Math.round(c.total_ventas * c.pct_efectivo)
    const debito      = Math.round(c.total_ventas * c.pct_debito)
    const credito     = Math.round(c.total_ventas * c.pct_credito)
    const mercadopago = c.total_ventas - efectivo - debito - credito  // resto para que cuadre exacto

    const efectivoEsperado = efectivo - c.total_egresos
    const efectivoContado  = efectivoEsperado + c.efectivo_contado_offset

    const { error } = await supabase.from('cierres_caja').insert({
      comercio_id: comercioId,
      usuario_id: sofiaId,
      fecha,
      total_ventas: c.total_ventas,
      total_egresos: c.total_egresos,
      saldo_neto: c.total_ventas - c.total_egresos,
      cantidad_ventas: c.cantidad_ventas,
      efectivo,
      transferencia: 0,
      debito,
      credito,
      mercadopago,
      efectivo_contado: efectivoContado,
      diferencia_efectivo: c.efectivo_contado_offset,
      retiro_efectivo: c.retiro_efectivo,
      created_at: timestampCierre(c.dias_atras),
    })
    if (error) throw new Error(`cierre día -${c.dias_atras}: ${error.message}`)
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('🌱 Seed de landing — Kiosco El Faro\n')

  const comercio = await ensureComercio()
  console.log('✓ Comercio:', COMERCIO_NOMBRE, `(${comercio.id})`)

  const usuarios = await ensureUsuarios(comercio.id)
  console.log(`✓ Usuarios: ${usuarios.length}`)
  const sofia = usuarios.find(u => u.email === 'sofia@kioscoelfaro.com.ar')!

  await ensureCategorias(comercio.id)
  console.log(`✓ Categorías: ${CATEGORIAS.length}`)

  const productos = await ensureProductos(comercio.id)
  console.log(`✓ Productos: ${productos.length}`)

  await ensureLotes(productos)
  console.log(`✓ Lotes: ${LOTES.length}`)

  await crearVentasHoy(comercio.id, productos, usuarios)
  console.log(`✓ Ventas hoy: ${VENTAS_HOY.length}`)

  await crearEgresosHoy(comercio.id)
  console.log(`✓ Egresos hoy: ${EGRESOS_HOY.length}`)

  await crearCierresPasados(comercio.id, sofia.id)
  console.log(`✓ Cierres pasados: ${CIERRES_PASADOS.length}`)

  await crearCierreHoy(comercio.id, sofia.id)
  console.log('✓ Cierre de hoy')

  console.log('\n✅ Seed completado.')
  console.log('\nLogin para capturar:')
  console.log('  sofia@kioscoelfaro.com.ar  / sylvora123  (admin)')
  console.log('  martin@kioscoelfaro.com.ar / sylvora123  (empleado)')
  console.log('  laura@kioscoelfaro.com.ar  / sylvora123  (empleado)')
}

main().catch(err => {
  console.error('\n❌ Seed falló:', err.message || err)
  process.exit(1)
})
