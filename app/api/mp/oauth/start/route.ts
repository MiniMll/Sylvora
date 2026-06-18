import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  MP_OAUTH_STATE_COOKIE,
  MP_OAUTH_STATE_TTL_SECONDS,
  requireMPGestionar,
  MPRouteAuthError,
} from '../../_auth'
import { buildMPAuthorizationUrl, MPOAuthError } from '@/lib/mp/oauth'
import { getMPEnv } from '@/lib/mp/config'

export const dynamic = 'force-dynamic'

function generateState(): string {
  return randomBytes(32).toString('base64url')
}

function secureCookie(req: NextRequest): boolean {
  return new URL(req.url).protocol === 'https:' || process.env.NODE_ENV === 'production'
}

function sanitizeOAuthUrlForLog(value: string): string {
  try {
    const url = new URL(value)
    if (url.searchParams.has('state')) {
      url.searchParams.set('state', '<present>')
    }
    return url.toString()
  } catch {
    return '<invalid-url>'
  }
}

function logOAuthStartUrl(redirectUrl: string) {
  const url = new URL(redirectUrl)
  const state = url.searchParams.get('state')
  const scopeParam = url.searchParams.get('scope')
  const scopes = scopeParam
    ? scopeParam.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
    : []

  console.log(JSON.stringify({
    level: 'info',
    component: 'mp/oauth/start',
    event: 'mp_oauth_start_url_generated',
    mpEnv: getMPEnv(),
    oauthHost: url.host,
    responseType: url.searchParams.get('response_type'),
    platformId: url.searchParams.get('platform_id'),
    clientId: url.searchParams.get('client_id'),
    redirectUri: url.searchParams.get('redirect_uri'),
    scopeParamPresent: scopeParam !== null,
    scopes,
    statePresent: Boolean(state),
    stateLength: state?.length ?? 0,
    oauthUrlSanitized: sanitizeOAuthUrlForLog(redirectUrl),
  }))
}

export async function GET(req: NextRequest) {
  try {
    await requireMPGestionar()
    const state = generateState()
    const redirectUrl = buildMPAuthorizationUrl(state)
    logOAuthStartUrl(redirectUrl)
    const response = NextResponse.redirect(redirectUrl)
    response.cookies.set(MP_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(req),
      maxAge: MP_OAUTH_STATE_TTL_SECONDS,
      path: '/api/mp/oauth',
    })
    return response
  } catch (e) {
    if (e instanceof MPRouteAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    if (e instanceof MPOAuthError && e.code === 'missing_config') {
      return NextResponse.json({
        error: 'Mercado Pago OAuth no esta configurado. Falta revisar CLIENT_ID, CLIENT_SECRET o REDIRECT_URI.',
      }, { status: 503 })
    }
    console.error(JSON.stringify({
      level: 'error',
      component: 'mp/oauth/start',
      event: 'mp_oauth_start_failed',
      errorName: e instanceof Error ? e.name : 'unknown',
      errorMessage: e instanceof Error ? e.message : 'unknown',
    }))
    return NextResponse.json({ error: 'No pudimos iniciar la conexion con Mercado Pago.' }, { status: 500 })
  }
}
