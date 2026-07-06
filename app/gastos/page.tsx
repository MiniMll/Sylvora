'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarDays,
  Edit3,
  Plus,
  ReceiptText,
  Search,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePermissions } from '@/components/PermissionsProvider'
import { formatPeso } from '@/lib/utils'
import {
  actualizarGasto,
  CATEGORIAS_GASTO,
  crearGasto,
  eliminarGasto,
  listarGastos,
  type GastoInput,
} from '@/lib/supabase/gastos'
import { fechaLocalArgentina, mesLocalArgentina } from '@/lib/operacion/diaOperativo'
import type { CategoriaGasto, Gasto } from '@/types/database'

const PAGE_SIZE = 20

type CategoriaFiltro = CategoriaGasto | 'todas'

interface FormState {
  descripcion: string
  monto: string
  categoria: CategoriaGasto
  fecha: string
  observaciones: string
}

// Fechas "actuales" del módulo Gastos en huso Argentina (no UTC).
// Antes usaban toISOString().slice(0,10), que devuelve fecha UTC: desde
// las 21:00 AR el default del form saltaba al día siguiente y el gasto
// caía en el día/mes equivocado (hallazgo G1/P1 de la auditoría QA).
// Se reusa el helper que resuelve la fecha CALENDARIO en TZ Argentina.
//
// DECISIÓN DE ARQUITECTURA (no borrar): los gastos usan fecha
// calendario local, NO el día operativo configurable. Para comercios
// 24hs es idéntico a lo que ven Caja y Dashboard. Para comercios
// nocturnos (día operativo 18-02, etc.), un gasto a la 01:30 se imputa
// al día calendario (hoy), no al día operativo (ayer). Alinear gastos
// con fechaOperativaDeTimestamp(settings) es el hallazgo G2/P2, aparte
// — ver docs/backlog.md §Gastos. Se dejó fuera de G1 para no mezclar
// correcciones.
function todayInputValue(): string {
  return fechaLocalArgentina()
}

function monthStartInputValue(): string {
  return mesLocalArgentina()
}

function emptyForm(): FormState {
  return {
    descripcion: '',
    monto: '',
    categoria: 'otros',
    fecha: todayInputValue(),
    observaciones: '',
  }
}

function gastoToForm(gasto: Gasto): FormState {
  return {
    descripcion: gasto.descripcion,
    monto: String(gasto.monto),
    categoria: gasto.categoria,
    fecha: gasto.fecha,
    observaciones: gasto.observaciones ?? '',
  }
}

function formToInput(form: FormState): GastoInput {
  return {
    descripcion: form.descripcion,
    monto: Number(form.monto),
    categoria: form.categoria,
    fecha: form.fecha,
    observaciones: form.observaciones,
  }
}

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function labelCategoria(cat: CategoriaGasto): string {
  return CATEGORIAS_GASTO.find(c => c.id === cat)?.label ?? cat
}

function GastosSkeleton() {
  return (
    <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
      <Skeleton width={180} height={26} radius={6} />
      <Skeleton width={260} height={13} radius={4} style={{ marginTop: 8, marginBottom: 18 }} />
      <Skeleton width="100%" height={58} radius={10} style={{ marginBottom: 14 }} />
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <Skeleton key={i} width="100%" height={38} radius={6} style={{ marginTop: i === 0 ? 0 : 10 }} />
        ))}
      </div>
    </div>
  )
}

function NoAccess() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,184,0,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <AlertTriangle size={22} color="var(--w)" strokeWidth={1.8} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 6, color: 'var(--text)' }}>Sin acceso a gastos</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
          Esta sección está disponible para administradores y encargados.
        </p>
      </div>
    </div>
  )
}

export default function GastosPage() {
  const { has, loading: permsLoading } = usePermissions()
  const puedeVer = has('gasto.ver')
  const puedeCrear = has('gasto.crear')
  const puedeEditar = has('gasto.editar')
  const puedeEliminar = has('gasto.eliminar')

  const [gastos, setGastos] = useState<Gasto[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [page, setPage] = useState(1)
  const [desde, setDesde] = useState(monthStartInputValue())
  const [hasta, setHasta] = useState(todayInputValue())
  const [categoria, setCategoria] = useState<CategoriaFiltro>('todas')

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState<Gasto | null>(null)

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const totalVisible = useMemo(() => gastos.reduce((sum, g) => sum + Number(g.monto), 0), [gastos])

  const cargar = useCallback(async () => {
    if (!puedeVer) return
    setCargando(true)
    const res = await listarGastos({
      desde: desde || undefined,
      hasta: hasta || undefined,
      categoria,
      page,
      pageSize: PAGE_SIZE,
    })
    setGastos(res.gastos)
    setTotal(res.total)
    setCargando(false)
  }, [puedeVer, desde, hasta, categoria, page])

  useEffect(() => {
    if (permsLoading || !puedeVer) return
    // Fetch inicial y refetch por filtros. Patrón estándar de páginas
    // cliente existentes; cargar() actualiza loading + rows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar()
  }, [permsLoading, puedeVer, cargar])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const abrirEditar = (gasto: Gasto) => {
    setEditando(gasto)
    setForm(gastoToForm(gasto))
    setModalOpen(true)
  }

  const guardar = async () => {
    setGuardando(true)
    const input = formToInput(form)
    const result = editando
      ? await actualizarGasto(editando.id, input)
      : await crearGasto(input)

    if (!result.ok) {
      toast.error(result.error)
      setGuardando(false)
      return
    }

    toast.success(editando ? 'Gasto actualizado' : 'Gasto registrado')
    setModalOpen(false)
    setGuardando(false)
    await cargar()
  }

  const confirmarDelete = async () => {
    if (!confirmarEliminar) return
    setEliminandoId(confirmarEliminar.id)
    const result = await eliminarGasto(confirmarEliminar.id)
    if (result.ok) {
      toast.success('Gasto eliminado')
      setConfirmarEliminar(null)
      await cargar()
    } else {
      toast.error(result.error)
    }
    setEliminandoId(null)
  }

  if (permsLoading) return <GastosSkeleton />
  if (!puedeVer) return <NoAccess />

  return (
    <div className="page-in" style={{ padding: 24, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ReceiptText size={22} /> Gastos
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>
            {total} registros · {formatPeso(totalVisible)} en esta página
          </p>
        </div>
        {puedeCrear && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={abrirNuevo}>
            Nuevo gasto
          </Button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
        gap: 10,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 12,
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Desde
          <Input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Hasta
          <Input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Categoría
          <Select value={categoria} onChange={e => { setCategoria(e.target.value as CategoriaFiltro); setPage(1) }}>
            <option value="todas">Todas</option>
            {CATEGORIAS_GASTO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </label>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={cargar} icon={<Search size={14} />} fullWidth>
            Filtrar
          </Button>
        </div>
      </div>

      <section style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {cargando ? (
          <div style={{ padding: 14 }}>
            {[0, 1, 2, 3, 4].map(i => (
              <Skeleton key={i} width="100%" height={36} radius={6} style={{ marginTop: i === 0 ? 0 : 10 }} />
            ))}
          </div>
        ) : gastos.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={20} />}
            title="No hay gastos para este filtro"
            description="Registrá alquiler, servicios, proveedores u otros costos operativos para ver la ganancia real."
            actions={puedeCrear ? [{ label: 'Nuevo gasto', onClick: abrirNuevo, variant: 'primary', icon: <Plus size={14} /> }] : undefined}
            accent
          />
        ) : (
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Fecha', 'Descripción', 'Categoría', 'Monto', 'Observaciones', ''].map(h => (
                    <th key={h} style={{ padding: '9px 13px', textAlign: 'left', color: 'var(--text2)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gastos.map(g => (
                  <tr key={g.id} className="row-hover" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 13px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CalendarDays size={13} /> {formatFecha(g.fecha)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 13px', color: 'var(--text)', fontWeight: 600 }}>{g.descripcion}</td>
                    <td style={{ padding: '10px 13px', color: 'var(--text)' }}>{labelCategoria(g.categoria)}</td>
                    <td style={{ padding: '10px 13px', color: 'var(--r)', fontWeight: 700, fontFamily: 'DM Mono, ui-monospace, monospace' }}>{formatPeso(g.monto)}</td>
                    <td style={{ padding: '10px 13px', color: 'var(--text2)', maxWidth: 260, overflowWrap: 'anywhere' }}>{g.observaciones || '-'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {puedeEditar && (
                        <button type="button" onClick={() => abrirEditar(g)} aria-label="Editar gasto" title="Editar" style={iconButtonStyle}>
                          <Edit3 size={14} />
                        </button>
                      )}
                      {puedeEliminar && (
                        <button type="button" onClick={() => setConfirmarEliminar(g)} aria-label="Eliminar gasto" title="Eliminar" style={{ ...iconButtonStyle, color: 'var(--r)' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Página {page} de {totalPaginas}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            Anterior
          </Button>
          <Button variant="ghost" size="sm" disabled={page >= totalPaginas} onClick={() => setPage(p => Math.min(totalPaginas, p + 1))}>
            Siguiente
          </Button>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { if (!guardando) setModalOpen(false) }}
        title={editando ? 'Editar gasto' : 'Nuevo gasto'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={guardando}>Cancelar</Button>
            <Button variant="primary" onClick={guardar} loading={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Descripción" full>
            <Input size="md" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Factura de luz" />
          </Field>
          <Field label="Monto">
            <Input size="md" type="number" min="0" step="0.01" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="15000" />
          </Field>
          <Field label="Categoría">
            <Select size="md" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as CategoriaGasto }))}>
              {CATEGORIAS_GASTO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Fecha">
            <Input size="md" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
          </Field>
          <Field label="Observaciones" full>
            <Input size="md" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Opcional" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirmarEliminar}
        onClose={() => { if (!eliminandoId) setConfirmarEliminar(null) }}
        title="Eliminar gasto"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmarEliminar(null)} disabled={!!eliminandoId}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarDelete} loading={!!eliminandoId} icon={!eliminandoId ? <Trash2 size={14} /> : undefined}>
              {eliminandoId ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text2)' }}>
          Esta acción quita el gasto del cálculo de ganancia estimada.
        </p>
      </Modal>
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
      {children}
    </label>
  )
}

const iconButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg2)',
  color: 'var(--text2)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  marginLeft: 6,
}
