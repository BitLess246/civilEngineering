import { describe, it, expect } from 'vitest'
import { meshPlates, meshPrefix, emptyPlateMesh } from './plateMesh'
import { generateGridModel } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D } from './frame3d'
import { stitchResult } from './memberSplit'
import type { RectSection, StructuralModel } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const MAT = { E: 24870, nu: 0.2 }

/** One 6 × 5 m panel in the X–Z plane at y = 0, on its own four nodes. */
const onePanel = (): StructuralModel => ({
  version: 1,
  name: 'panel',
  nodes: [
    { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 6, y: 0, z: 0 },
    { id: 'c', x: 6, y: 0, z: 5 }, { id: 'd', x: 0, y: 0, z: 5 },
  ],
  sections: [section],
  members: [],
  plates: [{ id: 'p1', corners: ['a', 'b', 'c', 'd'], role: 'slab', thickness: 150 }],
  walls: [],
  supports: [],
  loads: [],
  storeys: [{ id: 's0', name: 'L0', elevation: 0 }],
})

const area = (m: ReturnType<typeof meshPlates>) =>
  [...m.areaByElem.values()].reduce((s, a) => s + a, 0)

describe('meshPlates — the grid', () => {
  it('n = 1 is the classic two triangles on the panel’s own corners', () => {
    // The substitution control: the whole point of defaulting to 1 is that it
    // is not a new mesh at all. Same two triangles, same c0–c2 diagonal, and
    // NO new nodes — every vertex is already a model node.
    const m = meshPlates(onePanel(), { subdiv: 1, ...MAT })
    expect(m.shells).toHaveLength(2)
    expect(m.shells.map((s) => s.nodes)).toEqual([['a', 'b', 'c'], ['a', 'c', 'd']])
    expect(m.nodes).toHaveLength(0)
    expect(area(m)).toBeCloseTo(30, 9)
  })

  it('n × n gives 2n² elements and (n+1)² − 4 new nodes', () => {
    for (const n of [2, 3, 4, 6]) {
      const m = meshPlates(onePanel(), { subdiv: n, ...MAT })
      expect(m.shells).toHaveLength(2 * n * n)
      expect(m.nodes).toHaveLength((n + 1) * (n + 1) - 4)   // the 4 corners are reused
      expect(m.elemsByPlate.get('p1')).toHaveLength(2 * n * n)
    }
  })

  it('the meshed area equals the panel area at every density', () => {
    // The load invariant rests on this: the bridge lumps q·A/3 per element, so
    // if Σ A drifted from the panel the applied load would drift with it.
    for (const n of [1, 2, 3, 4, 5, 6])
      expect(area(meshPlates(onePanel(), { subdiv: n, ...MAT }))).toBeCloseTo(30, 9)
  })

  it('reuses the model’s own nodes wherever the mesh lands on one', () => {
    // A node the user drew at a panel edge midpoint must stay ONE node, or the
    // slab and whatever else attaches there quietly come apart.
    const model = onePanel()
    model.nodes.push({ id: 'mid', x: 3, y: 0, z: 0 })     // midpoint of edge a→b
    const m = meshPlates(model, { subdiv: 2, ...MAT })
    const used = new Set(m.shells.flatMap((s) => s.nodes))
    expect(used.has('mid')).toBe(true)
    expect(m.nodes.some((q) => q.id === 'mid')).toBe(false)   // not re-created
  })

  it('adjacent panels share their common edge nodes', () => {
    // Conforming, or the two panels slide past each other along the shared line.
    const model = onePanel()
    model.nodes.push({ id: 'e', x: 12, y: 0, z: 0 }, { id: 'f', x: 12, y: 0, z: 5 })
    model.plates.push({ id: 'p2', corners: ['b', 'e', 'f', 'c'], role: 'slab', thickness: 150 })
    const m = meshPlates(model, { subdiv: 4, ...MAT })
    const of = (id: string) => new Set((m.elemsByPlate.get(id) ?? [])
      .flatMap((e) => m.nodesByElem.get(e) ?? []))
    const shared = [...of('p1')].filter((id) => of('p2').has(id))
    // the whole b→c edge: 5 grid points at n = 4
    expect(shared).toHaveLength(5)
    // and the mesh has one node per grid point, not two
    expect(m.nodes.length + model.nodes.length).toBe(5 * 5 + 5 * 4)
  })

  it('skips a panel with a missing corner or no area, and says nothing', () => {
    // Both already carry a meshValidation rule, so the user has been told; the
    // mesher's job is to not produce a degenerate element.
    const ghost = onePanel()
    ghost.plates[0] = { ...ghost.plates[0], corners: ['a', 'b', 'c', 'ghost'] }
    expect(meshPlates(ghost, { subdiv: 4, ...MAT }).shells).toHaveLength(0)

    const flat = onePanel()
    flat.nodes = flat.nodes.map((q, i) => ({ ...q, x: i * 2, z: 0 }))   // collinear
    expect(meshPlates(flat, { subdiv: 4, ...MAT }).shells).toHaveLength(0)
  })

  it('a model with no plates returns the empty mesh', () => {
    const bare = { ...onePanel(), plates: [] }
    expect(meshPlates(bare, { subdiv: 4, ...MAT })).toEqual(emptyPlateMesh())
  })
})

describe('meshPrefix — synthetic ids must not collide with the user’s', () => {
  it('avoids any prefix an existing node id starts with', () => {
    const model = onePanel()
    expect(meshPrefix(model)).toBe('~p')
    model.nodes.push({ id: '~p0', x: 1, y: 0, z: 1 })
    expect(meshPrefix(model)).toBe('~p~')
    model.nodes.push({ id: '~p~9', x: 2, y: 0, z: 1 })
    expect(meshPrefix(model)).toBe('~p~~')
  })

  it('a user node named like a synthetic one does not get absorbed', () => {
    // The failure this prevents is silent: colliding ids MERGE two distinct
    // nodes, welding unrelated parts of the structure together.
    const model = onePanel()
    model.nodes.push({ id: '~p0', x: 99, y: 0, z: 99 })   // nowhere near the panel
    const m = meshPlates(model, { subdiv: 2, ...MAT })
    const used = new Set(m.shells.flatMap((s) => s.nodes))
    expect(used.has('~p0')).toBe(false)
    expect(m.nodes.every((q) => q.id !== '~p0')).toBe(true)
  })
})

describe('meshPlates — edge splits', () => {
  it('finds the mesh nodes lying inside each edge member, ordered i→j', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    const m = meshPlates(model, { subdiv: 4, ...MAT })
    const nm = new Map([...model.nodes, ...m.nodes].map((q) => [q.id, q]))
    let edges = 0
    for (const mem of model.members) {
      const hits = m.edgeSplits.get(mem.id)
      if (!hits) continue
      edges++
      expect(hits).toHaveLength(3)                      // n − 1 interior points
      // strictly increasing along i→j, and every hit really is on the line
      const a = nm.get(mem.i)!, b = nm.get(mem.j)!
      const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      const ts = hits.map((id) => {
        const p = nm.get(id)!
        return ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y) + (p.z - a.z) * (b.z - a.z)) / (L * L)
      })
      expect(ts).toEqual([...ts].sort((x, y) => x - y))
      for (const t of ts) { expect(t).toBeGreaterThan(0); expect(t).toBeLessThan(1) }
    }
    expect(edges).toBe(4)          // the four beams bounding the single panel
  })

  it('reports nothing at n = 1 — there are no interior nodes to attach', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    expect(meshPlates(model, { subdiv: 1, ...MAT }).edgeSplits.size).toBe(0)
  })

  it('picks up a beam crossing the panel interior, not just its edges', () => {
    // Deliberately generic: a secondary beam drawn across a slab is exactly the
    // member you want tied to the mesh.
    const model = onePanel()
    model.nodes.push({ id: 'm0', x: 0, y: 0, z: 2.5 }, { id: 'm1', x: 6, y: 0, z: 2.5 })
    model.members.push({ id: 'sec', i: 'm0', j: 'm1', role: 'beam', section: 'S1' })
    const m = meshPlates(model, { subdiv: 4, ...MAT })
    // the z = 2.5 grid line has 5 points; 2 are the member's own ends
    expect(m.edgeSplits.get('sec')).toHaveLength(3)
  })
})

describe('the meshed panel, solved through the bridge', () => {
  // ───────────────────────────────────────────────────────────────────────
  // THE PAYOFF. `shell.test.ts` already anchors the ELEMENT against both
  // Timoshenko plate closed forms using its own benchmark mesher. This asks
  // whether the BRIDGE reproduces that on a model-space panel: meshed by
  // `meshPlates`, attached by the member split, loaded through the area-load
  // path, solved by `frame3d`.
  //
  // A 6 × 6 m panel on four 2000 × 2000 mm edge beams pinned at the corners is
  // very nearly CLAMPED, not simply supported: the beams are torsionally stiff,
  // so the slab edge cannot rotate. The clamped coefficient is the right anchor
  // and the measured numbers say so — see the ratios below.
  // ───────────────────────────────────────────────────────────────────────
  const stiff: RectSection = { id: 'ST', name: 'stiff', b: 2000, h: 2000, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const Q = 10, A = 6, T = 150

  const square = (): StructuralModel => ({
    version: 1, name: 'panel', sections: [stiff],
    nodes: [
      { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: A, y: 0, z: 0 },
      { id: 'c', x: A, y: 0, z: A }, { id: 'd', x: 0, y: 0, z: A },
    ],
    members: [
      { id: 'e0', i: 'a', j: 'b', role: 'beam', section: 'ST' },
      { id: 'e1', i: 'b', j: 'c', role: 'beam', section: 'ST' },
      { id: 'e2', i: 'd', j: 'c', role: 'beam', section: 'ST' },
      { id: 'e3', i: 'a', j: 'd', role: 'beam', section: 'ST' },
    ],
    plates: [{ id: 'p1', corners: ['a', 'b', 'c', 'd'], role: 'slab', thickness: T }],
    walls: [],
    supports: ['a', 'b', 'c', 'd'].map((n) => ({ node: n, fixity: 'pin' as const })),
    loads: [{ kind: 'area', plate: 'p1', q: Q, cat: 'D' }],
    storeys: [{ id: 's0', name: 'L0', elevation: 0 }],
    shellElements: true,
  })

  /** Timoshenko clamped square plate: w = 0.00126·q·a⁴/D. */
  const clamped = (() => {
    const E = 4700 * Math.sqrt(28) * 1e3            // kPa
    const t = T / 1000
    const D = (E * t ** 3) / (12 * (1 - 0.2 ** 2))
    return (0.00126 * Q * A ** 4) / D
  })()

  /** Centre deflection (m, magnitude) and Σ vertical reaction, at subdivision n. */
  const run = (n: number) => {
    const br = modelToFrame3D(square(), { shellSubdiv: n })
    const sol = solveFrame3D(br.nodes, br.members, br.supports, br.loads, {}, br.shells)!
    let best = 0, bd = Infinity
    br.nodes.forEach((q, i) => {
      const dd = Math.hypot(q.x - A / 2, q.z - A / 2)
      if (dd < bd) { bd = dd; best = i }
    })
    return {
      uy: Math.abs(sol.d[6 * best + 1]),
      sumR: sol.reactions.reduce((s, r) => s + r.F[1], 0),
      br, sol,
    }
  }

  it('converges monotonically toward the clamped closed form, from above', () => {
    const ns = [2, 4, 6, 8]
    const uy = ns.map((n) => run(n).uy)
    // strictly decreasing — a finer mesh is a softer, more honest plate
    for (let k = 1; k < uy.length; k++) expect(uy[k]).toBeLessThan(uy[k - 1])
    // and from ABOVE: a displacement-based element approaches the exact
    // answer from the stiff side, so it may never undershoot
    for (const w of uy) expect(w).toBeGreaterThan(clamped)
    // measured 1.175 → 1.110 → 1.066 → 1.046 of the closed form
    expect(uy[0] / clamped).toBeLessThan(1.20)
    expect(uy[uy.length - 1] / clamped).toBeLessThan(1.06)
  })

  it('has no interior freedom at all at n = 1 — the defect being fixed', () => {
    // Two triangles on four pinned corners: there is no node between the
    // supports, so the panel cannot deflect anywhere. That is the state every
    // shipped shell analysis was in.
    const { uy, br } = run(1)
    expect(br.nodes).toHaveLength(4)
    expect(uy).toBeCloseTo(0, 12)
  })

  it('transfers the whole applied load into the supports at every density', () => {
    // Statics does not pass through the stitching, so it cannot be fooled by a
    // split that reassembles a wrong answer consistently.
    for (const n of [1, 2, 4, 6, 8]) {
      expect(run(n).sumR).toBeCloseTo(Q * A * A, 6)
    }
  })

  it('cuts all four edge beams and reports them as splits', () => {
    const { br } = run(4)
    expect(br.memberSplits).toHaveLength(4)
    for (const s of br.memberSplits) {
      expect(s.parts).toHaveLength(4)                        // n parts per edge
      expect(s.lengths.reduce((x, y) => x + y, 0)).toBeCloseTo(A, 9)
    }
    // the solver sees the parts, never the parents
    const ids = new Set(br.members.map((m) => m.id))
    for (const s of br.memberSplits) {
      expect(ids.has(s.parent)).toBe(false)
      for (const p of s.parts) expect(ids.has(p)).toBe(true)
    }
  })

  it('stitching puts the beams back under their model ids', () => {
    const { br, sol } = run(4)
    const stitched = stitchResult(sol, br.memberSplits)
    expect(stitched.members.map((m) => m.id).sort()).toEqual(['e0', 'e1', 'e2', 'e3'])
    for (const m of stitched.members) expect(m.L).toBeCloseTo(A, 9)
  })

  it('an unattached mesh is far softer — which is why the split is not optional', () => {
    // Drop the split (keep the parents whole) and the panel hangs off its four
    // corners. The contrast is the argument for this whole phase.
    const br = modelToFrame3D(square(), { shellSubdiv: 4 })
    const whole = modelToFrame3D(square(), { shellSubdiv: 4, useShells: false }).members
    const loose = solveFrame3D(br.nodes, whole, br.supports, br.loads, {}, br.shells)!
    let best = 0, bd = Infinity
    br.nodes.forEach((q, i) => {
      const dd = Math.hypot(q.x - A / 2, q.z - A / 2)
      if (dd < bd) { bd = dd; best = i }
    })
    const loosely = Math.abs(loose.d[6 * best + 1])
    expect(loosely).toBeGreaterThan(3 * run(4).uy)
  })
})
