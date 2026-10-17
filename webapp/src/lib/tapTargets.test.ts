import { describe, it, expect } from 'vitest'
import css from '../index.css?raw'
import workspaceSrc from '../components/workspace.tsx?raw'
import seismicSrc from '../pages/SeismicWizard.tsx?raw'

// WCAG 2.2 SC 2.5.8 — a pointer target is at least 24 × 24 CSS px. A phone
// sweep of every route found standalone controls of 15–22 px (the ✕ that
// removes a row, the '?' code hint, "⤢ Full size", "Explain this check").
// On a coarse pointer the hit area grows to 24 px without the control changing
// size. Verified in a mobile emulation with elementFromPoint at the grown edge;
// guarded here against a stylesheet edit dropping it.
describe('touch targets', () => {
  const block = css.slice(css.indexOf('@media (pointer: coarse)'))

  it('grows every button\'s hit area to 24 px on a coarse pointer, in the base layer', () => {
    expect(block.length).toBeGreaterThan(0)
    const layer = css.lastIndexOf('@layer base', css.indexOf('@media (pointer: coarse)'))
    expect(layer).toBeGreaterThan(-1)
    expect(block).toMatch(/button::after/)
    for (const side of ['top', 'bottom', 'left', 'right'])
      expect(block).toContain(`${side}: min(0px, calc((100% - 24px) / 2));`)
  })

  it('the standalone "Explain" links opt in', () => {
    expect(workspaceSrc).toMatch(/Explain this check ↗/)
    expect(workspaceSrc).toMatch(/data-pdf-skip="" data-tap=""/)
    expect(seismicSrc).toMatch(/data-pdf-skip data-tap/)
  })
})
