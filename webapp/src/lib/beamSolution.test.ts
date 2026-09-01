import { describe, it, expect } from 'vitest'
import { designBeam, type BeamDesignInput } from '../engine/beamDesign'
import { buildBeamSolution, beamProvidedCapacities } from './beamSolution'

const texOf = (steps: ReturnType<typeof buildBeamSolution>, title: string) =>
  steps.find((s) => s.title.includes(title))!.lines
    .map((l) => ('tex' in l ? l.tex : l.text)).join(' | ')

describe('beam worked solution — transverse legs & Aᵥ (§418.6.4.3 · §422.5)', () => {
  it('width-driven: a wide beam step reports the design count and uses it in Aᵥ', () => {
    // Wide beam → the hx limit forces interior legs.
    const i: BeamDesignInput = { b: 900, h: 550, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, Mu: 200, Vu: 150 }
    const r = designBeam(i)
    expect(r.legs).toBeGreaterThanOrEqual(3)             // width forced > 2 legs
    const leg = texOf(buildBeamSolution(i, r), 'Transverse legs')
    expect(leg).toContain(`= \\mathbf{${r.legs}}`)       // reports the design's count
    expect(leg).toContain('h_x')                         // width / transverse-spacing driven
    expect(r.Av).toBeCloseTo(r.legs * (Math.PI / 4) * 10 * 10, 6)
  })

  it('adds a shear-bump line when Vs governs on a normal-width beam', () => {
    const i: BeamDesignInput = { b: 300, h: 550, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, Mu: 100, Vu: 450 }
    const r = designBeam(i)
    expect(r.legs).toBeGreaterThanOrEqual(3)
    expect(texOf(buildBeamSolution(i, r), 'Transverse legs')).toContain('shear bump')
  })

  it('normal-width, low shear → a 2-leg tie', () => {
    const i: BeamDesignInput = { b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, Mu: 120, Vu: 70 }
    const r = designBeam(i)
    expect(r.legs).toBe(2)
  })
})

describe('beamProvidedCapacities — φMn at the bars actually detailed', () => {
  const at = (o: Partial<BeamDesignInput> = {}) => {
    const i = { b: 300, h: 600, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, Mu: 300, Vu: 150, ...o }
    const r = designBeam(i as BeamDesignInput)
    return { i, r, cap: beamProvidedCapacities({ ...(i as BeamDesignInput), fyt: 415, legs: 2 }, r) }
  }

  it('is the yield formula while the steel yields', () => {
    const { i, r, cap } = at()
    const AsProv = r.bars * (Math.PI / 4) * i.barDia ** 2
    const a = (AsProv * i.fy) / (0.85 * i.fc * i.b)
    expect(cap.phiMn).toBeCloseTo((0.9 * AsProv * i.fy * (r.d - a / 2)) / 1e6, 6)
  })

  it('does NOT report the yield formula on an over-reinforced section', () => {
    // A 200×300 in f'c 21 with fy 550 and ⌀32 bars: §9.6.1.2's two-bar minimum
    // alone puts ρ at 0.034. The old formula returned 87.7 kN·m at φ = 0.90;
    // the steel reaches 296 MPa of 550 and φ is 0.65.
    const { i, r, cap } = at({ b: 200, h: 300, fc: 21, fy: 550, barDia: 32, Mu: 20 })
    const AsProv = r.bars * (Math.PI / 4) * i.barDia! ** 2
    const assumed = (0.9 * AsProv * i.fy! * (r.d - (AsProv * i.fy!) / (0.85 * i.fc! * i.b!) / 2)) / 1e6
    expect(assumed).toBeGreaterThan(80)                  // what it used to say
    expect(cap.phiMn).toBeLessThan(60)                   // what it says now
    expect(cap.phiMn).toBeGreaterThan(0)
    expect(assumed / cap.phiMn).toBeGreaterThan(1.5)     // the size of the old error
  })
})
