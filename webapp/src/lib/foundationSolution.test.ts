import { describe, it, expect } from 'vitest'
import { designSquareFooting, type SquareFootingInput } from '../engine/isolatedFooting'
import { buildFoundationSolution, type SolutionCtx } from './foundationSolution'

const input: SquareFootingInput = {
  serviceLoad: 1000, ultimateLoad: 1400, columnWidth: 400,
  fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24,
  H: 1.5, barDia: 20, cover: 75, surcharge: 0, position: 'interior',
}

function squareCtx(over: Partial<SquareFootingInput> = {}): SolutionCtx {
  const r = designSquareFooting({ ...input, ...over })
  return {
    type: 'square', loading: 'concentric', analysis: r.analysis, method: r.method,
    serviceLoad: input.serviceLoad, ultimateLoad: input.ultimateLoad, serviceMoment: 0, ultimateMoment: 0,
    columnWidth: input.columnWidth, fc: input.fc, fy: input.fy,
    qAllow: input.qAllow, gammaSoil: input.gammaSoil, gammaConc: input.gammaConc, H: input.H,
    barDia: input.barDia, cover: input.cover, surcharge: 0, position: 'interior',
    Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
    dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam, dProvided: r.dProvided,
    punchOK: r.punchOK, beamOK: r.beamOK,
    long: { As: r.steelArea, rho: r.rho, usedMin: r.usedMinSteel, bars: r.bars, spacing: r.barSpacing },
    short: null, ecc: null,
  }
}

const texOf = (s: { lines: ({ tex: string } | { text: string })[] }) =>
  s.lines.filter((l): l is { tex: string } => 'tex' in l).map((l) => l.tex).join(' ')

describe('foundation worked solution', () => {
  it('square design: full sequence with commentary, ending in development length', () => {
    const steps = buildFoundationSolution(squareCtx())
    const titles = steps.map((s) => s.title)
    expect(titles[0]).toBe('Service & factored loads')
    expect(titles).toContain('Two-way (punching) shear')
    expect(titles[titles.length - 1]).toMatch(/Development length/)
    // each step carries an explanatory sentence (commentary), not just equations
    expect(steps.every((s) => s.lines.some((l) => 'text' in l))).toBe(true)
  })

  it('square: flexure As and bar count in the solution match the engine', () => {
    const r = designSquareFooting(input)
    const steps = buildFoundationSolution(squareCtx())
    const flex = steps.find((s) => s.title.startsWith('Flexural'))!
    expect(texOf(flex)).toContain(`${Math.round(r.steelArea)}`)
    const bars = steps.find((s) => s.title.startsWith('Bar selection'))!
    expect(bars.note).toContain(`${r.bars} ⌀20`)
  })

  it('analyze mode shows the given section and a depth-adequacy check', () => {
    const r = designSquareFooting(input)
    const steps = buildFoundationSolution(squareCtx({ analysis: 'analyze', givenB: r.B, givenDc: r.Dc }))
    const titles = steps.map((s) => s.title)
    expect(titles).toContain('Given section')
    expect(titles).toContain('Depth adequacy')
    expect(titles).not.toContain('Required area and footing size')
  })

  it('approximate method notes the assumed trial thickness', () => {
    const steps = buildFoundationSolution(squareCtx({ solutionMethod: 'approximate' }))
    const bearing = steps.find((s) => s.title.startsWith('Net allowable'))!
    expect(bearing.lines.some((l) => 'text' in l && l.text.includes('Approximate'))).toBe(true)
  })

  it('individual loads: the loads step derives P and Pu from D & L', () => {
    const ctx = { ...squareCtx(), loads: { dead: 600, live: 400 } }
    const steps = buildFoundationSolution(ctx)
    const loads = steps[0]
    expect(loads.title).toBe('Service & factored loads')
    const tex = texOf(loads)
    expect(tex).toContain('D + L = 600 + 400')
    expect(tex).toContain('840.0')          // 1.4D
    expect(tex).toContain('1360.0')         // 1.2D + 1.6L (governs)
    expect(loads.note).toContain('1.2D + 1.6L governs')
  })
})
