import { describe, it, expect } from 'vitest'
import {
  runPoints, runPolylines, filletCorner, tubeFromPolyline, hookTailLength, REBAR_ROLE_COLOR,
} from './rebarWire'
import {
  bendRadius, hookBendDiameter, stirrupBendDiameter, stirrupHookAllowance,
  type RebarRun, type Vec3,
} from './rebarModel'

const straight: RebarRun = {
  mark: 'X1', dia: 20, role: 'top', member: 'B1',
  path: [[0, 0, 0], [6, 0, 0]], bendDia: [], count: 1,
}
/** An L: 2 m along x, then 0.5 m down, bent to the standard hook diameter. */
const hooked: RebarRun = {
  mark: 'X2', dia: 20, role: 'top', member: 'B1',
  path: [[0, 0, 0], [2, 0, 0], [2, -0.5, 0]],
  bendDia: [hookBendDiameter(20)], count: 1,
}
const tie: RebarRun = {
  mark: 'T1', dia: 12, role: 'tie', member: 'C1',
  path: [[0, 0, 0], [0.2, 0, 0], [0.2, 0, 0.4], [0, 0, 0.4]],
  bendDia: Array(4).fill(stirrupBendDiameter(12)),
  closed: true, count: 1,
}

describe('runPoints', () => {
  it('leaves a straight bar as its two ends', () => {
    expect(runPoints(straight)).toEqual([[0, 0, 0], [6, 0, 0]])
  })

  it('rounds a bend to the radius the bar is actually made to', () => {
    // A mitred corner is a bar nobody can bend. The fillet leaves the straight
    // a tangent distance short of the corner and rejoins beyond it.
    const p = runPoints(hooked)
    const r = bendRadius(hookBendDiameter(20), 20) / 1000     // 70 mm
    expect(p.length).toBeGreaterThan(3)
    // nothing sits at the mitre itself
    expect(p.some((q) => Math.abs(q[0] - 2) < 1e-9 && Math.abs(q[1]) < 1e-9)).toBe(false)
    // the arc leaves the horizontal leg r short of the corner…
    const onLeg = p.filter((q) => Math.abs(q[1]) < 1e-9)
    expect(Math.max(...onLeg.map((q) => q[0]))).toBeCloseTo(2 - r, 6)
    // …and every arc point is exactly r from the bend centre
    for (const q of p.slice(1, -1)) {
      expect(Math.hypot(q[0] - (2 - r), q[1] - -r)).toBeCloseTo(r, 6)
    }
  })

  it('keeps the bar ends exactly where the run put them', () => {
    // Filleting must not move the bar. Shortening a leg to force a fillet in
    // would put steel somewhere the cage never said it was.
    const p = runPoints(hooked)
    expect(p[0]).toEqual([0, 0, 0])
    expect(p[p.length - 1]).toEqual([2, -0.5, 0])
  })

  it('closes a tie back on itself, with all four corners rounded', () => {
    const p = runPoints(tie)
    expect(Math.hypot(...p[0].map((v, k) => v - p[p.length - 1][k]))).toBeCloseTo(0, 9)
    for (const c of [[0, 0], [0.2, 0], [0.2, 0.4], [0, 0.4]]) {
      expect(p.some((q) => Math.abs(q[0] - c[0]) < 1e-9 && Math.abs(q[2] - c[1]) < 1e-9)).toBe(false)
    }
  })

  it('leaves a corner square when the legs are too short to fillet it', () => {
    // Better a sharp corner on screen than a bar drawn somewhere it is not.
    const tight: RebarRun = {
      mark: 'X3', dia: 32, role: 'top', member: 'B1',
      path: [[0, 0, 0], [0.02, 0, 0], [0.02, -0.02, 0]],
      bendDia: [hookBendDiameter(32)], count: 1,
    }
    const p = runPoints(tight)
    expect(p).toHaveLength(3)
    expect(p[1]).toEqual([0.02, 0, 0])
  })

  it('sweeps a 90° fillet through a quarter turn, no more', () => {
    const p = filletCorner([-1, 0, 0], [0, 0, 0], [0, -1, 0], 0.1, 8)
    expect(p).toHaveLength(9)
    for (const q of p) expect(Math.hypot(q[0] - -0.1, q[1] - -0.1)).toBeCloseTo(0.1, 9)
    expect(p[0][0]).toBeCloseTo(-0.1, 12)
    expect(p[0][1]).toBeCloseTo(0, 12)
    expect(p[p.length - 1][0]).toBeCloseTo(0, 9)
    expect(p[p.length - 1][1]).toBeCloseTo(-0.1, 9)
  })

  it('gives every role its own colour', () => {
    expect(new Set(Object.values(REBAR_ROLE_COLOR)).size).toBeGreaterThan(6)
    expect(REBAR_ROLE_COLOR.top).not.toBe(REBAR_ROLE_COLOR.bottom)
    expect(REBAR_ROLE_COLOR.stirrup).not.toBe(REBAR_ROLE_COLOR.vertical)
  })
})

describe('a tie is ONE bar, with a hook at each end', () => {
  const tie = {
    mark: 'T1', dia: 10, role: 'tie' as const, member: 'C1',
    path: [[0, 0, 0], [0.3, 0, 0], [0.3, 0, 0.3], [0, 0, 0.3]] as Vec3[],
    bendDia: [40, 40, 40, 40], closed: true,
    hookAllowance: stirrupHookAllowance(10), count: 1,
  }
  const [bar] = runPolylines(tie)

  it('comes back as a single polyline, not a loop plus two branches', () => {
    // Three polylines put three bars through the start corner — the loop and a
    // branch per hook — and the branches' bends curled back over the loop's.
    expect(runPolylines(tie)).toHaveLength(1)
    expect(runPolylines({ ...tie, hookAllowance: undefined })).toHaveLength(1)
    expect(runPolylines({ ...tie, closed: false })).toHaveLength(1)
  })

  it('runs right round the section and PAST the corner it started at', () => {
    // within a bend radius or so — the corners are filleted, so the bar rounds
    // them rather than passing through the point itself
    const near = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.07
    for (const corner of tie.path) {
      expect(bar.some((p) => near(p, corner))).toBe(true)
    }
    // it visits the start corner twice — once on the way out, once coming back
    expect(bar.filter((p) => near(p, tie.path[0])).length).toBeGreaterThan(1)
  })

  it('starts and finishes in a tail, both folded 135° off their own leg', () => {
    const unit = (p: Vec3, q: Vec3) => {
      const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
      const l = Math.hypot(d[0], d[1], d[2])
      return d.map((c) => c / l)
    }
    const turnOf = (u: number[], w: number[]) =>
      (Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]))) * 180) / Math.PI
    // leading tail into the first leg
    expect(turnOf(unit(bar[0], bar[1]), [1, 0, 0])).toBeCloseTo(135, 3)
    // last leg into the trailing tail
    const m = bar.length
    expect(turnOf([0, 0, -1], unit(bar[m - 2], bar[m - 1]))).toBeCloseTo(135, 3)
  })

  it('both tails point INTO the core, never out through the cover', () => {
    // The tie is in the y = 0 plane with its core at (0.15, 0, 0.15); a hook
    // folded the wrong way leaves the section entirely.
    const core = [0.15, 0, 0.15]
    const corner = tie.path[0]
    const at = Math.hypot(corner[0] - core[0], corner[2] - core[2])
    for (const tip of [bar[0], bar[bar.length - 1]]) {
      expect(Math.hypot(tip[0] - core[0], tip[2] - core[2])).toBeLessThan(at)
      expect(Math.abs(tip[1])).toBeLessThan(1e-9)          // and stay in the plane
    }
  })

  it('each tail is max(6d_t, 75 mm) from the corner it turns at', () => {
    const corner = tie.path[0]
    for (const tip of [bar[0], bar[bar.length - 1]]) {
      expect(Math.hypot(tip[0] - corner[0], tip[2] - corner[2]))
        .toBeCloseTo(hookTailLength(10), 9)
    }
  })
})

describe('a bar swept as a tube', () => {
  const straight: Vec3[] = [[0, 0, 0], [2, 0, 0]]

  it('sits exactly one radius off the centreline, all the way round', () => {
    const t = tubeFromPolyline(straight, 0.01, 8)
    for (let v = 0; v < 8; v++) {
      const o = v * 3
      // first ring: x = 0, and the point is 0.01 from the axis
      expect(t.positions[o]).toBeCloseTo(0, 9)
      expect(Math.hypot(t.positions[o + 1], t.positions[o + 2])).toBeCloseTo(0.01, 9)
    }
  })

  it('is a closed surface: every ring joined, both ends capped', () => {
    const radial = 8
    const t = tubeFromPolyline(straight, 0.01, radial)
    // 2 rings + 2 cap centres
    expect(t.positions.length / 3).toBe(2 * radial + 2)
    // (rings−1) quads + 2 cap fans
    expect(t.indices.length).toBe(1 * radial * 6 + radial * 6)
    expect(Math.max(...t.indices)).toBeLessThan(t.positions.length / 3)
  })

  it('carries a unit normal at every vertex, and no NaN anywhere', () => {
    const bent: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]]
    const t = tubeFromPolyline(bent, 0.012, 8)
    expect([...t.positions].every(Number.isFinite)).toBe(true)
    const rings = t.positions.length / 3 - 2
    for (let v = 0; v < rings; v++) {
      const o = v * 3
      expect(Math.hypot(t.normals[o], t.normals[o + 1], t.normals[o + 2])).toBeCloseTo(1, 6)
    }
  })

  it('does not twist about its own axis through a bend', () => {
    // Frenet frames flip through 180° at an inflection and are undefined on a
    // straight, which is most of a bar; parallel transport is why the ring
    // stays put. A twist shows up as the frame rotating relative to the bend.
    const s: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0]]
    const t = tubeFromPolyline(s, 0.01, 4)
    // the tie is planar in z, so vertex 0 of every ring must stay off-plane by
    // the same amount — a twist would swing it into the plane and back
    const z0 = t.positions[2]
    for (let i = 0; i < s.length; i++) {
      expect(Math.abs(t.positions[i * 4 * 3 + 2])).toBeCloseTo(Math.abs(z0), 6)
    }
  })

  it('ignores repeated points and refuses degenerate input', () => {
    const dup: Vec3[] = [[0, 0, 0], [0, 0, 0], [1, 0, 0]]
    expect(tubeFromPolyline(dup, 0.01, 6).positions.length / 3).toBe(2 * 6 + 2)
    expect(tubeFromPolyline([[0, 0, 0]], 0.01, 6).indices.length).toBe(0)
    expect(tubeFromPolyline(straight, 0, 6).indices.length).toBe(0)
    expect(tubeFromPolyline(straight, 0.01, 2).indices.length).toBe(0)
  })
})
