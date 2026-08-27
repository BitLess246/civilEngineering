// The landing page shows a worked beam design. These are the numbers a visitor
// reads before deciding whether to trust the app at all — so they have to be
// the engine's, and they have to STAY the engine's.
//
// The component writes them as literals so the landing page does not pull the
// design engine into its bundle. That is the right trade for page weight and
// the wrong one for truth, unless something re-checks it. This is that
// something: it runs `designBeam` over the same input and asserts every
// displayed figure still matches.
//
// If this fails, the engine changed and the landing page is now advertising
// arithmetic the app no longer produces. Fix the component, not the test.

import { describe, it, expect } from 'vitest'
import { designBeam } from '../engine/beamDesign'
import { DEMO_INPUT, DEMO_RESULT } from './workedSolutionData'

const r = designBeam({ ...DEMO_INPUT })

describe('the displayed design is the one the engine computes', () => {
  it('effective depth', () => {
    expect(r.d).toBeCloseTo(DEMO_RESULT.d, 1)
  })

  it('reinforcement ratio and its limits', () => {
    expect(r.rhoMin).toBeCloseTo(DEMO_RESULT.rhoMin, 4)
    expect(r.rho).toBeCloseTo(DEMO_RESULT.rho, 4)
    expect(r.rhoMax).toBeCloseTo(DEMO_RESULT.rhoMax, 4)
  })

  it('steel area and bar count', () => {
    expect(r.As).toBeCloseTo(DEMO_RESULT.As, 1)
    expect(r.bars).toBe(DEMO_RESULT.bars)
  })

  it('bar spacing, including the §425.2.1 minimum', () => {
    expect(r.sClear).toBeCloseTo(DEMO_RESULT.sClear, 1)
    expect(r.sMinClear).toBeCloseTo(DEMO_RESULT.sMinClear, 1)
  })

  it('shear — concrete capacity and the demand on the stirrups', () => {
    expect(r.Vc).toBeCloseTo(DEMO_RESULT.Vc, 1)
    expect(r.phiVc).toBeCloseTo(DEMO_RESULT.phiVc, 1)
    expect(r.VsReq).toBeCloseTo(DEMO_RESULT.VsReq, 1)
  })

  it('stirrup spacing, and that MAXIMUM spacing is what governs', () => {
    // The interesting line on the page, and the reason this case was chosen:
    // the calculated spacing is nowhere near critical, and the code's cap is
    // what sets the answer. An engineer reading the page notices that.
    expect(r.sReq).toBeCloseTo(DEMO_RESULT.sReq, 0)
    expect(r.sMax).toBeCloseTo(DEMO_RESULT.sMax, 1)
    expect(r.sAdopt).toBeCloseTo(DEMO_RESULT.sAdopt, 1)
    expect(r.legs).toBe(DEMO_RESULT.legs)
    expect(DEMO_RESULT.sAdopt).toBe(Math.min(DEMO_RESULT.sReq, DEMO_RESULT.sMax))
  })
})

describe('the case is still worth showing', () => {
  it('passes — a landing page must not advertise a failing design', () => {
    expect(r.flexOK).toBe(true)
  })

  it('is singly reinforced, so the derivation stays readable', () => {
    // A doubly-reinforced result would add compression-steel lines the block
    // has no room for, and the page would show a partial solution.
    expect(r.mode).toBe('SRRB')
  })

  it('fits one layer, which is what the "4-⌀20 in one layer" line claims', () => {
    expect(r.layers).toEqual([DEMO_RESULT.bars])
  })

  it('genuinely needs stirrups — otherwise the shear half is filler', () => {
    expect(r.region).toBe('designed')
    expect(r.phiVc).toBeLessThan(DEMO_INPUT.Vu)
  })
})
