import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PDF_STYLE, DEFAULT_ACCENT, LOGO_MAX_CHARS, sanitizePdfStyle, loadPdfStyle, savePdfStyle,
  hexToRgb, cleanLogo, watermarkLabel, paperSize, tint,
} from './pdfStyle'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function memStore(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) } }
}

describe('hexToRgb', () => {
  it('reads #rrggbb, #rgb and the bare form', () => {
    expect(hexToRgb('#0f4c92')).toEqual([15, 76, 146])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('c0392b')).toEqual([192, 57, 43])
  })
  it('null for anything that is not a colour', () => {
    for (const v of ['', 'blue', '#12345', '#ggg', 'rgb(1,2,3)']) expect(hexToRgb(v), v).toBeNull()
  })
})

describe('tint', () => {
  it('0 is the colour, 1 is white, halfway is halfway', () => {
    expect(tint([0, 100, 200], 0)).toEqual([0, 100, 200])
    expect(tint([0, 100, 200], 1)).toEqual([255, 255, 255])
    expect(tint([0, 100, 200], 0.5)).toEqual([128, 178, 228])
  })
})

describe('paperSize', () => {
  it('A4 is 210 × 297 mm, Letter 8.5 × 11 in', () => {
    expect(paperSize('a4')).toEqual({ w: 210, h: 297 })
    expect(paperSize('letter').w).toBeCloseTo(8.5 * 25.4, 6)
    expect(paperSize('letter').h).toBeCloseTo(11 * 25.4, 6)
  })
})

describe('cleanLogo', () => {
  it('keeps a PNG or JPEG data URL', () => {
    expect(cleanLogo(PNG)).toBe(PNG)
    expect(cleanLogo(PNG.replace('image/png', 'image/jpeg'))).not.toBe('')
  })
  it('drops what the PDF writer cannot embed, and anything over the cap', () => {
    expect(cleanLogo('data:image/svg+xml;base64,PHN2Zz4=')).toBe('')
    expect(cleanLogo('https://example.com/logo.png')).toBe('')
    expect(cleanLogo('data:image/png;base64,<script>')).toBe('')
    expect(cleanLogo(`data:image/png;base64,${'A'.repeat(LOGO_MAX_CHARS)}`)).toBe('')
    expect(cleanLogo(42)).toBe('')
  })
})

describe('sanitizePdfStyle', () => {
  it('nothing → the default', () => {
    expect(sanitizePdfStyle(undefined)).toEqual(DEFAULT_PDF_STYLE)
    expect(sanitizePdfStyle('junk')).toEqual(DEFAULT_PDF_STYLE)
  })
  it('a bad value falls back field by field, never the whole style', () => {
    const s = sanitizePdfStyle({ firmName: '  Acme Structural  ', accent: 'not-a-colour', paper: 'A3', watermark: 'TOP SECRET', signatures: 'no' })
    expect(s.firmName).toBe('Acme Structural')
    expect(s.accent).toBe(DEFAULT_ACCENT)
    expect(s.paper).toBe('a4')
    expect(s.watermark).toBe('none')
    expect(s.signatures).toBe(true)                    // only an explicit false turns it off
  })
  it('clamps lengths and normalises a bare hex', () => {
    const s = sanitizePdfStyle({ firmName: 'x'.repeat(500), revision: 'REV-ABCDEFGHIJKLMNOP', accent: 'c0392b' })
    expect(s.firmName).toHaveLength(80)
    expect(s.revision).toHaveLength(12)
    expect(s.accent).toBe('#c0392b')
  })
})

describe('load / save', () => {
  it('round-trips', () => {
    const st = memStore()
    const style = { ...DEFAULT_PDF_STYLE, firmName: 'Acme', paper: 'letter' as const, watermark: 'DRAFT' as const, coverPage: true, logo: PNG }
    savePdfStyle(style, st)
    expect(loadPdfStyle(st)).toEqual(style)
  })
  it('a corrupt or missing entry loads as the default', () => {
    const st = memStore()
    expect(loadPdfStyle(st)).toEqual(DEFAULT_PDF_STYLE)
    st.data.set('civeng-pdf-style', '{not json')
    expect(loadPdfStyle(st)).toEqual(DEFAULT_PDF_STYLE)
    expect(loadPdfStyle(null)).toEqual(DEFAULT_PDF_STYLE)
  })
  it('a store that throws on write is silent', () => {
    expect(() => savePdfStyle(DEFAULT_PDF_STYLE, { getItem: () => null, setItem: () => { throw new Error('quota') } })).not.toThrow()
  })
})

describe('watermarkLabel', () => {
  it('none → null; a preset is its own text; custom is uppercased, empty → null', () => {
    expect(watermarkLabel(DEFAULT_PDF_STYLE)).toBeNull()
    expect(watermarkLabel({ ...DEFAULT_PDF_STYLE, watermark: 'DRAFT' })).toBe('DRAFT')
    expect(watermarkLabel({ ...DEFAULT_PDF_STYLE, watermark: 'custom', watermarkText: 'issued for tender' })).toBe('ISSUED FOR TENDER')
    expect(watermarkLabel({ ...DEFAULT_PDF_STYLE, watermark: 'custom', watermarkText: '  ' })).toBeNull()
  })
})
