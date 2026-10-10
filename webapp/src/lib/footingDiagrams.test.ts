import { describe, expect, it } from 'vitest'
import { stripAt, stripSamples } from './footingDiagrams'

// The strip's numbers have to close on the sheet's own — the flexure step's
// Mu at the face, oneWayShearDepth's Vu at d beyond it — because the diagram
// sits in the same report as those steps. Defaults mirror the page's square
// footing: B = 2.8 m, c = 0.4 m, qu = 178.6 kPa (Pu 1400 / 2.8²), d = 405 mm.
const B = 2.8, c = 0.4, qu = 1400 / (B * B), Pu = 1400, d = 405

const square = () => stripSamples({ L: B, stripW: B, qu, Pu, c, d })

describe('stripSamples — the design strip the sheet quotes', () => {
  it('carries the design pressure as a uniform w over the strip width', () => {
    const s = square()
    expect(s.w.every((v) => Math.abs(v - qu * B) < 1e-9)).toBe(true)
  })

  it('V at the column face is the cantilever push qu·b·a', () => {
    const s = square()
    const arm = (B - c) / 2
    expect(s.faces[0]).toBeCloseTo(arm, 12)
    expect(stripAt({ L: B, stripW: B, qu, Pu, c }, s.faces[0]).V).toBeCloseTo(qu * B * arm, 9)
  })

  it('V at the §22.5 section equals oneWayShearDepth\'s Vu = qu·b·(a − d)', () => {
    const s = square()
    const arm = (B - c) / 2
    expect(s.crits).not.toBeNull()
    const xCrit = (s.crits as [number, number])[0]
    expect(stripAt({ L: B, stripW: B, qu, Pu, c }, xCrit).V).toBeCloseTo(qu * B * (arm - d / 1000), 9)
  })

  it('M at the column face is the flexure step\'s Mu = qu·b·a²/2', () => {
    const s = square()
    const arm = (B - c) / 2
    expect(stripAt({ L: B, stripW: B, qu, Pu, c }, s.faces[0]).M).toBeCloseTo((qu * B * arm * arm) / 2, 9)
  })

  it('balances: zero shear at both edges and at the centreline', () => {
    const s = square()
    expect(s.V[0]).toBeCloseTo(0, 9)
    expect(s.V[s.V.length - 1]).toBeCloseTo(0, 9)
    const mid = s.V[Math.floor(s.V.length / 2)]
    expect(mid).toBeCloseTo(0, 9)
  })

  it('marks the faces at c/2 off the centreline, and the sections d beyond them', () => {
    const s = square()
    expect(s.faces[0]).toBeCloseTo(B / 2 - c / 2, 12)
    expect(s.faces[1]).toBeCloseTo(B / 2 + c / 2, 12)
    expect((s.crits as [number, number])[0]).toBeCloseTo((B - c) / 2 - d / 1000, 12)
    expect((s.crits as [number, number])[1]).toBeCloseTo(B - ((B - c) / 2 - d / 1000), 12)
  })

  it('drops the §22.5 marks when d reaches past the cantilever arm', () => {
    const s = stripSamples({ L: B, stripW: B, qu, Pu, c, d: (B - c) / 2 * 1000 })
    expect(s.crits).toBeNull()
  })

  it('grows the moment parabola past the face towards the centreline', () => {
    const s = square()
    const mid = s.M[Math.floor(s.M.length / 2)]
    expect(mid).toBeGreaterThan(stripAt({ L: B, stripW: B, qu, Pu, c }, s.faces[0]).M)
  })

  it('designs each rectangular direction on its own strip', () => {
    // 3.6 × 2.4 m pad, 0.4 × 0.4 column: the long strip is By wide, the
    // short one Bx wide — the strips the flexure steps design.
    const Bx = 3.6, By = 2.4, q = 1400 / (Bx * By)
    const long = { L: Bx, stripW: By, qu: q, Pu, c }
    const short = { L: By, stripW: Bx, qu: q, Pu, c }
    const armX = (Bx - c) / 2, armY = (By - c) / 2
    expect(stripAt(long, Bx / 2 - c / 2).M).toBeCloseTo((q * By * armX * armX) / 2, 9)
    expect(stripAt(short, By / 2 - c / 2).M).toBeCloseTo((q * Bx * armY * armY) / 2, 9)
  })
})
