import { describe, it, expect } from 'vitest'
import { cutBeam, spanSections, sectionTally, type CutInput } from './beamSection'
import type { RebarCage, Vec3 } from './rebarModel'

/** A beam along +x from the origin, soffit at y = 0, 300 × 500. */
const along: Vec3 = [1, 0, 0]
const origin: Vec3 = [0, 0.5, 0]                 // the beam's TOP, as the model stores it

/** Two through bars each face, one extra bottom bar over the middle third,
 *  and stirrups at 100 for the first metre then 200. */
const cage: RebarCage = {
  member: 'B1',
  runs: [
    { mark: 'B1-T1', dia: 20, role: 'top', member: 'B1', bendDia: [], path: [[0, 0.44, -0.09], [6, 0.44, -0.09]], count: 1 },
    { mark: 'B1-T2', dia: 20, role: 'top', member: 'B1', bendDia: [], path: [[0, 0.44, 0.09], [6, 0.44, 0.09]], count: 1 },
    { mark: 'B1-B1', dia: 20, role: 'bottom', member: 'B1', bendDia: [], path: [[0, 0.06, -0.09], [6, 0.06, -0.09]], count: 1 },
    { mark: 'B1-B2', dia: 20, role: 'bottom', member: 'B1', bendDia: [], path: [[0, 0.06, 0.09], [6, 0.06, 0.09]], count: 1 },
    { mark: 'B1-B3', dia: 25, role: 'bottom', member: 'B1', bendDia: [], path: [[2, 0.06, 0], [4, 0.06, 0]], count: 1 },
    ...[0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95].map((x, k) => ({
      mark: `B1-S${k}`, dia: 10, role: 'stirrup' as const, member: 'B1', bendDia: [40, 40, 40, 40],
      path: [[x, 0.05, -0.1], [x, 0.05, 0.1], [x, 0.45, 0.1], [x, 0.45, -0.1]] as Vec3[],
      closed: true, count: 1,
    })),
    ...[1.2, 1.4, 1.6, 1.8, 2.0, 3.0, 4.0, 5.0, 5.8].map((x, k) => ({
      mark: `B1-M${k}`, dia: 10, role: 'stirrup' as const, member: 'B1', bendDia: [40, 40, 40, 40],
      path: [[x, 0.05, -0.1], [x, 0.05, 0.1], [x, 0.45, 0.1], [x, 0.45, -0.1]] as Vec3[],
      closed: true, count: 1,
    })),
  ],
}
const cut: CutInput = { cage, along, origin, b: 0.3, h: 0.5, soffit: 0 }

describe('cutting a beam', () => {
  it('reports the bars that cross the cut, and only those', () => {
    // The extra bottom bar runs 2 → 4 m. It belongs in the midspan section and
    // in neither support section — which is the whole reason three cuts are
    // drawn rather than one "typical" one.
    expect(cutBeam(cut, 0.5, 'A').bars).toHaveLength(4)
    expect(cutBeam(cut, 3.0, 'B').bars).toHaveLength(5)
    expect(cutBeam(cut, 5.5, 'C').bars).toHaveLength(4)
  })

  it('measures bars from the beam’s centreline and its soffit', () => {
    const s = cutBeam(cut, 3.0, 'B')
    const top = s.bars.filter((b) => b.role === 'top')
    expect(top.map((b) => Math.round(b.up * 1000))).toEqual([440, 440])
    expect(top.map((b) => Math.round(b.across * 1000)).sort((p, q) => p - q)).toEqual([-90, 90])
    // and the extra sits on the centreline, at the bottom
    const extra = s.bars.find((b) => b.dia === 25)!
    expect(Math.round(extra.across * 1000)).toBe(0)
    expect(Math.round(extra.up * 1000)).toBe(60)
  })

  it('catches a bar that starts between two vertices, not just at one', () => {
    // The extra bar starts at exactly 2.0 m; a cut at 2.0 has to see it, and a
    // cut a millimetre before must not.
    expect(cutBeam(cut, 2.0, 'X').bars.some((b) => b.dia === 25)).toBe(true)
    expect(cutBeam(cut, 1.999, 'X').bars.some((b) => b.dia === 25)).toBe(false)
  })

  it('reports the spacing in force at the cut, not an average', () => {
    expect(cutBeam(cut, 0.5, 'A').spacing).toBe(100)     // the end zone
    expect(cutBeam(cut, 3.5, 'B').spacing).toBe(1000)    // the wide middle
  })

  it('takes the stirrup outline from a real hoop', () => {
    const s = cutBeam(cut, 0.5, 'A')
    expect(s.stirrupDia).toBe(10)
    expect(s.stirrup).toHaveLength(4)
    const ups = s.stirrup.map(([, up]) => Math.round(up * 1000))
    expect(Math.min(...ups)).toBe(50)
    expect(Math.max(...ups)).toBe(450)
  })

  it('is empty of bars where the beam has none, without throwing', () => {
    expect(cutBeam({ ...cut, cage: { member: 'B1', runs: [] } }, 3, 'B').bars).toEqual([])
  })
})

describe('the three cuts of a span', () => {
  it('takes them at the two FACES and midspan, in order', () => {
    const s = spanSections(cut, 0, 6, 0.15, 0.15)
    expect(s.map((x) => x.label)).toEqual(['A', 'B', 'C'])
    expect(s[0].at).toBeGreaterThan(0.15)          // just inside the left face
    expect(s[0].at).toBeLessThan(0.45)
    expect(s[1].at).toBeCloseTo(3.0, 6)
    expect(s[2].at).toBeGreaterThan(5.55)
    expect(s[2].at).toBeLessThan(5.85)
  })

  it('gives nothing for a degenerate span rather than a division by zero', () => {
    expect(spanSections(cut, 3, 3)).toEqual([])
    expect(spanSections(cut, 0, 6, 4, 4)).toEqual([])
  })
})

describe('sectionTally', () => {
  it('groups by diameter, largest first', () => {
    expect(sectionTally(cutBeam(cut, 3.0, 'B'))).toEqual({ top: '2-⌀20', bot: '1-⌀25 + 2-⌀20' })
  })

  it('says nothing about a face that has no bars', () => {
    expect(sectionTally(cutBeam({ ...cut, cage: { member: 'B1', runs: [] } }, 3, 'B')))
      .toEqual({ top: '', bot: '' })
  })
})
