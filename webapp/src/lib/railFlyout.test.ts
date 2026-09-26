/**
 * The collapsed rail's flyout survives the pointer crossing to it.
 *
 * WHY THIS IS A GUARD AND NOT JUST A FIX. `place()` puts the panel at
 * `btn.right + 6` and the panel is `position: fixed` — visually detached from
 * the 44 px icon it hangs off. `mouseleave` respects DOM containment, so an
 * instantaneous jumpfrom icon to panel would be safe; a real pointer instead
 * crosses 6 px of RAIL, which is not a descendant of the wrapper, and the panel
 * unmounted under a pointer on its way to it. Every tool in the collapsed rail
 * was unreachable by mouse.
 *
 * The property is "a close is DEFERRED and CANCELLABLE", which is visible in
 * the source; whether 180 ms feels right is not something a test can say, and
 * this file does not pretend to.
 */
import { describe, it, expect } from 'vitest'

const SOURCES = import.meta.glob('../**/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const appShell = () => {
  const hit = Object.entries(SOURCES).find(([f]) => f.endsWith('components/AppShell.tsx'))
  if (!hit) throw new Error('AppShell.tsx not found — the glob moved')
  return hit[1]
}

describe('the rail flyout closes on a delay, not on the first mouseleave', () => {
  it('never wires mouseLeave straight to a close', () => {
    // The regression, exactly: `onMouseLeave={() => setOpen(false)}`.
    expect(appShell(), 'immediate close is back').not.toMatch(/onMouseLeave=\{\(\) => setOpen\(false\)\}/)
  })

  it('arms a cancellable timer instead', () => {
    const src = appShell()
    expect(src).toMatch(/const armClose = \(\) => \{/)
    expect(src).toMatch(/const cancelClose = \(\) => \{/)
    expect(src).toMatch(/onMouseLeave=\{armClose\}/)
  })

  it('cancels the timer when the pointer reaches the PANEL', () => {
    // Without this the delay only buys time — the panel would still shut while
    // the pointer sat on it, which is the same bug one beat later.
    expect(appShell()).toMatch(/onMouseEnter=\{cancelClose\}/)
  })

  it('cancels the timer when the pointer returns to the icon', () => {
    expect(appShell()).toMatch(/onMouseEnter=\{enter\}/)
  })

  it('clears a pending close on unmount', () => {
    // A timer that outlives the node calls setState on an unmounted component
    // the first time the rail is collapsed with a flyout open.
    expect(appShell()).toMatch(/useEffect\(\(\) => cancelClose, \[\]\)/)
  })

  it('keeps the keyboard close paths', () => {
    // The delay is for pointers. Escape and blur-out must still shut it at once,
    // or a keyboard user is left with a panel they cannot dismiss.
    const src = appShell()
    expect(src).toMatch(/Escape.*cancelClose\(\); setOpen\(false\)/)
    expect(src).toMatch(/onBlur=\{onBlur\}/)
  })

  it('portals the panel to document.body, out of the rail scroller', () => {
    // `position: fixed` escapes the overflow CLIP, but Chromium still
    // composites a fixed descendant with its scroll container — and the WebGL
    // canvas won that compositing, so a flyout overlapping the 3D viewport
    // painted UNDER it. At the body no scroller stands above the panel; the
    // coordinates were already viewport-relative, so placing is untouched.
    const src = appShell()
    expect(src).toMatch(/import \{ createPortal \} from 'react-dom'/)
    expect(src).toMatch(/createPortal\(flyout, document\.body\)/)
  })

  it('treats the portalled panel as inside for blur-out', () => {
    // The portal puts the panel OUTSIDE the wrapper in the DOM. A blur check
    // against the wrapper alone would read tabbing from the icon into the
    // panel as leaving, and unmount the panel under the keyboard user.
    expect(appShell()).toMatch(/!panel\.current\?\.contains\(next\)/)
  })
})

describe('optimize leaves the report reading its own sections', () => {
  const modelSpace = () => {
    const hit = Object.entries(SOURCES).find(([f]) => f.endsWith('pages/ModelSpace.tsx'))
    if (!hit) throw new Error('ModelSpace.tsx not found')
    return hit[1]
  }

  it('re-analyses once the optimiser resolves', () => {
    // The optimiser replaces every member's section, which changes the
    // stiffness. Without this the stored analysis/drift/irregularity/stability
    // still describe the PRE-optimisation structure, and the PDF prints those
    // forces beside the new sections.
    expect(modelSpace()).toMatch(/void analyzeModel\(r\.model\)/)
  })

  it('hands the solver the model the optimiser produced, not the stale closure', () => {
    // `save(r.model)` has not reached this closure when the promise resolves, so
    // an argument-less re-analysis would solve the OLD sections and store the
    // result as current — worse than not re-analysing, because it looks done.
    const src = modelSpace()
    expect(src).toMatch(/const analyzeModel = \(on\?: StructuralModel\) => \{/)
    expect(src).toMatch(/const target = on \?\? model/)
    expect(src).toMatch(/run\('analyze', \{\s*\n?\s*model: target/)
  })
})
