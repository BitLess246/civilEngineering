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
      // over-reinforced: the fs < fy branch, which is where the stress check,
      // the re-solve and the Varignon lever arm are written out.
      { kind: 'interior' as TBeamKind, Mu: 100, AsGiven: 12000 },
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

// ─────────────────────────────────────────────────────────────────────────
// THE CORRECTION HAS TO BE SHOWN, not just applied.
//
// The engine used to stop at "assume fs = fy", and so did the solution. A
// reader checking the sheet against a textbook would find the same wrong
// number in both places and no sign that a step was missing.
// ─────────────────────────────────────────────────────────────────────────
describe('T-beam worked solution — the stress check and its correction', () => {
  const base = {
    kind: 'interior' as TBeamKind, bw: 300, h: 500, hf: 100, bfGiven: 800,
    cover: 40, stirrupDia: 12, barDia: 26, fc: 28, fy: 345, Mu: 500,
  }
  const titles = (AsGiven: number) => {
    const i = { ...base, AsGiven }
    return buildTBeamSolution(i, designTBeam(i)).map((s) => s.title)
  }

  it('always asks the question', () => {
    for (const As of [2000, 12000]) {
      expect(titles(As)).toContain('Stress check — does the steel actually reach fy?')
    }
  })

  it('shows the re-solve ONLY when the assumption failed', () => {
    const light = { ...base, AsGiven: 2000 }, heavy = { ...base, AsGiven: 12000 }
    expect(designTBeam(light).fsYields).toBe(true)
    expect(designTBeam(heavy).fsYields).toBe(false)
    expect(titles(2000)).not.toContain('Re-solve with fs on the strain diagram')
    expect(titles(12000)).toContain('Re-solve with fs on the strain diagram')
  })

  it('marks the stress-check step passed or failed, so it reads at a glance', () => {
    const step = (As: number) => buildTBeamSolution({ ...base, AsGiven: As },
      designTBeam({ ...base, AsGiven: As }))
      .find((s) => s.title.startsWith('Stress check'))!
    expect(step(2000).pass).toBe(true)
    expect(step(12000).pass).toBe(false)
  })

  it('an analyze run does not test the moment against the flange couple', () => {
    // The block on an analyze run comes from the STEEL, so quoting φMn,f ≥ Mu
    // there answered a question nobody asked — and contradicted the
    // equilibrium two steps later whenever the two disagreed.
    const i = { ...base, AsGiven: 9000 }
    const step = buildTBeamSolution(i, designTBeam(i))
      .find((s) => s.title === 'Rectangular or T behaviour?')!
    const tex = step.lines.map((l) => ('tex' in l ? l.tex : '')).join(' ')
    expect(tex).toContain('C_{flange,max}')
    expect(tex).not.toContain('M_u')
  })

  it('prints the lever arm as the block centroid, not as a/2', () => {
    const i = { ...base, AsGiven: 12000 }
    const r = designTBeam(i)
    expect(r.tBehavior).toBe(true)
    const step = buildTBeamSolution(i, r).find((s) => s.title.startsWith('Lever arm'))!
    const tex = step.lines.map((l) => ('tex' in l ? l.tex : '')).join(' ')
    expect(tex).toContain(String.raw`\bar{y}`)
    expect(r.yBar).not.toBeCloseTo(r.a / 2, 1)     // a T block's centroid is not mid-depth
  })
})
