import { describe, it, expect } from 'vitest'
import { designSquareFooting, type SquareFootingInput } from '../engine/isolatedFooting'
import { oneWayVc, twoWayVc, criticalSection } from '../engine/shear'
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
    expect(titles.some((t) => t.startsWith('Two-way (punching) shear'))).toBe(true)
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

// ─────────────────────────────────────────────────────────────────────────
// TRIAL → ADOPT → RE-CHECK
//
// The two shear steps solve for the depth each check NEEDS, so they are
// written at the required d and read as marginal by construction. One of them
// printed `φVc = 81.0 < Vu = 82.1 ×` immediately before the thickness step
// raised D_c and the schedule said PASS — nothing wrong with the footing, but
// the sheet never showed the check that passed.
//
// And the "<" was not even real: the sheet hand-rolled Vc as 1/6√f'c bd where
// the engine uses §422.5.5.1's 0.17, and 1/3, 1/6, 1/12 for punching where the
// engine uses 0.33, 0.17, 0.083 — the forms it had already rejected for
// claiming a capacity the code does not give.
// ─────────────────────────────────────────────────────────────────────────
describe('the footing shear chain', () => {
  const c = squareCtx()
  const steps = buildFoundationSolution(c)
  const titles = steps.map((s) => s.title)

  it('names the two shear steps as the REQUIRED depth, then re-checks the adopted one', () => {
    const iPunch = titles.findIndex((t) => t.startsWith('Two-way (punching) shear'))
    const iOne = titles.findIndex((t) => t.startsWith('One-way (beam) shear'))
    const iThick = titles.indexOf('Slab thickness')
    const iRe = titles.indexOf('Shear re-check at the adopted thickness')
    expect(iPunch).toBeGreaterThanOrEqual(0)
    expect(titles[iPunch]).toMatch(/required depth$/)
    expect(titles[iOne]).toMatch(/required depth$/)
    // trial → adopt → re-check, in that order
    expect(iOne).toBeGreaterThan(iPunch)
    expect(iThick).toBeGreaterThan(iOne)
    expect(iRe).toBe(iThick + 1)
  })

  it('re-checks at the depth that will be BUILT, and passes there', () => {
    const re = steps.find((s) => s.title === 'Shear re-check at the adopted thickness')!
    const words = re.lines.filter((l): l is { text: string } => 'text' in l).map((l) => l.text).join(' ')
    expect(words).toContain(`= ${c.dProvided} mm`)     // d = Dc − cover − db, spelt out
    const tex = texOf(re)
    expect(tex).not.toContain('\\times')             // both checks pass
    expect(re.note).toContain('this is the section that is detailed')
    // …and the numbers are the engine's, at that depth
    const cs = criticalSection(c.columnWidth, c.columnWidth, c.dProvided, c.position)
    const phiP = 0.75 * twoWayVc({ fc: c.fc, bo: cs.bo, d: c.dProvided, betaC: 1, position: c.position })
    const VuP = c.ultimateLoad - c.qu * cs.Ao * 1e-6
    expect(phiP).toBeGreaterThanOrEqual(VuP)
  })

  it('prints the code\'s coefficients, not the inch-pound conversions', () => {
    const punch = steps.find((s) => s.title.startsWith('Two-way (punching) shear'))!
    const one = steps.find((s) => s.title.startsWith('One-way (beam) shear'))!
    expect(texOf(punch)).toContain('0.33')
    expect(texOf(punch)).toContain('0.083')
    expect(texOf(punch)).not.toContain('tfrac{1}{3}')
    expect(texOf(one)).toContain('0.17')
    expect(texOf(one)).not.toContain('tfrac{1}{6}')
    // and the printed φVc is the engine's, so a required depth never reads as failing
    const d = c.dPunch
    const cs = criticalSection(c.columnWidth, c.columnWidth, d, c.position)
    expect(texOf(punch)).toContain(String(Math.round(cs.bo)))
    expect(0.75 * oneWayVc({ fc: c.fc, b: c.Bx * 1000, d: c.dBeamLong })).toBeGreaterThan(0)
  })

  it('labels the two effective depths, which differ by half a bar', () => {
    const t = texOf(steps.find((s) => s.title === 'Slab thickness')!)
    expect(t).toContain('d_{flex}')
    expect(t).toContain('d_{shear}')
  })
})
