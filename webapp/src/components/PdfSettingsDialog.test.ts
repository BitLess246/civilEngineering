import { describe, it, expect } from 'vitest'
import src from './PdfSettingsDialog.tsx?raw'
import buttonSrc from './ExportPdfButton.tsx?raw'
import exportDialogSrc from './ExportReportDialog.tsx?raw'

// Source guards, in the style ExportReportDialog.test.ts uses — the repo has
// no DOM harness, and these are wiring decisions a refactor would quietly
// drop. The dialog itself was exercised in a browser (Playwright): fill,
// upload, save, Escape-discards, export.

describe('PDF appearance dialog', () => {
  it('is portalled to <body> — calculator tab strips painted over it in place', () => {
    expect(src).toMatch(/createPortal\(/)
    expect(src).toContain('document.body')
  })

  it('stores only on Save: Cancel, Escape and the backdrop leave the saved style alone', () => {
    expect(src.match(/savePdfStyle\(/g)).toHaveLength(1)
    expect(src).toMatch(/const save = \(\) => \{ savePdfStyle\(s\); onClose\(\) \}/)
  })

  it('a logo is re-encoded to PNG and passed through the same sanitiser as storage', () => {
    expect(src).toContain("toDataURL('image/png')")
    expect(src).toMatch(/sanitizePdfStyle\(\{ \.\.\.s, logo: png \}\)\.logo/)
  })

  it('every Export PDF button carries the settings gear', () => {
    expect(buttonSrc).toMatch(/<PdfSettingsButton open=\{settings\} setOpen=\{setSettings\} \/>/)
  })

  it('the report export dialog offers it, and does not close under it on Escape', () => {
    expect(exportDialogSrc).toContain('<PdfSettingsButton')
    expect(exportDialogSrc).toMatch(/e\.key === 'Escape' && !appearance/)
  })
})
