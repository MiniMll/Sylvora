import { ImageResponse } from 'next/og'

// Apple touch icon (180×180). Lo usa iOS para "Agregar a pantalla
// de inicio" y también queda referenciado en el manifest para PWA.
// Versión wordmark prototype: "s" minúscula bold blanca sobre
// violeta brand, mismo lockup que el favicon escalado.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          fontSize: 130,
          fontWeight: 800,
          borderRadius: 38,
          letterSpacing: '-0.05em',
          paddingBottom: 14,
        }}
      >
        s
      </div>
    ),
    size,
  )
}
