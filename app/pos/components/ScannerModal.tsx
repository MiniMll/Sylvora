'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { X, Volume2, VolumeX, Keyboard, AlertCircle, Camera, Lightbulb, ExternalLink } from 'lucide-react'
import { useScannerCamara } from '@/lib/scanner/useScannerCamara'
import { isScannerMuted, setScannerMuted } from '@/lib/scanner/audio'
import { esWebviewSocial } from '@/lib/scanner/webview'
import { isHintSeen, markHintSeen } from '@/lib/oneTimeHint'

const HINT_KEY = 'scanner-pos-first-use'

// Modal del scanner por cámara. Diseñado standalone (no reusa Modal
// genérico) porque tiene requisitos específicos:
//   - Fullscreen en mobile (el video necesita espacio para que el
//     cajero apunte cómodo). Modal genérico maxWidth=640 quedaba
//     chico en pantallas verticales.
//   - Botón X SIEMPRE accesible — incluso durante el estado 'denied'
//     o 'error' el cajero tiene que poder salir.
//   - Overlay de guía visual sobre el video sin que el botón X u
//     otros controles queden tapados por el stream.
//   - Cleanup de cámara garantizado al cerrar (delegado al hook
//     vía active=false).
//
// La detección la maneja useScannerCamara — este componente solo es
// la presentación + integración con el callback onScan del padre.
//
// Body scroll lock + Escape key + focus restore: mismos comportamientos
// que el Modal genérico. Replicados inline porque son ~10 líneas y
// extender el genérico para soportar fullscreen complicaba más de lo
// que evitaba.

interface ScannerModalProps {
  open: boolean
  onClose: () => void
  /** Callback con el código detectado (cámara o tipeado manualmente).
   *  El padre decide qué hacer (lookup, beep, agregar al carrito). */
  onCodigo: (codigo: string) => void
}

// Mute toggle reactivo entre tabs y entre la propia tab. Reusamos
// el patrón useSyncExternalStore que ya usamos para useDismissibleToday.
function subscribeMute(notify: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', notify)
  return () => window.removeEventListener('storage', notify)
}

export function ScannerModal({ open, onClose, onCodigo }: ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [codigoManual, setCodigoManual] = useState('')
  const [modoManual, setModoManual] = useState(false)
  // Hint "primera vez" — se muestra encima del video la primera vez
  // que el cajero abre el modal. localStorage permanente: una vez
  // marcado como visto, no vuelve a aparecer.
  const [mostrarHint, setMostrarHint] = useState(false)
  // Detección de webview de apps sociales — si la cámara falla en
  // ese contexto, mostramos un mensaje accionable ("abrí en Chrome")
  // en lugar del genérico.
  const [enWebview, setEnWebview] = useState(false)

  const muted = useSyncExternalStore(
    subscribeMute,
    isScannerMuted,
    () => false, // SSR: asumimos no muteado
  )

  const toggleMute = useCallback(() => {
    setScannerMuted(!muted)
    // Dispatch local para forzar re-render en esta tab (storage event
    // solo se dispara cross-tab por default).
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage'))
    }
  }, [muted])

  // El hook maneja todo el lifecycle. active=open hace que cuando el
  // modal se cierra (open=false) se dispare el cleanup completo
  // (stream tracks stop, detector dispose, interval clear).
  const { status, errorMsg } = useScannerCamara({
    videoRef,
    onScan: onCodigo,
    active: open && !modoManual,
  })

  // Escape key para cerrar.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Body scroll lock + focus restore.
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open])

  // Reset estado al cerrar (sino abrir el modal nuevamente lo deja
  // en modoManual=true si la última vez quedó así). Es una transición
  // discreta al cerrar — no es "syncing state to props" del anti-pattern
  // que la regla intenta evitar.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModoManual(false)
      setCodigoManual('')
    }
  }, [open])

  // Inicialización al abrir: chequear hint + webview. Solo cuando
  // open transiciona a true para no re-leer localStorage en cada render.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMostrarHint(!isHintSeen(HINT_KEY))
    setEnWebview(esWebviewSocial())
  }, [open])

  const cerrarHint = useCallback(() => {
    markHintSeen(HINT_KEY)
    setMostrarHint(false)
  }, [])

  const enviarManual = useCallback(() => {
    const trim = codigoManual.trim()
    if (!trim) return
    onCodigo(trim)
    setCodigoManual('')
  }, [codigoManual, onCodigo])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Fullscreen en mobile, padding razonable en desktop.
        padding: 0,
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Escanear código de barras"
        // data-modal-card hace que el refocus del input del POSSearch
        // detecte que hay un modal abierto y no robe el foco mientras
        // el cajero está en el flow del scanner.
        data-modal-card
        className="scanner-modal-card"
        style={{
          background: '#0a0a0e',
          color: '#fff',
          width: '100%',
          height: '100%',
          maxWidth: 600,
          maxHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {/* Header: título + mute + close. Siempre visible, fondo
            sólido para no perderse sobre el video. */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '12px 16px',
            background: '#0a0a0e',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
            zIndex: 2,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Camera size={15} strokeWidth={2.2} />
            Escanear código
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={toggleMute}
              aria-label={muted ? 'Activar sonido' : 'Silenciar'}
              title={muted ? 'Activar sonido' : 'Silenciar'}
              style={iconBtnStyle}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={iconBtnStyle}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Cuerpo principal — video preview o estado alternativo. */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0e' }}>
          {!modoManual && status !== 'denied' && status !== 'unsupported' && status !== 'error' && (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  background: '#000',
                }}
              />

              {/* Overlay guía — rectángulo central translúcido +
                  esquinas. Sin esto el cajero no sabe dónde apuntar. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    width: 'min(80%, 320px)',
                    aspectRatio: '4 / 3',
                    border: '2px solid rgba(255,255,255,0.6)',
                    borderRadius: 14,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                  }}
                />
              </div>

              {/* Loading state — superpuesto al video mientras starting. */}
              {status === 'starting' && (
                <div style={overlayCenterStyle}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                    Iniciando cámara…
                  </div>
                </div>
              )}

              {/* Hint primera vez — chip flotante arriba sobre el video.
                  Se cierra al tocar el botón "Entendido". */}
              {mostrarHint && status === 'scanning' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 14,
                    left: 14,
                    right: 14,
                    background: 'rgba(0,0,0,0.78)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    zIndex: 3,
                  }}
                >
                  <Lightbulb size={16} color="#ffd84a" strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'rgba(255,255,255,0.92)', lineHeight: 1.45 }}>
                    Apuntá al código de barras del producto y mantené firme.
                    Si no detecta, acercá un poco más o mejorá la luz.
                  </div>
                  <button
                    onClick={cerrarHint}
                    aria-label="Cerrar hint"
                    style={{
                      flexShrink: 0,
                      background: 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 7,
                      padding: '5px 10px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    Entendido
                  </button>
                </div>
              )}
            </>
          )}

          {/* Permiso denegado o error genérico, modificado si estamos
              en un webview social (Instagram/FB/WhatsApp/etc.) — en
              ese caso el mensaje accionable es "abrí en Chrome",
              no "habilitá permisos". */}
          {(status === 'denied' || status === 'error' || status === 'unsupported') && (
            <div style={errorPanelStyle}>
              <AlertCircle size={32} color="#ff6b35" strokeWidth={2} />
              {enWebview ? (
                <>
                  <h3 style={errorTitleStyle}>Abrí Sylvora en tu navegador</h3>
                  <p style={errorTextStyle}>
                    Estás viendo Sylvora desde una app (Instagram, WhatsApp,
                    Facebook…). Esas vistas no permiten usar la cámara. Tocá
                    los tres puntos arriba y elegí <b>&quot;Abrir en Chrome&quot;</b>
                    {' '}o <b>&quot;Abrir en Safari&quot;</b>.
                  </p>
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...primaryBtnStyle, textDecoration: 'none' }}
                  >
                    <ExternalLink size={14} /> Abrir en otra app
                  </a>
                  <button onClick={() => setModoManual(true)} style={ghostBtnStyle}>
                    <Keyboard size={13} /> Ingresar código a mano
                  </button>
                </>
              ) : status === 'denied' ? (
                <>
                  <h3 style={errorTitleStyle}>Cámara bloqueada</h3>
                  <p style={errorTextStyle}>
                    Diste &quot;No permitir&quot; cuando te pidieron acceso a la cámara.
                    Para activarla, abrí los permisos del sitio en tu navegador y
                    cambiá &quot;Cámara&quot; a Permitir.
                  </p>
                  <button onClick={() => setModoManual(true)} style={primaryBtnStyle}>
                    <Keyboard size={14} /> Ingresar código a mano
                  </button>
                </>
              ) : status === 'unsupported' ? (
                <>
                  <h3 style={errorTitleStyle}>Cámara no disponible</h3>
                  <p style={errorTextStyle}>
                    Este navegador no permite usar la cámara. Probá con Chrome
                    en Android o Safari en iPhone, o ingresá el código a mano.
                  </p>
                  <button onClick={() => setModoManual(true)} style={primaryBtnStyle}>
                    <Keyboard size={14} /> Ingresar código a mano
                  </button>
                </>
              ) : (
                <>
                  <h3 style={errorTitleStyle}>No pudimos abrir la cámara</h3>
                  <p style={errorTextStyle}>
                    {errorMsg ?? 'Probá cerrar otras apps que la usen y volvé a intentar.'}
                  </p>
                  <button onClick={() => setModoManual(true)} style={primaryBtnStyle}>
                    <Keyboard size={14} /> Ingresar código a mano
                  </button>
                </>
              )}
            </div>
          )}

          {/* Modo manual — input grande, fondo distinto al video.
              Se activa por el botón "Ingresar a mano" o por error. */}
          {modoManual && (
            <div style={errorPanelStyle}>
              <Keyboard size={28} color="#fff" strokeWidth={1.8} />
              <h3 style={errorTitleStyle}>Ingresar código</h3>
              <p style={errorTextStyle}>
                Escribí el código de barras del producto y presioná Enter.
              </p>
              <input
                value={codigoManual}
                onChange={e => setCodigoManual(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    enviarManual()
                  }
                }}
                autoFocus
                placeholder="Ej: 7790895000232"
                inputMode="numeric"
                style={{
                  width: '100%',
                  maxWidth: 320,
                  padding: '14px 16px',
                  fontSize: 18,
                  fontFamily: 'DM Mono, monospace',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 12,
                  color: '#fff',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={enviarManual} style={primaryBtnStyle} disabled={!codigoManual.trim()}>
                  Buscar producto
                </button>
                <button onClick={() => setModoManual(false)} style={ghostBtnStyle}>
                  Volver a la cámara
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer hint — solo visible mientras la cámara escanea.
            Le dice al cajero qué esperar sin acaparar la pantalla. */}
        {!modoManual && status === 'scanning' && (
          <footer
            style={{
              flexShrink: 0,
              padding: '12px 16px 16px',
              background: '#0a0a0e',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, marginBottom: 10 }}>
              Apuntá al código de barras del producto.
            </p>
            <button onClick={() => setModoManual(true)} style={ghostBtnStyle}>
              <Keyboard size={13} /> Ingresar código a mano
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

// ───── Estilos locales ──────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  width: 32, height: 32,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.08)',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
}

const overlayCenterStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.55)',
  pointerEvents: 'none',
}

const errorPanelStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  padding: '24px 28px',
  textAlign: 'center',
}

const errorTitleStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  margin: 0,
  color: '#fff',
  letterSpacing: '-0.01em',
}

const errorTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
  margin: 0,
  lineHeight: 1.5,
  maxWidth: 360,
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 18px',
  background: 'var(--ac)',
  color: '#fff',
  border: 'none',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
