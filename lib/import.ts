// ─────────────────────────────────────────────────────────────────────
// Importación masiva de productos desde XLSX/CSV.
//
// Lógica pura (cero React, cero Supabase). Le pasás un File y unos
// "productos existentes" (para detectar duplicados) y devuelve filas
// validadas con su status: 'ok' | 'error' | 'duplicate'. La UI decide
// qué mostrar; el caller decide qué importar.
//
// Reutiliza la lib `xlsx` que ya está instalada (la usa /exportar).
// XLSX.read detecta el formato automáticamente, así que con una sola
// dependencia soportamos .xlsx, .xls y .csv (incluyendo Excel-AR con
// separador ; y encoding latin1).
// ─────────────────────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 500
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

// ─────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────

interface RawRow {
  nombre?: string
  precio?: string
  stock?: string
  categoria?: string
  sku?: string
  codigo_barras?: string
  /** Número de línea humano (1-indexed, contando la cabecera = línea 1). */
  _line: number
}

export type RowStatus = 'ok' | 'error' | 'duplicate'

export interface ParsedRow {
  nombre: string
  precio: number
  stock: number
  categoria: string | null
  sku: string | null
  codigo_barras: string | null
}

export interface ValidatedRow {
  line: number
  status: RowStatus
  /** Solo presente cuando status === 'ok'. */
  parsed?: ParsedRow
  /** Motivo del error o de la marca de duplicado (en humano). */
  reason?: string
  /** Datos crudos originales (para mostrar en el preview). */
  raw: RawRow
}

export interface ExistingProduct {
  nombre: string
  sku: string | null
  codigo_barras: string | null
}

export interface ImportStats {
  total: number
  ok: number
  errores: number
  duplicados: number
}

export interface ParseResult {
  rows: RawRow[]
  /** Error de archivo (vacío, formato inválido, demasiadas filas, etc.).
   *  Si está presente, `rows` viene vacío y el caller debe abortar. */
  fileError?: string
}

// ─────────────────────────────────────────────────────────────────────
// Headers — mapeo permisivo
// ─────────────────────────────────────────────────────────────────────
// El comerciante no técnico puede escribir el header de varias formas
// ("Precio", "PRECIO", "Precio Venta", etc.). Normalizamos y mapeamos.

const HEADER_MAP: Record<string, keyof Omit<RawRow, '_line'>> = {
  nombre: 'nombre',
  producto: 'nombre',
  descripcion: 'nombre',

  precio: 'precio',
  'precio venta': 'precio',
  precio_venta: 'precio',
  pvp: 'precio',

  stock: 'stock',
  cantidad: 'stock',
  existencia: 'stock',
  existencias: 'stock',

  categoria: 'categoria',
  rubro: 'categoria',

  sku: 'sku',
  codigo: 'sku', // "codigo" sin "barras" → SKU (más usado que código de barras)

  codigo_barras: 'codigo_barras',
  'codigo barras': 'codigo_barras',
  'codigo de barras': 'codigo_barras',
  cod_barras: 'codigo_barras',
  barcode: 'codigo_barras',
  ean: 'codigo_barras',
}

function normalizeHeader(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes
    .trim()
    .replace(/\s+/g, ' ')
}

// ─────────────────────────────────────────────────────────────────────
// Parser de archivo (XLSX / CSV)
// ─────────────────────────────────────────────────────────────────────

export async function parseImportFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_FILE_BYTES) {
    return { rows: [], fileError: 'El archivo es muy grande. Máximo 5 MB.' }
  }
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
    return { rows: [], fileError: 'Solo aceptamos archivos .xlsx o .csv.' }
  }

  let aoa: unknown[][]
  try {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    // `raw: false` → fechas/números vienen como strings normalizados,
    // así pasan por nuestra parsePrecio sin sorpresas de tipo.
    const wb = XLSX.read(buffer, { type: 'array', raw: false })
    const firstSheetName = wb.SheetNames[0]
    if (!firstSheetName) return { rows: [], fileError: 'El archivo está vacío.' }
    const sheet = wb.Sheets[firstSheetName]
    aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][]
  } catch {
    return { rows: [], fileError: 'No pudimos leer el archivo. Verificá que sea un Excel o CSV válido.' }
  }

  if (aoa.length < 2) {
    return { rows: [], fileError: 'El archivo no tiene filas de datos (solo cabecera o vacío).' }
  }

  const headers = (aoa[0] as unknown[]).map(h => normalizeHeader(String(h ?? '')))
  const fieldIndex: Partial<Record<keyof Omit<RawRow, '_line'>, number>> = {}
  headers.forEach((h, idx) => {
    const canonical = HEADER_MAP[h]
    if (canonical && fieldIndex[canonical] === undefined) {
      fieldIndex[canonical] = idx
    }
  })

  if (fieldIndex.nombre === undefined || fieldIndex.precio === undefined) {
    return {
      rows: [],
      fileError: 'Faltan columnas obligatorias. La primera fila debe incluir "nombre" y "precio".',
    }
  }

  const dataRows = aoa.slice(1)

  // Filtrar filas totalmente vacías ANTES del límite — Excel a veces
  // exporta cientos de filas en blanco al final que no son datos.
  const nonEmpty: { raw: unknown[]; sourceLine: number }[] = []
  dataRows.forEach((row, idx) => {
    const r = row as unknown[]
    const hasContent = r.some(v => v !== undefined && v !== null && String(v).trim() !== '')
    if (hasContent) nonEmpty.push({ raw: r, sourceLine: idx + 2 }) // +2 = header es línea 1
  })

  if (nonEmpty.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      fileError: `Máximo ${MAX_IMPORT_ROWS} productos por archivo. El tuyo tiene ${nonEmpty.length}. Importalo en tandas.`,
    }
  }

  const pickFrom = (raw: unknown[]) => (k: keyof Omit<RawRow, '_line'>): string | undefined => {
    const i = fieldIndex[k]
    if (i === undefined) return undefined
    const v = raw[i]
    if (v === undefined || v === null) return undefined
    const s = String(v).trim()
    return s === '' ? undefined : s
  }

  const rows: RawRow[] = nonEmpty.map(({ raw, sourceLine }) => {
    const pick = pickFrom(raw)
    return {
      nombre: pick('nombre'),
      precio: pick('precio'),
      stock: pick('stock'),
      categoria: pick('categoria'),
      sku: pick('sku'),
      codigo_barras: pick('codigo_barras'),
      _line: sourceLine,
    }
  })

  return { rows }
}

// ─────────────────────────────────────────────────────────────────────
// Heurística de precio (formato AR + US)
// ─────────────────────────────────────────────────────────────────────
// Reglas (acordadas):
//   "1890"       → 1890
//   "1.890"      → 1890   (separador de miles AR)
//   "1,890"      → 1890   (separador de miles US)
//   "1890,50"    → 1890.5 (decimal AR)
//   "1890.50"    → 1890.5 (decimal US)
//   "1.890,50"   → 1890.5 (AR formal: . miles + , decimal)
//   "1,890.50"   → 1890.5 (US formal: , miles + . decimal)
//   "$1.890"     → 1890   (saca símbolo $ y espacios)
//   "abc"        → null
//   "-100" / "0" → null   (precio debe ser > 0)
//
// Cuando solo aparece UN tipo de separador, se desambigua mirando los
// dígitos a la derecha: 3 dígitos exactos + patrón "x.xxx[.xxx...]"
// = separador de miles; 1-2 dígitos = decimal.

export function parsePrecio(raw: string | undefined | null): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null

  // Sacar símbolo $ y espacios (incl. no-breaking space).
  s = s.replace(/[$\s ]/g, '')
  if (!s) return null

  // Si tiene caracteres no numéricos fuera de . , - → inválido.
  if (!/^-?[\d.,]+$/.test(s)) return null

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')

  let normalized: string

  if (lastDot === -1 && lastComma === -1) {
    normalized = s
  } else if (lastDot >= 0 && lastComma >= 0) {
    // Ambos presentes: el más a la derecha es decimal, el otro miles.
    if (lastDot > lastComma) {
      normalized = s.replace(/,/g, '')
    } else {
      normalized = s.replace(/\./g, '').replace(',', '.')
    }
  } else if (lastComma >= 0) {
    const after = s.slice(lastComma + 1)
    if (/^\d{3}$/.test(after) && /^\d{1,3}(,\d{3})+$/.test(s)) {
      // "1,890" o "1,890,500" → coma como miles US.
      normalized = s.replace(/,/g, '')
    } else if (/^\d{1,2}$/.test(after)) {
      // "1890,50" → decimal AR.
      normalized = s.replace(',', '.')
    } else {
      // Ambiguo → tratamos coma como decimal (más probable en AR).
      normalized = s.replace(',', '.')
    }
  } else {
    const after = s.slice(lastDot + 1)
    if (/^\d{3}$/.test(after) && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      // "1.890" o "1.890.500" → punto como miles AR.
      normalized = s.replace(/\./g, '')
    } else if (/^\d{1,2}$/.test(after)) {
      // "1890.50" → decimal US.
      normalized = s
    } else {
      normalized = s
    }
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  // 2 decimales máximo (precios).
  return Math.round(n * 100) / 100
}

function parseStock(raw: string | undefined | null): number {
  if (raw == null) return 0
  const s = String(raw).trim()
  if (!s) return 0
  // Stock acepta 0 (que es default) — no podemos rechazar n<=0 como precio.
  // Reusamos la misma heurística de separadores pero permitimos 0.
  // Truco: parsePrecio devuelve null para 0; lo manejamos antes.
  if (/^-?0+([.,]0+)?$/.test(s)) return 0
  const n = parsePrecio(s)
  return n != null ? n : 0
}

// ─────────────────────────────────────────────────────────────────────
// Validación + detección de duplicados
// ─────────────────────────────────────────────────────────────────────

function normalizarNombre(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function validateImportRows(
  rows: RawRow[],
  existing: ExistingProduct[],
): ValidatedRow[] {
  // Sets para lookup O(1) contra productos existentes en la DB.
  const existingNames = new Set(existing.map(p => normalizarNombre(p.nombre)))
  const existingSkus = new Set(
    existing.map(p => p.sku?.trim().toLowerCase()).filter(Boolean) as string[],
  )
  const existingCodes = new Set(
    existing.map(p => p.codigo_barras?.trim()).filter(Boolean) as string[],
  )

  // Sets para detectar duplicados DENTRO del mismo archivo
  // (ej: la fila 12 y la 47 tienen el mismo SKU).
  const seenNames = new Set<string>()
  const seenSkus = new Set<string>()
  const seenCodes = new Set<string>()

  const validated: ValidatedRow[] = []

  for (const row of rows) {
    const v: ValidatedRow = { line: row._line, status: 'ok', raw: row }

    // Required fields
    if (!row.nombre) {
      v.status = 'error'; v.reason = 'Falta el nombre del producto'
      validated.push(v); continue
    }
    if (!row.precio) {
      v.status = 'error'; v.reason = 'Falta el precio'
      validated.push(v); continue
    }
    const precio = parsePrecio(row.precio)
    if (precio == null) {
      v.status = 'error'
      v.reason = `Precio "${row.precio}" no es un número válido o es menor o igual a 0`
      validated.push(v); continue
    }

    const stock = parseStock(row.stock)
    const nombreNorm = normalizarNombre(row.nombre)
    const skuNorm = row.sku?.trim().toLowerCase() || null
    const codigoNorm = row.codigo_barras?.trim() || null

    // Duplicados contra DB existente
    if (existingNames.has(nombreNorm)) {
      v.status = 'duplicate'
      v.reason = `Ya existe un producto con nombre "${row.nombre}"`
      validated.push(v); continue
    }
    if (skuNorm && existingSkus.has(skuNorm)) {
      v.status = 'duplicate'
      v.reason = `Ya existe un producto con SKU "${row.sku}"`
      validated.push(v); continue
    }
    if (codigoNorm && existingCodes.has(codigoNorm)) {
      v.status = 'duplicate'
      v.reason = `Ya existe un producto con código de barras "${row.codigo_barras}"`
      validated.push(v); continue
    }

    // Duplicados dentro del mismo archivo
    if (seenNames.has(nombreNorm)) {
      v.status = 'duplicate'
      v.reason = `Nombre "${row.nombre}" repetido en este mismo archivo`
      validated.push(v); continue
    }
    if (skuNorm && seenSkus.has(skuNorm)) {
      v.status = 'duplicate'
      v.reason = `SKU "${row.sku}" repetido en este mismo archivo`
      validated.push(v); continue
    }
    if (codigoNorm && seenCodes.has(codigoNorm)) {
      v.status = 'duplicate'
      v.reason = `Código de barras "${row.codigo_barras}" repetido en este mismo archivo`
      validated.push(v); continue
    }
    seenNames.add(nombreNorm)
    if (skuNorm) seenSkus.add(skuNorm)
    if (codigoNorm) seenCodes.add(codigoNorm)

    // OK — fila lista para importar
    v.parsed = {
      nombre: row.nombre.trim(),
      precio,
      stock,
      categoria: row.categoria?.trim() || null,
      sku: row.sku?.trim() || null,
      codigo_barras: row.codigo_barras?.trim() || null,
    }
    validated.push(v)
  }

  return validated
}

export function computeStats(rows: ValidatedRow[]): ImportStats {
  return {
    total: rows.length,
    ok: rows.filter(r => r.status === 'ok').length,
    errores: rows.filter(r => r.status === 'error').length,
    duplicados: rows.filter(r => r.status === 'duplicate').length,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Plantilla descargable (XLSX con 2 hojas: Productos + Instrucciones)
// ─────────────────────────────────────────────────────────────────────

export async function buildPlantilla(): Promise<Blob> {
  const XLSX = await import('xlsx')

  // Hoja 1 — Productos: cabecera + 2 ejemplos.
  const headers = ['nombre', 'precio', 'stock', 'categoria', 'sku', 'codigo_barras']
  const examples: (string | number)[][] = [
    ['Coca-Cola 2.25L', 1890, 24, 'Bebidas', 'COC-225', '7790001001234'],
    ['Marlboro Box', 4200, 12, 'Cigarrillos', 'MAR-BOX', ''],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet([headers, ...examples])
  ws1['!cols'] = [
    { wch: 32 }, { wch: 10 }, { wch: 8 },
    { wch: 18 }, { wch: 14 }, { wch: 18 },
  ]

  // Hoja 2 — Instrucciones legibles para el comerciante.
  const inst: string[][] = [
    ['Instrucciones para importar productos en Sylvora'],
    [''],
    ['Columnas obligatorias: nombre, precio'],
    ['Columnas opcionales: stock (default 0), categoria, sku, codigo_barras'],
    [''],
    ['Reglas:'],
    ['• El precio debe ser un número mayor a 0. Ejemplos válidos: 1890 · 1.890 · 1890,50 · 1890.50'],
    ['• Si no completás stock, queda en 0 — lo podés ajustar después desde Productos'],
    ['• La categoría puede ser cualquier texto (no es una lista cerrada)'],
    ['• SKU y código de barras son opcionales'],
    ['• Si ya existe un producto con el mismo nombre, SKU o código, se SALTA (no se duplica)'],
    [''],
    [`Límite: hasta ${MAX_IMPORT_ROWS} productos por archivo.`],
    [''],
    ['Borrá las filas de ejemplo antes de subir el archivo. Reemplazalas por tus productos.'],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(inst)
  ws2['!cols'] = [{ wch: 90 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, 'Productos')
  XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
