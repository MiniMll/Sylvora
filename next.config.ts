import type { NextConfig } from "next"

// Headers de seguridad aplicados a todas las rutas.
// CSP queda fuera por ahora — requiere tunear hashes/nonces para
// los inline styles que usa el proyecto.
const securityHeaders = [
  // Forzar HTTPS por 2 años incl. subdominios. Lo lee el browser.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // No permitir embedding en iframes (anti-clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  // Anti MIME-sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // No exponer URL completa al hacer cross-origin.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // El POS usa cámara para scanner; el resto bloqueado.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  // Bloquear DNS prefetch agresivo.
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
