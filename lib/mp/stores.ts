// Onboarding Store/POS para QR dinamico de Mercado Pago.
//
// El callback OAuth llama a ensureStoreAndPOS() antes de guardar la
// conexion como activa. Si esto falla, no queda mp_credenciales a medias.

import { MPApiError, mpGet, mpPost, sanitizeForLog } from './api-client'
import type { MPPOSCreateBody, MPPOSResponse, MPStoreCreateBody, MPStoreResponse } from './types'
import type { Comercio } from '@/types/database'

interface EnsureStoreAndPOSInput {
  accessToken: string
  userIdMp: number
  comercio: Pick<Comercio, 'id' | 'nombre' | 'direccion'>
}

export interface EnsureStoreAndPOSResult {
  storeIdMp: string
  externalPosId: string
}

interface SearchResponse<T> {
  results?: T[]
  elements?: T[]
}

function mpOnboardingLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify({
    level,
    component: 'mp/stores',
    event,
    ...fields,
  }))
}

function suffixFromComercio(comercioId: string): string {
  return comercioId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toUpperCase()
}

export function buildMPStoreExternalId(comercioId: string): string {
  return `SYLVORA_STORE_${suffixFromComercio(comercioId)}`
}

export function buildMPPOSExternalId(comercioId: string): string {
  return `SYLVORA_POS_${suffixFromComercio(comercioId)}`
}

function asStoreId(store: MPStoreResponse): string {
  return String(store.id)
}

function normalizeName(name: string, fallback: string): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 60) : fallback
}

function splitStreet(direccion: string | null): { street_name: string; street_number: string } {
  const fallback = { street_name: 'Sin direccion', street_number: '0' }
  if (!direccion) return fallback
  const trimmed = direccion.trim()
  if (!trimmed) return fallback
  const match = trimmed.match(/^(.*?)[,\s]+(\d+[a-zA-Z]?)$/)
  if (!match) return { street_name: trimmed.slice(0, 80), street_number: '0' }
  return {
    street_name: match[1].trim().slice(0, 80) || fallback.street_name,
    street_number: match[2].trim(),
  }
}

function buildStoreLocation(comercio: Pick<Comercio, 'direccion'>): MPStoreCreateBody['location'] {
  const street = splitStreet(comercio.direccion)
  return {
    street_name: street.street_name,
    street_number: street.street_number,
    // Mercado Pago valida city_name contra su catalogo. Como Sylvora
    // todavia no tiene ciudad/localidad estructurada por comercio,
    // usamos un fallback conocido para CABA en vez de "Buenos Aires",
    // que MP rechaza como location.city_name invalid.
    city_name: 'Belgrano',
    state_name: 'Capital Federal',
    latitude: -34.5627,
    longitude: -58.4583,
  }
}

async function findStoreByExternalId(
  accessToken: string,
  userIdMp: number,
  externalId: string,
): Promise<MPStoreResponse | null> {
  try {
    const response = await mpGet<SearchResponse<MPStoreResponse>>({
      accessToken,
      path: `/users/${userIdMp}/stores/search`,
      query: { external_id: externalId },
      operation: 'mp-store-search',
      maxRetries: 1,
    })
    return response.results?.[0] ?? response.elements?.[0] ?? null
  } catch (e) {
    if (e instanceof MPApiError && e.status !== 401 && e.status !== 403) {
      mpOnboardingLog('warn', 'store_search_failed_non_blocking', {
        status: e.status,
        code: e.code,
        userIdMp,
        externalId,
      })
      return null
    }
    throw e
  }
}

async function createStore(
  accessToken: string,
  userIdMp: number,
  comercio: Pick<Comercio, 'nombre' | 'direccion'>,
  externalId: string,
): Promise<MPStoreResponse> {
  const body: MPStoreCreateBody = {
    name: normalizeName(comercio.nombre, 'Sylvora'),
    external_id: externalId,
    location: buildStoreLocation(comercio),
  }

  mpOnboardingLog('info', 'store_create_payload', {
    userIdMp,
    externalId,
    payload: sanitizeForLog(body),
  })

  return mpPost<MPStoreResponse>({
    accessToken,
    path: `/users/${userIdMp}/stores`,
    body,
    operation: 'mp-store-create',
    retryNonGet: false,
    maxRetries: 0,
  })
}

async function ensureStore(
  accessToken: string,
  userIdMp: number,
  comercio: Pick<Comercio, 'id' | 'nombre' | 'direccion'>,
): Promise<MPStoreResponse> {
  const externalId = buildMPStoreExternalId(comercio.id)
  const existing = await findStoreByExternalId(accessToken, userIdMp, externalId)
  if (existing) {
    mpOnboardingLog('info', 'store_reused', {
      userIdMp,
      externalId,
      storeIdMp: asStoreId(existing),
    })
    return existing
  }

  try {
    const created = await createStore(accessToken, userIdMp, comercio, externalId)
    mpOnboardingLog('info', 'store_created', {
      userIdMp,
      externalId,
      storeIdMp: asStoreId(created),
    })
    return created
  } catch (e) {
    if (e instanceof MPApiError && e.status === 409) {
      const conflicted = await findStoreByExternalId(accessToken, userIdMp, externalId)
      if (conflicted) return conflicted
    }
    throw e
  }
}

async function findPOSByExternalId(
  accessToken: string,
  externalId: string,
): Promise<MPPOSResponse | null> {
  try {
    const response = await mpGet<SearchResponse<MPPOSResponse>>({
      accessToken,
      path: '/pos',
      query: { external_id: externalId },
      operation: 'mp-pos-search',
      maxRetries: 1,
    })
    return response.results?.[0] ?? response.elements?.[0] ?? null
  } catch (e) {
    if (e instanceof MPApiError && e.status !== 401 && e.status !== 403) {
      mpOnboardingLog('warn', 'pos_search_failed_non_blocking', {
        status: e.status,
        code: e.code,
        externalId,
      })
      return null
    }
    throw e
  }
}

async function createPOS(
  accessToken: string,
  storeId: string,
  comercio: Pick<Comercio, 'nombre'>,
  externalId: string,
): Promise<MPPOSResponse> {
  const body: MPPOSCreateBody = {
    name: normalizeName(`${comercio.nombre} - Sylvora`, 'Sylvora POS'),
    fixed_amount: false,
    store_id: storeId,
    external_id: externalId,
    category: 621102,
  }

  return mpPost<MPPOSResponse>({
    accessToken,
    path: '/pos',
    body,
    operation: 'mp-pos-create',
    retryNonGet: false,
    maxRetries: 0,
  })
}

async function ensurePOS(
  accessToken: string,
  storeId: string,
  comercio: Pick<Comercio, 'id' | 'nombre'>,
): Promise<MPPOSResponse> {
  const externalId = buildMPPOSExternalId(comercio.id)
  const existing = await findPOSByExternalId(accessToken, externalId)
  if (existing) {
    mpOnboardingLog('info', 'pos_reused', {
      externalId,
      storeIdMp: storeId,
      posIdMp: existing.id,
    })
    return existing
  }

  try {
    const created = await createPOS(accessToken, storeId, comercio, externalId)
    mpOnboardingLog('info', 'pos_created', {
      externalId,
      storeIdMp: storeId,
      posIdMp: created.id,
    })
    return created
  } catch (e) {
    if (e instanceof MPApiError && e.status === 409) {
      const conflicted = await findPOSByExternalId(accessToken, externalId)
      if (conflicted) return conflicted
    }
    throw e
  }
}

export async function ensureStoreAndPOS(
  input: EnsureStoreAndPOSInput,
): Promise<EnsureStoreAndPOSResult> {
  mpOnboardingLog('info', 'ensure_store_pos_start', {
    comercioId: input.comercio.id,
    userIdMp: input.userIdMp,
  })

  const store = await ensureStore(input.accessToken, input.userIdMp, input.comercio)
  const pos = await ensurePOS(input.accessToken, asStoreId(store), input.comercio)

  mpOnboardingLog('info', 'ensure_store_pos_success', {
    comercioId: input.comercio.id,
    userIdMp: input.userIdMp,
    storeIdMp: asStoreId(store),
    externalPosId: pos.external_id,
  })

  return {
    storeIdMp: asStoreId(store),
    externalPosId: pos.external_id,
  }
}
