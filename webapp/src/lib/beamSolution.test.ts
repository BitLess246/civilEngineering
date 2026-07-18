import { describe, it, expect } from 'vitest'
import { designBeam, type BeamDesignInput } from '../engine/beamDesign'
import { buildBeamSolution } from './beamSolution'

const texOf = (steps: ReturnType<typeof buildBeamSolution>, title: string) =>
  steps.find((s) => s.title.includes(title))!.lines
    .map((l) => ('tex' in l ? l.tex : l.text)).join(' | ')

describe('beam worked solution — transverse legs & Aᵥ (§25.7.2.3)', () => {
  it('adds a leg step whose count matches the design and is used in Aᵥ (not hard-coded 2)', () => {
    // Wide beam, few widely-spaced bars (> 150 mm clear) → the tie needs a crosstie.
    const i: BeamDesignInput = { b: 800, h: 600, cover: 40, barDia: 25, stirrupDia: 10, fc: 28, fy: 415, Mu: 150, Vu: 320 }
    const r = designBeam(i)
    expect(r.legs).toBeGreaterThanOrEqual(3)             // the design chose > 2 legs
    const steps = buildBeamSolution(i, r)
    const leg = texOf(steps, 'Transverse legs')
    expect(leg).toContain(`= \\mathbf{${r.legs}}`)       // the step reports the design's count
    // Aᵥ uses that leg count, and equals legs·(π/4)·ds²
    expect(leg).toContain(`A_v = n_{legs}\\cdot\\tfrac{\\pi}{4}d_s^2 = ${r.legs}`)
    expect(r.Av).toBeCloseTo(r.legs * (Math.PI / 4) * 10 * 10, 6)
  })

  it('shows a 2-leg perimeter tie (no crossties) for a lightly-reinforced section', () => {
    const i: BeamDesignInput = { b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, Mu: 40, Vu: 200 }
    const r = designBeam(i)
    expect(r.legs).toBe(2)
    expect(texOf(buildBeamSolution(i, r), 'Transverse legs')).toContain('perimeter tie only')
  })
})
