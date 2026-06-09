// POST /api/mp/webhook
// ---------------------------------------------------------------
// Receptor de notificaciones de Mercado Pago. Toda la lógica vive
// en lib/mp/webhook-handler.ts — este file es el wrapper fino que
// lee Request/URL/headers, llama al handler y traduce el resultado
// a NextResponse + log.
//
// MP retries non-2xx hasta ~5 veces con backoff. La idempotencia
// la garantiza el handler (estados finales no reprocesan + UPDATE
// con WHERE estado).
//
// Nota: este endpoint NO está protegido por auth/cookies. La única
// defensa de autenticidad es la firma HMAC (verifyMPWebhookSignature).
// NUNCA agregar middleware de auth acá — rompería el flow MP.

import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server-admin'
import { getMPWebhookSecret } from '@/lib/mp/config'
import { processMPWebhookNotification } from '@/lib/mp/webhook-handler'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const dataId = url.searchParams.get('data.id') ?? ''

  // Body crudo. MP no firma el body en su template oficial, pero lo
  // leemos como text() para que el handler lo parsee y para tenerlo
  // disponible si MP cambia el algoritmo.
  const rawBody = await req.text()

  let secret: string
  try {
    secret = getMPWebhookSecret()
  } catch (e) {
    // Si la env no está configurada, NO podemos verificar firma —
    // tirar 500 y que MP reintente (con suerte el admin la configura).
    console.error(JSON.stringify({
      level: 'error',
      event: 'mp_webhook_secret_no_configurado',
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json(
      { error: 'server_misconfigured' },
      { status: 500 },
    )
  }

  const result = await processMPWebhookNotification({
    dataId,
    headers: req.headers,
    rawBody,
    webhookSecret: secret,
    supabase: getServiceClient(),
  })

  // Logueamos el evento estructurado. Nunca incluimos rawBody ni
  // tokens — el handler ya lo evitó.
  const logFn =
    result.log.level === 'error'
      ? console.error
      : result.log.level === 'warn'
        ? console.warn
        : console.log
  logFn(JSON.stringify({ component: 'mp/webhook', ...result.log }))

  return NextResponse.json(result.body, { status: result.status })
}
