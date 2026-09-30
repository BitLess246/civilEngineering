import { describe, it, expect } from 'vitest'
import type { HingeReport } from '../engine/nonlinearFrame'
import { hingeDemand, yieldedByDemand, yieldSummary, ONSET_PLASTIC_RAD } from './hingeEnvelope'

const hinge = (o: Partial<HingeReport> & { member: string }): HingeReport => ({
  end: 'i', moment: 0, rotation: 0, plastic: 0, yielded: false, dissipated: 0, ...o,
})
// The reported case: a beam end that met 617 kN·m at 0.85 s, 1.5 µrad plastic,
// and ended the record carrying a −8.3 kN·m residual.
const reported = hinge({
  member: '0|6500~6000|6500', moment: -8.27, rotation: 1.47e-6, plastic: 1.51e-6, yielded: true, dissipated: 9.3e-4,
  envelope: { peakMoment: 616.98, capacity: 616.98, time: 0.85, maxPlastic: 1.51e-6, firstYield: 0.85 },
})

describe('hingeDemand', () => {
  it('reports the peak and the capacity it met, not the residual', () => {
    expect(hingeDemand(reported)).toEqual({ moment: 616.98, capacity: 616.98, plastic: 1.51e-6, firstYield: 0.85 })
  })
  it('falls back to the end state (a pushover) with no capacity column', () => {
    const push = hinge({ member: 'c1', moment: 250, plastic: -0.004, yielded: true })
    expect(hingeDemand(push)).toEqual({ moment: 250, capacity: null, plastic: 0.004, firstYield: null })
  })
})

describe('yieldedByDemand / yieldSummary', () => {
  const big = hinge({ member: 'b', yielded: true,
    envelope: { peakMoment: 300, capacity: 290, time: 2, maxPlastic: 0.006, firstYield: 1.1 } })
  const elastic = hinge({ member: 'e', envelope: { peakMoment: 100, capacity: 290, time: 2, maxPlastic: 0, firstYield: null } })

  it('lists only yielded hinges, most plastic rotation first', () => {
    expect(yieldedByDemand([reported, elastic, big]).map((h) => h.member)).toEqual(['b', '0|6500~6000|6500'])
  })

  it('calls a hinge that barely touched capacity the onset of yield, with the real rotation', () => {
    expect(ONSET_PLASTIC_RAD).toBe(1e-4)
    expect(yieldSummary([reported, elastic])).toEqual({ tag: 'onset of yield',
      sentence: 'onset of yield only — the hinges reached their capacity but the largest plastic rotation is 0.002 mrad' })
    expect(yieldSummary([reported, big])).toEqual({ tag: 'θp up to 6.000 mrad', sentence: 'largest plastic rotation 6.000 mrad' })
    expect(yieldSummary([elastic])).toBeNull()
  })
})
