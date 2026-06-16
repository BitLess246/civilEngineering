import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads, refreshSelfWeight } from './modelBuilder'
import { storeyWeights } from './seismic'
import { designStructure, selectBarDiameters } from './pipeline'
import type { RectSection, ModelLoad } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeModel() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
  m.loads = buildGravityLoads(m, 4.8, 2.4)   // default γc = 24
  return m
}

describe('concrete unit weight γc threads through self-weight & seismic mass', () => {
  const bare = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })   // no slab loads

  it('buildGravityLoads scales member self-weight and slab dead by γc', () => {
    const sw = (loads: ModelLoad[]) =>
      (loads.find((x) => x.kind === 'member-udl' && x.cat === 'D') as { w: number }).w
    const areaD = (loads: ModelLoad[]) =>
      (loads.find((x) => x.kind === 'area' && x.cat === 'D') as { q: number }).q
    const l24 = buildGravityLoads(bare, 4.8, 2.4, 24)
    const l30 = buildGravityLoads(bare, 4.8, 2.4, 30)
    expect(sw(l30) / sw(l24)).toBeCloseTo(30 / 24, 9)            // member SW ∝ γc
    expect(areaD(l24)).toBeCloseTo(0.15 * 24 + 4.8, 9)          // slab SW (t=150) + SDL
    expect(areaD(l30)).toBeCloseTo(0.15 * 30 + 4.8, 9)
  })

  it('refreshSelfWeight honours γc', () => {
    const base = { ...bare, loads: buildGravityLoads(bare, 4.8, 2.4, 24) }
    const w = (refreshSelfWeight(base, 30).loads.find((x) => x.kind === 'member-udl' && x.cat === 'D') as { w: number }).w
    expect(w).toBeCloseTo(0.3 * 0.5 * 30, 6)                     // 300×500 member at γc = 30
  })

  it('seismic storey weight scales member self-weight with γc', () => {
    const sum = (g: number) => storeyWeights(bare, g).reduce((s, x) => s + x.w, 0)
    expect(sum(30) / sum(24)).toBeCloseTo(30 / 24, 9)            // only member SW (no slab loads)
  })
})

describe('selectBarDiameters — bar choice is a pure detailing pass', () => {
  const m = makeModel()
  // start every section oversized at ⌀32 so an economical size exists
  const big = { ...m, sections: m.sections.map((s) => ({ ...s, barDia: 32 })) }
  const base = designStructure(big, soil)!
  const picked = selectBarDiameters(big, soil, {}, {}, base)
  const after = designStructure(picked, soil)!

  it('changes only barDia, never the concrete b×h', () => {
    picked.sections.forEach((s, i) => {
      expect(s.b).toBe(big.sections[i].b)
      expect(s.h).toBe(big.sections[i].h)
    })
  })

  it('does not alter the frame demands (bar Ø is stiffness-neutral)', () => {
    const dem = (d: typeof base) => d.beams.map((b) => b.sections.map((s) => +s.Mu.toFixed(6)))
    expect(dem(after)).toEqual(dem(base))
  })

  it('adopts a more economical bar where one passes, and never breaks a passing member', () => {
    expect(picked.sections.some((s) => s.barDia < 32)).toBe(true)
    const okBefore = new Map(base.columns.map((c) => [c.id, c.ok]))
    for (const c of after.columns) if (okBefore.get(c.id)) expect(c.ok).toBe(true)
    const okBeamBefore = new Map(base.beams.map((b) => [b.id, b.ok]))
    for (const b of after.beams) if (okBeamBefore.get(b.id)) expect(b.ok).toBe(true)
  })

  it('keeps chosen diameters within the standard ladder', () => {
    const allowed = new Set([16, 20, 25, 28, 32])
    for (const s of picked.sections) expect(allowed.has(s.barDia)).toBe(true)
  })
})
