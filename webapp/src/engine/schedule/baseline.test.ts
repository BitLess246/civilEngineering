import type { Baseline } from './model'
import { describe, it, expect } from 'vitest'
import { captureBaseline, baselineDateVariance, nextBaselineName, renameBaseline, removeBaseline, baselineAfterRemoval } from './baseline'
import { sampleProject } from './sample'

describe('captureBaseline', () => {
  const bl = captureBaseline(sampleProject(), 'b1', 'Original plan', '2026-08-01T00:00:00.000Z')

  it('records ISO start/finish/duration for every activity', () => {
    const p = sampleProject()
    expect(Object.keys(bl.activities)).toHaveLength(p.activities.length)
    for (const a of p.activities) {
      const e = bl.activities[a.id]
      expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.finish).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.duration).toBe(a.duration)
    }
  })

  it('a milestone starts and finishes on the same date', () => {
    expect(bl.activities['HAND'].start).toBe(bl.activities['HAND'].finish)
  })

  it('finish dates never precede start dates', () => {
    for (const e of Object.values(bl.activities)) expect(e.finish >= e.start).toBe(true)
  })
})

describe('baselineDateVariance', () => {
  it('is zero against an unchanged schedule', () => {
    const project = sampleProject()
    const bl = captureBaseline(project, 'b1', 'Plan')
    const v = baselineDateVariance(project, bl)
    for (const dv of v.values()) {
      expect(dv.startVarianceDays).toBe(0)
      expect(dv.finishVarianceDays).toBe(0)
      expect(dv.durationVariance).toBe(0)
    }
  })

  it('captures downstream slip when an early activity grows', () => {
    const project = sampleProject()
    const bl = captureBaseline(project, 'b1', 'Plan')
    // Mobilization slips from 5 to 10 working days → everything downstream shifts.
    project.activities.find((a) => a.id === 'MOB')!.duration = 10
    const v = baselineDateVariance(project, bl)

    expect(v.get('MOB')!.durationVariance).toBe(5)
    expect(v.get('MOB')!.startVarianceDays).toBe(0)          // still starts on day 0
    expect(v.get('MOB')!.finishVarianceDays).toBeGreaterThan(0)
    expect(v.get('CLR')!.startVarianceDays).toBeGreaterThan(0) // successor pushed later
    expect(v.get('HAND')!.finishVarianceDays).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Naming, renaming and removal.
//
// These exist because a baseline used to be capture-only: the app could make
// them and never rename or delete one, so a stray capture was permanent and
// the only way out was to export the project, edit the JSON and import it
// back. The rules below are what make removal safe to offer.
// ─────────────────────────────────────────────────────────────────────────
describe('baseline naming', () => {
  const b = (id: string, name: string): Baseline => ({ id, name, createdAt: '2026-08-01T00:00:00Z', activities: {} })

  it('numbers from the count when nothing collides', () => {
    expect(nextBaselineName([])).toBe('Baseline 1')
    expect(nextBaselineName([b('1', 'Baseline 1')])).toBe('Baseline 2')
  })

  it('skips a number already taken, so the picker has no duplicates', () => {
    // Reachable by deleting the middle of three: two remain, and the count
    // alone would propose a name one of them already has.
    const kept = [b('1', 'Baseline 1'), b('3', 'Baseline 3')]
    expect(nextBaselineName(kept)).toBe('Baseline 4')
  })

  it('steps past a renamed one too', () => {
    // Two baselines, so the count proposes "Baseline 3" — which one of them
    // has been renamed TO. It has to keep walking.
    expect(nextBaselineName([b('1', 'Baseline 3'), b('2', 'As-tendered')])).toBe('Baseline 4')
    // …and when the count's proposal is free, it takes it.
    expect(nextBaselineName([b('1', 'As-tendered'), b('2', 'Rev B')])).toBe('Baseline 3')
  })
})

describe('renameBaseline', () => {
  const list: Baseline[] = [
    { id: 'a', name: 'Baseline 1', createdAt: 'x', activities: {} },
    { id: 'b', name: 'Baseline 2', createdAt: 'y', activities: {} },
  ]

  it('renames only the one named, leaving the rest identical', () => {
    const out = renameBaseline(list, 'b', 'After VO-3')
    expect(out.map((x) => x.name)).toEqual(['Baseline 1', 'After VO-3'])
    expect(out[0]).toBe(list[0])            // untouched entries keep identity
  })

  it('trims, and REFUSES a blank name rather than storing one', () => {
    expect(renameBaseline(list, 'a', '  Tender  ')[0].name).toBe('Tender')
    expect(renameBaseline(list, 'a', '   ')[0].name).toBe('Baseline 1')
    expect(renameBaseline(list, 'a', '')[0].name).toBe('Baseline 1')
  })

  it('does not mutate the input', () => {
    const before = JSON.stringify(list)
    renameBaseline(list, 'a', 'Changed')
    expect(JSON.stringify(list)).toBe(before)
  })

  it('ignores an unknown id', () => {
    expect(renameBaseline(list, 'nope', 'X').map((x) => x.name)).toEqual(['Baseline 1', 'Baseline 2'])
  })
})

describe('removeBaseline and what stays selected', () => {
  const list: Baseline[] = [
    { id: 'a', name: 'B1', createdAt: 'x', activities: {} },
    { id: 'b', name: 'B2', createdAt: 'y', activities: {} },
    { id: 'c', name: 'B3', createdAt: 'z', activities: {} },
  ]

  it('drops one and leaves the others', () => {
    expect(removeBaseline(list, 'b').map((x) => x.id)).toEqual(['a', 'c'])
    expect(removeBaseline(list, 'nope')).toHaveLength(3)
    expect(removeBaseline([], 'a')).toEqual([])
  })

  it('keeps the current selection when something else was deleted', () => {
    expect(baselineAfterRemoval(list, 'a', 'c')).toBe('c')
  })

  it('falls to the newest survivor when the SELECTED one was deleted', () => {
    // The case that matters: leaving the selection pointing at a deleted id
    // renders the delay analysis as an empty panel rather than an error.
    expect(baselineAfterRemoval(list, 'c', 'c')).toBe('b')
    expect(baselineAfterRemoval(list, 'a', 'a')).toBe('c')
  })

  it('returns null when the last one goes', () => {
    expect(baselineAfterRemoval([list[0]], 'a', 'a')).toBeNull()
  })

  it('falls to the newest when the selection was already stale', () => {
    expect(baselineAfterRemoval(list, 'a', 'gone')).toBe('c')
  })
})
