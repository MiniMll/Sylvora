import type { MetadataRoute } from 'next'

// Manifest PWA. Permite "Agregar a pantalla de inicio" en tablets
// usadas como POS. Next.js sirve esto en /manifest.webmanifest y
// lo enlaza desde el <head> automáticamente.
//
// Decisiones:
//  - display: standalone → la app se ve como nativa (sin URL bar).
//  - start_url: /dashboard porque /login redirige según auth y el
//    cajero arranca en dashboard.
//  - orientation: any → tablets horizontales y celulares verticales.
//  - background_color cálido para el splash, theme_color violeta
//    para la status bar.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sylvora',
    short_name: 'Sylvora',
    description: 'Punto de venta y control de stock para comercios.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f5f4f0',
    theme_color: '#5b4cff',
    orientation: 'any',
    lang: 'es-AR',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      { src: '/brand/sylvora-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/brand/sylvora-mark.png', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
