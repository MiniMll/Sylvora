import { ImageResponse } from 'next/og'

// Favicon programático. Versión del prototipo wordmark:
// "s" minúscula bold blanca sobre violeta brand.
// Coherente con el nuevo lockup tipográfico (lowercase, tight
// letter-spacing) — el favicon es el "s" del wordmark, no
// iniciales separadas. Next.js lo usa automáticamente como /icon.

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#5b4cff',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Bumpeado a 24px para que la "s" ocupe el favicon con
          // peso visual. El cap-height de DM Sans 800 a 24px en un
          // canvas 32×32 deja ~4px de margen — bien centrado.
          fontSize: 24,
          fontWeight: 800,
          borderRadius: 7,
          letterSpacing: '-0.04em',
          paddingBottom: 2, // ajuste óptico — la baseline empuja
                            // la "s" 2px hacia arriba sin esto
        }}
      >
        s
      </div>
    ),
    size,
  )
}
