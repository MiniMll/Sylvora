// POST /api/registro
// ---------------------------------------------------------------
// Endpoint público de onboarding desde la landing.
//
// El cliente NO puede crear comercios ni perfiles directamente: la
// RLS de `comercios` solo tiene policy de SELECT (decisión del
// bootstrap), y `perfiles_insert_admin` requiere rol admin
// preexistente — circular para el primer admin de un comercio.
//
// Por eso bootstrappeamos el onboarding completo del lado del server
// con service-role:
//   1. Validar body.
//   2. Crear user en Supabase Auth (email_confirm: true → sin verif
//      por mail, así el siguiente signIn cliente funciona instant).
//   3. Crear comercio.
//   4. Crear perfil admin vinculado.
//   5. Crear categorías default (best-effort — fallo aquí no rompe
//      el flujo, el user puede crearlas después).
//
// Rollback: si los pasos 3 o 4 fallan, se borra lo que se haya creado
// antes para no dejar usuarios huérfanos. El paso 5 es best-effort.
//
// El cliente, después del 200 OK, hace signInWithPassword para tener
// la cookie de sesión y entrar al dashboard.
//
// Seguridad: el endpoint es PÚBLICO (anyone-can-signup, es signup).
// La defensa es la validación de input + que cada llamada crea SU
// PROPIO comercio aislado. No expone datos de otros comercios.
// Eventualmente convendría rate-limit por IP, pero no para V1.

import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server-admin'

interface RegistroBody {
  email: string
  password: string
  nombre: string
  comercio: string
  tipo?: string
  telefono?: string
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Las 5 categorías que el flow antiguo creaba desde el cliente.
// Las dejamos acá centralizadas: si querés sumar/sacar, se cambia
// en un solo lugar.
const CATEGORIAS_DEFAULT = [
  { nombre: 'Bebidas',    icono: 'BV', color: '#5b4cff' },
  { nombre: 'Almacén',    icono: 'AL', color: '#00c896' },
  { nombre: 'Lácteos',    icono: 'LC', color: '#ff6b35' },
  { nombre: 'Limpieza',   icono: 'LM', color: '#ffd23f' },
  { nombre: 'Ferretería', icono: 'FR', color: '#ff4757' },
]

export async function POST(req: Request) {
  // ───── 1. Parse + validate ──────────────────────────────────────
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const body = (raw ?? {}) as Partial<RegistroBody>

  if (!body.email || typeof body.email !== 'string' || !emailValido(body.email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }
  if (!body.nombre || typeof body.nombre !== 'string' || !body.nombre.trim()) {
    return NextResponse.json({ error: 'Falta tu nombre' }, { status: 400 })
  }
  if (!body.comercio || typeof body.comercio !== 'string' || !body.comercio.trim()) {
    return NextResponse.json({ error: 'Falta el nombre del comercio' }, { status: 400 })
  }

  const emailNorm = body.email.toLowerCase().trim()
  const nombreNorm = body.nombre.trim()
  const comercioNorm = body.comercio.trim()
  const tipoNorm = typeof body.tipo === 'string' && body.tipo.trim() ? body.tipo.trim() : null
  const telefonoNorm = typeof body.telefono === 'string' && body.telefono.trim() ? body.telefono.trim() : null

  const supabase = getServiceClient()

  // ───── 2. Crear user (ya confirmado) ────────────────────────────
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email: emailNorm,
    password: body.password,
    email_confirm: true,
  })

  if (userErr || !userData?.user) {
    // Email duplicado: Supabase devuelve "User already registered" o similar.
    if (userErr?.message && /already (registered|exists)|duplicate/i.test(userErr.message)) {
      return NextResponse.json({ error: 'Ya existe una cuenta con ese email' }, { status: 409 })
    }
    return NextResponse.json(
      { error: userErr?.message || 'Error al crear la cuenta' },
      { status: 500 }
    )
  }
  const userId = userData.user.id

  // ───── 3. Crear comercio ────────────────────────────────────────
  const { data: comercioData, error: comercioErr } = await supabase
    .from('comercios')
    .insert({
      nombre: comercioNorm,
      tipo: tipoNorm,
      telefono: telefonoNorm,
      email: emailNorm,
      plan: 'trial',
    })
    .select('id')
    .single()

  if (comercioErr || !comercioData) {
    // Rollback: borrar user para no dejar cuenta huérfana.
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json(
      { error: 'Error al crear el comercio' },
      { status: 500 }
    )
  }
  const comercioId = comercioData.id

  // ───── 4. Crear perfil admin ────────────────────────────────────
  const { error: perfilErr } = await supabase
    .from('perfiles')
    .insert({
      id: userId,
      comercio_id: comercioId,
      nombre: nombreNorm,
      rol: 'admin',
    })

  if (perfilErr) {
    // Rollback: borrar comercio + user.
    await supabase.from('comercios').delete().eq('id', comercioId)
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json(
      { error: 'Error al crear el perfil' },
      { status: 500 }
    )
  }

  // ───── 5. Categorías default (best-effort) ──────────────────────
  // Si fallan, log y seguimos. El user puede crear categorías
  // manualmente desde la app; no vale tirarle un error de onboarding
  // por un nice-to-have.
  const { error: catsErr } = await supabase
    .from('categorias')
    .insert(CATEGORIAS_DEFAULT.map(c => ({ ...c, comercio_id: comercioId })))

  if (catsErr) {
    console.warn('[POST /api/registro] Categorías default no se crearon:', catsErr.message)
  }

  return NextResponse.json({ ok: true })
}
