import { describe, it, expect } from 'vitest'
import { buildStructureCages } from './cageBuilder'
import { designStructure } from './pipeline'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { cutLength } from './rebarModel'

const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

// A 2-bay, 2-storey frame: interior beams that carry on past a support, end
// beams that do not, and columns stacked through a joint.
const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section })
model.loads = buildGravityLoads(model, 4.8, 2.4)
const design = designStructure(model, soil as never)!
const { cages, unplaced } = buildStructureCages(model, design)

const nodeOf = (id: string) => model.nodes.find((n) => n.id === id)!
const memOf = (id: string) => model.members.find((m) => m.id === id)!

describe('buildStructureCages', () => {
  it('places every designed member, and reports any it cannot', () => {
    expect(unplaced).toEqual([])
    expect(cages).toHaveLength(design.beams.length + design.columns.length)
    expect(new Set(cages.map((c) => c.member)).size).toBe(cages.length)
  })

  it('puts a beam cage between its own two nodes, at its own level', () => {
    const b = design.beams[0]
    const mem = memOf(b.id), ni = nodeOf(mem.i), nj = nodeOf(mem.j)
    const cage = cages.find((c) => c.member === b.id)!
    const bars = cage.runs.filter((r) => r.role === 'top' || r.role === 'bottom')
    const xs = bars.flatMap((r) => r.path.map((p) => p[0]))
    const zs = bars.flatMap((r) => r.path.map((p) => p[2]))
    // inside the two nodes' plan extent, allowing the half-web offset
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(Math.min(ni.x, nj.x) - 0.3)
    expect(Math.max(...xs)).toBeLessThanOrEqual(Math.max(ni.x, nj.x) + 0.3)
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(Math.min(ni.z, nj.z) - 0.3)
    expect(Math.max(...zs)).toBeLessThanOrEqual(Math.max(ni.z, nj.z) + 0.3)
  })

  it('hangs the beam steel off the node as the section CENTROID, not its top', () => {
    // The 3D scene centres a member's box on the node line, so the soffit is
    // h/2 below the node. Treating the node as the top would bury every beam
    // cage half a section into the slab.
    const b = design.beams[0]
    const mem = memOf(b.id), y = nodeOf(mem.i).y
    const cage = cages.find((c) => c.member === b.id)!
    const ys = cage.runs.flatMap((r) => r.path.map((p) => p[1]))
    expect(Math.min(...ys)).toBeGreaterThan(y - 0.5 / 2 - 1e-6)
    expect(Math.max(...ys)).toBeLessThan(y + 0.5 / 2 + 1e-6)
  })

  it('stands a column cage on its own plan position, between its node levels', () => {
    const c = design.columns[0]
    const mem = memOf(c.id), ni = nodeOf(mem.i), nj = nodeOf(mem.j)
    const cage = cages.find((x) => x.member === c.id)!
    const verts = cage.runs.filter((r) => r.role === 'vertical')
    expect(verts.length).toBeGreaterThan(0)
    for (const v of verts) {
      expect(Math.abs(v.path[0][0] - ni.x)).toBeLessThan(0.3)
      expect(Math.abs(v.path[0][2] - ni.z)).toBeLessThan(0.3)
    }
    const ys = verts.flatMap((r) => r.path.map((p) => p[1]))
    expect(Math.min(...ys)).toBeCloseTo(Math.min(ni.y, nj.y), 6)
    expect(Math.max(...ys)).toBeCloseTo(Math.max(ni.y, nj.y), 6)
  })

  it('hooks a beam end exactly where the model has nothing carrying on', () => {
    // A beam that carries on collinearly past a node has no hook there; an end
    // beam does. Assuming one or the other everywhere gets half of them wrong.
    // Checked as an invariant per beam rather than by population count: in a
    // 2-bay frame EVERY beam touches an outer node, so every one has exactly
    // one hook, and a count-based test passes for the wrong reason.
    const isBeam = (r: string) => r === 'beam' || r === 'girder'
    const dirOf = (m: { i: string; j: string }) => {
      const p = nodeOf(m.i), q = nodeOf(m.j)
      const d = [q.x - p.x, q.y - p.y, q.z - p.z]
      const l = Math.hypot(d[0], d[1], d[2]) || 1
      return d.map((v) => v / l)
    }
    for (const b of design.beams) {
      const mem = memOf(b.id)
      const u = dirOf(mem)
      const carriesOn = (node: string) => model.members.some((o) => {
        if (o.id === mem.id || !isBeam(o.role)) return false
        if (o.i !== node && o.j !== node) return false
        const v = dirOf(o)
        return Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) > 0.98
      })
      const expectedHooks = (carriesOn(mem.i) ? 0 : 1) + (carriesOn(mem.j) ? 0 : 1)
      const cage = cages.find((c) => c.member === b.id)!
      const through = cage.runs.find((r) => r.mark === `${b.id}-T1`)!
      expect(through.bendDia).toHaveLength(expectedHooks)
    }
  })

  it('gives an interior beam no hooks at all', () => {
    // Three bays, so the middle beam is continuous at BOTH ends.
    const m3 = generateGridModel({ baysX: [6, 6, 6], baysZ: [5], storeyH: [3], section })
    m3.loads = buildGravityLoads(m3, 4.8, 2.4)
    const d3 = designStructure(m3, soil as never)!
    const c3 = buildStructureCages(m3, d3).cages
    const beamIds = new Set(d3.beams.map((b) => b.id))
    const hookCounts = c3.filter((c) => beamIds.has(c.member))
      .map((c) => c.runs.find((r) => r.mark === `${c.member}-T1`)!.bendDia.length)
    expect(hookCounts).toContain(0)          // the middle beam of a 3-bay run
    expect(hookCounts).toContain(1)          // and the two either side of it
  })

  it('leaves the joint band clear of column ties', () => {
    // §418.8.3: the hoops through a joint belong to the joint. Column ties
    // placed there too would be drawn twice and paid for twice.
    const c = design.columns[0]
    const mem = memOf(c.id), ni = nodeOf(mem.i), nj = nodeOf(mem.j)
    const yTop = Math.max(ni.y, nj.y)
    const cage = cages.find((x) => x.member === c.id)!
    const tieYs = cage.runs.filter((r) => r.role === 'tie').map((r) => r.path[0][1])
    // no tie inside ±h/2 of the top node, where the beams frame in
    for (const y of tieYs) expect(Math.abs(y - yTop)).toBeGreaterThan(0.5 / 2 - 1e-6)
  })

  it('gives every bar a positive developed length and a mark of its own', () => {
    for (const cage of cages) {
      const marks = cage.runs.map((r) => r.mark)
      expect(new Set(marks).size).toBe(marks.length)
      for (const r of cage.runs) {
        expect(cutLength(r)).toBeGreaterThan(0)
        expect(r.member).toBe(cage.member)
        expect(r.dia).toBeGreaterThan(0)
      }
    }
  })

  it('keeps every bar inside the member it belongs to', () => {
    // A cage that escapes its member is the failure mode a 3D view makes
    // obvious and a weight total never would.
    for (const b of design.beams) {
      const mem = memOf(b.id), ni = nodeOf(mem.i), nj = nodeOf(mem.j)
      const cage = cages.find((c) => c.member === b.id)!
      for (const r of cage.runs) {
        for (const p of r.path) {
          expect(p[1]).toBeGreaterThan(ni.y - 0.5)
          expect(p[1]).toBeLessThan(ni.y + 0.5)
          expect(p[0]).toBeGreaterThanOrEqual(Math.min(ni.x, nj.x) - 0.35)
          expect(p[0]).toBeLessThanOrEqual(Math.max(ni.x, nj.x) + 0.35)
        }
      }
    }
  })
})
