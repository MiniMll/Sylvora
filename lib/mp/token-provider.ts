// Token provider — decide DE DÓNDE viene el access_token del seller
// para una operación MP, sin que el call site sepa si fue OAuth o
// un token manual de sandbox.
//
// Dos modos (MP_MODE env):
//   - 'oauth' (default, producción): lee de mp_credenciales del
//     comercio. Falla si el comercio no conectó MP.
//   - 'manual_sandbox' (temporal, preview/dev): lee MP_SANDBOX_* del env.
//     HARD-BLOCKED en MP_ENV=production.
//
// Diseñado para que cuando OAuth real funcione, basta con borrar el
// modo 'manual_sandbox' y las 4 envs de sandbox — el resto del código
// no se entera. El api-client y los endpoints siempre reciben un
// MPTokenResolution con accessToken + userIdMp + externalPosId,
// agnóstico al origen.
//
// SERVER-ONLY. Lee env vars sensibles. No importar desde 'use client'.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getMPEnv, MP_TOKEN_REFRESH_MARGIN_MS } from './config'
import { refreshOAuthToken, MPOAuthError } from './oauth'
import {
  actualizarCredenciales,
  obtenerCredencialesPorComercio,
} from '@/lib/supabase/mp'
import { getServiceClient } from '@/lib/supabase/server-admin'

// ════════════════════════════════════════════════════════════════════
// Tipos
// ════════════════════════════════════════════════════════════════════

export type MPMode = 'oauth' | 'manual_sandbox'

export interface MPTokenResolution {
  /** Bearer token plaintext del seller. Tratar como secret. */
  accessToken: string
  /** Seller id MP — match con webhook.user_id. */
  userIdMp: number
  /** External id del POS para Orders API config.qr. */
  externalPosId: string
  /** Origen del token. Útil para logs y decidir si refrescar
   *  (manual_sandbox NO se refresca). */
  source: MPMode
}

export interface ResolveAccessTokenOptions {
  comercioId: string
  /** Cliente Supabase con cookie del caller (modo oauth) o service
   *  (si lo llama el webhook handler, aunque típico es que el webhook
   *  use obtenerCredencialesPorUserIdMp directo y no pase por acá). */
  supabase: SupabaseClient
  supabaseService?: SupabaseClient
  /** Override del modo. Si no se pasa, lee MP_MODE del env. */
  mode?: MPMode
}

// ════════════════════════════════════════════════════════════════════
// Error tipado
// ════════════════════════════════════════════════════════════════════
//
// Una sola clase para que el call site discrimine por code:
//   - 'no_credentials' → el comercio no completó OAuth (modo oauth).
//   - 'mode_blocked'   → manual_sandbox bloqueado en production.
//   - 'comercio_mismatch' → manual_sandbox solo aplica al comercio
//                           configurado en env.
//   - 'missing_env'    → falta alguna MP_SANDBOX_*.
//   - 'invalid_mode'   → MP_MODE con valor desconocido.

export type MPTokenProviderErrorCode =
  | 'no_credentials'
  | 'mp_reconnect_required'
  | 'mode_blocked'
  | 'comercio_mismatch'
  | 'missing_env'
  | 'invalid_mode'

export class MPTokenProviderError extends Error {
  readonly code: MPTokenProviderErrorCode
  constructor(code: MPTokenProviderErrorCode, message: string) {
    super(message)
    this.name = 'MPTokenProviderError'
    this.code = code
  }
}

function tokenProviderLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify({
    level,
    component: 'mp/token-provider',
    event,
    ...fields,
  }))
}

// ════════════════════════════════════════════════════════════════════
// Resolución del modo
// ════════════════════════════════════════════════════════════════════

/** Lee MP_MODE del env con default 'oauth' y valida que sea uno de
 *  los dos válidos. Default conservador: cualquier valor inesperado
 *  cae en error explícito en vez de "asumir sandbox" silencioso. */
export function getMPMode(): MPMode {
  const raw = process.env.MP_MODE?.toLowerCase().trim()
  if (!raw || raw === 'oauth') return 'oauth'
  if (raw === 'manual_sandbox') return 'manual_sandbox'
  throw new MPTokenProviderError(
    'invalid_mode',
    `MP_MODE inválido: "${raw}". Valores aceptados: 'oauth' (default) o 'manual_sandbox'.`,
  )
}

// ════════════════════════════════════════════════════════════════════
// Modo manual_sandbox — env + guards
// ════════════════════════════════════════════════════════════════════

function requireSandboxEnv(name: string): string {
  const v = process.env[name]
  if (!v || v.trim() === '') {
    throw new MPTokenProviderError(
      'missing_env',
      `${name} no está definida. El modo manual_sandbox requiere ` +
      `MP_SANDBOX_ACCESS_TOKEN, MP_SANDBOX_USER_ID_MP, ` +
      `MP_SANDBOX_EXTERNAL_POS_ID y MP_SANDBOX_COMERCIO_ID. Ver .env.example.`,
    )
  }
  return v.trim()
}

function resolveManualSandbox(comercioId: string): MPTokenResolution {
  // Guard 1: producción NUNCA acepta manual_sandbox, ni siquiera si
  // las 4 envs están seteadas. Defensa en profundidad contra "se
  // coló a prod por accidente".
  if (getMPEnv() === 'production') {
    throw new MPTokenProviderError(
      'mode_blocked',
      'MP_MODE=manual_sandbox no está permitido en MP_ENV=production. ' +
      'Si la conexión OAuth real no funciona, hay que arreglarla — no ' +
      'usar el token manual en prod.',
    )
  }

  // Guard 2: validar todas las envs juntas. Errores claros por var
  // faltante, sin un fallback parcial.
  const accessToken = requireSandboxEnv('MP_SANDBOX_ACCESS_TOKEN')
  const userIdRaw = requireSandboxEnv('MP_SANDBOX_USER_ID_MP')
  const externalPosId = requireSandboxEnv('MP_SANDBOX_EXTERNAL_POS_ID')
  const expectedComercioId = requireSandboxEnv('MP_SANDBOX_COMERCIO_ID')

  const userIdMp = Number(userIdRaw)
  if (!Number.isFinite(userIdMp) || userIdMp <= 0 || !Number.isInteger(userIdMp)) {
    throw new MPTokenProviderError(
      'missing_env',
      `MP_SANDBOX_USER_ID_MP debe ser un entero positivo. Got: "${userIdRaw}".`,
    )
  }

  // Guard 3: el token manual solo aplica al comercio configurado en
  // env. En previews multi-comercio, esto evita que un cobro de otro
  // comercio termine cobrándose con la cuenta MP del test.
  if (comercioId !== expectedComercioId) {
    throw new MPTokenProviderError(
      'comercio_mismatch',
      `Modo manual_sandbox: el token solo está habilitado para ` +
      `MP_SANDBOX_COMERCIO_ID. Comercio recibido no matchea — operación bloqueada.`,
    )
  }

  // Warn estructurado cada vez que se usa, así si el modo quedó
  // activado por error en preview / staging, queda visible. NUNCA
  // logueamos el token ni siquiera enmascarado.
  console.warn(JSON.stringify({
    level: 'warn',
    component: 'mp/token-provider',
    event: 'manual_sandbox_used',
    comercioId,
    userIdMp,
    externalPosId,
    note: 'token manual de sandbox — DEV/TEMPORAL, no debe estar activo en prod',
  }))

  return {
    accessToken,
    userIdMp,
    externalPosId,
    source: 'manual_sandbox',
  }
}

// ════════════════════════════════════════════════════════════════════
// Modo oauth — lee de mp_credenciales
// ════════════════════════════════════════════════════════════════════

async function resolveOAuth(
  comercioId: string,
  supabaseService: SupabaseClient,
): Promise<MPTokenResolution> {
  const cred = await obtenerCredencialesPorComercio(supabaseService, comercioId)
  if (!cred) {
    throw new MPTokenProviderError(
      'no_credentials',
      `El comercio no tiene MP conectado. El admin debe ir a ` +
      `Configuración → Mercado Pago y completar el OAuth.`,
    )
  }
  const expiraMs = new Date(cred.expira_en).getTime()
  const shouldRefresh =
    !Number.isFinite(expiraMs) ||
    expiraMs - Date.now() <= MP_TOKEN_REFRESH_MARGIN_MS

  if (shouldRefresh) {
    tokenProviderLog('info', 'oauth_token_refresh_start', {
      comercioId,
      userIdMp: cred.user_id_mp,
      expiraEn: cred.expira_en,
    })

    try {
      const refreshed = await refreshOAuthToken(cred.refresh_token)
      const expiraEn = new Date(Date.now() + refreshed.expires_in * 1000)

      await actualizarCredenciales(supabaseService, comercioId, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expira_en: expiraEn,
        public_key: refreshed.public_key,
      })

      tokenProviderLog('info', 'oauth_token_refresh_success', {
        comercioId,
        userIdMp: refreshed.user_id,
        expiraEn: expiraEn.toISOString(),
      })

      return {
        accessToken: refreshed.access_token,
        userIdMp: refreshed.user_id,
        externalPosId: cred.external_pos_id,
        source: 'oauth',
      }
    } catch (e) {
      tokenProviderLog('warn', 'oauth_token_refresh_failed', {
        comercioId,
        userIdMp: cred.user_id_mp,
        errorName: e instanceof Error ? e.name : 'unknown',
        code: e instanceof MPOAuthError ? e.code : null,
        status: e instanceof MPOAuthError ? e.status : null,
      })
      throw new MPTokenProviderError(
        'mp_reconnect_required',
        'Mercado Pago necesita reconectarse. Pedile al administrador que vuelva a conectar la cuenta.',
      )
    }
  }

  return {
    accessToken: cred.access_token,
    userIdMp: cred.user_id_mp,
    externalPosId: cred.external_pos_id,
    source: 'oauth',
  }
}

// ════════════════════════════════════════════════════════════════════
// API pública
// ════════════════════════════════════════════════════════════════════

/**
 * Resuelve el access_token a usar para una operación MP.
 *
 * El call site no debería conocer el modo — solo pide el token y se
 * lo damos. El resultado incluye también user_id_mp y external_pos_id
 * porque los endpoints de cobro los necesitan en el mismo lugar.
 *
 * @throws MPTokenProviderError con codes específicos para que el
 *   call site decida UX (mostrar "conectá MP" vs "error interno").
 */
export async function resolveAccessToken(
  opts: ResolveAccessTokenOptions,
): Promise<MPTokenResolution> {
  if (!opts.comercioId || typeof opts.comercioId !== 'string') {
    throw new MPTokenProviderError(
      'no_credentials',
      'comercioId requerido para resolver el access_token.',
    )
  }
  const mode = opts.mode ?? getMPMode()
  if (mode === 'manual_sandbox') {
    return resolveManualSandbox(opts.comercioId)
  }
  return resolveOAuth(opts.comercioId, opts.supabaseService ?? getServiceClient())
}
