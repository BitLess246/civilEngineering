/**
 * The deformed shape, checked two independent ways:
 *
 *  · CLOSED FORM — a propped cantilever under UDL and a cantilever under a tip
 *    load, in both bending planes, against the textbook elastic curves.
 *  · ENGINE vs ENGINE — a portal drawn from ONE element per member against the
 *    same portal solved with every member cut into twelve: the fine model's
 *    interior NODES are displacements the solver computed, so the coarse
 *    model's drawn curve must pass through them. That catches every sign and
 *    axis convention at once (both planes, the 90°-rolled columns, releases,
 *    shear deformation), which is where a plausible-looking curve goes wrong.
 */
import { describe, it, expect } from 'vitest'
import {
  memberDisplacement, maxDisplacement, autoScale, displacementValue, isSignedDisplacement,
  coonsDisplacement, straightEdge, edgeFromMember, type DeformMember, type MemberDisplacement,
} from './deformedShape'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support, type F3Load, type F3Result, type V3 } from './frame3d'

const b = 300, h = 500, E = 25000, G = E / 2.4
const props = { E, G, A: b * h, Iz: (b * h ** 3) / 12, Iy: (h * b ** 3) / 12, J: rectJ(b, h) }
const EIz = E * props.Iz * 1e-9, EIy = E * props.Iy * 1e-9     // kN·m²

/** The DeformMember for solved member `id`, from the solver's own inputs. */
function deform(r: F3Result, nodes: F3Node[], mem: F3Member, rotDeg = 0): DeformMember {
  const k = (id: string) => nodes.findIndex((n) => n.id === id)
  const ki = k(mem.i), kj = k(mem.j)
  const f = r.members.find((m) => m.id === mem.id)!
  return {
    id: mem.id, rotDeg,
    a: [nodes[ki].x, nodes[ki].y, nodes[ki].z], b: [nodes[kj].x, nodes[kj].y, nodes[kj].z],
    di: r.d.slice(6 * ki, 6 * ki + 6), dj: r.d.slice(6 * kj, 6 * kj + 6),
    forces: f, E: mem.E, Iz: mem.Iz, Iy: mem.Iy, G: mem.G, Asy: mem.Asy, Asz: mem.Asz,
  }
}

describe('closed form', () => {
  it('draws the in-span sag the end-cubic misses — propped cantilever under UDL', () => {
    // Fixed at x = 0, pinned at L: v(x) = −w·x²(3L² − 5Lx + 2x²)/(48EI).
    const L = 6, w = 14
    const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }]
    const mem: F3Member = { id: 'm', i: 'a', j: 'b', ...props }
    const r = solveFrame3D(nodes, [mem], [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'pin' }],
      [{ kind: 'member-udl', member: 'm', w, cat: 'D' }])!
    const f = memberDisplacement(deform(r, nodes, mem))!
    let peak = 0
    f.base.forEach((p, k) => {
      const x = p[0]
      const exact = -(w * x * x * (3 * L * L - 5 * L * x + 2 * x * x)) / (48 * EIz)
      expect(f.disp[k][1]).toBeCloseTo(exact, 9)
      peak = Math.min(peak, f.disp[k][1])
    })
    // Both nodes are fixed, so a curve from end values alone would draw zero.
    expect(peak, 'the sag is real and in span').toBeLessThan(-0.001)
    expect(Math.abs(peak)).toBeCloseTo((w * L ** 4) / (185 * EIz), 4)
  })

  it('matches a cantilever under a tip load in the y′ plane', () => {
    const L = 3, P = 20
    const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }]
    const mem: F3Member = { id: 'm', i: 'a', j: 'b', ...props }
    const r = solveFrame3D(nodes, [mem], [{ node: 'a', fixity: 'fixed' }], [{ kind: 'node', node: 'b', Fy: -P, cat: 'D' }])!
    const f = memberDisplacement(deform(r, nodes, mem))!
    f.base.forEach((p, k) => {
      const x = p[0]
      expect(f.disp[k][1]).toBeCloseTo(-(P * x * x * (3 * L - x)) / (6 * EIz), 9)
    })
    expect(f.disp[f.disp.length - 1][1]).toBeCloseTo(-(P * L ** 3) / (3 * EIz), 9)
  })

  it('and in the z′ plane, with the sign My carries', () => {
    const L = 3, P = 15
    const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }]
    const mem: F3Member = { id: 'm', i: 'a', j: 'b', ...props }
    const r = solveFrame3D(nodes, [mem], [{ node: 'a', fixity: 'fixed' }], [{ kind: 'node', node: 'b', Fz: -P, cat: 'D' }])!
    const f = memberDisplacement(deform(r, nodes, mem))!
    f.base.forEach((p, k) => {
      const x = p[0]
      expect(f.disp[k][2]).toBeCloseTo(-(P * x * x * (3 * L - x)) / (6 * EIy), 9)
      expect(f.disp[k][1]).toBeCloseTo(0, 12)
    })
  })
})

describe('Timoshenko closed form — shear deflection included, in both planes', () => {
  // Tip load −P on a cantilever with shear area As: bending PLUS shear,
  //   v(x) = −P·x²(3L − x)/(6EI) − P·x/(G·As).
  // NOTE what this does NOT pin: under a tip load V is constant, so the shear
  // strain adds a term LINEAR in x, which the chord correction to the solver's
  // end displacements absorbs whatever its sign. A sabotage flipping it passed
  // here. The SIGN is pinned below by the engine-vs-engine runs under UDL,
  // where V varies along the member — one per bending plane.
  const L = 3, P = 20, As = (5 / 6) * b * h
  const GA = G * As * 1e-3
  for (const [axis, EI, load] of [['y', EIz, { Fy: -P }], ['z', EIy, { Fz: -P }]] as const) {
    it(`matches v(x) with shear along ${axis}′`, () => {
      const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }]
      const mem: F3Member = { id: 'm', i: 'a', j: 'b', ...props, Asy: As, Asz: As }
      const r = solveFrame3D(nodes, [mem], [{ node: 'a', fixity: 'fixed' }], [{ kind: 'node', node: 'b', ...load, cat: 'D' }])!
      const f = memberDisplacement(deform(r, nodes, mem))!
      const c = axis === 'y' ? 1 : 2
      f.base.forEach((p, k) => {
        const x = p[0]
        expect(f.disp[k][c]).toBeCloseTo(-(P * x * x * (3 * L - x)) / (6 * EI) - (P * x) / GA, 9)
      })
      expect(Math.abs(P * L / GA), 'the shear part must be visible at 1e-9').toBeGreaterThan(1e-6)
    })
  }
})

// ── Engine vs engine ─────────────────────────────────────────────────────────

/** A one-bay portal (3 m columns, 6 m beam) with gravity, lateral and
 *  out-of-plane load. `cut` > 1 splits every member into that many elements. */
function portal(cut: number, extra: Partial<F3Member> = {}, beamRelJ?: F3Member['relJ'], beamRot = 0) {
  const nodes: F3Node[] = [
    { id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 0, y: 3, z: 0 },
    { id: 'C', x: 6, y: 3, z: 0 }, { id: 'D', x: 6, y: 0, z: 0 },
  ]
  const lines: [string, string, string, number][] = [['c1', 'A', 'B', 90], ['bm', 'B', 'C', beamRot], ['c2', 'D', 'C', 90]]
  const mem: F3Member[] = [], loads: F3Load[] = [
    { kind: 'node', node: 'B', Fx: 30, Fz: -12, cat: 'E' }, { kind: 'node', node: 'C', Fz: 8, cat: 'E' },
  ]
  const at = (id: string) => nodes.find((n) => n.id === id)!
  for (const [id, i, j, rot] of lines) {
    let prev = i
    for (let s = 1; s <= cut; s++) {
      let next = j
      if (s < cut) {
        next = `${id}_${s}`
        const p = at(i), q = at(j), t = s / cut
        nodes.push({ id: next, x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t })
      }
      const mid = cut === 1 ? id : `${id}#${s}`
      mem.push({ id: mid, i: prev, j: next, ...props, ...extra, rot, ...(id === 'bm' && s === cut && beamRelJ ? { relJ: beamRelJ } : {}) })
      if (id === 'bm') loads.push({ kind: 'member-udl', member: mid, w: 25, cat: 'D' })
      prev = next
    }
  }
  const sup: F3Support[] = [{ node: 'A', fixity: 'fixed' }, { node: 'D', fixity: 'fixed' }]
  const r = solveFrame3D(nodes, mem, sup, loads)
  expect(r, 'the portal must solve').toBeTruthy()
  return { nodes, mem, r: r!, lines }
}

/** Compare the coarse model's drawn curves with the fine model's nodes. */
function compare(extra: Partial<F3Member> = {}, beamRelJ?: F3Member['relJ'], beamRot = 0) {
  const coarse = portal(1, extra, beamRelJ, beamRot), fine = portal(12, extra, beamRelJ, beamRot)
  let worst = 0, scale = 0
  for (const [id, , , rot] of coarse.lines) {
    const mem = coarse.mem.find((m) => m.id === id)!
    const f = memberDisplacement(deform(coarse.r, coarse.nodes, mem, rot))!
    const n = f.base.length
    for (let s = 1; s < 12; s++) {
      const node = fine.nodes.find((q) => q.id === `${id}_${s}`)!
      const k = fine.nodes.indexOf(node)
      const truth = fine.r.d.slice(6 * k, 6 * k + 3)
      // stations are L/24 apart; sub-node s sits on station 2s
      const j = Math.round((s / 12) * (n - 1))
      const drawn = f.disp[j]
      expect(Math.hypot(f.base[j][0] - node.x, f.base[j][1] - node.y, f.base[j][2] - node.z)).toBeLessThan(1e-9)
      worst = Math.max(worst, Math.hypot(drawn[0] - truth[0], drawn[1] - truth[1], drawn[2] - truth[2]))
      scale = Math.max(scale, Math.hypot(...truth))
    }
  }
  return { worst, scale }
}

describe('engine vs engine — one element per member against twelve', () => {
  it('passes through the solver\'s own interior displacements, both planes, rolled columns', () => {
    const { worst, scale } = compare()
    expect(scale, 'fixture must actually move').toBeGreaterThan(1e-4)
    expect(worst / scale).toBeLessThan(1e-6)
  })

  it('stays exact with Timoshenko shear deformation on', () => {
    const { worst, scale } = compare({ Asy: (5 / 6) * b * h, Asz: (5 / 6) * b * h })
    expect(worst / scale).toBeLessThan(1e-6)
  })

  it('pins the z′-plane shear sign — gravity on a beam rolled 90°', () => {
    // Rolled 90°, the beam's local z′ is vertical: the UDL bends it in x′–z′
    // and Vz VARIES along it, so the shear strain's sign is visible here.
    const { worst, scale } = compare({ Asy: (5 / 6) * b * h, Asz: (5 / 6) * b * h }, undefined, 90)
    expect(scale).toBeGreaterThan(1e-4)
    expect(worst / scale).toBeLessThan(1e-6)
  })

  it('draws a released (pinned) end without special-casing it', () => {
    const { worst, scale } = compare({}, [false, false, false, false, false, true])
    expect(worst / scale).toBeLessThan(1e-6)
  })

  it('has end slopes equal to the solver\'s end rotations — the curve is the elastic one', () => {
    // Imposing only end DISPLACEMENTS leaves the rotations free; for a rigid
    // joint they must come back out equal to the solver's θ. Checked on the
    // beam: slope of v at x = 0 against θz at node B, by inverting the first
    // Hermite step, which is exact.
    const c = portal(1)
    const mem = c.mem.find((m) => m.id === 'bm')!
    const dm = deform(c.r, c.nodes, mem)
    const f = memberDisplacement(dm)!
    const x1 = f.base[1][0] - f.base[0][0]
    const p0 = dm.forces.Mz[0] / EIz, p1 = dm.forces.Mz[1] / EIz
    const d0 = dm.forces.Vy[0] / EIz, d1 = dm.forces.Vy[1] / EIz
    // invert the first Hermite step for θ₀
    const slope = (f.disp[1][1] - f.disp[0][1]) / x1 - x1 * (7 * p0 + 3 * p1) / 20 - x1 * x1 * (d0 / 20 - d1 / 30)
    expect(slope).toBeCloseTo(dm.di[5], 7)
  })
})

describe('offsets, magnitude, scale', () => {
  it('starts the flexible length at the offset end and moves it with the arm', () => {
    const di = [0.001, 0, 0, 0, 0, 0.01], dj = [0, 0, 0, 0, 0, 0]
    const f = memberDisplacement({
      id: 'o', a: [0, 0, 0], b: [4, 0, 0], rotDeg: 0, di, dj, E, Iz: props.Iz, Iy: props.Iy,
      forces: { xs: [0, 3.5], Mz: [0, 0], My: [0, 0], Vy: [0, 0], Vz: [0, 0] }, offI: [0.5, 0, 0],
    })!
    expect(f.base[0]).toEqual([0.5, 0, 0])
    // θz × off = 0.01 k × 0.5 i = 0.005 j, on top of the node's own 1 mm.
    expect(f.disp[0][0]).toBeCloseTo(0.001, 12)
    expect(f.disp[0][1]).toBeCloseTo(0.005, 12)
  })

  it('reads total, and each signed component', () => {
    const d: V3 = [0.003, -0.004, 0]
    expect(displacementValue(d, 'total')).toBeCloseTo(0.005, 12)
    expect(displacementValue(d, 'uy')).toBe(-0.004)
    expect(isSignedDisplacement('total')).toBe(false)
    expect(isSignedDisplacement('ux')).toBe(true)
  })

  it('finds the peak and scales it to a fraction of the model', () => {
    const fields: MemberDisplacement[] = [
      { id: 'p', base: [[0, 0, 0]], disp: [[0, -0.002, 0]] },
      { id: 'q', base: [[0, 0, 0]], disp: [[0.006, 0, 0.008]] },
    ]
    expect(maxDisplacement(fields)).toEqual({ value: 0.01, id: 'q' })
    expect(autoScale(0.01, 20, 0.06)).toBeCloseTo(120, 9)      // 1.2 m drawn on a 20 m model
    expect(autoScale(0, 20)).toBe(0)
  })
})

describe('slabs follow their edge beams (Coons patch)', () => {
  const sag = (amp: number) => (t: number): V3 => [0, -amp * Math.sin(Math.PI * t), 0]
  it('reproduces every edge exactly on the boundary', () => {
    const e0 = sag(0.01), e2 = sag(0.02), e1 = straightEdge([0, 0, 0], [0, 0, 0]), e3 = straightEdge([0, 0, 0], [0, 0, 0])
    for (const s of [0, 0.25, 0.5, 0.9, 1]) {
      expect(coonsDisplacement(e0, e1, e2, e3, s, 0)[1]).toBeCloseTo(e0(s)[1], 12)
      expect(coonsDisplacement(e0, e1, e2, e3, s, 1)[1]).toBeCloseTo(e2(s)[1], 12)
    }
    // Halfway between a 10 mm and a 20 mm sagging edge, at midspan: 15 mm.
    expect(coonsDisplacement(e0, e1, e2, e3, 0.5, 0.5)[1]).toBeCloseTo(-0.015, 12)
  })

  it('reduces to bilinear when every edge is straight', () => {
    const c: V3[] = [[0, 0, 0], [0, -0.01, 0], [0, -0.03, 0], [0, -0.02, 0]]
    const S = coonsDisplacement(straightEdge(c[0], c[1]), straightEdge(c[1], c[2]), straightEdge(c[3], c[2]), straightEdge(c[0], c[3]), 0.3, 0.6)
    const bil = 0.7 * 0.4 * c[0][1] + 0.3 * 0.4 * c[1][1] + 0.7 * 0.6 * c[3][1] + 0.3 * 0.6 * c[2][1]
    expect(S[1]).toBeCloseTo(bil, 12)
  })

  it('samples a member edge in either direction', () => {
    const f: MemberDisplacement = { id: 'e', base: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], disp: [[0, 0, 0], [0, -0.01, 0], [0, -0.004, 0]] }
    expect(edgeFromMember(f, false)(0.5)[1]).toBeCloseTo(-0.01, 12)
    expect(edgeFromMember(f, true)(0)[1]).toBeCloseTo(-0.004, 12)
    expect(edgeFromMember(f, false)(0.75)[1]).toBeCloseTo(-0.007, 12)
  })
})
