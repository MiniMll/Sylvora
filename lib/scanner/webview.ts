// Detección de webviews de apps sociales que tienen getUserMedia
// inestable o directamente bloqueado. La idea NO es bloquear el
// scanner — es darle al cajero un mensaje útil ("abrí en Chrome")
// cuando la cámara falla en uno de estos entornos.
//
// Importante: si el webview directamente no expone getUserMedia,
// getDetectorStrategy() ya devuelve 'none' y el botón "Escanear" no
// aparece. Este helper se usa para el caso "expone la API pero falla
// al pedir permiso", donde nuestro mensaje genérico de error no es
// suficientemente accionable.
//
// La detección por UA NUNCA es 100% confiable — los strings cambian
// entre versiones y apps. Mantener la lista chica y conservadora.

const WEBVIEW_PATTERNS: RegExp[] = [
  /Instagram/i,         // IG in-app browser (iOS + Android)
  /\bFB(_IAB|AN|AV|SV|SN)\b/i, // Facebook + Messenger in-app
  /TikTok|BytedanceWebview|Trill/i, // TikTok
  /Twitter|TwitterAndroid/i, // X / Twitter
  /\bLine\//,           // Line app
  /MicroMessenger/i,    // WeChat
]

/** True si el UA coincide con alguno de los webviews sociales
 *  conocidos por dar problemas con getUserMedia. SSR-safe. */
export function esWebviewSocial(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (WEBVIEW_PATTERNS.some(re => re.test(ua))) return true

  // WhatsApp Android no manda string identificable, pero su webview
  // se ve como "Android ...; wv) Chrome/..." sin la versión Safari/
  // Mobile completa. Heurística: Android webview puro sin Version/.
  // Tiende a tener falsos positivos en alguna integración exótica
  // — preferimos eso a falsos negativos donde el cajero no entiende
  // por qué falla la cámara.
  if (/Android/.test(ua) && /; wv\)/.test(ua) && !/Version\//.test(ua)) {
    return true
  }

  return false
}
