import { useRef, useState, type JSX } from 'react'
import { importFoundationWorkbook, downloadFoundationTemplate, TEMPLATE_GUIDE, type BatchResult } from '../lib/foundationExcel'

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
)

export function ExcelImport({ onResult }: { onResult: (r: BatchResult | null) => void }): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('No file chosen')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name); setError(null); setBusy(true); onResult(null)
    try {
      onResult(await importFoundationWorkbook(f))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-print mt-4 rounded-xl border border-hairline bg-sheet-2 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[0.92rem] font-bold text-ink">Import from Excel</span>

        {/* The button above is the control; this input only carries the file
            dialog. Left focusable it is an unnamed second tab stop for the
            same action (axe: `label`, critical), so it is taken out of the
            tab order — and still named, because `.click()` can focus it. */}
        <input ref={fileRef} type="file" accept=".xlsx" className="sr-only" tabIndex={-1}
          aria-label="Choose an .xlsx file to import" onChange={onPick} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-on-solid shadow-sm transition hover:shadow disabled:opacity-60">
          <UploadIcon />{busy ? 'Reading…' : 'Choose file'}
        </button>
        <span className="text-[0.83rem] text-muted">{fileName}</span>

        <button type="button" onClick={() => void downloadFoundationTemplate()}
          className="inline-flex items-center gap-2 rounded-lg border border-field-line bg-sheet px-3.5 py-2 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand-tint">
          <DownloadIcon />Blank template
        </button>

        <span className="ml-auto inline-flex items-center gap-2 text-[0.83rem] text-muted">
          One row = one foundation.
          <button type="button" onClick={() => setShowHelp(true)}
            className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
            <InfoIcon />What format?
          </button>
        </span>
      </div>

      {error && <p className="mt-2 text-sm text-fail">⚠ {error}</p>}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
          role="dialog" aria-modal="true" aria-label="Excel upload format" onClick={() => setShowHelp(false)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-xl bg-sheet shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <h3 className="text-base font-bold text-brand">Excel upload format</h3>
              <button type="button" onClick={() => setShowHelp(false)} aria-label="Close"
                className="text-2xl leading-none text-muted hover:text-ink">×</button>
            </div>
            <div className="px-5 py-4 text-sm text-muted">
              <p>
                The workbook must contain a sheet named <strong>DESIGN PARAMETERS</strong>. Row 1 holds the
                column headers; each row below is one footing, so you can design many at once. Unknown headers
                are ignored and listed after import.
              </p>
              <p className="mt-2">
                Use <em>Blank template</em> for a ready-to-fill copy with sample rows and a guide sheet. This
                React import supports <strong>Isolated Square</strong> and <strong>Isolated Rectangular</strong>
                (concentric) footings.
              </p>
              <table className="mt-3 w-full border-collapse text-[0.82rem]">
                <thead>
                  <tr className="border-b border-hairline text-left text-muted">
                    <th className="py-1.5 pr-3 font-semibold">Header</th>
                    <th className="py-1.5 pr-3 font-semibold">Req</th>
                    <th className="py-1.5 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {TEMPLATE_GUIDE.map((g) => (
                    <tr key={g.header} className="border-b border-hairline-2 align-top">
                      <td className="py-1.5 pr-3 font-medium text-ink-2">{g.header}</td>
                      <td className="py-1.5 pr-3 text-muted">{g.required ? '✓' : ''}</td>
                      <td className="py-1.5 text-muted">{g.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
