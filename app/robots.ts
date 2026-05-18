import type { MetadataRoute } from 'next'

// robots.txt nativo de Next.js — sirve /robots.txt automáticamente.
//
// Política: indexamos la landing y nada más. Todo lo que está
// detrás de auth (rutas en RUTAS_PROTEGIDAS de proxy.ts) lo
// explicitamos como disallow para que ningún crawler las toque,
// aunque el proxy igual las redirige al login.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/pos',
        '/productos',
        '/stock',
        '/ventas',
        '/caja',
        '/reportes',
        '/exportar',
        '/precios',
        '/perfil',
        '/usuarios',
        '/api/',
      ],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
