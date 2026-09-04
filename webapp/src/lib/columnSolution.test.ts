import { describe, it, expect } from 'vitest'
import { columnRowSolution } from './modelSpaceSolutions'
import { designStructure, type ColumnScheduleRow } from '../engine/pipeline'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import type { RectSection } from '../engine/model'

// ─────────────────────────────────────────────────────────────────────────
// THE SCHEDULE AND ITS OWN WORKED SOLUTION MUST AGREE.
//
// Reported from the app: a row reading 81% expanded to a worked solution
// ending "utilisation 0.27". The row's number is the BIAXIAL check —
// `pmCapacityBiaxial`, consuming Mux and Muy — and the solution was printing a
// uniaxial check at e = Mux/Pu, which is one of the two points that check is
// built from and not its answer.
//
// Worse, the P–M step was gated on e = Mux/Pu, so a column bending only about
// its WEAK axis printed no P–M step at all while its row still showed a
// utilisation.
// ─────────────────────────────────────────────────────────────────────────
const section: RectSection = {
  id: 's1', name: 'C1', b: 300, h: 450, fc: 21, fy: 415, barDia: 20, tieDia: 10, cover: 40,
}
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section })
model.loads = buildGravityLoads(model, 4.8, 2.4)
const design = designStructure(model, soil as never)!

/** Every line in the solution that claims to be THE utilisation. */
const utilisations = (row: ColumnScheduleRow): number[] => {
  const out: number[] = []
  for (const s of columnRowSolution(section, row)) {
    for (const l of s.lines) {
      const tex = 'tex' in l ? l.tex : ''
      const m = /utilisation \}\s*([\d.]+)/.exec(tex)
      if (m) out.push(Number(m[1]))
    }
  }
  return out
}
const utilOf = (row: ColumnScheduleRow): number | null => {
  const u = utilisations(row)
  return u.length ? u[u.length - 1]! : null
}

describe('the column worked solution ends on the number its row prints', () => {
  it('has columns whose biaxial utilisation is NOT the strong-axis one', () => {
    // If every column in the fixture bent about one axis only, the test below
    // would pass on a broken build.
    expect(design.columns.some((c) => c.Mu > 1e-6 && c.Muy > 1e-6)).toBe(true)
    expect(design.columns.some((c) => c.Mu <= 1e-9 && c.Muy > 1e-6)).toBe(true)
  })

  it('agrees with the row, for every column in the frame', () => {
    for (const c of design.columns) {
      const printed = utilOf(c)
      expect(printed, `${c.id} printed no utilisation`).not.toBeNull()
      // The solution prints to 2 dp; the row is the same number.
      expect(printed!, c.id).toBeCloseTo(Number(c.util.toFixed(2)), 9)
    }
  })

  it('shows the P–M check on a column bending only about its WEAK axis', () => {
    const weak = design.columns.find((c) => c.Mu <= 1e-9 && c.Muy > 1e-6)!
    const titles = columnRowSolution(section, weak).map((s) => s.title)
    expect(titles.some((t) => /Biaxial check/.test(t))).toBe(true)
    expect(utilOf(weak)).toBeCloseTo(Number(weak.util.toFixed(2)), 9)
  })

  it('claims exactly ONE utilisation, so there is nothing to misquote', () => {
    // The strong-axis ray is a real step and carries a real ratio, but it is
    // an INPUT to the combination — on a column with genuine Muy it can be
    // half the number the schedule prints. It reports a strong-axis ratio;
    // only the biaxial step says "utilisation".
    for (const c of design.columns) {
      expect(utilisations(c).length, c.id).toBe(1)
    }
  })

  it('names the rule that combined the two moments', () => {
    for (const c of design.columns.slice(0, 6)) {
      const step = columnRowSolution(section, c).find((s) => /Biaxial check/.test(s.title))!
      expect(step).toBeDefined()
      expect(step.title).toMatch(/Bresler|load contour|uniaxial/)
    }
  })

  it('prints BOTH moments, so the reader can check the combination', () => {
    const c = design.columns.find((x) => x.Mu > 1e-6 && x.Muy > 1e-6)!
    const step = columnRowSolution(section, c).find((s) => /Biaxial check/.test(s.title))!
    const tex = step.lines.map((l) => ('tex' in l ? l.tex : '')).join(' ')
    expect(tex).toContain('M_{ux}')
    expect(tex).toContain('M_{uy}')
    expect(tex).toContain(c.Muy.toFixed(1))
  })

  it('still explains the strong-axis ray, which the combination is built from', () => {
    const c = design.columns.find((x) => x.Mu > 1e-6 && x.Muy > 1e-6)!
    const titles = columnRowSolution(section, c).map((s) => s.title)
    expect(titles.some((t) => /Capacity along the strong-axis demand ray/.test(t))).toBe(true)
    // …and the biaxial step comes after it, because it is the answer.
    expect(titles.findIndex((t) => /Biaxial check/.test(t)))
      .toBeGreaterThan(titles.findIndex((t) => /Capacity along the strong-axis demand ray/.test(t)))
  })
})
