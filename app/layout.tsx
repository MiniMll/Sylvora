import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

// URL pública del deploy. Sirve para resolver URLs absolutas en OG
// images, manifest y twitter cards. En dev cae a localhost (Next
// igual emite warning si está sin setear).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Sylvora',
    template: '%s · Sylvora',
  },
  description: 'Punto de venta y control de stock para comercios.',
  applicationName: 'Sylvora',
  keywords: ['POS', 'punto de venta', 'stock', 'inventario', 'comercio', 'caja', 'Argentina'],
  authors: [{ name: 'Sylvora' }],
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: APP_URL,
    siteName: 'Sylvora',
    title: 'Sylvora',
    description: 'Punto de venta y control de stock para comercios.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Sylvora — Punto de venta y control de stock',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sylvora',
    description: 'Punto de venta y control de stock para comercios.',
    images: ['/opengraph-image'],
  },
  icons: {
    icon: '/icon',
    apple: '/apple-icon',
  },
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#5b4cff',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { fontFamily: 'DM Sans, sans-serif', fontSize: 13, borderRadius: 12 },
          }}
        />
      </body>
    </html>
  )
}
