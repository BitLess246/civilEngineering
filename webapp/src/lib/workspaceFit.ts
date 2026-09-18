// ─────────────────────────────────────────────────────────────────────────
// HOW TALL THE WORKSPACE IS.
//
// Model Space puts a viewport and a control rail side by side under a sticky
// header and a sticky ribbon, each column scrolling its own content. That only
// works if the pair is given a height, and the height is the viewport minus
// whatever is pinned above it.
//
// THAT USED TO BE A CONSTANT — `lg:h-[calc(100vh-6.5rem)]`, 104 px, which was
// the header plus a one-row ribbon on the day it was written. It was wrong in
// both directions and silently: the ribbon's own comment records it wrapping
// to THREE lines in a narrow panel, at which point the grid ran 80 px past the
// bottom of the screen, and the Office-style ribbon is taller than 104 − 44 at
// every width. A number that describes another element's height is a number
// that goes stale the first time that element changes.
//
// So it is measured instead, and this module is the arithmetic — pure, so the
// clamping can be tested without a layout.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The least height worth giving the workspace, px.
 *
 * A floor, not a preference. On a short window (a laptop with two toolbars, or
 * a phone in landscape) the pinned chrome can be most of the viewport, and
 * without this the 3D view would be given single digits of height — at which
 * point the page shows its own furniture and nothing else. Below the floor the
 * page scrolls, which is the normal answer to "it does not fit".
 */
export const WORKSPACE_MIN_PX = 360

/**
 * The height for the viewport/rail row, px, given the window and the chrome
 * pinned above it.
 *
 * `chromePx` is the measured total of everything sticky above the row — the
 * app header and the ribbon — not a guess at what they add up to.
 */
export function workspaceHeight(
  windowPx: number, chromePx: number, minPx = WORKSPACE_MIN_PX,
): number {
  if (!(windowPx > 0)) return minPx
  return Math.max(minPx, windowPx - Math.max(0, chromePx))
}

/** The same as a CSS length, which is what the style attribute wants. */
export const workspaceHeightCss = (
  windowPx: number, chromePx: number, minPx = WORKSPACE_MIN_PX,
): string => `${workspaceHeight(windowPx, chromePx, minPx)}px`

/**
 * The app header's height, px. MEASURED IN CHROMIUM, not read off `h-11`.
 *
 * `h-11` is 44, and the header's box is 45: the class sets the content height
 * and the `border-b` hairline is a pixel on top of it. The ribbon was parked
 * at `top-11` on the strength of the class, which tucked its first pixel row
 * behind the header at every width — the kind of off-by-one that stays
 * invisible until the two numbers are read side by side. So the number here is
 * the reading, the ribbon's `top-[45px]` is derived from it, and
 * `ribbonIcons.test.ts` asserts the two still agree.
 */
export const HEADER_PX = 45

/**
 * What the ribbon is ASSUMED to be for the first paint, px.
 *
 * AN ESTIMATE, AND SAID TO BE ONE. The measurement above supersedes it within
 * a frame of mount; this covers the two moments no measurement exists — the
 * very first render, and `ModelSpaceSkeleton`, which stands in for the page
 * while its three.js chunk downloads and has no page to measure.
 *
 * Derived from the ribbon's box model — 12 px of `py-1.5` on the strip, a
 * 49 px command (`py-1.5` = 12, a 20 px mark, `gap-1` = 4, a 13 px
 * `text-[10.5px] leading-tight` label), a 14 px group name under it, and the
 * 1 px bottom border — and then CONFIRMED against Chromium, which measures the
 * rendered ribbon at exactly 76 px from 1280 px up. The arithmetic and the
 * reading agree, so this is a measurement rather than an estimate that happens
 * to be written down; re-measure it if the ribbon's type or padding moves.
 */
export const RIBBON_ESTIMATE_PX = 76

/**
 * The height the workspace row falls back to before anything is measured.
 *
 * ONE STRING, TWO FILES. The page and the skeleton must state the same height
 * or the footer jumps when one replaces the other, which is the whole reason
 * `ModelSpaceSkeleton.test.ts` compares their grid markup character for
 * character. Sharing the constant makes that agreement structural instead of
 * something two files have to remember.
 */
export const WORKSPACE_FALLBACK_CSS = `calc(100vh - ${HEADER_PX + RIBBON_ESTIMATE_PX}px)`
