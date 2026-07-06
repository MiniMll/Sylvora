// Smoke test — Sprint QA-1, hallazgo L1: anulación de ventas MP.
//
// Cubre:
//   1. Anular venta MP → estado 'anulada' + reembolso_mp_pendiente=true
//      en el MISMO update (atómico).
//   2. Anular venta efectivo → sin flag (no se manda la columna).
//   3. Doble anulación → error claro, sin tocar el flag (guard atómico
//      WHERE estado='completada' intacto).
//   4. Backward-compat: DB sin la columna → retry sin el flag y la
//      anulación NO se bloquea (patrón cerrarCaja).
//   5. Stock restituido con peso_kg ?? cantidad (regresión del flujo
//      existente).
//   6. marcarReembolsoMPHecho: apaga el flag solo si la venta está
//      anulada + pendiente (atómico); false si ya confirmado.
//   7. marcarReembolsoMPHecho sobre venta de otro comercio → false
//      (aislamiento).
//
// Correr con:
//   npx tsx scripts/smoke-ventas-anular-mp.ts

import { randomBytes, randomUUID } from 'node:crypto'
// _base importa crypto de mp transitivamente vía types — no, ventas.ts
// solo importa _base. Igual seteamos envs dummy para createBrowserClient
// si algún import lo tocara.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'dummy'
process.env.SYLVORA_MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

import { anularVentaCon, marcarReembolsoMPHechoCon } from '../lib/supabase/ventas'
import type { Venta } from '../types/database'

// ────────────────────────────────────────────────────────────────────
// Mock Supabase (patrón del repo) + captura de RPCs
// ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function createMockSupabase(opts: { sinColumnaReembolso?: boolean } = {}) {
  const ventas: Row[] = []
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []

  function tableQuery() {
    const filters: Array<[string, unknown]> = []
    let patch: Row | null = null
    const q = {
      update(p: Row) { patch = p; return q },
      eq(c: string, v: unknown) { filters.push([c, v]); return q },
      select() { return q },
      async maybeSingle() {
        if (!patch) return { data: null, error: null }
        // Simular DB sin la migración: PostgREST rechaza columnas
        // desconocidas con un error que menciona la columna.
        if (opts.sinColumnaReembolso && 'reembolso_mp_pendiente' in patch) {
          return { data: null, error: { code: 'PGRST204', message: "Could not find the 'reembolso_mp_pendiente' column of 'ventas'" } }
        }
        const matched = ventas.filter(r => filters.every(([k, v]) => r[k] === v))
        if (matched.length === 0) return { data: null, error: null }
        Object.assign(matched[0], patch)
        return { data: { ...matched[0] }, error: null }
      },
    }
    return q
  }

  const sb = {
    from(t: string) { void t; return tableQuery() },
    async rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params })
      return { data: null, error: null }
    },
  } as unknown as ReturnType<typeof import('../lib/supabase/_base').getBrowserClient>

  return { sb, ventas, rpcCalls }
}

const COMERCIO = '00000000-0000-0000-0000-00000000c001'
const OTRO_COMERCIO = '00000000-0000-0000-0000-00000000c999'

function ventaBase(over: Partial<Venta> & { id?: string } = {}): Venta {
  return {
    id: over.id ?? randomUUID(),
    comercio_id: COMERCIO,
    numero_ticket: 1,
    subtotal: 3000, descuento_porcentaje: 0, descuento_monto: 0,
    recargo_porcentaje: 0, recargo_monto: 0, total: 3000,
    metodo_pago: 'efectivo',
    estado: 'completada',
    created_at: new Date().toISOString(),
    items_venta: [
      { id: 'i1', venta_id: 'x', producto_id: 'p1', nombre_producto: 'Coca', precio_unitario: 1500, cantidad: 2, subtotal: 3000, peso_kg: null },
    ],
    ...over,
  } as Venta
}

function seed(ventas: Row[], v: Venta): Venta {
  ventas.push({ id: v.id, comercio_id: v.comercio_id, estado: v.estado, reembolso_mp_pendiente: false })
  return v
}

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); process.stdout.write(`  ✓ ${name}\n`); passed++ }
  catch (e) { process.stdout.write(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`); failed++ }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

process.stdout.write('\n[smoke-ventas-anular-mp] Anulación de ventas MP (QA-1 L1)...\n\n')

async function run() {

  await check('1. anular venta MP → anulada + reembolso_mp_pendiente=true atómico', async () => {
    const { sb, ventas } = createMockSupabase()
    const v = seed(ventas, ventaBase({ metodo_pago: 'mercadopago' }))
    const r = await anularVentaCon(sb, v)
    assert(r.ok, `falló: ${!r.ok ? r.error : ''}`)
    const row = ventas[0]
    assert(row.estado === 'anulada', `estado: ${row.estado}`)
    assert(row.reembolso_mp_pendiente === true, `flag: ${row.reembolso_mp_pendiente}`)
  })

  await check('2. anular venta efectivo → sin flag', async () => {
    const { sb, ventas } = createMockSupabase()
    const v = seed(ventas, ventaBase({ metodo_pago: 'efectivo' }))
    const r = await anularVentaCon(sb, v)
    assert(r.ok, 'falló')
    const row = ventas[0]
    assert(row.estado === 'anulada', 'no anuló')
    assert(row.reembolso_mp_pendiente === false, `flag tocado: ${row.reembolso_mp_pendiente}`)
  })

  await check('3. doble anulación → error claro, flag intacto', async () => {
    const { sb, ventas } = createMockSupabase()
    const v = seed(ventas, ventaBase({ metodo_pago: 'mercadopago' }))
    await anularVentaCon(sb, v)
    // Segunda anulación con el objeto "viejo" (estado completada en
    // memoria del caller): el guard atómico del WHERE la rechaza.
    const r2 = await anularVentaCon(sb, v)
    assert(!r2.ok, 'segunda anulación pasó!')
    assert(/anulada/i.test(r2.ok ? '' : r2.error ?? ''), `error: ${!r2.ok ? r2.error : ''}`)
  })

  await check('4. DB sin la columna → retry sin flag, anulación NO bloqueada', async () => {
    const { sb, ventas } = createMockSupabase({ sinColumnaReembolso: true })
    const v = seed(ventas, ventaBase({ metodo_pago: 'mercadopago' }))
    const r = await anularVentaCon(sb, v)
    assert(r.ok, `falló: ${!r.ok ? r.error : ''} (el fallback no funcionó)`)
    const row = ventas[0]
    assert(row.estado === 'anulada', 'no anuló en fallback')
    // El flag no pudo grabarse (columna ausente) — queda como estaba.
    assert(row.reembolso_mp_pendiente === false, 'flag grabado sin columna?')
  })

  await check('5. restituir_stock llamado con peso_kg ?? cantidad', async () => {
    const { sb, ventas, rpcCalls } = createMockSupabase()
    const v = seed(ventas, ventaBase({
      metodo_pago: 'mercadopago',
      items_venta: [
        { id: 'i1', venta_id: 'x', producto_id: 'p1', nombre_producto: 'Coca', precio_unitario: 1500, cantidad: 2, subtotal: 3000, peso_kg: null },
        { id: 'i2', venta_id: 'x', producto_id: 'p2', nombre_producto: 'Queso', precio_unitario: 5000, cantidad: 1, subtotal: 5000, peso_kg: 0.75 },
      ],
    }))
    await anularVentaCon(sb, v)
    assert(rpcCalls.length === 2, `rpcs: ${rpcCalls.length}`)
    const porUnidad = rpcCalls.find(c => c.params.p_producto_id === 'p1')!
    const porPeso = rpcCalls.find(c => c.params.p_producto_id === 'p2')!
    assert(porUnidad.params.p_cantidad === 2, `unidad: ${porUnidad.params.p_cantidad}`)
    assert(porPeso.params.p_cantidad === 0.75, `peso: ${porPeso.params.p_cantidad}`)
  })

  await check('6. marcarReembolsoMPHecho: atómico, false si ya confirmado', async () => {
    const { sb, ventas } = createMockSupabase()
    const v = seed(ventas, ventaBase({ metodo_pago: 'mercadopago' }))
    await anularVentaCon(sb, v)
    const ok1 = await marcarReembolsoMPHechoCon(sb, COMERCIO, v.id)
    assert(ok1 === true, 'primera confirmación falló')
    assert(ventas[0].reembolso_mp_pendiente === false, 'flag no se apagó')
    // Segunda confirmación (otra pestaña): el WHERE pendiente=true no
    // matchea → false, sin error.
    const ok2 = await marcarReembolsoMPHechoCon(sb, COMERCIO, v.id)
    assert(ok2 === false, 'segunda confirmación devolvió true')
  })

  await check('7. marcarReembolsoMPHecho de otro comercio → false (aislamiento)', async () => {
    const { sb, ventas } = createMockSupabase()
    const v = seed(ventas, ventaBase({ metodo_pago: 'mercadopago' }))
    await anularVentaCon(sb, v)
    const ok = await marcarReembolsoMPHechoCon(sb, OTRO_COMERCIO, v.id)
    assert(ok === false, 'cruzó comercios!')
    assert(ventas[0].reembolso_mp_pendiente === true, 'flag tocado cross-comercio')
  })

}

run().then(() => {
  process.stdout.write(`\n[smoke-ventas-anular-mp] ${passed} OK / ${failed} FAIL\n\n`)
  if (failed > 0) process.exit(1)
}).catch(e => {
  process.stdout.write(`crash: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
