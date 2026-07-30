import { describe, it, expect } from 'vitest'
import { soilFamily, isCohesive } from './model'
import { hatchFor } from './logRenderer'

// ─────────────────────────────────────────────────────────────────────────
// The noun rule, tested once and shared by everything that needs it.
//
// This exists because the same mistake was made twice: the log renderer drew
// "Silty Sand" as silt, and — after that was fixed — the SPT table described an
// N of 6 in the same layer as "firm", a COHESIVE consistency term, because the
// page had its own /clay|silt/ regex. Two independent readings of the same
// field will eventually disagree, so there is now one function and this file
// pins its behaviour.
// ─────────────────────────────────────────────────────────────────────────

describe('the group symbol wins when there is one', () => {
  it('reads the USCS family', () => {
    expect(soilFamily('GW', 'anything')).toBe('gravel')
    expect(soilFamily('SP-SM', 'anything')).toBe('sand')
    expect(soilFamily('CL', 'anything')).toBe('clay')
    expect(soilFamily('MH', 'anything')).toBe('silt')
    expect(soilFamily('OH', 'anything')).toBe('organic')
  })

  it('outranks a contradictory description', () => {
    // The symbol is a classification; the name is prose.
    expect(soilFamily('SM', 'Silty Sand')).toBe('sand')
    expect(soilFamily('CL', 'Sandy Clay')).toBe('clay')
  })

  it('still puts fill and rock first — they are histories, not soil types', () => {
    expect(soilFamily('SM', 'Sand Fill')).toBe('fill')
    expect(soilFamily('GW', 'Weathered bedrock')).toBe('rock')
  })
})

describe('without a symbol, the NOUN governs', () => {
  it.each([
    ['Silty Sand', 'sand'],
    ['Clayey Sand', 'sand'],
    ['Sandy Clay', 'clay'],
    ['Silty Clay', 'clay'],
    ['Gravelly Silt', 'silt'],
    ['Sandy Gravel', 'gravel'],
    ['Lean Clay', 'clay'],
    ['Poorly Graded Sand', 'sand'],
    ['Soft to firm lean CLAY with sand', 'sand'],
  ] as const)('%s → %s', (name, expected) => {
    expect(soilFamily(undefined, name)).toBe(expected)
  })

  it('returns unknown rather than guessing', () => {
    expect(soilFamily(undefined, 'Something else')).toBe('unknown')
    expect(soilFamily(undefined, '')).toBe('unknown')
  })
})

describe('cohesive vs granular', () => {
  it('picks the scale a description term belongs to', () => {
    // Consistency (soft/firm/stiff) and density (loose/dense) are different
    // scales; the wrong one turns an N of 6 in a silty sand into "firm".
    expect(isCohesive(soilFamily('SM', 'Silty Sand'))).toBe(false)
    expect(isCohesive(soilFamily(undefined, 'Silty Sand'))).toBe(false)
    expect(isCohesive(soilFamily('CL', 'Lean Clay'))).toBe(true)
    expect(isCohesive(soilFamily('MH', 'Elastic Silt'))).toBe(true)
    expect(isCohesive(soilFamily('OL', 'Organic silt'))).toBe(true)
    expect(isCohesive(soilFamily('GW', 'Well-graded gravel'))).toBe(false)
  })
})

describe('the renderer and the family rule cannot drift apart', () => {
  it('hatchFor delegates rather than re-implementing', () => {
    const cases = [
      ['SM', 'Silty Sand'], [undefined, 'Silty Sand'], ['CL', 'Sandy Clay'],
      [undefined, 'Gravelly Silt'], ['SM', 'Sand Fill'], [undefined, 'Mystery'],
    ] as const
    for (const [sym, name] of cases) {
      expect(hatchFor(sym, name), `${sym ?? '—'} / ${name}`).toBe(soilFamily(sym, name))
    }
  })
})
