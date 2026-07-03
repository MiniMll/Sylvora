import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { esRolValido, rolPuede } from '@/lib/permissions'
import {
  obtenerDiaOperativoActual,
  obtenerRangoUltimosDiasOperativos,
  obtenerRangoMesOperativoActual,
  TZ_ARGENTINA,
} from '@/lib/operacion/diaOperativo'

export const dynamic = 'force-dynamic'

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

type GastoRow = {
  monto: number | string
}

// La definición de "día" NO vive acá: sale de lib/operacion/diaOperativo.ts
// a partir de comercios.settings — misma fuente que usa Caja. Este endpoint
// solo suma dentro de rangos [inicio, fin) que le da el helper.

function sumVentas(rows: VentaPeriodoRow[], desde: Date, hasta: Date) {
  let cantidad = 0
  let total = 0
  const desdeMs = desde.getTime()
  const hastaMs = hasta.getTime()
  for (const v of rows) {
    const ts = new Date(v.created_at).getTime()
    if (ts >= desdeMs && ts < hastaMs) {
      cantidad += 1
      total += Number(v.total) || 0
    }
  }
  return { cantidad, total }
}

function topProductosMes(rows: VentaPeriodoRow[], mesInicio: Date, hastaFin: Date) {
  const map = new Map<string, {
    producto_id: string | null
    nombre: string
    cantidad: number
    facturacion: number
  }>()
  const desde = mesInicio.getTime()
  const hasta = hastaFin.getTime()

  for (const venta of rows) {
    const ts = new Date(venta.created_at).getTime()
    if (ts < desde || ts >= hasta) continue
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

  const comercioId = perfil.comercio_id

  // Settings del comercio → día operativo. Misma definición que Caja.
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .select('settings')
    .eq('id', comercioId)
    .single()
  if (comercioError) {
    console.error('[dashboard/comercial] comercio falló:', comercioError)
    return NextResponse.json({ error: 'No pudimos leer la configuración del comercio' }, { status: 500 })
  }

  const now = new Date()
  const settings = comercio?.settings ?? null
  // "Hoy" = día operativo actual. Para una pizzería 18-02 a la 01:30,
  // esto es el día que abrió ayer a las 18:00 — igual que en Caja.
  const dia = obtenerDiaOperativoActual(settings, now)
  const hoyInicio = dia.inicio
  const hoyFin = dia.fin
  // 7 días / mes: anclados al día operativo actual, no al calendario.
  const sieteDiasInicio = obtenerRangoUltimosDiasOperativos(settings, 7, now).inicio
  const mesInicio = obtenerRangoMesOperativoActual(settings, now).inicio
  const periodoInicio = new Date(Math.min(sieteDiasInicio.getTime(), mesInicio.getTime()))

  const ventasPeriodoQuery = supabase
    .from('ventas')
    .select('id,total,metodo_pago,created_at,items_venta(producto_id,nombre_producto,cantidad,subtotal)')
    .eq('comercio_id', comercioId)
    .eq('estado', 'completada')
    .gte('created_at', periodoInicio.toISOString())
    .lt('created_at', hoyFin.toISOString())
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

  // gastos.fecha es DATE (sin hora): comparamos contra fechas OPERATIVAS,
  // no contra la fecha UTC del server (now.toISOString() era fecha UTC —
  // a partir de las 21:00 AR ya contaba el "mañana" y podía excluir
  // gastos del día). El mes operativo va del día 1 al día operativo actual.
  const primerDiaMesOperativo = `${dia.fechaOperativa.slice(0, 7)}-01`
  const gastosMesQuery = supabase
    .from('gastos')
    .select('monto')
    .eq('comercio_id', comercioId)
    .gte('fecha', primerDiaMesOperativo)
    .lte('fecha', dia.fechaOperativa)

  const [ventasPeriodoRes, ultimasVentasRes, stockRes, gastosMesRes] = await Promise.all([
    ventasPeriodoQuery,
    ultimasVentasQuery,
    stockQuery,
    gastosMesQuery,
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
  if (gastosMesRes.error) {
    console.error('[dashboard/comercial] gastosMes falló:', gastosMesRes.error)
    return NextResponse.json({ error: 'No pudimos leer los gastos del mes' }, { status: 500 })
  }

  const ventasPeriodo = (ventasPeriodoRes.data ?? []) as VentaPeriodoRow[]
  const ventasHoy = sumVentas(ventasPeriodo, hoyInicio, hoyFin)
  const ventas7Dias = sumVentas(ventasPeriodo, sieteDiasInicio, hoyFin)
  const ventasMes = sumVentas(ventasPeriodo, mesInicio, hoyFin)
  const gastosMes = ((gastosMesRes.data ?? []) as GastoRow[])
    .reduce((sum, g) => sum + (Number(g.monto) || 0), 0)
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
      tz: TZ_ARGENTINA,
      fecha_operativa: dia.fechaOperativa,
      // true cuando el comercio configuró horario propio (no 24hs).
      // La UI usa esto para etiquetar "día operativo" sin exponer horas.
      usa_dia_operativo: !dia.config.caja_24hs,
      hoy_inicio: hoyInicio.toISOString(),
      hoy_fin: hoyFin.toISOString(),
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
      gastos_mes_total: gastosMes,
      ganancia_estimada_mes: ventasMes.total - gastosMes,
      stock_critico_cantidad: stockCritico.length,
    },
    top_productos: topProductosMes(ventasPeriodo, mesInicio, hoyFin),
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
