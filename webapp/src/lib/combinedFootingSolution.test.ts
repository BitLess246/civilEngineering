import { describe, it, expect } from 'vitest'
import { designCombinedFooting, type CombinedFootingInput } from '../engine/combinedFooting'
import { buildCombinedFootingSolution } from './combinedFootingSolution'

const base: CombinedFootingInput = {
  col1Width: 400, col2Width: 400, spacing: 5,
  dl1: 600, ll1: 300, dl2: 900, ll2: 450,
  leftRestrict: false, rightRestrict: false, leftOverhang: 0, rightOverhang: 0,
  fc: 21, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24, surcharge: 0,
  H: 1.5, barDia: 20, cover: 75,
}

describe('combined footing worked solution', () => {
  it('CRF: produces provision-cited steps that match the engine result', () => {
    const r = designCombinedFooting(base)
    const steps = buildCombinedFootingSolution(base, r)
    const titles = steps.map((s) => s.title)
    expect(titles[0]).toMatch(/loads/i)
    expect(titles.some((t) => /rectangular combined footing/i.test(t))).toBe(true)
    expect(titles.some((t) => /punching/i.test(t))).toBe(true)
    expect(titles.some((t) => /Longitudinal flexure/i.test(t))).toBe(true)
    expect(titles.some((t) => /Transverse/i.test(t))).toBe(true)
    // the rendered numbers reference the engine's governing results
    const flat = steps.flatMap((s) => s.lines).map((l) => ('tex' in l ? l.tex : l.text)).join(' ')
    expect(flat).toContain(r.Bx.toFixed(2))
    expect(flat).toContain(String(Math.round(r.Dc)))
    expect(flat).toContain(r.Pu.toFixed(1))
  })

  it('CTF: trapezoid branch when both ends restricted', () => {
    const r = designCombinedFooting({ ...base, leftRestrict: true, rightRestrict: true, leftOverhang: 300, rightOverhang: 300 })
    expect(r.shape[0]).toBe('T')
    const steps = buildCombinedFootingSolution({ ...base, leftRestrict: true, rightRestrict: true, leftOverhang: 300, rightOverhang: 300 }, r)
    expect(steps.some((s) => /trapezoidal combined footing/i.test(s.title))).toBe(true)
    const flat = steps.flatMap((s) => s.lines).map((l) => ('tex' in l ? l.tex : l.text)).join(' ')
    expect(flat).toContain(r.By1.toFixed(2))
    expect(flat).toContain(r.By2.toFixed(2))
  })
})
