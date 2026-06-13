// Helpers server-side para OAuth de Mercado Pago.
//
// Este modulo nunca se importa desde componentes cliente: lee CLIENT_SECRET
// y hace el intercambio de code/refresh_token contra /oauth/token.

import {
  getMPClientCredentials,
  getMPEnv,
  getMPRedirectUri,
  MP_API_TIMEOUT_MS,
  MP_OAUTH_AUTHORIZE_URL,
  MP_OAUTH_TOKEN_URL,
} from './config'
import { sanitizeForLog } from './api-client'
import type { MPOAuthTokenResponse } from './types'

export type MPOAuthErrorCode =
  | 'missing_config'
  | 'http_error'
  | 'network_error'
  | 'invalid_response'

export class MPOAuthError extends Error {
  readonly code: MPOAuthErrorCode
  readonly status: number | null
  readonly body: unknown

  constructor(
    code: MPOAuthErrorCode,
    message: string,
    opts: { status?: number | null; body?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause })
    this.name = 'MPOAuthError'
    this.code = code
    this.status = opts.status ?? null
    this.body = opts.body
  }
}

function oauthLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify({
    level,
    component: 'mp/oauth',
    event,
    ...fields,
  }))
}

export function buildMPAuthorizationUrl(state: string): string {
  let clientId: string
  let redirectUri: string
  try {
    clientId = getMPClientCredentials().clientId
    redirectUri = getMPRedirectUri()
  } catch (e) {
    throw new MPOAuthError(
      'missing_config',
      e instanceof Error ? e.message : 'Configuracion OAuth MP incompleta.',
      { cause: e },
    )
  }

  const url = new URL(MP_OAUTH_AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('platform_id', 'mp')
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', redirectUri)
  return url.toString()
}

function assertTokenResponse(value: unknown): MPOAuthTokenResponse {
  if (!value || typeof value !== 'object') {
    throw new MPOAuthError('invalid_response', 'Mercado Pago devolvio una respuesta OAuth invalida.', {
      body: value,
    })
  }
  const o = value as Record<string, unknown>
  if (
    typeof o.access_token !== 'string' ||
    typeof o.refresh_token !== 'string' ||
    typeof o.expires_in !== 'number' ||
    typeof o.user_id !== 'number' ||
    typeof o.public_key !== 'string'
  ) {
    throw new MPOAuthError('invalid_response', 'Faltan campos obligatorios en la respuesta OAuth MP.', {
      body: sanitizeForLog(value),
    })
  }
  return value as MPOAuthTokenResponse
}

async function postOAuthToken(body: Record<string, unknown>): Promise<MPOAuthTokenResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MP_API_TIMEOUT_MS)
  let response: Response

  oauthLog('info', 'token_request_start', {
    grantType: body.grant_type,
    mpEnv: getMPEnv(),
  })

  try {
    response = await fetch(MP_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (e) {
    throw new MPOAuthError('network_error', 'No pudimos conectar con Mercado Pago OAuth.', {
      cause: e,
    })
  } finally {
    clearTimeout(timeout)
  }

  let json: unknown = null
  try {
    json = await response.json()
  } catch {
    json = null
  }

  if (!response.ok) {
    oauthLog('error', 'token_request_failed', {
      status: response.status,
      body: sanitizeForLog(json),
    })
    throw new MPOAuthError(
      'http_error',
      'Mercado Pago rechazo el intercambio OAuth.',
      { status: response.status, body: sanitizeForLog(json) },
    )
  }

  oauthLog('info', 'token_request_success', {
    grantType: body.grant_type,
    status: response.status,
  })
  return assertTokenResponse(json)
}

export async function exchangeAuthorizationCode(code: string): Promise<MPOAuthTokenResponse> {
  let clientId: string
  let clientSecret: string
  let redirectUri: string
  try {
    const credentials = getMPClientCredentials()
    clientId = credentials.clientId
    clientSecret = credentials.clientSecret
    redirectUri = getMPRedirectUri()
  } catch (e) {
    throw new MPOAuthError(
      'missing_config',
      e instanceof Error ? e.message : 'Configuracion OAuth MP incompleta.',
      { cause: e },
    )
  }

  return postOAuthToken({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    test_token: getMPEnv() === 'sandbox' ? 'true' : 'false',
  })
}

export async function refreshOAuthToken(refreshToken: string): Promise<MPOAuthTokenResponse> {
  let clientId: string
  let clientSecret: string
  try {
    const credentials = getMPClientCredentials()
    clientId = credentials.clientId
    clientSecret = credentials.clientSecret
  } catch (e) {
    throw new MPOAuthError(
      'missing_config',
      e instanceof Error ? e.message : 'Configuracion OAuth MP incompleta.',
      { cause: e },
    )
  }

  return postOAuthToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}
