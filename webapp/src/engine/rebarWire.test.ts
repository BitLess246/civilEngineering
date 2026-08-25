import { describe, it, expect } from 'vitest'
import {
  runPoints, runPolylines, filletCorner, tubeFromPolyline, hookTailLength, REBAR_ROLE_COLOR,
  selfClearance, HOOK_TURN_DEG,
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

describe('the hook: one curl at the corner, two straight tails', () => {
  const tie = {
    mark: 'T1', dia: 10, role: 'tie' as const, member: 'C1',
    path: [[0, 0, 0], [0.3, 0, 0], [0.3, 0, 0.3], [0, 0, 0.3]] as Vec3[],
    bendDia: [40, 40, 40, 40], closed: true,
    hookAllowance: stirrupHookAllowance(10), count: 1,
  }
  const [bar, ...rest] = runPolylines(tie)
  const sub = (p: Vec3, q: Vec3): Vec3 => [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
  const unit = (p: Vec3, q: Vec3): Vec3 => {
    const d = sub(p, q), l = Math.hypot(d[0], d[1], d[2])
    return [d[0] / l, d[1] / l, d[2] / l]
  }
  const turnOf = (u: Vec3, w: Vec3) =>
    (Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]))) * 180) / Math.PI

  it('is ONE bar — a tie is cut from stock and bent, never joined', () => {
    expect(rest).toHaveLength(0)
    expect(bar.length).toBeGreaterThan(8)
    // a closed run with no hooks is still just its own loop
    expect(runPolylines({ ...tie, hookAllowance: undefined })).toHaveLength(1)
    // an OPEN transverse bar — a cross tie — comes back as one bar too
    expect(runPolylines({ ...tie, closed: false })).toHaveLength(1)
  })

  it('steps aside far enough to lie TANGENT to itself, never through itself', () => {
    // Steel cannot pass through steel. Both ends finish at corner 0 and each
    // hook sweeps 135° back across the leg the other arrives on, so the bar
    // leans out of plane until its closest pass with itself is exactly its own
    // diameter — touching, not overlapping.
    const y0 = bar[0][1], y1 = bar[bar.length - 1][1]
    expect(Math.abs(y1 - y0)).toBeGreaterThanOrEqual(selfClearance(10) - 1e-12)
    expect(y0).toBeCloseTo(-y1, 9)                  // centred on the level it sits at
    const cum = [0]
    for (let k = 1; k < bar.length; k++)
      cum.push(cum[k - 1] + Math.hypot(...bar[k].map((c, a) => c - bar[k - 1][a])))
    const total = cum[cum.length - 1]
    let closest = Infinity
    for (let a = 0; a < bar.length; a++)
      for (let b = a + 1; b < bar.length; b++) {
        if ((cum[b] - cum[a]) / total < 1 / 3) continue
        closest = Math.min(closest, Math.hypot(...bar[b].map((c, k) => c - bar[a][k])))
      }
    expect(closest).toBeGreaterThanOrEqual(selfClearance(10) - 1e-9)
    expect(closest).toBeLessThan(selfClearance(10) * 1.001)   // and no further than it must
  })

  it('leans the whole way round rather than kinking at one place', () => {
    // The bar is bent at its corners and nowhere else, so the step aside can
    // only be a lean — a kink somewhere along a leg is a bend nobody made.
    const way = Math.sign(bar[bar.length - 1][1] - bar[0][1])
    for (let k = 1; k < bar.length; k++)
      expect(way * (bar[k][1] - bar[k - 1][1])).toBeGreaterThan(-1e-12)
  })

  it('turns 135° at each end and leaves max(6d_t, 75 mm) of straight tail', () => {
    const first = unit(bar[0], bar[1])
    const last = unit(bar[bar.length - 2], bar[bar.length - 1])
    // the leg each hook belongs to: the bar leaves corner 0 along +x and
    // comes back to it along −z
    expect(turnOf([1, 0, 0], first)).toBeCloseTo(HOOK_TURN_DEG, 1)
    expect(turnOf([0, 0, -1], last)).toBeCloseTo(HOOK_TURN_DEG, 1)
    const flat = (p: Vec3, q: Vec3) => Math.hypot(q[0] - p[0], q[2] - p[2])
    expect(flat(bar[0], bar[1])).toBeCloseTo(hookTailLength(10), 3)
    expect(flat(bar[bar.length - 2], bar[bar.length - 1])).toBeCloseTo(hookTailLength(10), 3)
  })

  it('both tails point INTO the core, never out through the cover', () => {
    const core = [0.15, 0.15]
    const closer = (p: Vec3, q: Vec3) =>
      Math.hypot(q[0] - core[0], q[2] - core[1]) < Math.hypot(p[0] - core[0], p[2] - core[1])
    expect(closer(bar[1], bar[0])).toBe(true)                       // start tail runs inboard
    expect(closer(bar[bar.length - 2], bar[bar.length - 1])).toBe(true)
  })

  it('still reaches every other corner of the loop', () => {
    for (const c of [[0.3, 0], [0.3, 0.3], [0, 0.3]]) {
      const near = Math.min(...bar.map((p) => Math.hypot(p[0] - c[0], p[2] - c[1])))
      // filleted, so the bar passes near the corner rather than through it
      expect(near).toBeLessThan(0.03)
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


describe('a cross tie is a single-legged stirrup', () => {
  const cross = {
    mark: 'C1-X1', dia: 12, role: 'tie' as const, member: 'C1',
    path: [[0, 0, 0], [0.4, 0, 0]] as Vec3[],
    bendDia: [], closed: false, wrapDia: 25,
    hookAllowance: stirrupHookAllowance(12), count: 1,
  }
  const R = (25 + 12) / 2000                       // it wraps the bars it grips
  const bars = runPolylines(cross)
  const [bar] = bars

  it('is ONE continuous bar, not a leg with two hooks bolted on', () => {
    expect(bars).toHaveLength(1)
    expect(bar.length).toBeGreaterThan(8)          // tail, arc, leg, arc, tail
    expect(runPolylines({ ...cross, hookAllowance: undefined })).toHaveLength(1)
  })

  it('runs TANGENT to both bars, not from centre to centre', () => {
    // The steel passes to one side of each bar and comes back along the other.
    const across = bar.map((q) => q[2])
    expect(Math.min(...across)).toBeCloseTo(-R, 6)
    expect(Math.max(...across)).toBeCloseTo(R, 6)
    // the straight leg runs between the two bars offset a full radius off the
    // line through their centres — it passes them, it does not end on them
    const has = (x: number, z: number) =>
      bar.some((q) => Math.abs(q[0] - x) < 1e-9 && Math.abs(q[2] - z) < 1e-9)
    expect(has(0, -R)).toBe(true)                  // leg, at the first bar
    expect(has(0.4, -R)).toBe(true)                // …and at the second
    expect(has(0, 0)).toBe(false)                  // never on a bar centre
    expect(has(0.4, 0)).toBe(false)
  })

  it('turns a full 180° AROUND each bar, at the bar itself', () => {
    // Turned about a point beside the bar the curl grips nothing and the bar
    // ends up on the end of a straight leg.
    for (const b of [cross.path[0], cross.path[1]]) {
      const round = bar.filter((q) => Math.abs(Math.hypot(q[0] - b[0], q[2] - b[2]) - R) < 1e-6)
      expect(round.length).toBeGreaterThan(6)      // an arc's worth of points
      // and it reaches a full radius PAST the bar, which only a 180° turn does
      const beyond = b[0] === 0 ? Math.min(...bar.map((q) => q[0])) : Math.max(...bar.map((q) => q[0]))
      expect(Math.abs(beyond - b[0])).toBeCloseTo(R, 6)
    }
  })

  it('both tails run back along the leg, on the same side', () => {
    const first = bar[0], second = bar[1]
    const last = bar[bar.length - 1], prev = bar[bar.length - 2]
    expect(first[2]).toBeCloseTo(last[2], 9)            // same side
    expect(Math.abs(first[2])).toBeCloseTo(R, 6)
    // each tail points back INBOARD, and is the code length
    expect(Math.sign(first[0] - second[0])).toBe(1)
    expect(Math.sign(last[0] - prev[0])).toBe(-1)
    for (const [a, b] of [[first, second], [last, prev]] as const) {
      expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeCloseTo(hookTailLength(12), 9)
    }
  })

  it('a bar too short to turn round twice is left straight', () => {
    // Two bars a hair apart cannot take a U at each end; a bar bent through
    // more than its own length is worse than a plain one.
    const tiny = { ...cross, path: [[0, 0, 0], [0.03, 0, 0]] as Vec3[] }
    expect(runPolylines(tiny)[0]).toHaveLength(2)
  })
})
