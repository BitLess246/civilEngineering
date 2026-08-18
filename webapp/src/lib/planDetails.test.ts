import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { footingsForPlan, footingDetailBundles, slabOpeningBundles, wallDetailBundles, jointDetailBundles } from './planDetails'
import { designSlabOpening } from '../engine/slabOpening'
import { designWallDetail } from '../engine/wallDetail'
import { designBeamColumnJoint } from '../engine/beamColumnJoint'
import type { RectSection, ModelLoad } from '../engine/model'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function designed(withOpening = false) {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  m.loads = m.plates.flatMap((p): ModelLoad[] => [
    { kind: 'area', plate: p.id, q: 4.0, cat: 'D' },
    { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
  ])
  // a stair void in the first panel, clear of both column strips
  if (withOpening) m.plates[0].openings = [{ id: 'O1', kind: 'rect', x: 2.0, y: 1.8, w: 1.0, h: 0.8 }]
  return { model: m, design: designStructure(m, soil)! }
}

describe('planDetails — design → plan/detail inputs', () => {
  const { model, design } = designed()

  it('takes the bar Ø from the schedule row rather than recovering it', () => {
    // There used to be a `recoverBarDia` here that inverted As/count back to a
    // standard size, because the row did not carry the diameter. It does now,
    // and the plan quotes it directly — an inversion cannot be wrong about a
    // number it is no longer computing.
    const fs = footingsForPlan(design)
    for (const [i, f] of fs.entries()) {
      expect(f.barDia).toBe(design.footings[i].barDia)
      // and the area it reports is consistent with that bar and that count
      const Ab = (Math.PI / 4) * f.barDia * f.barDia
      expect(f.bars * Ab).toBeGreaterThanOrEqual(design.footings[i].design.steelArea - 1e-6)
    }
  })

  it('maps every designed footing to a PlanFooting with its own bar Ø', () => {
    const fs = footingsForPlan(design)
    expect(fs).toHaveLength(design.footings.length)
    for (const f of fs) {
      expect(f.B).toBeGreaterThan(0)
      expect(f.barDia).toBeGreaterThan(0)
      expect(f.node).toBeTruthy()
    }
  })

  it('bundles one detail per distinct footing type, marked WF-n', () => {
    const b = footingDetailBundles(model, design, soil)
    const distinct = new Set(design.footings.map((r) => `${Math.round(r.design.B * 1000)}x${Math.round(r.design.Dc)}`))
    expect(b).toHaveLength(distinct.size)
    expect(b.map((x) => x.mark)).toEqual(b.map((_, i) => `WF-${i + 1}`))
  })

  it('each bundle carries a valid footing detail + a tied-column section from the model', () => {
    const [b0] = footingDetailBundles(model, design, soil)
    expect(b0.detail.B).toBeGreaterThan(0)
    expect(b0.detail.H).toBeGreaterThan(0)
    expect(b0.detail.foundingElev).toBe(-1.5)             // top of footing at embedment depth
    expect(b0.detail.colB).toBe(section.b)                // column size from the model section
    expect(b0.column.shape).toBe('tied')
    expect(b0.column.b).toBe(section.b)
    expect(b0.column.bars).toBeGreaterThanOrEqual(4)
  })
})

describe('planDetails — slab opening trimmers', () => {
  it('bundles nothing when no panel has an opening', () => {
    const { model, design } = designed()
    expect(slabOpeningBundles(model, design)).toHaveLength(0)
  })

  it('bundles one detail per opening, off the DESIGNED mat of its own panel', () => {
    const { model, design } = designed(true)
    const bundles = slabOpeningBundles(model, design)
    expect(bundles).toHaveLength(1)
    const [b] = bundles
    expect(b.plate).toBe(model.plates[0].id)
    expect(b.opening).toBe('O1')
    expect(b.mark).toBe('S1/O1')

    const row = design.slabs.find((s) => s.plate === b.plate)!
    // panel geometry and mat come from the pipeline, not from a guess
    expect(b.detail.lx).toBeCloseTo(row.lx, 9)
    expect(b.detail.ly).toBeCloseTo(row.ly, 9)
    expect(b.detail.h).toBeCloseTo(row.design.h, 9)
    expect(b.detail.barDia).toBe(row.barDia)
    expect(b.detail.fc).toBe(section.fc)
    expect(b.detail.fy).toBe(section.fy)

    // the spacing detailed is the TIGHTEST the panel was designed for, so the
    // replacement can never be short of what the hole actually cut
    const everySpacing = (d: typeof row.design.x) =>
      d.locations.flatMap((l) => [l.column.spacing, l.middle.spacing])
    expect(b.detail.spacingX).toBeCloseTo(Math.min(...everySpacing(row.design.x)), 9)
    expect(b.detail.spacingY).toBeCloseTo(Math.min(...everySpacing(row.design.y)), 9)
  })

  it('the bundled input designs into a usable trimmer detail', () => {
    const { model, design } = designed(true)
    const r = designSlabOpening(slabOpeningBundles(model, design)[0].detail)
    expect(r.x.interrupted).toBeGreaterThan(0)
    expect(r.y.interrupted).toBeGreaterThan(0)
    expect(2 * r.x.eachSide).toBeGreaterThanOrEqual(r.x.interrupted)
    expect(2 * r.y.eachSide).toBeGreaterThanOrEqual(r.y.interrupted)
    expect(r.x.ld).toBeGreaterThanOrEqual(300)          // §425.4.2.3 floor
    expect(r.strip.zone).toBe('middle-middle')          // where it was placed
    expect(r.ok).toBe(true)
  })
})

describe('planDetails — wall standard details', () => {
  function withWalls() {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    m.loads = m.plates.flatMap((p): ModelLoad[] => [
      { kind: 'area', plate: p.id, q: 4.0, cat: 'D' },
      { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
    ])
    m.walls = [
      { id: 'w0', member: m.members.find((x) => x.role === 'beam')!.id, height: 3, thickness: 200, shearWall: true },
    ]
    return { model: m, design: designStructure(m, soil)! }
  }

  it('bundles nothing when the model has no shear walls', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    m.loads = m.plates.flatMap((p): ModelLoad[] => [{ kind: 'area', plate: p.id, q: 4, cat: 'D' }])
    expect(wallDetailBundles(designStructure(m, soil)!)).toHaveLength(0)
  })

  it('bundles one set of details per wall type, off the DESIGNED curtains', () => {
    const { design } = withWalls()
    expect(design.walls.length).toBeGreaterThan(0)
    const bundles = wallDetailBundles(design)
    expect(bundles).toHaveLength(1)
    const [b] = bundles
    const row = design.walls[0]

    expect(b.mark).toBe('W1')
    expect(b.wall).toBe(row.id)
    expect(b.detail.t).toBe(row.thickness)
    expect(b.detail.barDia).toBe(row.barDia)         // carried on the row, not guessed
    expect(b.detail.fc).toBe(section.fc)
    expect(b.detail.fy).toBe(section.fy)
    expect(b.detail.spacing).toBe(Math.round(row.design.horiz.spacing))
    expect(b.detail.vertSpacing).toBe(Math.round(row.design.vert.spacing))
    // the joint carries the web's own shear across the same length
    expect(b.detail.Vu).toBe(row.Vu)
    expect(b.detail.lw).toBe(row.lw)
  })

  it('the bundled input designs into a usable wall detail', () => {
    const { design } = withWalls()
    const r = designWallDetail(wallDetailBundles(design)[0].detail)
    expect(r.curtains).toBe(1)                        // 200 mm wall
    expect(r.sMax).toBe(450)
    expect(r.lapB).toBeGreaterThanOrEqual(300)        // §425.5.2 floor
    expect(r.ldh).toBeGreaterThanOrEqual(150)         // §425.4.3 floor
    expect(r.joint).toBeDefined()
    expect(r.joint!.mu).toBe(1.0)
  })
})

describe('planDetails — beam–column joints', () => {
  const { model, design } = designed()

  it('bundles one joint per distinct beam-into-column type', () => {
    const bundles = jointDetailBundles(model, design)
    expect(bundles.length).toBeGreaterThan(0)
    expect(new Set(bundles.map((b) => b.mark)).size).toBe(bundles.length)
    for (const b of bundles) {
      // geometry off the two sections that meet, not invented
      expect(b.detail.colB).toBe(section.b)
      expect(b.detail.colH).toBe(section.h)
      expect(b.detail.beamBarDia).toBeGreaterThan(0)
      expect(b.detail.topBars).toBeGreaterThanOrEqual(2)
      expect(b.detail.botBars).toBeGreaterThanOrEqual(2)
      expect(b.detail.fc).toBe(section.fc)
      expect(model.nodes.some((n) => n.id === b.node)).toBe(true)
    }
  })

  it('classifies the confinement from the beams that actually arrive', () => {
    const bundles = jointDetailBundles(model, design)
    // The 2×1-bay grid has corner nodes (2 beams at right angles → 'other'),
    // edge nodes (3 beams) and one interior node (4 beams).
    const classes = new Set(bundles.map((b) => b.detail.confinement))
    expect(classes.size).toBeGreaterThan(1)
    expect([...classes].every((c) =>
      ['four-faces', 'three-faces', 'two-opposite', 'other'].includes(c!))).toBe(true)
  })

  it('does NOT take the §418.8.2.1 column-shear credit the schedule cannot confirm', () => {
    for (const b of jointDetailBundles(model, design)) expect(b.detail.Vcol).toBeUndefined()
  })

  it('the bundled input designs into a usable joint check', () => {
    const r = designBeamColumnJoint(jointDetailBundles(model, design)[0].detail)
    expect(r.Aj).toBeGreaterThan(0)
    expect(r.phiVn).toBeGreaterThan(0)
    expect(r.Vu).toBeGreaterThan(0)
    // §418.8.2.3 is asked per direction, of bars that pass THROUGH — never of
    // the hooked bars merely because they are large.
    expect(r.through.main.applies).toBe(!!jointDetailBundles(model, design)[0].detail.barsThrough)
    expect(r.ldh).toBeGreaterThanOrEqual(150)
  })
})
