import { describe, it, expect } from 'vitest'
import { splitMembers, splitLoads, splitAxialModes, stitchResult, stitchMembers, stitchLoads, stitchAnalysis, recoverLineLoad, partId } from './memberSplit'
import { solveFrame3D, appliedResultant, type F3Node, type F3Member, type F3Load, type F3Support, type F3MemberResult } from './frame3d'
import { runModelAnalysis } from './modelAnalysis'
import { generateGridModel } from './modelBuilder'
import type { RectSection } from './model'

// ─────────────────────────────────────────────────────────────────────────
// THE CORRECTNESS PROOF FOR EDGE ATTACHMENT, AND IT NEEDS NO SHELLS.
//
// Splitting a member into collinear parts must change NOTHING: same end
// forces, same diagram, same maxima. If that holds on a beam under every load
// kind the bridge emits, it holds when the cut points happen to be mesh nodes.
// ─────────────────────────────────────────────────────────────────────────
const E = 24870, G = E / 2.4
const SEC = { E, G, A: 150000, Iy: 1.125e9, Iz: 3.125e9, J: 2.8e9 }

/** A 9 m beam from `a` to `b`, and the same beam cut at 2, 5 and 7 m.
 *  The reference solve gets ONLY its two end nodes: an interior node attached
 *  to no member is six free DOFs with zero stiffness, i.e. a singular K. */
const ends: F3Node[] = [
  { id: 'a', x: 0, y: 0, z: 0 },
  { id: 'b', x: 9, y: 0, z: 0 },
]
const nodes: F3Node[] = [
  ends[0],
  { id: 'p2', x: 2, y: 0, z: 0 },
  { id: 'p5', x: 5, y: 0, z: 0 },
  { id: 'p7', x: 7, y: 0, z: 0 },
  ends[1],
]
const whole: F3Member[] = [{ id: 'B1', i: 'a', j: 'b', ...SEC }]
const supports: F3Support[] = [
  { node: 'a', fixity: 'fixed' },
  { node: 'b', fixity: 'fixed' },
]
const cuts = new Map([['B1', ['p2', 'p5', 'p7']]])

const solveWhole = (loads: F3Load[]) => solveFrame3D(ends, whole, supports, loads)
const solve = (members: F3Member[], loads: F3Load[]) =>
  solveFrame3D(nodes, members, supports, loads)

describe('splitMembers / stitchResult — a split member behaves as one member', () => {
  const cases: { name: string; loads: F3Load[] }[] = [
    { name: 'UDL', loads: [{ kind: 'member-udl', member: 'B1', w: 12, cat: 'D' }] },
    { name: 'point load inside a part', loads: [{ kind: 'member-point', member: 'B1', a: 3.5, P: 40, cat: 'D' }] },
    { name: 'point load exactly on a cut', loads: [{ kind: 'member-point', member: 'B1', a: 5, P: 40, cat: 'D' }] },
    { name: 'VDL spanning several parts', loads: [{ kind: 'member-vdl', member: 'B1', x1: 1, x2: 8, w1: 4, w2: 16, cat: 'D' }] },
    { name: 'VDL inside one part', loads: [{ kind: 'member-vdl', member: 'B1', x1: 5.5, x2: 6.5, w1: 10, w2: 10, cat: 'D' }] },
    { name: 'VDL over the whole span', loads: [{ kind: 'member-vdl', member: 'B1', x1: 0, x2: 9, w1: 6, w2: 6, cat: 'D' }] },
    { name: 'thermal', loads: [{ kind: 'member-thermal', member: 'B1', PT: 500, cat: 'D' }] },
    {
      name: 'everything at once',
      loads: [
        { kind: 'member-udl', member: 'B1', w: 8, cat: 'D' },
        { kind: 'member-point', member: 'B1', a: 6.25, P: 30, cat: 'L' },
        { kind: 'member-vdl', member: 'B1', x1: 0.5, x2: 8.5, w1: 2, w2: 9, cat: 'L' },
      ],
    },
  ]

  for (const c of cases) {
    it(`reproduces the unsplit solve — ${c.name}`, () => {
      const ref = solveWhole(c.loads)!
      const { members, map } = splitMembers(whole, nodes, cuts)
      expect(members).toHaveLength(4)
      expect(map).toEqual([{ parent: 'B1', parts: ['B1#0', 'B1#1', 'B1#2', 'B1#3'], lengths: [2, 3, 2, 2] }])

      const got = stitchResult(solve(members, splitLoads(c.loads, map))!, map)
      expect(got.members).toHaveLength(1)
      const [a, b] = [ref.members[0], got.members[0]]
      expect(b.id).toBe('B1')
      expect(b.L).toBeCloseTo(9, 12)
      // the 12 local end forces — the numbers every downstream design check reads
      for (let k = 0; k < 12; k++) expect(b.f[k]).toBeCloseTo(a.f[k], 6)
      expect(b.Mmax).toBeCloseTo(a.Mmax, 6)
      expect(b.Vmax).toBeCloseTo(a.Vmax, 6)
      expect(b.Nmax).toBeCloseTo(a.Nmax, 6)
      // and the envelope the solve reports
      expect(got.Mmax).toBeCloseTo(ref.Mmax, 6)
      expect(got.Vmax).toBeCloseTo(ref.Vmax, 6)
    })
  }

  it('the stitched diagram matches the fixed–fixed closed form, end to end', () => {
    // Against THEORY, not against the other discretisation: the two put their
    // sample stations in different places, so comparing them point by point
    // measures the sampling, not the stitch. w = 12 kN/m over L = 9 m gives
    // wL²/12 = 81 kN·m at the ends and wL²/24 = 40.5 at midspan, and the
    // stitched diagram must run from one to the other through the cuts.
    const w = 12, L = 9
    const loads: F3Load[] = [{ kind: 'member-udl', member: 'B1', w, cat: 'D' }]
    const { members, map } = splitMembers(whole, nodes, cuts)
    const got = stitchResult(solve(members, splitLoads(loads, map))!, map).members[0]
    expect(got.xs[0]).toBeCloseTo(0, 9)
    expect(got.xs[got.xs.length - 1]).toBeCloseTo(L, 9)
    expect(Math.abs(got.Mz[0])).toBeCloseTo((w * L * L) / 12, 4)
    expect(Math.abs(got.Mz[got.Mz.length - 1])).toBeCloseTo((w * L * L) / 12, 4)
    // every station, including the ones inside each part, sits on the parabola
    const exact = (x: number) => -(w * L * L) / 12 + (w * L * x) / 2 - (w * x * x) / 2
    const sign = Math.sign(got.Mz[0]) === Math.sign(exact(0)) ? 1 : -1
    for (let k = 0; k < got.xs.length; k++)
      expect(sign * got.Mz[k]).toBeCloseTo(exact(got.xs[k]), 4)
  })

  it('draws every cut continuous, and keeps a real point load’s step', () => {
    // The step a member-point load makes belongs to the part it sits on (on a
    // cut it lands at the END of the earlier part), so it survives stitching.
    // A cut itself carries nothing here, and draws as nothing: one station per
    // junction, no jump.
    const loads: F3Load[] = [{ kind: 'member-point', member: 'B1', a: 5, P: 40, cat: 'D' }]
    const { members, map } = splitMembers(whole, nodes, cuts)
    const got = stitchResult(solve(members, splitLoads(loads, map))!, map).members[0]
    expect(got.xs).toEqual([...got.xs].sort((p, q) => p - q))
    for (const x of [2, 7]) expect(got.xs.filter((v) => Math.abs(v - x) < 1e-9)).toHaveLength(1)
    const at = (x: number) => got.Vy[got.xs.findIndex((v) => Math.abs(v - x) < 1e-12)]
    expect(Math.abs(at(5) - at(5 - 1e-6))).toBeCloseTo(40, 6)
  })

  it('the reactions are the same, not merely the member forces', () => {
    // Statics at the supports is the independent check: it does not go through
    // the stitching at all, so it cannot be fooled by a stitch that reassembles
    // a wrong answer consistently.
    const loads: F3Load[] = [{ kind: 'member-udl', member: 'B1', w: 12, cat: 'D' }]
    const ref = solveWhole(loads)!
    const { members, map } = splitMembers(whole, nodes, cuts)
    const got = solve(members, splitLoads(loads, map))!
    const byNode = (r: typeof ref) => new Map(r.reactions.map((x) => [x.node, x]))
    const A = byNode(ref), B = byNode(got)
    for (const id of ['a', 'b']) {
      for (let c = 0; c < 3; c++) {
        expect(B.get(id)!.F[c]).toBeCloseTo(A.get(id)!.F[c], 6)
        expect(B.get(id)!.M[c]).toBeCloseTo(A.get(id)!.M[c], 6)
      }
    }
    // ΣR = ΣF: a 12 kN/m UDL over 9 m is 108 kN
    const sumFy = [...B.values()].reduce((t, x) => t + x.F[1], 0)
    expect(sumFy).toBeCloseTo(108, 6)
  })
})

describe('splitMembers — releases, offsets and pass-through', () => {
  it('a member nobody cuts is returned untouched, and the map is empty', () => {
    const { members, map } = splitMembers(whole, nodes, new Map())
    expect(members).toBe(whole)         // same array, not a copy
    expect(map).toEqual([])
    // and the stitch/split helpers are then no-ops
    const loads: F3Load[] = [{ kind: 'member-udl', member: 'B1', w: 5, cat: 'D' }]
    expect(splitLoads(loads, map)).toBe(loads)
  })

  it('puts releases on the OUTER ends only', () => {
    // An interior release would hinge the beam at every mesh node — a
    // continuous beam silently turned into a row of simply-supported ones.
    const rel: [boolean, boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false, true]
    const { members } = splitMembers([{ ...whole[0], relI: rel, relJ: rel }], nodes, cuts)
    expect(members[0].relI).toEqual(rel)
    expect(members[0].relJ).toBeUndefined()
    expect(members[1].relI).toBeUndefined()
    expect(members[1].relJ).toBeUndefined()
    expect(members[3].relI).toBeUndefined()
    expect(members[3].relJ).toEqual(rel)
  })

  it('a rigid end zone stays on the outer ends; an axis drop goes on every end', () => {
    // The two kinds of offset are not interchangeable. A rigid end zone is a
    // property of the JOINT, so only the outer ends have one. A beamTopOfSteel
    // drop translates the whole member's axis below the node line, so every
    // interior end needs the same arm or the chain would zig-zag.
    const off: [number, number, number] = [0.25, 0, 0]
    const drop: [number, number, number] = [0, -0.25, 0]
    const { members } = splitMembers([{ ...whole[0], offI: off, offJ: off }], nodes, cuts,
      { interiorOffset: () => drop })
    expect(members[0].offI).toEqual(off)
    expect(members[0].offJ).toEqual(drop)
    expect(members[1].offI).toEqual(drop)
    expect(members[1].offJ).toEqual(drop)
    expect(members[3].offI).toEqual(drop)
    expect(members[3].offJ).toEqual(off)
    // with no interior offset supplied, interior ends carry none
    const plain = splitMembers([{ ...whole[0], offI: off, offJ: off }], nodes, cuts).members
    expect(plain[1].offI).toBeUndefined()
  })

  it('refuses to cut where a part would have zero length', () => {
    // A zero-length element is a singular stiffness. Leaving the member whole
    // is wrong-but-solvable; cutting it is not solvable at all.
    const dup: F3Node[] = [...nodes, { id: 'dup', x: 0, y: 0, z: 0 }]
    const { members, map } = splitMembers(whole, dup, new Map([['B1', ['dup', 'p5']]]))
    expect(members).toHaveLength(1)
    expect(members[0].id).toBe('B1')
    expect(map).toEqual([])
  })

  it('leaves a member whose cut node is missing whole', () => {
    const { members, map } = splitMembers(whole, nodes, new Map([['B1', ['ghost']]]))
    expect(members[0].id).toBe('B1')
    expect(map).toEqual([])
  })

  it('names parts distinctly from anything the model can produce', () => {
    const { members } = splitMembers(whole, nodes, cuts)
    expect(members.map((m) => m.id)).toEqual([0, 1, 2, 3].map((k) => partId('B1', k)))
  })
})

describe('splitLoads — each kind carries its own rule', () => {
  const { map } = splitMembers(whole, nodes, cuts)

  it('a UDL keeps its intensity on every part', () => {
    const out = splitLoads([{ kind: 'member-udl', member: 'B1', w: 12, cat: 'D' }], map)
    expect(out).toHaveLength(4)
    for (const l of out) expect(l.kind === 'member-udl' && l.w).toBe(12)
  })

  it('a VDL is clipped and interpolated, conserving its total', () => {
    const src = { kind: 'member-vdl' as const, member: 'B1', x1: 1, x2: 8, w1: 4, w2: 16, cat: 'D' as const }
    const out = splitLoads([src], map)
    const total = (l: { x1: number; x2: number; w1: number; w2: number }) =>
      ((l.w1 + l.w2) / 2) * (l.x2 - l.x1)
    const sum = out.reduce((s, l) => s + (l.kind === 'member-vdl' ? total(l) : 0), 0)
    expect(sum).toBeCloseTo(total(src), 9)             // 7 m × mean 10 kN/m = 70 kN
    expect(sum).toBeCloseTo(70, 9)
    // and no part is given a station outside its own length
    const st = [0, 2, 5, 7, 9]
    out.forEach((l) => {
      if (l.kind !== 'member-vdl') return
      const k = map[0].parts.indexOf(l.member)
      expect(l.x1).toBeGreaterThanOrEqual(-1e-12)
      expect(l.x2).toBeLessThanOrEqual(st[k + 1] - st[k] + 1e-12)
    })
  })

  it('a point load on a junction is placed once, on the earlier part', () => {
    const out = splitLoads([{ kind: 'member-point', member: 'B1', a: 5, P: 40, cat: 'D' }], map)
    expect(out).toHaveLength(1)
    expect(out[0].kind === 'member-point' && out[0].member).toBe('B1#1')
    expect(out[0].kind === 'member-point' && out[0].a).toBeCloseTo(3, 12)   // end of part 1
  })

  it('a thermal prestress goes on every part', () => {
    const out = splitLoads([{ kind: 'member-thermal', member: 'B1', PT: 500, cat: 'D' }], map)
    expect(out).toHaveLength(4)
    for (const l of out) expect(l.kind === 'member-thermal' && l.PT).toBe(500)
  })

  it('node loads and loads on unsplit members pass through', () => {
    const out = splitLoads([
      { kind: 'node', node: 'p5', Fy: -10, cat: 'D' },
      { kind: 'member-udl', member: 'OTHER', w: 3, cat: 'D' },
    ], map)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ kind: 'node', node: 'p5', Fy: -10, cat: 'D' })
    expect(out[1]).toEqual({ kind: 'member-udl', member: 'OTHER', w: 3, cat: 'D' })
  })
})

describe('splitAxialModes', () => {
  it('carries a tension-only parent onto every part', () => {
    const { map } = splitMembers(whole, nodes, cuts)
    const out = splitAxialModes(new Map([['B1', 'tension-only']]), map)
    expect(out.has('B1')).toBe(false)
    for (const p of map[0].parts) expect(out.get(p)).toBe('tension-only')
  })

  it('leaves an unsplit member’s mode alone, and is a no-op with no splits', () => {
    const { map } = splitMembers(whole, nodes, cuts)
    const modes = new Map<string, 'tension-only'>([['OTHER', 'tension-only']])
    expect(splitAxialModes(modes, map).get('OTHER')).toBe('tension-only')
    expect(splitAxialModes(modes, [])).toBe(modes)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE SLAB'S LINE LOAD, RECOVERED FROM THE FORCES THE MESH HANDS THE BEAM.
// ─────────────────────────────────────────────────────────────────────────
describe('recoverLineLoad — the consistent nodal forces, read backwards', () => {
  it('a uniform q gives back q, on even and uneven stations', () => {
    for (const x of [[0, 1, 2, 3, 4, 5, 6], [0, 0.5, 1.75, 3, 4.5, 5, 6]]) {
      const q = 7.5
      const J = x.map((_, j) => (j > 0 && j < x.length - 1 ? q * (x[j + 1] - x[j - 1]) / 2 : 0))
      for (const v of recoverLineLoad(x, J)) expect(v).toBeCloseTo(q, 10)
    }
  })

  it('a linear q is recovered exactly, ends included', () => {
    // consistent forces of q(x) = 2 + 3x on linear hats: h(q_{j−1} + 4q_j + q_{j+1})/6 for even h
    const x = [0, 1, 2, 3, 4, 5]
    const qx = (t: number) => 2 + 3 * t
    const J = x.map((t, j) => (j > 0 && j < x.length - 1 ? (qx(t - 1) + 4 * qx(t) + qx(t + 1)) / 6 : 0))
    recoverLineLoad(x, J).forEach((v, j) => expect(v).toBeCloseTo(qx(x[j]), 10))
  })

  it('with one junction the load is uniform; with none there is no load', () => {
    expect(recoverLineLoad([0, 2, 6], [0, 12, 0])).toEqual([4, 4, 4])
    expect(recoverLineLoad([0, 6], [0, 0])).toEqual([0, 0])
  })
})

/** A part of a simply supported beam carrying point loads −P at every interior
 *  junction: V steps, M a polygon — exactly what the meshed slab hands a beam. */
function ssParts(L: number, K: number, P: number): { res: F3MemberResult[]; map: { parent: string; parts: string[]; lengths: number[] }[] } {
  const h = L / K, R = (P * (K - 1)) / 2
  const res: F3MemberResult[] = []
  for (let k = 0; k < K; k++) {
    const xs = Array.from({ length: 5 }, (_, i) => (h * i) / 4)
    const V0 = R - P * k, M0 = R * k * h - P * (k * (k - 1) / 2) * h
    const zero = xs.map(() => 0)
    res.push({ id: partId('B', k), L: h, f: new Array(12).fill(0), xs,
      N: zero, Vz: zero, T: zero, My: zero, Vy: xs.map(() => V0), Mz: xs.map((x) => M0 + V0 * x),
      Nmax: 0, Vmax: 0, Mmax: 0, Tmax: 0 })
  }
  return { res, map: [{ parent: 'B', parts: res.map((r) => r.id), lengths: res.map(() => h) }] }
}

describe('stitchMembers — the junction steps become the line load they came from', () => {
  it('point forces of qh at the junctions draw the uniform-load parabola, exactly', () => {
    // q = P/h = 10 kN/m over 6 m: V = q(L/2 − x), M = q·x(L − x)/2, 45 kN·m at midspan.
    // The solver's nodal moments are kept, and between them M bulges as a UDL bends it.
    const L = 6, K = 6, P = 10, q = P / (L / K)
    const { res, map } = ssParts(L, K, P)
    const got = stitchMembers(res, map)[0]
    expect(got.id).toBe('B')
    expect(new Set(got.xs).size).toBe(got.xs.length)
    got.xs.forEach((x, i) => {
      expect(got.Vy[i]).toBeCloseTo(q * (L / 2 - x), 9)
      expect(got.Mz[i]).toBeCloseTo((q * x * (L - x)) / 2, 9)
    })
    expect(got.Mmax).toBeCloseTo(45, 9)
    expect(got.Vmax).toBeCloseTo(30, 9)          // qL/2: the end shares the joint took, drawn on the beam
  })

  it('the junction moments are the solver’s, whatever the load profile', () => {
    // uneven junction forces — a triangular tributary, say — on uneven cuts
    const lengths = [0.8, 1.4, 1.1, 1.6, 0.6, 1.5], Pj = [0, 3, 9, 14, 6, 11]
    const st = [0]; for (const l of lengths) st.push(st[st.length - 1] + l)
    const L = st[st.length - 1]
    const total = Pj.reduce((a, b) => a + b, 0)
    const R0 = Pj.reduce((a, p, j) => a + p * (L - st[j]), 0) / L
    const res: F3MemberResult[] = lengths.map((h, k) => {
      const xs = [0, h / 3, (2 * h) / 3, h]
      const V0 = R0 - Pj.slice(1, k + 1).reduce((a, b) => a + b, 0)
      const M0 = R0 * st[k] - Pj.slice(1, k + 1).reduce((a, p, j) => a + p * (st[k] - st[j + 1]), 0)
      const zero = xs.map(() => 0)
      return { id: partId('B', k), L: h, f: new Array(12).fill(0), xs, N: zero, Vz: zero, T: zero, My: zero,
        Vy: xs.map(() => V0), Mz: xs.map((x) => M0 + V0 * x), Nmax: 0, Vmax: 0, Mmax: 0, Tmax: 0 }
    })
    const got = stitchMembers(res, [{ parent: 'B', parts: res.map((r) => r.id), lengths }])[0]
    for (let k = 0; k <= lengths.length; k++) {
      const i = got.xs.findIndex((x) => Math.abs(x - st[k]) < 1e-12)
      const exact = k === 0 ? res[0].Mz[0] : res[k - 1].Mz[res[k - 1].Mz.length - 1]
      expect(got.Mz[i]).toBeCloseTo(exact, 9)
    }
    expect(total).toBeGreaterThan(0)
  })

  it('a couple at a junction lands at the middle of its jump, and leaves the ends alone', () => {
    const lengths = [1, 1, 1, 1], C = 4
    const res: F3MemberResult[] = lengths.map((h, k) => {
      const xs = [0, 0.5, 1], zero = xs.map(() => 0)
      return { id: partId('B', k), L: h, f: new Array(12).fill(0), xs, N: zero, Vy: zero, Vz: zero, T: zero, My: zero,
        Mz: xs.map(() => C * k), Nmax: 0, Vmax: 0, Mmax: 0, Tmax: 0 }
    })
    const got = stitchMembers(res, [{ parent: 'B', parts: res.map((r) => r.id), lengths }])[0]
    const at = (x: number) => got.Mz[got.xs.findIndex((v) => Math.abs(v - x) < 1e-12)]
    expect(at(0)).toBeCloseTo(0, 12)
    expect(at(4)).toBeCloseTo(3 * C, 12)
    for (const k of [1, 2, 3]) expect(at(k)).toBeCloseTo(C * (k - 0.5), 12)
  })
})

describe('stitchLoads — the loads follow the results back onto the parent', () => {
  const lens = new Map([['B1', 9]])
  const memberLen = (id: string) => lens.get(id) ?? 0
  const kinds: F3Load[] = [
    { kind: 'member-udl', member: 'B1', w: 12, cat: 'D' },
    { kind: 'member-udl', member: 'B1', w: 12, cat: 'D' },
    { kind: 'member-point', member: 'B1', a: 5, P: 40, cat: 'D' },
    { kind: 'member-point', member: 'B1', a: 3.5, P: 25, cat: 'L' },
    { kind: 'member-vdl', member: 'B1', x1: 1, x2: 8, w1: 4, w2: 16, cat: 'D' },
    { kind: 'member-thermal', member: 'B1', PT: 500, cat: 'D' },
    { kind: 'node', node: 'a', Fy: -7, cat: 'D' },
  ]

  it('undoes splitLoads: the same resultant, measured on the parent', () => {
    const { map } = splitMembers(whole, nodes, cuts)
    const back = stitchLoads(splitLoads(kinds, map), map)
    const [r0, r1] = [appliedResultant(kinds, memberLen), appliedResultant(back, memberLen)]
    for (let c = 0; c < 3; c++) expect(r1[c]).toBeCloseTo(r0[c], 9)
    // and a UDL comes back as the UDL it was, not as four copies
    expect(back.filter((l) => l.kind === 'member-udl')).toEqual(kinds.filter((l) => l.kind === 'member-udl'))
    for (const l of back) if (l.kind !== 'node') expect(l.member).toBe('B1')
  })

  it('the split ids measure to nothing — which is what the statics check used to read', () => {
    const { map } = splitMembers(whole, nodes, cuts)
    const raw = appliedResultant(splitLoads(kinds, map), memberLen)
    expect(raw[1]).toBeGreaterThan(appliedResultant(kinds, memberLen)[1])  // the line loads went missing
  })
})

describe('a meshed slab: statics holds and the beams read smoothly at every subdivision', () => {
  const section: RectSection = { id: 'C', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  for (const n of [2, 4, 6]) {
    it(`subdivision ${n}: ΣApplied = ΣReactions, and no beam diagram steps`, () => {
      const m = generateGridModel({ baysX: [6, 6], baysZ: [5, 5], storeyH: [4, 3.5], section, slabThickness: 150 })
      for (const p of m.plates) m.loads.push({ kind: 'area', plate: p.id, q: 5, cat: 'D' })
      for (const b of m.members.filter((x) => x.role === 'beam')) m.loads.push({ kind: 'member-udl', member: b.id, w: 3, cat: 'D' })
      m.shellElements = true; m.shellSubdiv = n
      const out = runModelAnalysis({ model: m, opts: { f1: 0.5 }, drift: { hasSeis: false, T: 0.5, R: 8.5, axis: 'x', pDelta: false } })
      const nm = new Map(m.nodes.map((q) => [q.id, q]))
      const len = new Map(m.members.map((q) => { const a = nm.get(q.i)!, b = nm.get(q.j)!; return [q.id, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)] }))
      for (const run of out.analysis!.perCombo) {
        if (!run.result) continue
        const applied = appliedResultant(run.factored, (id) => len.get(id) ?? 0)
        const rFy = run.result.reactions.reduce((t, r) => t + r.F[1], 0)
        expect(Math.abs(applied[1] + rFy) / Math.abs(rFy)).toBeLessThan(1e-9)
        for (const l of run.factored) if (l.kind !== 'node') expect(len.has(l.member)).toBe(true)
      }
      // every beam: one station per x, and no jump in V or M bigger than its own slope allows
      const r = out.analysis!.perCombo[0].result!
      for (const b of m.members.filter((x) => x.role === 'beam')) {
        const mr = r.members.find((x) => x.id === b.id)!
        expect(new Set(mr.xs).size).toBe(mr.xs.length)
        const span = Math.max(...mr.Vy.map(Math.abs)) || 1
        for (let i = 1; i < mr.xs.length; i++) {
          const dx = mr.xs[i] - mr.xs[i - 1]
          expect(Math.abs(mr.Vy[i] - mr.Vy[i - 1])).toBeLessThan(span * (dx * 2 + 1e-6))
        }
      }
    }, 120000)
  }
})

it('stitchAnalysis carries the factored loads with the results', () => {
  const { members, map } = splitMembers(whole, nodes, cuts)
  const loads = splitLoads([{ kind: 'member-udl', member: 'B1', w: 12, cat: 'D' }], map)
  const r = solve(members, loads)!
  const a = stitchAnalysis({ perCombo: [{ combo: { name: '1.0D', f: { D: 1 } }, result: r, factored: loads, skipped: false }], govIdx: 0 }, map)
  expect(a.perCombo[0].factored).toEqual([{ kind: 'member-udl', member: 'B1', w: 12, cat: 'D' }])
  expect(a.perCombo[0].result!.members[0].id).toBe('B1')
})
