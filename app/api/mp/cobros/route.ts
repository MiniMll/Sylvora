// POST /api/mp/cobros
// ---------------------------------------------------------------
// Crea un intento de cobro Mercado Pago para el comercio del caller.
//
// Flow:
//   1. Parsear + validar body { monto, metodo, descripcion? }.
//   2. Resolver session.user del caller via cookies.
//   3. Resolver perfil del caller (rol + comercio_id). Verificar
//      permiso venta.crear.
//   4. Resolver access_token del seller via token-provider (oauth
//      en prod, manual_sandbox en dev mientras OAuth real no funciona).
//   5. Crear intento pendiente en DB con external_reference único.
//   6. Llamar Orders API (crearOrderQR).
//   7. Si la Order se creó OK → actualizar intento con order_id_mp,
//      qr_data, checkout_url. Devolver { intento_id, qr_data,
//      checkout_url, expira_en, estado } al frontend.
//   8. Si Orders API falla → marcar intento como rechazado con
//      mp_status_detail (no dejar pendiente colgado). Devolver 502.
//
// LO QUE NO HACE:
//   - No crea ni persiste la venta. La venta se crea cuando el
//     webhook MP confirma aprobación. Stock no se descuenta acá.
//   - No marca venta como pagada (no hay venta todavía).
//
// El caller (POS) usa la respuesta para:
//   - Renderizar el QR (qr_data).
//   - Ofrecer "mandar link" (checkout_url).
//   - Pollear GET /api/mp/cobros/:id hasta estado=aprobado o
//     expira_en. (Polling endpoint: próximo commit.)

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rolPuede, esRolValido } from '@/lib/permissions'
import {
  crearIntentoCobro,
  actualizarIntentoCobro,
} from '@/lib/supabase/mp'
import { resolveAccessToken, MPTokenProviderError } from '@/lib/mp/token-provider'
import { generateExternalReference } from '@/lib/mp/identifiers'
import { crearOrderQR } from '@/lib/mp/orders'
import { MP_INTENTO_TTL_MS, MP_MIN_AMOUNT_ARS } from '@/lib/mp/config'
import {
  MPApiError,
  MPAuthError,
  MPClientError,
  MPRateLimitError,
  MPServerError,
  sanitizeForLog,
} from '@/lib/mp/api-client'

interface CrearCobroBody {
  monto?: unknown
  metodo?: unknown
  descripcion?: unknown
}

interface CrearCobroResponse {
  intento_id: string
  qr_data: string | null
  checkout_url: string | null
  expira_en: string
  estado: 'pendiente'
}

const MAX_MONTO = 1_000_000_000   // $1B safeguard contra typos catastróficos

export async function POST(req: Request) {
  // ── 1. Parse + validate body ─────────────────────────────────────
  let body: CrearCobroBody
  try {
    body = (await req.json()) as CrearCobroBody
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const monto = typeof body.monto === 'number' ? body.monto : NaN
  if (!Number.isFinite(monto) || monto <= 0 || monto > MAX_MONTO) {
    return NextResponse.json(
      { error: 'Monto inválido. Debe ser un número positivo razonable.' },
      { status: 400 },
    )
  }

  if (monto < MP_MIN_AMOUNT_ARS) {
    return NextResponse.json(
      { error: `Mercado Pago permite cobrar desde $${MP_MIN_AMOUNT_ARS}. Ajusta el monto para generar el QR.` },
      { status: 400 },
    )
  }

  const metodo = body.metodo === 'qr' || body.metodo === 'link' ? body.metodo : 'qr'
  // V1: solo soportamos 'qr' como método primario. 'link' queda
  // documentado en el tipo pero el wrapper de orders.ts hoy crea
  // siempre QR dinámico. El frontend igual recibe checkout_url para
  // ofrecerlo como fallback "mandar link".
  void metodo

  const descripcion =
    typeof body.descripcion === 'string' && body.descripcion.trim()
      ? body.descripcion.trim().slice(0, 200)
      : undefined

  // ── 2. Resolver session ─────────────────────────────────────────
  const cookieStore = await cookies()
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* no-op en route handlers */ },
      },
    },
  )

  const { data: { user: caller } } = await userClient.auth.getUser()
  if (!caller) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // ── 3. Perfil + permiso ──────────────────────────────────────────
  // Usamos el userClient (cookie) — RLS de perfiles permite leer el
  // propio. No necesitamos service role.
  const { data: perfil, error: perfilError } = await userClient
    .from('perfiles')
    .select('id, comercio_id, rol')
    .eq('id', caller.id)
    .single()

  if (perfilError || !perfil) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
  }
  if (!perfil.comercio_id) {
    return NextResponse.json({ error: 'Sin comercio asignado' }, { status: 403 })
  }
  if (!esRolValido(perfil.rol) || !rolPuede(perfil.rol, 'venta.crear')) {
    return NextResponse.json({ error: 'No tenés permiso para cobrar' }, { status: 403 })
  }

  // ── 4. Resolver access_token del seller ──────────────────────────
  let token: Awaited<ReturnType<typeof resolveAccessToken>>
  try {
    token = await resolveAccessToken({
      comercioId: perfil.comercio_id,
      supabase: userClient,
    })
  } catch (e) {
    if (e instanceof MPTokenProviderError) {
      if (e.code === 'no_credentials') {
        return NextResponse.json(
          { error: 'Mercado Pago no está conectado. Pedile al administrador que lo conecte en Configuración.' },
          { status: 409 },
        )
      }
      if (e.code === 'mp_reconnect_required') {
        return NextResponse.json(
          {
            error: 'Mercado Pago necesita reconectarse. Pedile al administrador que vuelva a conectar la cuenta.',
            code: 'mp_reconnect_required',
          },
          { status: 409 },
        )
      }
      // mode_blocked / comercio_mismatch / missing_env / invalid_mode:
      // configuración del servidor. Log con el code, mensaje genérico
      // al frontend.
      console.error(JSON.stringify({
        event: 'mp_token_provider_error',
        code: e.code,
        comercioId: perfil.comercio_id,
      }))
      return NextResponse.json(
        { error: 'Mercado Pago no está disponible en este momento.' },
        { status: 503 },
      )
    }
    throw e
  }

  // ── 5. Crear intento pendiente en DB ─────────────────────────────
  // External_reference único — lo usamos como idempotency key
  // derivada y como lookup primario del webhook.
  const externalReference = generateExternalReference()
  const expiraEn = new Date(Date.now() + MP_INTENTO_TTL_MS)

  let intento: Awaited<ReturnType<typeof crearIntentoCobro>>
  try {
    intento = await crearIntentoCobro(userClient, {
      comercio_id: perfil.comercio_id,
      external_reference: externalReference,
      monto,
      metodo: 'qr',
      expira_en: expiraEn,
      creado_por: perfil.id,
    })
  } catch (e) {
    console.error(JSON.stringify({
      event: 'mp_create_intento_failed',
      comercioId: perfil.comercio_id,
      // Sin token, sin externalReference no es un secret pero igual
      // no es útil acá.
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json(
      { error: 'No pudimos iniciar el cobro. Probá de nuevo.' },
      { status: 500 },
    )
  }

  // ── 6. Crear Order en MP ─────────────────────────────────────────
  let order: Awaited<ReturnType<typeof crearOrderQR>>
  try {
    order = await crearOrderQR({
      accessToken: token.accessToken,
      externalPosId: token.externalPosId,
      externalReference,
      monto,
      descripcion,
    })
  } catch (e) {
    // ── 6.b. Falla de Orders API — marcar intento rechazado ──────
    // Evitamos dejar el intento en estado pendiente indefinidamente.
    // Si fue 401 (auth) o 5xx, el detalle queda en mp_status_detail
    // para diagnóstico.
    const detail =
      e instanceof MPApiError
        ? `${e.name}:${e.status}:${e.code ?? 'no_code'}`
        : 'desconocido'
    try {
      await actualizarIntentoCobro(userClient, intento.id, {
        estado: 'rechazado',
        mp_status_detail: detail.slice(0, 200),
      })
    } catch (markErr) {
      console.error(JSON.stringify({
        event: 'mp_intento_mark_rechazado_failed',
        intentoId: intento.id,
        comercioId: perfil.comercio_id,
        markErrorMessage: markErr instanceof Error ? markErr.message : 'unknown',
      }))
    }

    // Body que mandamos a MP, reconstruido para el log (mismo que arma
    // crearOrderQR). Sin tokens — los headers no se incluyen. Sirve para
    // diagnosticar campos rechazados sin tener que reproducir el flujo.
    // Mantener sincronizado con el body real de crearOrderQR (incluye
    // transactions desde el ajuste al schema de sept 2025).
    const montoStr = monto.toFixed(2)
    const requestBodyParaLog = {
      type: 'qr',
      total_amount: montoStr,
      external_reference: externalReference,
      ...(descripcion ? { description: descripcion } : {}),
      config: { qr: { external_pos_id: token.externalPosId, mode: 'dynamic' } },
      transactions: { payments: [{ amount: montoStr }] },
    }

    // Log enriquecido para 4xx — incluye el body parseado de MP (con
    // cause / message / error si vienen), el body que mandamos, y los
    // identificadores del intento. Para 5xx alcanza con el status.
    const isClient4xx = e instanceof MPClientError
    console.error(JSON.stringify({
      event: isClient4xx ? 'mp_create_order_client_error' : 'mp_create_order_failed',
      intentoId: intento.id,
      comercioId: perfil.comercio_id,
      source: token.source,
      externalReference,
      externalPosId: token.externalPosId,
      monto,
      descripcion: descripcion ?? null,
      errorName: e instanceof Error ? e.name : 'unknown',
      status: e instanceof MPApiError ? e.status : null,
      code: e instanceof MPApiError ? e.code : null,
      mpRequestId: e instanceof MPApiError ? e.mpRequestId : null,
      mpErrorMessage: e instanceof MPApiError ? e.message : null,
      ...(isClient4xx ? {
        mpResponseBody: sanitizeForLog((e as MPClientError).body),
        sylvoraRequestBody: requestBodyParaLog,
      } : {}),
    }))

    // Mensaje al frontend según tipo de error. El code permite que el
    // frontend discrimine sin parsear strings.
    if (e instanceof MPAuthError) {
      return NextResponse.json(
        {
          error: 'La conexión con Mercado Pago no es válida. El administrador tiene que reconectarla.',
          code: 'mp_auth_error',
        },
        { status: 502 },
      )
    }
    if (e instanceof MPRateLimitError) {
      return NextResponse.json(
        { error: 'Mercado Pago está limitando los pedidos. Probá en unos segundos.', code: 'mp_rate_limit' },
        { status: 503 },
      )
    }
    if (e instanceof MPServerError) {
      return NextResponse.json(
        { error: 'Mercado Pago no responde. Probá de nuevo en un momento.', code: 'mp_server_error' },
        { status: 503 },
      )
    }
    if (e instanceof MPClientError) {
      // 4xx — body mal armado o config (ej. external_pos_id no existe,
      // monto fuera de rango). Mensaje genérico al frontend (el detalle
      // queda en los logs server-side), pero con code específico para
      // que el modal pueda discriminar UX.
      return NextResponse.json(
        {
          error: 'Mercado Pago rechazó la solicitud. Revisá los datos del cobro o avisá al administrador.',
          code: 'mp_order_client_error',
        },
        { status: 502 },
      )
    }
    return NextResponse.json(
      { error: 'No pudimos generar el cobro. Probá de nuevo.', code: 'mp_unknown_error' },
      { status: 502 },
    )
  }

  // ── 7. Actualizar intento con datos de la Order ──────────────────
  let intentoActualizado: Awaited<ReturnType<typeof actualizarIntentoCobro>>
  try {
    intentoActualizado = await actualizarIntentoCobro(userClient, intento.id, {
      order_id_mp: order.orderIdMp,
      qr_data: order.qrData,
      checkout_url: order.checkoutUrl,
    })
  } catch (e) {
    // La Order existe en MP pero no la pudimos asociar al intento.
    // No es fatal — el webhook posterior puede matchear por
    // external_reference. Loggeamos como warn pero devolvemos OK al
    // frontend usando los datos de la Order que tenemos in-memory.
    console.warn(JSON.stringify({
      event: 'mp_intento_update_after_order_failed',
      intentoId: intento.id,
      orderIdMp: order.orderIdMp,
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    intentoActualizado = intento
  }

  // ── 8. Respuesta al frontend ─────────────────────────────────────
  const response: CrearCobroResponse = {
    intento_id: intentoActualizado.id,
    qr_data: order.qrData,
    checkout_url: order.checkoutUrl,
    expira_en: intentoActualizado.expira_en,
    estado: 'pendiente',
  }

  // Log de auditoría sin tokens ni QR payload.
  console.log(JSON.stringify({
    event: 'mp_cobro_creado',
    intentoId: intentoActualizado.id,
    comercioId: perfil.comercio_id,
    orderIdMp: order.orderIdMp,
    monto,
    source: token.source,
    qrDataPresent: typeof response.qr_data === 'string',
    checkoutUrlPresent: typeof response.checkout_url === 'string',
  }))

  return NextResponse.json(response, { status: 201 })
}
