import { describe, it, expect } from 'vitest'
import type { SolutionStep } from './solution'
import { designPunchingShear } from '../engine/punchingShear'
import { designTorsion } from '../engine/torsionDesign'
import { calcDevLength } from '../engine/devLength'
import { buildPunchingSolution } from './punchingSolution'
import { buildTorsionSolution } from './torsionSolution'
import { buildDevLengthSolution } from './devLengthSolution'

// ─────────────────────────────────────────────────────────────────────────
// What a worked solution has to be, applied to every builder at once.
//
// The complaint these exist to prevent: a report that prints answers without
// showing the formula, the substituted values, or the units — which is a
// results table, not a calculation sheet an engineer can check.
// ─────────────────────────────────────────────────────────────────────────

const punchIn = { c1: 400, c2: 400, d: 165, fc: 28, lambda: 1, Vu: 500, position: 'interior' as const }
const torsIn = {
  b: 400, h: 600, cover: 40, stirrupDia: 12, barDia: 20,
  fc: 28, fy: 415, fyt: 415, Tu: 80, Vu: 200, legs: 2, lambda: 1,
}
const devIn = {
  db: 20, fc: 28, fy: 415, topBar: false,
  epoxy: 'none' as const, lambda: 1, cbKtr_db: 1.5,
}

const BUILDERS: [string, () => SolutionStep[]][] = [
  ['punching shear', () => buildPunchingSolution(punchIn, designPunchingShear(punchIn))],
  ['torsion', () => buildTorsionSolution(torsIn, designTorsion(torsIn))],
  ['development length', () => buildDevLengthSolution(devIn, calcDevLength(devIn))],
]

const eqs = (steps: SolutionStep[]) =>
  steps.flatMap((s) => s.lines).filter((l): l is { tex: string } => 'tex' in l).map((l) => l.tex)
const texts = (steps: SolutionStep[]) =>
  steps.flatMap((s) => s.lines).filter((l): l is { text: string } => 'text' in l).map((l) => l.text)

describe.each(BUILDERS)('%s worked solution', (_name, build) => {
  const steps = build()

  it('has several titled steps, not one lump', () => {
    expect(steps.length).toBeGreaterThanOrEqual(3)
    for (const s of steps) expect(s.title.length).toBeGreaterThan(3)
  })

  it('cites a code clause on every step', () => {
    for (const s of steps) {
      expect(s.clause, s.title).toBeTruthy()
      expect(s.clause, s.title).toMatch(/§/)
    }
  })

  it('explains each step in words, not only symbols', () => {
    // An engineer checking a sheet needs to know WHY a step is there.
    expect(texts(steps).length).toBeGreaterThanOrEqual(steps.length)
    for (const t of texts(steps)) expect(t.length).toBeGreaterThan(30)
  })

  it('SUBSTITUTES values — every equation shows numbers, not just symbols', () => {
    for (const t of eqs(steps)) {
      expect(t, t.slice(0, 60)).toMatch(/\d/)
    }
  })

  it('shows a substitution chain, not a bare answer', () => {
    // At least most equations should read `symbol = substitution = result`,
    // i.e. carry two '=' signs. A few one-liners (a stated factor) are fine.
    const chained = eqs(steps).filter((t) => (t.match(/=/g) ?? []).length >= 2)
    expect(chained.length / eqs(steps).length).toBeGreaterThan(0.5)
  })

  it('carries units on the results', () => {
    const united = eqs(steps).filter((t) => /\\text\{\s*(mm|kN|MPa|kN·m|m)/.test(t) || /\\text\{mm\}\^2/.test(t))
    expect(united.length).toBeGreaterThanOrEqual(3)
  })

  it('never prints NaN, undefined or an empty substitution', () => {
    for (const t of [...eqs(steps), ...texts(steps)]) {
      expect(t).not.toMatch(/NaN|undefined|Infinity/)
    }
  })
})

describe('degenerate inputs do not produce a broken sheet', () => {
  it('survives a torsion case below the threshold', () => {
    // Torsion negligible: the At/s and Al steps are skipped entirely rather
    // than printing zeros as if they were a design.
    const low = { ...torsIn, Tu: 0.5 }
    const r = designTorsion(low)
    expect(r.torsionNeeded).toBe(false)
    const steps = buildTorsionSolution(low, r)
    expect(steps.some((s) => s.title.includes('Transverse torsional'))).toBe(false)
    for (const t of eqs(steps)) expect(t).not.toMatch(/NaN|undefined/)
  })

  it('survives a section that fails the interaction limit', () => {
    const heavy = { ...torsIn, Tu: 900, Vu: 2000 }
    const r = designTorsion(heavy)
    const steps = buildTorsionSolution(heavy, r)
    const check = steps.find((s) => s.pass !== undefined)!
    expect(check.pass).toBe(r.interactionOK)
    expect(eqs(steps).join(' ')).toContain('ENLARGE')
  })

  it('reports the 300 mm floor when development length falls under it', () => {
    const short = { ...devIn, db: 10, fy: 275, cbKtr_db: 2.5 }
    const r = calcDevLength(short)
    const steps = buildDevLengthSolution(short, r)
    const ldStep = steps.find((s) => s.title.includes('tension'))!
    if (r.ld_raw < 300) expect(ldStep.note).toMatch(/300 mm floor/)
    expect(eqs(steps).join(' ')).toContain(r.ld.toFixed(0))
  })
})
