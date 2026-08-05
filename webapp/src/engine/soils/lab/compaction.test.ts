import { describe, it, expect } from 'vitest'
import {
  compaction, zeroAirVoids, saturationOf, relativeCompaction, G,
  type CompactionData, type CompactionPoint,
} from './compaction'
import { compactionChart } from './plots'
import { evaluateTest, summarise, readCompaction, labSpec, isImplemented } from './index'
import type { LabTest } from '../model'

// ─────────────────────────────────────────────────────────────────────────
// ASTM D698 / D1557. Two things carry the weight here and both are checked
// against arithmetic that can be done on paper:
//   • ρd = (M_t − M_m)/V / (1 + w/100) — no fitting, just the definition
//   • the peak, which is INTERPOLATED and therefore the part that can be
//     silently wrong. It is tested by planting a parabola and demanding the
//     vertex back (the lesson from Phase 4d's σ′p, which was wrong by 5× and
//     passed a loose range assertion).
// ─────────────────────────────────────────────────────────────────────────

/** 4-inch mould: 944 cm³, 4250 g empty. */
const MOULD = { mouldVolume: 944, mouldMass: 4250 }

/** Points lying exactly on ρd = a·w² + b·w + c, so the vertex is known. */
function plantedCurve(a: number, b: number, c: number, ws: number[]): CompactionPoint[] {
  return ws.map((w) => {
    const rhoD = a * w * w + b * w + c
    const wet = rhoD * (1 + w / 100)                       // Mg/m³
    return { moisture: w, mouldSoilMass: MOULD.mouldMass + wet * MOULD.mouldVolume }
  })
}

describe('dry density of a compacted specimen (D698)', () => {
  it('matches a hand calculation', () => {
    // Mould + soil 6100 g, mould 4250 g ⇒ 1850 g of wet soil in 944 cm³
    // ρ = 1850/944 = 1.9598 Mg/m³;  at w = 12%: ρd = 1.9598/1.12 = 1.7498
    const d: CompactionData = {
      ...MOULD,
      points: [
        { moisture: 12, mouldSoilMass: 6100 },
        { moisture: 14, mouldSoilMass: 6150 },
        { moisture: 16, mouldSoilMass: 6120 },
      ],
    }
    const r = compaction(d)
    expect(r.rows[0].wetDensity).toBeCloseTo(1.959746, 6)
    expect(r.rows[0].dryDensity).toBeCloseTo(1.749773, 6)
    expect(r.rows[0].dryUnitWeight).toBeCloseTo(1.749773 * G, 6)
  })

  it('sorts the points by water content whatever order they were entered', () => {
    const r = compaction({
      ...MOULD,
      points: [
        { moisture: 16, mouldSoilMass: 6120 },
        { moisture: 12, mouldSoilMass: 6100 },
        { moisture: 14, mouldSoilMass: 6150 },
      ],
    })
    expect(r.rows.map((x) => x.moisture)).toEqual([12, 14, 16])
  })

  it('refuses a specimen no heavier than the empty mould', () => {
    expect(() => compaction({ ...MOULD, points: [
      { moisture: 12, mouldSoilMass: 4250 },
      { moisture: 14, mouldSoilMass: 6150 },
      { moisture: 16, mouldSoilMass: 6120 },
    ] })).toThrow(/no more than the empty mould/i)
  })

  it('needs three points to have a curve at all', () => {
    expect(() => compaction({ ...MOULD, points: [
      { moisture: 12, mouldSoilMass: 6100 },
      { moisture: 14, mouldSoilMass: 6150 },
    ] })).toThrow(/at least three/i)
  })
})

describe('the peak is recovered from a curve it was planted in', () => {
  // ρd = −0.006w² + 0.18w + 0.43 ⇒ vertex at w = 15.000%, ρd = 1.780 Mg/m³
  // (S ≈ 80% at Gs 2.68, which is where a real compacted soil sits)
  const a = -0.006, b = 0.18, c = 0.43

  it('finds a planted vertex exactly, and lands between the points', () => {
    const r = compaction({ ...MOULD, points: plantedCurve(a, b, c, [10, 12.5, 15, 17.5, 20]) })
    expect(r.peakFrom).toBe('fit')
    expect(r.optimumMoisture).toBeCloseTo(15, 6)
    expect(r.maxDryDensity).toBeCloseTo(1.78, 6)
    expect(r.maxDryUnitWeight).toBeCloseTo(1.78 * G, 5)
  })

  it('recovers a vertex that sits BETWEEN two tested points, not on one', () => {
    // No specimen at 15%: the optimum is interpolated, which is the whole point.
    const ws = [11, 13, 17, 19]
    const r = compaction({ ...MOULD, points: plantedCurve(a, b, c, ws) })
    expect(ws).not.toContain(15)
    expect(r.optimumMoisture).toBeCloseTo(15, 6)
    expect(r.maxDryDensity).toBeCloseTo(1.78, 6)
  })

  it('moves the peak when the peak moves', () => {
    // Same curvature, vertex planted at 20% instead: a wrong fit that ignored
    // the data would keep answering 15.
    const r = compaction({ ...MOULD, points: plantedCurve(-0.006, 0.24, 0.3, [16, 18, 20, 22, 24]) })
    expect(r.optimumMoisture).toBeCloseTo(20, 6)
  })

  it('reports the highest MEASURED point when the curve has no peak in range', () => {
    // Monotonically rising over the range tested — the optimum is wetter than
    // anything compacted, so there is nothing to interpolate.
    const r = compaction({ ...MOULD, points: plantedCurve(a, b, c, [5, 7, 9, 11]) })
    expect(r.peakFrom).toBe('highest-point')
    expect(r.optimumMoisture).toBe(11)
    expect(r.fit).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/HIGHEST MEASURED point/)
  })

  it('flags a peak held by too few points on one side', () => {
    const r = compaction({ ...MOULD, points: plantedCurve(a, b, c, [14, 15, 16.5, 18, 20]) })
    expect(r.notes.join(' ')).toMatch(/dry of the optimum/)
  })
})

describe('the zero-air-voids bound', () => {
  it('matches the closed form', () => {
    // Gs 2.70, w 15%: ρzav = 2.70/(1 + 0.15·2.70) = 2.70/1.405 = 1.92171
    expect(zeroAirVoids(15, 2.7)).toBeCloseTo(1.921708, 6)
    // and at w = 0 it is Gs·ρw exactly — a soil with no water and no air
    expect(zeroAirVoids(0, 2.7)).toBeCloseTo(2.7, 12)
  })

  it('falls as water content rises, always', () => {
    let prev = Infinity
    for (let w = 2; w <= 40; w += 2) {
      const v = zeroAirVoids(w, 2.68)
      expect(v).toBeLessThan(prev)
      prev = v
    }
  })

  it('reports a point above it as impossible, by name and with the saturation', () => {
    // A mould volume typed as 844 instead of 944 inflates every density by 12%
    // and pushes the wet-side points through full saturation.
    const pts = plantedCurve(-0.006, 0.18, 0.43, [10, 12.5, 15, 17.5, 20])
    const r = compaction({ mouldVolume: 844, mouldMass: MOULD.mouldMass, specificGravity: 2.65, points: pts })
    const flagged = r.notes.filter((n) => /ABOVE the zero-air-voids/.test(n))
    expect(flagged.length).toBeGreaterThan(0)
    expect(flagged[0]).toMatch(/S = 1\d\d%/)          // saturation above 100
    expect(flagged[0]).toMatch(/mould volume/)
  })

  it('says the check cannot run when no specific gravity was given', () => {
    const r = compaction({ ...MOULD, points: plantedCurve(-0.006, 0.18, 0.43, [10, 12.5, 15, 17.5, 20]) })
    expect(r.rows.every((x) => x.zavDensity === undefined)).toBe(true)
    expect(r.notes.join(' ')).toMatch(/no zero-air-voids curve/)
  })

  it('a real compaction point sits below the bound and under 100% saturation', () => {
    const r = compaction({
      ...MOULD, specificGravity: 2.68,
      points: plantedCurve(-0.006, 0.18, 0.43, [10, 12.5, 15, 17.5, 20]),
    })
    expect(r.notes.some((n) => /ABOVE the zero-air-voids/.test(n))).toBe(false)
    for (const row of r.rows) {
      expect(row.dryDensity).toBeLessThan(row.zavDensity!)
      expect(row.saturation!).toBeLessThan(100)
      expect(row.saturation!).toBeGreaterThan(0)
    }
    // S at the optimum is the useful one — compaction lands near 80–90%
    expect(r.saturationAtOptimum!).toBeGreaterThan(50)
    expect(r.saturationAtOptimum!).toBeLessThan(100)
  })

  it('saturation and the ZAV bound agree at the bound', () => {
    // A point sitting exactly ON the ZAV curve is 100% saturated by definition.
    expect(saturationOf(zeroAirVoids(18, 2.7), 18, 2.7)).toBeCloseTo(100, 8)
  })
})

describe('effort is carried, never assumed away', () => {
  const pts = plantedCurve(-0.006, 0.18, 0.43, [10, 12.5, 15, 17.5, 20])

  it('defaults to standard and says which specification that answers', () => {
    const r = compaction({ ...MOULD, points: pts })
    expect(r.effort).toBe('standard')
    expect(r.notes.join(' ')).toMatch(/D698/)
    expect(r.notes.join(' ')).toMatch(/D1557/)      // and warns the other exists
  })

  it('modified effort says a D698-written 95% is not satisfied by 95% of it', () => {
    const r = compaction({ ...MOULD, effort: 'modified', points: pts })
    expect(r.effort).toBe('modified')
    expect(r.notes.join(' ')).toMatch(/NOT satisfied/)
  })
})

describe('relative compaction', () => {
  it('is the field density as a percentage of the laboratory maximum', () => {
    expect(relativeCompaction(1.805, 1.9)).toBeCloseTo(95, 10)
  })
  it('refuses a zero maximum', () => {
    expect(() => relativeCompaction(1.8, 0)).toThrow(/greater than zero/)
  })
})

// ── Plumbing ──────────────────────────────────────────────────────────────

const labTest = (data: Record<string, unknown>): LabTest =>
  ({ id: 'c1', type: 'compaction', standard: 'd698', status: 'complete', data })

describe('compaction through the lab registry', () => {
  const rows = plantedCurve(-0.006, 0.18, 0.43, [10, 12.5, 15, 17.5, 20])
  const data = { ...MOULD, specificGravity: 2.68, points: rows }

  it('is an implemented test with a form', () => {
    expect(isImplemented('compaction')).toBe(true)
    expect(labSpec('compaction')?.formKind).toBe('compaction-points')
    expect(labSpec('compaction')?.calculation).toBe('compaction.optimum')
  })

  it('reads a stored blob and computes the peak', () => {
    const { outcome, error } = evaluateTest(labTest(data))
    expect(error).toBeUndefined()
    expect(outcome?.kind).toBe('compaction')
    const s = summarise(outcome!)
    expect(s.label).toBe('γd,max')
    expect(s.unit).toBe('kN/m³')
    expect(s.value).toBeCloseTo(1.78 * G, 4)
  })

  it('drops a row missing its water content rather than reading it as zero', () => {
    // Zero would be a legitimate-looking dry-side point and would drag the fit.
    const d = readCompaction(labTest({ ...data, points: [...rows, { mouldSoilMass: 6000 }] }))
    expect(d?.points.length).toBe(rows.length)
  })

  it('returns nothing for a blob with too few usable points', () => {
    expect(readCompaction(labTest({ ...MOULD, points: rows.slice(0, 2) }))).toBeUndefined()
    expect(readCompaction(labTest({ mouldVolume: 944, points: rows }))).toBeUndefined()
    expect(evaluateTest(labTest({ ...MOULD, points: [] })).outcome).toBeUndefined()
  })

  it('ignores an effort it does not recognise instead of trusting it', () => {
    expect(readCompaction(labTest({ ...data, effort: 'super' }))?.effort).toBeUndefined()
    expect(readCompaction(labTest({ ...data, effort: 'modified' }))?.effort).toBe('modified')
  })

  it('surfaces an impossible specimen as an error, not a crash', () => {
    const { outcome, error } = evaluateTest(labTest({
      ...MOULD, points: rows.map((r, i) => (i === 0 ? { ...r, mouldSoilMass: 100 } : r)),
    }))
    expect(outcome).toBeUndefined()
    expect(error).toMatch(/empty mould/i)
  })
})

// ── Chart ─────────────────────────────────────────────────────────────────

describe('the compaction chart', () => {
  const r = compaction({
    ...MOULD, specificGravity: 2.68,
    points: plantedCurve(-0.006, 0.18, 0.43, [10, 12.5, 15, 17.5, 20]),
  })
  const d = compactionChart(r, 2.68)
  const xs = d.primitives.flatMap((p) =>
    p.kind === 'line' ? [p.x1, p.x2] : p.kind === 'circle' ? [p.cx] : [])
  const ys = d.primitives.flatMap((p) =>
    p.kind === 'line' ? [p.y1, p.y2] : p.kind === 'circle' ? [p.cy] : [])

  it('draws nothing outside its own frame', () => {
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(18 - 1e-9)      // BOX.left
    expect(Math.max(...xs)).toBeLessThanOrEqual(18 + 96 + 1e-9)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(8 - 1e-9)       // BOX.top
    expect(Math.max(...ys)).toBeLessThanOrEqual(8 + 62 + 1e-9)
  })

  it('keeps its annotation plates inside the frame too', () => {
    // The ZAV label is anchored to a curve that leaves through the right-hand
    // edge, so it is the one most able to escape.
    for (const p of d.primitives) {
      if (p.kind !== 'rect') continue
      expect(p.x, 'plate left').toBeGreaterThanOrEqual(18 - 1e-9)
      expect(p.x + p.w, 'plate right').toBeLessThanOrEqual(18 + 96 + 1e-9)
      expect(p.y + p.h, 'plate bottom').toBeLessThanOrEqual(8 + 62 + 1e-9)
    }
  })

  it('prints the peak, the effort and how the peak was obtained', () => {
    const text = d.primitives.filter((p) => p.kind === 'text').map((p) => p.text).join(' | ')
    expect(text).toMatch(/γd,max = 17\.4\d kN\/m³/)
    expect(text).toMatch(/OMC = 15\.0%/)
    expect(text).toMatch(/standard effort/)
    expect(text).toMatch(/zero air voids/)
  })

  it('keeps every measured point clear of the annotation plate', () => {
    // The plate sits in the bottom band, which the axis reserves by starting
    // below the lowest measured density. A point inside it would be struck out.
    // the LAST plate is the results block at the bottom; the first is the ZAV label
    const plateTop = [...d.primitives].reverse().find((p) => p.kind === 'rect')!
    const marks = d.primitives.filter((p) => p.kind === 'circle')
    for (const m of marks) expect(m.cy).toBeLessThan(plateTop.y)
  })

  it('says HIGHEST MEASURED on the plate when the fit was rejected', () => {
    const noPeak = compaction({ ...MOULD, points: plantedCurve(-0.006, 0.18, 0.43, [5, 7, 9, 11]) })
    const text = compactionChart(noPeak).primitives
      .filter((p) => p.kind === 'text').map((p) => p.text).join(' | ')
    expect(text).toMatch(/HIGHEST MEASURED/)
  })

  it('omits the ZAV bound entirely when there is no Gs to draw it from', () => {
    const text = compactionChart(r).primitives
      .filter((p) => p.kind === 'text').map((p) => p.text).join(' | ')
    expect(text).not.toMatch(/zero air voids/)
  })
})
