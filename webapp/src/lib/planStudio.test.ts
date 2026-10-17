import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STUDIO, STUDIO_KINDS, buildStudio, studioModel, applyStudioRebar, sanitizeStudio,
  barsPerRow, layersFor, matSpacing, minClearSpacing, sheetsOf, type StudioInput,
} from './planStudio'
import { designStructure } from '../engine/pipeline'
import { buildStructureCages, FOOTING_COVER } from '../engine/cageBuilder'
import type { RebarCage } from '../engine/rebarModel'

// The studio's promise is that the SHEETS carry the user's numbers. Each test
// follows one number from the input to the placed steel — the cage every
// sheet is drawn from — rather than to a schedule string.

/** Bars of `role` in `cage` whose run passes station x along the beam (m). */
function barsAcross(cage: RebarCage, role: 'top' | 'bottom', x: number): number {
  return cage.runs
    .filter((r) => r.role === role)
    .filter((r) => {
      const xs = r.path.map((p) => p[0])
      return Math.min(...xs) < x - 1e-6 && Math.max(...xs) > x + 1e-6
    })
    .reduce((n, r) => n + r.count, 0)
}

function placed(i: StudioInput) {
  const s = sanitizeStudio(i)
  const model = studioModel(s)
  const designed = designStructure(model, { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: s.footing.depth })!
  const design = applyStudioRebar(designed, s)
  return { model, design, cages: buildStructureCages(model, design).cages }
}

describe('closed forms the studio leans on', () => {
  it('§425.2.1 clear spacing is the larger of 25 mm and db', () => {
    expect(minClearSpacing(16)).toBe(25)
    expect(minClearSpacing(32)).toBe(32)
  })
  it('bars per row: 300 wide, 40 cover, ⌀10 stirrups, ⌀20 bars → (200 + 25) / 45 = 5', () => {
    expect(barsPerRow(300, 40, 10, 20)).toBe(5)
    expect(barsPerRow(250, 40, 10, 25)).toBe(3)       // (150 + 25) / 50
  })
  it('layers fill the first row first', () => {
    expect(layersFor(7, 5)).toEqual([5, 2])
    expect(layersFor(4, 5)).toEqual([4])
  })
  it('mat spacing: a 1.5 m pad, 9 ⌀16 bars at 75 cover → (1500 − 150 − 16) / 8', () => {
    expect(matSpacing(1.5, 9, 16)).toBeCloseTo((1500 - 2 * FOOTING_COVER - 16) / 8, 9)
  })
})

describe('the user\'s steel reaches the cages', () => {
  const custom: StudioInput = {
    ...DEFAULT_STUDIO,
    beam: { ...DEFAULT_STUDIO.beam, top: 4, bottom: 3, sEnd: 90, sMid: 180 },
    column: { ...DEFAULT_STUDIO.column, bars: 12 },
    footing: { ...DEFAULT_STUDIO.footing, B: 1.8, Dc: 400, bars: 11, barDia: 16 },
  }
  const { cages } = placed(custom)
  const beam = cages.find((c) => c.member === 'bx0.0.1')!

  it('beam: the top count over the support, the bottom count at midspan', () => {
    expect(barsAcross(beam, 'top', 0.4)).toBe(4)
    expect(barsAcross(beam, 'bottom', 3)).toBe(3)
  })

  it('beam: stirrups at the end spacing near the support and the middle spacing at midspan', () => {
    const st = beam.runs.filter((r) => r.role === 'stirrup')
      .map((r) => r.path.reduce((a, p) => a + p[0], 0) / r.path.length).sort((a, b) => a - b)
    const gaps = st.slice(1).map((x, k) => Math.round((x - st[k]) * 1000))
    // the end zone at sEnd; the middle DIVIDED into equal gaps no wider than
    // sMid (176 here); laps close up to their own pitch, never wider
    expect(gaps[0]).toBe(90)
    expect(gaps[gaps.length - 1]).toBe(90)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(180)
    expect(Math.max(...gaps)).toBeGreaterThan(150)
  })

  it('column: every vertical bar the user asked for', () => {
    const col = cages.find((c) => c.member === 'c0.0.0')!
    // the bars are lapped in staggered pieces; mid-storey, clear of every lap,
    // each bar is one piece
    const across = col.runs.filter((r) => r.role === 'vertical')
      .filter((r) => { const ys = r.path.map((p) => p[1]); return Math.min(...ys) < 3 && Math.max(...ys) > 3 })
      .reduce((n, r) => n + r.count, 0)
    expect(across).toBe(12)
  })

  it('footing: the pad\'s side and its mat', () => {
    const ft = cages.find((c) => c.member.startsWith('F-'))!
    const xs = ft.runs.flatMap((r) => r.path.map((p) => p[0]))
    // the mat spans the pad less cover each side
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1.8)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.8 - 2 * 0.075 - 0.05)
    const matBars = ft.runs.filter((r) => r.role === 'mat').reduce((n, r) => n + r.count, 0)
    expect(matBars).toBe(22)          // 11 each way
  })
})

describe('bars that cannot fit one row', () => {
  it('are split into layers, and the note says so', () => {
    const r = buildStudio({ ...DEFAULT_STUDIO, beam: { ...DEFAULT_STUDIO.beam, b: 250, top: 6 } })
    expect(r.notes.some((n) => /top steel is drawn in 2 layers \(3 \+ 3\)/.test(n))).toBe(true)
  })
})

describe('the sheet set', () => {
  const r = buildStudio(DEFAULT_STUDIO)

  it('builds without error and offers every family', () => {
    expect(r.error).toBeUndefined()
    for (const k of STUDIO_KINDS) expect(sheetsOf(r.sheets, k.kind).length, k.label).toBeGreaterThan(0)
  })

  it('draws the user\'s geometry: three bays give grids A–D on the plans', () => {
    const three = buildStudio({ ...DEFAULT_STUDIO, baysX: [5, 5, 5] })
    const plan = sheetsOf(three.sheets, 'plans')[0]
    const labels = plan.drawing.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    for (const g of ['A', 'B', 'C', 'D']) expect(labels).toContain(g)
  })

  it('titles each footing sheet with the pad the user sized', () => {
    const big = buildStudio({ ...DEFAULT_STUDIO, footing: { ...DEFAULT_STUDIO.footing, B: 2.1 } })
    expect(sheetsOf(big.sheets, 'footings').every((s) => /2100×2100/.test(s.title))).toBe(true)
  })

  it('a nonsense input is drawn as the defaults, never thrown', () => {
    const bad = sanitizeStudio({ ...DEFAULT_STUDIO, baysX: [-1, Number.NaN], beam: { ...DEFAULT_STUDIO.beam, top: 0.4, sEnd: -5 } })
    expect(bad.baysX).toEqual(DEFAULT_STUDIO.baysX)
    expect(bad.beam.top).toBe(2)
    expect(bad.beam.sEnd).toBe(DEFAULT_STUDIO.beam.sEnd)
  })
})
