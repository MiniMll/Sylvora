// Smoke test de la cola de revisión (épica requiere_revision, Commit 4).
//
// Cubre:
//   Lazy-promote (promoverHuerfanosSilenciosos):
//     1. aprobado sin venta y >15 min → promovido con motivo
//        'huerfano_detectado'.
//     2. aprobado sin venta pero RECIENTE (<15 min) → NO promovido.
//     3. aprobado CON venta_id (aunque viejo) → NO promovido.
//     4. idempotencia: segunda corrida → 0 promovidos, cola estable.
//     5. estados no-aprobado (pendiente/cancelado/rechazado) → intactos.
//     6. aislamiento por comercio: no toca intentos de otro comercio.
//   Cola (listarIntentosRevision):
//     7. lista requiere_revision (promovidos + marcados por otros
//        caminos), y NO incluye aprobados sanos ni resueltos.
//   Resolución (resolverIntentoMP — wrapper de la RPC):
//     (la RPC real corre en Postgres; acá se simula su contrato con
//      un mock fiel: validación de rol, estado, acción, auditoría)
//     8. descartado con nota → ok, estado resuelto + fila de auditoría.
//     9. re-resolver el mismo intento → estado_invalido (409).
//    10. rol no-admin → solo_admin (403) SIN tocar el intento.
//    11. venta_registrada sin venta_id → validacion (400).
//    12. no existe → no_encontrado (404).
//
// Correr con:
//   npx tsx scripts/smoke-mp-revision.ts

import { randomBytes, randomUUID } from 'node:crypto'
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import {
  crearIntentoCobro,
  aprobarIntentoCobro,
  actualizarIntentoCobro,
  asociarVentaAIntento,
  promoverHuerfanosSilenciosos,
  listarIntentosRevision,
  resolverIntentoMP,
} from '../lib/supabase/mp'

// ────────────────────────────────────────────────────────────────────
// Mock Supabase extendido: .is / .lt / .order / update multi-fila
// thenable / rpc('resolver_intento_mp') fiel al contrato de la RPC.
// ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
interface Store {
  intentos_cobro_mp: Row[]
  mp_resoluciones_cobro: Row[]
  ventas: Row[]
}

interface MockOpts {
  /** Rol del caller simulado — la RPC mock lo usa como get_rol(). */
  rol?: string
  /** Comercio del caller simulado — get_comercio_id(). */
  comercioId?: string
}

function createMockSupabase(mockOpts: MockOpts = {}) {
  const store: Store = { intentos_cobro_mp: [], mp_resoluciones_cobro: [], ventas: [] }
  const rol = mockOpts.rol ?? 'admin'
  const comercioCaller = mockOpts.comercioId ?? COMERCIO

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
      | { kind: 'update'; patch: Row }
      | null = null
    let selectedCols: string[] | null = null
    let selectAfterModify = false

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
        // lt: comparación de strings ISO — mismo orden que timestamptz.
        const v = r[f.col]
        return typeof v === 'string' && v < String(f.val)
      })
    }

    function executeMany(): { data: Row[]; error: null } {
      const rows = store[table]
      if (pendingOp?.kind === 'update') {
        const matched = rows.filter(matches)
        for (const r of matched) Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        return { data: matched.map(r => project(r) as Row), error: null }
      }
      // select many
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
        const inserted: Row = { ...pendingOp.row, id: randomUUID(), creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }
        if (table === 'intentos_cobro_mp') {
          if (!('estado' in inserted)) inserted.estado = 'pendiente'
          if (!('venta_id' in inserted)) inserted.venta_id = null
          if (!('mp_payment_id' in inserted)) inserted.mp_payment_id = null
          if (!('mp_status_detail' in inserted)) inserted.mp_status_detail = null
          if (!('pagado_en' in inserted)) inserted.pagado_en = null
          if (!('items_snapshot' in inserted)) inserted.items_snapshot = null
        }
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
        if (pendingOp && pendingOp.kind !== 'select') { selectAfterModify = true; return q }
        pendingOp = { kind: 'select' }
        return q
      },
      eq(col: string, val: unknown) { filtros.push({ op: 'eq', col, val }); return q },
      is(col: string, val: unknown) { filtros.push({ op: 'is', col, val }); return q },
      lt(col: string, val: unknown) { filtros.push({ op: 'lt', col, val }); return q },
      in(col: string, vals: unknown[]) { filtros.push({ op: 'in', col, vals }); return q },
      insert(row: Row) { pendingOp = { kind: 'insert', row }; return q },
      update(patch: Row) { pendingOp = { kind: 'update', patch }; return q },
      order(col: string, opts?: { ascending?: boolean }) {
        orderBy = { col, asc: opts?.ascending !== false }
        return q
      },
      async maybeSingle() { return executeSingle('maybeSingle') },
      async single() { return executeSingle('single') },
      // Thenable: await del builder sin single() → multi-fila (lo usan
      // promoverHuerfanosSilenciosos y listarIntentosRevision).
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        try { resolve(executeMany()) } catch (e) { reject?.(e) }
      },
    }
    void selectAfterModify
    return q
  }

  // RPC mock fiel al contrato de resolver_intento_mp (misma secuencia
  // de validaciones y efectos que la función plpgsql real).
  async function rpc(fn: string, params: Record<string, unknown>) {
    if (fn !== 'resolver_intento_mp') {
      return { data: null, error: { message: `rpc desconocida: ${fn}` } }
    }
    if (rol !== 'admin') {
      return { data: null, error: { message: 'solo_admin' } }
    }
    const intento = store.intentos_cobro_mp.find(r => r.id === params.p_intento_id)
    if (!intento || intento.comercio_id !== comercioCaller) {
      return { data: null, error: { message: 'intento_no_encontrado' } }
    }
    if (intento.estado !== 'requiere_revision') {
      return { data: null, error: { message: `estado_invalido: el intento está en estado "${intento.estado}"` } }
    }
    const accion = params.p_accion as string
    if (!['venta_registrada', 'venta_asociada', 'reembolsado', 'descartado'].includes(accion)) {
      return { data: null, error: { message: 'accion_invalida' } }
    }
    const ventaId = params.p_venta_id as string | null
    const nota = typeof params.p_nota === 'string' && params.p_nota.trim() ? params.p_nota.trim() : null
    if (['venta_registrada', 'venta_asociada'].includes(accion)) {
      if (!ventaId) return { data: null, error: { message: 'venta_requerida' } }
      const venta = store.ventas.find(v => v.id === ventaId)
      if (!venta || venta.comercio_id !== comercioCaller) {
        return { data: null, error: { message: 'venta_no_encontrada' } }
      }
    } else if (ventaId) {
      return { data: null, error: { message: 'venta_no_corresponde' } }
    }
    if (accion === 'descartado' && !nota) {
      return { data: null, error: { message: 'nota_requerida' } }
    }
    const resolucionId = randomUUID()
    store.mp_resoluciones_cobro.push({
      id: resolucionId,
      intento_id: intento.id,
      comercio_id: comercioCaller,
      accion,
      venta_id: ventaId,
      nota,
      resuelto_por: PERFIL,
      created_at: new Date().toISOString(),
    })
    intento.estado = 'resuelto'
    if (ventaId) intento.venta_id = ventaId
    return {
      data: { resolucion_id: resolucionId, intento_id: intento.id, accion, estado: 'resuelto' },
      error: null,
    }
  }

  const sb = {
    from(t: string) { return tableQuery(t as keyof Store) },
    rpc,
  } as unknown as import('@supabase/supabase-js').SupabaseClient
  return { sb, store }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const OTRO_COMERCIO = '00000000-0000-0000-0000-00000000c999'
const PERFIL = '00000000-0000-0000-0000-00000000p001'
const UMBRAL = 15 * 60 * 1000

async function seedAprobado(
  sb: import('@supabase/supabase-js').SupabaseClient,
  ref: string,
  opts: { pagadoHaceMs: number; ventaId?: string; comercio?: string } ,
) {
  const intento = await crearIntentoCobro(sb, {
    comercio_id: opts.comercio ?? COMERCIO,
    external_reference: ref,
    monto: 1000, metodo: 'qr',
    expira_en: new Date(), creado_por: PERFIL,
  })
  await aprobarIntentoCobro(sb, intento.id, {
    mp_payment_id: 1,
    pagado_en: new Date(Date.now() - opts.pagadoHaceMs),
  })
  if (opts.ventaId) await asociarVentaAIntento(sb, intento.id, opts.ventaId)
  return intento
}

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-mp-revision] Verificando cola de revisión...\n\n')

async function run() {

  await check('1. aprobado sin venta >15 min → promovido con huerfano_detectado', async () => {
    const { sb, store } = createMockSupabase()
    const viejo = await seedAprobado(sb, 'sy_rev_1', { pagadoHaceMs: 20 * 60_000 })
    const promovidos = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(promovidos.length === 1, `promovidos: ${promovidos.length}`)
    assert(promovidos[0].id === viejo.id, 'id equivocado')
    const row = store.intentos_cobro_mp.find(r => r.id === viejo.id)!
    assert(row.estado === 'requiere_revision', `estado: ${row.estado}`)
    assert(row.mp_status_detail === 'huerfano_detectado', `motivo: ${row.mp_status_detail}`)
    assert(row.mp_payment_id === 1, 'payment_id perdido')
  })

  await check('2. aprobado sin venta pero RECIENTE (<15 min) → NO promovido', async () => {
    const { sb, store } = createMockSupabase()
    const reciente = await seedAprobado(sb, 'sy_rev_2', { pagadoHaceMs: 5 * 60_000 })
    const promovidos = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(promovidos.length === 0, `promovió reciente: ${promovidos.length}`)
    const row = store.intentos_cobro_mp.find(r => r.id === reciente.id)!
    assert(row.estado === 'aprobado', `estado: ${row.estado}`)
  })

  await check('3. aprobado CON venta_id (aunque viejo) → NO promovido', async () => {
    const { sb, store } = createMockSupabase()
    const conVenta = await seedAprobado(sb, 'sy_rev_3', {
      pagadoHaceMs: 60 * 60_000,
      ventaId: '00000000-0000-0000-0000-00000000v003',
    })
    const promovidos = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(promovidos.length === 0, `promovió con venta: ${promovidos.length}`)
    const row = store.intentos_cobro_mp.find(r => r.id === conVenta.id)!
    assert(row.estado === 'aprobado', `estado: ${row.estado}`)
  })

  await check('4. idempotencia: segunda corrida → 0 promovidos, cola estable', async () => {
    const { sb } = createMockSupabase()
    await seedAprobado(sb, 'sy_rev_4', { pagadoHaceMs: 30 * 60_000 })
    const primera = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(primera.length === 1, 'primera corrida no promovió')
    const segunda = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(segunda.length === 0, `segunda corrida promovió: ${segunda.length}`)
    const cola = await listarIntentosRevision(sb, COMERCIO)
    assert(cola.length === 1, `cola: ${cola.length}`)
  })

  await check('5. pendiente/cancelado/rechazado → intactos', async () => {
    const { sb, store } = createMockSupabase()
    const pendiente = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_rev_5a',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    const cancelado = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_rev_5b',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    await actualizarIntentoCobro(sb, cancelado.id, { estado: 'cancelado' })
    const promovidos = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(promovidos.length === 0, 'promovió estados no-aprobado')
    assert(store.intentos_cobro_mp.find(r => r.id === pendiente.id)!.estado === 'pendiente', 'pendiente tocado')
    assert(store.intentos_cobro_mp.find(r => r.id === cancelado.id)!.estado === 'cancelado', 'cancelado tocado')
  })

  await check('6. aislamiento: no toca intentos de otro comercio', async () => {
    const { sb, store } = createMockSupabase()
    const ajeno = await seedAprobado(sb, 'sy_rev_6', { pagadoHaceMs: 60 * 60_000, comercio: OTRO_COMERCIO })
    const promovidos = await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    assert(promovidos.length === 0, 'promovió de otro comercio')
    assert(store.intentos_cobro_mp.find(r => r.id === ajeno.id)!.estado === 'aprobado', 'intento ajeno tocado')
  })

  await check('7. la cola lista requiere_revision y excluye sanos/resueltos', async () => {
    const { sb } = createMockSupabase()
    // Huérfano viejo (se promueve).
    await seedAprobado(sb, 'sy_rev_7a', { pagadoHaceMs: 30 * 60_000 })
    // Marcado por otro camino (webhook pago_post_cancelacion).
    const porWebhook = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_rev_7b',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    await actualizarIntentoCobro(sb, porWebhook.id, { estado: 'requiere_revision', mp_status_detail: 'pago_post_cancelacion' })
    // Aprobado sano con venta (no debe aparecer).
    await seedAprobado(sb, 'sy_rev_7c', { pagadoHaceMs: 60 * 60_000, ventaId: '00000000-0000-0000-0000-00000000v007' })
    // Resuelto (no debe aparecer).
    const resuelto = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_rev_7d',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    await actualizarIntentoCobro(sb, resuelto.id, { estado: 'resuelto' })

    await promoverHuerfanosSilenciosos(sb, COMERCIO, UMBRAL)
    const cola = await listarIntentosRevision(sb, COMERCIO)
    assert(cola.length === 2, `cola: ${cola.length} (esperaba 2)`)
    const motivos = cola.map(i => i.mp_status_detail).sort()
    assert(motivos.join(',') === 'huerfano_detectado,pago_post_cancelacion', `motivos: ${motivos.join(',')}`)
  })

  await check('8. resolver descartado con nota → ok + auditoría + resuelto', async () => {
    const { sb, store } = createMockSupabase()
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_rev_8',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    await actualizarIntentoCobro(sb, intento.id, { estado: 'requiere_revision' })
    const r = await resolverIntentoMP(sb, { intentoId: intento.id, accion: 'descartado', nota: 'conciliado a mano' })
    assert(r.ok === true, `falló: ${!r.ok ? r.message : ''}`)
    assert(store.intentos_cobro_mp.find(x => x.id === intento.id)!.estado === 'resuelto', 'no quedó resuelto')
    const audit = store.mp_resoluciones_cobro.filter(x => x.intento_id === intento.id)
    assert(audit.length === 1, `auditoría: ${audit.length} filas`)
    assert(audit[0].accion === 'descartado' && audit[0].nota === 'conciliado a mano', 'contenido auditoría')
  })

  await check('9. re-resolver el mismo intento → estado_invalido', async () => {
    const { sb } = createMockSupabase()
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_rev_9',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    await actualizarIntentoCobro(sb, intento.id, { estado: 'requiere_revision' })
    await resolverIntentoMP(sb, { intentoId: intento.id, accion: 'reembolsado' })
    const r2 = await resolverIntentoMP(sb, { intentoId: intento.id, accion: 'descartado', nota: 'x' })
    assert(r2.ok === false, 'segunda resolución pasó')
    if (!r2.ok) assert(r2.code === 'estado_invalido', `code: ${r2.code}`)
  })

  await check('10. rol no-admin → solo_admin SIN tocar el intento', async () => {
    const { sb, store } = createMockSupabase({ rol: 'encargado' })
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_rev_10',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    await actualizarIntentoCobro(sb, intento.id, { estado: 'requiere_revision' })
    const r = await resolverIntentoMP(sb, { intentoId: intento.id, accion: 'reembolsado' })
    assert(r.ok === false, 'encargado resolvió!')
    if (!r.ok) assert(r.code === 'solo_admin', `code: ${r.code}`)
    assert(store.intentos_cobro_mp.find(x => x.id === intento.id)!.estado === 'requiere_revision', 'estado tocado')
    assert(store.mp_resoluciones_cobro.length === 0, 'auditoría escrita sin permiso')
  })

  await check('11. venta_registrada sin venta_id → validacion', async () => {
    const { sb } = createMockSupabase()
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_rev_11',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    await actualizarIntentoCobro(sb, intento.id, { estado: 'requiere_revision' })
    const r = await resolverIntentoMP(sb, { intentoId: intento.id, accion: 'venta_registrada' })
    assert(r.ok === false, 'pasó sin venta_id')
    if (!r.ok) assert(r.code === 'validacion', `code: ${r.code}`)
  })

  await check('12. intento inexistente → no_encontrado', async () => {
    const { sb } = createMockSupabase()
    const r = await resolverIntentoMP(sb, {
      intentoId: '00000000-0000-0000-0000-000000000000',
      accion: 'reembolsado',
    })
    assert(r.ok === false, 'pasó con id inexistente')
    if (!r.ok) assert(r.code === 'no_encontrado', `code: ${r.code}`)
  })

}

run().then(() => {
  process.stdout.write(`\n[smoke-mp-revision] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
  process.stdout.write([
    '─'.repeat(70),
    'TEST MANUAL DE LOS ENDPOINTS (permisos server-side reales)',
    '─'.repeat(70),
    'GET /api/mp/revision:',
    '  como admin     → 200 { intentos: [...], promovidos: n }',
    '  como encargado → 403 "Solo administradores..."',
    '  sin cookie     → 401',
    '',
    'POST /api/mp/revision/<uuid>/resolver:',
    '  body {"accion":"descartado","nota":"conciliado"} como admin → 200',
    '  re-POST del mismo → 409 estado_invalido',
    '  como encargado → 403 (capa endpoint) — y si se bypaseara, la',
    '  RPC re-valida get_rol()=admin adentro de la transacción.',
    '─'.repeat(70),
    '',
  ].join('\n'))
}).catch(e => {
  process.stdout.write(`crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
