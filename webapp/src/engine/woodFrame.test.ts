import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads, plateSelfWeightKpa } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { designStructure, optimizeStructure } from './pipeline'
import { estimateTakeoff } from './takeoff'
import { nonlinearNotApplicable, plasticMoment, axialCapacity, runPushoverModel } from './pushoverModel'
import { runBiaxialPushover } from './biaxialFrameModel'
import { runNonlinearFrameModel } from './nonlinearFrameModel'
import { runNonlinearModel } from './nonlinearModel'
import { validateMesh } from './meshValidation'
import { WOOD_SPECIES } from './woodDesign'
import { isStockSawn, GLULAM_ID, GLULAM_WIDTHS, GLULAM_LAM, TIMBER_FLOOR_SDL } from './timberStock'
import { emptyModel, type RectSection, type StructuralModel } from './model'

const woodSec = (id: string, b: number, h: number): RectSection => ({
  id, name: `${b}×${h}`, b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
  material: 'wood', woodSpecies: 'DFL-1', woodKind: 'sawn',
})
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function woodModel(): StructuralModel {
  const m = generateGridModel({
    baysX: [6], baysZ: [5], storeyH: [3],
    column: woodSec('C', 300, 300), girder: woodSec('G', 300, 450), beam: woodSec('B', 250, 400),
    slabThickness: 200,
  })
  m.loads = buildGravityLoads(m, 4.8, 2.4)
  return m
}

describe('bridge — timber member stiffness', () => {
  it('uses the species mean E and G = E/16 (not the concrete √f′c law)', () => {
    const model: StructuralModel = {
      ...emptyModel('t'),
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }],
      sections: [woodSec('S', 200, 400)],
      members: [{ id: 'm', i: 'a', j: 'b', role: 'beam', section: 'S' }],
      supports: [{ node: 'a', fixity: 'fixed' }],
    }
    const br = modelToFrame3D(model)
    const m = br.members.find((x) => x.id === 'm')!
    expect(m.E).toBeCloseTo(WOOD_SPECIES['DFL-1'].ref.E, 3)
    expect(m.G).toBeCloseTo(WOOD_SPECIES['DFL-1'].ref.E / 16, 3)
    expect(m.E).toBeLessThan(4700 * Math.sqrt(28))   // far softer than concrete Ec
  })
})

describe('bridge — custom material (woodRef on the section)', () => {
  it('uses an explicit woodRef even with no library species (custom material travels with the model)', () => {
    const customRef = { Fb: 30, Ft: 20, Fv: 4, FcPerp: 8, Fc: 18, E: 16500, Emin: 5800, G: 0.85 }
    const sec: RectSection = { id: 'S', name: '200×400', b: 200, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'wood', woodRef: customRef }
    const model: StructuralModel = {
      ...emptyModel('t'),
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }],
      sections: [sec], members: [{ id: 'm', i: 'a', j: 'b', role: 'beam', section: 'S' }],
      supports: [{ node: 'a', fixity: 'fixed' }],
    }
    const m = modelToFrame3D(model).members.find((x) => x.id === 'm')!
    expect(m.E).toBeCloseTo(customRef.E, 3)      // the custom E, not a library value
    expect(m.G).toBeCloseTo(customRef.E / 16, 3)
  })
})

describe('self-weight — timber density', () => {
  it('a wood member self-weight uses γ ≈ G·9.81, much lighter than concrete', () => {
    const model = woodModel()
    const memberUdl = model.loads.find((l) => l.kind === 'member-udl' && l.cat === 'D') as { w: number; member: string } | undefined
    expect(memberUdl).toBeTruthy()
    const sec = model.sections.find((s) => s.id === model.members.find((mm) => mm.id === memberUdl!.member)!.section)!
    const gammaWood = WOOD_SPECIES['DFL-1'].ref.G * 9.81
    expect(memberUdl!.w).toBeCloseTo((sec.b / 1000) * (sec.h / 1000) * gammaWood, 4)
    expect(gammaWood).toBeLessThan(24)               // lighter than concrete γc
  })
})

describe('pipeline — timber frame design', () => {
  const design = designStructure(woodModel(), soil)!

  it('routes members to the timber schedules, not the concrete ones', () => {
    expect(design.woodBeams.length).toBeGreaterThan(0)
    expect(design.woodColumns.length).toBeGreaterThan(0)
    expect(design.beams.length).toBe(0)              // no RC members
    expect(design.columns.length).toBe(0)
    expect(design.steelBeams.length).toBe(0)
  })

  it('counts timber volume and excludes it from the concrete member total', () => {
    expect(design.totals.woodVolume).toBeGreaterThan(0)
    expect(design.totals.concreteMembers).toBe(0)    // wood not miscounted as concrete
    expect(design.totals.concreteSlabs).toBeGreaterThan(0)   // slabs stay concrete
  })

  it('every timber check produces a finite utilisation, species and stability factor', () => {
    for (const b of design.woodBeams) {
      expect(b.species).toBe('DFL-1')
      expect(b.kind).toBe('sawn')
      expect(Number.isFinite(b.utilM)).toBe(true)
      expect(b.CL).toBeGreaterThan(0)
      expect(b.CL).toBeLessThanOrEqual(1)
    }
    for (const c of design.woodColumns) {
      expect(Number.isFinite(c.ratio)).toBe(true)
      expect(c.CP).toBeGreaterThan(0)
      expect(c.CP).toBeLessThanOrEqual(1)
      expect(c.Pu).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('mesh validation — timber sanity (L1 rule)', () => {
  it('flags an unknown species and non-positive dimensions', () => {
    const model = woodModel()
    model.sections[0] = { ...model.sections[0], material: 'wood', woodSpecies: 'NOT-A-SPECIES' }
    const issues = validateMesh(model)
    expect(issues.some((i) => i.code === 'WOOD_SPECIES')).toBe(true)
  })
  it('accepts a valid timber frame with no timber errors', () => {
    const issues = validateMesh(woodModel())
    expect(issues.some((i) => i.code === 'WOOD_SPECIES' || i.code === 'WOOD_DIMS')).toBe(false)
  })
})

// ── A timber frame's FLOORS ──────────────────────────────────────────────────
// Every floor of a generated timber frame is a deck-on-joist panel. Its weight
// is the boards and the joists, not the plate's `thickness` at γc: the default
// 150 mm put 3.6 kPa of concrete that was never there onto the frame, and onto
// the joists, which then failed at 580%.
const DECK = {
  joistSpecies: 'DFL-2', joistKind: 'sawn' as const, joistB: 50, joistD: 200, joistSpacing: 400,
  joistSupport: 'simple' as const, deckMaterial: 'plank' as const, deckThickness: 25, deckSupport: 'continuous' as const,
}
function deckFrame(): StructuralModel {
  const m = woodModel()                                  // 6 × 5 m panel, one storey
  m.plates = m.plates.map((p) => ({ ...p, deck: { ...DECK } }))
  m.loads = buildGravityLoads(m, 1.0, 1.9)               // SDL 1.0 kPa, LL 1.9 kPa
  return m
}
// Hand calc (joists span the 5 m side, repeat across 6 m):
//   16 joists = ⌊6000/400⌋ + 1 · 0.05×0.20 m · 5 m over 30 m² = 0.026667 m³/m²
//   deck board 0.025 m³/m²  → floor = γ·0.051667,  γ = G·9.81 of DFL-2
const gDFL2 = WOOD_SPECIES['DFL-2'].ref.G * 9.81
const floorSW = gDFL2 * (0.025 + (16 * 0.05 * 0.2 * 5) / 30)

describe('timber deck — the floor weighs what it is made of', () => {
  it('the deck plate carries boards + joists, not t·γc of concrete', () => {
    const m = deckFrame()
    const qD = m.loads.find((l) => l.kind === 'area' && l.cat === 'D') as { q: number }
    expect(plateSelfWeightKpa(m, m.plates[0])).toBeCloseTo(floorSW, 6)
    expect(qD.q).toBeCloseTo(1.0 + floorSW, 6)
    expect(floorSW).toBeLessThan(0.1 * (200 / 1000) * 24)   // under a tenth of the 200 mm slab it replaced
  })

  it('an RC plate is still t·γc', () => {
    const m = woodModel()
    expect(plateSelfWeightKpa(m, m.plates[0], 24)).toBeCloseTo(0.2 * 24, 9)
  })

  const design = designStructure(deckFrame(), soil)!
  it('the deck engine is given the superimposed load only — its own weight is not counted twice', () => {
    const s = design.woodSlabs[0]!
    expect(s.design.loads.deadKpa).toBeCloseTo(1.0, 6)
    expect(s.design.loads.deckSelfKpa + s.design.loads.joistSelfKpa).toBeCloseTo(floorSW, 6)
  })

  it('a deck panel is no concrete slab in the totals', () => {
    expect(design.totals.concreteSlabs).toBe(0)
  })

  it('the bill of quantities buys the joists and the deck boards', () => {
    const t = estimateTakeoff(deckFrame(), design)
    const joist = t.timberBySize.find((r) => r.name === '50×200')!
    expect(joist.count).toBe(16)
    expect(joist.L).toBeCloseTo(16 * 5, 9)
    expect(t.timberBySize.some((r) => r.name.startsWith('deck '))).toBe(true)
    const deckM3 = design.woodSlabs[0]!.design.takeoff.joistM3 + design.woodSlabs[0]!.design.takeoff.deckM3
    const frameM3 = t.timberBySize.filter((r) => !r.name.startsWith('deck ') && r.name !== '50×200').reduce((s, r) => s + r.m3, 0)
    expect(t.timberM3).toBeCloseTo(frameM3 + deckM3, 9)
  })

  it('re-sizing a deck in the optimiser moves the frame load with it', () => {
    const r = optimizeStructure(deckFrame(), soil)!
    for (const p of r.model.plates) {
      const qD = r.model.loads.filter((l) => l.kind === 'area' && l.cat === 'D' && l.plate === p.id)
        .reduce((s, l) => s + (l as { q: number }).q, 0)
      expect(qD).toBeCloseTo(1.0 + plateSelfWeightKpa(r.model, p), 6)
    }
  })
})

describe('bridge — timber does not crack', () => {
  it('ACI §6.6.3.1.1 modifiers leave a timber member on its gross section', () => {
    const m = woodModel()
    const gross = modelToFrame3D(m).members, cracked = modelToFrame3D(m, { crackedSections: true }).members
    for (const g of gross) {
      const c = cracked.find((x) => x.id === g.id)!
      expect(c.Iz).toBeCloseTo(g.Iz, 6)
      expect(c.Iy).toBeCloseTo(g.Iy, 6)
    }
  })
  it('a concrete member still takes them', () => {
    const m = woodModel()
    m.sections = m.sections.map((s) => ({ ...s, material: undefined }))
    const g = modelToFrame3D(m).members.find((x) => x.id.startsWith('bx'))!
    const c = modelToFrame3D(m, { crackedSections: true }).members.find((x) => x.id === g.id)!
    expect(c.Iz / g.Iz).toBeCloseTo(0.35, 9)
  })
})

// ── No plastic hinge in timber ───────────────────────────────────────────────
// Every hinge model (pushover, biaxial pushover, both nonlinear time-histories)
// took a timber member's hinge strength from the CONCRETE branch — an assumed
// 1.5% of rebar in a solid timber post — and reported ductile hinges to 4%
// drift. Timber is brittle in bending; the models now refuse it outright.
describe('nonlinear hinge models — timber is refused, not hinged', () => {
  const gm = { dt: 0.01, dir: 0 as const, ag: Array.from({ length: 50 }, (_, i) => Math.sin(i / 3)) }

  it('names the timber members and says why', () => {
    const m = woodModel()
    const na = nonlinearNotApplicable(m)!
    expect(na.members.sort()).toEqual(m.members.map((x) => x.id).sort())
    expect(na.reason).toMatch(/brittle/)
  })

  it('a concrete or steel frame is not affected', () => {
    const rc = woodModel(); rc.sections = rc.sections.map((s) => ({ ...s, material: undefined }))
    const st = woodModel(); st.sections = st.sections.map((s) => ({ ...s, material: 'steel' as const, shape: 'W310x79' }))
    expect(nonlinearNotApplicable(rc)).toBeNull()
    expect(nonlinearNotApplicable(st)).toBeNull()
    expect(runPushoverModel(rc)).not.toBeNull()
  })

  it('the hinge strength functions refuse a timber section', () => {
    const s = woodModel().sections[0]
    expect(() => plasticMoment(s)).toThrow(/timber/)
    expect(() => axialCapacity(s)).toThrow(/timber/)
  })

  it('every hinge model refuses a timber frame instead of hinging it as concrete', () => {
    const m = woodModel()
    expect(() => runPushoverModel(m)).toThrow(/timber/)
    expect(() => runBiaxialPushover(m)).toThrow(/timber/)
    expect(() => runNonlinearFrameModel(m, gm)).toThrow(/timber/)
    expect(() => runNonlinearModel(m, gm)).toThrow(/timber/)
  })
})

describe('optimizer — a timber frame ends on sizes that can be bought', () => {
  // a timber deck frame on the light timber SDL, starting from sizes no yard
  // stocks (300×300 posts, 300×450 girders, 250×400 beams)
  const start = deckFrame()
  start.sections = start.sections.map((s) => ({ ...s, woodSpecies: 'PH-APITONG-80' }))
  start.loads = buildGravityLoads(start, TIMBER_FLOOR_SDL, 1.9)
  const r = optimizeStructure(start, soil, {}, 20)!

  it('converges', () => {
    expect(r.converged).toBe(true)
  })

  it('every timber section is a stocked sawn size or 24F glulam in whole lams', () => {
    const wood = r.model.sections.filter((s) => s.material === 'wood')
    expect(wood.length).toBeGreaterThan(0)
    for (const s of wood) {
      if (s.woodKind === 'glulam') {
        expect(s.woodSpecies).toBe(GLULAM_ID)
        expect(GLULAM_WIDTHS).toContain(Math.min(s.b, s.h))
        expect(Math.max(s.b, s.h) % GLULAM_LAM).toBe(0)
      } else {
        expect(isStockSawn(s.b, s.h), `${s.id} ${s.b}×${s.h}`).toBe(true)
      }
    }
  })

  it('and the frame on them passes', () => {
    expect(r.design.woodBeams.every((b) => b.ok)).toBe(true)
    expect(r.design.woodColumns.every((c) => c.ok)).toBe(true)
  })
})

describe('stock length — a 7 m timber bay', () => {
  const long = (): StructuralModel => {
    const m = generateGridModel({
      baysX: [7], baysZ: [4], storeyH: [3],
      column: woodSec('C', 200, 200), girder: woodSec('G', 150, 300), beam: woodSec('B', 100, 250),
      slabThickness: 150,
    })
    m.plates = m.plates.map((p) => ({ ...p, deck: { ...DECK } }))
    m.loads = buildGravityLoads(m, TIMBER_FLOOR_SDL, 1.9)
    return m
  }

  it('flags every sawn member longer than 6.1 m, whatever its stresses, and passes the shorter ones', () => {
    const d = designStructure(long(), soil)!
    const rows = [...d.woodBeams, ...d.woodColumns]
    for (const r of rows) {
      expect(r.stockLengthOK).toBe(r.L <= 6.1)
      if (!r.stockLengthOK) expect(r.ok).toBe(false)
    }
    expect(rows.some((r) => !r.stockLengthOK)).toBe(true)
  })

  it('the optimizer makes the long members glulam and the frame passes', () => {
    const r = optimizeStructure(long(), soil, {}, 20)!
    expect(r.converged).toBe(true)
    for (const b of r.design.woodBeams) {
      if (b.L > 6.1) expect(b.kind).toBe('glulam')
      expect(b.ok).toBe(true)
    }
  })
})
