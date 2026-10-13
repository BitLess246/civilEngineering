import { describe, it, expect } from 'vitest'
import { designTrussMember, designTruss, compressionScope, e5Slenderness, trussNotAssessed } from './trussDesign'
import { effectiveSection, shapeByName, shapesOf } from './aiscSections'
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

// ── Scope + §E5 (fail closed on compression the check does not cover) ──────
describe('compressionScope — AISC 360-16 Table B4.1a λr and §E4/§E5 applicability', () => {
  const E = 200_000, Fy = 248, rt = Math.sqrt(E / Fy)   // √(E/Fy) = 28.40
  const sc = (name: string, double = false) => compressionScope(effectiveSection(shapeByName(name)!, double), E, Fy)

  it('tees and channels are in scope (§E4 implemented); double angles are not (§E6)', () => {
    expect(sc('WT75x9').supported).toBe(true)
    expect(sc('C150x12.2').supported).toBe(true)
    expect(sc('L51x51x6.4', true).supported).toBe(false)
    expect(sc('L51x51x6.4', true).reason).toContain('§E6')
  })

  it('angle legs: slender ones (> 0.45√(E/Fy) = 12.78) are taken by §E7 up to 0.71√(E/Fy) = 20.16; past it, Eq. E4-4', () => {
    expect(0.45 * rt).toBeCloseTo(12.78, 2)
    expect(0.71 * rt).toBeCloseTo(20.16, 2)
    expect(sc('L51x51x6.4').supported).toBe(true)        // 50.8/6.35 = 8.0
    const slender = shapesOf('L').find((s) => { const bt = Math.max(s.leg1!, s.leg2!) / s.t!; return bt > 0.45 * rt && bt <= 0.71 * rt })!
    expect(compressionScope(effectiveSection(slender), E, Fy).supported).toBe(true)
    const thin = shapesOf('L').find((s) => Math.max(s.leg1!, s.leg2!) / s.t! > 0.71 * rt)
    if (thin) {
      const r = compressionScope(effectiveSection(thin), E, Fy)
      expect(r.supported).toBe(false)
      expect(r.reason).toContain('E4-4')
    }
  })

  it('HSS with slender walls is in scope — §E7 effective area', () => {
    expect(sc('HSS50x50x4.8').supported).toBe(true)
    expect(sc('HSS305x305x6.4').supported).toBe(true)     // (b−3t)/t = 48.5 > 39.76
  })

  it('PIPE: D/t ≤ 0.11E/Fy = 88.7 (case 9)', () => {
    expect(0.11 * E / Fy).toBeCloseTo(88.71, 2)
    expect(sc('PIPE 4 STD').supported).toBe(true)        // 114.3/5.61 = 20.4
  })

  it('a custom (A, r) section cannot be scoped', () => {
    const custom = { label: 'custom', family: 'HSS' as const, A: 1000, rx: 20, ry: 20, rmin: 20, double: false,
      base: { name: 'custom', family: 'HSS' as const, A: 1000, rx: 20, ry: 20, b: 30, h: 30, t: 15 } }
    expect(compressionScope(custom, E, Fy).supported).toBe(false)
  })
})

describe('§E5(a) single-angle effective slenderness — hand calcs', () => {
  const eq = { r: 15.4, legTerm: 0, rz: 9.83 }               // L51x51x6.4
  it('L/rx ≤ 80: Lc/r = 72 + 0.75·L/rx (E5-1)', () => {
    // L = 1000 mm → L/rx = 64.94 → 72 + 48.70 = 120.70
    expect(e5Slenderness(1000, eq)).toBeCloseTo(72 + 0.75 * (1000 / 15.4), 9)
    expect(e5Slenderness(1000, eq)).toBeCloseTo(120.70, 2)
  })
  it('L/rx > 80: Lc/r = 32 + 1.25·L/rx (E5-2)', () => {
    // L = 1500 mm → L/rx = 97.40 → 32 + 121.75 = 153.75
    expect(e5Slenderness(1500, eq)).toBeCloseTo(153.75, 2)
  })
  it('continuous at L/rx = 80', () => {
    expect(72 + 0.75 * 80).toBeCloseTo(32 + 1.25 * 80, 12)
  })
  it('unequal legs: + 4[(bl/bs)² − 1], floored at 0.95·L/rz', () => {
    const un = { r: 20, legTerm: 4 * ((76.2 / 50.8) ** 2 - 1), rz: 10.9 }
    const base = 72 + 0.75 * (1000 / 20)
    expect(e5Slenderness(1000, un)).toBeCloseTo(Math.max(base + un.legTerm, 0.95 * 1000 / 10.9), 9)
  })
  it('designTrussMember uses §E5 for a single angle in compression, L/r in tension', () => {
    const scope = compressionScope(effectiveSection(shapeByName('L51x51x6.4')!), 200_000, 248)
    const sec = { A: 609, r: 9.83, E: 200_000, Fy: 248, K: 1.0, e5: scope.e5 }
    const c = designTrussMember({ id: 'c', N: -10, L: 1.5, kind: 'diagonal', i: 'a', j: 'b' }, sec)
    expect(c.slenderness).toBeCloseTo(e5Slenderness(1500, scope.e5!), 9)
    const t = designTrussMember({ id: 't', N: 10, L: 1.5, kind: 'diagonal', i: 'a', j: 'b' }, sec)
    expect(t.slenderness).toBeCloseTo(1500 / 9.83, 9)
  })
})

describe('trussNotAssessed', () => {
  it('names §D2(b) only when there is tension, and always the connections', () => {
    const comp = [{ id: 'c', N: -1, L: 1, kind: 'top' as const, i: 'a', j: 'b' }]
    expect(trussNotAssessed(comp).some((n) => n.includes('§D2(b)'))).toBe(false)
    expect(trussNotAssessed([...comp, { ...comp[0], id: 't', N: 1 }]).some((n) => n.includes('§D2(b)'))).toBe(true)
    expect(trussNotAssessed(comp).some((n) => n.includes('connections'))).toBe(true)
  })
})
