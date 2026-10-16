import { describe, it, expect } from 'vitest'
import { nscpSeismicParams, baseShearCoeff, STRUCTURAL_SYSTEMS } from '../../engine/nscpSeismic'
import { computeSeismic } from '../../engine/seismic'
import { generateGridModel } from '../../engine/modelBuilder'
import type { RectSection } from '../../engine/model'
import { DEFAULT_SEISMIC, seismicExample } from './seismic'
import { provisionById, runProvision, flowOf, flowPath, shelves, searchProvisions } from './index'
import { codeLink, fieldsFromQuery } from './links'
import type { SeismicExampleInput } from './types'

const p = provisionById('nscp-static-base-shear')!
const run = (i: Partial<SeismicExampleInput>) => runProvision(p, { ...DEFAULT_SEISMIC, ...i })

describe('static design base shear — the worked example', () => {
  it('matches a hand calculation: Zone 4, SD, source B at 10 km, SMRF, T = 0.5 s, W = 10 000 kN', () => {
    // Na = Nv = 1.0 at 10 km from a type B source; SD in Zone 4: Ca = 0.44, Cv = 0.64
    // Cv·I/(R·T) = 0.64/(8.5·0.5) = 0.15059 > 2.5Ca·I/R = 1.1/8.5 = 0.12941 → the cap governs
    // 0.11Ca·I = 0.0484; 0.8·Z·Nv·I/R = 0.32/8.5 = 0.03765
    const v = run({}).values
    expect(v.Ca).toBe(0.44); expect(v.Cv).toBe(0.64); expect(v.R).toBe(8.5); expect(v.I).toBe(1)
    expect(v.Csraw).toBeCloseTo(0.64 / 4.25, 12)
    expect(v.Csmax).toBeCloseTo(1.1 / 8.5, 12)
    expect(v.Csmin).toBeCloseTo(0.0484, 12)
    expect(v.Cszone4).toBeCloseTo(0.32 / 8.5, 12)
    expect(v.Cs).toBeCloseTo(1.1 / 8.5, 12)
    expect(v.V).toBeCloseTo(1294.1, 1)
    expect(v.Ft).toBe(0)
  })

  it('is the engine: the Seismic Wizard\'s nscpSeismicParams + baseShearCoeff, for every system and soil', () => {
    for (const sys of STRUCTURAL_SYSTEMS) for (const soil of ['SA', 'SC', 'SE'] as const) for (const T of [0.2, 0.9, 2.4]) {
      const prm = nscpSeismicParams({ zone: 4, soil, occupancy: 'essential', R: sys.R, source: 'A', distanceKm: 4 })
      const c = baseShearCoeff({ Ca: prm.Ca, Cv: prm.Cv, I: prm.I, R: prm.R, T, Z: prm.Z, Nv: prm.Nv })
      const v = run({ system: sys.name, soil, occupancy: 'essential', source: 'A', distance: 4, T }).values
      expect(v.Cs).toBe(c.Cs)
      expect(v.V).toBeCloseTo(c.Cs * DEFAULT_SEISMIC.W, 9)
    }
  })

  it('gives the base shear and roof force computeSeismic applies to a modelled frame', () => {
    const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
    const model = generateGridModel({ baysX: [6, 6], baysZ: [6], storeyH: [4, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5], section, slabThickness: 200 })
    model.loads = model.plates.map((pl) => ({ kind: 'area' as const, plate: pl.id, q: 4.8, cat: 'D' as const }))
    const prm = nscpSeismicParams({ zone: 4, soil: 'SD', occupancy: 'standard', R: 8.5, source: 'B', distanceKm: 10 })
    const s = computeSeismic(model, { Ca: prm.Ca, Cv: prm.Cv, I: prm.I, R: prm.R, Z: prm.Z, Nv: prm.Nv, dir: 'x' })!
    expect(s.T).toBeGreaterThan(0.7)                       // a tall enough frame to carry Ft
    const v = run({ T: s.T, W: s.W }).values
    expect(v.V).toBeCloseTo(s.V, 6)
    expect(v.Ft).toBeCloseTo(s.Ft, 6)
    expect(v.Ft).toBeGreaterThan(0)
  })

  it('lets each limit govern where it should, and the flow says which', () => {
    const at = (i: Partial<SeismicExampleInput>) => flowOf(p, { ...DEFAULT_SEISMIC, ...i })!
    const cap = at({ T: 0.2 })
    expect(cap.steps[flowPath(cap).last].branch!.to.text).toMatch(/cap/)
    // Zone 2, long period: the 0.11Ca·I minimum
    const floor = at({ zone: '2', T: 6 })
    expect(floor.steps[flowPath(floor).last].branch!.to.text).toMatch(/minimum/)
    // Zone 4 next to a type A fault, long period: 0.8Z·Nv·I/R with Nv = 2
    const z4 = at({ source: 'A', distance: 2, T: 4 })
    expect(z4.steps[flowPath(z4).last].branch!.to.text).toMatch(/Zone 4 floor/)
    // in between, the basic value
    expect(flowPath(at({ T: 1.2 })).branched).toBe(false)
  })

  it('puts Ft at the roof above 0.7 s, capped at 0.25V', () => {
    const mid = run({ T: 1.5 }).values
    expect(mid.Ft).toBeCloseTo(0.07 * 1.5 * mid.V, 9)
    const long = run({ T: 4 }).values
    expect(long.Ft).toBeCloseTo(0.25 * long.V, 9)       // 0.07·4 = 0.28 > 0.25
  })

  it('refuses an unknown system or a non-positive period', () => {
    expect(seismicExample({ ...DEFAULT_SEISMIC, system: 'nope' })).toBeNull()
    expect(run({ T: 0 }).lines[0]).toMatchObject({ text: expect.stringMatching(/period/) })
  })

  it('fills the Seismic shelf, is found by search, and carries the wizard\'s inputs through a link', () => {
    expect(shelves().find((s) => s.category === 'seismic')!.items.map((x) => x.id)).toEqual(['nscp-static-base-shear'])
    expect(searchProvisions('base shear')[0].id).toBe('nscp-static-base-shear')
    const ex = { ...DEFAULT_SEISMIC, soil: 'SC', source: 'A', distance: 6, occupancy: 'essential', system: STRUCTURAL_SYSTEMS[5].name, T: 0.83 }
    const back = fieldsFromQuery(new URLSearchParams(codeLink('nscp-static-base-shear', ex, { route: '/seismic-wizard', label: 'Seismic Wizard' }).split('?')[1]), p)
    expect(back.inp).toEqual(ex)
    expect(back.from?.route).toBe('/seismic-wizard')
  })
})
