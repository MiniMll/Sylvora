// Configuración centralizada de Mercado Pago.
//
// Lee env vars, las valida al startup, y expone constantes derivadas
// (URLs, timeouts, TTLs). Si falta alguna var crítica, los getters
// tiran error explícito — preferimos "fail loud al primer uso" antes
// que "endpoint OAuth devuelve 500 silencioso porque CLIENT_SECRET
// era undefined".
//
// SERVER-ONLY. Ninguna var lleva NEXT_PUBLIC_, así que Next.js no
// incluye este módulo en el bundle del cliente. Igual: no importar
// desde components 'use client'.

/** Entornos soportados. La URL base de la API MP es la misma para
 *  los dos — el flag se usa para logs verbose, safety checks de
 *  monto, y deshabilitar features riesgosas en sandbox. */
export type MPEnv = 'sandbox' | 'production'

/** Resuelve MP_ENV con default defensivo a 'sandbox'. */
export function getMPEnv(): MPEnv {
  const raw = process.env.MP_ENV?.toLowerCase().trim()
  if (raw === 'production') return 'production'
  // Cualquier otro valor (incluido vacío, 'sandbox', typos) → sandbox.
  return 'sandbox'
}

/** Helper genérico: lee una var requerida y tira con mensaje claro
 *  si falta. Usado por todos los getters de credenciales MP. */
function requireEnv(name: string, hint?: string): string {
  const v = process.env[name]
  if (!v || v.trim() === '') {
    throw new Error(
      `[mp/config] ${name} no está definida. ` +
      (hint ?? `Agregala a .env.local (ver .env.example).`)
    )
  }
  return v.trim()
}

/** Credenciales de la app de Sylvora en MP developers. */
export function getMPClientCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: requireEnv(
      'SYLVORA_MP_CLIENT_ID',
      'Crear la app en https://www.mercadopago.com.ar/developers → Tus integraciones.',
    ),
    clientSecret: requireEnv(
      'SYLVORA_MP_CLIENT_SECRET',
      'Visible en el detalle de la app en MP developers después de crearla.',
    ),
  }
}

/** Redirect URI registrada en MP. Debe matchear exacto. */
export function getMPRedirectUri(): string {
  return requireEnv(
    'SYLVORA_MP_REDIRECT_URI',
    'Ej. http://localhost:3000/api/mp/oauth/callback (dev) o el dominio prod.',
  )
}

/** Secret HMAC para validar webhooks. */
export function getMPWebhookSecret(): string {
  return requireEnv(
    'SYLVORA_MP_WEBHOOK_SECRET',
    'Configurar en MP developers → tu app → Notificaciones → Webhooks.',
  )
}

/** URL absoluta donde MP debe enviar notificaciones para cobros QR.
 *  Opcional: en QR Orders se manda en notification_url al crear la
 *  Order. En previews puede incluir x-vercel-protection-bypass. */
export function getMPWebhookUrl(): string | null {
  const raw = process.env.SYLVORA_MP_WEBHOOK_URL?.trim()
  return raw && raw.length > 0 ? raw : null
}

/** Clave base64 de 32 bytes para AES-256-GCM. */
export function getMPTokenEncryptionKey(): string {
  return requireEnv(
    'SYLVORA_MP_TOKEN_ENCRYPTION_KEY',
    'Generar con: openssl rand -base64 32',
  )
}

// ────────────────────────────────────────────────────────────────────
// Constantes derivadas
// ────────────────────────────────────────────────────────────────────

/** Base URL de la API MP. Misma para sandbox y prod — MP distingue
 *  por credenciales, no por URL. */
export const MP_API_BASE = 'https://api.mercadopago.com'

/** Base URL del flow OAuth (authorization endpoint). */
export const MP_OAUTH_AUTHORIZE_URL = 'https://auth.mercadopago.com.ar/authorization'

/** Endpoint para intercambiar el code por tokens. */
export const MP_OAUTH_TOKEN_URL = `${MP_API_BASE}/oauth/token`

/** TTL del intento de cobro QR. Pasado este lapso, el intento se
 *  considera expirado (lazy: se marca al hacer lookup). Coordinado
 *  con la columna expira_en en intentos_cobro_mp. */
export const MP_INTENTO_TTL_MS = 10 * 60 * 1000   // 10 minutos

/** Margen para refrescar el access_token de un comerciante. Si está
 *  más cerca de expirar que esto, lo refrescamos antes de usarlo. */
export const MP_TOKEN_REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000   // 7 días

/** Timeout de requests a la API MP. Más laxo que el default fetch
 *  porque la API a veces lentea durante picos. */
export const MP_API_TIMEOUT_MS = 15_000

/** Polling del frontend POS para el estado del intento. Failsafe
 *  del webhook + de Supabase Realtime. */
export const MP_POLL_INTERVAL_MS = 2_000

/** Safety check: monto máximo permitido en sandbox para evitar
 *  errores costosos si un dev pega producción por error. En prod
 *  se ignora. */
export const MP_SANDBOX_MAX_AMOUNT = 100_000   // pesos

/** Para distinguir logs y telemetría según entorno. */
export function isMPSandbox(): boolean {
  return getMPEnv() === 'sandbox'
}
