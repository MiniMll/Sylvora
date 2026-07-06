'use client'
import { useEffect, useState } from 'react'
import { getProductos } from '@/lib/supabase/productos'
import { getVentas } from '@/lib/supabase/ventas'
import { getComercio } from '@/lib/supabase/_base'
import type { PeriodoExport } from '@/lib/exportar/periodo'
import { traerVentasParaExport } from '@/lib/exportar/ventas-export'
import { toast } from 'sonner'
import { FileText, Table, Receipt, BarChart2, AlertTriangle, Info, Package, ShoppingCart, Lightbulb } from 'lucide-react'
import { formatPeso } from '@/lib/utils'
import { Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Hint } from '@/components/ui/Hint'
import { TrialBlocked } from '@/components/ui/TrialBlocked'
import { useTrial } from '@/lib/hooks/useTrial'
import type { Comercio } from '@/types/database'
import type jsPDF from 'jspdf'

// Cabecera consistente para los 3 PDFs: nombre del comercio uppercase
// como brand principal, sub-headers con datos de contacto si están
// disponibles, después el título del reporte y la fecha generada.
// El "Generado con Sylvora" va al footer del documento, no al header
// — el reporte es del comercio, no de Sylvora.
function dibujarCabecera(
  doc: jsPDF,
  comercio: Comercio | null,
  titulo: string,
  fecha: string,
): number {
  const nombre = (comercio?.nombre || 'SYLVORA').toUpperCase()
  const subHeader = [comercio?.direccion, comercio?.telefono]
    .filter(Boolean)
    .join(' · ')

  // Brand del comercio en negro fuerte (no violeta — el violeta era
  // "Sylvora" como marca; el comercio es marca propia, neutra).
  doc.setFontSize(20); doc.setTextColor(30, 30, 30)
  doc.text(nombre, 14, 18)

  let yCursor = 18
  if (subHeader) {
    doc.setFontSize(9); doc.setTextColor(120, 120, 120)
    doc.text(subHeader, 14, 25)
    yCursor = 25
  }

  // Título del reporte
  doc.setFontSize(13); doc.setTextColor(40, 40, 40)
  doc.text(titulo, 14, yCursor + 9)
  doc.setFontSize(9); doc.setTextColor(120, 120, 120)
  doc.text(`Generado el ${fecha}`, 14, yCursor + 16)

  return yCursor + 16  // Y donde empezar el siguiente contenido
}

// Footer chiquito al final de cada página con atribución Sylvora.
// Estética: gris claro, fontSize 7, centrado horizontalmente.
function dibujarFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  doc.setFontSize(7); doc.setTextColor(160, 160, 160)
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageHeight = doc.internal.pageSize.height
    const pageWidth = doc.internal.pageSize.width
    doc.text('Generado con Sylvora · sylvora.app', pageWidth / 2, pageHeight - 8, { align: 'center' })
  }
}


export default function ExportarPage() {
  const [periodo, setPeriodo] = useState<PeriodoExport>('mes')
  const [cargando, setCargando] = useState<string | null>(null)
  // Datos del comercio para el header de los PDFs. Cached por sesión
  // via getComercio. Se carga una vez al montar la página.
  const [comercio, setComercio] = useState<Comercio | null>(null)
  // hayDatos: null mientras carga, false si no hay nada que exportar
  // (sin productos NI ventas), true si hay algo. Una sola pasada al
  // montar — necesaria porque la página no pre-carga datos (cada
  // export los trae bajo demanda).
  const [hayDatos, setHayDatos] = useState<boolean | null>(null)
  // Trial gating — si el comercio expiró, bloqueamos la generación
  // de reportes con el overlay TrialBlocked.
  const trial = useTrial()

  useEffect(() => {
    getComercio().then(setComercio)
  }, [])

  useEffect(() => {
    // Chequeo de existencia liviano: solo necesitamos saber si hay ≥1
    // venta, no descargar todas con sus items. limit:1 + conItems:false
    // trae 1 fila sin joins en vez del historial completo.
    Promise.all([getProductos(), getVentas({ limit: 1, conItems: false })])
      .then(([productos, ventas]) => setHayDatos(productos.length > 0 || ventas.length > 0))
      .catch(() => setHayDatos(true)) // ante error, no bloqueamos la exportación
  }, [])

  // Trae las ventas del período para exportar (sin items, con guarda de
  // tamaño). Si el período es demasiado grande, avisa y devuelve null —
  // preferimos CANCELAR la exportación antes que generar un archivo
  // financiero incompleto.
  const obtenerVentasOAbortar = async (): Promise<Awaited<ReturnType<typeof getVentas>> | null> => {
    const res = await traerVentasParaExport(getVentas, periodo)
    if (!res.ok) {
      toast.error(
        'El período seleccionado tiene demasiadas ventas para exportar de una vez. Elegí un rango más corto (por ejemplo, este mes) y volvé a intentar.',
        { duration: 9000 },
      )
      return null
    }
    return res.ventas
  }

  const exportar = async (id: string, fn: () => Promise<void>) => {
    setCargando(id)
    try {
      await fn()
    } catch (e) {
      toast.error('No pudimos generar el reporte. Probá de nuevo.')
    } finally {
      setCargando(null)
    }
  }
  const exportarStockPDF = async () => {
  setCargando('stock-pdf')
  const productos = await getProductos()
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  const fecha = new Date().toLocaleDateString('es-AR')

  const yAfterHeader = dibujarCabecera(doc, comercio, 'Reporte de Stock', fecha)

  const sinStock = productos.filter((p: any) => p.stock_actual === 0).length
  const criticos = productos.filter((p: any) => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo * 0.3).length
  const bajos = productos.filter((p: any) => p.stock_actual > p.stock_minimo * 0.3 && p.stock_actual <= p.stock_minimo).length

  doc.setFontSize(10); doc.setTextColor(40, 40, 40)
  doc.text(`Total: ${productos.length} · Sin stock: ${sinStock} · Críticos: ${criticos} · Stock bajo: ${bajos}`, 14, yAfterHeader + 8)

  autoTable(doc, {
    startY: yAfterHeader + 14,
    head: [['Producto', 'SKU', 'Código', 'Stock', 'Mínimo', 'P. Venta', 'Estado']],
    body: productos.map((p: any) => {
      const estado = p.stock_actual === 0 ? 'Sin stock' : p.stock_actual <= p.stock_minimo * 0.3 ? 'Crítico' : p.stock_actual <= p.stock_minimo ? 'Stock bajo' : 'OK'
      return [p.nombre, p.sku || '—', p.codigo_barras || '—', p.unidad_venta === 'kg' ? `${p.stock_actual} kg` : p.stock_actual, p.stock_minimo, p.precio_por_kg ? `$${p.precio_por_kg}/kg` : `$${p.precio_venta}`, estado]
    }),
    headStyles: { fillColor: [91, 76, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didParseCell: (data: any) => {
      if (data.column.index === 6 && data.section === 'body') {
        const val = data.cell.text[0]
        if (val === 'Sin stock') data.cell.styles.textColor = [136, 136, 152]
        else if (val === 'Crítico') data.cell.styles.textColor = [255, 71, 87]
        else if (val === 'Stock bajo') data.cell.styles.textColor = [255, 184, 0]
        else data.cell.styles.textColor = [0, 200, 150]
      }
    }
  })
  dibujarFooter(doc)
  doc.save(`stock-${fecha.replace(/\//g, '-')}.pdf`)
  setCargando(null)
  toast.success('Stock PDF descargado')
}
  const exportarStockExcel = async () => {
  setCargando('stock-excel')
  const productos = await getProductos()
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  // Hoja 1: Stock general
  const datosStock = productos.map((p: any) => ({
    'Nombre': p.nombre,
    'SKU': p.sku || '',
    'Código de barras': p.codigo_barras || '',
    'Unidad': p.unidad_venta,
    'Stock actual': p.stock_actual,
    'Stock mínimo': p.stock_minimo,
    'Stock ideal': p.stock_ideal,
    'Precio costo': p.precio_costo,
    'Precio venta': p.unidad_venta === 'kg' ? p.precio_por_kg : p.precio_venta,
    'Margen %': p.precio_venta > 0 ? Math.round((1 - p.precio_costo / p.precio_venta) * 100) : 0,
    'Estado': p.stock_actual === 0 ? 'Sin stock' : p.stock_actual <= p.stock_minimo * 0.3 ? 'Crítico' : p.stock_actual <= p.stock_minimo ? 'Stock bajo' : 'OK',
  }))
  const ws1 = XLSX.utils.json_to_sheet(datosStock)
  ws1['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Stock general')

  // Hoja 2: Lotes
  const { getLotes } = await import('@/lib/supabase/stock')
  const lotesData: any[] = []
  for (const p of productos) {
    const lotes = await getLotes(p.id)
    lotes.forEach((l: any) => {
      const vencido = l.fecha_vencimiento && new Date(l.fecha_vencimiento) < new Date()
      lotesData.push({
        'Producto': p.nombre,
        'SKU': p.sku || '',
        'Nro. Lote': l.numero_lote,
        'Cantidad': l.cantidad,
        'Fecha vencimiento': l.fecha_vencimiento ? new Date(l.fecha_vencimiento).toLocaleDateString('es-AR') : '—',
        'Estado lote': vencido ? 'VENCIDO' : '—',
        'Fecha ingreso': new Date(l.fecha_ingreso).toLocaleDateString('es-AR'),
      })
    })
  }
  if (lotesData.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(lotesData)
    ws2['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Lotes')
  }

  XLSX.writeFile(wb, `stock-${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.xlsx`)
  setCargando(null)
  toast.success('Stock Excel descargado')
}

  const exportarVentasPDF = async () => {
    setCargando('ventas-pdf')
    const ventas = await obtenerVentasOAbortar()
    if (!ventas) return   // período demasiado grande — cancelado, sin archivo
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const fecha = new Date().toLocaleDateString('es-AR')
    const total = ventas.reduce((s: number, v: any) => s + Number(v.total), 0)

    const yAfterHeader = dibujarCabecera(doc, comercio, 'Historial de Ventas', fecha)

    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    doc.text(`Total: ${ventas.length} ventas · Recaudado: ${formatPeso(total)}`, 14, yAfterHeader + 8)

    autoTable(doc, {
      startY: yAfterHeader + 14,
      head: [['Fecha', 'Ticket', 'Método', 'Desc.%', 'Rec.%', 'Total', 'Estado']],
      body: ventas.map((v: any) => [
        new Date(v.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
        '#' + String(v.numero_ticket).padStart(4, '0'),
        v.metodo_pago,
        v.descuento_porcentaje > 0 ? `-${v.descuento_porcentaje}%` : '—',
        v.recargo_porcentaje > 0 ? `+${v.recargo_porcentaje}%` : '—',
        formatPeso(v.total),
        v.estado,
      ]),
      headStyles: { fillColor: [91, 76, 255], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    })
    dibujarFooter(doc)
    doc.save(`ventas-${fecha.replace(/\//g, '-')}.pdf`)
    toast.success('Ventas PDF descargado')
  }

  const exportarVentasExcel = async () => {
    setCargando('ventas-excel')
    const ventas = await obtenerVentasOAbortar()
    if (!ventas) return   // período demasiado grande — cancelado, sin archivo
    const XLSX = await import('xlsx')
    const datos = ventas.map((v: any) => ({
      'Fecha': new Date(v.created_at).toLocaleString('es-AR'),
      'Ticket': '#' + String(v.numero_ticket).padStart(4, '0'),
      'Subtotal': v.subtotal,
      'Descuento %': v.descuento_porcentaje,
      'Descuento $': v.descuento_monto,
      'Recargo %': v.recargo_porcentaje,
      'Recargo $': v.recargo_monto,
      'Total': v.total,
      'Método': v.metodo_pago,
      'Estado': v.estado,
    }))
    const ws = XLSX.utils.json_to_sheet(datos)
    ws['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas')
    XLSX.writeFile(wb, `ventas-${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.xlsx`)
    toast.success('Listo, descargamos el Excel de ventas')
  }

  const exportarAlertasPDF = async () => {
    setCargando('alertas-pdf')
    const productos = await getProductos()
    const alertas = productos.filter((p: any) => p.stock_actual <= p.stock_minimo)
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const fecha = new Date().toLocaleDateString('es-AR')

    const yAfterHeader = dibujarCabecera(doc, comercio, 'Alertas de Stock — Lista de reposición', fecha)

    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
    doc.text(`${alertas.length} productos para reponer`, 14, yAfterHeader + 8)

    autoTable(doc, {
      startY: yAfterHeader + 14,
      head: [['Producto', 'SKU', 'Stock actual', 'Mínimo', 'Necesita', 'Estado']],
      body: alertas.map((p: any) => [
        p.nombre,
        p.sku || '—',
        p.stock_actual,
        p.stock_minimo,
        p.stock_ideal - p.stock_actual > 0 ? p.stock_ideal - p.stock_actual : '—',
        p.stock_actual <= p.stock_minimo * 0.3 ? 'CRÍTICO' : 'Stock bajo',
      ]),
      headStyles: { fillColor: [255, 71, 87], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    })
    dibujarFooter(doc)
    doc.save(`alertas-stock-${fecha.replace(/\//g, '-')}.pdf`)
    toast.success('Alertas PDF descargado')
  }

  const REPORTES = [
    { id: 'stock-pdf', titulo: 'Stock completo PDF', desc: 'Todos los productos con stock, precios y estado', fn: () => exportar('stock-pdf', exportarStockPDF), Icon: FileText, color: '#5b4cff' },
    { id: 'stock-excel', titulo: 'Stock completo Excel', desc: 'Planilla editable con todos los datos del inventario', fn: () => exportar('stock-excel', exportarStockExcel), Icon: Table, color: '#00c896' },
    { id: 'ventas-pdf', titulo: 'Ventas PDF', desc: 'Historial de ventas con métodos de pago y totales', fn: () => exportar('ventas-pdf', exportarVentasPDF), Icon: Receipt, color: '#ff6b35' },
    { id: 'ventas-excel', titulo: 'Ventas Excel', desc: 'Datos de ventas para análisis o contador', fn: () => exportar('ventas-excel', exportarVentasExcel), Icon: BarChart2, color: '#ffd23f' },
    { id: 'alertas-pdf', titulo: 'Alertas de stock PDF', desc: 'Lista de productos a reponer con cantidades necesarias', fn: () => exportar('alertas-pdf', exportarAlertasPDF), Icon: AlertTriangle, color: '#ff4757' },
  ]

  // Trial vencido → reemplazamos toda la pantalla. Nada de exportar
  // ni opciones — el comercio sigue viendo sus datos en otras
  // pantallas (dashboard/productos/ventas), solo bloqueamos generar
  // reportes nuevos hasta que active el plan.
  if (trial.expirado) {
    return <TrialBlocked comercio={trial.comercio} />
  }

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Exportar PDF / Excel</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>Descargá reportes con datos reales de tu comercio</p>
      </div>

      {hayDatos === false ? (
        <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <EmptyState
            accent
            icon={<FileText size={20} color="var(--ac)" strokeWidth={2} />}
            title="Todavía no hay nada para exportar."
            description="Cargá productos o hacé tu primera venta y vas a poder bajar reportes en PDF y Excel para tu contador."
            actions={[
              { label: 'Cargar productos', href: '/productos', variant: 'primary', icon: <Package size={15} /> },
              { label: 'Ir al POS', href: '/pos', variant: 'ghost', icon: <ShoppingCart size={15} /> },
            ]}
            guiaHref="/guia"
          />
        </div>
      ) : (
      <>
      <Hint id="exportar-primera" icon={<Lightbulb size={15} />} style={{ marginBottom: 16 }}>
        Elegí el período y bajá el reporte. Los PDF se abren en el navegador
        y los Excel se descargan — listos para mandarle a tu contador.
      </Hint>
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: 18, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, letterSpacing: '-0.2px', color: 'var(--text)' }}>⚙️ Opciones</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Período</label>
            <Select value={periodo} onChange={e => setPeriodo(e.target.value as PeriodoExport)} style={{ padding: '8px 10px' }}>
              <option value="hoy">Hoy</option>
              <option value="semana">Esta semana</option>
              <option value="mes">Este mes</option>
              <option value="todo">Todo el historial</option>
            </Select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Logo en encabezado</label>
            <Select style={{ padding: '8px 10px' }}>
              <option>Sí</option><option>No</option>
            </Select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {REPORTES.map(r => {
          const Icon = r.Icon
          return (
            <button key={r.id} onClick={r.fn} disabled={cargando === r.id}
              style={{ textAlign: 'left', padding: 18, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--card)', cursor: cargando === r.id ? 'wait' : 'pointer', opacity: cargando === r.id ? 0.7 : 1, transition: 'all 0.15s', fontFamily: 'inherit' }}
              onMouseEnter={e => { if (cargando !== r.id) (e.currentTarget.style.borderColor = r.color) }}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon size={20} color={r.color} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5, letterSpacing: '-0.2px', color: 'var(--text)',}}>
                {cargando === r.id ? 'Generando...' : r.titulo}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{r.desc}</div>
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 16, background: 'rgba(91,76,255,0.05)', border: '1px solid rgba(91,76,255,0.15)', borderRadius: 12, padding: '10px 14px', fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Info size={14} color="#5b4cff" style={{ flexShrink: 0, marginTop: 1 }} />
        <span><b style={{ color: 'var(--text)' }}>Tip:</b> Los archivos PDF se abren en el navegador. Los Excel se descargan automáticamente. Podés enviarlos directamente a tu contador.</span>
      </div>
      </>
      )}
    </div>
  )
}