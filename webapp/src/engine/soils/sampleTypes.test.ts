import { describe, it, expect } from 'vitest'
import { SAMPLE_TYPES, type SampleType } from './model'
import { STANDARDS } from './standards'

// ─────────────────────────────────────────────────────────────────────────
// The picker list is what a UI renders, so a type missing from it is a type
// nobody can choose — which is the defect this whole change fixes, in
// miniature. These pin the list against the union it claims to cover.
// ─────────────────────────────────────────────────────────────────────────

describe('the sample-type catalogue', () => {
  it('covers every SampleType exactly once', () => {
    const all: SampleType[] = ['disturbed', 'undisturbed', 'split-spoon', 'shelby-tube', 'bulk', 'core']
    expect(SAMPLE_TYPES.map((t) => t.type).slice().sort()).toEqual([...all].sort())
  })

  it('cites only standards the catalogue knows', () => {
    for (const t of SAMPLE_TYPES) {
      if (t.standard) expect(STANDARDS[t.standard], t.type).toBeDefined()
    }
  })

  it('marks exactly the types whose fabric survives recovery', () => {
    // The distinction decides whether a consolidation or triaxial specimen can
    // be cut from the sample at all — a driven split-spoon has already sheared
    // the soil it recovered.
    const undisturbed = SAMPLE_TYPES.filter((t) => t.undisturbed).map((t) => t.type).slice().sort()
    expect(undisturbed).toEqual(['core', 'shelby-tube', 'undisturbed'])
  })

  it('gives every type a label and a hint worth reading', () => {
    for (const t of SAMPLE_TYPES) {
      expect(t.label.length, t.type).toBeGreaterThan(3)
      expect(t.hint.length, t.type).toBeGreaterThan(30)
    }
  })
})
