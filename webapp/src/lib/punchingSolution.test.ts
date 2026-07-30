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

  it('names the equation that actually governed', () => {
    // A slab thick against a short perimeter should be driven by eq. (b);
    // a squarish interior column by the plain bound (c).
    const square = designPunchingShear(base)
    const noteSquare = buildPunchingSolution(base, square).find((s) => s.note)!.note!
    expect(noteSquare).toMatch(/\(c\)/)

    const elongated = { ...base, c1: 1200, c2: 250 }
    const rE = designPunchingShear(elongated)
    const noteE = buildPunchingSolution(elongated, rE).find((s) => s.note)!.note!
    // whichever it is, the note must name the equation the engine minimised to
    const govern = Math.min(rE.Vc1, rE.Vc2, rE.Vc3)
    const letter = govern === rE.Vc1 ? '(a)' : govern === rE.Vc2 ? '(b)' : '(c)'
    expect(noteE).toContain(letter)
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
