import { describe, it, expect } from 'vitest'
import { warn, info, noteText, warningsOf, hasWarning } from './notes'
import { sampleInvestigation } from './sample'
import { evaluateTest } from './lab'
import { buildSoilsReport } from './report'

// ─────────────────────────────────────────────────────────────────────────
// Severity is only worth having if `warning` stays scarce. The guard for
// that is not a rule in a comment — it is the example investigation, whose
// laboratory data is deliberately well-formed: a well-run test must produce
// no warnings at all, or the field has degraded back into a `string[]`.
// ─────────────────────────────────────────────────────────────────────────

describe('the two severities', () => {
  it('builds and reads back', () => {
    const notes = [warn('re-weigh this'), info('percentages are of the fine earth')]
    expect(noteText(notes)).toEqual(['re-weigh this', 'percentages are of the fine earth'])
    expect(warningsOf(notes)).toEqual([{ severity: 'warning', text: 're-weigh this' }])
    expect(hasWarning(notes)).toBe(true)
    expect(hasWarning([info('x')])).toBe(false)
    expect(hasWarning([])).toBe(false)
  })
})

describe('a well-run test produces no warnings', () => {
  const results = () => sampleInvestigation().boreholes.flatMap((b) =>
    b.samples.flatMap((s) => s.tests.map((t) => ({ b, s, t, ...evaluateTest(t) }))))

  it('the example carries warnings ONLY where its data is genuinely short', () => {
    // The three sieve stacks with more than 10% fines cannot reach D₁₀, and
    // say so. Everything else in the example — a moisture content, a UCS, a
    // consolidation curve, a sedimentation run — is clean data and is silent.
    const warned = results()
      .filter((r) => r.outcome && hasWarning(r.outcome.result.notes))
      .map((r) => `${r.s.name} ${r.t.type}`)
    expect(warned).toEqual(['S-01 sieve', 'S-02 sieve', 'S-01 sieve'])
  })

  it('but it is not silent — the caveats are all still there, as info', () => {
    // The distinction is worthless if it were achieved by deleting notes.
    const infos = results().flatMap((r) => r.outcome?.result.notes ?? [])
      .filter((n) => n.severity === 'info')
    expect(infos.length).toBeGreaterThan(5)
    expect(noteText(infos).join(' ')).toMatch(/EQUIVALENT SPHERICAL diameter/)
  })
})

describe('warnings reach the report', () => {
  const s8 = () => buildSoilsReport(sampleInvestigation()).sections.find((s) => s.no === 8)!

  it('carries every engine warning, named by the specimen it belongs to', () => {
    const notes = s8().notes
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.every((n) => n.severity === 'warning')).toBe(true)
    for (const n of notes) expect(n.text).toMatch(/^BH-\d+ \/ S-\d+, .+: /)
  })

  it('leaves the info notes out — a dozen caveats is how the warnings get skimmed', () => {
    const all = sampleInvestigation().boreholes
      .flatMap((b) => b.samples.flatMap((s) => s.tests))
      .flatMap((t) => evaluateTest(t).outcome?.result.notes ?? [])
    expect(all.some((n) => n.severity === 'info')).toBe(true)
    expect(noteText(s8().notes).join(' ')).not.toMatch(/EQUIVALENT SPHERICAL/)
  })

  it('does NOT advise a hydrometer on the one sample that has one', () => {
    // The sieve engine cannot see the sedimentation run beside it. Printing
    // its advice next to that run's own result is the contradiction this
    // suppression exists to stop, and it is suppressed from the same
    // definition the classification uses.
    const texts = noteText(s8().notes).join(' ')
    expect(texts).toMatch(/S-01, Sieve analysis: The curve does not reach 10% passing/)
    expect(texts).not.toMatch(/S-02, Sieve analysis/)
  })
})
