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

/** URL absoluta del webhook MP para flows que la soporten.
 *  Nota: /v1/orders QR no acepta notification_url en este schema;
 *  esos cobros se reconcilian por polling de Orders. */
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
export const MP_OAUTH_AUTHORIZE_URL = 'https://auth.mercadopago.com/authorization'

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

/** Monto mínimo operativo para cobros MP QR en ARS. MP rechaza montos
 *  muy bajos; validamos antes de crear intentos para dar UX clara. */
export const MP_MIN_AMOUNT_ARS = 15

/** Umbral para considerar "huérfano silencioso" a un intento aprobado
 *  sin venta asociada: si pasaron más de estos ms desde pagado_en y
 *  venta_id sigue NULL, el cajero nunca completó crear_venta (cerró
 *  el navegador, se cortó la luz, el marcado a revisión falló). El
 *  lazy-promote de GET /api/mp/revision lo pasa a requiere_revision.
 *  Decisión de producto aprobada: 15 minutos. */
export const MP_HUERFANO_UMBRAL_MS = 15 * 60 * 1000

/** Safety check: monto máximo permitido en sandbox para evitar
 *  errores costosos si un dev pega producción por error. En prod
 *  se ignora. */
export const MP_SANDBOX_MAX_AMOUNT = 100_000   // pesos

/** Para distinguir logs y telemetría según entorno. */
export function isMPSandbox(): boolean {
  return getMPEnv() === 'sandbox'
}

// ────────────────────────────────────────────────────────────────────
// Guard de arranque para producción (M1)
// ────────────────────────────────────────────────────────────────────

/** Variables de sandbox que NUNCA deben estar presentes en producción. */
const MP_SANDBOX_ENV_VARS = [
  'MP_SANDBOX_ACCESS_TOKEN',
  'MP_SANDBOX_USER_ID_MP',
  'MP_SANDBOX_EXTERNAL_POS_ID',
  'MP_SANDBOX_COMERCIO_ID',
] as const

/** Variables obligatorias cuando MP_ENV=production (OAuth real + webhook). */
const MP_REQUIRED_PROD_ENV_VARS = [
  'SYLVORA_MP_CLIENT_ID',
  'SYLVORA_MP_CLIENT_SECRET',
  'SYLVORA_MP_REDIRECT_URI',
  'SYLVORA_MP_WEBHOOK_SECRET',
  'SYLVORA_MP_TOKEN_ENCRYPTION_KEY',
] as const

function envPresente(name: string): boolean {
  return (process.env[name]?.trim() ?? '') !== ''
}

/**
 * Guard fail-loud de arranque (hallazgo M1). Con MP_ENV=production, aborta
 * INMEDIATAMENTE si detecta una combinación insegura de configuración de MP
 * o falta una variable obligatoria — en vez de descubrir la mala config
 * cuando llega el primer cobro/webhook.
 *
 * Reúne TODOS los problemas en un solo mensaje (no corta en el primero) para
 * que se puedan corregir de una. En MP_ENV != production es no-op (sandbox/dev
 * pueden tener config parcial o de sandbox a propósito).
 *
 * Se invoca desde instrumentation.ts (register) al iniciar el server. Los
 * hard-guards runtime (token-provider, webhook-handler) siguen ahí como
 * defensa en profundidad — esto es la primera línea, no la única.
 *
 * @throws Error con el detalle de cada problema si la config es inválida.
 */
export function assertMPProductionConfig(): void {
  if (getMPEnv() !== 'production') return

  const problemas: string[] = []

  if (process.env.MP_MODE?.toLowerCase().trim() === 'manual_sandbox') {
    problemas.push('MP_MODE=manual_sandbox está prohibido en producción — usá oauth (o dejala sin setear).')
  }

  if (process.env.MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX?.toLowerCase().trim() === 'true') {
    problemas.push('MP_WEBHOOK_ALLOW_UNSIGNED_SANDBOX no puede estar activo en producción — quitala del entorno.')
  }

  const sandboxPresentes = MP_SANDBOX_ENV_VARS.filter(envPresente)
  if (sandboxPresentes.length > 0) {
    problemas.push(`Variables de sandbox presentes en producción: ${sandboxPresentes.join(', ')} — quitalas del scope Production.`)
  }

  const faltantes = MP_REQUIRED_PROD_ENV_VARS.filter(v => !envPresente(v))
  if (faltantes.length > 0) {
    problemas.push(`Faltan variables obligatorias de producción: ${faltantes.join(', ')}.`)
  }

  if (problemas.length > 0) {
    throw new Error(
      '[mp/config] Configuración de Mercado Pago inválida para producción (MP_ENV=production):\n' +
      problemas.map(p => `  - ${p}`).join('\n') +
      '\nCorregí el entorno antes de deployar. Ver docs/mp-checklist-produccion.md §7.',
    )
  }
}
