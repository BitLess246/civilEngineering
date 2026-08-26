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
import { PANELS } from './storyboardData'

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

  it.each(PANELS.map((p) => [p.src.split('/').pop()!, p.label] as const))(
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
  it.each(PANELS.map((p) => [p.label, p] as const))('%s has real alt text', (_label, p) => {
    // Alt text that repeats the caption is useless to a screen-reader user —
    // they get the caption anyway. It has to describe the IMAGE.
    expect(p.alt.length).toBeGreaterThan(40)
    expect(p.alt).not.toBe(p.caption)
  })

  it('leads with the failure panel somewhere in the set', () => {
    // The credibility beat. If a future edit leaves only passing screenshots,
    // the storyboard stops doing the one job it was chosen for.
    const mentionsFailure = PANELS.some((p) => /fail|over capacity/i.test(p.label + p.caption))
    expect(mentionsFailure, 'no panel shows something failing').toBe(true)
  })
})
