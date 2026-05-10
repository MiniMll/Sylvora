import { ImageResponse } from 'next/og'

// OG image generada por Next.js (sin asset estático). Se sirve en
// /opengraph-image y la usa el meta og:image automáticamente.
// Estilo: split izquierda (brand) / derecha (mockup de dashboard),
// fondo cálido --bg, sin gradients exagerados, sin estilo crypto.

export const alt = 'Sylvora — Punto de venta y control de stock'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#f5f4f0',
          display: 'flex',
          alignItems: 'center',
          padding: '80px',
          fontFamily: 'sans-serif',
          gap: 80,
        }}
      >
        {/* Columna izquierda: brand */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Logo Sy */}
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 20,
              background: '#5b4cff',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: '-0.05em',
              marginBottom: 40,
            }}
          >
            Sy
          </div>

          {/* Título */}
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              color: '#0e0e13',
              letterSpacing: '-0.04em',
              lineHeight: 1,
              marginBottom: 20,
            }}
          >
            Sylvora
          </div>

          {/* Subtítulo */}
          <div
            style={{
              fontSize: 30,
              color: '#6b6b72',
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
              maxWidth: 460,
            }}
          >
            Punto de venta y control de stock
          </div>
        </div>

        {/* Columna derecha: mockup de dashboard card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, maxWidth: 460 }}>
          {/* KPI card principal */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 18,
              padding: 28,
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: '#5b4cff',
              }}
            />
            <div
              style={{
                fontSize: 15,
                color: '#6b6b72',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              Ventas hoy
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: '#0e0e13',
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              $48.250
            </div>
            <div
              style={{
                fontSize: 17,
                color: '#6b6b72',
                marginTop: 10,
              }}
            >
              23 transacciones
            </div>
          </div>

          {/* Card secundario: stock alert */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '18px 22px',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ff4757',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#0e0e13' }}>
                Stock crítico
              </div>
              <div style={{ fontSize: 14, color: '#6b6b72', marginTop: 2 }}>
                3 productos por reponer
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
