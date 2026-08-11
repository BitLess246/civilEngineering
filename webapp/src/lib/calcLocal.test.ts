// ─────────────────────────────────────────────────────────────────────────
// `calcLocal` is the engine assembled into the shape the connection page
// consumes. It had no tests, which was tolerable while it only forwarded
// arguments — it now BRANCHES (grid vs free-form pattern) and DERIVES two
// values the page prints as answers, so the branch and the derivation are
// worth pinning.
//
// The API client falls back to this module whenever the calc service is
// absent, which is every current deployment, so this is the code path users
// actually run.
// ─────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { localConnection } from './calcLocal'
import type { ConnectionCalcInput } from './calcApi'

const BASE: ConnectionCalcInput = {
  Vu: 150, Hu: 0,
  boltGrade: 'A325M',
  db: 20, nRows: 3, nCols: 1,
  sy: 70, sx: 70, ey: 40, ex_edge: 35,
  threads: true,
  tPlate: 10, FuPlate: 400, FyPlate: 248,
  ex_load: 0, ey_load: 0, e_out: 0, b_gage: 0,
}

describe('localConnection — grid vs free-form pattern', () => {
  it('gives the same answer for a custom pattern that spells out the grid', () => {
    const grid = localConnection(BASE)
    const asPositions = grid.geom.bolts.map((b) => ({
      id: b.id, x: b.x + grid.geom.Cx, y: b.y + grid.geom.Cy,
    }))
    const custom = localConnection({ ...BASE, bolts: asPositions })
    expect(custom.geom.Ip).toBeCloseTo(grid.geom.Ip, 6)
    expect(custom.eccentric.Rmax).toBeCloseTo(grid.eccentric.Rmax, 9)
    expect(custom.eccentric.critical).toBe(grid.eccentric.critical)
    expect(custom.maxVu).toBeCloseTo(grid.maxVu, 6)
  })

  it('drops block shear for a free-form pattern instead of inventing a bolt line', () => {
    const grid = localConnection(BASE)
    expect(grid.blockShear.length).toBeGreaterThan(0)
    const custom = localConnection({
      ...BASE,
      bolts: [{ id: 'B1', x: 0, y: 0 }, { id: 'B2', x: 120, y: 0 }, { id: 'B3', x: 60, y: 100 }],
    })
    expect(custom.blockShear).toEqual([])
    expect(custom.geom.n).toBe(3)
  })

  it('an empty bolts array is not a custom pattern', () => {
    // Guards the truthiness check: `[]` must fall back to the grid, or clearing
    // the editor would silently solve a connection with no bolts in it.
    const withEmpty = localConnection({ ...BASE, bolts: [] })
    expect(withEmpty.geom.n).toBe(BASE.nRows * BASE.nCols)
    expect(withEmpty.blockShear.length).toBeGreaterThan(0)
  })
})

describe('localConnection — shear planes', () => {
  it('doubles the bolt shear capacity and halves the reported stress', () => {
    const single = localConnection(BASE)
    const double = localConnection({ ...BASE, nShear: 2 })
    expect(double.phiRnBolt.phiRn_shear).toBeCloseTo(2 * single.phiRnBolt.phiRn_shear, 9)
    // Same load on the same group ⇒ same Rmax, spread over twice the area.
    expect(double.eccentric.Rmax).toBeCloseTo(single.eccentric.Rmax, 9)
    expect(double.tauMax).toBeCloseTo(single.tauMax / 2, 9)
  })

  it('defaults to single shear', () => {
    expect(localConnection(BASE).tauMax).toBeCloseTo(localConnection({ ...BASE, nShear: 1 }).tauMax, 12)
  })
})

describe('localConnection — the maximum applied load', () => {
  // The LRFD statement of what the old standalone page answered in allowable
  // stress. The elastic method is linear in the load, so this is a scaling —
  // and the test is that re-solving AT that load lands exactly on capacity.
  it('is the load at which the critical bolt reaches φRn', () => {
    const inp = { ...BASE, ex_load: 90 }        // eccentric, so torsion is in play
    const r = localConnection(inp)
    expect(r.maxVu).toBeGreaterThan(0)
    const atMax = localConnection({ ...inp, Vu: r.maxVu })
    expect(atMax.eccentric.Rmax).toBeCloseTo(atMax.phiRnBolt.phiRn, 6)
  })

  it('rises with the bolt capacity', () => {
    const inp = { ...BASE, ex_load: 90 }
    expect(localConnection({ ...inp, nShear: 2 }).maxVu)
      .toBeGreaterThan(localConnection(inp).maxVu)
  })

  it('τmax is the critical bolt force over the bolt area', () => {
    const r = localConnection({ ...BASE, ex_load: 90 })
    expect(r.tauMax).toBeCloseTo((r.eccentric.Rmax * 1000) / r.phiRnBolt.Ab, 9)
  })
})
