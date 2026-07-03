'use client'
import { useEffect, useState } from 'react'
import { getCajaHoy, agregarEgreso, cerrarCaja, getCierresCaja, reabrirCaja, getResponsableNombre } from '@/lib/supabase/caja'
import { crearBucketsDiaOperativo, type DiaOperativo } from '@/lib/operacion/diaOperativo'
import { formatPeso } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingDown, CheckCircle, AlertCircle, Banknote, Smartphone, CreditCard, RotateCcw, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { Lightbulb } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Hint } from '@/components/ui/Hint'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { usePermissions } from '@/components/PermissionsProvider'

export default function CajaPage() {
  const { has } = usePermissions()
  const [ventas, setVentas] = useState<any[]>([])
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalEgreso, setModalEgreso] = useState(false)
  const [egreso, setEgreso] = useState({ descripcion: '', monto: '', metodo: 'efectivo' })
  const [guardando, setGuardando] = useState(false)
  const [modalCierre, setModalCierre] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [cierresAnteriores, setCierresAnteriores] = useState<any[]>([])
  // Conteo físico de efectivo al cerrar. String para permitir el
  // input vacío (= "no conté"). Se parsea a number al confirmar.
  const [efectivoContado, setEfectivoContado] = useState('')
  // Retiro de efectivo opcional al cerrar (decisión D del spec —
  // informativo, no se arrastra al día siguiente).
  const [retiroEfectivo, setRetiroEfectivo] = useState('')
  // Reabrir caja flow.
  const [modalReabrir, setModalReabrir] = useState(false)
  const [reabriendo, setReabriendo] = useState(false)
  // Nombre del responsable del cierre actual (si hay). Se resuelve en
  // un effect aparte porque no viene en el JOIN del SELECT.
  const [responsable, setResponsable] = useState<string | null>(null)
  // Día operativo resuelto por getCajaHoy a partir de comercios.settings.
  // ÚNICA fuente de "qué día es" en esta page — no usar new Date()
  // para derivar fechas de caja.
  const [dia, setDia] = useState<DiaOperativo | null>(null)

  useEffect(() => {
    getCajaHoy().then(({ ventas, movimientos, dia }) => {
      setVentas(ventas)
      setMovimientos(movimientos)
      setDia(dia)
      setCargando(false)
    })
  }, [])

  useEffect(() => {
    getCierresCaja().then(data => setCierresAnteriores(data))
  }, [])

  // Resolver el nombre del responsable del cierre del día operativo.
  // V1 single-user: en la práctica es el mismo usuario actual, pero
  // esto queda listo para multi-user/roles sin más cambios en la page.
  // Derivamos cierreHoy inline acá (no usamos el const de más abajo)
  // porque las declaraciones derivadas viven después del early return.
  useEffect(() => {
    if (!dia) { setResponsable(null); return }
    const usuarioId = cierresAnteriores.find(c => c.fecha === dia.fechaOperativa)?.usuario_id
    if (!usuarioId) { setResponsable(null); return }
    getResponsableNombre(usuarioId).then(setResponsable)
  }, [cierresAnteriores, dia])

  if (cargando) return <Spinner texto="Cargando caja..." />

  // Las ventas anuladas no cuentan en totales financieros, pero sí
  // se muestran en la tabla de movimientos para transparencia.
  const ventasActivas = ventas.filter(v => v.estado !== 'anulada')
  const anuladasCount = ventas.length - ventasActivas.length

  const totalVentas = ventasActivas.reduce((s, v) => s + Number(v.total), 0)
  const totalEgresos = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0)
  const saldo = totalVentas - totalEgresos

  // Flujo por hora — buckets derivados del día operativo (antes eran
  // horas 8-19 hardcodeadas, inútiles para un comercio nocturno). Cada
  // bucket es 1 hora del rango [inicio, fin) del día operativo; los
  // timestamps se comparan como instantes UTC, sin getHours() local.
  const flujo = dia
    ? crearBucketsDiaOperativo(dia).map(b => {
        const enBucket = (ts: string) => {
          const t = new Date(ts).getTime()
          return t >= b.inicio.getTime() && t < b.fin.getTime()
        }
        const ingresosHora = ventasActivas
          .filter(v => enBucket(v.created_at))
          .reduce((s, v) => s + Number(v.total), 0)
        const egresosHora = movimientos
          .filter(m => m.tipo === 'egreso' && enBucket(m.created_at))
          .reduce((s, m) => s + Number(m.monto), 0)
        return { hora: b.label, ingresos: ingresosHora, egresos: egresosHora }
      })
    : []

  // Por método de pago
  const porMetodo: Record<string, number> = {}
  ventasActivas.forEach(v => { porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] || 0) + Number(v.total) })

  // Efectivo esperado en caja = ventas efectivo - egresos efectivo.
  // Asume caja inicial 0 (Sylvora no maneja saldo de apertura todavía).
  const porMetodoFn = (metodo: string) =>
    ventasActivas.filter(v => v.metodo_pago === metodo).reduce((s, v) => s + Number(v.total), 0)
  const efectivoVentas = porMetodoFn('efectivo')
  const egresosEfectivo = movimientos
    .filter(m => m.tipo === 'egreso' && m.metodo_pago === 'efectivo')
    .reduce((s, m) => s + Number(m.monto), 0)
  const efectivoEsperado = efectivoVentas - egresosEfectivo

  const contadoNum = efectivoContado.trim() === '' ? null : Number(efectivoContado)
  const diferencia = contadoNum === null || Number.isNaN(contadoNum)
    ? null
    : contadoNum - efectivoEsperado

  // Estado de caja derivado (spec): el cierre del DÍA OPERATIVO actual
  // ES el estado. Si existe un cierre con esa fecha operativa → caja
  // cerrada. Si no → abierta. No hay columna de estado en DB ni acto
  // explícito de "abrir caja". La fecha sale del helper, nunca de
  // new Date(): para un nocturno 18-02 a la 01:30, el "hoy" operativo
  // sigue siendo ayer calendario.
  const fechaOperativaStr = dia?.fechaOperativa ?? ''
  const cierreHoy = cierresAnteriores.find(c => c.fecha === fechaOperativaStr) ?? null
  const estadoCaja: 'abierta' | 'cerrada' = cierreHoy ? 'cerrada' : 'abierta'
  // El historial muestra SOLO cierres anteriores. El del día operativo
  // actual va arriba en el bloque de estado.
  const cierresPasados = cierresAnteriores.filter(c => c.fecha !== fechaOperativaStr)
  // ¿El comercio configuró horario propio? (para el label del header:
  // "Día operativo" solo cuando difiere del día calendario).
  const usaDiaOperativo = dia !== null && !dia.config.caja_24hs

  // Preview del retiro mientras el cajero llena el modal de cierre.
  const retiroNum = retiroEfectivo.trim() === '' ? null : Number(retiroEfectivo)
  const quedaEnCajaPreview = contadoNum !== null && retiroNum !== null && !Number.isNaN(retiroNum)
    ? contadoNum - retiroNum
    : null
  const retiroBajoCero = retiroNum !== null && !Number.isNaN(retiroNum) && contadoNum !== null && retiroNum > contadoNum

  // Movimientos del día = ventas + egresos mezclados en orden cronológico
  // descendente (lo más reciente arriba). Antes la tabla mostraba primero
  // todas las ventas y después todos los egresos, lo cual era confuso
  // porque un egreso reciente quedaba abajo de ventas viejas.
  type MovRow =
    | { kind: 'venta'; id: string; created_at: string; data: any }
    | { kind: 'egreso'; id: string; created_at: string; data: any }
  const movimientosDia: MovRow[] = [
    ...ventas.map((v: any) => ({ kind: 'venta' as const, id: v.id, created_at: v.created_at, data: v })),
    ...movimientos
      .filter(m => m.tipo === 'egreso')
      .map((m: any) => ({ kind: 'egreso' as const, id: m.id, created_at: m.created_at, data: m })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const handleCerrarCaja = async () => {
    setCerrando(true)
    const result = await cerrarCaja({
      total_ventas: totalVentas,
      total_egresos: totalEgresos,
      saldo_neto: saldo,
      cantidad_ventas: ventasActivas.length,
      efectivo: efectivoVentas,
      debito: porMetodoFn('debito'),
      credito: porMetodoFn('credito'),
      mercadopago: porMetodoFn('mercadopago'),
      efectivo_contado: contadoNum,
      diferencia_efectivo: diferencia,
      retiro_efectivo: retiroNum !== null && !Number.isNaN(retiroNum) ? retiroNum : null,
    })

    if (result === 'ok') {
      toast.success('Caja cerrada correctamente', { id: 'cerrar-caja' })
      const cierres = await getCierresCaja()
      setCierresAnteriores(cierres)
      setEfectivoContado('')
      setRetiroEfectivo('')
      // Ya no hay highlight de fila nueva en el historial: el cierre de
      // hoy se muestra en el bloque de estado arriba, no en la lista.
    } else if (result === 'duplicate') {
      toast.error('La caja de hoy ya fue cerrada', { id: 'cerrar-caja' })
      // Reload para que la UI refleje el cierre existente.
      const cierres = await getCierresCaja()
      setCierresAnteriores(cierres)
    } else {
      toast.error('No pudimos cerrar la caja. Probá de nuevo.', { id: 'cerrar-caja' })
    }
    setCerrando(false)
    setModalCierre(false)
  }

  const handleReabrirCaja = async () => {
    if (!cierreHoy) return
    setReabriendo(true)
    const ok = await reabrirCaja(cierreHoy.id)
    if (ok) {
      toast.success('Caja reabierta', { id: 'reabrir-caja' })
      setCierresAnteriores(await getCierresCaja())
      setEfectivoContado('')
      setRetiroEfectivo('')
    } else {
      toast.error('No pudimos reabrir la caja. Probá de nuevo.', { id: 'reabrir-caja' })
    }
    setReabriendo(false)
    setModalReabrir(false)
  }

  const guardarEgreso = async () => {
    if (!egreso.descripcion || !egreso.monto) { alert('Completá descripción y monto'); return }
    setGuardando(true)
    const ok = await agregarEgreso(egreso.descripcion, Number(egreso.monto), egreso.metodo)
    if (ok) {
      const nuevoMov = { id: Date.now().toString(), tipo: 'egreso', descripcion: egreso.descripcion, monto: Number(egreso.monto), metodo_pago: egreso.metodo, created_at: new Date().toISOString() }
      setMovimientos(prev => [nuevoMov, ...prev])
      setEgreso({ descripcion: '', monto: '', metodo: 'efectivo' })
      setModalEgreso(false)
    }
    setGuardando(false)
  }

  return (
    // overflowY:auto + flex column: los hijos llevan flexShrink:0 para que
    // el contenedor scrollee en vez de aplastarlos. Sin esto, el flex shrink
    // colapsa secciones (sobre todo las que tienen overflow:hidden, que
    // pierden su min-height de contenido) cuando la página se hace larga.
    <div style={{ padding: 20, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      <Hint id="caja-primer-cierre" icon={<Lightbulb size={15} />} style={{ flexShrink: 0 }}>
        Acá ves el resumen del día. Cuando cierres la caja vas a contar el
        efectivo real y Sylvora te muestra si cuadra o hay diferencia.
      </Hint>

      {/* Bloque de estado: el cierre de hoy ES estado, no historial.
          Reemplaza el header genérico + dos botones sueltos. Cambia
          completamente según estadoCaja. */}
      <div style={{ flexShrink: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            {estadoCaja === 'abierta' ? (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--g)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Caja abierta</span>
              </>
            ) : (
              <>
                <CheckCircle size={15} color="var(--ac)" strokeWidth={2.2} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Caja cerrada</span>
              </>
            )}
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {/* Fecha del DÍA OPERATIVO (no calendario). Para un nocturno
                  a la 01:30 muestra la fecha de ayer — es la caja que sigue
                  abierta. El "T12:00:00" evita el shift de un día al parsear
                  YYYY-MM-DD como UTC-midnight en husos negativos. */}
              · {usaDiaOperativo && 'Día operativo · '}
              {dia
                ? new Date(`${dia.fechaOperativa}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
                : ''}
            </span>
          </div>

          {estadoCaja === 'abierta' ? (
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Saldo esperado en efectivo:{' '}
              <b style={{ color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>{formatPeso(efectivoEsperado)}</b>
            </div>
          ) : cierreHoy && (
            <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div>
                Cerrada a las{' '}
                <b style={{ color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
                  {new Date(cierreHoy.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </b>
                {responsable && <> · por <b style={{ color: 'var(--text)' }}>{responsable}</b></>}
              </div>
              <div>
                Saldo neto:{' '}
                <b style={{ color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>{formatPeso(Number(cierreHoy.saldo_neto))}</b>
                {cierreHoy.diferencia_efectivo !== null && cierreHoy.diferencia_efectivo !== undefined && (
                  Number(cierreHoy.diferencia_efectivo) === 0 ? (
                    <> · Diferencia: <span style={{ color: 'var(--g)', fontWeight: 600 }}>OK</span></>
                  ) : (
                    <> · Diferencia:{' '}
                      <span style={{ color: Number(cierreHoy.diferencia_efectivo) > 0 ? 'var(--w)' : 'var(--r)', fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>
                        {Number(cierreHoy.diferencia_efectivo) >= 0 ? '+' : '−'}{formatPeso(Math.abs(Number(cierreHoy.diferencia_efectivo)))}
                      </span>
                    </>
                  )
                )}
              </div>
              {cierreHoy.retiro_efectivo !== null && cierreHoy.retiro_efectivo !== undefined && Number(cierreHoy.retiro_efectivo) > 0 && (
                <div>
                  Retiro:{' '}
                  <b style={{ color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>{formatPeso(Number(cierreHoy.retiro_efectivo))}</b>
                  {cierreHoy.efectivo_contado !== null && cierreHoy.efectivo_contado !== undefined && (
                    <> · Queda en caja:{' '}
                      <b style={{ color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
                        {formatPeso(Number(cierreHoy.efectivo_contado) - Number(cierreHoy.retiro_efectivo))}
                      </b>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {estadoCaja === 'abierta' ? (
            <>
              <Button variant="danger" size="sm" icon={<TrendingDown size={14} />} onClick={() => setModalEgreso(true)}>
                Registrar egreso
              </Button>
              <Button variant="primary" size="sm" icon={<CheckCircle size={14} />} onClick={() => setModalCierre(true)}>
                Cerrar caja
              </Button>
            </>
          ) : has('caja.reabrir') ? (
            <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => setModalReabrir(true)}>
              Reabrir caja
            </Button>
          ) : null}
        </div>
      </div>

      {ventas.length === 0 && movimientos.length === 0 ? (
        <div style={{ flexShrink: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <EmptyState
            accent
            icon={<ShoppingCart size={20} color="var(--ac)" strokeWidth={2} />}
            title="Todavía no registraste movimientos hoy."
            description="Cobrá tu primera venta desde el POS y acá vas a ver el resumen del día: ventas, egresos y saldo neto."
            actions={[{ label: 'Ir al POS', href: '/pos', variant: 'primary', icon: <ShoppingCart size={15} /> }]}
            guiaHref="/guia"
          />
        </div>
      ) : (
      <>
      {/* KPIs */}
      <div className="kpi-grid" style={{ flexShrink: 0 }}>
        {[
          { label: 'Total ventas', value: formatPeso(totalVentas), sub: `${ventasActivas.length} operaciones${anuladasCount > 0 ? ` · ${anuladasCount} anuladas no incluidas` : ''}`, color: 'var(--ac)' },
          { label: 'Egresos', value: formatPeso(totalEgresos), sub: `${movimientos.filter(m => m.tipo === 'egreso').length} movimientos`, color: 'var(--o)' },
          { label: 'Saldo neto', value: formatPeso(saldo), sub: 'Ventas - Egresos', color: 'var(--g)' },
          { label: 'Ticket promedio', value: ventasActivas.length ? formatPeso(totalVentas / ventasActivas.length) : '$0', sub: 'Por transacción', color: '#ffd23f' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card)', borderRadius: 16, padding: '14px 16px', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace', marginBottom: 3 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Gráfico flujo */}
      <div style={{ flexShrink: 0, background: 'var(--card)', borderRadius: 16, padding: 18, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Flujo de caja del día</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>Ingresos y egresos por hora</div>
        {ventasActivas.length === 0 && totalEgresos === 0 ? (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 12 }}>
            No hay movimientos hoy todavía
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={flujo}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="hora" tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6b6b72' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '0' : '$' + Math.round(v / 1000) + 'k'} />
              <Tooltip formatter={(v: any) => formatPeso(v)} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: 'DM Sans, sans-serif' }} />
              <Line dataKey="ingresos" name="Ingresos" stroke="#5b4cff" strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="egresos" name="Egresos" stroke="#ff4757" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Por método + movimientos */}
      <div className="split-2 reverse" style={{ flexShrink: 0 }}>
        <div style={{ background: 'var(--card)', borderRadius: 16, padding: 18, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Por método de pago</div>
          {Object.entries(porMetodo).length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 12 }}>Sin ventas hoy</div>
          ) : Object.entries(porMetodo).map(([metodo, total]) => (
            <div key={metodo} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{metodo}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{formatPeso(total as number)}</span>
              </div>
              <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(((total as number) / totalVentas) * 100)}%`, background: 'var(--ac)', borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
                {Math.round(((total as number) / totalVentas) * 100)}%
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
            Movimientos del día
          </div>
          {ventas.length === 0 && movimientos.length === 0 ? (
            <div className="empty-state empty-state-sm">
              <div className="empty-icon"><Banknote size={18} color="var(--text2)" strokeWidth={1.8} /></div>
              <div className="empty-sub">No hay movimientos hoy</div>
            </div>
          ) : (
            <div className="table-scroll">
            <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Hora', 'Tipo', 'Descripción', 'Método', 'Monto'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimientosDia.map(row => {
                  const hora = new Date(row.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                  if (row.kind === 'venta') {
                    const v = row.data
                    const anulada = v.estado === 'anulada'
                    return (
                      <tr key={`v-${v.id}`} className="row-hover" style={{ borderTop: '1px solid var(--border)', opacity: anulada ? 0.6 : 1 }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text2)' }}>{hora}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {anulada
                            ? <span style={{ background: 'var(--bg3)', color: 'var(--text2)', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>Anulada</span>
                            : <span style={{ background: 'rgba(0,200,150,0.1)', color: 'var(--g)', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>Venta</span>}
                        </td>
                        <td style={{ padding: '8px 12px', textDecoration: anulada ? 'line-through' : 'none', color: anulada ? 'var(--text2)' : 'var(--text)' }}>Ticket #{String(v.numero_ticket).padStart(4, '0')}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text2)', textTransform: 'capitalize' }}>{v.metodo_pago}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontWeight: 600, color: anulada ? 'var(--text2)' : 'var(--g)', textDecoration: anulada ? 'line-through' : 'none' }}>{anulada ? formatPeso(v.total) : `+${formatPeso(v.total)}`}</td>
                      </tr>
                    )
                  }
                  const m = row.data
                  return (
                    <tr key={`e-${m.id}`} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text2)' }}>{hora}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: 'rgba(255,71,87,0.1)', color: 'var(--r)', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>Egreso</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>{m.descripcion}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)', textTransform: 'capitalize' }}>{m.metodo_pago}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--r)' }}>-{formatPeso(m.monto)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      </>
      )}

      {/* Historial de cierres anteriores. El de hoy NO aparece acá — está
          en el bloque de estado arriba. La lista muestra solo fechas pasadas. */}
      {cierresPasados.length > 0 && (
        <div style={{
          flexShrink: 0,
          background: 'var(--card)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={14} color="var(--text2)" strokeWidth={2} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Cierres anteriores</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{cierresPasados.length} {cierresPasados.length === 1 ? 'cierre' : 'cierres'}</span>
          </div>
          <div className="table-scroll">
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Fecha', 'Ventas', 'Egresos', 'Saldo neto', 'Transacciones', 'Diferencia'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cierresPasados.map((c: any) => {
                // Backward-compat: cierres antiguos no tienen diferencia_efectivo.
                const dif = c.diferencia_efectivo
                const tieneDiferencia = dif !== null && dif !== undefined
                return (
                  <tr key={c.id} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', color: 'var(--text)' }}>
                      {/* T12:00:00: sin esto, new Date('YYYY-MM-DD') parsea
                          UTC-midnight y en AR (-3) muestra el día anterior. */}
                      {new Date(`${c.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', color: 'var(--g)', fontWeight: 600 }}>
                      ${Number(c.total_ventas).toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', color: 'var(--r)', fontWeight: 600 }}>
                      ${Number(c.total_egresos).toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', color: 'var(--ac)', fontWeight: 700 }}>
                      ${Number(c.saldo_neto).toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text2)' }}>{c.cantidad_ventas} ventas</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
                      {!tieneDiferencia ? (
                        <span style={{ color: 'var(--text2)' }}>—</span>
                      ) : Number(dif) === 0 ? (
                        <span style={{ color: 'var(--g)' }}>OK</span>
                      ) : (
                        <span style={{ color: Number(dif) > 0 ? 'var(--w)' : 'var(--r)' }}>
                          {Number(dif) >= 0 ? '+' : '−'}{formatPeso(Math.abs(Number(dif)))}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Modal egreso */}
      <Modal
        open={modalEgreso}
        onClose={() => setModalEgreso(false)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalEgreso(false)} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={guardarEgreso} loading={guardando} style={{ flex: 1 }}>
              {guardando ? 'Guardando...' : 'Registrar'}
            </Button>
          </>
        }>
        <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingDown size={16} color="#ff4757" /> Registrar egreso
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Descripción *</label>
            <Input size="md" value={egreso.descripcion} onChange={e => setEgreso(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Ej: Compra de mercadería" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Monto *</label>
            <Input size="md" value={egreso.monto} onChange={e => setEgreso(p => ({ ...p, monto: e.target.value }))}
              type="number" placeholder="$ 0.00"
              style={{ fontFamily: 'DM Mono, monospace' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Método de pago</label>
            <Select size="md" value={egreso.metodo} onChange={e => setEgreso(p => ({ ...p, metodo: e.target.value }))}>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
            </Select>
          </div>
        </div>
      </Modal>

      {/* Modal cierre de caja */}
      <Modal
        open={modalCierre}
        onClose={() => { if (!cerrando) setModalCierre(false) }}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalCierre(false)} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleCerrarCaja} loading={cerrando} icon={!cerrando ? <CheckCircle size={14} /> : undefined} style={{ flex: 2 }}>
              {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
            </Button>
          </>
        }>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <CheckCircle size={18} color="#5b4cff" /> Cerrar caja del día
        </div>

        <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Resumen del día</div>
              {[
                { label: 'Total ventas', value: totalVentas, color: 'var(--g)' },
                { label: 'Total egresos', value: totalEgresos, color: 'var(--r)' },
                { label: 'Saldo neto', value: saldo, color: 'var(--ac)' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text2)' }}>{row.label}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: row.color }}>
                    ${Number(row.value).toLocaleString('es-AR')}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text2)' }}>Transacciones</span>
                <span style={{ color: 'var(--text)' }}>{ventasActivas.length} ventas{anuladasCount > 0 ? ` · ${anuladasCount} anuladas` : ''}</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Por método de pago</div>
              {['efectivo', 'debito', 'credito', 'mercadopago'].map(metodo => {
                const total = porMetodoFn(metodo)
                if (total === 0) return null
                return (
                  <div key={metodo} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span style={{ color: 'var(--text2)', textTransform: 'capitalize' }}>{metodo}</span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
                      ${total.toLocaleString('es-AR')}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Conteo físico del efectivo. Opcional: si el cajero
                no llena el campo, se guarda el cierre sin contado y
                la diferencia queda null en histórico ("—"). */}
            <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Conteo de efectivo
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12 }}>
                <span style={{ color: 'var(--text2)' }}>Efectivo esperado en caja</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>
                  {formatPeso(efectivoEsperado)}
                </span>
              </div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>
                Efectivo contado en caja
              </label>
              <input
                type="number"
                inputMode="decimal"
                placeholder="$ Dejar vacío para no contar"
                value={efectivoContado}
                onChange={e => setEfectivoContado(e.target.value)}
                style={{
                  width: '100%',
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: 'DM Mono, monospace',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  padding: '10px 14px',
                  background: 'var(--bg2)',
                  color: 'var(--text)',
                  outline: 'none',
                  textAlign: 'right',
                }}
              />
              {diferencia !== null && (
                <div style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  fontWeight: 600,
                  background:
                    diferencia === 0 ? 'rgba(0,200,150,0.10)' :
                    diferencia > 0  ? 'rgba(255,184,0,0.10)' :
                                       'rgba(255,71,87,0.10)',
                  color:
                    diferencia === 0 ? 'var(--g)' :
                    diferencia > 0  ? 'var(--w)' :
                                       'var(--r)',
                }}>
                  <span>
                    {diferencia === 0 && 'Caja cuadra'}
                    {diferencia > 0  && 'Sobrante'}
                    {diferencia < 0  && 'Faltante'}
                  </span>
                  <span style={{ fontFamily: 'DM Mono, monospace' }}>
                    {diferencia >= 0 ? '+' : '−'}{formatPeso(Math.abs(diferencia))}
                  </span>
                </div>
              )}
            </div>

            {/* Retiro de efectivo opcional. Solo informativo: queda
                registrado en el cierre y se muestra "queda en caja",
                pero no se arrastra como fondo del día siguiente. */}
            <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 16, marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Retiro de efectivo <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span>
              </div>
              <input
                type="number"
                inputMode="decimal"
                placeholder="$ Dejar vacío si no retirás"
                value={retiroEfectivo}
                onChange={e => setRetiroEfectivo(e.target.value)}
                style={{
                  width: '100%',
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: 'DM Mono, monospace',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  padding: '9px 12px',
                  background: 'var(--bg2)',
                  color: 'var(--text)',
                  outline: 'none',
                  textAlign: 'right',
                }}
              />
              {quedaEnCajaPreview !== null && (
                <div style={{ marginTop: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: retiroBajoCero ? 'var(--w)' : 'var(--text2)' }}>
                  <span>{retiroBajoCero ? 'El retiro supera al efectivo contado' : 'Queda en caja'}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: retiroBajoCero ? 'var(--w)' : 'var(--text)' }}>
                    {formatPeso(quedaEnCajaPreview)}
                  </span>
                </div>
              )}
            </div>

      </Modal>

      {/* Modal confirmar reabrir caja */}
      <Modal
        open={modalReabrir}
        onClose={() => { if (!reabriendo) setModalReabrir(false) }}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalReabrir(false)} disabled={reabriendo} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleReabrirCaja} loading={reabriendo} style={{ flex: 1 }}>
              {reabriendo ? 'Reabriendo...' : 'Sí, reabrir'}
            </Button>
          </>
        }>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
          ¿Reabrir la caja de hoy?
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          El cierre de hoy se va a eliminar y vas a poder volver a registrar
          movimientos y cerrar caja de nuevo. Esta acción no se puede deshacer.
        </div>
      </Modal>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
