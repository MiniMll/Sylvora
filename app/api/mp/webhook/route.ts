import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (body.type === 'payment') {
    const paymentId = body.data?.id
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
