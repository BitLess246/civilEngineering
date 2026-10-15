import { describe, it, expect } from 'vitest'
import { provisionById, PROVISIONS, flowPath, flowOf, runProvision } from './index'
import { DEFAULT_STEEL_BEAM, DEFAULT_STEEL_COLUMN, W_SHAPES } from './steel'
import { DEFAULT_LOADS } from './loads'
import type { SteelExampleInput, SteelProvision, LoadsProvision } from './types'
import { shapeByName } from '../../engine/aiscSections'
import { deriveWSection, beamFlexure, beamShear } from '../../engine/steelDesign'
import { steelCompression } from '../../engine/steelCompression'

const steel = (id: string) => provisionById(id) as SteelProvision
const KIP_FT = 1.35582, KIP = 4.44822, FT = 0.3048

describe('steel provisions are the engine\'s numbers', () => {
  const i: SteelExampleInput = { ...DEFAULT_STEEL_BEAM, Lb: 3.5, Cb: 1.14 }
  const s = shapeByName(i.shape)!, p = deriveWSection(s)
  it('flexure equals beamFlexure, called as the pipeline calls it', () => {
    const v = steel('steel-beam-flexure').evaluate(i).values
    const r = beamFlexure(s, p, i.Fy, i.Lb * 1000, i.Cb)
    expect(v.phiMn).toBe(r.phiMn); expect(v.Mn).toBe(r.Mn); expect(v.Lp).toBe(r.Lp / 1000)
  })
  it('shear equals beamShear', () => {
    expect(steel('steel-beam-shear').evaluate(i).values.phiVn).toBe(beamShear(s, p, i.Fy).phiVn)
  })
  it('compression equals steelCompression with the pipeline\'s Kx·L, Ky·L, L', () => {
    const c = DEFAULT_STEEL_COLUMN, sc = shapeByName(c.shape)!
    const r = steelCompression(sc, c.Fy, c.Kx * c.L * 1000, c.Ky * c.L * 1000, c.L * 1000)
    expect(steel('steel-column-compression').evaluate(c).values.phiPn).toBe(r.phiPn)
  })
})

describe('against the AISC Manual, W18×50 (W460×74), Fy = 345 MPa (50 ksi) — Table 3-2', () => {
  const base = { ...DEFAULT_STEEL_BEAM, shape: 'W460x74', Fy: 345, Cb: 1 }
  it('φbMp = 379 kip·ft, Lp = 5.83 ft', () => {
    const v = steel('steel-beam-flexure').evaluate({ ...base, Lb: 0.5 }).values
    expect(v.phiMn / (379 * KIP_FT)).toBeGreaterThan(0.985)
    expect(v.phiMn / (379 * KIP_FT)).toBeLessThan(1.015)
    expect(v.Lp / (5.83 * FT)).toBeGreaterThan(0.98)
    expect(v.Lp / (5.83 * FT)).toBeLessThan(1.02)
  })
  it('Lr runs short of the tabulated 16.9 ft, never long — the stated conservative side', () => {
    const v = steel('steel-beam-flexure').evaluate({ ...base, Lb: 0.5 }).values
    expect(v.Lr).toBeLessThanOrEqual(16.9 * FT * 1.01)
    expect(v.Lr).toBeGreaterThan(16.9 * FT * 0.8)
  })
  it('φvVn = 192 kips', () => {
    const v = steel('steel-beam-shear').evaluate(base).values
    expect(v.phiVn / (192 * KIP)).toBeGreaterThan(0.99)
    expect(v.phiVn / (192 * KIP)).toBeLessThan(1.01)
    expect(v.phiV).toBe(1)
  })
})

describe('column by hand: W310×97, Fy 345, L = 4.5 m pinned', () => {
  it('KL/ry, Fe, Fcr (E3-2) and φcPn', () => {
    const v = steel('steel-column-compression').evaluate(DEFAULT_STEEL_COLUMN).values
    const KLr = 4500 / 76.7
    const Fe = (Math.PI ** 2 * 200000) / KLr ** 2
    const Fcr = 0.658 ** (345 / Fe) * 345
    expect(v.KLr).toBeCloseTo(KLr, 9)
    expect(v.Fcr).toBeCloseTo(Fcr, 9)
    expect(v.phiPn).toBeCloseTo((0.9 * Fcr * 12300) / 1000, 6)        // no slender element: Ae = Ag
  })
})

describe('flexure flowchart follows the LTB zone', () => {
  const route = (Lb: number) => flowPath(flowOf(provisionById('steel-beam-flexure')!, { ...DEFAULT_STEEL_BEAM, Lb })!)
  it('plastic → inelastic → elastic as Lb grows', () => {
    const s = shapeByName('W460x74')!, r = beamFlexure(s, deriveWSection(s), 345, 1000, 1)
    expect(route(r.Lp / 1000 - 0.1)).toEqual({ last: 3, branched: true })
    expect(route((r.Lp + r.Lr) / 2000)).toEqual({ last: 4, branched: true })
    expect(route(r.Lr / 1000 + 1)).toEqual({ last: 5, branched: false })
  })
})

describe('load combinations by hand: D 100, L 60, Lr 10, W 40, E 50', () => {
  const p = provisionById('load-combinations') as LoadsProvision
  it('governing is 1.2D + 1.0E + 1.0L = 230; the reversal case 0.9D − 1.0E = 40', () => {
    const v = p.evaluate(DEFAULT_LOADS).values
    expect(v.U).toBeCloseTo(1.2 * 100 + 50 + 60, 9)
    expect(v.Umin).toBeCloseTo(0.9 * 100 - 50, 9)
    expect(runProvision(p).lines.length).toBe(13 + 2)
  })
})

describe('every provision opens on its own example', () => {
  it('each evaluates its defaults, and every field names an input it has', () => {
    for (const p of PROVISIONS) {
      const ex = runProvision(p)
      expect(ex.lines.length, p.id).toBeGreaterThan(0)
      for (const f of p.fields as { key: string; options?: readonly string[] }[]) {
        expect(f.key in p.defaults, `${p.id}.${f.key}`).toBe(true)
        if (f.options) expect(f.options.includes((p.defaults as unknown as Record<string, string>)[f.key])).toBe(true)
      }
    }
  })
  it('a shape outside the catalogue is said, not computed', () => {
    const ex = steel('steel-beam-flexure').evaluate({ ...DEFAULT_STEEL_BEAM, shape: 'HSS100x100x6' })
    expect(ex.checks).toEqual([])
    expect('text' in ex.lines[0] && ex.lines[0].text).toMatch(/not a W-shape/)
    expect(W_SHAPES.length).toBeGreaterThan(100)
  })
})
