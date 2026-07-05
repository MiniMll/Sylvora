// GET /api/mp/revision
// ---------------------------------------------------------------
// Cola de cobros MP a revisar. ADMIN-ONLY.
//
// Flow:
//   1. Auth (cookie) + perfil + rol='admin' estricto.
//   2. Lazy-promote de huérfanos silenciosos: intentos aprobados sin
//      venta con más de 15 min desde el pago → requiere_revision con
//      motivo 'huerfano_detectado'. Idempotente (segunda corrida no
//      matchea nada). Sin cron: mismo patrón que el lazy expiry.
//   3. Listar todos los requiere_revision del comercio.
//
// Responde { intentos, promovidos } — promovidos es la cantidad que
// ESTA request detectó (para telemetría/UI, no cambia la lista).
//
// Defensa en profundidad: el check admin acá es la primera capa; la
// resolución (POST /resolver) además re-valida admin DENTRO de la
// RPC. La RLS de mp_resoluciones_cobro es la tercera.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { esRolValido } from '@/lib/permissions'
import {
  promoverHuerfanosSilenciosos,
  listarIntentosRevision,
  listarResolucionesCobro,
} from '@/lib/supabase/mp'
import { MP_HUERFANO_UMBRAL_MS } from '@/lib/mp/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* no-op */ },
      },
    },
  )

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: perfil, error: perfilError } = await userClient
    .from('perfiles')
    .select('id, comercio_id, rol')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil?.comercio_id) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
  }
  // ADMIN estricto — la cola es plata. Encargado/cajero no la ven.
  if (!esRolValido(perfil.rol) || perfil.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores pueden ver la cola de revisión' }, { status: 403 })
  }

  // ── Lazy-promote de huérfanos silenciosos ────────────────────────
  // Si el promote falla, respondemos 500 — es plata: preferimos que
  // el admin vea un error y reintente antes que una lista parcial
  // que esconde huérfanos. El promote es idempotente, reintentar es
  // seguro.
  let promovidos = 0
  try {
    const nuevos = await promoverHuerfanosSilenciosos(
      userClient,
      perfil.comercio_id,
      MP_HUERFANO_UMBRAL_MS,
    )
    promovidos = nuevos.length
    if (promovidos > 0) {
      // Level error a propósito: hay dinero cobrado sin venta que
      // nadie había marcado — alerta operativa.
      console.error(JSON.stringify({
        event: 'mp_huerfanos_promovidos',
        comercioId: perfil.comercio_id,
        cantidad: promovidos,
        intentoIds: nuevos.map(i => i.id),
      }))
    }
  } catch (e) {
    console.error(JSON.stringify({
      event: 'mp_promote_huerfanos_failed',
      comercioId: perfil.comercio_id,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json(
      { error: 'No pudimos actualizar la cola de revisión. Probá de nuevo.' },
      { status: 500 },
    )
  }

  // ── Listar cola + historial de resueltos ─────────────────────────
  try {
    const ahora = Date.now()
    const [intentos, resueltos] = await Promise.all([
      listarIntentosRevision(userClient, perfil.comercio_id),
      listarResolucionesCobro(userClient, perfil.comercio_id, 20),
    ])
    return NextResponse.json({
      intentos: intentos.map(i => ({
        intento_id: i.id,
        monto: Number(i.monto),
        mp_payment_id: i.mp_payment_id,
        motivo: i.mp_status_detail,
        // Clasificación estable para filtros de UI: huérfano detectado
        // por el barrido vs marcado explícito (crear_venta falló /
        // pago post-cancelación).
        tipo: i.mp_status_detail === 'huerfano_detectado' ? 'huerfano_detectado' : 'requiere_revision',
        estado: i.estado,
        pagado_en: i.pagado_en,
        antiguedad_minutos: i.pagado_en
          ? Math.max(0, Math.floor((ahora - new Date(i.pagado_en).getTime()) / 60_000))
          : null,
        creado_en: i.creado_en,
        actualizado_en: i.actualizado_en,
        external_reference: i.external_reference,
        tiene_snapshot: i.items_snapshot !== null,
        items_snapshot: i.items_snapshot,
        venta_id: i.venta_id,
      })),
      resueltos: resueltos.map(r => ({
        resolucion_id: r.id,
        intento_id: r.intento_id,
        accion: r.accion,
        nota: r.nota,
        fecha: r.created_at,
        resuelto_por: r.resuelto_por_nombre,
        venta_id: r.venta_id,
        venta_numero_ticket: r.venta_numero_ticket,
        monto: r.intento_monto,
        mp_payment_id: r.intento_mp_payment_id,
      })),
      promovidos,
    }, { status: 200 })
  } catch (e) {
    console.error(JSON.stringify({
      event: 'mp_listar_revision_failed',
      comercioId: perfil.comercio_id,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'No pudimos cargar la cola de revisión' }, { status: 500 })
  }
}
