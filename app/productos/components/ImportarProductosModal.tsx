'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Copy,
} from 'lucide-react'
import {
  parseImportFile, validateImportRows, computeStats, buildPlantilla,
  MAX_IMPORT_ROWS,
  type ValidatedRow, type ImportStats,
} from '@/lib/import'
import {
  getProductosParaImport, importarProductos,
} from '@/lib/supabase/productos'

// Modal multi-paso para importar productos desde XLSX/CSV.
//
// Steps:
//   'upload'  → descargar plantilla + seleccionar archivo
//   'preview' → revisar filas validadas (ok / errores / duplicados)
//   'done'    → resultado del bulk insert
//
// Parsing y validación son CPU-bound puro (lib/import.ts). El único
// I/O de red es el snapshot inicial de productos (para dedup) y el
// bulk insert. Si el archivo es inválido (formato/headers/limite)
// mostramos el fileError sin avanzar de paso.

type Step = 'upload' | 'preview' | 'done'

interface Props {
  open: boolean
  onClose: () => void
  /** Callback cuando el import terminó con éxito (al menos 1 fila ok).
   *  El padre debe refrescar la lista de productos. */
  onImported?: (cantidad: number) => void
}

export function ImportarProductosModal({ open, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [validated, setValidated] = useState<ValidatedRow[]>([])
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<{ inserted: number; error?: string } | null>(null)

  function resetEstado() {
    setStep('upload')
    setFileName('')
    setParsing(false)
    setFileError(null)
    setValidated([])
    setStats(null)
    setImporting(false)
    setResultado(null)
  }

  function handleClose() {
    if (importing) return // no cerrar mientras inserta
    resetEstado()
    onClose()
  }

  async function descargarPlantilla() {
    try {
      const blob = await buildPlantilla()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla-productos-sylvora.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('No pudimos generar la plantilla. Recargá la página y probá de nuevo.')
    }
  }

  async function handleFileSelected(file: File) {
    setFileName(file.name)
    setFileError(null)
    setParsing(true)
    try {
      const parsed = await parseImportFile(file)
      if (parsed.fileError) {
        setFileError(parsed.fileError)
        setParsing(false)
        return
      }
      // Snapshot de DB para detectar duplicados.
      const existing = await getProductosParaImport()
      const v = validateImportRows(parsed.rows, existing)
      setValidated(v)
      setStats(computeStats(v))
      setStep('preview')
    } catch {
      setFileError('No pudimos procesar el archivo. Probá con otro o revisá el formato.')
    } finally {
      setParsing(false)
    }
  }

  async function confirmarImport() {
    const okRows = validated.filter(r => r.status === 'ok' && r.parsed).map(r => r.parsed!)
    if (okRows.length === 0) return
    setImporting(true)
    const r = await importarProductos(okRows)
    setResultado(r)
    setImporting(false)
    setStep('done')
    if (r.inserted > 0) {
      onImported?.(r.inserted)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importar productos desde Excel"
      size="lg"
      footer={
        step === 'upload' ? (
          <Button variant="ghost" onClick={handleClose}>Cerrar</Button>
        ) : step === 'preview' ? (
          <>
            <Button variant="ghost" onClick={resetEstado} disabled={importing}>
              Subir otro archivo
            </Button>
            <Button
              variant="success"
              onClick={confirmarImport}
              loading={importing}
              disabled={!stats || stats.ok === 0}
            >
              {importing
                ? 'Importando...'
                : stats && stats.ok > 0
                  ? `Importar ${stats.ok} producto${stats.ok === 1 ? '' : 's'}`
                  : 'No hay productos para importar'}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={handleClose}>Listo</Button>
        )
      }
    >
      {step === 'upload' && (
        <UploadStep
          parsing={parsing}
          fileName={fileName}
          fileError={fileError}
          onDescargarPlantilla={descargarPlantilla}
          onFileSelected={handleFileSelected}
        />
      )}
      {step === 'preview' && stats && (
        <PreviewStep validated={validated} stats={stats} fileName={fileName} />
      )}
      {step === 'done' && resultado && (
        <DoneStep resultado={resultado} stats={stats} />
      )}
    </Modal>
  )
}

// ───── Step: Upload ────────────────────────────────────────────────

function UploadStep({
  parsing, fileName, fileError, onDescargarPlantilla, onFileSelected,
}: {
  parsing: boolean
  fileName: string
  fileError: string | null
  onDescargarPlantilla: () => void
  onFileSelected: (file: File) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.55 }}>
        Cargá hasta <b style={{ color: 'var(--text)' }}>{MAX_IMPORT_ROWS} productos</b> a la vez con
        un archivo Excel o CSV. Si nunca lo hiciste, descargá la plantilla y completala con tus
        productos.
      </p>

      <div style={{
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'rgba(0,170,255,0.08)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <FileSpreadsheet size={18} color="var(--ac)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
            Plantilla con ejemplos
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            6 columnas: nombre, precio, stock, categoria, sku, codigo_barras
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Download size={13} />}
          onClick={onDescargarPlantilla}
        >
          Descargar
        </Button>
      </div>

      <label
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 12,
          padding: '22px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          cursor: parsing ? 'progress' : 'pointer',
          background: 'var(--bg2)',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          disabled={parsing}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onFileSelected(f)
            e.target.value = '' // permite reseleccionar el mismo archivo
          }}
        />
        <Upload size={22} color="var(--text2)" strokeWidth={1.8} />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {parsing
            ? 'Procesando archivo...'
            : fileName
              ? fileName
              : 'Clic para elegir un archivo'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
          .xlsx, .xls o .csv · hasta 5 MB
        </div>
      </label>

      {fileError && (
        <div style={{
          background: 'rgba(255,71,87,0.08)',
          border: '1px solid rgba(255,71,87,0.25)',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 12.5,
          color: 'var(--r)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.5 }}>{fileError}</span>
        </div>
      )}
    </div>
  )
}

// ───── Step: Preview ───────────────────────────────────────────────

function PreviewStep({
  validated, stats, fileName,
}: {
  validated: ValidatedRow[]
  stats: ImportStats
  fileName: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
        <FileSpreadsheet size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
        <b style={{ color: 'var(--text)' }}>{fileName}</b> · {stats.total} fila{stats.total === 1 ? '' : 's'}
      </div>

      {/* Resumen — 3 chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatChip
          icon={<CheckCircle2 size={13} />}
          color="var(--g)"
          bg="rgba(0,200,150,0.10)"
          label={`${stats.ok} para importar`}
        />
        {stats.duplicados > 0 && (
          <StatChip
            icon={<Copy size={13} />}
            color="#e8a93b"
            bg="rgba(232,169,59,0.10)"
            label={`${stats.duplicados} duplicado${stats.duplicados === 1 ? '' : 's'} (se saltean)`}
          />
        )}
        {stats.errores > 0 && (
          <StatChip
            icon={<AlertCircle size={13} />}
            color="var(--r)"
            bg="rgba(255,71,87,0.10)"
            label={`${stats.errores} con error${stats.errores === 1 ? '' : 'es'} (se saltean)`}
          />
        )}
      </div>

      {/* Tabla scrolleable */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        maxHeight: 320,
        overflowY: 'auto',
        background: 'var(--bg2)',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}>
          <thead style={{
            position: 'sticky',
            top: 0,
            background: 'var(--bg3)',
            zIndex: 1,
          }}>
            <tr>
              <th style={th}>Fila</th>
              <th style={th}>Estado</th>
              <th style={th}>Nombre</th>
              <th style={{ ...th, textAlign: 'right' }}>Precio</th>
              <th style={{ ...th, textAlign: 'right' }}>Stock</th>
              <th style={th}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {validated.map(r => (
              <tr key={r.line} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}>{r.line}</td>
                <td style={td}><StatusBadge status={r.status} /></td>
                <td style={{ ...td, fontWeight: 500, color: 'var(--text)' }}>
                  {r.raw.nombre || <span style={{ color: 'var(--text2)' }}>—</span>}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {r.parsed ? `$${r.parsed.precio.toLocaleString('es-AR')}` : (r.raw.precio || '—')}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {r.parsed ? r.parsed.stock : (r.raw.stock || '0')}
                </td>
                <td style={{ ...td, color: 'var(--text2)', maxWidth: 220 }}>
                  {r.reason || ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stats.ok === 0 && (
        <div style={{
          background: 'rgba(255,71,87,0.06)',
          border: '1px solid rgba(255,71,87,0.20)',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 12,
          color: 'var(--r)',
        }}>
          No hay filas válidas para importar. Revisá los errores arriba, corregí el archivo y volvelo a subir.
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text2)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  color: 'var(--text)',
  verticalAlign: 'top',
}

function StatChip({ icon, color, bg, label }: { icon: React.ReactNode; color: string; bg: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      borderRadius: 999,
      background: bg,
      color,
      fontSize: 12,
      fontWeight: 600,
    }}>
      {icon}{label}
    </span>
  )
}

function StatusBadge({ status }: { status: ValidatedRow['status'] }) {
  if (status === 'ok') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999,
        background: 'rgba(0,200,150,0.12)', color: 'var(--g)',
        fontSize: 11, fontWeight: 600,
      }}><CheckCircle2 size={11} /> OK</span>
    )
  }
  if (status === 'duplicate') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999,
        background: 'rgba(232,169,59,0.12)', color: '#e8a93b',
        fontSize: 11, fontWeight: 600,
      }}><Copy size={11} /> Duplicado</span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      background: 'rgba(255,71,87,0.12)', color: 'var(--r)',
      fontSize: 11, fontWeight: 600,
    }}><AlertCircle size={11} /> Error</span>
  )
}

// ───── Step: Done ──────────────────────────────────────────────────

function DoneStep({
  resultado, stats,
}: {
  resultado: { inserted: number; error?: string }
  stats: ImportStats | null
}) {
  const exito = resultado.inserted > 0 && !resultado.error
  return (
    <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
      <div style={{
        width: 64, height: 64,
        borderRadius: '50%',
        background: exito ? 'rgba(0,200,150,0.10)' : 'rgba(255,71,87,0.10)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
      }}>
        {exito
          ? <CheckCircle2 size={30} color="var(--g)" strokeWidth={1.8} />
          : <AlertCircle size={30} color="var(--r)" strokeWidth={1.8} />}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        {exito
          ? `${resultado.inserted} producto${resultado.inserted === 1 ? '' : 's'} importado${resultado.inserted === 1 ? '' : 's'}`
          : 'No pudimos importar'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
        {resultado.error
          ? resultado.error
          : stats
            ? `${stats.duplicados > 0 ? `${stats.duplicados} duplicado(s) salteado(s). ` : ''}${stats.errores > 0 ? `${stats.errores} fila(s) con error.` : ''}`
            : ''}
      </div>
    </div>
  )
}
