// The worked solution is the only place the derivation is written out, so it
// gets the same treatment as the engine: every equation must actually render,
// in every branch, including the two failure branches.
import { describe, it, expect } from 'vitest'
import katex from 'katex'
import { buildTBeamSolution } from './tbeamSolution'
import { designTBeam, type TBeamKind } from '../engine/tbeam'

describe('T-beam worked solution', () => {
  it('every line renders under katex, across the branches', () => {
    const base = { bw: 300, h: 600, hf: 100, ln: 6, sw: 2.7, cover: 40, stirrupDia: 10, barDia: 25, fc: 21, fy: 415 }
    const cases = [
      { kind: 'interior' as TBeamKind, Mu: 400 }, { kind: 'interior' as TBeamKind, Mu: 1200 },
      { kind: 'edge' as TBeamKind, Mu: 400 }, { kind: 'edge' as TBeamKind, Mu: 800 },
      { kind: 'interior' as TBeamKind, Mu: -150 }, { kind: 'interior' as TBeamKind, Mu: 20 },
      { kind: 'isolated' as TBeamKind, Mu: 300 },
      { kind: 'interior' as TBeamKind, Mu: 100, AsGiven: 2500 },
      { kind: 'interior' as TBeamKind, Mu: 3000 },
      { kind: 'interior' as TBeamKind, Mu: -3000 },
    ]
    for (const c of cases) {
      const inp = { ...base, ...c }
      const steps = buildTBeamSolution(inp, designTBeam(inp))
      for (const s of steps) for (const ln of s.lines) {
        if ('tex' in ln) expect(() => katex.renderToString(ln.tex, { throwOnError: true })).not.toThrow()
      }
    }
  })
  it('the a-derivation step is present for design runs and absent when analyzing', () => {
    const base = { kind: 'interior' as TBeamKind, bw: 300, h: 600, hf: 100, ln: 6, sw: 2.7, cover: 40, stirrupDia: 10, barDia: 25, fc: 21, fy: 415 }
    const has = (i: Parameters<typeof designTBeam>[0]) =>
      buildTBeamSolution(i, designTBeam(i)).some((s) => s.title.startsWith('Required depth of the compression block'))
    expect(has({ ...base, Mu: 400 })).toBe(true)
    expect(has({ ...base, Mu: 1200 })).toBe(true)
    expect(has({ ...base, Mu: -150 })).toBe(true)
    expect(has({ ...base, Mu: 100, AsGiven: 2500 })).toBe(false)
  })
})
