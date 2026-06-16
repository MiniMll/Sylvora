// Smoke test del data layer de MP (lib/supabase/mp.ts).
//
// Mockea el cliente de Supabase con un in-memory store que soporta
// la API que usa el módulo (.from(...).insert/update/upsert/select/
// eq/maybeSingle/single/delete + count head). Verifica:
//   1. guardarCredenciales cifra los tokens antes del UPSERT.
//   2. obtenerCredencialesPorComercio descifra al leer.
//   3. obtenerCredencialesPorUserIdMp busca por user_id_mp.
//   4. obtenerCredencialesPublicasPorComercio NO incluye tokens.
//   5. actualizarCredenciales cifra solo los campos cambiados.
//   6. tieneMPConectado devuelve true/false correcto.
//   7. desconectarMP borra el row.
//   8. crearIntentoCobro inserta con defaults nullables.
//   9. obtenerIntentoCobroPorExternalReference busca correctamente.
//  10. actualizarIntentoCobro mapea estado/payment_id/pagado_en.
//  11. aprobarIntentoCobro setea los 3 campos a la vez.
//  12. asociarVentaAIntento setea venta_id.
//  13. marcarExpiradoSiCorresponde: solo marca si pendiente + vencido.
//
// Correr con:
//   npx tsx scripts/smoke-mp-data-layer.ts

import { randomBytes, randomUUID } from 'node:crypto'

// Setear key de cifrado de test ANTES de importar mp.ts.
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import {
  guardarCredenciales,
  actualizarCredenciales,
  obtenerCredencialesPorComercio,
  obtenerCredencialesPorUserIdMp,
  obtenerCredencialesPublicasPorComercio,
  tieneMPConectado,
  desconectarMP,
  crearIntentoCobro,
  obtenerIntentoCobroPorId,
  obtenerIntentoCobroPorExternalReference,
  actualizarIntentoCobro,
  aprobarIntentoCobro,
  asociarVentaAIntento,
  marcarExpiradoSiCorresponde,
} from '../lib/supabase/mp'

// ────────────────────────────────────────────────────────────────────
// Mock del SupabaseClient (subset que usamos)
// ────────────────────────────────────────────────────────────────────
//
// In-memory: 2 tablas, soporta insert/upsert/update/delete/select con
// .eq, .maybeSingle, .single, .select count head.

type Row = Record<string, unknown>

interface Store {
  mp_credenciales: Row[]
  intentos_cobro_mp: Row[]
}

function createMockSupabase(store: Store) {
  function tableQuery(table: keyof Store) {
    const filters: Array<[string, unknown]> = []
    let pendingOp:
      | { kind: 'select'; count?: 'exact'; head?: boolean }
      | { kind: 'insert'; row: Row }
      | { kind: 'upsert'; row: Row; onConflict: string }
      | { kind: 'update'; patch: Row }
      | { kind: 'delete' }
      | null = null
    let selectAfterModify = false
    let selectedCols: string[] | null = null

    function project(row: Row | null): Row | null {
      if (!row) return null
      if (!selectedCols) return row
      const out: Row = {}
      for (const c of selectedCols) {
        if (c in row) out[c] = row[c]
        else out[c] = null
      }
      return out
    }

    const q = {
      select(cols: string, opts?: { count?: 'exact'; head?: boolean }) {
        selectedCols = cols.split(',').map(c => c.trim()).filter(Boolean)
        if (pendingOp && pendingOp.kind !== 'select') {
          selectAfterModify = true
          return q
        }
        pendingOp = { kind: 'select', count: opts?.count, head: opts?.head }
        return q
      },
      eq(col: string, val: unknown) {
        filters.push([col, val])
        return q
      },
      insert(row: Row) {
        pendingOp = { kind: 'insert', row }
        return q
      },
      upsert(row: Row, opts: { onConflict: string }) {
        pendingOp = { kind: 'upsert', row, onConflict: opts.onConflict }
        return q
      },
      update(patch: Row) {
        pendingOp = { kind: 'update', patch }
        return q
      },
      delete() {
        pendingOp = { kind: 'delete' }
        return q
      },
      async maybeSingle() {
        return resolve('maybeSingle')
      },
      async single() {
        return resolve('single')
      },
      then(resolve: (v: unknown) => void) {
        // permite await directo en select count head.
        return Promise.resolve(execute(null)).then(resolve)
      },
    }

    function applyFilters(rows: Row[]): Row[] {
      return rows.filter(r => filters.every(([k, v]) => r[k] === v))
    }

    function execute(mode: 'maybeSingle' | 'single' | null) {
      if (!pendingOp) {
        return { data: null, error: { code: 'no_op', message: 'no op set' } }
      }

      const rows = store[table]

      if (pendingOp.kind === 'insert') {
        const inserted = { ...pendingOp.row }
        if (!('id' in inserted)) inserted.id = randomUUID()
        const now = new Date().toISOString()
        if (!('creado_en' in inserted)) inserted.creado_en = now
        if (!('conectado_en' in inserted)) inserted.conectado_en = now
        if (!('actualizado_en' in inserted)) inserted.actualizado_en = now
        // Defaults nullables del schema intentos_cobro_mp.
        if (table === 'intentos_cobro_mp') {
          if (!('estado' in inserted)) inserted.estado = 'pendiente'
          if (!('venta_id' in inserted)) inserted.venta_id = null
          if (!('mp_payment_id' in inserted)) inserted.mp_payment_id = null
          if (!('mp_status_detail' in inserted)) inserted.mp_status_detail = null
          if (!('pagado_en' in inserted)) inserted.pagado_en = null
        }
        rows.push(inserted)
        return { data: selectAfterModify ? project(inserted) : null, error: null }
      }

      if (pendingOp.kind === 'upsert') {
        const conflictKey = pendingOp.onConflict
        const conflictVal = (pendingOp.row as Row)[conflictKey]
        const idx = rows.findIndex(r => r[conflictKey] === conflictVal)
        const now = new Date().toISOString()
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...pendingOp.row, actualizado_en: now }
          return { data: project(rows[idx]), error: null }
        }
        const inserted: Row = { ...pendingOp.row, actualizado_en: now, conectado_en: now }
        rows.push(inserted)
        return { data: project(inserted), error: null }
      }

      if (pendingOp.kind === 'update') {
        const matched = applyFilters(rows)
        if (matched.length === 0) {
          return mode === 'maybeSingle' ? { data: null, error: null } : { data: null, error: { code: 'no_rows', message: 'no rows' } }
        }
        for (const r of matched) {
          Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        }
        return { data: project(matched[0]), error: null }
      }

      if (pendingOp.kind === 'delete') {
        const before = rows.length
        store[table] = rows.filter(r => !filters.every(([k, v]) => r[k] === v))
        return { data: before - store[table].length > 0 ? {} : null, error: null }
      }

      if (pendingOp.kind === 'select') {
        const matched = applyFilters(rows)
        if (pendingOp.head) {
          return { data: null, error: null, count: matched.length }
        }
        if (mode === 'maybeSingle') return { data: project(matched[0] ?? null), error: null }
        if (mode === 'single') {
          if (matched.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
          return { data: project(matched[0]), error: null }
        }
        return { data: matched.map(r => project(r)), error: null }
      }

      return { data: null, error: { code: 'unknown', message: 'unknown op' } }
    }

    function resolve(mode: 'maybeSingle' | 'single') {
      return execute(mode)
    }

    return q
  }

  return {
    from(table: string) {
      return tableQuery(table as keyof Store)
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

// ────────────────────────────────────────────────────────────────────
// Test runner
// ────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    process.stdout.write(`  ✓ ${name}\n`)
    passed++
  } catch (e) {
    process.stdout.write(`  ✗ ${name}\n`)
    process.stdout.write(`      ${e instanceof Error ? e.message : String(e)}\n`)
    failed++
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

process.stdout.write('\n[smoke-mp-data-layer] Verificando data layer MP...\n\n')

const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const PERFIL = '00000000-0000-0000-0000-00000000p001'

async function run() {

  await check('1. guardarCredenciales cifra los tokens antes del UPSERT', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'ACCESS_PLAINTEXT',
      refresh_token: 'REFRESH_PLAINTEXT',
      expira_en: new Date(Date.now() + 180 * 86400_000),
      user_id_mp: 1234567,
      public_key: 'PUB',
      store_id_mp: 'STORE_1',
      external_pos_id: 'POS_1',
      conectado_por: PERFIL,
    })
    const row = store.mp_credenciales[0]
    assert(row.access_token !== 'ACCESS_PLAINTEXT', 'access_token NO se cifró')
    assert(row.refresh_token !== 'REFRESH_PLAINTEXT', 'refresh_token NO se cifró')
    assert(typeof row.access_token === 'string' && (row.access_token as string).split(':').length === 3, 'access_token cifrado mal formado')
  })

  await check('2. obtenerCredencialesPorComercio descifra los tokens', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'AT_PLAIN',
      refresh_token: 'RT_PLAIN',
      expira_en: new Date(),
      user_id_mp: 999,
      public_key: 'pk',
      store_id_mp: 's',
      external_pos_id: 'p',
      conectado_por: null,
    })
    const cred = await obtenerCredencialesPorComercio(sb, COMERCIO)
    assert(cred !== null, 'devolvió null')
    assert(cred!.access_token === 'AT_PLAIN', `access_token descifrado mal: ${cred!.access_token}`)
    assert(cred!.refresh_token === 'RT_PLAIN', `refresh_token descifrado mal`)
  })

  await check('3. obtenerCredencialesPorUserIdMp busca por user_id_mp', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'AT',
      refresh_token: 'RT',
      expira_en: new Date(),
      user_id_mp: 8888,
      public_key: 'pk',
      store_id_mp: 's',
      external_pos_id: 'p',
      conectado_por: null,
    })
    const cred = await obtenerCredencialesPorUserIdMp(sb, 8888)
    assert(cred !== null && cred.comercio_id === COMERCIO, 'no encontró por user_id_mp')
    const miss = await obtenerCredencialesPorUserIdMp(sb, 1)
    assert(miss === null, 'devolvió row para user_id_mp inexistente')
  })

  await check('4. obtenerCredencialesPublicasPorComercio NO incluye tokens', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'AT',
      refresh_token: 'RT',
      expira_en: new Date(),
      user_id_mp: 1,
      public_key: 'pk',
      store_id_mp: 's',
      external_pos_id: 'p',
      conectado_por: null,
    })
    const pub = await obtenerCredencialesPublicasPorComercio(sb, COMERCIO)
    assert(pub !== null, 'null')
    assert(!('access_token' in (pub as object)), 'pub incluye access_token')
    assert(!('refresh_token' in (pub as object)), 'pub incluye refresh_token')
  })

  await check('5. actualizarCredenciales cifra solo los campos cambiados', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'OLD_AT',
      refresh_token: 'OLD_RT',
      expira_en: new Date(),
      user_id_mp: 1,
      public_key: 'pk',
      store_id_mp: 's',
      external_pos_id: 'p',
      conectado_por: null,
    })
    const rtCifradoOriginal = store.mp_credenciales[0].refresh_token
    await actualizarCredenciales(sb, COMERCIO, { access_token: 'NEW_AT' })
    const cred = await obtenerCredencialesPorComercio(sb, COMERCIO)
    assert(cred!.access_token === 'NEW_AT', 'access no se actualizó')
    assert(cred!.refresh_token === 'OLD_RT', 'refresh se modificó cuando no debía')
    assert(store.mp_credenciales[0].refresh_token === rtCifradoOriginal, 'refresh cifrado cambió sin patch')
  })

  await check('6. tieneMPConectado true/false', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    assert((await tieneMPConectado(sb, COMERCIO)) === false, 'esperaba false sin credenciales')
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'AT', refresh_token: 'RT', expira_en: new Date(),
      user_id_mp: 1, public_key: 'pk', store_id_mp: 's', external_pos_id: 'p', conectado_por: null,
    })
    assert((await tieneMPConectado(sb, COMERCIO)) === true, 'esperaba true con credenciales')
  })

  await check('7. desconectarMP borra el row', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    await guardarCredenciales(sb, {
      comercio_id: COMERCIO,
      access_token: 'AT', refresh_token: 'RT', expira_en: new Date(),
      user_id_mp: 1, public_key: 'pk', store_id_mp: 's', external_pos_id: 'p', conectado_por: null,
    })
    await desconectarMP(sb, COMERCIO)
    assert(store.mp_credenciales.length === 0, 'no borró')
    assert((await tieneMPConectado(sb, COMERCIO)) === false, 'sigue conectado tras desconectar')
  })

  await check('8. crearIntentoCobro inserta con defaults nullables', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO,
      external_reference: 'sy_extref_1',
      monto: 1500,
      metodo: 'qr',
      expira_en: new Date(Date.now() + 10 * 60_000),
      creado_por: PERFIL,
    })
    assert(intento.estado === 'pendiente', `estado: ${intento.estado}`)
    assert(intento.order_id_mp === null, 'order_id_mp no es null')
    assert(intento.qr_data === null, 'qr_data no es null')
    assert(intento.venta_id === null, 'venta_id no es null')
  })

  await check('9. obtenerIntentoCobroPorExternalReference', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    await crearIntentoCobro(sb, {
      comercio_id: COMERCIO,
      external_reference: 'sy_lookup_1',
      monto: 100,
      metodo: 'qr',
      expira_en: new Date(),
      creado_por: PERFIL,
    })
    const found = await obtenerIntentoCobroPorExternalReference(sb, 'sy_lookup_1')
    assert(found !== null, 'no encontró')
    const miss = await obtenerIntentoCobroPorExternalReference(sb, 'inexistente')
    assert(miss === null, 'devolvió row inexistente')
  })

  await check('10. actualizarIntentoCobro mapea campos correctamente', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO,
      external_reference: 'sy_upd_1',
      monto: 100, metodo: 'qr',
      expira_en: new Date(), creado_por: PERFIL,
    })
    const pagado = new Date()
    const updated = await actualizarIntentoCobro(sb, intento.id, {
      estado: 'aprobado', mp_payment_id: 999, pagado_en: pagado,
    })
    assert(updated.estado === 'aprobado', 'estado')
    assert(updated.mp_payment_id === 999, 'payment_id')
    assert(updated.pagado_en === pagado.toISOString(), 'pagado_en')
  })

  await check('11. aprobarIntentoCobro setea los 3 campos a la vez', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_apr_1',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    const r = await aprobarIntentoCobro(sb, intento.id, { mp_payment_id: 12345, mp_status_detail: 'accredited' })
    assert(r.estado === 'aprobado', 'estado')
    assert(r.mp_payment_id === 12345, 'payment_id')
    assert(r.mp_status_detail === 'accredited', 'status_detail')
    assert(r.pagado_en !== null, 'pagado_en quedó null')
  })

  await check('12. asociarVentaAIntento setea venta_id', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_vnt_1',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    const VENTA = '00000000-0000-0000-0000-00000000v001'
    const r = await asociarVentaAIntento(sb, intento.id, VENTA)
    assert(r.venta_id === VENTA, 'venta_id no se asoció')
  })

  await check('13. marcarExpiradoSiCorresponde: solo si pendiente + vencido', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)

    // a) Pendiente + futuro → no toca.
    const futuro = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_exp_1',
      monto: 100, metodo: 'qr',
      expira_en: new Date(Date.now() + 10 * 60_000),
      creado_por: PERFIL,
    })
    let r = await marcarExpiradoSiCorresponde(sb, futuro)
    assert(r.estado === 'pendiente', 'tocó intento pendiente no vencido')

    // b) Pendiente + vencido → expira.
    const vencido = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_exp_2',
      monto: 100, metodo: 'qr',
      expira_en: new Date(Date.now() - 1000),
      creado_por: PERFIL,
    })
    r = await marcarExpiradoSiCorresponde(sb, vencido)
    assert(r.estado === 'expirado', `esperaba expirado, fue ${r.estado}`)

    // c) Aprobado + vencido → no toca.
    const aprobado = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_exp_3',
      monto: 100, metodo: 'qr',
      expira_en: new Date(Date.now() - 1000),
      creado_por: PERFIL,
    })
    const apr = await aprobarIntentoCobro(sb, aprobado.id, { mp_payment_id: 1 })
    r = await marcarExpiradoSiCorresponde(sb, apr)
    assert(r.estado === 'aprobado', `tocó intento aprobado: ${r.estado}`)
  })

  await check('14. obtenerIntentoCobroPorId', async () => {
    const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
    const sb = createMockSupabase(store)
    const intento = await crearIntentoCobro(sb, {
      comercio_id: COMERCIO, external_reference: 'sy_by_id',
      monto: 100, metodo: 'qr', expira_en: new Date(), creado_por: PERFIL,
    })
    const found = await obtenerIntentoCobroPorId(sb, intento.id)
    assert(found !== null && found.external_reference === 'sy_by_id', 'no encontró por id')
    const miss = await obtenerIntentoCobroPorId(sb, '00000000-0000-0000-0000-000000000000')
    assert(miss === null, 'devolvió row inexistente')
  })
}

run().then(() => {
  process.stdout.write(`\n[smoke-mp-data-layer] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  process.stdout.write(`\n[smoke-mp-data-layer] crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
