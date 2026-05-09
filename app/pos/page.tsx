'use client'
import { useEffect, useState, useRef } from 'react'
import { getProductos, guardarVenta } from '@/lib/supabase/productos'
import { usePOSStore } from '@/lib/store'
import { toast } from 'sonner'
import { Camera, Keyboard, Search, Scale, Beaker, Ruler, X, ShoppingCart, CheckCircle } from 'lucide-react'

const METODOS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'debito', label: 'Débito' },
  { id: 'mercadopago', label: '📲 Mercado Pago' },
]

const PRESETS_DESC = [5, 10, 15]
const PRESETS_REC = [5, 10, 13]

function formatPeso(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }

export default function POSPage() {
  const store = usePOSStore()
  const [PRODUCTOS, setProductos] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [cobrado, setCobrado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const scanRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const busquedaRef = useRef<HTMLInputElement>(null)
  const [modoCamara, setModoCamara] = useState(false)
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [modalCantidad, setModalCantidad] = useState<any | null>(null)
  const [cantidadIngresada, setCantidadIngresada] = useState('')
  const [modalScanner, setModalScanner] = useState(false)
  const [codigoManual, setCodigoManual] = useState('')
  const [modalPago, setModalPago] = useState(false)
  const [pagoUrl, setPagoUrl] = useState('')
  const [pagoId, setPagoId] = useState('')
  const [verificandoPago, setVerificandoPago] = useState(false)
  const [pagoEstado, setPagoEstado] = useState<'pendiente' | 'aprobado' | 'error' | null>(null)

  useEffect(() => {
    getProductos().then(data => { setProductos(data); setCargando(false) })
  }, [])

  // Filtrar productos al buscar
  useEffect(() => {
    if (!busqueda.trim()) { setResultados([]); return }
    const q = busqueda.toLowerCase()
    const found = PRODUCTOS.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.codigo_barras || '').includes(busqueda) ||
      (p.sku || '').toLowerCase().includes(q)
    ).slice(0, 8)
    setResultados(found)
  }, [busqueda, PRODUCTOS])

  const necesitaModal = (p: any) => ['kg', 'litro', 'metro'].includes(p.unidad_venta)

  const agregar = (p: any) => {
    setBusqueda('')
    setResultados([])
    if (necesitaModal(p)) {
      setModalCantidad(p)
      setCantidadIngresada('')
      return
    }
    const enTicket = store.items.find(i => i.producto_id === p.id)
    const cantidadEnTicket = enTicket ? enTicket.cantidad : 0
    if (p.stock_actual === 0) toast.warning(`${p.nombre} no tiene stock`)
    else if (cantidadEnTicket + 1 > p.stock_actual) toast.warning(`Solo quedan ${p.stock_actual} unidades`)
    store.agregarItem({
      producto_id: p.id,
      nombre: p.nombre,
      precio_unitario: p.precio_venta,
      cantidad: 1,
      codigo_barras: p.codigo_barras || '',
    })
    busquedaRef.current?.focus()
  }

  const agregarConCantidad = () => {
    if (!modalCantidad || !cantidadIngresada) { toast.error('Ingresá la cantidad'); return }
    const cant = Number(cantidadIngresada)
    if (cant <= 0) { toast.error('La cantidad debe ser mayor a 0'); return }
    if (cant > modalCantidad.stock_actual) {
      toast.warning(`Solo hay ${modalCantidad.stock_actual} ${modalCantidad.unidad_venta} disponibles`)
    }
    const unidad = modalCantidad.unidad_venta
    const precio = unidad === 'kg'
      ? modalCantidad.precio_por_kg * cant
      : modalCantidad.precio_venta * cant
    const sufijo = unidad === 'kg' ? `${cant} kg` : unidad === 'litro' ? `${cant} L` : `${cant} m`

    store.agregarItem({
      producto_id: `${modalCantidad.id}_${Date.now()}`,
      nombre: `${modalCantidad.nombre} (${sufijo})`,
      precio_unitario: precio,
      cantidad: 1,
      codigo_barras: modalCantidad.codigo_barras || '',
      peso_kg: cant,
    })
    setModalCantidad(null)
    setCantidadIngresada('')
    busquedaRef.current?.focus()
  }

  const agregarPorCodigo = (codigo: string) => {
    const p = PRODUCTOS.find(x => x.codigo_barras === codigo)
    if (p) { agregar(p); setCodigoManual(''); setModalScanner(false) }
    else toast.error('Código no encontrado: ' + codigo)
  }

  const iniciarCamara = async () => {
    setModoCamara(true); setCamaraActiva(false)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/library')
      const codeReader = new BrowserMultiFormatReader()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setCamaraActiva(true)
        codeReader.decodeFromVideoDevice(null, videoRef.current, (result) => {
          if (result) {
            agregarPorCodigo(result.getText())
            stream.getTracks().forEach(t => t.stop())
            setModoCamara(false); setCamaraActiva(false)
          }
        })
      }
    } catch {
      toast.error('No se pudo acceder a la cámara')
      setModoCamara(false)
    }
  }

  const cerrarCamara = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    setModoCamara(false); setCamaraActiva(false)
  }

  const iniciarPagoMP = async () => {
    if (!store.items.length) { toast.error('El ticket está vacío'); return }
    const ref = `venta_${Date.now()}`
    setPagoId(ref)
    setPagoEstado('pendiente')
    setModalPago(true)

    const res = await fetch('/api/mp/crear-pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total: store.total(),
        descripcion: `Venta Sylvora — ${store.items.length} productos`,
        external_reference: ref,
      })
    })
    const data = await res.json()
    setPagoUrl(data.sandbox_init_point || data.init_point)

    // Verificar cada 3 segundos
    const interval = setInterval(async () => {
      setVerificandoPago(true)
      const check = await fetch(`/api/mp/verificar?external_reference=${ref}`)
      const resultado = await check.json()
      setVerificandoPago(false)
      if (resultado.pagado) {
        setPagoEstado('aprobado')
        clearInterval(interval)
        // Guardar venta
        await cobrarConMetodo('mercadopago')
        setTimeout(() => { setModalPago(false); setPagoEstado(null) }, 3000)
      }
    }, 3000)

    // Cancelar después de 10 minutos
    setTimeout(() => clearInterval(interval), 10 * 60 * 1000)
  }

  const cobrarConMetodo = async (metodo: string) => {
    const itemsParaVenta = store.items.map(i => ({
      producto_id: i.producto_id.includes('_') ? i.producto_id.split('_')[0] : i.producto_id,
      nombre_producto: i.nombre,
      precio_unitario: i.precio_unitario,
      cantidad: i.cantidad,
      subtotal: i.subtotal,
      peso_kg: i.peso_kg,
    }))
    await guardarVenta({
      subtotal: store.subtotal(),
      descuento_porcentaje: store.descuentoPct,
      descuento_monto: store.descuentoMonto(),
      recargo_porcentaje: store.recargoPct,
      recargo_monto: store.recargoMonto(),
      total: store.total(),
      metodo_pago: metodo,
      items: itemsParaVenta,
    })
    setCobrado(true)
    toast.success(`Venta de ${formatPeso(store.total())} registrada`)
    setTimeout(() => { setCobrado(false); store.limpiarTicket() }, 2000)
  }

  const cobrar = async () => {
    if (!store.items.length) { toast.error('El ticket está vacío'); return }
    await cobrarConMetodo(store.metodoPago)
  }

  const card: React.CSSProperties = {
    background: 'var(--card)', borderRadius: 16,
    border: '1px solid var(--border)', boxShadow: 'var(--shadow)'
  }

  if (cargando) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      Cargando productos...
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* PANEL IZQUIERDO — Buscador */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', ...card, margin: 16, marginRight: 8, overflow: 'hidden' }}>

        {/* Header buscador */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Punto de Venta</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} color="var(--text2)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                ref={busquedaRef}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && resultados.length === 1) agregar(resultados[0])
                  if (e.key === 'Escape') { setBusqueda(''); setResultados([]) }
                }}
                placeholder="Buscar producto o escanear código..."
                autoFocus
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px 9px 32px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)' }}
              />
            </div>
            <button onClick={iniciarCamara}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'inherit' }}>
              <Camera size={14} /> Cámara
            </button>
            <button onClick={() => { setModalScanner(true) }}
              style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: '#5b4cff', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'inherit' }}>
              <Keyboard size={14} /> Lector
            </button>
          </div>
        </div>

        {/* Resultados de búsqueda */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!busqueda && store.items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text2)' }}>
              <ShoppingCart size={48} color="var(--border)" style={{ marginBottom: 16 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Buscá un producto para empezar</div>
              <div style={{ fontSize: 13 }}>Escribí el nombre, código o escaneá el código de barras</div>
            </div>
          )}

          {!busqueda && store.items.length > 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text2)', fontSize: 13 }}>
              <Search size={24} color="var(--border)" style={{ marginBottom: 10 }} />
              <div>Buscá más productos para agregar al ticket</div>
            </div>
          )}

          {busqueda && resultados.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text2)', fontSize: 13 }}>
              No se encontraron productos para "{busqueda}"
            </div>
          )}

          {resultados.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {resultados.map((p: any) => {
                const sinStock = p.stock_actual === 0
                const esVariable = necesitaModal(p)
                return (
                  <button key={p.id} onClick={() => agregar(p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s', opacity: sinStock ? 0.6 : 1 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#5b4cff')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    {/* Imagen o placeholder */}
                    <div style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                        : <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' style={{opacity: 0.3}}><path d='M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z'/></svg>
                      }
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{p.codigo_barras || p.sku}</div>
                      <div style={{ fontSize: 11, color: sinStock ? '#888898' : p.stock_actual <= 5 ? '#ff4757' : 'var(--text2)', marginTop: 2 }}>
                        {sinStock ? 'Sin stock' :
                          p.unidad_venta === 'kg' ? `${p.stock_actual.toFixed(2)} kg disponibles` :
                          `Stock: ${p.stock_actual}`}
                      </div>
                    </div>
                    {/* Precio */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace' }}>
                        {p.unidad_venta === 'kg' ? `${formatPeso(p.precio_por_kg)}/kg`
                          : p.unidad_venta === 'litro' ? `${formatPeso(p.precio_venta)}/L`
                          : p.unidad_venta === 'metro' ? `${formatPeso(p.precio_venta)}/m`
                          : formatPeso(p.precio_venta)}
                      </div>
                      {esVariable && (
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>Toca para ingresar cantidad</div>
                      )}
                      {sinStock && (
                        <div style={{ fontSize: 10, color: '#888898', marginTop: 2 }}>Sin stock</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* TICKET */}
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', ...card, margin: 16, marginLeft: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShoppingCart size={14} /> Ticket
          </span>
          <button onClick={store.limpiarTicket} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4757', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            <X size={13} /> Limpiar
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {store.items.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 12, padding: '30px 0' }}>
              <ShoppingCart size={28} color="var(--border)" style={{ marginBottom: 8 }} />
              <div>El ticket está vacío</div>
            </div>
          ) : store.items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, fontSize: 11, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>{item.nombre}</div>
              {!item.peso_kg ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => store.cambiarCantidad(item.producto_id, item.cantidad - 1)}
                    style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontSize: 14 }}>−</button>
                  <span style={{ fontSize: 12, fontWeight: 700, minWidth: 20, textAlign: 'center', fontFamily: 'monospace', color: 'var(--text)' }}>{item.cantidad}</span>
                  <button onClick={() => store.cambiarCantidad(item.producto_id, item.cantidad + 1)}
                    style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontSize: 14 }}>+</button>
                </div>
              ) : (
                <button onClick={() => store.quitarItem(item.producto_id)}
                  style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid rgba(255,71,87,0.3)', background: 'var(--bg3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4757' }}>
                  <X size={11} />
                </button>
              )}
              <div style={{ fontSize: 12, fontWeight: 700, color: '#5b4cff', fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>
                {formatPeso(item.subtotal)}
              </div>
            </div>
          ))}
        </div>

        {/* Descuento / Recargo */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg3)' }}>
          {[
            { label: 'Descuento %', presets: PRESETS_DESC, val: store.descuentoPct, set: store.setDescuento, prefix: '-' },
            { label: 'Recargo %', presets: PRESETS_REC, val: store.recargoPct, set: store.setRecargo, prefix: '+' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text2)', width: 76, flexShrink: 0 }}>{row.label}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {row.presets.map(v => (
                  <button key={v} onClick={() => row.set(row.val === v ? 0 : v)}
                    style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, border: '1px solid', borderColor: row.val === v ? '#5b4cff' : 'var(--border)', background: row.val === v ? '#5b4cff' : 'var(--bg2)', color: row.val === v ? 'white' : 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {row.prefix}{v}%
                  </button>
                ))}
              </div>
              <input type="number" value={row.val || ''} onChange={e => row.set(Number(e.target.value))} placeholder="0"
                style={{ marginLeft: 'auto', width: 44, textAlign: 'center', fontSize: 11, fontFamily: 'monospace', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 5px', outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
            </div>
          ))}
        </div>

        {/* Totales */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
            <span>Subtotal</span><span style={{ fontFamily: 'monospace' }}>{formatPeso(store.subtotal())}</span>
          </div>
          {store.descuentoPct > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#00c896', marginBottom: 4 }}>
              <span>Descuento -{store.descuentoPct}%</span><span style={{ fontFamily: 'monospace' }}>-{formatPeso(store.descuentoMonto())}</span>
            </div>
          )}
          {store.recargoPct > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#ff4757', marginBottom: 4 }}>
              <span>Recargo +{store.recargoPct}%</span><span style={{ fontFamily: 'monospace' }}>+{formatPeso(store.recargoMonto())}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 15, color: 'var(--text)' }}>TOTAL</span>
            <span style={{ fontSize: 16, color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(store.total())}</span>
          </div>
        </div>

        {/* Método pago */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {METODOS.map(m => (
              <button key={m.id} onClick={() => store.setMetodoPago(m.id)}
                style={{ padding: '7px', borderRadius: 8, border: '1px solid', borderColor: store.metodoPago === m.id ? '#5b4cff' : 'var(--border)', background: store.metodoPago === m.id ? '#5b4cff' : 'var(--bg2)', color: store.metodoPago === m.id ? 'white' : 'var(--text)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={cobrar}
            style={{ width: '100%', padding: '12px', borderRadius: 10, background: '#00c896', color: 'white', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {cobrado ? '¡Cobrado!' : 'Cobrar en efectivo'}
          </button>
          <button onClick={iniciarPagoMP}
            style={{ width: '100%', padding: '10px', borderRadius: 10, background: '#009ee3', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            📲 Pagar con Mercado Pago
          </button>
        </div>

      </div>

      {/* Modal cantidad variable */}
      {modalCantidad && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: 28, width: 360, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(91,76,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              {modalCantidad.unidad_venta === 'kg' ? <Scale size={24} color="#5b4cff" />
                : modalCantidad.unidad_venta === 'litro' ? <Beaker size={24} color="#5b4cff" />
                : <Ruler size={24} color="#5b4cff" />}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{modalCantidad.nombre}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
              {modalCantidad.unidad_venta === 'kg'
                ? `${formatPeso(modalCantidad.precio_por_kg)}/kg · ${modalCantidad.stock_actual.toFixed(2)} kg disponibles`
                : `${formatPeso(modalCantidad.precio_venta)}/${modalCantidad.unidad_venta} · Stock: ${modalCantidad.stock_actual}`
              }
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                {modalCantidad.unidad_venta === 'kg' ? 'Kilogramos' : modalCantidad.unidad_venta === 'litro' ? 'Litros' : 'Metros'}
              </label>
              <input type="number" value={cantidadIngresada}
                onChange={e => setCantidadIngresada(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarConCantidad()}
                placeholder={modalCantidad.unidad_venta === 'kg' ? 'Ej: 0.500' : 'Ej: 2'}
                step={modalCantidad.unidad_venta === 'kg' ? '0.001' : '1'}
                autoFocus
                style={{ width: '100%', textAlign: 'center', fontSize: 28, fontWeight: 700, fontFamily: 'monospace', border: '2px solid #5b4cff', borderRadius: 12, padding: '12px', outline: 'none', background: 'var(--bg2)', color: 'var(--text)' }} />
            </div>
            {cantidadIngresada && Number(cantidadIngresada) > 0 && (
              <div style={{ background: 'rgba(91,76,255,0.08)', borderRadius: 10, padding: '10px', marginBottom: 16, fontSize: 14, color: 'var(--text)' }}>
                Total: <b style={{ color: '#5b4cff', fontFamily: 'monospace' }}>
                  {modalCantidad.unidad_venta === 'kg'
                    ? formatPeso(modalCantidad.precio_por_kg * Number(cantidadIngresada))
                    : formatPeso(modalCantidad.precio_venta * Number(cantidadIngresada))}
                </b>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalCantidad(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                Cancelar
              </button>
              <button onClick={agregarConCantidad}
                style={{ flex: 2, padding: '11px', borderRadius: 9, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Agregar al ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cámara */}
      {modoCamara && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 24, width: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Camera size={14} /> Escanear con cámara
              </span>
              <button onClick={cerrarCamara} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', position: 'relative', height: 220, marginBottom: 12 }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
              {!camaraActiva && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12 }}>Iniciando cámara...</div>}
              {camaraActiva && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ width: 200, height: 80, border: '2px solid #5b4cff', borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
                </div>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center' }}>Apuntá la cámara al código de barras</p>
          </div>
        </div>
      )}

      {modalPago && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: 28, width: 380, textAlign: 'center' }}>
            {pagoEstado === 'aprobado' ? (
              <>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,200,150,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle size={32} color="#00c896" />
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#00c896', marginBottom: 6 }}>¡Pago aprobado!</div>
                <div style={{ fontSize: 14, color: 'var(--text2)' }}>{formatPeso(store.total())} recibido por Mercado Pago</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Pago con Mercado Pago</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
                  Total: <b style={{ color: '#5b4cff', fontFamily: 'monospace' }}>{formatPeso(store.total())}</b>
                </div>

                {pagoUrl ? (
                  <>
                    <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 16, display: 'inline-block' }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pagoUrl)}`}
                        alt="QR Mercado Pago"
                        style={{ width: 180, height: 180 }}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
                      {verificandoPago ? 'Verificando pago...' : 'Esperando pago...'}
                    </div>
                    <a href={pagoUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', padding: '10px', borderRadius: 9, background: '#009ee3', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                      📲 Abrir link de pago
                    </a>
                  </>
                ) : (
                  <div style={{ padding: '30px 0', color: 'var(--text2)', fontSize: 13 }}>Generando QR...</div>
                )}

                <button onClick={() => { setModalPago(false); setPagoEstado(null); setPagoUrl('') }}
                  style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal lector físico */}
      {modalScanner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 24, width: 360 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Keyboard size={14} /> Lector de código
              </span>
              <button onClick={() => setModalScanner(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>Escaneá con tu lector o ingresá el código manualmente.</p>
            <input value={codigoManual} onChange={e => setCodigoManual(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && codigoManual) agregarPorCodigo(codigoManual) }}
              placeholder="Código de barras..."
              style={{ width: '100%', border: '2px solid #5b4cff', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontFamily: 'monospace', textAlign: 'center', outline: 'none', marginBottom: 10, background: 'var(--bg2)', color: 'var(--text)' }}
              autoFocus />
            <button onClick={() => agregarPorCodigo(codigoManual)}
              style={{ width: '100%', padding: '10px', borderRadius: 8, background: '#5b4cff', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Agregar producto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}