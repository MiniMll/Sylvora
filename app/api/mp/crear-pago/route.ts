import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { total, descripcion, external_reference } = await req.json()

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      items: [{
        title: descripcion || 'Venta Fácil Stock',
        quantity: 1,
        unit_price: total,
        currency_id: 'ARS',
      }],
      external_reference,
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL}/pos?pago=ok`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL}/pos?pago=error`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL}/pos?pago=pendiente`,
      },
      auto_return: 'approved',
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/mp/webhook`,
    }),
  })

  const data = await res.json()
  return NextResponse.json({
    id: data.id,
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point,
  })
}