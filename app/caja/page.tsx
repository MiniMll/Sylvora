'use client'
import { useEffect, useState } from 'react'
import { getCajaHoy, agregarEgreso, cerrarCaja, getCierresCaja } from '@/lib/supabase/caja'
import { formatPeso } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingDown, CheckCircle, AlertCircle, Banknote, Smartphone, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export default function CajaPage() {
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

  useEffect(() => {
    getCajaHoy().then(({ ventas, movimientos }) => {
      setVentas(ventas)
      setMovimientos(movimientos)
      setCargando(false)
    })
  }, [])

  useEffect(() => {
    getCierresCaja().then(data => setCierresAnteriores(data))
  }, [])

  if (cargando) return <Spinner texto="Cargando caja..." />

  // Las ventas anuladas no cuentan en totales financieros, pero sí
  // se muestran en la tabla de movimientos para transparencia.
  const ventasActivas = ventas.filter(v => v.estado !== 'anulada')
  const anuladasCount = ventas.length - ventasActivas.length

  const totalVentas = ventasActivas.reduce((s, v) => s + Number(v.total), 0)
  const totalEgresos = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0)
  const saldo = totalVentas - totalEgresos

  // Flujo por hora
  const flujo = Array.from({ length: 12 }, (_, i) => {
    const hora = i + 8
    const ingresosHora = ventasActivas
      .filter(v => new Date(v.created_at).getHours() === hora)
      .reduce((s, v) => s + Number(v.total), 0)
    const egresosHora = movimientos
      .filter(m => m.tipo === 'egreso' && new Date(m.created_at).getHours() === hora)
      .reduce((s, m) => s + Number(m.monto), 0)
    return { hora: `${hora}h`, ingresos: ingresosHora, egresos: egresosHora }
  })

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

  const handleCerrarCaja = async () => {
    setCerrando(true)
    const ok = await cerrarCaja({
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
    })

    if (ok) {
      toast.success('Caja cerrada correctamente', { id: 'cerrar-caja' })
      const cierres = await getCierresCaja()
      setCierresAnteriores(cierres)
      setEfectivoContado('')
    } else {
      toast.error('Error al cerrar la caja', { id: 'cerrar-caja' })
    }
    setCerrando(false)
    setModalCierre(false)
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
    <div style={{ padding: 20, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Caja Diaria</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="danger" size="sm" icon={<TrendingDown size={14} />} onClick={() => setModalEgreso(true)}>
            Registrar egreso
          </Button>
          <Button variant="primary" size="sm" icon={<CheckCircle size={14} />} onClick={() => setModalCierre(true)}>
            Cerrar caja
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
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
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: 18, border: '1px solid var(--border)' }}>
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
      <div className="split-2 reverse">
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
                {ventas.map((v: any) => {
                  const anulada = v.estado === 'anulada'
                  return (
                    <tr key={v.id} className="row-hover" style={{ borderTop: '1px solid var(--border)', opacity: anulada ? 0.6 : 1 }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text2)' }}>
                        {new Date(v.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
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
                })}
                {movimientos.filter(m => m.tipo === 'egreso').map((m: any) => (
                  <tr key={m.id} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text2)' }}>
                      {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ background: 'rgba(255,71,87,0.1)', color: 'var(--r)', padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>Egreso</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{m.descripcion}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)', textTransform: 'capitalize' }}>{m.metodo_pago}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--r)' }}>-{formatPeso(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* Historial cierres */}
      {cierresAnteriores.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Historial de cierres
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
              {cierresAnteriores.map((c: any) => {
                // Backward-compat: cierres antiguos no tienen diferencia_efectivo.
                const dif = c.diferencia_efectivo
                const tieneDiferencia = dif !== null && dif !== undefined
                return (
                  <tr key={c.id} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--text)' }}>
                      {new Date(c.fecha).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--g)', fontWeight: 600 }}>
                      ${Number(c.total_ventas).toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--r)', fontWeight: 600 }}>
                      ${Number(c.total_egresos).toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--ac)', fontWeight: 700 }}>
                      ${Number(c.saldo_neto).toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{c.cantidad_ventas} ventas</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
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
            <input value={egreso.descripcion} onChange={e => setEgreso(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Ej: Compra de mercadería"
              style={{ width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Monto *</label>
            <input value={egreso.monto} onChange={e => setEgreso(p => ({ ...p, monto: e.target.value }))}
              type="number" placeholder="$ 0.00"
              style={{ width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'DM Mono, monospace' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 4 }}>Método de pago</label>
            <select value={egreso.metodo} onChange={e => setEgreso(p => ({ ...p, metodo: e.target.value }))}
              style={{ width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
            </select>
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

      </Modal>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
