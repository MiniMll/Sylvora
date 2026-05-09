import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Verifica la firma HMAC del webhook de Mercado Pago.
// Doc: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks#editor_3
function verificarFirmaMP(req: NextRequest, dataId: string | undefined): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    // Modo dev / no configurado: permitir pero loguear.
    console.warn('[MP webhook] MP_WEBHOOK_SECRET no configurado — saltando verificación de firma')
    return true
  }

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')
  if (!xSignature || !xRequestId || !dataId) return false

  // x-signature: "ts=1234567890,v1=abcdef..."
  const partes = Object.fromEntries(
    xSignature.split(',').map(p => p.trim().split('=').map(s => s.trim()) as [string, string])
  )
  const ts = partes['ts']
  const v1 = partes['v1']
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(esperado, 'hex'), Buffer.from(v1, 'hex'))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const dataId = body.data?.id ? String(body.data.id) : undefined

  if (!verificarFirmaMP(req, dataId)) {
    return NextResponse.json({ error: 'firma inválida' }, { status: 401 })
  }

  if (body.type === 'payment') {
    const paymentId = dataId
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    })
    const pago = await res.json()

    if (pago.status === 'approved') {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Modo A: pago con link generado por la app (tiene external_reference)
      if (pago.external_reference?.startsWith('venta_')) {
        await supabase
          .from('ventas')
          .update({ estado: 'completada', metodo_pago: 'mercadopago' })
          .eq('id', pago.external_reference)
      }

      // Siempre: guardar en pagos_mp para notificación en tiempo real
      // (funciona tanto para QR de mesa como para links generados)
      const pagador =
        pago.payer?.first_name
          ? `${pago.payer.first_name} ${pago.payer.last_name || ''}`.trim()
          : pago.payer?.email || null

      await supabase.from('pagos_mp').insert({
        mp_payment_id: String(pago.id),
        monto: pago.transaction_amount,
        pagador,
        pagador_email: pago.payer?.email || null,
        external_reference: pago.external_reference || null,
        estado: 'pendiente',
      })
    }
  }

  return NextResponse.json({ ok: true })
}
