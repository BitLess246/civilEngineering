// ─────────────────────────────────────────────────────────────────────────
// `calcLocal` is the engine assembled into the shape the connection page
// consumes. It had no tests, which was tolerable while it only forwarded
// arguments — it now BRANCHES (grid vs free-form pattern) and DERIVES two
// values the page prints as answers, so the branch and the derivation are
// worth pinning.
//
// It is also what the Vercel Edge functions in `api/steel/` run, so these
// tests cover the server path and the browser fallback at once — which is the
// reason both sides share the module rather than each composing the engine
// their own way.
// ─────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { localBeam, localColumn, localConnection } from './calcLocal'
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

// ── LRFD / ASD ────────────────────────────────────────────────────────────
// The dual format is where a wrong answer looks right. These tests check the
// two things that make it wrong: a capacity converted on one basis while the
// demand stays on the other, and a φ left hard-coded somewhere downstream.

const BEAM = { shapeName: 'W310x38.7', Fy: 345, span: 6, Lb: 2, Cb: 1, wDead: 15, wLive: 25 }
const COL  = { shapeName: 'W250x67', Fy: 345, L: 4, Kx: 1, Ky: 1, Pu: 900, Mux: 60, Muy: 0 }

describe('localBeam / localColumn — Lb reaches the solver in mm', () => {
  // The page labels its input "Unbraced Lb (m)" and passed the metres straight
  // into beamFlexure, which compares Lb against Lp in MILLIMETRES. Every result
  // therefore came back in the plastic zone at Mn = Mp — the LTB check on
  // /steel/beam and /steel/column was inert.
  it('an Lb past Lr lands in the elastic zone, not "plastic"', () => {
    // W310x38.7, Fy 345: Lp ≈ 1.63 m, Lr ≈ 4.9 m.
    const r = localBeam({ ...BEAM, Lb: 8 })
    expect(r.flex.Lp).toBeGreaterThan(1000)          // Lp is mm, as documented
    expect(8000).toBeGreaterThan(r.flex.Lr)
    expect(r.flex.ltbZone).toBe('elastic')
    expect(r.flex.Mn).toBeLessThan(r.flex.Mp)
  })

  it('Mn falls monotonically as the brace spacing grows', () => {
    const at = (Lb: number) => localBeam({ ...BEAM, Lb }).flex.Mn
    expect(at(1)).toBeGreaterThan(at(4))
    expect(at(4)).toBeGreaterThan(at(8))
    expect(at(1)).toBeCloseTo(localBeam({ ...BEAM, Lb: 1 }).flex.Mp, 9)   // Lb < Lp
  })

  it('the column §H1-1 moment term sees the member length in mm', () => {
    // L = 12 m is well past Lr for a W250x67, so φMnx must be reduced.
    const short = localColumn({ ...COL, L: 1 })
    const long  = localColumn({ ...COL, L: 12 })
    expect(long.flexX.ltbZone).not.toBe('plastic')
    expect(long.flexX.Mn).toBeLessThan(short.flexX.Mn)
  })
})

describe('localBeam — design basis', () => {
  it('defaults to LRFD, unchanged from before the basis existed', () => {
    const r = localBeam(BEAM)
    expect(r.basis).toBe('LRFD')
    expect(r.avail.Mn).toBeCloseTo(r.flex.phiMn, 9)
    expect(r.avail.Vn).toBeCloseTo(r.shear.phiVn, 9)
    expect(r.loads.wu).toBeCloseTo(Math.max(1.4 * 15, 1.2 * 15 + 1.6 * 25), 9)
  })

  it('moves BOTH sides when switched to ASD', () => {
    const lrfd = localBeam(BEAM)
    const asd = localBeam({ ...BEAM, basis: 'ASD' })
    // capacity down…
    expect(asd.avail.Mn).toBeCloseTo(lrfd.flex.Mn / 1.67, 9)
    // …and demand down too. A capacity-only switch would be the classic error.
    expect(asd.loads.wu).toBeCloseTo(15 + 25, 9)
    expect(asd.loads.Mu).toBeLessThan(lrfd.loads.Mu)
  })

  it('leaves the nominal strength alone — only the factor changes', () => {
    expect(localBeam({ ...BEAM, basis: 'ASD' }).flex.Mn)
      .toBeCloseTo(localBeam(BEAM).flex.Mn, 9)
  })

  it('uses the §G2.1(a) shear pair for a rolled web', () => {
    const r = localBeam(BEAM)
    expect(r.shear.slenderWeb).toBe(false)
    // φv = 1.00 ⇒ the LRFD available equals the nominal
    expect(r.avail.Vn).toBeCloseTo(r.shear.Vn, 9)
    // and Ω = 1.50, not the 1.67 that flexure uses
    expect(localBeam({ ...BEAM, basis: 'ASD' }).avail.Vn).toBeCloseTo(r.shear.Vn / 1.5, 9)
  })

  it('deflection is a SERVICE check and does not move with the basis', () => {
    const lrfd = localBeam(BEAM), asd = localBeam({ ...BEAM, basis: 'ASD' })
    expect(asd.loads.deltaL).toBeCloseTo(lrfd.loads.deltaL, 9)
    expect(asd.loads.limL360).toBeCloseTo(lrfd.loads.limL360, 9)
  })
})

describe('localColumn — design basis', () => {
  it('checks §H1-1 against the available strengths, not the LRFD ones', () => {
    const asd = localColumn({ ...COL, basis: 'ASD' })
    // Rebuild the interaction by hand from the reported available values.
    const pr = COL.Pu / asd.avail.Pn
    const mr = COL.Mux / asd.avail.Mnx
    const expected = pr >= 0.2 ? pr + (8 / 9) * mr : pr / 2 + mr
    expect(asd.comb.ratio).toBeCloseTo(expected, 9)
  })

  it('reports a higher utilisation under ASD for the SAME entered load', () => {
    // Same Pu against a smaller allowable — which is why the page relabels the
    // input Pu → Pa: entering a factored load under ASD is the user's error to
    // avoid, and the ratio has to move so it is visible.
    expect(localColumn({ ...COL, basis: 'ASD' }).comb.ratio)
      .toBeGreaterThan(localColumn(COL).comb.ratio)
  })

  it('defaults to LRFD with the pre-existing numbers', () => {
    const r = localColumn(COL)
    expect(r.basis).toBe('LRFD')
    expect(r.avail.Pn).toBeCloseTo(r.axial.phiPn, 9)
    expect(r.avail.Mnx).toBeCloseTo(r.flexX.phiMn, 9)
  })
})

describe('localConnection — design basis', () => {
  it('converts every capacity, including block shear', () => {
    const lrfd = localConnection(BASE)
    const asd = localConnection({ ...BASE, basis: 'ASD' })
    expect(asd.avail.governing).toBeCloseTo(lrfd.phiRnBolt.Rn / 2.0, 9)
    for (let k = 0; k < lrfd.blockShear.length; k++) {
      expect(asd.availBlockShear[k]).toBeCloseTo(lrfd.availBlockShear[k] * (0.5 / 0.75), 9)
    }
  })

  it('lowers the maximum applied load with the capacity', () => {
    const inp = { ...BASE, ex_load: 90 }
    expect(localConnection({ ...inp, basis: 'ASD' }).maxVu)
      .toBeCloseTo(localConnection(inp).maxVu * (0.5 / 0.75), 6)
  })

  it('§J3.7 is re-derived, not rescaled', () => {
    // The factor sits INSIDE the reduction: F'nt = 1.3Fnt − (Fnt / available
    // Fnv)·frv. So the ASD tension capacity is NOT the LRFD one times
    // (1/Ω)/φ — if it were, the formula had been treated as a multiplier.
    const inp = { ...BASE, Vu: 60, e_out: 80, b_gage: 45, ex_load: 20 }
    const lrfd = localConnection(inp)
    const asd = localConnection({ ...inp, basis: 'ASD' })
    // Both must be in the ACTIVE range of the reduction — a group loaded until
    // F'nt clamps to zero gives 0 on both bases and proves nothing.
    expect(lrfd.outOfPlane!.phiTn_crit).toBeGreaterThan(0)
    expect(asd.outOfPlane!.phiTn_crit).toBeGreaterThan(0)
    const naiveRescale = lrfd.outOfPlane!.phiTn_crit * (0.5 / 0.75)
    expect(asd.outOfPlane!.phiTn_crit).not.toBeCloseTo(naiveRescale, 3)
    // …and it is still lower than the LRFD value, as an allowable must be.
    expect(asd.outOfPlane!.phiTn_crit).toBeLessThan(lrfd.outOfPlane!.phiTn_crit)
  })

  it('prying uses the ASD plate-flexure factor in the required thickness', () => {
    const inp = { ...BASE, Vu: 60, e_out: 80, b_gage: 45, ex_load: 20 }
    const lrfd = localConnection(inp)
    const asd = localConnection({ ...inp, basis: 'ASD' })
    expect(lrfd.prying).not.toBeNull()
    // A thinner allowable plate-flexure capacity means MORE thickness needed.
    expect(asd.prying!.t_req).toBeGreaterThan(lrfd.prying!.t_req)
  })
})
