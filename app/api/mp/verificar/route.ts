import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const external_reference = searchParams.get('external_reference')

  if (!external_reference) return NextResponse.json({ pagado: false })

  const res = await fetch(
    `https://api.mercadopago.com/v1/payments/search?external_reference=${external_reference}&sort=date_created&criteria=desc`,
    {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    }
  )
  const data = await res.json()
  const pago = data.results?.[0]

  return NextResponse.json({
    pagado: pago?.status === 'approved',
    estado: pago?.status || 'sin_pago',
    monto: pago?.transaction_amount,
    metodo: pago?.payment_type_id,
    fecha: pago?.date_approved,
  })
}