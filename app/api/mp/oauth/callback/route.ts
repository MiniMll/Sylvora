import { NextRequest, NextResponse } from 'next/server'
import { MPApiError, sanitizeForLog } from '@/lib/mp/api-client'
import { exchangeAuthorizationCode, MPOAuthError } from '@/lib/mp/oauth'
import { ensureStoreAndPOS } from '@/lib/mp/stores'
import { guardarCredenciales } from '@/lib/supabase/mp'
import { MP_OAUTH_STATE_COOKIE, requireMPGestionar, MPRouteAuthError } from '../../_auth'
import type { Comercio } from '@/types/database'

export const dynamic = 'force-dynamic'

function configUrl(req: NextRequest, status: string): URL {
  const url = new URL('/configuracion', req.url)
  url.searchParams.set('tab', 'mercado-pago')
  url.searchParams.set('mp', status)
  return url
}

function redirectClearingState(req: NextRequest, status: string): NextResponse {
  const response = NextResponse.redirect(configUrl(req, status))
  response.cookies.set(MP_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(req.url).protocol === 'https:' || process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/api/mp/oauth',
  })
  return response
}

function callbackLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify({
    level,
    component: 'mp/oauth/callback',
    event,
    ...fields,
  }))
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  if (error) {
    callbackLog('warn', 'oauth_denied_by_mp', {
      error,
      errorDescription,
    })
    return redirectClearingState(req, 'denied')
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = req.cookies.get(MP_OAUTH_STATE_COOKIE)?.value ?? null

  if (!code || !state || !cookieState || state !== cookieState) {
    callbackLog('warn', 'oauth_state_invalid', {
      codePresent: Boolean(code),
      statePresent: Boolean(state),
      cookieStatePresent: Boolean(cookieState),
      stateMatches: Boolean(state && cookieState && state === cookieState),
    })
    return redirectClearingState(req, 'state_error')
  }

  let context: Awaited<ReturnType<typeof requireMPGestionar>>
  try {
    context = await requireMPGestionar()
  } catch (e) {
    if (e instanceof MPRouteAuthError) {
      callbackLog('warn', 'oauth_callback_auth_failed', {
        status: e.status,
      })
      return redirectClearingState(req, e.status === 401 ? 'auth_required' : 'forbidden')
    }
    throw e
  }

  try {
    callbackLog('info', 'oauth_exchange_start', {
      comercioId: context.perfil.comercioId,
    })
    const token = await exchangeAuthorizationCode(code)

    const { data: comercio, error: comercioError } = await context.admin
      .from('comercios')
      .select('id, nombre, direccion')
      .eq('id', context.perfil.comercioId)
      .single()

    if (comercioError || !comercio) {
      callbackLog('error', 'oauth_comercio_not_found', {
        comercioId: context.perfil.comercioId,
        errorMessage: comercioError?.message ?? null,
      })
      return redirectClearingState(req, 'commerce_error')
    }

    const setup = await ensureStoreAndPOS({
      accessToken: token.access_token,
      userIdMp: token.user_id,
      comercio: comercio as Pick<Comercio, 'id' | 'nombre' | 'direccion'>,
    })

    const expiraEn = new Date(Date.now() + token.expires_in * 1000)
    await guardarCredenciales(context.admin, {
      comercio_id: context.perfil.comercioId,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expira_en: expiraEn,
      user_id_mp: token.user_id,
      public_key: token.public_key,
      store_id_mp: setup.storeIdMp,
      external_pos_id: setup.externalPosId,
      conectado_por: context.perfil.id,
    })

    callbackLog('info', 'oauth_credentials_saved', {
      comercioId: context.perfil.comercioId,
      userIdMp: token.user_id,
      storeIdMp: setup.storeIdMp,
      externalPosId: setup.externalPosId,
      expiraEn: expiraEn.toISOString(),
    })
    callbackLog('info', 'callback_success', {
      comercioId: context.perfil.comercioId,
      userIdMp: token.user_id,
      storeIdMp: setup.storeIdMp,
      externalPosId: setup.externalPosId,
    })
    return redirectClearingState(req, 'connected')
  } catch (e) {
    if (e instanceof MPOAuthError) {
      callbackLog('error', 'oauth_exchange_failed', {
        code: e.code,
        status: e.status,
        body: sanitizeForLog(e.body),
      })
      if (e.code === 'missing_config') return redirectClearingState(req, 'missing_config')
      return redirectClearingState(req, 'oauth_error')
    }
    if (e instanceof MPApiError) {
      callbackLog('error', 'oauth_store_pos_failed', {
        comercioId: context.perfil.comercioId,
        status: e.status,
        code: e.code,
        mpRequestId: e.mpRequestId,
        body: sanitizeForLog(e.body),
      })
      return redirectClearingState(req, 'setup_error')
    }

    callbackLog('error', 'oauth_callback_failed', {
      comercioId: context.perfil.comercioId,
      errorName: e instanceof Error ? e.name : 'unknown',
      errorMessage: e instanceof Error ? e.message : 'unknown',
    })
    return redirectClearingState(req, 'save_error')
  }
}
