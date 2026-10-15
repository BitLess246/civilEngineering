import { describe, it, expect } from 'vitest'
import { designPunchingShear } from '../../engine/punchingShear'
import { criticalSection, twoWayVc, punchingDepth } from '../../engine/shear'
import { designSquareFooting } from '../../engine/isolatedFooting'
import { generateGridModel } from '../../engine/modelBuilder'
import { designStructure } from '../../engine/pipeline'
import type { RectSection } from '../../engine/model'
import { DEFAULT_PUNCHING, punchingExample } from './punching'
import { provisionById, runProvision, flowOf, flowPath, searchProvisions, shelves } from './index'
import { codeLink, fieldsFromQuery } from './links'
import { inspectDesign } from './inspector'
import type { PunchingExampleInput } from './types'

const p = provisionById('two-way-punching-shear')!
const run = (i: Partial<PunchingExampleInput>) => runProvision(p, { ...DEFAULT_PUNCHING, ...i })

describe('two-way (punching) shear — the worked example', () => {
  it('matches a hand calculation: 500×500 interior column, d = 167, f\'c 28, Vu 500 kN', () => {
    // b0 = 4(500 + 167) = 2668 mm; λ√f'c·b0·d = √28·2668·167 = 2357.7 kN
    // (a) 0.33 → 778.0 · (b) 0.17(1 + 2/1) = 0.51 → 1202.4 · (c) 0.083(2 + 40·167/2668) → 881.3
    const v = run({}).values
    expect(v.b0).toBe(2668)
    expect(v.Va).toBeCloseTo(0.33 * Math.sqrt(28) * 2668 * 167 / 1000, 6)
    expect(v.Va).toBeCloseTo(778.0, 0)
    expect(v.Vb).toBeCloseTo(1202.4, 0)
    expect(v.Vcc).toBeCloseTo(881.3, 0)
    expect(v.Vc).toBe(v.Va)
    expect(v.phiVc).toBeCloseTo(583.5, 0)
    expect(run({}).checks[0].state).toBe('pass')
  })

  it('is the engine: every value the page shows is designPunchingShear\'s, at every position', () => {
    for (const position of ['interior', 'edge', 'corner'] as const) {
      for (const [c1, c2] of [[400, 400], [300, 900], [600, 450]]) {
        const i = { ...DEFAULT_PUNCHING, c1, c2, position, Pu: 420 }
        const r = designPunchingShear({ c1, c2, d: i.d, fc: i.fc, lambda: i.lambda, Vu: i.Pu, position })
        const v = runProvision(p, i).values
        expect(v.b0).toBe(r.b0)
        expect(v.Vc).toBe(r.Vc)
        expect(v.phiVc).toBe(r.phiVc)
        expect(v.alphaS).toBe(r.alphaS)
      }
    }
  })

  it('stops the section at a free edge: b0 = (c1 + d) + 2(c2 + d/2) at an edge, (c1 + d/2) + (c2 + d/2) at a corner', () => {
    const at = { c1: 400, c2: 400, h: 250, d: 200 }
    expect(run({ ...at, position: 'interior' }).values.b0).toBe(2400)
    expect(run({ ...at, position: 'edge' }).values.b0).toBe(600 + 2 * 500)
    expect(run({ ...at, position: 'corner' }).values.b0).toBe(500 + 500)
  })

  it('lets (b) govern an elongated column', () => {
    // βc = 4: 0.17(1 + 2/4) = 0.255 < 0.33
    const v = run({ c1: 300, c2: 1200 }).values
    expect(v.betac).toBe(4)
    expect(v.Vc).toBe(v.Vb)
  })

  it('on a footing, subtracts the soil pressure inside the section: Vu = Pu − qu·A0', () => {
    // 400 column, d = 300 → A0 = 0.7² = 0.49 m²; qu = 200 kPa relieves 98 kN
    const v = run({ c1: 400, c2: 400, h: 400, d: 300, Pu: 1000, qu: 200 }).values
    expect(v.Ao).toBeCloseTo(490000, 6)
    expect(v.Vu).toBeCloseTo(1000 - 98, 9)
  })

  it('says what is wrong with impossible geometry rather than computing', () => {
    const r = run({ d: 250, h: 200 })
    expect(r.checks).toHaveLength(0)
    expect((r.lines[0] as { text: string }).text).toMatch(/effective depth/)
  })

  it('agrees with the footing designer, which sizes d on the same section, the same relief and the same Vc', () => {
    const f = designSquareFooting({ serviceLoad: 900, ultimateLoad: 1300, columnWidth: 400, fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5, barDia: 16, cover: 75 })
    const ex = { ...DEFAULT_PUNCHING, c1: 400, c2: 400, h: f.Dc, d: f.dProvided, Pu: 1300, qu: f.qu }
    const v = runProvision(p, ex).values
    const cs = criticalSection(400, 400, f.dProvided)
    expect(v.Vu).toBeCloseTo(1300 - f.qu * cs.Ao * 1e-6, 9)
    expect(v.phiVc).toBeCloseTo(0.75 * twoWayVc({ fc: 28, bo: cs.bo, d: f.dProvided }), 9)
    // the built depth is at least the depth punching needed — and the page agrees it passes
    expect(f.dProvided).toBeGreaterThanOrEqual(punchingDepth({ Pu: 1300, qu: f.qu, c: 400, fc: 28 }))
    expect(v.Vu).toBeLessThanOrEqual(v.phiVc)
    expect(f.punchOK).toBe(true)
  })
})

describe('the decision flow', () => {
  it('runs to "passes" on the default and branches to the remedies when Vu exceeds φVc', () => {
    const ok = flowPath(flowOf(p, DEFAULT_PUNCHING)!)
    expect(ok.branched).toBe(false)
    const bad = flowOf(p, { ...DEFAULT_PUNCHING, Pu: 900 })!
    const path = flowPath(bad)
    expect(path.branched).toBe(true)
    expect(bad.steps[path.last].branch!.to.state).toBe('fail')
    expect((run({ Pu: 900 }).lines.at(-1) as { text: string }).text).toMatch(/headed studs/)
  })
})

describe('in the library', () => {
  it('fills the Foundations shelf and is found by search', () => {
    expect(shelves().find((s) => s.category === 'foundations')!.items.map((x) => x.id)).toContain('two-way-punching-shear')
    expect(searchProvisions('punching')[0].id).toBe('two-way-punching-shear')
    expect(searchProvisions('422.6').map((x) => x.id)).toContain('two-way-punching-shear')
  })

  it('carries a calculator\'s column through a link exactly, the picked position included', () => {
    const ex = { c1: 450, c2: 600, h: 220, d: 187, fc: 32, lambda: 1, position: 'edge', Pu: 610.5, qu: 0 }
    const url = codeLink('two-way-punching-shear', ex, { route: '/punching-shear', label: 'Punching Shear' })
    const back = fieldsFromQuery(new URLSearchParams(url.split('?')[1]), p)
    expect(back.inp).toEqual(ex)
    expect(back.from?.route).toBe('/punching-shear')
    // out of range or not an option → the default stands
    const bad = fieldsFromQuery(new URLSearchParams('position=round&d=-5'), p)
    expect(bad.inp.position).toBe('interior')
    expect(bad.inp.d).toBe(DEFAULT_PUNCHING.d)
  })
})

describe('Model Space footings in the compliance inspector', () => {
  const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section, slabThickness: 175 })
  model.loads = model.plates.flatMap((pl) => [
    { kind: 'area' as const, plate: pl.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: pl.id, q: 2.4, cat: 'L' as const },
  ])
  const d = designStructure(model, { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 })!
  const feet = inspectDesign(model, d).filter((x) => x.kind === 'footing')

  it('itemises each pad\'s punching check, linked, and the link reopens to the same ratio', () => {
    expect(feet.length).toBe(d.footings.length)
    for (const f of feet) {
      const c = f.checks.find((x) => x.name.startsWith('Two-way'))!
      expect(c.explain).toMatch(/^\/codes\/two-way-punching-shear\?/)
      const back = fieldsFromQuery(new URLSearchParams(c.explain!.split('?')[1]), p)
      expect(back.carried.length).toBe(p.fields.length)
      const v = runProvision(p, back.inp).values
      expect(v.Vu / v.phiVc).toBeCloseTo(c.util!, 9)
      // the pipeline designed it, so it passes — and the page agrees
      const row = d.footings.find((r) => r.node === f.id)!
      expect(row.design.punchOK).toBe(true)
      expect(c.util!).toBeLessThanOrEqual(1)
      expect(punchingExample(back.inp as unknown as PunchingExampleInput)!.Vu).toBeGreaterThan(0)
    }
  })
})
