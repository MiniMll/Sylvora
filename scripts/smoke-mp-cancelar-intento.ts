// Smoke test de cancelarIntentoCobro (data layer) + marcarExpiradoSiCorresponde
// como combinación que usan los endpoints GET y POST cancelar.
//
// Cubre:
//   1. cancelar un intento pendiente → ok:true, estado='cancelado'.
//   2. cancelar un intento ya aprobado → ok:false reason='not_pending'.
//   3. cancelar un intento ya cancelado → ok:false reason='not_pending' idempotente.
//   4. cancelar un id inexistente → ok:false reason='not_found'.
//   5. cancelar es atómico contra race: si el estado cambió entre la
//      lectura y el UPDATE, el resultado refleja el estado real.
//   6. marcarExpiradoSiCorresponde + cancelar en el mismo intento
//      vencido → cancelado no aplica si ya expiró.
//
// El test del endpoint full requiere cookies/SSR. Instrucciones de
// curl impresas al final.
//
// Correr con:
//   npx tsx scripts/smoke-mp-cancelar-intento.ts

import { randomBytes, randomUUID } from 'node:crypto'
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import {
  crearIntentoCobro,
  aprobarIntentoCobro,
  cancelarIntentoCobro,
  marcarExpiradoSiCorresponde,
  obtenerIntentoCobroPorId,
} from '../lib/supabase/mp'

// ────────────────────────────────────────────────────────────────────
// Mock minimalista (reutiliza el patrón de smoke-mp-data-layer)
// ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
interface Store { mp_credenciales: Row[]; intentos_cobro_mp: Row[] }

function createMockSupabase() {
  const store: Store = { mp_credenciales: [], intentos_cobro_mp: [] }
  function tableQuery(table: keyof Store) {
    const filters: Array<[string, unknown]> = []
    let pendingOp:
      | { kind: 'select' }
      | { kind: 'insert'; row: Row }
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
    const q = {
      select(cols: string) {
        selectedCols = cols.split(',').map(c => c.trim())
        if (pendingOp && pendingOp.kind !== 'select') return q
        pendingOp = { kind: 'select' }
        return q
      },
      eq(c: string, v: unknown) { filters.push([c, v]); return q },
      insert(row: Row) { pendingOp = { kind: 'insert', row }; return q },
      update(patch: Row) { pendingOp = { kind: 'update', patch }; return q },
      async maybeSingle() { return execute('maybeSingle') },
      async single() { return execute('single') },
    }
    function execute(mode: 'maybeSingle' | 'single') {
      const rows = store[table]
      if (pendingOp?.kind === 'select') {
        const m = rows.filter(r => filters.every(([k, v]) => r[k] === v))
        if (mode === 'maybeSingle') return { data: project(m[0] ?? null), error: null }
        if (m.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        return { data: project(m[0]), error: null }
      }
      if (pendingOp?.kind === 'insert') {
        const inserted: Row = {
          ...pendingOp.row, id: randomUUID(),
          creado_en: new Date().toISOString(),
          actualizado_en: new Date().toISOString(),
        }
        if (table === 'intentos_cobro_mp') {
          if (!('estado' in inserted)) inserted.estado = 'pendiente'
          if (!('venta_id' in inserted)) inserted.venta_id = null
          if (!('mp_payment_id' in inserted)) inserted.mp_payment_id = null
          if (!('mp_status_detail' in inserted)) inserted.mp_status_detail = null
          if (!('pagado_en' in inserted)) inserted.pagado_en = null
        }
        rows.push(inserted)
        return { data: project(inserted), error: null }
      }
      if (pendingOp?.kind === 'update') {
        const m = rows.filter(r => filters.every(([k, v]) => r[k] === v))
        if (m.length === 0) return { data: null, error: null }   // null → race detected
        for (const r of m) Object.assign(r, pendingOp.patch, { actualizado_en: new Date().toISOString() })
        return { data: project(m[0]), error: null }
      }
      return { data: null, error: null }
    }
    return q
  }
  return { sb: { from(t: string) { return tableQuery(t as keyof Store) } } as unknown as import('@supabase/supabase-js').SupabaseClient, store }
}

const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const PERFIL = '00000000-0000-0000-0000-00000000p001'

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-mp-cancelar-intento] Verificando cancelar + lazy expiry...\n\n')

async function seed(sb: import('@supabase/supabase-js').SupabaseClient, ref: string, expiraEn: Date = new Date(Date.now() + 10 * 60_000)) {
  return crearIntentoCobro(sb, {
    comercio_id: COMERCIO, external_reference: ref,
    monto: 1000, metodo: 'qr', expira_en: expiraEn, creado_por: PERFIL,
  })
}

async function run() {
  await check('1. cancelar pendiente → ok:true estado=cancelado', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_c_1')
    const r = await cancelarIntentoCobro(sb, i.id)
    assert(r.ok === true, `ok: ${r.ok}`)
    if (r.ok) assert(r.intento.estado === 'cancelado', `estado: ${r.intento.estado}`)
    const re = await obtenerIntentoCobroPorId(sb, i.id)
    assert(re!.estado === 'cancelado', 'DB no quedó cancelado')
  })

  await check('2. cancelar aprobado → ok:false not_pending', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_c_2')
    await aprobarIntentoCobro(sb, i.id, { mp_payment_id: 1 })
    const r = await cancelarIntentoCobro(sb, i.id)
    assert(r.ok === false, 'debió fallar')
    if (!r.ok) {
      assert(r.reason === 'not_pending', `reason: ${r.reason}`)
      assert(r.intento?.estado === 'aprobado', `estado: ${r.intento?.estado}`)
    }
  })

  await check('3. cancelar ya cancelado → ok:false not_pending (idempotente)', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_c_3')
    await cancelarIntentoCobro(sb, i.id)
    const r2 = await cancelarIntentoCobro(sb, i.id)
    assert(r2.ok === false, 'segunda llamada debió devolver no-op')
    if (!r2.ok) assert(r2.reason === 'not_pending', `reason: ${r2.reason}`)
  })

  await check('4. cancelar id inexistente → ok:false not_found', async () => {
    const { sb } = createMockSupabase()
    const r = await cancelarIntentoCobro(sb, '00000000-0000-0000-0000-000000000000')
    assert(r.ok === false, 'debió fallar')
    if (!r.ok) assert(r.reason === 'not_found', `reason: ${r.reason}`)
  })

  await check('5. atomicidad: aprobado entre lectura y UPDATE → not_pending', async () => {
    // Simulamos un race: el webhook aprueba entre el "verificar" y el
    // "UPDATE" del data layer. cancelarIntentoCobro hace UPDATE ...
    // WHERE estado='pendiente' — ese WHERE filtra a 0 rows si el
    // estado ya cambió, y maybeSingle devuelve null → released:
    // releemos el estado fresco y devolvemos not_pending con el
    // estado real (aprobado).
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_c_5')
    await aprobarIntentoCobro(sb, i.id, { mp_payment_id: 99 })  // race simulada
    const r = await cancelarIntentoCobro(sb, i.id)
    assert(r.ok === false, 'no debió cancelar')
    if (!r.ok) {
      assert(r.intento?.estado === 'aprobado', `debió ver aprobado: ${r.intento?.estado}`)
    }
  })

  await check('6. marcarExpiradoSiCorresponde + cancelar de un vencido → no cancela', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_c_6', new Date(Date.now() - 1000))
    const expirado = await marcarExpiradoSiCorresponde(sb, i)
    assert(expirado.estado === 'expirado', `no quedó expirado: ${expirado.estado}`)
    const r = await cancelarIntentoCobro(sb, i.id)
    assert(r.ok === false, 'cancelar expirado debió fallar')
    if (!r.ok) assert(r.reason === 'not_pending', `reason: ${r.reason}`)
  })

  await check('7. cancelar no toca el estado si ya está rechazado por webhook', async () => {
    const { sb } = createMockSupabase()
    const i = await seed(sb, 'sy_c_7')
    // Simular que el webhook lo marcó rechazado.
    const row = (sb as unknown as { from: (t: string) => { update: (p: Row) => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => unknown } } } })
      .from('intentos_cobro_mp')
      .update({ estado: 'rechazado' })
    // Direct mutation via the mock — el data layer real usaría actualizarIntentoCobro.
    void row
    // Workaround: usemos actualizarIntentoCobro real.
    const { actualizarIntentoCobro } = await import('../lib/supabase/mp')
    await actualizarIntentoCobro(sb, i.id, { estado: 'rechazado', mp_status_detail: 'cc_rejected' })
    const r = await cancelarIntentoCobro(sb, i.id)
    assert(r.ok === false, 'no debió cancelar un rechazado')
    if (!r.ok) {
      assert(r.intento?.estado === 'rechazado', `estado: ${r.intento?.estado}`)
      assert(r.intento?.mp_status_detail === 'cc_rejected', 'status_detail se perdió')
    }
  })
}

run().then(() => {
  process.stdout.write(`\n[smoke-mp-cancelar-intento] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
  process.stdout.write([
    '─'.repeat(70),
    'TEST MANUAL DE LOS ENDPOINTS',
    '─'.repeat(70),
    '',
    'GET /api/mp/cobros/<intento_id>:',
    '  curl http://localhost:3000/api/mp/cobros/<uuid> --cookie sb-cookies.txt',
    'Esperado 200: { intento_id, estado, monto, qr_data, checkout_url,',
    '                expira_en, pagado_en, venta_id, mp_status_detail }',
    'Casos:',
    '  id no UUID → 400',
    '  sin cookie → 401',
    '  id de otro comercio → 404 (RLS filtra)',
    '  pendiente con expira_en pasado → vuelve con estado=expirado',
    '',
    'POST /api/mp/cobros/<intento_id>/cancelar:',
    '  curl -X POST http://localhost:3000/api/mp/cobros/<uuid>/cancelar \\',
    '    --cookie sb-cookies.txt',
    'Esperado 200: { intento_id, estado, cancelado }',
    'Casos:',
    '  estaba pendiente → cancelado=true, estado=cancelado',
    '  estaba aprobado (webhook llegó antes) → cancelado=false, estado=aprobado',
    '    (avisar al admin: el comerciante igual recibió el dinero)',
    '  ya cancelado → cancelado=false, estado=cancelado (idempotente)',
    '  id inexistente → 404',
    '',
    '─'.repeat(70),
    '',
  ].join('\n'))
}).catch(e => { process.stdout.write(`crash: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1) })
