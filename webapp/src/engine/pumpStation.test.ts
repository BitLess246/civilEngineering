import { describe, it, expect } from 'vitest'
import {
  hwFriction, minorLoss, systemHead, pumpHead, operatingPoint, npsh, affinity, PATM_HEAD,
} from './pumpStation'

const SYS: Parameters<typeof systemHead>[0] = {
  staticLift: 20,
  pressureHead: 0,
  suction: { L: 50, D: 0.3, C: 120, K: 2 },
  discharge: { L: 300, D: 0.3, C: 120, K: 5 },
}

describe('friction and minor losses', () => {
  it('matches the hand Hazen–Williams evaluation', () => {
    // 10.67·100·0.05^1.852/(120^1.852·0.3^4.8704) = 0.206368 m
    expect(hwFriction(100, 0.05, 120, 0.3)).toBeCloseTo(0.206368, 4)
  })
  it('zero flow loses nothing', () => {
    expect(hwFriction(100, 0, 120, 0.3)).toBe(0)
    expect(minorLoss(0, 0.3, 5)).toBe(0)
  })
  it('minor losses follow ΣK·V²/2g', () => {
    // V = 0.70736 m/s at Q = 0.05 in DN 300 → hm = 7·0.50035/19.62
    expect(minorLoss(0.05, 0.3, 7)).toBeCloseTo(0.178497, 4)
  })
})

describe('the system curve', () => {
  it('starts at the static + pressure head', () => {
    expect(systemHead(SYS, 0)).toBe(20)
  })
  it('matches the hand evaluation at Q = 0.05 m³/s', () => {
    // 20 + 0.10334 + 0.62006 + 0.17850 = 20.9008
    expect(systemHead(SYS, 0.05)).toBeCloseTo(20.9008, 3)
  })
  it('rises with the flow', () => {
    expect(systemHead(SYS, 0.12)).toBeGreaterThan(systemHead(SYS, 0.05))
  })
})

describe('the pump curve', () => {
  it('passes through the shutoff head and the rated point', () => {
    expect(pumpHead(0, 30, 0.12, 24)).toBe(30)
    expect(pumpHead(0.12, 30, 0.12, 24)).toBe(24)
  })
})

describe('the operating point', () => {
  // H0 = 30, rated (0.12, 24): the curves cross near Q ≈ 0.116, H ≈ 24.4.
  const PUMP = { H0: 30, Qd: 0.12, Hd: 24, eta: 0.7, motorEta: 0.9 }
  const op = operatingPoint(SYS, PUMP)

  it('sits where the curves meet', () => {
    expect(op.Q).toBeGreaterThan(0.11)
    expect(op.Q).toBeLessThan(0.121)
    expect(op.H).toBeCloseTo(systemHead(SYS, op.Q), 9)
    expect(op.H).toBeGreaterThan(24.0)
    expect(op.H).toBeLessThan(24.7)
  })

  it('chains the power arithmetic', () => {
    expect(op.Pshaft).toBeCloseTo(op.Pwater / 0.7, 6)
    expect(op.Pmotor).toBeCloseTo(op.Pwater / 0.63, 6)
    expect(op.kwhPerM3).toBeCloseTo(op.Pshaft / (op.Q * 1000), 6)
  })

  it('refuses a pump that cannot lift the static head', () => {
    expect(() => operatingPoint(SYS, { ...PUMP, H0: 19 })).toThrow()
  })
})

describe('NPSH', () => {
  it('flooded suction with generous margin', () => {
    const r = npsh({ patmHead: 10.33, vapourHead: 0.24, zSuction: 2, hfSuction: 0.5, npshRequired: 3 })
    expect(r.npshAvailable).toBeCloseTo(11.59, 4)
    expect(r.npshRequired).toBeCloseTo(3.9, 6)
    expect(r.ok).toBe(true)
  })
  it('flags the lifting, friction-heavy case', () => {
    const r = npsh({ patmHead: 10.33, vapourHead: 0.24, zSuction: -7, hfSuction: 1.0, npshRequired: 3 })
    expect(r.npshAvailable).toBeCloseTo(2.09, 4)
    expect(r.ok).toBe(false)
  })
  it('uses the sea-level head as the default atmosphere', () => {
    expect(PATM_HEAD).toBeCloseTo(10.33, 2)
  })
})

describe('affinity laws', () => {
  it('scales Q, H², P³', () => {
    const a = affinity(0.1, 25, 30, 1.2)
    expect(a.Q).toBeCloseTo(0.12, 9)
    expect(a.H).toBeCloseTo(36, 9)
    expect(a.P).toBeCloseTo(51.84, 9)
  })
})
