import { describe, it, expect } from 'vitest'
import { designLintel, type LintelInput } from '../engine/lintel'
import { buildLintelSolution } from './lintelSolution'
import { lineText } from './solution'

const BASE: LintelInput = {
  opening: 2, bearing: 200, b: 200, h: 300, cover: 40, barDia: 12, stirrupDia: 10, fc: 21, fy: 415,
  wallThickness: 150, wallHeightAbove: 2.4, wallUnitWeight: 21, archAngleDeg: 60, udlAbove: 0, live: 0,
}

describe('lintel worked solution', () => {
  it('prints the Mu and Vu the engine designed with, for an arching wall', () => {
    const r = designLintel(BASE)
    expect(r.loads.arching).toBe(true)
    const text = buildLintelSolution(BASE, r).flatMap((s) => s.lines.map(lineText)).join('\n')
    expect(text).toContain(`= ${r.Mu.toFixed(2)}\\ \\text{kN·m}`)
    expect(text).toContain(`V_u = \\frac{W_u}{2} + \\frac{w_u\\ell}{2} = ${r.Vu.toFixed(2)}`)
    // Wℓ/6 for the triangle: rebuild Mu from the printed parts
    const wu = 1.2 * (r.loads.selfWeight + r.loads.udlDead) + 1.6 * r.loads.live
    expect((1.2 * r.loads.masonry * r.span) / 6 + (wu * r.span ** 2) / 8).toBeCloseTo(r.Mu, 9)
  })

  it('switches to the whole rectangle when the wall is too short to arch', () => {
    const inp = { ...BASE, wallHeightAbove: 0.5 }
    const r = designLintel(inp)
    expect(r.loads.arching).toBe(false)
    const steps = buildLintelSolution(inp, r)
    expect(steps[1].title).toContain('no arch')
    const text = steps.flatMap((s) => s.lines.map(lineText)).join('\n')
    expect(text).toContain(`= ${r.Mu.toFixed(2)}\\ \\text{kN·m}`)
  })
})
