// instrumentation.ts — hook de arranque de Next.js (register()).
// Corre una vez al iniciar el server, ANTES de recibir tráfico.
//
// Uso: guard fail-loud de la config de Mercado Pago en producción (M1).
// Si MP_ENV=production tiene una combinación insegura (manual_sandbox,
// bypass de firma, MP_SANDBOX_* presentes) o le falta una variable
// obligatoria, abortamos el arranque con un mensaje claro en vez de
// descubrir la mala config cuando llega el primer cobro/webhook.
//
// Solo corre en el runtime nodejs (donde viven las env server-only); en
// el runtime edge (middleware) es no-op.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertMPProductionConfig } = await import('@/lib/mp/config')
  assertMPProductionConfig()
}
