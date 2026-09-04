import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import {
  footingsForPlan, footingDetailBundles, slabOpeningBundles, wallDetailBundles, jointDetailBundles,
  elevationBundleByMember, beamSectionZones,
} from './planDetails'
import { buildStructureCages } from '../engine/cageBuilder'
import { projectPoint } from '../engine/rebarModel'
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
    expect(fs).toHaveLength(design.footings.length + design.combined.length)
    for (const f of fs) {
      expect(f.barDia).toBeGreaterThan(0)
      if (f.kind === 'combined') {
        expect(f.Bx).toBeGreaterThan(0)
        expect(f.By1).toBeGreaterThan(0)
        expect(f.By2).toBeGreaterThan(0)
        expect(f.nodes[0]).toBeTruthy()
        expect(f.nodes[1]).toBeTruthy()
      } else {
        expect(f.B).toBeGreaterThan(0)
        expect(f.node).toBeTruthy()
      }
    }
  })

  it('carries the combined pads too, and keeps the two sets disjoint', () => {
    // A combined pad was designed, checked, scheduled and costed — and then not
    // drawn, because the plan was only ever handed the isolated list.
    const fs = footingsForPlan(design)
    const nodes = new Set(fs.flatMap((f) => f.kind === 'combined' ? f.nodes : [f.node]))
    // no node is carried by two pads
    const all = fs.flatMap((f) => f.kind === 'combined' ? f.nodes : [f.node])
    expect(all).toHaveLength(nodes.size)
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

  it('bundles one detail PER JOINT, named for where the joint is', () => {
    const bundles = jointDetailBundles(model, design)
    // The 2×1-bay grid frames at one level, so every one of its six columns
    // has a joint at its top — six sheets, not the two the old dedupe by
    // "joint type" emitted.
    const framed = model.nodes.filter((n) => n.y > 0)
    expect(bundles).toHaveLength(framed.length)
    expect(new Set(bundles.map((b) => b.node)).size).toBe(bundles.length)
    expect(new Set(bundles.map((b) => b.mark)).size).toBe(bundles.length)
    for (const b of bundles) {
      // the mark is the position: grid line, then the elevation it sits at
      const at = model.nodes.find((n) => n.id === b.node)!
      expect(b.mark).toBe(`J-${b.grid}@${at.y.toFixed(2)}`)
      expect(b.grid).toMatch(/^[A-B][1-3]$/)
      expect(b.level).toBe('GROUND FLOOR')
    }
    // and the marks cover the framed grid itself, not an invented numbering
    expect(bundles.map((b) => b.grid).sort())
      .toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3'])
  })

  it('keeps a corner and an interior joint apart even on the same sections', () => {
    const bundles = jointDetailBundles(model, design)
    // Every column here is the same 400×400 carrying the same beams, so the
    // old key deduplicated these two into one "typical" sheet — but a joint
    // with two beams and one with three are different details (Table 418.8.4.3
    // confines them differently, and §418.8.2.2/.2.3 anchor their bars
    // differently), and only one of them could ever have been drawn.
    const corner = bundles.find((b) => b.grid === 'A1')!
    const edge = bundles.find((b) => b.grid === 'A2')!
    expect(corner.detail.colB).toBe(edge.detail.colB)
    expect(corner.detail.beamB).toBe(edge.detail.beamB)
    expect(corner.detail.confinement).not.toBe(edge.detail.confinement)
  })

  it('tells the sheet which faces are framed, and whether a column is above', () => {
    const beamsAt = (id: string) => model.members
      .filter((m) => (m.role === 'beam' || m.role === 'girder') && (m.i === id || m.j === id)).length
    for (const b of jointDetailBundles(model, design)) {
      const f = b.detail.framedFaces!
      // the near beam is the one the section is cut along; every OTHER beam
      // arriving has to land on a drawn face, or the sheet is drawing a joint
      // the frame does not have
      expect([f.far, f.spandrelPos, f.spandrelNeg].filter(Boolean)).toHaveLength(beamsAt(b.node) - 1)
      // one storey: every joint here is a roof joint, so no column continues up
      expect(b.detail.columnAbove).toBe(false)
    }
  })

  it('takes the column depth PARALLEL to the beam, not the section\'s h', () => {
    // `columnCage` lays a section out with h across x and b across z, so which
    // dimension is the joint's DEPTH depends on which way the beam runs — and
    // §418.8.2.3 (20db of depth parallel to the bars passing through) and
    // §418.8.4.3 (Aj = bj·h) both ask for it in the beam's frame. Taken as h
    // regardless, a 300×500 column under a beam running along z was checked on
    // 500 mm of depth it does not have that way, and drawn 500 wide when it is
    // 300 — passing a §418.8.2.3 check it fails.
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    // a DEEPER girder in the z direction, so the lead beam at every joint runs
    // that way and the two dimensions have to swap
    const deep: RectSection = { ...section, id: 'sZ', name: 'G-deep', h: 700 }
    m.sections = [...m.sections, deep]
    const nodeAt = new Map(m.nodes.map((n) => [n.id, n]))
    for (const mem of m.members) {
      if (mem.role !== 'beam' && mem.role !== 'girder') continue
      const a = nodeAt.get(mem.i)!, b = nodeAt.get(mem.j)!
      if (Math.abs(b.z - a.z) > Math.abs(b.x - a.x)) mem.section = 'sZ'
    }
    m.loads = m.plates.flatMap((p): ModelLoad[] => [
      { kind: 'area', plate: p.id, q: 4.0, cat: 'D' },
      { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
    ])
    const d = designStructure(m, soil)!
    const bundles = jointDetailBundles(m, d)
    expect(bundles.length).toBeGreaterThan(0)
    for (const b of bundles) {
      // every lead beam here runs along z, so the depth is the section's b
      expect(b.detail.beamH).toBe(deep.h)
      expect(b.detail.colH).toBe(section.b)          // 300 along the beam
      expect(b.detail.colB).toBe(section.h)          // 500 across it
    }
    // and the x-running case is unchanged — same section, lead along x
    for (const b of jointDetailBundles(model, design)) {
      expect(b.detail.colH).toBe(section.h)
      expect(b.detail.colB).toBe(section.b)
    }
  })

  it('carries geometry off the two sections that meet', () => {
    const bundles = jointDetailBundles(model, design)
    expect(bundles.length).toBeGreaterThan(0)
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


describe('the elevation a schedule row belongs to', () => {
  const { model, design } = designed()
  const { cages } = buildStructureCages(model, design)
  const index = elevationBundleByMember(model, design, cages)

  it('gives every designed beam a sheet', () => {
    for (const b of design.beams) expect(index.get(b.id)).toBeDefined()
  })

  it('indexes beams only — a column is on two sheets, so naming one is a guess', () => {
    // A column is carried half a storey below the level and half a storey
    // above it, so it appears as context on the sheets either side. Answering
    // "which sheet is this column's" with either would be a coin toss.
    for (const c of design.columns) expect(index.get(c.id)).toBeUndefined()
  })

  it('puts the beam it indexes on the sheet it points at', () => {
    for (const b of design.beams.slice(0, 6)) {
      const bundle = index.get(b.id)!
      expect(bundle.input.members.some((m) => m.mark === b.id && m.role === 'beam')).toBe(true)
    }
  })
})

describe('beamSectionZones — where a row’s section sits on its elevation', () => {
  const { model, design } = designed()
  const { cages } = buildStructureCages(model, design)
  const index = elevationBundleByMember(model, design, cages)

  it('lands inside the beam’s own stretch of the sheet, in the sheet’s own u', () => {
    for (const b of design.beams.slice(0, 8)) {
      const bundle = index.get(b.id)!
      const el = bundle.input.members.find((m) => m.mark === b.id)!
      const zones = beamSectionZones(model, bundle, b.id, b.sections.map((s) => s.x))!
      expect(zones).toHaveLength(b.sections.length)
      for (const [a, z] of zones) {
        expect(a).toBeGreaterThanOrEqual(Math.min(el.u0, el.u1) - 1e-6)
        expect(z).toBeLessThanOrEqual(Math.max(el.u0, el.u1) + 1e-6)
        expect(z).toBeGreaterThan(a)
      }
    }
  })

  it('covers the whole span between them, with no gap and no overlap', () => {
    const b = design.beams[0]!
    const bundle = index.get(b.id)!
    const zones = beamSectionZones(model, bundle, b.id, b.sections.map((s) => s.x))!
    const sorted = [...zones].sort((p, q) => p[0] - q[0])
    for (let k = 1; k < sorted.length; k++) expect(sorted[k][0]).toBeCloseTo(sorted[k - 1][1], 9)
  })

  it('attaches End i to the i-node’s END of the sheet, whichever way the beam runs', () => {
    // The station is measured from the i-node along the BEAM; u runs along the
    // GRID LINE. A beam modelled j→i has its End i at the right of the sheet,
    // and reading the station as a distance from the left edge would wash the
    // wrong support.
    for (const b of design.beams.slice(0, 8)) {
      const m = model.members.find((x) => x.id === b.id)!
      const ni = model.nodes.find((n) => n.id === m.i)!
      const bundle = index.get(b.id)!
      const uI = projectPoint([ni.x, ni.y, ni.z], bundle.input.plane)[0]
      const zones = beamSectionZones(model, bundle, b.id, b.sections.map((s) => s.x))!
      const endI = b.sections.findIndex((s) => s.x === 0)
      if (endI < 0) continue
      const [a, z] = zones[endI]!
      expect(uI).toBeGreaterThanOrEqual(a - 1e-6)
      expect(uI).toBeLessThanOrEqual(z + 1e-6)
    }
  })

  it('is null for a member the model does not have', () => {
    const bundle = index.get(design.beams[0]!.id)!
    expect(beamSectionZones(model, bundle, 'nope', [0, 3, 6])).toBeNull()
  })
})
