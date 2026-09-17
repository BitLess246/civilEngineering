/**
 * Every annotated drawing goes through the legibility frame.
 *
 * WHAT THIS CAN AND CANNOT DO, stated up front because the distinction is the
 * whole finding. The defect it guards against — annotation rendering at 2.5 px
 * on a phone — does NOT exist in the source. `fontSize={6.5}` is 6.5 viewBox
 * USER UNITS, and what the reader sees is `6.5 × (renderedWidth / viewBoxWidth)`.
 * Any static rule that checks a minimum font size reads 6.5 and passes it. That
 * is why Impeccable's own 11 pt / 14 px floors would not have caught this, and
 * why `docs/AuditRemediation.md` § D insists the real check is a rendered one.
 *
 * So the automated half is split in two, and neither half pretends to be the
 * other:
 *   · `drawingScale.test.ts` checks the ARITHMETIC against numbers measured in
 *     Chromium — the formula is right.
 *   · this file checks the WIRING — every drawing that has annotation to lose
 *     actually goes through the component that applies the arithmetic.
 *
 * The rendered measurement itself needs a browser, which this CI does not run;
 * it lives in the PR as a table and in `docs/AuditRemediation.md`. A test that
 * claimed to do it here would be the exact lie this repo keeps catching.
 */
import { describe, it, expect } from 'vitest'

const SOURCES = import.meta.glob('../**/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** The frame itself, and the icon sets, which are not drawings. */
const NOT_A_DRAWING = ['DrawingFrame.tsx']

/**
 * A DRAWING is an `<svg>` that carries a `viewBox` and at least one `<text>`.
 *
 * The `<text>` is the discriminator and it is the right one: an icon scales to
 * nothing gracefully because it has no annotation to lose, and the app has ~40
 * `viewBox` icons that must not be dragged into a scroll frame. What makes a
 * figure fail is text that shrinks with it.
 */
const drawings = () => Object.entries(SOURCES).filter(([file, src]) =>
  !NOT_A_DRAWING.some((n) => file.endsWith(n))
  && /<svg\b[^>]*viewBox/s.test(src)
  && /<text\b/.test(src))

describe('the legibility frame is wired to every annotated drawing', () => {
  it('found the drawings at all', () => {
    // A glob that silently matched nothing would make every assertion below
    // vacuously true — the failure mode this repo has already shipped once.
    expect(drawings().length).toBeGreaterThanOrEqual(15)
  })

  it('wraps every annotated SVG in a DrawingFrame', () => {
    // `<DrawingFrame`, the JSX TAG — not the bare identifier. The first version
    // tested `src.includes('DrawingFrame')`, which the IMPORT LINE satisfies on
    // its own: a sabotage that deleted the wrapper and left the import passed
    // clean. Third time this session a guard matched the notation instead of
    // the thing (see `themeUsage.test.ts`), so it is worth naming: a file
    // MENTIONING the frame is not a file USING it.
    const bare = drawings()
      .filter(([, src]) => !src.includes('<DrawingFrame'))
      .map(([file]) => file)
    expect(bare, 'annotated drawing with no legibility frame').toEqual([])
  })

  it('has at least as many frames as it has annotated figures', () => {
    // Catches the half-migration a presence check cannot see: a file with two
    // figures that wrapped one. Not airtight — an `<svg>` without text in a
    // multi-figure file skews the count — so this is a floor, and the rendered
    // sweep in the PR is what actually proves every figure clears the floor.
    const short: string[] = []
    for (const [file, src] of drawings()) {
      const svgs = (src.match(/<svg\b/g) ?? []).length
      const frames = (src.match(/<DrawingFrame\b/g) ?? []).length
      if (frames < 1 || (svgs > 1 && frames < svgs)) short.push(`${file}: ${frames} frames / ${svgs} svgs`)
    }
    expect(short, 'figures outnumber frames').toEqual([])
  })

  it('never wraps an icon, so the scroll frame stays meaningful', () => {
    // The inverse rule. A frame around a 24×24 icon would add a tab stop and a
    // scroll region announcing nothing, which is worse than the icon shrinking.
    const overwrapped = Object.entries(SOURCES)
      .filter(([file, src]) =>
        !NOT_A_DRAWING.some((n) => file.endsWith(n))
        && src.includes('<DrawingFrame') && !/<text\b/.test(src))
      .map(([file]) => file)
    expect(overwrapped, 'frame around something with no annotation').toEqual([])
  })

  it('gives every frame an accessible name', () => {
    // The frame becomes a focusable scroll region when it scrolls. A focus stop
    // that announces nothing is the defect the audit's scroll-region pass fixed
    // for the data tables; do not reintroduce it here.
    const unlabelled: string[] = []
    for (const [file, src] of Object.entries(SOURCES)) {
      for (const m of src.matchAll(/<DrawingFrame\b([^>]*)>/g)) {
        if (!/\blabel=/.test(m[1])) unlabelled.push(`${file}: ${m[0].slice(0, 40)}`)
      }
    }
    expect(unlabelled).toEqual([])
  })
})

describe('DevLengthDetail reflows instead of shrinking', () => {
  // D2. Four panels inside ONE viewBox could only shrink, which is how it
  // reached 2.5 px — the worst reading in the app. The property that fixes it
  // is that the panels are SIBLINGS in a collapsing grid, not `<g>` groups
  // placed by transform inside a shared sheet.
  const src = Object.entries(SOURCES).find(([f]) => f.endsWith('DevLengthDetail.tsx'))?.[1]

  it('is present', () => { expect(src).toBeTruthy() })

  it('lays the panels out in a grid that collapses to one column', () => {
    expect(src).toMatch(/grid-cols-1\b/)
    expect(src).toMatch(/md:grid-cols-2\b/)
  })

  it('no longer places panels by transform inside one sheet', () => {
    // The specific shape of the old bug: `<g transform="translate(...)">`
    // carrying a whole panel. Individual transforms inside a panel are fine.
    expect(src).not.toMatch(/<g transform=\{?`?translate\([^)]*\)`?\}?><(Straight|Hook|Splice|Confine)Panel/)
  })
})
