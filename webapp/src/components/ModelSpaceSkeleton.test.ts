import { describe, it, expect } from 'vitest'
import skeleton from './ModelSpaceSkeleton.tsx?raw'
import page from '../pages/ModelSpace.tsx?raw'

// ─────────────────────────────────────────────────────────────────────────
// The skeleton only works if it is the SAME SIZE as the thing it stands in
// for — that is the whole point of it, and it is invisible when it stops being
// true: the page still loads, the footer just jumps again.
//
// So the boxes that decide the page's height are asserted to be written
// identically in both files. This is a source-text comparison, which is
// fragile by nature; it is fragile in the useful direction. Change the
// workspace grid and this fails, naming the file that has to change with it,
// instead of the shift being noticed months later on a slow connection.
// ─────────────────────────────────────────────────────────────────────────

/** The workspace grid — one column on small screens, viewport + 380 px rail on
 *  large, with the height that decides where the footer lands.
 *
 *  The height is now `var(--ws-h)` rather than a `calc` constant: the page
 *  measures its own chrome and writes the variable, and both files fall back
 *  to `WORKSPACE_FALLBACK_CSS` before anything is measured. The class string
 *  is what this compares, so it stays identical either way. */
const GRID = 'grid grid-cols-1 gap-4 p-4 lg:h-[var(--ws-h)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_380px]'

/** The dark viewport panel inside it. */
const VIEWPORT = 'relative h-[80vh] min-h-[460px] overflow-hidden rounded-lg border border-hairline bg-rail lg:h-full lg:min-h-0'

/**
 * Every `className="…"` literal in a file.
 *
 * ASSERTIONS ABOUT CLASSES READ CLASSES. Two of the checks below were first
 * written against the whole source and both passed for the wrong reason: one
 * matched `max-w-[1700px]` inside a COMMENT explaining why the cap was
 * removed, the other matched the viewport's own legitimate `min-h-[460px]`.
 * This repo has now shipped that same mistake in three different guards, so it
 * is worth naming every time: a file MENTIONING a class is not a file USING it.
 */
const classes = (src: string) =>
  [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]).join(' ')

describe('the model-space skeleton is the size of the hole it fills', () => {
  it('uses the page\'s own workspace grid, verbatim', () => {
    expect(page).toContain(GRID)
    expect(skeleton).toContain(GRID)
  })

  it('uses the page\'s own viewport panel, verbatim', () => {
    expect(page).toContain(VIEWPORT)
    expect(skeleton).toContain(VIEWPORT)
  })

  it('reserves the ribbon height from the constant the page shares', () => {
    // The ribbon is the one box the skeleton does NOT mirror by copying: the
    // real one is twelve commands under five group labels, and a second copy
    // of that would drift. It reserves a stated height instead. What changed
    // is where the number comes from — a literal in this file, which is how
    // the 35 px shift came back the first time, against one constant both
    // files import, which cannot disagree with itself.
    expect(skeleton).toContain('RIBBON_ESTIMATE_PX')
    // The reservation must not ALSO be a class literal — two sources for one
    // height is the disagreement this is meant to make impossible. The
    // viewport's own `min-h-[460px]` is a different box and stays.
    expect(classes(skeleton)).not.toMatch(/min-h-\[76px\]/)
  })

  it('falls back to the SAME height the page does', () => {
    // The two files must state one height or the footer jumps at the moment
    // the real workspace replaces the placeholder — which is the entire defect
    // the skeleton exists to prevent, so it is asserted rather than assumed.
    // THE CONSTANT IN THE STYLE, not merely in the file. Written first as
    // `toContain('WORKSPACE_FALLBACK_CSS')`, which the IMPORT LINE satisfies
    // on its own: a sabotage that swapped the value for a literal and left
    // the import passed clean. Same hole as the `includes('DrawingFrame')`
    // one in `drawingFrame.test.ts` — an assertion about what a file USES has
    // to read the place it is used.
    for (const [name, srcText] of [['skeleton', skeleton], ['page', page]] as const) {
      const assigns = [...srcText.matchAll(/'--ws-h':\s*([^,}]+)/g)].map((m) => m[1].trim())
      expect(assigns.length, `${name} never sets --ws-h`).toBe(1)
      expect(assigns[0], `${name} sets --ws-h from a literal`)
        .toContain('WORKSPACE_FALLBACK_CSS')
    }
    // And neither may re-introduce the old constant anywhere.
    expect(skeleton).not.toContain('calc(100vh-6.5rem)')
    expect(page).not.toContain('calc(100vh-6.5rem)')
  })

  it('is as wide as the page, now that the page has no centred cap', () => {
    // Both dropped `mx-auto max-w-[1700px]` together. A skeleton still capped
    // at 1700 px under a full-width page shifts the viewport sideways the
    // instant the chunk lands — the horizontal twin of the footer shift.
    expect(classes(page)).not.toContain('max-w-[1700px]')
    expect(classes(skeleton)).not.toContain('max-w-[1700px]')
    expect(classes(page)).toContain('w-full')
    expect(classes(skeleton)).toContain('w-full')
  })

  it('says what it is doing, for a reader who cannot see the boxes', () => {
    expect(skeleton).toContain('aria-busy')
    expect(skeleton).toContain('role="status"')
    // The shimmer blocks are decoration; a screen reader should get the one
    // sentence and none of them.
    expect(skeleton).toContain('aria-hidden')
  })
})

describe('the shell keeps the footer at the bottom', () => {
  it('is a column with the content region taking the slack', async () => {
    // A short page — sign-in, a 404, a lazy page still loading — used to leave
    // the footer floating mid-screen with dead space under it, because the
    // shell stretched to full height but stacked its children in block flow.
    const shell = (await import('./AppShell.tsx?raw')).default
    expect(shell).toContain('flex min-w-0 flex-1 flex-col')
    // The classes are the contract; an inline style alongside them (the embed
    // preview's pointer lock) does not touch it.
    expect(shell).toMatch(/<main id="content" className="min-h-0 flex-1"[^>]*>/)
  })
})
