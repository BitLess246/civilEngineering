import { describe, it, expect } from 'vitest'
import { designSquareFooting } from '../engine/isolatedFooting'
import { buildFoundationSolution, type SolutionCtx } from './foundationSolution'

const input = {
  serviceLoad: 1000, ultimateLoad: 1400, columnWidth: 400,
  fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24,
  H: 1.5, barDia: 20, cover: 75, surcharge: 0, position: 'interior' as const,
}

function squareCtx(): SolutionCtx {
  const r = designSquareFooting(input)
  return {
    type: 'square', loading: 'concentric',
    serviceLoad: input.serviceLoad, ultimateLoad: input.ultimateLoad, serviceMoment: 0, ultimateMoment: 0,
    columnWidth: input.columnWidth, fc: input.fc, fy: input.fy,
    qAllow: input.qAllow, gammaSoil: input.gammaSoil, gammaConc: input.gammaConc, H: input.H,
    barDia: input.barDia, cover: input.cover, surcharge: 0, position: 'interior',
    Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
    dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam,
    long: { As: r.steelArea, rho: r.rho, usedMin: r.usedMinSteel, bars: r.bars, spacing: r.barSpacing },
    short: null, ecc: null,
  }
}

describe('foundation worked solution', () => {
  it('square: produces the full step sequence ending in bar selection', () => {
    const steps = buildFoundationSolution(squareCtx())
    const titles = steps.map((s) => s.title)
    expect(titles[0]).toMatch(/Net allowable/)
    expect(titles).toContain('Two-way (punching) shear')
    expect(titles.some((t) => t.startsWith('Flexural'))).toBe(true)
    expect(titles[titles.length - 1]).toMatch(/Bar selection/)
  })

  it('square: flexure As in the solution matches the engine result', () => {
    const r = designSquareFooting(input)
    const steps = buildFoundationSolution(squareCtx())
    const flex = steps.find((s) => s.title.startsWith('Flexural'))!
    // the As line carries the rounded engine area
    expect(flex.lines.some((l) => l.tex.includes(`${Math.round(r.steelArea)}`))).toBe(true)
    const bars = steps.find((s) => s.title.startsWith('Bar selection'))!
    expect(bars.note).toContain(`${r.bars} ⌀20`)
  })
})
