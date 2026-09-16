/**
 * Member stress, and whether it tells the same story as the force diagram.
 *
 * Three kinds of case here, in order of how much they can catch:
 *
 * 1. SIGNS, against physics, driven through the real solver. A cantilever with
 *    a downward tip load has its TOP fibre in tension at the support. Nothing
 *    about an internally consistent formula guarantees that, and the two
 *    bending planes do not share a sign convention, so a symmetric formula is
 *    wrong in exactly one of them.
 * 2. MAGNITUDES, against closed forms — σ = M/S, τ = 1.5V/A, the published
 *    Roark torsion coefficient.
 * 3. EQUILIBRIUM, by integrating the stress field back over the section and
 *    recovering the forces the diagram plots. The properties come from the
 *    section library and the outline from the shape's dimensions, so for a
 *    steel shape these are two independent routes and the residual is the
 *    fillet area, measured below.
 */
import { describe, it, expect } from 'vitest'
import {
  normalStress, shearStress, fibreStress, stationStress,
  sectionCells, cellProperties, sectionResultants, stressSection,
  rectTorsionModulus, memberStress,
  type MemberForces, type StressSection,
} from './memberStress'
import { solveFrame3D, rectJ, localAxes, type F3Node, type F3Member, type F3Support, type F3Load } from './frame3d'
import { shapeByName } from './aiscSections'
import type { RectSection } from './model'

const b = 300, h = 500
const rect: RectSection = {
  id: 'S1', name: '300×500', b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
}
const S = stressSection(rect)
const Iz = (b * h ** 3) / 12, Iy = (h * b ** 3) / 12
const Sz = Iz / (h / 2), Sy = Iy / (b / 2)      // section moduli, mm³

const zero: MemberForces = { N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 }
const at = (f: Partial<MemberForces>): MemberForces => ({ ...zero, ...f })

// ── the solver fixture, reused for every sign test ─────────────────────────

const E = 25000, G = E / 2.4
const secProps = { E, G, A: b * h, Iy, Iz, J: rectJ(b, h) }
/** 3 m cantilever along +x, fixed at a — the repo's own frame3d fixture. */
const cant = (loads: F3Load[]) => solveFrame3D(
  [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 3, y: 0, z: 0 }] as F3Node[],
  [{ id: 'm', i: 'a', j: 'b', ...secProps }] as F3Member[],
  [{ node: 'a', fixity: 'fixed' }] as F3Support[],
  loads,
)!

describe('the fixture orients the way the stress formula assumes', () => {
  it('puts local y′ along global up for a horizontal member', () => {
    // The whole sign argument rests on this: y′ is the section DEPTH and it is
    // vertical for a beam, so "the +y fibre" is "the top of the beam".
    const [xp, yp, zp] = localAxes([1, 0, 0])
    expect(xp).toEqual([1, 0, 0])
    expect(yp).toEqual([0, 1, 0])
    expect(zp).toEqual([0, 0, 1])
  })
})

describe('signs — against physics, through the solver', () => {
  it('puts the TOP fibre in tension at a cantilever support (hogging)', () => {
    const P = 20, L = 3
    const m = cant([{ kind: 'member-point', member: 'm', a: L, P, cat: 'D' }]).members[0]
    // Measured, and the reason the Mz term carries a minus: hogging reads as a
    // NEGATIVE Mz in this solver.
    expect(m.Mz[0]).toBeCloseTo(-P * L, 3)

    const f = at({ Mz: m.Mz[0] })
    const top = normalStress(S, f, h / 2, 0)
    const bot = normalStress(S, f, -h / 2, 0)
    expect(top, 'top fibre must be in TENSION at a cantilever support').toBeGreaterThan(0)
    expect(bot).toBeLessThan(0)
    // ... and at the right magnitude: M/S.
    expect(top).toBeCloseTo((P * L * 1e6) / Sz, 9)
    expect(top).toBeCloseTo(4.8, 9)     // 60 kN·m / 1.25e7 mm³
  })

  it('puts the +z fibre in tension when the load pushes toward −z', () => {
    // The OTHER plane, which does not share the convention. A formula
    // symmetric in the two axes passes the test above and fails this one.
    const P = 15, L = 3
    const m = cant([{ kind: 'node', node: 'b', Fz: -P, cat: 'D' }]).members[0]
    expect(m.My[0]).toBeCloseTo(P * L, 3)     // note: POSITIVE here

    const f = at({ My: m.My[0] })
    expect(normalStress(S, f, 0, b / 2), 'convex (+z) side is in tension').toBeGreaterThan(0)
    expect(normalStress(S, f, 0, -b / 2)).toBeLessThan(0)
    expect(normalStress(S, f, 0, b / 2)).toBeCloseTo((P * L * 1e6) / Sy, 9)
  })

  it('changes the tension face along a member that hogs AND sags', () => {
    // A PROPPED CANTILEVER, not a simply supported beam: in 3D two pins leave
    // the member's torsional DOF unrestrained and the solve is singular, which
    // is worth knowing rather than working around. It is the better fixture
    // anyway — both signs of moment live on one member, which is exactly what
    // a signed stress contour has to get right along a single element.
    //
    // Closed forms: M = −wL²/8 hogging at the fixed end, +9wL²/128 sagging at
    // x = 5L/8.
    const w = 12, L = 6
    const r = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }] as F3Node[],
      [{ id: 'm', i: 'a', j: 'b', ...secProps }] as F3Member[],
      [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'pin' }] as F3Support[],
      [{ kind: 'member-udl', member: 'm', w, cat: 'D' }],
    )
    expect(r, 'the propped cantilever must solve').toBeTruthy()
    const m = r!.members[0]

    // Hogging at the built-in end → top in tension, as at any cantilever root.
    expect(m.Mz[0]).toBeCloseTo(-(w * L * L) / 8, 1)
    const hog = at({ Mz: m.Mz[0] })
    expect(normalStress(S, hog, h / 2, 0)).toBeGreaterThan(0)
    expect(normalStress(S, hog, -h / 2, 0)).toBeLessThan(0)

    // Sagging at 5L/8 → the SOFFIT is in tension, the everyday reading.
    const iSag = m.Mz.indexOf(Math.max(...m.Mz))
    expect(m.xs[iSag]).toBeCloseTo((5 * L) / 8, 1)
    expect(m.Mz[iSag]).toBeCloseTo((9 * w * L * L) / 128, 1)
    const sag = at({ Mz: m.Mz[iSag] })
    expect(normalStress(S, sag, -h / 2, 0), 'sagging puts the SOFFIT in tension').toBeGreaterThan(0)
    expect(normalStress(S, sag, h / 2, 0)).toBeLessThan(0)

    // And the two faces genuinely swap along the member — the contour's whole
    // point. Somewhere between them the extreme-fibre stress passes through 0.
    const soffit = m.Mz.map((mz) => normalStress(S, at({ Mz: mz }), -h / 2, 0))
    expect(Math.min(...soffit)).toBeLessThan(0)
    expect(Math.max(...soffit)).toBeGreaterThan(0)
  })

  it('reads axial tension as positive stress everywhere on the section', () => {
    const m = cant([{ kind: 'node', node: 'b', Fx: 50, cat: 'D' }]).members[0]
    expect(m.N[0]).toBeCloseTo(50, 6)
    const f = at({ N: m.N[0] })
    for (const fib of S.fibres) expect(normalStress(S, f, fib.y, fib.z)).toBeCloseTo(50e3 / (b * h), 9)
  })
})

describe('magnitudes — against closed forms', () => {
  it('gives a rectangle τmax = 1.5·V/A at the neutral axis, and zero at the face', () => {
    const V = 90
    const f = at({ Vy: V })
    const na = S.fibres.find((x) => x.label === 'centroid')!
    expect(shearStress(S, f, na)).toBeCloseTo((1.5 * V * 1e3) / (b * h), 9)
    const top = S.fibres.find((x) => x.label === 'top mid')!
    expect(shearStress(S, f, top), 'a free surface carries no shear').toBe(0)
  })

  it('matches the published Roark torsion coefficient for a square', () => {
    // Roark Table 10.1 case 1: τmax = T/(α·a·b²), α = 0.208 at a/b = 1.
    // The coefficient that gives J is 0.1406 at the same aspect ratio; using
    // one for the other is a 48% error on every square column, in the
    // unconservative direction.
    const a = 400
    expect(rectTorsionModulus(a, a) / a ** 3).toBeCloseTo(0.208, 3)
    // A long thin strip tends to α → 1/3.
    expect(rectTorsionModulus(1000, 10) / (1000 * 100)).toBeCloseTo(1 / 3, 2)
    // 2:1 — Roark lists α = 0.246.
    expect(rectTorsionModulus(200, 100) / (200 * 100 ** 2)).toBeCloseTo(0.246, 2)
  })

  it('carries torsion into the shear at every fibre, including the free ones', () => {
    // Found by sabotage: deleting the torsion term from `shearStress` left the
    // whole suite green, because every other shear case is pure VQ/It. A
    // 300×500 column carrying 25 kN·m of torsion is not a corner case.
    const T = 25
    const tau = (T * 1e6) / S.Ct
    expect(tau).toBeGreaterThan(0)
    for (const fib of S.fibres) {
      // Torsion acts on the WHOLE section — including the extreme fibres,
      // which carry no VQ/It shear at all. That is the point of the term.
      expect(shearStress(S, at({ T }), fib), fib.label).toBeCloseTo(tau, 9)
    }
    // Against the Roark coefficient directly: α ≈ 0.236 at a/b = 500/300.
    expect(S.Ct / (500 * 300 * 300)).toBeCloseTo(0.236, 2)
  })

  it('adds torsion to the transverse shear rather than taking the larger', () => {
    const na = S.fibres.find((x) => x.label === 'centroid')!
    const v = shearStress(S, at({ Vy: 90 }), na)
    const t = shearStress(S, at({ T: 25 }), na)
    const both = shearStress(S, at({ Vy: 90, T: 25 }), na)
    expect(both).toBeCloseTo(v + t, 9)
    expect(both).toBeGreaterThan(Math.max(v, t))
  })

  it('reduces von Mises to |σ| under pure bending and √3·τ under pure shear', () => {
    const pureM = fibreStress(S, at({ Mz: -40 }), { y: h / 2, z: 0, label: 't' })
    expect(pureM.tau).toBe(0)
    expect(pureM.vonMises).toBeCloseTo(Math.abs(pureM.sigma), 12)

    const na = S.fibres.find((x) => x.label === 'centroid')!
    const pureV = fibreStress(S, at({ Vy: 90 }), na)
    expect(pureV.sigma).toBe(0)
    expect(pureV.vonMises).toBeCloseTo(Math.sqrt(3) * pureV.tau, 12)
  })

  it('superposes axial and biaxial bending at a corner', () => {
    const f = at({ N: 200, Mz: -30, My: 18 })
    const want = (200e3) / (b * h) - (-30e6 * (h / 2)) / Iz + (18e6 * (b / 2)) / Iy
    expect(normalStress(S, f, h / 2, b / 2)).toBeCloseTo(want, 9)
    // The envelope finds it without being told where to look.
    const st = stationStress(S, f)
    expect(st.sigmaMax).toBeGreaterThanOrEqual(normalStress(S, f, h / 2, b / 2))
    expect(st.sigmaAbs).toBe(Math.max(Math.abs(st.sigmaMax), Math.abs(st.sigmaMin)))
  })

  it('matches σ = M/S for a real W-shape about both axes', () => {
    const w: RectSection = {
      ...rect, id: 'W1', name: 'W310x38.7', material: 'steel', shape: 'W310x38.7',
    }
    const ws = stressSection(w)
    expect(ws.exact).toBe(true)
    expect(ws.geom.kind).toBe('wide-flange')
    const M = 50
    expect(normalStress(ws, at({ Mz: -M }), ws.cy, 0)).toBeCloseTo((M * 1e6) / (ws.Iz / ws.cy), 9)
    expect(normalStress(ws, at({ My: M }), 0, ws.cz)).toBeCloseTo((M * 1e6) / (ws.Iy / ws.cz), 9)
  })
})

describe('the outline agrees with the tabulated properties', () => {
  it('reproduces a rectangle exactly', () => {
    const p = cellProperties(sectionCells(S.geom, 48))
    expect(p.A).toBeCloseTo(b * h, 6)
    expect(p.Iz / Iz).toBeCloseTo(1, 4)
    expect(p.Iy / Iy).toBeCloseTo(1, 4)
  })

  it('lands within the fillet allowance on a W-shape — which is the evidence', () => {
    // The three-rectangle outline omits the web-to-flange fillets, which the
    // AISC table's A and Ix include. So these MUST disagree, by the fillet
    // contribution and nothing else. A few percent low is the section being
    // modelled right; a sign error or a factor of two would read as 100%+.
    const w: RectSection = { ...rect, id: 'W1', name: 'W310x38.7', material: 'steel', shape: 'W310x38.7' }
    const ws = stressSection(w)
    const p = cellProperties(sectionCells(ws.geom, 64))
    const dA = p.A / ws.A - 1, dIz = p.Iz / ws.Iz - 1
    expect(dA, `area residual ${(dA * 100).toFixed(2)}%`).toBeLessThan(0)      // low, as fillets predict
    expect(Math.abs(dA)).toBeLessThan(0.10)
    expect(Math.abs(dIz), `Iz residual ${(dIz * 100).toFixed(2)}%`).toBeLessThan(0.10)
  })

  it('reproduces a round section as the analytic circle', () => {
    const cells = sectionCells({ kind: 'round', D: 200 }, 64)
    const p = cellProperties(cells)
    expect(p.A / (Math.PI * 100 ** 2)).toBeCloseTo(1, 3)
    expect(p.Iz / ((Math.PI * 100 ** 4) / 4)).toBeCloseTo(1, 2)
    expect(p.Iz / p.Iy, 'a circle has no strong axis').toBeCloseTo(1, 6)
  })
})

describe('equilibrium — the stress field carries the forces the diagram plots', () => {
  it('recovers N, My and Mz from an arbitrary force state on a rectangle', () => {
    const f = at({ N: 320, Mz: -64, My: 17.5 })
    const r = sectionResultants(S, f, 64)
    expect(r.N).toBeCloseTo(f.N, 6)
    expect(r.Mz).toBeCloseTo(f.Mz, 4)
    expect(r.My).toBeCloseTo(f.My, 4)
  })

  it('recovers them for every station of a REAL solve', () => {
    // The closing of the loop: the arrays here are the ones `memberDiagram3d`
    // draws, and integrating the stress they produce returns them.
    const m = cant([
      { kind: 'member-udl', member: 'm', w: 14, cat: 'D' },
      { kind: 'node', node: 'b', Fz: -9, cat: 'W' },
      { kind: 'node', node: 'b', Fx: 60, cat: 'D' },
    ]).members[0]
    expect(m.xs.length).toBeGreaterThan(20)
    for (let i = 0; i < m.xs.length; i++) {
      const f = at({ N: m.N[i], My: m.My[i], Mz: m.Mz[i] })
      const r = sectionResultants(S, f, 40)
      expect(r.N, `N at x=${m.xs[i].toFixed(3)}`).toBeCloseTo(f.N, 6)
      expect(r.Mz, `Mz at x=${m.xs[i].toFixed(3)}`).toBeCloseTo(f.Mz, 4)
      expect(r.My, `My at x=${m.xs[i].toFixed(3)}`).toBeCloseTo(f.My, 4)
    }
  })

  it('closes to the fillet residual on a W-shape, not to zero', () => {
    // Stated as a bound rather than an equality, because pretending the
    // idealised outline reproduces the table exactly would be the tautology
    // this check exists to avoid.
    const w: RectSection = { ...rect, id: 'W1', name: 'W310x38.7', material: 'steel', shape: 'W310x38.7' }
    const ws = stressSection(w)
    const f = at({ N: 150, Mz: -40, My: 6 })
    const r = sectionResultants(ws, f, 64)
    for (const [got, want, name] of [[r.N, f.N, 'N'], [r.Mz, f.Mz, 'Mz'], [r.My, f.My, 'My']] as const) {
      const rel = Math.abs(got / want - 1)
      expect(rel, `${name} residual ${(rel * 100).toFixed(2)}%`).toBeLessThan(0.10)
    }
  })

  it('would catch a flipped moment sign', () => {
    // Guarding the guard: if `normalStress` used +Mz·y/Iz, the integration
    // would return −Mz, not Mz. The residual of a sign error is 200%, which is
    // why the 10% fillet bound above is not a licence for anything.
    const f = at({ Mz: -50 })
    const flipped: StressSection = { ...S }
    const r = sectionResultants(flipped, f, 48)
    expect(r.Mz).toBeCloseTo(-50, 4)
    expect(r.Mz).not.toBeCloseTo(+50, 1)
  })
})

describe('sections the library cannot describe', () => {
  it('falls back to the bounding box and SAYS SO', () => {
    // A single angle: the library lists it, with leg dimensions this module
    // has no fibre model for. Silently printing bounding-box stresses as the
    // section's own is the failure; the flag is the fix.
    const angle = shapeByName('L102x102x9.5')
    expect(angle, 'fixture assumes this shape is in the library').toBeTruthy()
    const sec: RectSection = { ...rect, id: 'L1', name: 'L', material: 'steel', shape: angle!.name }
    const ss = stressSection(sec)
    expect(ss.exact).toBe(false)
    expect(ss.geom.kind).toBe('rect')
    expect(ss.A).toBe(angle!.A)      // properties are still the shape's own
  })

  it('treats an unknown shape name as the rectangle it was given', () => {
    const sec: RectSection = { ...rect, id: 'X', material: 'steel', shape: 'NOT-A-SHAPE' }
    const ss = stressSection(sec)
    expect(ss.geom).toEqual({ kind: 'rect', b, h })
  })

  it('never divides by zero on a degenerate section', () => {
    const degenerate: StressSection = { ...S, A: 0, Iy: 0, Iz: 0, J: 0, Ct: 0 }
    const r = fibreStress(degenerate, at({ N: 10, Mz: 5, My: 5, Vy: 3, T: 2 }), S.fibres[0])
    expect(Number.isFinite(r.sigma)).toBe(true)
    expect(Number.isFinite(r.tau)).toBe(true)
    expect(Number.isFinite(r.vonMises)).toBe(true)
  })
})

describe('memberStress — the same arrays the diagram draws', () => {
  const m = cant([
    { kind: 'member-udl', member: 'm', w: 14, cat: 'D' },
    { kind: 'node', node: 'b', Fz: -9, cat: 'W' },
  ]).members[0]
  const ms = memberStress(m, S)

  it('keeps the diagram stations, one for one', () => {
    expect(ms.xs).toEqual(m.xs)
    expect(ms.sigmaMax).toHaveLength(m.xs.length)
    expect(ms.id).toBe(m.id)
  })

  it('peaks where the moment peaks, not somewhere of its own', () => {
    // The cantilever's largest moment is at the support, so the largest
    // |σ| must be at station 0. A contour whose peak wandered off the
    // diagram's peak would be reading different numbers.
    const iMax = ms.sigmaAbs.indexOf(Math.max(...ms.sigmaAbs))
    const iM = m.Mz.map(Math.abs).indexOf(Math.max(...m.Mz.map(Math.abs)))
    expect(iMax).toBe(iM)
    expect(iMax).toBe(0)
  })

  it('reports peaks that match the station-wise extremes', () => {
    expect(ms.peak.sigmaMax).toBeCloseTo(Math.max(...ms.sigmaMax), 12)
    expect(ms.peak.sigmaMin).toBeCloseTo(Math.min(...ms.sigmaMin), 12)
    expect(ms.peak.vonMisesMax).toBeCloseTo(Math.max(...ms.vonMisesMax), 12)
    expect(ms.peak.sigmaMax).toBeGreaterThan(0)
    expect(ms.peak.sigmaMin).toBeLessThan(0)
  })

  it('has von Mises bound below by |σ| and by √3·τ everywhere', () => {
    for (let i = 0; i < ms.xs.length; i++) {
      expect(ms.vonMisesMax[i]).toBeGreaterThanOrEqual(
        Math.max(Math.abs(ms.sigmaMax[i]), Math.abs(ms.sigmaMin[i])) - 1e-9)
      expect(ms.vonMisesMax[i]).toBeGreaterThanOrEqual(Math.sqrt(3) * ms.tauMax[i] - 1e-9)
    }
  })

  it('survives a member with no stations', () => {
    const empty = memberStress(
      { id: 'e', xs: [], N: [], Vy: [], Vz: [], T: [], My: [], Mz: [] }, S)
    expect(empty.xs).toEqual([])
    expect(empty.peak.sigmaMax).toBe(0)
  })
})
