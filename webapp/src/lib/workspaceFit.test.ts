/**
 * The workspace height, as arithmetic.
 *
 * What this replaces is the thing worth stating: a hard-coded
 * `calc(100vh-6.5rem)` that encoded another element's height as a constant.
 * These check the two properties that constant could not have — that the row
 * shrinks by exactly what the chrome takes, and that it stops shrinking before
 * the 3D view disappears.
 */
import { describe, it, expect } from 'vitest'
import { workspaceHeight, workspaceHeightCss, WORKSPACE_MIN_PX } from './workspaceFit'

describe('workspaceHeight', () => {
  it('is the window less exactly the chrome pinned above it', () => {
    // A 1080-tall window under a 44 px header and a 74 px ribbon.
    expect(workspaceHeight(1080, 118)).toBe(962)
    // The old constant's own case: header 44 + a one-row ribbon 60 = 104,
    // which is where 6.5rem came from. Same answer, now derived.
    expect(workspaceHeight(900, 104)).toBe(796)
  })

  it('tracks a ribbon that grew, which is what the constant could not', () => {
    // The Office ribbon is two rows. Every extra pixel it takes comes off the
    // row below, rather than pushing it off the bottom of the screen.
    const oneRow = workspaceHeight(1000, 104)
    const twoRow = workspaceHeight(1000, 138)
    expect(oneRow - twoRow).toBe(34)
  })

  it('tracks a ribbon that WRAPPED, the case that shipped broken', () => {
    // The old comment records the tabs wrapping to three lines. At 104 px
    // assumed against ~150 actual, the grid ran ~46 px past the viewport.
    expect(workspaceHeight(800, 150)).toBe(650)
    expect(workspaceHeight(800, 150)).toBeLessThan(800 - 104)
  })

  it('floors the row rather than letting chrome eat the viewport', () => {
    // A short window where the chrome is most of it. Without the floor this
    // is 40 px of 3D view; with it the page scrolls instead, which is the
    // normal answer to "it does not fit".
    expect(workspaceHeight(400, 360)).toBe(WORKSPACE_MIN_PX)
    expect(workspaceHeight(200, 500)).toBe(WORKSPACE_MIN_PX)
  })

  it('survives a not-yet-measured window or a negative chrome reading', () => {
    // Both happen: the first render has no layout, and a ResizeObserver can
    // fire with 0 while the element is display:none.
    expect(workspaceHeight(0, 100)).toBe(WORKSPACE_MIN_PX)
    expect(workspaceHeight(1000, 0)).toBe(1000)
    expect(workspaceHeight(1000, -50)).toBe(1000)
  })

  it('emits a px length, because the style attribute takes a string', () => {
    expect(workspaceHeightCss(1080, 118)).toBe('962px')
  })
})
