import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { esRolValido, rolPuede } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const TZ = 'America/Argentina/Buenos_Aires'

type VentaPeriodoRow = {
  id: string
  total: number | string
  metodo_pago: string
  created_at: string
  items_venta?: Array<{
    producto_id: string | null
    nombre_producto: string
    cantidad: number | string
    subtotal: number | string
  }>
}

type VentaRecienteRow = {
  id: string
  numero_ticket: number
  total: number | string
  metodo_pago: string
  created_at: string
}

type ProductoStockRow = {
  id: string
  nombre: string
  stock_actual: number | string
  stock_minimo: number | string
  unidad_venta: string
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - date.getTime()
}

function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  ))
  return new Date(guess.getTime() - offsetMs(guess, timeZone))
}

function addDays(parts: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function rangeStarts(now: Date) {
  const today = zonedParts(now, TZ)
  const todayDate = { year: today.year, month: today.month, day: today.day }
  const hoyInicio = zonedTimeToUtc(todayDate, TZ)
  const sieteDiasInicio = zonedTimeToUtc(addDays(todayDate, -6), TZ)
  const mesInicio = zonedTimeToUtc({ year: today.year, month: today.month, day: 1 }, TZ)
  const periodoInicio = new Date(Math.min(sieteDiasInicio.getTime(), mesInicio.getTime()))
  return { hoyInicio, sieteDiasInicio, mesInicio, periodoInicio }
}

function sumVentas(rows: VentaPeriodoRow[], desde: Date, hasta: Date) {
  let cantidad = 0
  let total = 0
  const desdeMs = desde.getTime()
  const hastaMs = hasta.getTime()
  for (const v of rows) {
    const ts = new Date(v.created_at).getTime()
    if (ts >= desdeMs && ts <= hastaMs) {
      cantidad += 1
      total += Number(v.total) || 0
    }
  }
  return { cantidad, total }
}

function topProductosMes(rows: VentaPeriodoRow[], mesInicio: Date, now: Date) {
  const map = new Map<string, {
    producto_id: string | null
    nombre: string
    cantidad: number
    facturacion: number
  }>()
  const desde = mesInicio.getTime()
  const hasta = now.getTime()

  for (const venta of rows) {
    const ts = new Date(venta.created_at).getTime()
    if (ts < desde || ts > hasta) continue
    for (const item of venta.items_venta ?? []) {
      const key = item.producto_id ?? `nombre:${item.nombre_producto}`
      const current = map.get(key) ?? {
        producto_id: item.producto_id,
        nombre: item.nombre_producto,
        cantidad: 0,
        facturacion: 0,
      }
      current.cantidad += Number(item.cantidad) || 0
      current.facturacion += Number(item.subtotal) || 0
      map.set(key, current)
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.cantidad - a.cantidad || b.facturacion - a.facturacion)
    .slice(0, 5)
}

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* no-op */ },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .select('comercio_id, rol')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil?.comercio_id) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
  }
  if (!esRolValido(perfil.rol) || !rolPuede(perfil.rol, 'reporte.ver_completo')) {
    return NextResponse.json({ error: 'No tenés permiso para ver métricas comerciales' }, { status: 403 })
  }

  const now = new Date()
  const { hoyInicio, sieteDiasInicio, mesInicio, periodoInicio } = rangeStarts(now)
  const comercioId = perfil.comercio_id

  const ventasPeriodoQuery = supabase
    .from('ventas')
    .select('id,total,metodo_pago,created_at,items_venta(producto_id,nombre_producto,cantidad,subtotal)')
    .eq('comercio_id', comercioId)
    .eq('estado', 'completada')
    .gte('created_at', periodoInicio.toISOString())
    .lte('created_at', now.toISOString())
    .order('created_at', { ascending: false })

  const ultimasVentasQuery = supabase
    .from('ventas')
    .select('id,numero_ticket,total,metodo_pago,created_at')
    .eq('comercio_id', comercioId)
    .eq('estado', 'completada')
    .order('created_at', { ascending: false })
    .limit(10)

  const stockQuery = supabase
    .from('productos')
    .select('id,nombre,stock_actual,stock_minimo,unidad_venta')
    .eq('comercio_id', comercioId)
    .eq('activo', true)
    .gt('stock_minimo', 0)
    .order('stock_actual', { ascending: true })

  const [ventasPeriodoRes, ultimasVentasRes, stockRes] = await Promise.all([
    ventasPeriodoQuery,
    ultimasVentasQuery,
    stockQuery,
  ])

  if (ventasPeriodoRes.error) {
    console.error('[dashboard/comercial] ventasPeriodo falló:', ventasPeriodoRes.error)
    return NextResponse.json({ error: 'No pudimos calcular las ventas del dashboard' }, { status: 500 })
  }
  if (ultimasVentasRes.error) {
    console.error('[dashboard/comercial] ultimasVentas falló:', ultimasVentasRes.error)
    return NextResponse.json({ error: 'No pudimos leer las últimas ventas' }, { status: 500 })
  }
  if (stockRes.error) {
    console.error('[dashboard/comercial] stockCritico falló:', stockRes.error)
    return NextResponse.json({ error: 'No pudimos leer el stock crítico' }, { status: 500 })
  }

  const ventasPeriodo = (ventasPeriodoRes.data ?? []) as VentaPeriodoRow[]
  const ventasHoy = sumVentas(ventasPeriodo, hoyInicio, now)
  const ventas7Dias = sumVentas(ventasPeriodo, sieteDiasInicio, now)
  const ventasMes = sumVentas(ventasPeriodo, mesInicio, now)
  const stockCritico = ((stockRes.data ?? []) as ProductoStockRow[])
    .filter(p => Number(p.stock_actual) <= Number(p.stock_minimo))
    .sort((a, b) => {
      const ratioA = Number(a.stock_actual) / Math.max(Number(a.stock_minimo), 1)
      const ratioB = Number(b.stock_actual) / Math.max(Number(b.stock_minimo), 1)
      return ratioA - ratioB || a.nombre.localeCompare(b.nombre)
    })

  return NextResponse.json({
    generado_en: now.toISOString(),
    rango: {
      tz: TZ,
      hoy_inicio: hoyInicio.toISOString(),
      siete_dias_inicio: sieteDiasInicio.toISOString(),
      mes_inicio: mesInicio.toISOString(),
    },
    kpis: {
      ventas_hoy_cantidad: ventasHoy.cantidad,
      ventas_hoy_total: ventasHoy.total,
      ventas_7_dias_total: ventas7Dias.total,
      ventas_mes_total: ventasMes.total,
      ventas_mes_cantidad: ventasMes.cantidad,
      ticket_promedio_mes: ventasMes.cantidad > 0 ? ventasMes.total / ventasMes.cantidad : 0,
      stock_critico_cantidad: stockCritico.length,
    },
    top_productos: topProductosMes(ventasPeriodo, mesInicio, now),
    stock_critico: stockCritico.slice(0, 10).map(p => ({
      producto_id: p.id,
      nombre: p.nombre,
      stock_actual: Number(p.stock_actual) || 0,
      stock_minimo: Number(p.stock_minimo) || 0,
      unidad_venta: p.unidad_venta,
    })),
    ultimas_ventas: ((ultimasVentasRes.data ?? []) as VentaRecienteRow[]).map(v => ({
      id: v.id,
      numero_ticket: v.numero_ticket,
      fecha: v.created_at,
      cliente: null,
      total: Number(v.total) || 0,
      metodo_pago: v.metodo_pago,
    })),
  })
}
