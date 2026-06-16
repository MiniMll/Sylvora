import { NextResponse } from 'next/server'
import { requireMPGestionar, MPRouteAuthError } from '../_auth'
import {
  desconectarMP,
  obtenerCredencialesPublicasPorComercio,
} from '@/lib/supabase/mp'

export const dynamic = 'force-dynamic'

function authErrorResponse(e: MPRouteAuthError): NextResponse {
  return NextResponse.json({ error: e.message }, { status: e.status })
}

export async function GET() {
  try {
    const context = await requireMPGestionar()
    const credenciales = await obtenerCredencialesPublicasPorComercio(
      context.admin,
      context.perfil.comercioId,
    )
    if (!credenciales) {
      return NextResponse.json({
        estado: 'no_conectado',
        conectado: false,
        credenciales: null,
      })
    }

    return NextResponse.json({
      estado: 'conectado',
      conectado: true,
      credenciales: {
        comercio_id: credenciales.comercio_id,
        user_id_mp: credenciales.user_id_mp,
        public_key: credenciales.public_key,
        store_id_mp: credenciales.store_id_mp,
        external_pos_id: credenciales.external_pos_id,
        expira_en: credenciales.expira_en,
        conectado_en: credenciales.conectado_en,
        conectado_por: credenciales.conectado_por,
        actualizado_en: credenciales.actualizado_en,
      },
    })
  } catch (e) {
    if (e instanceof MPRouteAuthError) return authErrorResponse(e)
    console.error(JSON.stringify({
      level: 'error',
      component: 'mp/credenciales',
      event: 'mp_credenciales_get_failed',
      errorName: e instanceof Error ? e.name : 'unknown',
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'No pudimos leer la conexion de Mercado Pago.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const context = await requireMPGestionar()
    await desconectarMP(context.admin, context.perfil.comercioId)
    console.warn(JSON.stringify({
      level: 'warn',
      component: 'mp/credenciales',
      event: 'mp_disconnected',
      comercioId: context.perfil.comercioId,
      perfilId: context.perfil.id,
    }))
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof MPRouteAuthError) return authErrorResponse(e)
    console.error(JSON.stringify({
      level: 'error',
      component: 'mp/credenciales',
      event: 'mp_credenciales_delete_failed',
      errorName: e instanceof Error ? e.name : 'unknown',
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'No pudimos desconectar Mercado Pago.' }, { status: 500 })
  }
}

