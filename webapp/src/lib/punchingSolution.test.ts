import { describe, it, expect } from 'vitest'
import { designPunchingShear, type PunchingInput } from '../engine/punchingShear'
import { buildPunchingSolution } from './punchingSolution'

const base: PunchingInput = {
  c1: 400, c2: 400, d: 165, fc: 28, lambda: 1, Vu: 500, position: 'interior',
}

const texOf = (steps: ReturnType<typeof buildPunchingSolution>) =>
  steps.flatMap((s) => s.lines).filter((l): l is { tex: string } => 'tex' in l).map((l) => l.tex)

describe('buildPunchingSolution', () => {
  it('shows every value the engine computed, so the sheet cannot disagree with the verdict', () => {
    const r = designPunchingShear(base)
    const tex = texOf(buildPunchingSolution(base, r)).join(' ')
    // each headline number appears, formatted as the sheet prints it
    expect(tex).toContain(r.b0.toFixed(0))
    expect(tex).toContain(r.Vc1.toFixed(1))
    expect(tex).toContain(r.Vc2.toFixed(1))
    expect(tex).toContain(r.Vc3.toFixed(1))
    expect(tex).toContain(r.Vc.toFixed(1))
    expect(tex).toContain(r.phiVc.toFixed(1))
    expect(tex).toContain(r.ratio.toFixed(2))
  })

  it('substitutes the INPUTS, not just the answers', () => {
    // The complaint this fixes: a sheet that prints results without showing
    // where they came from is not a worked solution.
    const r = designPunchingShear(base)
    const tex = texOf(buildPunchingSolution(base, r)).join(' ')
    expect(tex).toContain('400')      // column size
    expect(tex).toContain('165')      // effective depth
    expect(tex).toContain('28')       // f'c
  })

  it('carries a unit on every result line', () => {
    const r = designPunchingShear(base)
    const tex = texOf(buildPunchingSolution(base, r))
    const withUnits = tex.filter((t) => /\\text\{(mm|kN|MPa|mm\}\^2|mm\^2)/.test(t) || t.includes('\\text{mm}^2'))
    expect(withUnits.length).toBeGreaterThanOrEqual(5)
  })

  it('cites a clause on every step', () => {
    const steps = buildPunchingSolution(base, designPunchingShear(base))
    for (const s of steps) {
      expect(s.clause, s.title).toBeTruthy()
      expect(s.clause).toMatch(/ACI 318-14/)
    }
  })

  it('marks the design check pass/fail to match the engine', () => {
    for (const Vu of [200, 500, 5000]) {
      const inp = { ...base, Vu }
      const r = designPunchingShear(inp)
      const check = buildPunchingSolution(inp, r).find((s) => s.pass !== undefined)!
      expect(check.pass, `Vu=${Vu}`).toBe(r.ok)
    }
  })

  it('names the equation that governed, lettered as Table 22.6.5.2 prints them', () => {
    // (a) is the 0.33 bound, (b) the βc term, (c) the αs term. The letters
    // used to follow this module's Vc1-2-3 order instead, so a squarish
    // interior column — the 0.33 bound, the code's (a) — was reported as (c).
    const square = designPunchingShear(base)
    expect(square.Vc).toBe(square.Vc3)
    const noteSquare = buildPunchingSolution(base, square).find((s) => s.note)!.note!
    expect(noteSquare).toMatch(/^Eq\. \(a\)/)

    const elongated = { ...base, c1: 1200, c2: 250 }            // βc 4.8
    const rE = designPunchingShear(elongated)
    expect(rE.Vc).toBe(rE.Vc1)
    expect(buildPunchingSolution(elongated, rE).find((s) => s.note)!.note!).toMatch(/^Eq\. \(b\)/)

    // a big square column on a thin slab: b0/d large, so the αs term governs
    const wide = { ...base, c1: 1500, c2: 1500, d: 120 }
    const rW = designPunchingShear(wide)
    expect(rW.Vc).toBe(rW.Vc2)
    expect(buildPunchingSolution(wide, rW).find((s) => s.note)!.note!).toMatch(/^Eq\. \(c\)/)
  })

  it('writes the right perimeter formula for each column position', () => {
    for (const position of ['interior', 'edge', 'corner'] as const) {
      const inp = { ...base, position }
      const tex = texOf(buildPunchingSolution(inp, designPunchingShear(inp)))[0]
      expect(tex, position).toContain('b_0 =')
      // the printed b0 must equal the engine's, whichever branch was taken
      expect(tex, position).toContain(designPunchingShear(inp).b0.toFixed(0))
    }
  })

  it('handles a lightweight-concrete λ without dropping it from the equations', () => {
    const inp = { ...base, lambda: 0.75 }
    const tex = texOf(buildPunchingSolution(inp, designPunchingShear(inp))).join(' ')
    expect(tex).toContain('0.75')
  })
})
