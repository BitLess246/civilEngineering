import { describe, it, expect } from 'vitest'
import { buildFootingCage, DOWEL_TAIL_DB, type FootingCageInput } from './footingCage'
import { perimeterBars } from './columnCage'
import { cutLength } from './rebarModel'

// A 2.0 m square pad, 450 thick, ⌀16 mat at 8 bars each way, carrying a
// 400×400 column with 8-⌀20 verticals. 75 mm cover against earth (§20.6.1.3.1).
const colBars = perimeterBars({ b: 400, h: 400, cover: 40, barDia: 20, bars: 8, tieDia: 10 })
const pad: FootingCageInput = {
  mark: 'F-n1', B: 2.0, Dc: 450, cover: 75, barDia: 16, bars: 8,
  centre: [3, 5], yTop: 0, colBars, colBarDia: 20, lap: 620,
}
const cage = buildFootingCage(pad)
const byRole = (r: string) => cage.runs.filter((x) => x.role === r)

describe('the mat', () => {
  it('runs both ways, one bar per designed bar, on the pad centre', () => {
    expect(byRole('mat')).toHaveLength(2 * 8)
    for (const r of byRole('mat')) {
      const xs = r.path.map((p) => p[0]), zs = r.path.map((p) => p[2])
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(3 - 1.0)
      expect(Math.max(...xs)).toBeLessThanOrEqual(3 + 1.0)
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(5 - 1.0)
      expect(Math.max(...zs)).toBeLessThanOrEqual(5 + 1.0)
    }
  })

  it('stops a cover short of each edge — bars do not run out of the concrete', () => {
    const x = cage.runs.find((r) => r.mark === 'F-n1-MX1')!
    expect(cutLength(x)).toBeCloseTo(2000 - 2 * 75, 6)
  })

  it('stacks the two directions, so the upper layer really is a diameter higher', () => {
    // `isolatedFooting` designs the second layer at d − db. Drawing both at the
    // same level would contradict the effective depth the design used.
    const yx = cage.runs.find((r) => r.mark === 'F-n1-MX1')!.path[0][1]
    const yz = cage.runs.find((r) => r.mark === 'F-n1-MZ1')!.path[0][1]
    expect(yz - yx).toBeCloseTo(16 / 1000, 9)
    // …and the lower layer sits on its cover, measured off the pad SOFFIT
    expect(yx).toBeCloseTo(-0.45 + (75 + 8) / 1000, 9)
  })
})

describe('the dowels — the lap the column stands on', () => {
  it('one per column vertical, on that bar\'s own line', () => {
    expect(byRole('dowel')).toHaveLength(colBars.length)
    byRole('dowel').forEach((d, k) => {
      const [dx, dz] = colBars[k]
      const top = d.path[d.path.length - 1]
      expect(top[0]).toBeCloseTo(3 + dx / 1000, 9)
      expect(top[2]).toBeCloseTo(5 + dz / 1000, 9)
    })
  })

  it('projects the lap ABOVE the footing, which is what the column splices onto', () => {
    // Without this the column cage stood on nothing and a single-storey frame
    // contained no lap splice anywhere.
    for (const d of byRole('dowel')) {
      expect(Math.max(...d.path.map((p) => p[1]))).toBeCloseTo(0.62, 9)
      expect(Math.min(...d.path.map((p) => p[1]))).toBeLessThan(-0.3)   // down onto the mat
    }
  })

  it('turns a 12db hook OUTWARD, away from the column', () => {
    // A starter bar's foot splays out under the pad, so it bears on concrete
    // outside the column footprint and the group opens up. Turned inboard,
    // every tail points into the same congested core and several cross.
    const half = 1.0
    for (const d of byRole('dowel')) {
      const [tip, knee] = d.path
      expect(tip[1]).toBeCloseTo(knee[1], 9)                      // the tail is horizontal
      const run = Math.hypot(tip[0] - knee[0], tip[2] - knee[2])
      expect(run).toBeCloseTo((DOWEL_TAIL_DB * 20) / 1000, 9)
      // outward: the tail end is FARTHER from the pad centre than the knee
      expect(Math.hypot(tip[0] - 3, tip[2] - 5)).toBeGreaterThan(Math.hypot(knee[0] - 3, knee[2] - 5))
      // …and still inside the concrete
      expect(Math.abs(tip[0] - 3)).toBeLessThanOrEqual(half - 0.075 + 1e-9)
      expect(Math.abs(tip[2] - 5)).toBeLessThanOrEqual(half - 0.075 + 1e-9)
      expect(d.bendDia).toHaveLength(1)
    }
  })

  it('shortens the tail rather than run it out through the side cover', () => {
    // A pad barely bigger than its column has no room for the full 12db. The
    // tail it does have is a real constraint; steel drawn outside the concrete
    // is not.
    const tight = buildFootingCage({ ...pad, B: 0.7 })
    const half = 0.35
    for (const d of tight.runs.filter((r) => r.role === 'dowel')) {
      const [tip, knee] = d.path
      expect(Math.abs(tip[0] - 3)).toBeLessThanOrEqual(half - 0.075 + 1e-9)
      expect(Math.abs(tip[2] - 5)).toBeLessThanOrEqual(half - 0.075 + 1e-9)
      expect(Math.hypot(tip[0] - knee[0], tip[2] - knee[2]))
        .toBeLessThan((DOWEL_TAIL_DB * 20) / 1000)
    }
  })

  it('sits the dowel hook ON the mat, not through it', () => {
    const yz = cage.runs.find((r) => r.mark === 'F-n1-MZ1')!.path[0][1]
    for (const d of byRole('dowel')) {
      expect(d.path[0][1]).toBeGreaterThan(yz)
      expect(d.path[0][1]).toBeCloseTo(yz + (16 + 20) / 2000, 9)
    }
  })
})


describe('a corner bar goes out along the diagonal', () => {
  it('corner dowels splay on BOTH axes, mid-face dowels on one', () => {
    // A corner bar stands on two faces, so the diagonal is the only direction
    // that takes it away from both. Sent along one axis it runs parallel to the
    // face it is on, and the four corners splay into two directions, not four.
    const twelve = perimeterBars({ b: 400, h: 400, cover: 40, barDia: 20, bars: 12, tieDia: 10 })
    const cage = buildFootingCage({ ...pad, colBars: twelve })
    const moved = cage.runs.filter((r) => r.role === 'dowel').map((d) => {
      const [tip, knee] = d.path
      return [Math.abs(tip[0] - knee[0]) > 1e-9, Math.abs(tip[2] - knee[2]) > 1e-9]
    })
    expect(moved.filter(([a, b]) => a && b)).toHaveLength(4)      // the corners
    expect(moved.filter(([a, b]) => a !== b)).toHaveLength(8)     // the mid-face bars
  })

  it('the diagonal tail is still 12db long, not 12db on each axis', () => {
    const cage = buildFootingCage(pad)
    for (const d of cage.runs.filter((r) => r.role === 'dowel')) {
      const [tip, knee] = d.path
      expect(Math.hypot(tip[0] - knee[0], tip[2] - knee[2]))
        .toBeCloseTo((DOWEL_TAIL_DB * 20) / 1000, 9)
    }
  })

  it('every corner splays into its own quadrant', () => {
    const cage = buildFootingCage(pad)
    const dirs = cage.runs.filter((r) => r.role === 'dowel').map((d) => {
      const [tip, knee] = d.path
      return `${Math.sign(Math.round((tip[0] - knee[0]) * 1e6))},${Math.sign(Math.round((tip[2] - knee[2]) * 1e6))}`
    })
    // 8 bars on a square column are four corners plus four mid-face bars; the
    // corners take the four diagonals between them
    expect(new Set(dirs.filter((v) => !v.includes('0'))).size).toBe(4)
  })
})
