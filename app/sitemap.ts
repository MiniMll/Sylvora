import type { MetadataRoute } from 'next'

// Sitemap nativo de Next.js — genera /sitemap.xml automáticamente.
// Por ahora solo incluimos la landing pública. Las páginas internas
// (dashboard, pos, productos, etc.) están detrás de auth y no
// queremos que Google las indexe.
//
// Cuando agreguemos páginas públicas (blog, casos de uso, etc.)
// se suman al array.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: APP_URL,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
  ]
}
