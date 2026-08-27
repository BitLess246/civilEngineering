// Does every storyboard panel have a file behind it?
//
// A landing page showing four broken-image icons is worse than one showing
// nothing at all, and a missing image in `public/` fails SILENTLY: the build
// succeeds, the deploy succeeds, and the first person to find out is a visitor.
// Nothing else in the pipeline checks this, because `public/` is copied
// verbatim and never enters the module graph.
//
// So this walks `public/demo` with Vite's glob — not `node:fs`, which this
// project deliberately has no types for — and asserts each `src` resolves.
//
// IF THIS FAILS, THE IMAGES ARE MISSING, NOT THE TEST. Add the files named in
// the failure to `webapp/public/demo/` and it goes green. Do not delete the
// assertion to unblock a merge; the whole point is that it blocks one.

import { describe, it, expect } from 'vitest'
import { PANELS, COMPARISON, COMPARISON_NOTE } from './storyboardData'

const ALL = [...PANELS, ...COMPARISON]

// Eager URL glob: every file that actually exists under public/demo.
const FILES = import.meta.glob('../../public/demo/*', { eager: true, query: '?url', import: 'default' })

/** Bare filenames present on disk, e.g. `story-model.webp`. */
const present = new Set(Object.keys(FILES).map((p) => p.split('/').pop()!))

describe('every storyboard panel has its image', () => {
  it('found the directory at all — an empty glob would fail everything below', () => {
    // Guard the guard. If the relative path ever stops resolving, the
    // assertions turn into "nothing exists" rather than passing vacuously,
    // but this line says WHY.
    expect(
      present.size,
      'no files found under webapp/public/demo — has the directory moved?',
    ).toBeGreaterThan(0)
  })

  it.each(ALL.map((p) => [p.src.split('/').pop()!, p.label] as const))(
    '%s exists (%s)',
    (file) => {
      expect(
        present.has(file),
        `webapp/public/demo/${file} is missing. Add the screenshot, do not delete this test.`,
      ).toBe(true)
    },
  )
})

describe('the panels are described for people who cannot see them', () => {
  it.each(ALL.map((p) => [p.label, p] as const))('%s has real alt text', (_label, p) => {
    // Alt text that repeats the caption is useless to a screen-reader user —
    // they get the caption anyway. It has to describe the IMAGE.
    expect(p.alt.length).toBeGreaterThan(40)
    expect(p.alt).not.toBe(p.caption)
  })

  it('the comparison keeps both halves — a before with no after says nothing', () => {
    expect(COMPARISON).toHaveLength(2)
    expect(COMPARISON[0].label).toMatch(/before/i)
    expect(COMPARISON[1].label).toMatch(/after/i)
  })

  it('names what moved the design between the two reports', () => {
    // These captions claimed no mechanism for as long as none was confirmed —
    // the screenshots show that the numbers moved, not what moved them. The
    // author has since confirmed it: the optimiser resizes each failing member
    // to the most utilised section that still passes, subject to bar
    // continuity. The continuity constraint is half the claim and belongs with
    // it, because it is why the tool cannot just pick a different section per
    // member — which is not a thing anyone can build.
    expect(COMPARISON_NOTE).toMatch(/optimis/i)
    expect(COMPARISON_NOTE).toMatch(/continuity/i)
  })

  it('says what the optimiser optimises FOR, because the concrete goes up', () => {
    // 175.0 → 232.1 m³. A reader who assumes "optimise" means "less material"
    // reads that number as the tool making things worse, so naming the
    // optimiser without naming its objective is worse than naming neither.
    // The sections that were failing had to GROW to pass.
    expect(COMPARISON_NOTE).toMatch(/not against volume/i)
    expect(COMPARISON_NOTE).toMatch(/concrete goes up/i)
  })

  it('explains the step under the pair, not inside one half of it', () => {
    // The explanation belongs to the transition, which is in neither
    // screenshot. Hanging it off the "after" caption while "before" keeps one
    // line leaves the two halves visibly lopsided, and the comparison's whole
    // argument is that these are the same report twice.
    for (const p of COMPARISON) {
      expect(p.caption, `${p.label} caption absorbed the explanation`).not.toMatch(/optimis/i)
    }
  })

  it('keeps the two halves quoting the same measurements', () => {
    // The pair only reads as a comparison if both sides report the same four
    // things, in the same order. A reader diffs these two lines directly.
    for (const [before, after] of [['1.59', '0.76'], ['175.0', '232.1'], ['392', '413']]) {
      expect(COMPARISON[0].caption, `before caption lost ${before}`).toContain(before)
      expect(COMPARISON[1].caption, `after caption lost ${after}`).toContain(after)
    }
  })

  it('leads with the failure panel somewhere in the set', () => {
    // The credibility beat. If a future edit leaves only passing screenshots,
    // the storyboard stops doing the one job it was chosen for.
    const mentionsFailure = ALL.some((p) => /fail|over capacity/i.test(p.label + p.caption))
    expect(mentionsFailure, 'no panel shows something failing').toBe(true)
  })
})
