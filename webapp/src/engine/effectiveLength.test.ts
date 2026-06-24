import { describe, it, expect } from 'vitest'
import { effectiveLengthK, columnKFactors, G_FIXED, G_PINNED } from './effectiveLength'
import { emptyModel, type RectSection, type StructuralModel } from './model'

describe('effectiveLengthK — Dumonteil fit to the AISC alignment chart', () => {
  it('braced K stays in [0.5, 1.0]', () => {
    for (const ga of [0, 1, 3, 10]) for (const gb of [0, 1, 3, 10]) {
      const k = effectiveLengthK(ga, gb, 'braced')
      expect(k).toBeGreaterThanOrEqual(0.5)
      expect(k).toBeLessThanOrEqual(1.0)
    }
  })

  it('sway K is ≥ 1.0 and grows with G', () => {
    expect(effectiveLengthK(0, 0, 'sway')).toBeGreaterThanOrEqual(1.0)
    expect(effectiveLengthK(10, 10, 'sway')).toBeGreaterThan(effectiveLengthK(1, 1, 'sway'))
  })

  // textbook anchor points (G = 1 ≈ fixed, G = 10 ≈ pinned per AISC)
  it('matches known chart values', () => {
    expect(effectiveLengthK(1, 1, 'braced')).toBeCloseTo(0.776, 2)   // fixed-fixed braced
    expect(effectiveLengthK(1, 1, 'sway')).toBeCloseTo(1.342, 2)     // fixed-fixed sway
    expect(effectiveLengthK(10, 10, 'sway')).toBeCloseTo(3.0, 2)     // pinned-pinned sway (G=10 cap)
    expect(effectiveLengthK(0, 0, 'braced')).toBeCloseTo(0.5, 2)     // theoretical fixed-fixed
  })

  it('is symmetric in GA, GB', () => {
    expect(effectiveLengthK(2, 7, 'sway')).toBeCloseTo(effectiveLengthK(7, 2, 'sway'), 12)
    expect(effectiveLengthK(2, 7, 'braced')).toBeCloseTo(effectiveLengthK(7, 2, 'braced'), 12)
  })
})

// single-bay single-storey portal in the X direction, fixed bases
const colSec: RectSection = { id: 'C', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const beamSec: RectSection = { id: 'B', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const portal: StructuralModel = {
  ...emptyModel('portal'),
  nodes: [
    { id: 'b1', x: 0, y: 0, z: 0 }, { id: 't1', x: 0, y: 3, z: 0 },
    { id: 'b2', x: 6, y: 0, z: 0 }, { id: 't2', x: 6, y: 3, z: 0 },
  ],
  sections: [colSec, beamSec],
  members: [
    { id: 'c1', i: 'b1', j: 't1', role: 'column', section: 'C' },
    { id: 'c2', i: 'b2', j: 't2', role: 'column', section: 'C' },
    { id: 'bm', i: 't1', j: 't2', role: 'beam', section: 'B' },
  ],
  supports: [{ node: 'b1', fixity: 'fixed' }, { node: 'b2', fixity: 'fixed' }],
}

describe('columnKFactors — portal frame', () => {
  it('returns one entry per column (beams excluded)', () => {
    const ks = columnKFactors(portal)
    expect(ks.map((k) => k.memberId).sort()).toEqual(['c1', 'c2'])
  })

  it('fixed base end takes G = 1.0', () => {
    const c1 = columnKFactors(portal).find((k) => k.memberId === 'c1')!
    // end i is the base (b1) → fixed
    expect(c1.Gi.x).toBeCloseTo(G_FIXED, 9)
    expect(c1.Gi.z).toBeCloseTo(G_FIXED, 9)
  })

  it('top-joint X-sway G = Σ(EI/L)col / Σ(EI/L)beam (hand value 1.365)', () => {
    const c1 = columnKFactors(portal).find((k) => k.memberId === 'c1')!
    // col Iy = 400⁴/12 over L=3; beam Iz = 300·500³/12 over L=6; E cancels
    expect(c1.Gj.x).toBeCloseTo(1.3653, 3)
  })

  it('top joint has no beam in Z ⇒ G = 10 (pinned) for Z-sway', () => {
    const c1 = columnKFactors(portal).find((k) => k.memberId === 'c1')!
    expect(c1.Gj.z).toBeCloseTo(G_PINNED, 9)
  })

  it('computes K from the end G-factors (hand values)', () => {
    const c1 = columnKFactors(portal).find((k) => k.memberId === 'c1')!
    expect(c1.Kx.sway).toBeCloseTo(1.393, 2)
    expect(c1.Kx.braced).toBeCloseTo(0.796, 2)
    expect(c1.Kz.sway).toBeCloseTo(1.910, 2)
    expect(c1.Kz.braced).toBeCloseTo(0.864, 2)
  })
})
