import { FAQS } from './data/faqs'

// Structured data (schema.org JSON-LD) para la landing.
//
// Emite TRES <script type="application/ld+json">:
//   1. Organization — quién es Sylvora.
//   2. SoftwareApplication — la app en sí (categoría, OS, precio).
//   3. FAQPage — las preguntas frecuentes con sus respuestas.
//
// Por qué tres separados en lugar de un @graph único: Google los
// procesa independientemente y la rich-result preview de FAQ no
// depende de las otras dos siendo válidas. Aislamos el riesgo.
//
// Server component — emite HTML estático, cero JS al cliente.

interface JsonLdProps {
  /** URL pública del sitio. Idealmente process.env.NEXT_PUBLIC_APP_URL. */
  siteUrl: string
}

export function JsonLd({ siteUrl }: JsonLdProps) {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Sylvora',
    url: siteUrl,
    logo: `${siteUrl}/brand/sylvora-mark.png`,
    description:
      'Punto de venta y control de stock para kioscos, almacenes y minimarkets. Hecho en Argentina.',
    areaServed: 'AR',
  }

  const softwareApplication = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Sylvora',
    operatingSystem: 'Web, Android, iOS',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'PointOfSaleApplication',
    description:
      'Cobrá, controlá stock y cerrá tu caja desde el celular. Hecho para kioscos, almacenes y minimarkets argentinos.',
    url: siteUrl,
    inLanguage: 'es-AR',
    offers: {
      '@type': 'Offer',
      price: '20000',
      priceCurrency: 'ARS',
      // 30 días de trial gratis antes del cobro mensual.
      // Schema.org no tiene un campo "trial" nativo — lo señalamos
      // en `description` del Offer.
      description: '30 días gratis, sin tarjeta de crédito. Después AR$20.000/mes.',
      availability: 'https://schema.org/InStock',
    },
    // aggregateRating: lo agregamos cuando tengamos reseñas reales.
    // Mentir acá = penalización SEO de Google.
  }

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((qa) => ({
      '@type': 'Question',
      name: qa.pregunta,
      acceptedAnswer: {
        '@type': 'Answer',
        text: qa.respuesta,
      },
    })),
  }

  // dangerouslySetInnerHTML es la forma canónica de emitir JSON-LD
  // en React — el alternativo es {JSON.stringify(...)} pero ese
  // escapa caracteres y rompe el parseo de Google en algunos casos.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
    </>
  )
}
