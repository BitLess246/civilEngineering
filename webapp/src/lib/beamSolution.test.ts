import { describe, it, expect } from 'vitest'
import { designBeam, type BeamDesignInput } from '../engine/beamDesign'
import { buildBeamSolution } from './beamSolution'

const texOf = (steps: ReturnType<typeof buildBeamSolution>, title: string) =>
  steps.find((s) => s.title.includes(title))!.lines
    .map((l) => ('tex' in l ? l.tex : l.text)).join(' | ')

describe('beam worked solution — transverse legs & Aᵥ (§422.5.10.5.3)', () => {
  it('adds a leg step whose count matches the design and is used in Aᵥ (not hard-coded 2)', () => {
    // Very high Vs → a 2-leg tie would need s < 75 mm → the design adds a leg.
    const i: BeamDesignInput = { b: 300, h: 550, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, Mu: 100, Vu: 450 }
    const r = designBeam(i)
    expect(r.legs).toBeGreaterThanOrEqual(3)             // the design chose > 2 legs
    const leg = texOf(buildBeamSolution(i, r), 'Transverse legs')
    expect(leg).toContain(`= \\mathbf{${r.legs}}`)       // the step reports the design's count
    expect(leg).toContain('(A_v/s)_{req}')               // driven by the shear demand
    expect(leg).toContain(`= ${r.legs}\\cdot\\tfrac{\\pi}{4}`)   // Aᵥ uses that count
    expect(r.Av).toBeCloseTo(r.legs * (Math.PI / 4) * 10 * 10, 6)
  })

  it('shows a 2-leg tie when Vs does not require more (low shear)', () => {
    const i: BeamDesignInput = { b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, Mu: 120, Vu: 70 }
    const r = designBeam(i)
    expect(r.region).toBe('minimum')
    expect(r.legs).toBe(2)
    expect(texOf(buildBeamSolution(i, r), 'Transverse legs')).toContain('Vs does not require more')
  })
})
