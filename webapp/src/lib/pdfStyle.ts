// ─────────────────────────────────────────────────────────────────────────
// PDF STYLE — how a firm wants its calculation sheets to look.
//
// Every generated document (calculator sheets, the structure report, the
// analysis appendix, the soils report) is painted by `pdfKit`, so one style
// object reaches all of them: the masthead (firm name, tagline, logo in place
// of the app wordmark), an accent colour, the paper, a watermark, a footer
// note, the revision and checker printed in the letterhead, whether the
// approval block prints, and an optional cover page.
//
// STORED LOCALLY, like the profile (`auth/profile.ts`) and for the same
// reason: it is cosmetic and per-machine. Read field by field and clamped, so
// a stale or hand-edited value can never break an export — the worst a bad
// value does is fall back to the default.
// ─────────────────────────────────────────────────────────────────────────

export type PaperSize = 'a4' | 'letter'
export type WatermarkKind = 'none' | 'DRAFT' | 'PRELIMINARY' | 'FOR REVIEW' | 'NOT FOR CONSTRUCTION' | 'custom'
export const WATERMARKS: readonly WatermarkKind[] = ['none', 'DRAFT', 'PRELIMINARY', 'FOR REVIEW', 'NOT FOR CONSTRUCTION', 'custom']

export interface PdfStyle {
  /** Printed in the masthead in place of the app wordmark when set. */
  firmName: string
  /** One small line under the firm name — address, licence, website. */
  firmTagline: string
  /** PNG or JPEG data URL, or '' for none. Capped at `LOGO_MAX_CHARS`. */
  logo: string
  /** Section rules, badges and the cover band — `#rrggbb`. */
  accent: string
  paper: PaperSize
  watermark: WatermarkKind
  /** The watermark's text when `watermark` is 'custom'. */
  watermarkText: string
  /** A line printed under every page's footer — "Confidential", a job number. */
  footerNote: string
  /** Revision mark, printed in the letterhead and the footer — "A", "2". */
  revision: string
  /** Printed under the "Reviewed by" line and in the letterhead. */
  checkedBy: string
  /** A title page before the first sheet. */
  coverPage: boolean
  /** The Prepared by / Reviewed by block at the end of a calculation. */
  signatures: boolean
}

export const DEFAULT_ACCENT = '#0f4c92'
export const DEFAULT_PDF_STYLE: PdfStyle = {
  firmName: '', firmTagline: '', logo: '', accent: DEFAULT_ACCENT, paper: 'a4',
  watermark: 'none', watermarkText: '', footerNote: '', revision: '', checkedBy: '',
  coverPage: false, signatures: true,
}

/** ~300 kB of base64 — a logo, not a photograph. */
export const LOGO_MAX_CHARS = 400_000

const KEY = 'civeng-pdf-style'
type Store = Pick<Storage, 'getItem' | 'setItem'>
const defaultStore = (): Store | null => {
  try { return window.localStorage } catch { return null }
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** `#rrggbb` (or `#rgb`) → RGB, null when it is not a colour. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Only an image data URL the PDF writer can embed, within the size cap. */
export function cleanLogo(v: unknown): string {
  if (typeof v !== 'string' || v.length > LOGO_MAX_CHARS) return ''
  return /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : ''
}

/** Any stored or typed value → a valid style, field by field. */
export function sanitizePdfStyle(raw: unknown): PdfStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const accent = typeof r.accent === 'string' && hexToRgb(r.accent) ? r.accent.trim() : DEFAULT_ACCENT
  return {
    firmName: str(r.firmName, 80),
    firmTagline: str(r.firmTagline, 120),
    logo: cleanLogo(r.logo),
    accent: accent.startsWith('#') ? accent : `#${accent}`,
    paper: r.paper === 'letter' ? 'letter' : 'a4',
    watermark: WATERMARKS.includes(r.watermark as WatermarkKind) ? r.watermark as WatermarkKind : 'none',
    watermarkText: str(r.watermarkText, 40),
    footerNote: str(r.footerNote, 120),
    revision: str(r.revision, 12),
    checkedBy: str(r.checkedBy, 80),
    coverPage: r.coverPage === true,
    signatures: r.signatures !== false,
  }
}

export function loadPdfStyle(store: Store | null = defaultStore()): PdfStyle {
  try {
    const raw = store?.getItem(KEY)
    return sanitizePdfStyle(raw ? JSON.parse(raw) : {})
  } catch {
    return { ...DEFAULT_PDF_STYLE }
  }
}

/** Persist. Silent on failure — private mode, or a logo over the quota. */
export function savePdfStyle(s: PdfStyle, store: Store | null = defaultStore()): void {
  try { store?.setItem(KEY, JSON.stringify(sanitizePdfStyle(s))) } catch { /* storage unavailable */ }
}

/** The watermark's text, or null when there is none. */
export function watermarkLabel(s: PdfStyle): string | null {
  if (s.watermark === 'none') return null
  if (s.watermark === 'custom') return s.watermarkText.trim().toUpperCase() || null
  return s.watermark
}

/** Paper size in mm, portrait. */
export function paperSize(p: PaperSize): { w: number; h: number } {
  return p === 'letter' ? { w: 215.9, h: 279.4 } : { w: 210, h: 297 }
}

/** `c` mixed toward white by `t` (0 = c, 1 = white) — the accent's tints. */
export function tint(c: [number, number, number], t: number): [number, number, number] {
  return c.map((v) => Math.round(v + (255 - v) * t)) as [number, number, number]
}
