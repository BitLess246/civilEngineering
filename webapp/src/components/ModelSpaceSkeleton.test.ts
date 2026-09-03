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
 *  large, with the height that decides where the footer lands. */
const GRID = 'grid grid-cols-1 gap-4 p-4 lg:h-[calc(100vh-6.5rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_380px]'

/** The dark viewport panel inside it. */
const VIEWPORT = 'relative h-[80vh] min-h-[460px] overflow-hidden rounded-lg border border-[#e3e1da] bg-[#0f1b2a] lg:h-full lg:min-h-0'

describe('the model-space skeleton is the size of the hole it fills', () => {
  it('uses the page\'s own workspace grid, verbatim', () => {
    expect(page).toContain(GRID)
    expect(skeleton).toContain(GRID)
  })

  it('uses the page\'s own viewport panel, verbatim', () => {
    expect(page).toContain(VIEWPORT)
    expect(skeleton).toContain(VIEWPORT)
  })

  it('reserves the ribbon height explicitly', () => {
    // The ribbon is the one box the skeleton does NOT mirror by copying: the
    // real one wraps eleven tabs under five group labels, and a second copy of
    // that would drift. It is a measured height instead — 76 px, checked by
    // rendering both and comparing — so what this can assert is that the
    // reservation is still there at all. Dropping it is how the 35 px shift
    // came back the first time.
    expect(skeleton).toMatch(/min-h-\[\d+px\]/)
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
    expect(shell).toMatch(/<main className="min-h-0 flex-1">/)
  })
})
