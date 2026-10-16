import { describe, it, expect } from 'vitest'
import { implementedTests, evaluateTest } from './index'
import type { LabTest } from '../model'

// The lab forms store their data under string keys (`LabTest.data` is a
// Record), and the adapters in ./index read it back by name. A field the form
// writes under one name and the adapter reads under another does not fail —
// the adapter returns undefined and the test silently never computes, the same
// class as the micropile sheet's A_grout = 0. This fills every implemented form
// the way the page does — each field from its placeholder, each choice at the
// page's default, rows shaped like the page's row interfaces — and requires a
// result.
const ROWS: Record<string, Record<string, unknown>> = {
  'sieve-stack': { readings: [
    { size: 4.75, massRetained: 50 }, { size: 2, massRetained: 80 }, { size: 0.425, massRetained: 120 }, { size: 0.075, massRetained: 150 }] },
  'hydrometer-readings': { readings: [
    { time: 1, reading: 40, temperature: 20 }, { time: 2, reading: 35, temperature: 20 }, { time: 5, reading: 30, temperature: 20 },
    { time: 15, reading: 25, temperature: 20 }, { time: 60, reading: 20, temperature: 20 }] },
  'compaction-points': { points: [
    { moisture: 8, mouldSoilMass: 6050 }, { moisture: 11, mouldSoilMass: 6160 }, { moisture: 14, mouldSoilMass: 6190 }, { moisture: 17, mouldSoilMass: 6120 }] },
  'shear-points': { points: [{ normalStress: 50, peakShear: 45 }, { normalStress: 100, peakShear: 80 }, { normalStress: 200, peakShear: 150 }] },
  'triaxial-specimens': { specimens: [
    { cellPressure: 50, deviatorStress: 150 }, { cellPressure: 100, deviatorStress: 220 }, { cellPressure: 200, deviatorStress: 360 }] },
  'load-increments': { points: [
    { stress: 25, compression: 0.2 }, { stress: 50, compression: 0.4 }, { stress: 100, compression: 0.8 }, { stress: 200, compression: 1.4 }, { stress: 400, compression: 2.1 }] },
  'cbr-points': { points: [
    { penetration: 0.5, stress: 300 }, { penetration: 1, stress: 600 }, { penetration: 2.5, stress: 1200 }, { penetration: 5, stress: 1900 }] },
  'swell-reload': { points: [{ stress: 25, height: 20.9 }, { stress: 50, height: 20.6 }, { stress: 100, height: 20.2 }, { stress: 200, height: 19.9 }] },
}
// the page's own defaults for its pick-lists (SoilInvestigation.tsx)
const CHOICES = { method: undefined, soaked: 'false', testType: 'UU', effort: 'standard', soil: 'saturated-cohesive' }

describe('every lab form round-trips into its calculation', () => {
  for (const spec of implementedTests()) {
    it(spec.type, () => {
      const data: Record<string, unknown> = { ...CHOICES }
      if (spec.type === 'swell') data.method = 'A'
      if (spec.type === 'permeability') data.method = 'constant-head'
      for (const f of spec.fields) if (f.placeholder != null) data[f.key] = Number(f.placeholder)
      if (spec.formKind && ROWS[spec.formKind]) Object.assign(data, ROWS[spec.formKind])
      const r = evaluateTest({ id: 't', type: spec.type, standard: spec.standard, status: 'complete', data } as LabTest)
      // `{}` means the adapter rejected the data — a key it reads that the form did not write
      expect(r.outcome ?? r.error, `${spec.type}: adapter returned nothing for a full form`).toBeDefined()
      expect(r.error, `${spec.type}: ${r.error}`).toBeUndefined()
    })
  }
})
