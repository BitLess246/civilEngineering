import { describe, it, expect } from 'vitest'
import { buildStructureCages } from './cageBuilder'
import { designStructure } from './pipeline'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { cutLength, STOCK_BAR_LENGTH, type RebarCage, type Vec3 } from './rebarModel'
import { estimateTakeoff } from './takeoff'

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

/** A through bar's pieces, in order — one run when it fits a stock bar, and
 *  the lapped pieces `…a`, `…b` when it does not. */
const throughPieces = (cage: RebarCage, mark: string) =>
  cage.runs
    .filter((r) => r.mark === mark || (r.mark.startsWith(mark) && /^[a-z]$/.test(r.mark.slice(mark.length))))
    .sort((a, b) => a.mark.localeCompare(b.mark))

/**
 * Anchorage hooks on a whole through bar — 0, 1 or 2.
 *
 * Counted from GEOMETRY rather than by counting bends: a bar now carries bends
 * that are not hooks (the step-aside at a lap splice has two of its own), so a
 * bend tally answers a different question. A hook is the bar's own end turning
 * out of the line it runs along.
 */
const hooksOn = (cage: RebarCage, mark: string): number => {
  const ps = throughPieces(cage, mark)
  if (!ps.length) return 0
  const turns = (a: Vec3, b: Vec3) => Math.abs(a[1] - b[1]) > 1e-6
  const head = ps[0].path, tail = ps[ps.length - 1].path
  return (turns(head[0], head[1]) ? 1 : 0)
    + (turns(tail[tail.length - 1], tail[tail.length - 2]) ? 1 : 0)
}

describe('buildStructureCages', () => {
  it('places every designed member, and reports any it cannot', () => {
    expect(unplaced).toEqual([])
    // Slabs are in this count now: `generateGridModel` lays a panel in every
    // bay, and every designed panel gets its mats.
    expect(cages).toHaveLength(
      design.beams.length + design.columns.length + design.footings.length + design.slabs.length)
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

  it('hangs the whole beam BELOW the node — the node is the TOP of the beam', () => {
    // A floor level is the top of the beam: the column below stops there, the
    // column above starts there, and the beam hangs under the pair. Read as the
    // centroid, half of every beam was drawn up through the column starting at
    // that node.
    const b = design.beams[0]
    const mem = memOf(b.id), y = nodeOf(mem.i).y
    const cage = cages.find((c) => c.member === b.id)!
    const ys = cage.runs.flatMap((r) => r.path.map((p) => p[1]))
    expect(Math.max(...ys)).toBeLessThanOrEqual(y + 1e-6)     // nothing above the level
    expect(Math.min(...ys)).toBeGreaterThan(y - 0.5 - 1e-6)   // nothing below the soffit
    // …and it hangs the FULL depth: the top steel sits one cover inset under
    // the node and the bottom steel one inset over the soffit — not h/2 either
    // side of the node, which is what the centroid reading gave.
    expect(Math.max(...ys)).toBeLessThan(y - 0.02)            // inside the cover
    expect(Math.max(...ys)).toBeGreaterThan(y - 0.1)          // …and only just
    expect(Math.min(...ys)).toBeLessThan(y - 0.4)             // steel down at the soffit
  })

  it('stands a column cage on its own plan position, and starts at its base', () => {
    const c = design.columns[0]
    const mem = memOf(c.id), ni = nodeOf(mem.i), nj = nodeOf(mem.j)
    const cage = cages.find((x) => x.member === c.id)!
    const verts = cage.runs.filter((r) => r.role === 'vertical')
    expect(verts.length).toBeGreaterThan(0)
    for (const v of verts) {
      expect(Math.abs(v.path[0][0] - ni.x)).toBeLessThan(0.3)
      expect(Math.abs(v.path[0][2] - ni.z)).toBeLessThan(0.3)
    }
    // A column on a footing runs BELOW its base node, down to the top of the
    // pad — the pedestal. Stopping at the node left that length out of the
    // cage, the concrete and the bill.
    const ped = design.footings.find((f) => f.node === (ni.y <= nj.y ? mem.i : mem.j))?.pedestal ?? 0
    expect(ped).toBeGreaterThan(0)
    const ys = verts.flatMap((r) => r.path.map((p) => p[1]))
    expect(Math.min(...ys)).toBeCloseTo(Math.min(ni.y, nj.y) - ped, 6)
  })

  it('stands the pad top exactly where the pedestal ends', () => {
    // One number, H − Dc, decides both: a pad drawn at one depth and a column
    // reaching to another leaves a gap nothing is cast in.
    for (const f of design.footings) {
      const cage = cages.find((c) => c.member === `F-${f.node}`)
      if (!cage) continue
      const node = nodeOf(f.node)
      const mat = cage.runs.filter((r) => r.role === 'mat')
      const top = Math.max(...mat.map((r) => r.path[0][1]))
      // the mat sits inside the pad, whose top is `pedestal` below the node
      expect(top).toBeLessThan(node.y - f.pedestal)
      expect(top).toBeGreaterThan(node.y - f.pedestal - f.design.Dc / 1000)
      // and the dowels rise out of it to lap the column
      const dowelTop = Math.max(...cage.runs.filter((r) => r.role === 'dowel')
        .map((r) => Math.max(...r.path.map((p) => p[1]))))
      expect(dowelTop).toBeGreaterThan(node.y - f.pedestal)
    }
  })

  it('runs the verticals PAST the top node where a column carries on, and not where it does not', () => {
    // A column bar does not stop at the floor — the storey above laps onto it
    // (§25.5.5), so the cage has to project that lap or it claims a splice with
    // nowhere to happen. At a roof there is nothing to lap and it stops.
    const yOf = (id: string) => {
      const m = memOf(id)
      return { lo: Math.min(nodeOf(m.i).y, nodeOf(m.j).y), hi: Math.max(nodeOf(m.i).y, nodeOf(m.j).y) }
    }
    const topOf = (id: string) => {
      const verts = cages.find((x) => x.member === id)!.runs.filter((r) => r.role === 'vertical')
      return Math.max(...verts.flatMap((r) => r.path.map((p) => p[1])))
    }
    const carriesOnAbove = (id: string) => {
      const m = memOf(id), hi = yOf(id).hi
      const node = nodeOf(m.i).y >= nodeOf(m.j).y ? m.i : m.j
      return model.members.some((o) => o.role === 'column' && o.id !== id
        && (o.i === node || o.j === node)
        && Math.max(nodeOf(o.i).y, nodeOf(o.j).y) > hi + 1e-6)
    }
    let spliced = 0, capped = 0
    for (const c of design.columns) {
      const { hi } = yOf(c.id)
      if (carriesOnAbove(c.id)) { expect(topOf(c.id)).toBeGreaterThan(hi + 0.29); spliced++ }
      else {
        // A roof column laps onto nothing, so it does not run on into a
        // splice — it turns its bars in JUST BELOW the node, under the top
        // steel of the beams framing in, since the node is the top of the beam
        // and there is no concrete above it to hook into.
        expect(topOf(c.id)).toBeLessThan(hi - 1e-9)
        expect(topOf(c.id)).toBeGreaterThan(hi - 0.2)
        capped++
      }
    }
    expect(capped).toBeGreaterThan(0)          // the model does have roof columns
    expect(spliced + capped).toBe(design.columns.length)
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
      // A bar too long for a stock length comes back as lapped pieces, so the
      // hooks are counted across the whole bar rather than on one run.
      expect(throughPieces(cage, `${b.id}-T1`).length).toBeGreaterThan(0)
      expect(hooksOn(cage, `${b.id}-T1`)).toBe(expectedHooks)
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
      .map((c) => hooksOn(c, `${c.member}-T1`))
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

  it('builds the column the P–M check actually checked', () => {
    // The point of the whole rebar model: one truth. The design chooses a bar
    // count the cage can place, so the count checked, the count drawn and the
    // count billed are the same number. Before, the check ran on 9 while the
    // cage placed 10 — conservative, but three engines describing three
    // different columns.
    for (const c of design.columns) {
      const cage = cages.find((x) => x.member === c.id)!
      const placed = cage.runs.filter((r) => r.role === 'vertical').length
      expect(placed).toBe(c.bars)
    }
  })

  it('never designs a column to a bar count that cannot be placed', () => {
    for (const c of design.columns) {
      expect(c.bars).toBeGreaterThanOrEqual(4)
      expect((c.bars - 4) % 2).toBe(0)          // four corners plus an even remainder
    }
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

describe('every cage says what kind of element it belongs to', () => {
  // Carried on the cage rather than re-derived from the mark, so a view can
  // hide one kind of steel without looking each mark back up in the model.
  it('tags beams, columns and footings', () => {
    const kinds = new Set(cages.map((c) => c.kind))
    expect(kinds.has('beam')).toBe(true)
    expect(kinds.has('column')).toBe(true)
    expect(kinds.has('footing')).toBe(true)
    expect(cages.every((c) => c.kind !== undefined)).toBe(true)
  })

  it('names the right one — a footing cage is marked for its node', () => {
    for (const f of design.footings) {
      const c = cages.find((x) => x.member === `F-${f.node}`) ?? cages.find((x) => x.member.includes(f.node))
      if (c) expect(c.kind).toBe('footing')
    }
  })
})

describe('a seismic frame gets a confined hinge zone, a gravity one does not', () => {
  /** The gaps between consecutive stirrups along the first beam, mm. */
  const hoopGaps = (system: 'gravity' | 'imf' | 'smf') => {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2, 3.2], section })
    m.loads = buildGravityLoads(m, 4.8, 2.4)
    const d = designStructure(m, soil, {}, { seismicSystem: system })!
    const row = d.beams[0]
    const cage = buildStructureCages(m, d).cages.find((c) => c.member === row.id)!
    const beam = m.members.find((x) => x.id === row.id)!
    const ni = m.nodes.find((n) => n.id === beam.i)!, nj = m.nodes.find((n) => n.id === beam.j)!
    const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z)
    const ux = (nj.x - ni.x) / L, uz = (nj.z - ni.z) / L
    const at = cage.runs.filter((r) => r.role === 'stirrup')
      .map((r) => (r.path[0][0] - ni.x) * ux + (r.path[0][2] - ni.z) * uz)
      .sort((p, q) => p - q)
    return { L, at, gaps: at.slice(1).map((v, k) => Math.round((v - at[k]) * 1000)) }
  }

  it('lays the 2h zone at the §418.6.4.4 spacing on an SMF, not the gravity maximum', () => {
    // The beam is lightly loaded, so shear alone is satisfied at d/2 = 220 and
    // says nothing about the hinge. Before the cap existed, `smf` produced a
    // layout identical to `gravity` — 220 mm through the plastic hinge, twice
    // what §418.6.4.4 allows.
    const g = hoopGaps('gravity'), s = hoopGaps('smf')
    const inZone = (r: ReturnType<typeof hoopGaps>) =>
      [...new Set(r.gaps.filter((_, k) => r.at[k] * 1000 < 2 * 500))]
    expect(inZone(g)).toEqual([220])
    expect(inZone(s)).toEqual([110])
    expect(s.at.length).toBeGreaterThan(g.at.length)   // and it costs hoops
  })

  it('does the same for an intermediate frame', () => {
    const r = hoopGaps('imf')
    expect([...new Set(r.gaps.filter((_, k) => r.at[k] * 1000 < 2 * 500))]).toEqual([110])
  })

  it('leaves a gravity frame’s quantities untouched', () => {
    // The cap applies to seismic systems only. A gravity frame must come out
    // of this change with exactly the hoops it had.
    expect(hoopGaps('gravity').at.length).toBe(35)
  })

  it('confines BOTH ends, not just the one the layout starts from', () => {
    const r = hoopGaps('smf')
    const far = r.gaps.filter((_, k) => (r.L - r.at[k]) * 1000 < 2 * 500)
    expect([...new Set(far)]).toEqual([110])
  })
})

describe('slab cages — the floor is no longer drawn bare', () => {
  // The module's frame carries no plates, so this needs its own: a 2 × 2 grid
  // of panels, which is what gives an interior support with a panel each side.
  const smodel = generateGridModel({ baysX: [6, 6], baysZ: [5, 5], storeyH: [3], section, slabThickness: 200 })
  smodel.loads = smodel.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  const sdesign = designStructure(smodel, soil as never)!
  const { cages: scages, unplaced: sunplaced } = buildStructureCages(smodel, sdesign)
  const slabOf = (plate: string) => scages.find((c) => c.member === plate)

  it('every designed panel gets one, placed on its own plate', () => {
    expect(sdesign.slabs.length).toBeGreaterThan(0)
    for (const s of sdesign.slabs) expect(slabOf(s.plate)).toBeDefined()
    expect(sunplaced.filter((u) => u.startsWith('slab@'))).toHaveLength(0)
  })

  it('the bars sit inside the panel they belong to', () => {
    for (const s of sdesign.slabs) {
      const pl = smodel.plates.find((p) => p.id === s.plate)!
      const ns = pl.corners.map((c) => smodel.nodes.find((n) => n.id === c)!)
      const x0 = Math.min(...ns.map((n) => n.x)), x1 = Math.max(...ns.map((n) => n.x))
      const z0 = Math.min(...ns.map((n) => n.z)), z1 = Math.max(...ns.map((n) => n.z))
      const y = ns[0].y, h = s.design.h / 1000
      for (const r of slabOf(s.plate)!.runs) for (const p of r.path) {
        // Laterally, only the support embedment and the top mat's run into the
        // next panel go past the edge, and never by more than a support.
        expect(p[0]).toBeGreaterThan(x0 - 0.5); expect(p[0]).toBeLessThan(x1 + 0.5)
        expect(p[2]).toBeGreaterThan(z0 - 0.5); expect(p[2]).toBeLessThan(z1 + 0.5)
        expect(p[1]).toBeLessThanOrEqual(y + 1e-9)
        expect(p[1]).toBeGreaterThanOrEqual(y - h - 1e-9)
      }
    }
  })

  it('an interior support carries ONE top mat, not one from each side', () => {
    // Each panel draws its half of the shared bar and stops at the centreline.
    // Run past it and the two panels' mats overlap the whole way across.
    const shared = 6                                    // the interior grid line, m
    const crossing = sdesign.slabs.flatMap((s) => slabOf(s.plate)!.runs)
      .filter((r) => r.role === 'top')
      .filter((r) => {
        const xs = r.path.map((p) => p[0])
        return Math.min(...xs) < shared - 1e-6 && Math.max(...xs) > shared + 1e-6
      })
    expect(crossing).toHaveLength(0)
  })

  it('tags every slab cage as a slab', () => {
    for (const sl of sdesign.slabs) expect(slabOf(sl.plate)!.kind).toBe('slab')
  })

  it('stops the bottom mat inside the beam it is anchored in', () => {
    // The reported defect: bars drawn outside the beam, on the side. The panel
    // edge is the beam's CENTRELINE, so a 300 mm beam leaves 150 mm — and the
    // bar has to stop a 20 mm cover short of that.
    const reach = 0.3 / 2 - 0.02
    for (const s of sdesign.slabs) {
      const pl = smodel.plates.find((p) => p.id === s.plate)!
      const ns = pl.corners.map((c) => smodel.nodes.find((n) => n.id === c)!)
      const x0 = Math.min(...ns.map((n) => n.x)), x1 = Math.max(...ns.map((n) => n.x))
      const z0 = Math.min(...ns.map((n) => n.z)), z1 = Math.max(...ns.map((n) => n.z))
      for (const r of slabOf(s.plate)!.runs) for (const p of r.path) {
        expect(p[0]).toBeGreaterThanOrEqual(x0 - reach - 1e-9)
        expect(p[0]).toBeLessThanOrEqual(x1 + reach + 1e-9)
        expect(p[2]).toBeGreaterThanOrEqual(z0 - reach - 1e-9)
        expect(p[2]).toBeLessThanOrEqual(z1 + reach + 1e-9)
      }
    }
  })

  it('laps a mat bar that will not come out of one stock bar', () => {
    // A 6 m panel plus two embedments is 6.26 m of bar, and a stock bar is 6 m:
    // drawn as one piece it is a bar nobody can buy. Beams and columns have
    // been spliced since `barSplice` landed; the slab mats were not.
    const runLen = (r: RebarCage['runs'][number]) => r.path.slice(1).reduce(
      (L, p, k) => L + Math.hypot(p[0] - r.path[k][0], p[1] - r.path[k][1], p[2] - r.path[k][2]), 0)
    const all = sdesign.slabs.flatMap((s) => slabOf(s.plate)!.runs)
    expect(all.every((r) => runLen(r) <= STOCK_BAR_LENGTH + 1e-6)).toBe(true)
    // …and the long ones really were cut, not just short by luck.
    expect(all.some((r) => r.role === 'bottom' && runLen(r) > STOCK_BAR_LENGTH * 0.5)).toBe(true)
  })

  it('the take-off does not bill them — it measures slabs from the DDM strips', () => {
    // Two sources for one quantity is how a bill starts disagreeing with a
    // drawing; the slab cage is for the view, and `takeoff` never asks for it.
    const q = estimateTakeoff(smodel, sdesign)
    const slabRows = q.byElement.filter((e) => e.kind === 'Slab')
    expect(slabRows.length).toBe(sdesign.slabs.length)
    expect(q.cutList.some((c) => c.mark === 'Chair')).toBe(false)
  })
})
