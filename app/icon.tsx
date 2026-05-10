import { ImageResponse } from 'next/og'

// Favicon programático — flat, sin gradients ni sombras.
// "Sy" blanco bold sobre violeta sólido de marca (#5b4cff).
// Next.js usa este archivo automáticamente como /icon (favicon).

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
          fontSize: 17,
          fontWeight: 700,
          borderRadius: 7,
          letterSpacing: '-0.04em',
        }}
      >
        Sy
      </div>
    ),
    size,
  )
}
