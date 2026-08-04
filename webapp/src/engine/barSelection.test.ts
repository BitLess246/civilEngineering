import { describe, it, expect } from 'vitest'
import {
  chooseBar, firstFailure, crackSpacingLimit, crackControlOK,
  constructabilityOK, rejectionNote, BUILDABLE, STAGES, type BarCandidate,
} from './barSelection'

const cand = (db: number, over: Partial<BarCandidate> = {}): BarCandidate => ({
  db, strength: true, serviceability: true, detailing: true, constructability: true,
  steelArea: 1000, ...over,
})

describe('the stages are applied IN ORDER', () => {
  it('reports the FIRST stage a candidate fails, not the last', () => {
    // A bar that fails strength AND detailing is a strength failure. Reporting
    // the last check to run would send someone off to widen the web when the
    // section is simply too small.
    expect(firstFailure(cand(25, { strength: false, detailing: false }))).toBe('strength')
    expect(firstFailure(cand(25, { serviceability: false, constructability: false })))
      .toBe('serviceability')
  })

  it('passes a candidate that clears all four', () => {
    expect(firstFailure(cand(20))).toBeNull()
  })

  it('covers every stage in the declared order', () => {
    const seen = STAGES.map((st) => firstFailure(cand(20, { [st]: false } as Partial<BarCandidate>)))
    expect(seen).toEqual([...STAGES])
  })
})

describe('chooseBar', () => {
  it('takes the least steel', () => {
    const r = chooseBar([cand(20, { steelArea: 1200 }), cand(25, { steelArea: 900 })])
    expect(r.db).toBe(25)
  })

  it('breaks a tie toward the SMALLER bar', () => {
    // Equal tonnage is not equal on site: more, smaller bars control crack
    // width better, bend tighter and are easier to place.
    const r = chooseBar([cand(32, { steelArea: 1000 }), cand(20, { steelArea: 1000 })])
    expect(r.db).toBe(20)
  })

  it('never rescues a failed candidate for being cheaper', () => {
    // The cheapest option here fails strength. Economy ranks survivors; it
    // does not vote on whether something survives.
    const r = chooseBar([
      cand(16, { strength: false, steelArea: 400 }),
      cand(25, { steelArea: 1400 }),
    ])
    expect(r.db).toBe(25)
    expect(r.rejected).toEqual([{ db: 16, stage: 'strength' }])
  })

  it('returns null when everything fails, and says why for each', () => {
    const r = chooseBar([
      cand(16, { strength: false }),
      cand(20, { serviceability: false }),
      cand(25, { detailing: false }),
      cand(32, { constructability: false }),
    ])
    expect(r.db).toBeNull()
    expect(r.rejected.map((x) => x.stage))
      .toEqual(['strength', 'serviceability', 'detailing', 'constructability'])
  })

  it('handles an empty candidate list', () => {
    expect(chooseBar([])).toEqual({ db: null, rejected: [], ranked: [] })
  })

  it('ranks every survivor, not just the winner', () => {
    const r = chooseBar([
      cand(20, { steelArea: 1200 }), cand(25, { steelArea: 900 }), cand(32, { steelArea: 1500 }),
    ])
    expect(r.ranked).toEqual([25, 20, 32])
  })

  it('is deterministic — the ranking is total', () => {
    const set = [cand(16, { steelArea: 1000 }), cand(20, { steelArea: 1000 }), cand(25, { steelArea: 1000 })]
    expect(chooseBar(set).ranked).toEqual(chooseBar([...set].reverse()).ranked)
  })

  it('does not let float noise reverse the size preference', () => {
    // 1000 and 1000.0000001 are the same tonnage; the smaller bar should win.
    const r = chooseBar([cand(32, { steelArea: 1000 }), cand(20, { steelArea: 1000.0000001 })])
    expect(r.db).toBe(20)
  })
})

describe('crack control — §24.3.2', () => {
  it('matches the clause for Grade 420 at 40 mm cover', () => {
    // fs = ⅔·420 = 280 → k = 1.0 → min(380 − 100, 300) = 280 mm.
    expect(crackSpacingLimit(420, 40)).toBeCloseTo(280, 6)
  })

  it('tightens as cover grows — the 2.5cc term', () => {
    expect(crackSpacingLimit(420, 75)).toBeLessThan(crackSpacingLimit(420, 40))
  })

  it('tightens as fy grows — higher service stress, wider cracks', () => {
    expect(crackSpacingLimit(550, 40)).toBeLessThan(crackSpacingLimit(420, 40))
  })

  it('is capped by the 300·(280/fs) branch at low cover', () => {
    // At zero cover the first branch would give 380·k; the cap governs.
    expect(crackSpacingLimit(420, 0)).toBeCloseTo(300, 6)
  })

  it('passes and fails on the right side of the limit', () => {
    expect(crackControlOK(280, 420, 40)).toBe(true)
    expect(crackControlOK(281, 420, 40)).toBe(false)
  })
})

describe('constructability', () => {
  it('refuses a single bar and an absurd count', () => {
    expect(constructabilityOK(1, 1)).toBe(false)
    expect(constructabilityOK(BUILDABLE.maxBars + 1, 1)).toBe(false)
  })

  it('refuses a cage stacked too deep', () => {
    expect(constructabilityOK(8, BUILDABLE.maxLayers + 1)).toBe(false)
  })

  it('accepts an ordinary cage', () => {
    expect(constructabilityOK(6, 2)).toBe(true)
    expect(constructabilityOK(BUILDABLE.minBars, 1)).toBe(true)
    expect(constructabilityOK(BUILDABLE.maxBars, BUILDABLE.maxLayers)).toBe(true)
  })
})

describe('rejectionNote', () => {
  it('names the diameter and says something actionable for every stage', () => {
    for (const st of STAGES) {
      const note = rejectionNote(25, st)
      expect(note).toContain('25')
      expect(note.length).toBeGreaterThan(20)
    }
  })
})
