import { describe, it, expect } from 'vitest'
import { splitMembers, splitLoads, splitAxialModes, stitchResult, partId } from './memberSplit'
import { solveFrame3D, type F3Node, type F3Member, type F3Load, type F3Support } from './frame3d'

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

  it('keeps the junction stations duplicated — shear really is discontinuous there', () => {
    // A point load at a cut makes V jump. Smoothing the duplicate away would
    // hide exactly the transfer this phase exists to model.
    const loads: F3Load[] = [{ kind: 'member-point', member: 'B1', a: 5, P: 40, cat: 'D' }]
    const { members, map } = splitMembers(whole, nodes, cuts)
    const got = stitchResult(solve(members, splitLoads(loads, map))!, map).members[0]
    const dupes = got.xs.filter((x, k) => k > 0 && Math.abs(x - got.xs[k - 1]) < 1e-9)
    expect(dupes.length).toBeGreaterThanOrEqual(3)      // one per interior cut
    expect(got.xs).toEqual([...got.xs].sort((p, q) => p - q))
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
