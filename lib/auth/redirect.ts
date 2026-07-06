// Sanitización de destinos de redirección post-auth (parámetro `next`).
//
// El callback de auth (/auth/callback?next=...) redirige al usuario tras
// establecer la sesión. Si `next` viniera de la URL sin validar, un
// atacante podría armar un link a /auth/callback?next=https://evil.com y
// convertir nuestro dominio en un open redirect (phishing con sesión
// recién creada). Solo aceptamos rutas internas absolutas ("/algo").
//
// PURO: sin dependencias. Testeable en aislamiento.

// Chequea la forma "cruda" de un candidato a ruta interna. Una ruta es
// limpia si:
//   - empieza con "/" (ruta absoluta interna),
//   - NO con "//" (que el browser interpreta como esquema-relativo →
//     host externo) ni con "/\" (misma trampa con backslash),
//   - no contiene NINGÚN backslash (algunos browsers lo normalizan a "/"
//     y podría reintroducir "//host"),
//   - no contiene un esquema explícito (http:, javascript:, data:, …),
//   - no tiene caracteres de control.
function esRutaLimpia(v: string): boolean {
  if (!v.startsWith('/')) return false
  if (v.startsWith('//') || v.startsWith('/\\')) return false
  if (v.includes('\\')) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false
  if (/[\x00-\x1f\x7f]/.test(v)) return false
  return true
}

// Decodifica percent-encoding hasta que se estabiliza (cubre doble
// codificación: %252f → %2f → "/"). Bounded para no colgar ante entradas
// patológicas. Devuelve null si el percent-encoding está mal formado
// (decodeURIComponent tira) → tratamos eso como sospechoso.
function decodeProfundo(s: string): string | null {
  let cur = s
  for (let i = 0; i < 4; i++) {
    let dec: string
    try {
      dec = decodeURIComponent(cur)
    } catch {
      return null
    }
    if (dec === cur) return cur
    cur = dec
  }
  return cur
}

/**
 * Devuelve `next` si es una ruta interna segura, o `fallback` si no.
 *
 * Segura = ruta absoluta interna ("/algo") que NO puede convertirse en un
 * destino externo, evaluada tanto en su forma cruda como percent-decodificada.
 * Rechaza explícitamente: "//host", "/\host", backslashes, esquemas
 * (http:, https:, javascript:, …), whitespace/control chars, y variantes
 * codificadas (%2f→"/", %5c→"\", incl. doble codificación) que un proxy o
 * el browser podría decodificar antes de resolver el Location.
 */
export function rutaInternaSegura(next: unknown, fallback: string): string {
  if (typeof next !== 'string' || next.length === 0) return fallback
  // Whitespace/control al inicio que algunos browsers recortan y podrían
  // cambiar el parsing. Chequeado antes de decodificar.
  if (next !== next.trim()) return fallback

  // 1. Forma cruda.
  if (!esRutaLimpia(next)) return fallback

  // 2. Forma decodificada — defensa en profundidad contra %2f/%5c/esquemas
  //    codificados. Si el decode falla (URI mal formada), rechazamos.
  const decoded = decodeProfundo(next)
  if (decoded === null || !esRutaLimpia(decoded)) return fallback

  return next
}
