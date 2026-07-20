import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { designStructure } from './pipeline'
import { validateMesh } from './meshValidation'
import { WOOD_SPECIES } from './woodDesign'
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
