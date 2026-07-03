export const TZ_ARGENTINA = 'America/Argentina/Buenos_Aires'

export interface ConfigDiaOperativo {
  caja_24hs: boolean
  hora_apertura_caja: string
  hora_cierre_caja: string
  timezone: typeof TZ_ARGENTINA
}

export interface DiaOperativo {
  fechaOperativa: string
  inicio: Date
  fin: Date
  cruzaMedianoche: boolean
  config: ConfigDiaOperativo
}

export interface BucketDiaOperativo {
  label: string
  inicio: Date
  fin: Date
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export const DEFAULT_DIA_OPERATIVO: ConfigDiaOperativo = {
  caja_24hs: true,
  hora_apertura_caja: '08:00',
  hora_cierre_caja: '20:00',
  timezone: TZ_ARGENTINA,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validHHMM(value: unknown, fallback: string): string {
  return typeof value === 'string' && HHMM_RE.test(value) ? value : fallback
}

export function normalizarConfigDiaOperativo(settings: unknown): ConfigDiaOperativo {
  const raw = isRecord(settings) ? settings : {}
  return {
    caja_24hs: typeof raw.caja_24hs === 'boolean' ? raw.caja_24hs : DEFAULT_DIA_OPERATIVO.caja_24hs,
    hora_apertura_caja: validHHMM(raw.hora_apertura_caja, DEFAULT_DIA_OPERATIVO.hora_apertura_caja),
    hora_cierre_caja: validHHMM(raw.hora_cierre_caja, DEFAULT_DIA_OPERATIVO.hora_cierre_caja),
    timezone: TZ_ARGENTINA,
  }
}

export function serializeConfigDiaOperativo(config: ConfigDiaOperativo): Record<string, string | boolean> {
  return {
    caja_24hs: config.caja_24hs,
    hora_apertura_caja: validHHMM(config.hora_apertura_caja, DEFAULT_DIA_OPERATIVO.hora_apertura_caja),
    hora_cierre_caja: validHHMM(config.hora_cierre_caja, DEFAULT_DIA_OPERATIVO.hora_cierre_caja),
  }
}

function parseHHMM(value: string): number {
  const match = value.match(HHMM_RE)
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

function minutesToParts(minutes: number): { hour: number; minute: number } {
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - date.getTime()
}

function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  ))
  return new Date(guess.getTime() - offsetMs(guess, timeZone))
}

function ymdFromParts(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function partsFromYmd(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split('-').map(Number)
  return { year, month, day }
}

export function sumarDiasYmd(ymd: string, days: number): string {
  const p = partsFromYmd(ymd)
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return ymdFromParts({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() })
}

function firstDayOfMonthYmd(ymd: string): string {
  const p = partsFromYmd(ymd)
  return ymdFromParts({ year: p.year, month: p.month, day: 1 })
}

export function fechaLocalArgentina(date: Date = new Date()): string {
  return ymdFromParts(zonedParts(date, TZ_ARGENTINA))
}

export function mesLocalArgentina(date: Date = new Date()): string {
  return firstDayOfMonthYmd(fechaLocalArgentina(date))
}

function rangoDesdeFechaOperativa(fechaOperativa: string, config: ConfigDiaOperativo): DiaOperativo {
  const p = partsFromYmd(fechaOperativa)
  const aperturaMin = parseHHMM(config.hora_apertura_caja)
  const cierreMin = parseHHMM(config.hora_cierre_caja)
  const cruzaMedianoche = !config.caja_24hs && cierreMin <= aperturaMin

  if (config.caja_24hs) {
    return {
      fechaOperativa,
      inicio: zonedTimeToUtc(p, config.timezone),
      fin: zonedTimeToUtc(partsFromYmd(sumarDiasYmd(fechaOperativa, 1)), config.timezone),
      cruzaMedianoche: false,
      config,
    }
  }

  const apertura = minutesToParts(aperturaMin)
  const cierre = minutesToParts(cierreMin)
  const fechaCierre = cruzaMedianoche ? sumarDiasYmd(fechaOperativa, 1) : fechaOperativa

  return {
    fechaOperativa,
    inicio: zonedTimeToUtc({ ...p, hour: apertura.hour, minute: apertura.minute }, config.timezone),
    fin: zonedTimeToUtc({ ...partsFromYmd(fechaCierre), hour: cierre.hour, minute: cierre.minute }, config.timezone),
    cruzaMedianoche,
    config,
  }
}

export function fechaOperativaDeTimestamp(
  timestamp: Date | string,
  settings: unknown,
): string {
  const config = normalizarConfigDiaOperativo(settings)
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const local = zonedParts(date, config.timezone)
  const localYmd = ymdFromParts(local)
  if (config.caja_24hs) return localYmd

  const aperturaMin = parseHHMM(config.hora_apertura_caja)
  const cierreMin = parseHHMM(config.hora_cierre_caja)
  const cruzaMedianoche = cierreMin <= aperturaMin
  const localMin = local.hour * 60 + local.minute
  if (cruzaMedianoche && localMin < cierreMin) {
    return sumarDiasYmd(localYmd, -1)
  }
  return localYmd
}

export function obtenerDiaOperativoActual(settings: unknown, now: Date = new Date()): DiaOperativo {
  const config = normalizarConfigDiaOperativo(settings)
  const fechaOperativa = fechaOperativaDeTimestamp(now, config)
  return rangoDesdeFechaOperativa(fechaOperativa, config)
}

export function obtenerRangoDiaOperativo(fechaOperativa: string, settings: unknown): DiaOperativo {
  return rangoDesdeFechaOperativa(fechaOperativa, normalizarConfigDiaOperativo(settings))
}

export function obtenerRangoUltimosDiasOperativos(settings: unknown, days: number, now: Date = new Date()): DiaOperativo {
  const actual = obtenerDiaOperativoActual(settings, now)
  const inicioFecha = sumarDiasYmd(actual.fechaOperativa, -(Math.max(1, days) - 1))
  const inicio = obtenerRangoDiaOperativo(inicioFecha, actual.config).inicio
  return { ...actual, inicio }
}

export function obtenerRangoMesOperativoActual(settings: unknown, now: Date = new Date()): DiaOperativo {
  const actual = obtenerDiaOperativoActual(settings, now)
  const inicioFecha = firstDayOfMonthYmd(actual.fechaOperativa)
  const inicio = obtenerRangoDiaOperativo(inicioFecha, actual.config).inicio
  return { ...actual, inicio }
}

export function crearBucketsDiaOperativo(dia: DiaOperativo): BucketDiaOperativo[] {
  const totalMs = Math.max(60 * 60 * 1000, dia.fin.getTime() - dia.inicio.getTime())
  const bucketCount = Math.max(1, Math.ceil(totalMs / (60 * 60 * 1000)))
  return Array.from({ length: bucketCount }, (_, i) => {
    const inicio = new Date(dia.inicio.getTime() + i * 60 * 60 * 1000)
    const fin = new Date(Math.min(dia.fin.getTime(), inicio.getTime() + 60 * 60 * 1000))
    const label = new Intl.DateTimeFormat('es-AR', {
      timeZone: dia.config.timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(inicio)
    return { label, inicio, fin }
  })
}
