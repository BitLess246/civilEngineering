import { describe, it, expect } from 'vitest'
import {
  retentionFromCn, runoffDepth, compositeCn, runoffVolumeM3,
  lagTc, triangularUH, scsRunoffSuite,
} from './runoffHydrology'

describe('SCS retention and runoff depth', () => {
  it('S = 25400/CN − 254 (mm)', () => {
    expect(retentionFromCn(80)).toBeCloseTo(63.5, 10)
    expect(retentionFromCn(100)).toBeCloseTo(0, 10)
    expect(retentionFromCn(81)).toBeCloseTo(25400 / 81 - 254, 10)
  })

  it('runoff depth for P = 120 mm, CN = 80 → 67.408 mm', () => {
    const r = runoffDepth(120, 80)
    expect(r.S).toBeCloseTo(63.5, 10)
    expect(r.Ia).toBeCloseTo(12.7, 10)
    expect(r.Q).toBeCloseTo(67.4080211, 4)
    expect(r.coefficient).toBeCloseTo(0.5617335, 5)
  })

  it('no runoff below the initial abstraction', () => {
    const r = runoffDepth(10, 80)
    expect(r.Q).toBe(0)
    expect(r.coefficient).toBe(0)
    expect(r.notes.some((n) => n.includes('no runoff'))).toBe(true)
  })

  it('the classic Ia = 0.2S note appears when the ratio departs', () => {
    const r = runoffDepth(120, 80, 0.05)
    expect(r.Ia).toBeCloseTo(3.175, 6)
    expect(r.notes.some((n) => n.includes('0.05'))).toBe(true)
  })

  it('rejects negative rainfall and bad curve numbers', () => {
    expect(() => runoffDepth(-1, 80)).toThrow()
    expect(() => runoffDepth(120, 25)).toThrow()
    expect(() => runoffDepth(120, 101)).toThrow()
  })
})

describe('composite curve number', () => {
  it('area-weighted mean: 20 ha CN75 + 30 ha CN85 → 81', () => {
    const r = compositeCn([
      { name: 'Meadow', area: 20, cn: 75 },
      { name: 'Roofs', area: 30, cn: 85 },
    ])
    expect(r.cn).toBeCloseTo(81, 10)
    expect(r.area).toBeCloseTo(50, 10)
    expect(r.rows[0].weight).toBeCloseTo(0.4, 10)
  })

  it('validates the parts', () => {
    expect(() => compositeCn([])).toThrow()
    expect(() => compositeCn([{ name: 'X', area: 0, cn: 75 }])).toThrow()
    expect(() => compositeCn([{ name: 'X', area: 5, cn: 20 }])).toThrow()
  })
})

describe('TR-55 lag and triangular UH — hand-checked', () => {
  it('lag 0.272577 hr and Tc 0.454294 hr for L=500 m, S=63.5 mm, Y=3 %', () => {
    const r = lagTc(500, 63.5, 3)
    expect(r.lagHr).toBeCloseTo(0.2725766, 5)
    expect(r.tcHr).toBeCloseTo(0.4542944, 5)
  })

  it('Tp, Qp, tb for A = 0.5 km², Q = 67.408 mm, Δt = 10 min', () => {
    const r = triangularUH(0.5, 67.4080211, 0.4542944, 10)
    expect(r.tp).toBeCloseTo(0.3559100, 5) // Δt/2 + 0.6·Tc
    expect(r.qp).toBeCloseTo(19.6972122, 3) // 0.208·A·Q/Tp
    expect(r.tb).toBeCloseTo(2.67 * 0.3559100, 5)
  })

  it('zero runoff depth gives a zero peak', () => {
    const r = triangularUH(2, 0, 1)
    expect(r.qp).toBe(0)
  })

  it('validates the inputs', () => {
    expect(() => lagTc(0, 60, 3)).toThrow()
    expect(() => lagTc(500, 60, -1)).toThrow()
    expect(() => triangularUH(0, 50, 1)).toThrow()
    expect(() => triangularUH(1, 50, 0)).toThrow()
  })
})

describe('the full SCS suite', () => {
  it('chains composite CN → depth → Tc → peak → volume (hand-checked)', () => {
    const s = scsRunoffSuite({
      parts: [
        { name: 'Meadow', area: 20, cn: 75 },
        { name: 'Roofs', area: 30, cn: 85 },
      ],
      P: 120, L: 500, slopePct: 3,
    })
    // composite CN 81 → S 59.5802, Ia 11.9161, Q 69.6758 mm
    expect(s.composite.cn).toBeCloseTo(81, 10)
    expect(s.runoff.S).toBeCloseTo(59.5802, 3)
    expect(s.runoff.Q).toBeCloseTo(69.6758196, 3)
    // lag with S = 59.5802 → 0.2641070 hr, Tc 0.4401784
    expect(s.lag.lagHr).toBeCloseTo(0.2641070, 4)
    expect(s.lag.tcHr).toBeCloseTo(0.4401784, 4)
    // peak on 0.5 km² → 20.8562 m³/s
    expect(s.uh.qp).toBeCloseTo(20.8561977, 2)
    // volume 10·Q·A(ha) = 34,837.91 m³
    expect(s.volumeM3).toBeCloseTo(34837.9098, 1)
  })

  it('runoff volume helper: 10 mm over 50 ha is 5000 m³', () => {
    expect(runoffVolumeM3(10, 50)).toBeCloseTo(5000, 9)
  })
})
