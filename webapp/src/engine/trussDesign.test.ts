import { describe, it, expect } from 'vitest'
import { designTrussMember, designTruss } from './trussDesign'
import type { TrussSection } from './trussDesign'
import type { MemberForce } from './truss'

// Helper to build a MemberForce without requiring real node IDs.
const mf = (id: string, N: number, L: number, kind: MemberForce['kind'] = 'top'): MemberForce =>
  ({ id, N, L, kind, i: 'n0', j: 'n1' })

const baseSection: TrussSection = { A: 1000, r: 20, E: 200_000, Fy: 250, K: 1.0 }

describe('designTrussMember — tension (§D2)', () => {
  it('φtPn = 0.90·Fy·Ag', () => {
    const r = designTrussMember(mf('m1', 180, 3, 'top'), baseSection)
    expect(r.mode).toBe('tension')
    expect(r.phiPn).toBeCloseTo(0.90 * 250 * 1000 / 1000, 6)   // 225 kN
  })

  it('utilisation = |N| / φPn and ok when ≤ 1', () => {
    const r = designTrussMember(mf('m1', 180, 3, 'top'), baseSection)
    expect(r.util).toBeCloseTo(180 / 225, 9)
    expect(r.ok).toBe(true)
  })

  it('ok = false when over-stressed', () => {
    const r = designTrussMember(mf('m1', 300, 3, 'top'), baseSection)
    expect(r.util).toBeGreaterThan(1)
    expect(r.ok).toBe(false)
  })

  it('slenderOK is always true for tension members', () => {
    const r = designTrussMember(mf('m1', 10, 10, 'bottom'), { ...baseSection, r: 1 })
    expect(r.slenderOK).toBe(true)
  })
})

describe('designTrussMember — zero-force member', () => {
  it('mode = zero, util = 0, ok = true', () => {
    const r = designTrussMember(mf('m0', 0, 2, 'diagonal'), baseSection)
    expect(r.mode).toBe('zero')
    expect(r.util).toBe(0)
    expect(r.ok).toBe(true)
  })

  it('treats N < 1e-6 as zero', () => {
    expect(designTrussMember(mf('m0', 1e-9, 2, 'vertical'), baseSection).mode).toBe('zero')
  })
})

describe('designTrussMember — compression, inelastic buckling (§E3)', () => {
  // KL/r = 100  →  limit ≈ 133.2  →  inelastic
  const sec: TrussSection = { A: 1000, r: 20, E: 200_000, Fy: 250, K: 1.0 }
  const f = mf('c1', -100, 2, 'diagonal')   // L=2m, r=20 → KL/r=100

  it('mode = compression', () => expect(designTrussMember(f, sec).mode).toBe('compression'))

  it('KL/r = 100 is below the inelastic-to-elastic limit', () => {
    const { slenderness } = designTrussMember(f, sec)
    const limit = 4.71 * Math.sqrt(sec.E / sec.Fy)
    expect(slenderness).toBeCloseTo(100, 6)
    expect(slenderness).toBeLessThan(limit)
  })

  it('Fcr = 0.658^(Fy/Fe)·Fy', () => {
    const r = designTrussMember(f, sec)
    const Fe = Math.PI ** 2 * sec.E / (100 ** 2)
    const Fcr = Math.pow(0.658, sec.Fy / Fe) * sec.Fy
    expect(r.Fcr).toBeCloseTo(Fcr, 6)
    expect(r.phiPn).toBeCloseTo(0.90 * Fcr * sec.A / 1000, 6)
  })

  it('slenderOK = true (KL/r = 100 ≤ 200)', () => {
    expect(designTrussMember(f, sec).slenderOK).toBe(true)
  })
})

describe('designTrussMember — compression, elastic buckling (§E3)', () => {
  // KL/r = 600  →  limit ≈ 133.2  →  elastic; also slenderOK = false
  const sec: TrussSection = { A: 1000, r: 5, E: 200_000, Fy: 250, K: 1.0 }
  const f = mf('c2', -2, 3, 'diagonal')   // L=3m, r=5 → KL/r=600

  it('uses elastic Fcr = 0.877·Fe', () => {
    const r = designTrussMember(f, sec)
    const Fe = Math.PI ** 2 * sec.E / (600 ** 2)
    expect(r.Fcr).toBeCloseTo(0.877 * Fe, 6)
  })

  it('slenderOK = false for KL/r > 200', () => {
    expect(designTrussMember(f, sec).slenderOK).toBe(false)
    expect(designTrussMember(f, sec).ok).toBe(false)
  })
})

describe('designTruss — truss-level roll-up', () => {
  const forces: MemberForce[] = [
    mf('a', 100, 3, 'top'),      // tension
    mf('b', -50, 2, 'diagonal'), // compression
    mf('c', 0, 1.5, 'bottom'),   // zero
  ]

  it('members array length equals input length', () => {
    expect(designTruss(forces, baseSection).members).toHaveLength(3)
  })

  it('maxUtil = max of individual utilisations', () => {
    const r = designTruss(forces, baseSection)
    const expected = Math.max(...r.members.map((m) => m.util))
    expect(r.maxUtil).toBeCloseTo(expected, 9)
  })

  it('allOK reflects every member pass/fail', () => {
    const r = designTruss(forces, baseSection)
    expect(r.allOK).toBe(r.members.every((m) => m.ok))
  })

  it('allOK = false when any member fails', () => {
    const r = designTruss([...forces, mf('d', 999, 1, 'top')], baseSection)
    expect(r.allOK).toBe(false)
  })
})
