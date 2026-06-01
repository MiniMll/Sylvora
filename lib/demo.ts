// ─────────────────────────────────────────────────────────────────────
// Helper para detectar el "modo demo" del comercio activo.
//
// Filosofía V1: el modo demo es UN comercio fijo con UUID hardcodeado
// (ver scripts/seed-demo.sql). Cualquier sesión que tenga como comercio
// activo ese UUID está en modo demo y debe ver:
//   - DemoBanner sticky arriba ("Estás viendo una demo · Crear cuenta").
//   - Escudo UX (commit posterior) que deshabilita acciones que
//     ensuciarían la demo para los siguientes visitantes (cambiar
//     nombre del comercio, invitar usuarios, importar Excel masivo,
//     cambiar password).
//
// Por qué un UUID fijo y no un flag/columna en `comercios`:
//   - Mantiene el schema limpio (sin "is_demo BOOLEAN" que después
//     hay que defender de UI/RLS y migrar si cambia el modelo).
//   - El UUID demo vive en UN solo lugar (este archivo + el seed SQL),
//     y la app tiene que importar este helper para chequearlo —
//     más explícito que un flag oculto.
//
// Si en el futuro pasamos a Opción 2 (cuenta efímera por visitante),
// reemplazamos esCommerceDemo() por un check distinto (ej. perfil
// con email matcheando un patrón, o flag en comercios). El resto
// del código que usa esCommerceDemo() no necesita cambiar — esa es
// la razón de tener este indirecto en vez de comparar UUIDs en cada
// componente.
// ─────────────────────────────────────────────────────────────────────

import type { Comercio } from '@/types/database'

/** UUID del comercio demo compartido. Debe matchear EXACTAMENTE el
 *  comercio creado por scripts/seed-demo.sql. Si cambia allá, cambiá
 *  acá también (y viceversa). */
export const COMERCIO_DEMO_ID = 'dddddddd-1111-1111-1111-111111111111'

/** ¿El comercio activo es el demo compartido?
 *  Devuelve false para null/undefined (estado de carga) — el default
 *  conservador es "no es demo" para no flashear banners durante el
 *  primer render. */
export function esComercioDemo(comercio: Comercio | null | undefined): boolean {
  return comercio?.id === COMERCIO_DEMO_ID
}
