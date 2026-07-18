import { describe, it, expect } from 'vitest'
import { designBeam, type BeamDesignInput } from '../engine/beamDesign'
import { buildBeamSolution } from './beamSolution'

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
