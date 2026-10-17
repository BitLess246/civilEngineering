// "How should my PDFs look?" — the firm's letterhead, paper, watermark and
// approval block, set once and used by every export (`lib/pdfStyle`).
//
// Saved in this browser on Save, never per keystroke: Cancel, Escape and the
// backdrop leave the stored style as it was. The preview is the masthead as
// the PDF draws it — logo, name, tagline, the accent rule — so a colour or a
// logo that does not work is seen here rather than in a downloaded file.
//
// Portalled to <body>: it opens from inside calculator cards and sticky tab
// strips whose stacking contexts would otherwise paint over a `fixed` overlay.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DEFAULT_PDF_STYLE, WATERMARKS, loadPdfStyle, savePdfStyle, sanitizePdfStyle, watermarkLabel,
  type PdfStyle, type WatermarkKind,
} from '../lib/pdfStyle'
import { BRAND_MARK } from '../lib/brand'

/** Longest side of a stored logo, px — ~3× its 9 mm print height at 300 dpi
 *  is plenty, and keeps the data URL inside `LOGO_MAX_CHARS`. */
const LOGO_PX = 480

/** Any image the browser can decode (SVG and WebP included) → a PNG data URL
 *  the PDF writer can embed, scaled to fit `LOGO_PX`. */
async function logoToPng(file: Blob, maxPx = LOGO_PX): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, maxPx / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
    const w = Math.max(1, Math.round((img.naturalWidth || maxPx) * k))
    const h = Math.max(1, Math.round((img.naturalHeight || maxPx) * k))
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return c.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

const WATERMARK_LABEL: Record<WatermarkKind, string> = {
  none: 'None', DRAFT: 'DRAFT', PRELIMINARY: 'PRELIMINARY', 'FOR REVIEW': 'FOR REVIEW',
  'NOT FOR CONSTRUCTION': 'NOT FOR CONSTRUCTION', custom: 'Custom…',
}

export function PdfSettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<PdfStyle>(() => loadPdfStyle())
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const set = <K extends keyof PdfStyle>(k: K, v: PdfStyle[K]) => setS((o) => ({ ...o, [k]: v }))

  const close = useCallback(() => onClose(), [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [close])

  const pickLogo = async (f: File | undefined) => {
    if (!f) return
    setLogoError(null)
    try {
      const png = await logoToPng(f)
      const clean = sanitizePdfStyle({ ...s, logo: png }).logo
      if (!clean) { setLogoError('That image is too large to embed — try a smaller file.'); return }
      set('logo', clean)
    } catch {
      setLogoError('That file could not be read as an image.')
    }
  }

  const save = () => { savePdfStyle(s); onClose() }
  const mark = watermarkLabel(s)

  const field = 'mt-0.5 w-full rounded-md border border-hairline bg-paper px-2 py-1 text-[12px] text-ink focus:border-brand focus:outline-none'
  const label = 'block text-[10.5px] font-semibold uppercase tracking-wider text-muted'
  const check = (k: 'coverPage' | 'signatures', text: string, hint: string) => (
    <label className="flex items-start gap-2 rounded-md px-2 py-1 text-[12px] text-ink-2 hover:bg-sheet-2">
      <input type="checkbox" className="mt-0.5" checked={s[k]} onChange={() => set(k, !s[k])} />
      <span><span className="font-medium">{text}</span><span className="block text-[10.5px] leading-snug text-faint">{hint}</span></span>
    </label>
  )

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-rail/55 p-4 py-[6vh]"
      onMouseDown={close} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-hairline bg-sheet shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-hairline-2 px-5 py-3">
          <h2 id={`${id}-t`} className="text-[13px] font-bold uppercase tracking-wide text-brand">PDF appearance</h2>
          <p className="mt-0.5 text-[11px] text-muted">Your letterhead, paper and approval block — used by every PDF you export from this browser.</p>
        </div>

        {/* the masthead as the PDF draws it */}
        <div className="border-b border-hairline-2 bg-sheet-2/60 px-5 py-4">
          <div className="relative overflow-hidden rounded-md border border-hairline bg-white px-4 pb-3 pt-3 text-[#111827]" aria-label="Preview">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: s.accent }} />
            {mark && (
              <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[20deg] select-none whitespace-nowrap font-black tracking-[0.2em] opacity-[0.08]"
                style={{ color: s.accent, fontSize: `${Math.min(34, 520 / Math.max(mark.length, 1))}px` }}>{mark}</span>
            )}
            <div className="flex min-w-0 items-center gap-2.5">
              {s.logo && <img src={s.logo} alt="" className="h-9 max-w-[140px] object-contain" />}
              <div className="min-w-0">
                {/* blank, the PDF keeps the app's wordmark — so does the preview */}
                <div className={`truncate text-[15px] font-bold tracking-wide ${s.firmName ? '' : 'uppercase tracking-[0.2em]'}`}>{s.firmName || BRAND_MARK}</div>
                {s.firmTagline && <div className="truncate text-[10px] text-[#6b7280]">{s.firmTagline}</div>}
              </div>
            </div>
            <div className="mt-2.5 flex items-baseline gap-1.5 border-b-2 border-[#111827] pb-0.5 text-[11px] font-bold uppercase tracking-wide">
              <span style={{ color: s.accent }}>1 ·</span><span>Design summary</span>
            </div>
            <div className="mt-2 flex justify-between gap-3 font-mono text-[9px] text-[#9ca3af]">
              <span className="truncate">S-01{s.revision ? ` · REV ${s.revision}` : ''} · {s.paper === 'letter' ? 'Letter' : 'A4'}</span>
              {s.footerNote && <span className="truncate">{s.footerNote}</span>}
              <span className="shrink-0">page 1 / 3</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-2">
          <label className="block"><span className={label}>Firm name</span>
            <input className={field} value={s.firmName} maxLength={80} placeholder="Shown in place of the app name" onChange={(e) => set('firmName', e.target.value)} /></label>
          <label className="block"><span className={label}>Tagline</span>
            <input className={field} value={s.firmTagline} maxLength={120} placeholder="Licence no. · address · website" onChange={(e) => set('firmTagline', e.target.value)} /></label>

          <div>
            <span className={label}>Logo</span>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="rounded-md border border-hairline px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-sheet-2">
                {s.logo ? 'Replace…' : 'Upload…'}
              </button>
              {s.logo && (
                <button type="button" onClick={() => set('logo', '')} className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-sheet-2">Remove</button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" tabIndex={-1} aria-label="Logo file"
                onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <span className="mt-0.5 block text-[10.5px] text-faint">{logoError ?? 'PNG, JPEG, SVG or WebP — printed about 9 mm tall.'}</span>
          </div>
          <div>
            <span className={label}>Accent colour</span>
            <div className="mt-0.5 flex items-center gap-2">
              {/* a swatch of the colour itself, the native picker laid invisibly over it */}
              <span className="relative inline-flex h-7 w-10 overflow-hidden rounded border border-hairline focus-within:ring-2 focus-within:ring-brand" style={{ background: s.accent }}>
                <input type="color" aria-label="Accent colour" value={s.accent} onChange={(e) => set('accent', e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </span>
              <span className="font-mono text-[11.5px] text-muted">{s.accent}</span>
              {s.accent !== DEFAULT_PDF_STYLE.accent && (
                <button type="button" onClick={() => set('accent', DEFAULT_PDF_STYLE.accent)} className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-sheet-2">Reset</button>
              )}
            </div>
          </div>

          <label className="block"><span className={label}>Paper</span>
            <select className={field} value={s.paper} onChange={(e) => set('paper', e.target.value === 'letter' ? 'letter' : 'a4')}>
              <option value="a4">A4 — 210 × 297 mm</option>
              <option value="letter">Letter — 8½ × 11 in</option>
            </select></label>
          <div>
            <label className="block"><span className={label}>Watermark</span>
              <select className={field} value={s.watermark} onChange={(e) => set('watermark', e.target.value as WatermarkKind)}>
                {WATERMARKS.map((w) => <option key={w} value={w}>{WATERMARK_LABEL[w]}</option>)}
              </select></label>
            {s.watermark === 'custom' && (
              <input className={field} value={s.watermarkText} maxLength={40} placeholder="e.g. ISSUED FOR TENDER" aria-label="Watermark text"
                onChange={(e) => set('watermarkText', e.target.value)} />
            )}
          </div>

          <label className="block"><span className={label}>Revision</span>
            <input className={field} value={s.revision} maxLength={12} placeholder="A, B, 0, 1…" onChange={(e) => set('revision', e.target.value)} /></label>
          <label className="block"><span className={label}>Checked by</span>
            <input className={field} value={s.checkedBy} maxLength={80} placeholder="Reviewer’s name" onChange={(e) => set('checkedBy', e.target.value)} /></label>
          <label className="block sm:col-span-2"><span className={label}>Footer note</span>
            <input className={field} value={s.footerNote} maxLength={120} placeholder="Printed under every page — “Confidential”, a job number" onChange={(e) => set('footerNote', e.target.value)} /></label>

          <div className="grid grid-cols-1 gap-1 sm:col-span-2 sm:grid-cols-2">
            {check('coverPage', 'Cover page', 'a title page before the first sheet — project, parties, codes')}
            {check('signatures', 'Approval block', 'Prepared by / Reviewed by lines at the end of a calculation')}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline-2 bg-sheet-2/60 px-5 py-3">
          <button type="button" onClick={() => setS({ ...DEFAULT_PDF_STYLE })}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-muted hover:bg-paper">Restore defaults</button>
          <div className="flex gap-2">
            <button type="button" onClick={close} className="rounded-md px-3 py-1.5 text-[12px] font-medium text-muted hover:bg-paper">Cancel</button>
            <button type="button" onClick={save} className="rounded-md bg-brand px-4 py-1.5 text-[12px] font-semibold text-on-solid hover:bg-brand-hover">Save</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
