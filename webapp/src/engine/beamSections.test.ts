import { describe, it, expect } from 'vitest'
import { solveFEM, type Support, type BeamLoad } from './beamAnalysis'
import { detectCriticalSections } from './beamSections'

const E = 25000, I = 3.125e9

describe('critical-section auto-detect', () => {
  it('SS + UDL: two supports (Vu = |R| = wL/2) + midspan V=0 (Mu = wL²/8)', () => {
    const L = 6, w = 10
    const r = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'roller', x: L }] as Support[],
      [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }] as BeamLoad[], L, E, I)!
    const secs = detectCriticalSections(r)
    expect(secs).toHaveLength(3)
    expect(secs[0].Vu).toBeCloseTo((w * L) / 2, 2)            // Case A: |R|
    expect(secs[2].Vu).toBeCloseTo((w * L) / 2, 2)
    // the global Max +M claims the midspan slot before the V=0 pass (legacy order)
    const mid = secs[1]
    expect(mid.label).toMatch(/Max \+M|Midspan/)
    expect(mid.x).toBeCloseTo(L / 2, 2)
    expect(mid.Mu).toBeCloseTo((w * L * L) / 8, 1)
  })

  it('2-span continuous: interior support claims Max −M (dedup) with the face shear', () => {
    const L = 6, w = 10
    const r = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'roller', x: 3 }, { type: 'roller', x: 6 }] as Support[],
      [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }] as BeamLoad[], L, E, I)!
    const secs = detectCriticalSections(r)
    const interior = secs.find((s) => s.label.startsWith('Interior'))!
    // hogging at the interior support: M = −w·l²/8 with l = 3
    expect(interior.Mu).toBeCloseTo((-w * 9) / 8, 1)
    // no separate "Max −M" card — deduped into the support
    expect(secs.some((s) => s.label.startsWith('Max −M'))).toBe(false)
    // interior face shear = larger in-span side = 5wl/8 = 18.75
    expect(interior.Vu).toBeCloseTo((5 * w * 3) / 8, 1)
    // one moment extremum per span — one carries the global Max +M label,
    // the mirror-span crossing keeps the per-span label (legacy dedup order)
    expect(secs.filter((s) => /Max \+M|extremum/.test(s.label))).toHaveLength(2)
  })

  it('overhang: end support uses Case B (face shear from both sides)', () => {
    // Supports at 0 and 4, beam runs to 6 → 2 m right overhang with UDL.
    const r = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'roller', x: 4 }] as Support[],
      [{ type: 'udl', x1: 0, x2: 6, w: 10, cat: 'D' }] as BeamLoad[], 6, E, I)!
    const secs = detectCriticalSections(r)
    const right = secs.find((s) => s.label.startsWith('Right support'))!
    expect(right.label).toContain('overhang')
    // R0 = 15, R1 = 45. Just left of the support: 15 − 40 = −25; just right:
    // +20 (the overhang). Case B takes the larger face → 25.
    expect(right.Vu).toBeCloseTo(25, 1)
    // hogging over the support: −w·a²/2 = −20 kN·m
    expect(right.Mu).toBeCloseTo(-20, 1)
  })
})
