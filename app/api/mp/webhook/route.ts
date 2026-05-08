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

    if (pago.status === 'approved' && pago.external_reference) {
      // Guardar en Supabase que el pago fue aprobado
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      await supabase
        .from('ventas')
        .update({ estado: 'completada', metodo_pago: 'mercadopago' })
        .eq('id', pago.external_reference)
    }
  }

  return NextResponse.json({ ok: true })
}