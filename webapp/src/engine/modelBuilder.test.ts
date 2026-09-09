import { describe, it, expect } from 'vitest'
import {
  generateGridModel, removeElements, nodeId, buildGravityLoads,
  enforceSectionHierarchy, barContinuityGroups, refreshSelfWeight,
  memberWeightPerLength, sectionArea, sectionGamma, GAMMA_C, GAMMA_S,
} from './modelBuilder'
import { storeyWeightBreakdown } from './seismic'
import { memberMassPerLength, GRAVITY } from './modal'
import { shapeByName } from './aiscSections'
import { woodUnitWeight } from './woodDesign'
import type { RectSection } from './model'

const sec: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

describe('wall self-weight as a beam line load', () => {
  it('adds a member-udl D of t·h·γc on the wall’s member', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: sec })
    const beam = m.members.find((x) => x.role === 'beam')!
    m.walls = [{ id: 'w0', member: beam.id, height: 3, thickness: 150, shearWall: false }]
    const loads = buildGravityLoads(m, 0, 0)
    const wall = loads.filter((l) => l.kind === 'member-udl' && l.member === beam.id && l.cat === 'D')
    // beam self-weight (0.3·0.5·24 = 3.6) + wall (0.15·3·24 = 10.8)
    const total = wall.reduce((s, l) => s + (l as { w: number }).w, 0)
    expect(total).toBeCloseTo(0.3 * 0.5 * 24 + 0.15 * 3 * 24, 6)
    expect(wall.some((l) => Math.abs((l as { w: number }).w - 10.8) < 1e-6)).toBe(true)  // the wall udl
    expect(wall).toHaveLength(2)   // beam self-weight + wall
  })
})

describe('grid model generator', () => {
  // 2 bays × 1 bay × 2 storeys → 3×2 grid points, 3 levels
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: sec })

  it('node / member / plate / support counts', () => {
    expect(m.nodes).toHaveLength(3 * 2 * 3)                  // 18
    expect(m.members.filter((x) => x.role === 'column')).toHaveLength(6 * 2)   // grid pts × storeys
    expect(m.members.filter((x) => x.role === 'beam')).toHaveLength(2 * 2 * 2) // baysX × nz × levels
    expect(m.members.filter((x) => x.role === 'girder')).toHaveLength(3 * 1 * 2)
    expect(m.plates).toHaveLength(2 * 1 * 2)
    expect(m.supports).toHaveLength(6)
    expect(m.supports.every((s) => s.fixity === 'fixed')).toBe(true)
    expect(m.storeys.map((s) => s.elevation)).toEqual([3.5, 6.5])
  })

  it('connectivity: every member endpoint and plate corner is a real node', () => {
    const ids = new Set(m.nodes.map((n) => n.id))
    expect(m.members.every((x) => ids.has(x.i) && ids.has(x.j))).toBe(true)
    expect(m.plates.every((p) => p.corners.every((c) => ids.has(c)))).toBe(true)
  })

  it('geometry: columns are vertical, beams along x, girders along z', () => {
    const byId = new Map(m.nodes.map((n) => [n.id, n]))
    for (const mb of m.members) {
      const a = byId.get(mb.i)!, b2 = byId.get(mb.j)!
      if (mb.role === 'column') { expect(a.x).toBe(b2.x); expect(a.z).toBe(b2.z); expect(b2.y).toBeGreaterThan(a.y) }
      if (mb.role === 'beam') { expect(a.y).toBe(b2.y); expect(a.z).toBe(b2.z); expect(b2.x).toBeGreaterThan(a.x) }
      if (mb.role === 'girder') { expect(a.y).toBe(b2.y); expect(a.x).toBe(b2.x); expect(b2.z).toBeGreaterThan(a.z) }
    }
  })

  it('JSON round-trips', () => {
    const back = JSON.parse(JSON.stringify(m))
    expect(back).toEqual(m)
  })
})

describe('removeElements', () => {
  it('drops members/plates and their attached loads, keeps the rest', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: sec })
    const slab = m.plates[0].id
    const beam = m.members.find((x) => x.role === 'beam')!.id
    const withLoads = {
      ...m,
      loads: [
        { kind: 'area' as const, plate: slab, q: 4.8, cat: 'D' as const },
        { kind: 'member-udl' as const, member: beam, w: 10, cat: 'D' as const },
        { kind: 'node' as const, node: nodeId(0, 0, 1), Fx: 20, cat: 'W' as const },
      ],
    }
    const out = removeElements(withLoads, new Set([slab, beam]))
    expect(out.plates.find((p) => p.id === slab)).toBeUndefined()
    expect(out.members.find((x) => x.id === beam)).toBeUndefined()
    expect(out.loads).toHaveLength(1)
    expect(out.loads[0].kind).toBe('node')
    // untouched collections preserved
    expect(out.nodes).toEqual(m.nodes)
    expect(out.supports).toEqual(m.supports)
  })
})

describe('enforceSectionHierarchy — column-stack continuity', () => {
  const rc = (id: string, b: number, h: number): RectSection =>
    ({ id, name: `${b}×${h}`, b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 })

  it('a bigger LOWER column leaves the smaller upper one alone (upper ≤ lower is fine)', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 300) })
    const lower = m.sections.find((s) => s.id === 'c0.0.0')!
    lower.b = 400; lower.h = 450
    const out = enforceSectionHierarchy(m)
    const up = out.sections.find((s) => s.id === 'c0.0.1')!
    expect(up.b).toBe(300)     // stays smaller — economical and code-of-practice
    expect(up.h).toBe(300)
  })

  it('a bigger UPPER column raises the one below (a column is never larger than the one under it)', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 300) })
    const upper = m.sections.find((s) => s.id === 'c0.0.1')!
    upper.b = 400; upper.h = 450
    const out = enforceSectionHierarchy(m)
    const low = out.sections.find((s) => s.id === 'c0.0.0')!
    expect(low.b).toBeGreaterThanOrEqual(400)
    expect(low.h).toBeGreaterThanOrEqual(450)
    // a different stack is untouched
    expect(out.sections.find((s) => s.id === 'c1.0.0')!.b).toBe(300)
  })

  it('steel: a heavier shape ABOVE pulls the lower segment up; heavier BELOW leaves the top light', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 300) })
    for (const s of m.sections) Object.assign(s, { material: 'steel', shape: 'W310x38.7', steelFy: 345, steelFu: 448 })
    m.sections.find((s) => s.id === 'c0.0.1')!.shape = 'W310x97'   // heavy on top
    m.sections.find((s) => s.id === 'c1.0.0')!.shape = 'W310x97'   // heavy at bottom
    const out = enforceSectionHierarchy(m)
    expect(out.sections.find((s) => s.id === 'c0.0.0')!.shape).toBe('W310x97')   // raised
    expect(out.sections.find((s) => s.id === 'c1.0.1')!.shape).toBe('W310x38.7') // stays light
  })

  it('is idempotent', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 300) })
    m.sections.find((s) => s.id === 'c0.0.0')!.h = 500
    const once = enforceSectionHierarchy(m)
    const twice = enforceSectionHierarchy(once)
    expect(JSON.stringify(twice.sections)).toBe(JSON.stringify(once.sections))
  })
})


describe('barContinuityGroups — one bar Ø per beam run / column stack', () => {
  const rc = (id: string, b: number, h: number): RectSection =>
    ({ id, name: `${b}×${h}`, b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 })

  it('collinear beam spans through a joint form one run; girders form their own', () => {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section: rc('S', 300, 500) })
    const groups = barContinuityGroups(m)
    // the two X-spans on each Z-line are collinear through the middle column
    const bxRun = groups.find((g) => g.includes('bx0.0.1') && g.includes('bx1.0.1'))
    expect(bxRun).toBeTruthy()
    // a girder never joins a perpendicular beam run
    expect(bxRun!.some((id) => id.startsWith('bz'))).toBe(false)
  })

  it('column segments on one plan position form a stack group', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 500) })
    const groups = barContinuityGroups(m)
    const stack = groups.find((g) => g.includes('c0.0.0') && g.includes('c0.0.1'))
    expect(stack).toBeTruthy()
    expect(stack!.every((id) => id.startsWith('c0.0.'))).toBe(true)
  })

  it('steel members are excluded (bar diameters are an RC concern)', () => {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section: rc('S', 300, 500) })
    m.sections = m.sections.map((s) => ({ ...s, material: 'steel' as const, shape: 'W310x79' }))
    expect(barContinuityGroups(m)).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// WHAT DOES A MEMBER WEIGH? There were FOUR answers.
//
// `buildGravityLoads`, `refreshSelfWeight`, `seismic.storeyWeightsFull` and
// `modal.memberMassPerLength` each computed it independently, and each knew
// about a different subset of the materials. Measured before the fix, on the
// grid below:
//
//   path                   concrete  steel W310x52  wood DFL-2
//   buildGravityLoads      ok        ×2.44          ok
//   refreshSelfWeight      ok        ok             ok      ← the only whole one
//   storeyWeightsFull      ok        ×2.44          ×4.89
//   memberMassPerLength    ok        ok             ×4.89
//
// So the SAME model reported two different self-weights depending on whether
// `refreshSelfWeight` had run, and a timber frame's seismic weight was the
// concrete building's — `storeyWeightsFull` had no material branch at all.
//
// Nothing caught it because no test in the suite asserted the weight of a
// steel or a timber member: the one self-weight assertion above this block is
// 0.3 × 0.5 × 24, concrete. These are the missing tests.
// ─────────────────────────────────────────────────────────────────────────
describe('member self-weight — one answer, four call sites', () => {
  const W310 = shapeByName('W310x52')!
  const concrete: RectSection = { ...sec }
  // The section's b×h is the shape's own bounding box, so the difference
  // measured is the catalogue area rule and nothing else.
  const steel: RectSection = { ...sec, b: W310.bf!, h: W310.d!, material: 'steel', shape: 'W310x52' }
  const wood: RectSection = { ...sec, material: 'wood', woodSpecies: 'DFL-2' }

  const trueW = {
    concrete: 0.300 * 0.500 * GAMMA_C,              // 3.6000 kN/m
    steel: (W310.A / 1e6) * GAMMA_S,                // 0.5205 kN/m
    wood: 0.300 * 0.500 * woodUnitWeight(0.50),     // 0.7358 kN/m
  }

  it('a rolled shape weighs its catalogue area, not its bounding box', () => {
    // The box is eight times the steel that is actually there.
    expect(sectionArea(steel)).toBeCloseTo(W310.A / 1e6, 9)
    expect((steel.b / 1000) * (steel.h / 1000) / sectionArea(steel)).toBeGreaterThan(7)
    expect(sectionGamma(steel)).toBe(GAMMA_S)
    expect(memberWeightPerLength(steel)).toBeCloseTo(trueW.steel, 6)
  })

  it('timber weighs G·9.81, not the concrete unit weight', () => {
    expect(sectionGamma(wood)).toBeCloseTo(woodUnitWeight(0.50), 6)
    expect(memberWeightPerLength(wood)).toBeCloseTo(trueW.wood, 6)
    // The ratio that made a timber frame's modal mass ~5× its real one.
    expect(GAMMA_C / sectionGamma(wood)).toBeCloseTo(4.89, 2)
  })

  it('concrete still honours the caller’s γc override', () => {
    expect(memberWeightPerLength(concrete)).toBeCloseTo(trueW.concrete, 6)
    expect(memberWeightPerLength(concrete, 25)).toBeCloseTo(0.3 * 0.5 * 25, 6)
    // …and the override must NOT reach a material that has its own density.
    expect(memberWeightPerLength(steel, 25)).toBeCloseTo(trueW.steel, 6)
    expect(memberWeightPerLength(wood, 25)).toBeCloseTo(trueW.wood, 6)
  })

  describe.each([
    ['concrete', concrete, trueW.concrete],
    ['steel', steel, trueW.steel],
    ['wood', wood, trueW.wood],
  ])('a %s frame', (_name, section, w) => {
    const build = () => {
      const m = generateGridModel({ baysX: [5], baysZ: [4], storeyH: [3], section })
      return { ...m, loads: buildGravityLoads(m, 0, 0) }
    }
    const swOf = (m: ReturnType<typeof build>) =>
      (m.loads.find((l) => l.kind === 'member-udl' && l.sw) as { w: number } | undefined)?.w ?? 0

    it('reports the same self-weight from every path, and it is the right one', () => {
      const m = build()
      // 1 — the load the model is created with
      expect(swOf(m)).toBeCloseTo(w, 6)
      // 2 — and after a section edit re-derives it. These two disagreed for
      //     steel, so the number changed under the user without an edit to it.
      expect(swOf(refreshSelfWeight(m))).toBeCloseTo(w, 6)
      // 3 — the seismic storey weight built from the same members.
      //     The grid's roof is a full perimeter (2×5 + 2×4 = 18 m of beam),
      //     and each of the four 3 m columns gives half its weight to the
      //     level above; the ground half goes to the foundation, not to W.
      //     So 18 + 12/2 = 24 m of member length is counted.
      const beamLen = 2 * 5 + 2 * 4
      const colLen = 4 * 3
      const swTotal = storeyWeightBreakdown(m).reduce((s, r) => s + r.selfWeight, 0)
      expect(swTotal).toBeCloseTo(w * (beamLen + colLen / 2), 4)
      // 4 — the modal mass, which is that weight over g
      expect(memberMassPerLength(section)).toBeCloseTo(w / GRAVITY, 9)
    })
  })
})
