// Smoke E2E del ciclo completo de recuperación de cobros MP.
// Épica requiere_revision — Commit 6 (cierre).
//
// Valida los 4 escenarios del audit, cada uno DE PUNTA A PUNTA:
// del pago al estado 'resuelto' con su fila de auditoría.
//
//   A. Pago después de cancelar:
//      pendiente → cancelado → webhook approved → requiere_revision
//      (pago_post_cancelacion) → cola → reembolsado → resuelto.
//      + webhook repetido sobre el resuelto = no-op.
//   B. Frontend marca requiere_revision:
//      pendiente → webhook approved → aprobado → crear_venta falla →
//      marca explícita (stock_insuficiente) → cola → descartado
//      (nota) → resuelto.
//   C. Cajero cierra el navegador:
//      pendiente → webhook approved → aprobado sin venta → +15 min →
//      lazy-promote (huerfano_detectado) → cola → registrar venta
//      desde snapshot → resuelto con venta_id.
//   D. Venta existe pero faltó la asociación:
//      aprobado + venta en tabla ventas SIN link → lazy-promote →
//      cola → venta_asociada → resuelto con venta_id.
//
//   Cierre: 4 resoluciones auditadas, 4 intentos resueltos, cola
//   vacía, historial completo, nada borrado.
//
// Correr con:
//   npx tsx scripts/smoke-mp-e2e-revision.ts

import { createHmac, randomBytes, randomUUID } from 'node:crypto'
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import { processMPWebhookNotification } from '../lib/mp/webhook-handler'
import {
  guardarCredenciales,
  crearIntentoCobro,
  cancelarIntentoCobro,
  marcarIntentoRequiereRevision,
  promoverHuerfanosSilenciosos,
  listarIntentosRevision,
  resolverIntentoMP,
  obtenerIntentoCobroPorId,
} from '../lib/supabase/mp'
import type { SnapshotVentaMP } from '../lib/mp/snapshot'

// Silenciar logs verbosos del handler/api-client durante el smoke.
const origLog = console.log, origWarn = console.warn, origError = console.error
console.log = () => {}; console.warn = () => {}; console.error = () => {}

// ────────────────────────────────────────────────────────────────────
// Mock fetch para /v1/payments del webhook
// ────────────────────────────────────────────────────────────────────

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchHandler = (url: string, init: FetchInit) => Promise<Response>
let currentFetch: FetchHandler = async () => { throw new Error('no fetch handler') }
globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
  return currentFetch(url, init)
}) as typeof fetch
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function mockPayment(id: number, externalRef: string) {
  currentFetch = async () => jsonResponse(200, {
    id, status: 'approved', status_detail: 'accredited',
    transaction_amount: 3000, external_reference: externalRef,
    date_approved: new Date().toISOString(), date_created: new Date().toISOString(),
  })
}

// ────────────────────────────────────────────────────────────────────
// Mock Supabase — superset: query builder extendido + upsert + rpc
// ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
interface Store {
  mp_credenciales: Row[]
  intentos_cobro_mp: Row[]
  mp_resoluciones_cobro: Row[]
  ventas: Row[]
}

function createMockSupabase() {
  const store: Store = { mp_credenciales: [], intentos_cobro_mp: [], mp_resoluciones_cobro: [], ventas: [] }

  type Filtro =
    | { op: 'eq'; col: string; val: unknown }
    | { op: 'is'; col: string; val: unknown }
    | { op: 'lt'; col: string; val: unknown }
    | { op: 'in'; col: string; vals: unknown[] }

  function tableQuery(table: keyof Store) {
    const filtros: Filtro[] = []
    let orderBy: { col: string; asc: boolean } | null = null
    let pendingOp:
      | { kind: 'select' }
      | { kind: 'insert'; row: Row }
      | { kind: 'upsert'; row: Row; onConflict: string }
      | { kind: 'update'; patch: Row }
      | null = null
    let selectedCols: string[] | null = null

    function project(row: Row | null): Row | null {
      if (!row) return null
      if (!selectedCols) return row
      const out: Row = {}
      for (const c of selectedCols) out[c] = c in row ? row[c] : null
      return out
    }
    function matches(r: Row): boolean {
      return filtros.every(f => {
        if (f.op === 'eq') return r[f.col] === f.val
        if (f.op === 'is') return r[f.col] === f.val
        if (f.op === 'in') return f.vals.includes(r[f.col])
        const v = r[f.col]
        return typeof v === 'string' && v < String(f.val)
      })
    }
    function defaults(inserted: Row) {
      if (table === 'intentos_cobro_mp') {
        if (!('estado' in inserted)) inserted.estado = 'pendiente'
        for (const k of ['venta_id', 'mp_payment_id', 'mp_status_detail', 'pagado_en', 'items_snapshot']) {
          if (!(k in inserted)) inserted[k] = null
        }
      }
    }
    function executeMany(): { data: Row[]; error: null } {
      const rows = store[table]
      if (pendingOp?.kind === 'update') {
        const matched = rows.filter(matches)
        for (const r of matched) Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        return { data: matched.map(r => project(r) as Row), error: null }
      }
      let matched = rows.filter(matches)
      if (orderBy) {
        const { col, asc } = orderBy
        matched = [...matched].sort((a, b) => {
          const av = String(a[col] ?? ''); const bv = String(b[col] ?? '')
          return asc ? av.localeCompare(bv) : bv.localeCompare(av)
        })
      }
      return { data: matched.map(r => project(r) as Row), error: null }
    }
    function executeSingle(mode: 'maybeSingle' | 'single') {
      const rows = store[table]
      if (pendingOp?.kind === 'select') {
        const m = rows.filter(matches)
        if (mode === 'maybeSingle') return { data: project(m[0] ?? null), error: null }
        if (m.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        return { data: project(m[0]), error: null }
      }
      if (pendingOp?.kind === 'insert') {
        const inserted: Row = { ...pendingOp.row, id: (pendingOp.row.id as string) ?? randomUUID(), creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }
        defaults(inserted)
        rows.push(inserted)
        return { data: project(inserted), error: null }
      }
      if (pendingOp?.kind === 'upsert') {
        const k = pendingOp.onConflict
        const v = pendingOp.row[k]
        const idx = rows.findIndex(r => r[k] === v)
        const now = new Date().toISOString()
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...pendingOp.row, actualizado_en: now }
          return { data: project(rows[idx]), error: null }
        }
        const inserted: Row = { ...pendingOp.row, actualizado_en: now, conectado_en: now, id: randomUUID() }
        rows.push(inserted)
        return { data: project(inserted), error: null }
      }
      if (pendingOp?.kind === 'update') {
        const m = rows.filter(matches)
        if (m.length === 0) {
          if (mode === 'maybeSingle') return { data: null, error: null }
          return { data: null, error: { code: 'no_rows', message: 'no rows' } }
        }
        for (const r of m) Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        return { data: project(m[0]), error: null }
      }
      return { data: null, error: null }
    }

    const q = {
      select(cols: string) {
        selectedCols = cols.split(',').map(c => c.trim())
        if (pendingOp && pendingOp.kind !== 'select') return q
        pendingOp = { kind: 'select' }
        return q
      },
      eq(col: string, val: unknown) { filtros.push({ op: 'eq', col, val }); return q },
      is(col: string, val: unknown) { filtros.push({ op: 'is', col, val }); return q },
      lt(col: string, val: unknown) { filtros.push({ op: 'lt', col, val }); return q },
      in(col: string, vals: unknown[]) { filtros.push({ op: 'in', col, vals }); return q },
      insert(row: Row) { pendingOp = { kind: 'insert', row }; return q },
      upsert(row: Row, o: { onConflict: string }) { pendingOp = { kind: 'upsert', row, onConflict: o.onConflict }; return q },
      update(patch: Row) { pendingOp = { kind: 'update', patch }; return q },
      order(col: string, opts?: { ascending?: boolean }) { orderBy = { col, asc: opts?.ascending !== false }; return q },
      limit() { return q },
      async maybeSingle() { return executeSingle('maybeSingle') },
      async single() { return executeSingle('single') },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        try { resolve(executeMany()) } catch (e) { reject?.(e) }
      },
    }
    return q
  }

  // RPC fiel al contrato de resolver_intento_mp (rol admin fijo — el
  // caso no-admin está cubierto en smoke-mp-revision).
  async function rpc(fn: string, params: Record<string, unknown>) {
    if (fn !== 'resolver_intento_mp') return { data: null, error: { message: `rpc desconocida: ${fn}` } }
    const intento = store.intentos_cobro_mp.find(r => r.id === params.p_intento_id)
    if (!intento || intento.comercio_id !== COMERCIO) return { data: null, error: { message: 'intento_no_encontrado' } }
    if (intento.estado !== 'requiere_revision') return { data: null, error: { message: `estado_invalido: "${intento.estado}"` } }
    const accion = params.p_accion as string
    const ventaId = params.p_venta_id as string | null
    const nota = typeof params.p_nota === 'string' && params.p_nota.trim() ? params.p_nota.trim() : null
    if (['venta_registrada', 'venta_asociada'].includes(accion)) {
      if (!ventaId) return { data: null, error: { message: 'venta_requerida' } }
      const venta = store.ventas.find(v => v.id === ventaId)
      if (!venta || venta.comercio_id !== COMERCIO) return { data: null, error: { message: 'venta_no_encontrada' } }
    } else if (ventaId) {
      return { data: null, error: { message: 'venta_no_corresponde' } }
    }
    if (accion === 'descartado' && !nota) return { data: null, error: { message: 'nota_requerida' } }
    const resolucionId = randomUUID()
    store.mp_resoluciones_cobro.push({
      id: resolucionId, intento_id: intento.id, comercio_id: COMERCIO,
      accion, venta_id: ventaId, nota, resuelto_por: PERFIL, created_at: new Date().toISOString(),
    })
    intento.estado = 'resuelto'
    if (ventaId) intento.venta_id = ventaId
    return { data: { resolucion_id: resolucionId, intento_id: intento.id, accion, estado: 'resuelto' }, error: null }
  }

  const sb = { from(t: string) { return tableQuery(t as keyof Store) }, rpc } as unknown as import('@supabase/supabase-js').SupabaseClient
  return { sb, store }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const PERFIL = '00000000-0000-0000-0000-00000000p001'
const USER_ID_MP = 7777
const SECRET = 'webhook_secret_e2e'
const UMBRAL = 15 * 60 * 1000

function signedHeaders(dataId: string) {
  const ts = Math.floor(Date.now() / 1000)
  const xReq = randomUUID()
  const manifest = `id:${dataId};request-id:${xReq};ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
  const h = new Headers()
  h.set('x-signature', `ts=${ts},v1=${v1}`)
  h.set('x-request-id', xReq)
  return h
}

async function webhookApproved(sb: import('@supabase/supabase-js').SupabaseClient, paymentId: number, externalRef: string) {
  mockPayment(paymentId, externalRef)
  return processMPWebhookNotification({
    dataId: String(paymentId),
    headers: signedHeaders(String(paymentId)),
    rawBody: JSON.stringify({ type: 'payment', user_id: USER_ID_MP, data: { id: String(paymentId) } }),
    webhookSecret: SECRET,
    supabase: sb,
  })
}

function snapshot(): SnapshotVentaMP {
  return {
    version: 1, subtotal: 3000,
    descuento_porcentaje: 0, descuento_monto: 0,
    recargo_porcentaje: 0, recargo_monto: 0, total: 3000,
    items: [
      { producto_id: '11111111-1111-4111-8111-111111111111', nombre_producto: 'Coca-Cola 2.25L', precio_unitario: 1500, cantidad: 2, subtotal: 3000 },
    ],
  }
}

/** Retrocede pagado_en para simular el paso del tiempo (>umbral). */
function envejecer(store: { intentos_cobro_mp: Row[] }, intentoId: string, minutos: number) {
  const row = store.intentos_cobro_mp.find(r => r.id === intentoId)!
  row.pagado_en = new Date(Date.now() - minutos * 60_000).toISOString()
}

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); origLog(`  ✓ ${name}`); passed++ }
  catch (e) { origLog(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

origLog('\n[smoke-mp-e2e-revision] Ciclo completo de recuperación (4 clases)...\n')

async function run() {
  // Un solo mundo compartido para todo el E2E — al final verificamos
  // el cierre global (4 resoluciones, cola vacía, nada borrado).
  const { sb, store } = createMockSupabase()
  await guardarCredenciales(sb, {
    comercio_id: COMERCIO,
    access_token: 'AT', refresh_token: 'RT',
    expira_en: new Date(Date.now() + 180 * 86400_000),
    user_id_mp: USER_ID_MP, public_key: 'PK',
    store_id_mp: 'STORE', external_pos_id: 'POS', conectado_por: PERFIL,
  })

  // ══ CLASE A: pago después de cancelar ═══════════════════════════
  let intentoA: string
  await check('A1. cancelado + webhook approved → requiere_revision (pago_post_cancelacion)', async () => {
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_e2e_a',
      monto: 3000, metodo: 'qr', expira_en: new Date(Date.now() + 600_000), creado_por: PERFIL,
    })
    intentoA = intento.id
    const cancel = await cancelarIntentoCobro(sb, intento.id)
    assert(cancel.ok, 'no canceló')
    const r = await webhookApproved(sb, 9001, 'sy_e2e_a')
    assert(r.status === 200 && r.log.event === 'mp_webhook_pago_post_cancelacion', `event: ${r.log.event}`)
    const row = (await obtenerIntentoCobroPorId(sb, intento.id))!
    assert(row.estado === 'requiere_revision', `estado: ${row.estado}`)
    assert(row.mp_status_detail === 'pago_post_cancelacion', `motivo: ${row.mp_status_detail}`)
    assert(row.mp_payment_id === 9001, 'payment_id')
  })

  await check('A2. aparece en la cola y se resuelve como reembolsado', async () => {
    const cola = await listarIntentosRevision(sb, COMERCIO)
    assert(cola.some(i => i.id === intentoA), 'no está en la cola')
    const r = await resolverIntentoMP(sb, { intentoId: intentoA, accion: 'reembolsado' })
    assert(r.ok, `resolver falló: ${!r.ok ? r.message : ''}`)
    const row = (await obtenerIntentoCobroPorId(sb, intentoA))!
    assert(row.estado === 'resuelto', `estado: ${row.estado}`)
  })

  await check('A3. webhook repetido sobre el resuelto → no-op (no pisa)', async () => {
    const r = await webhookApproved(sb, 9001, 'sy_e2e_a')
    assert(r.log.event === 'mp_webhook_intento_ya_final', `event: ${r.log.event}`)
    const row = (await obtenerIntentoCobroPorId(sb, intentoA))!
    assert(row.estado === 'resuelto', `pisado: ${row.estado}`)
  })

  // ══ CLASE B: frontend marca requiere_revision ═══════════════════
  let intentoB: string
  await check('B1. aprobado + crear_venta falla → marca explícita con motivo', async () => {
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_e2e_b',
      monto: 3000, metodo: 'qr', expira_en: new Date(Date.now() + 600_000), creado_por: PERFIL,
    })
    intentoB = intento.id
    const rw = await webhookApproved(sb, 9002, 'sy_e2e_b')
    assert(rw.log.event === 'mp_webhook_intento_actualizado', `webhook: ${rw.log.event}`)
    // El POS intenta crear la venta y falla (stock) → marca.
    const marca = await marcarIntentoRequiereRevision(sb, intento.id, 'stock_insuficiente:Coca-Cola 2.25L')
    assert(marca.ok, 'marca falló')
    const row = (await obtenerIntentoCobroPorId(sb, intento.id))!
    assert(row.estado === 'requiere_revision', `estado: ${row.estado}`)
    assert(String(row.mp_status_detail).startsWith('stock_insuficiente'), `motivo: ${row.mp_status_detail}`)
  })

  await check('B2. se resuelve como descartado con nota obligatoria', async () => {
    const sinNota = await resolverIntentoMP(sb, { intentoId: intentoB, accion: 'descartado' })
    assert(!sinNota.ok && sinNota.code === 'validacion', 'descartó sin nota!')
    const r = await resolverIntentoMP(sb, { intentoId: intentoB, accion: 'descartado', nota: 'stock corregido a mano, venta cargada como efectivo' })
    assert(r.ok, `falló: ${!r.ok ? r.message : ''}`)
    const audit = store.mp_resoluciones_cobro.find(x => x.intento_id === intentoB)!
    assert(audit.nota !== null, 'nota no quedó en auditoría')
  })

  // ══ CLASE C: cajero cierra el navegador ═════════════════════════
  let intentoC: string
  await check('C1. aprobado sin venta + 20 min → lazy-promote (huerfano_detectado)', async () => {
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_e2e_c',
      monto: 3000, metodo: 'qr', expira_en: new Date(Date.now() + 600_000),
      creado_por: PERFIL, items_snapshot: snapshot(),
    })
    intentoC = intento.id
    await webhookApproved(sb, 9003, 'sy_e2e_c')
    // El cajero cierra el navegador: nadie llama a nada. Pasan 20 min.
    envejecer(store, intento.id, 20)
    const promovidos = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(promovidos.some(p => p.id === intento.id), 'no fue promovido')
    const row = (await obtenerIntentoCobroPorId(sb, intento.id))!
    assert(row.estado === 'requiere_revision' && row.mp_status_detail === 'huerfano_detectado', `estado/motivo: ${row.estado}/${row.mp_status_detail}`)
    assert(row.items_snapshot !== null, 'snapshot se perdió en la promoción')
  })

  await check('C2. registrar venta desde snapshot → resuelto con venta_id', async () => {
    // La UI crea la venta con guardarVenta (flow real del POS). Acá
    // simulamos su resultado insertando la venta en la tabla.
    const ventaId = randomUUID()
    store.ventas.push({ id: ventaId, comercio_id: COMERCIO, total: 3000, metodo_pago: 'mercadopago', estado: 'completada' })
    const r = await resolverIntentoMP(sb, { intentoId: intentoC, accion: 'venta_registrada', ventaId })
    assert(r.ok, `falló: ${!r.ok ? r.message : ''}`)
    const row = (await obtenerIntentoCobroPorId(sb, intentoC))!
    assert(row.estado === 'resuelto', `estado: ${row.estado}`)
    assert(row.venta_id === ventaId, 'venta_id no quedó asociado')
  })

  // ══ CLASE D: venta existe pero faltó la asociación ══════════════
  let intentoD: string
  let ventaD: string
  await check('D1. venta creada sin link + promote → cola (falso huérfano)', async () => {
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_e2e_d',
      monto: 3000, metodo: 'qr', expira_en: new Date(Date.now() + 600_000), creado_por: PERFIL,
    })
    intentoD = intento.id
    await webhookApproved(sb, 9004, 'sy_e2e_d')
    // La venta SÍ se creó (guardarVenta OK) pero asociarVentaAIntentoMP
    // falló (best-effort) — el intento queda sin venta_id.
    ventaD = randomUUID()
    store.ventas.push({ id: ventaD, comercio_id: COMERCIO, numero_ticket: 42, total: 3000, metodo_pago: 'mercadopago', estado: 'completada' })
    envejecer(store, intento.id, 20)
    const promovidos = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(promovidos.some(p => p.id === intento.id), 'no fue promovido')
  })

  await check('D2. el admin la asocia por ticket → resuelto con venta_id', async () => {
    const r = await resolverIntentoMP(sb, { intentoId: intentoD, accion: 'venta_asociada', ventaId: ventaD })
    assert(r.ok, `falló: ${!r.ok ? r.message : ''}`)
    const row = (await obtenerIntentoCobroPorId(sb, intentoD))!
    assert(row.estado === 'resuelto' && row.venta_id === ventaD, `estado/venta: ${row.estado}/${row.venta_id}`)
  })

  // ══ CIERRE GLOBAL ═══════════════════════════════════════════════
  await check('E1. cierre: cola vacía, 4 resoluciones auditadas, nada borrado', async () => {
    const cola = await listarIntentosRevision(sb, COMERCIO)
    assert(cola.length === 0, `cola no vacía: ${cola.length}`)
    assert(store.mp_resoluciones_cobro.length === 4, `resoluciones: ${store.mp_resoluciones_cobro.length}`)
    const acciones = store.mp_resoluciones_cobro.map(r => r.accion).sort()
    assert(acciones.join(',') === 'descartado,reembolsado,venta_asociada,venta_registrada', `acciones: ${acciones.join(',')}`)
    // Nada borrado: los 4 intentos siguen existiendo, todos resueltos.
    const intentos = store.intentos_cobro_mp.filter(i => String(i.external_reference).startsWith('sy_e2e_'))
    assert(intentos.length === 4, `intentos: ${intentos.length}`)
    assert(intentos.every(i => i.estado === 'resuelto'), 'algún intento no quedó resuelto')
    // Cada resolución apunta a un intento existente + tiene actor.
    for (const r of store.mp_resoluciones_cobro) {
      assert(store.intentos_cobro_mp.some(i => i.id === r.intento_id), 'resolución huérfana')
      assert(r.resuelto_por === PERFIL, 'sin actor en auditoría')
    }
  })
}

run().then(() => {
  console.log = origLog; console.warn = origWarn; console.error = origError
  origLog(`\n[smoke-mp-e2e-revision] ${passed} OK / ${failed} FAIL\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  console.log = origLog; console.warn = origWarn; console.error = origError
  origLog(`crash: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
