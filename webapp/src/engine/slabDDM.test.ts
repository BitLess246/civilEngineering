import { describe, it, expect } from 'vitest'
import { designSlabDDM } from './slabDDM'

const base = { lx: 6, ly: 6, colWidth: 400, D: 5.0, L: 2.0, fc: 28, fy: 415, cover: 20, barDia: 12 }

describe('slab DDM — static moment & distribution', () => {
  it('Mo = wu·ℓ2·ℓn²/8 and the interior split is 0.65 / 0.35', () => {
    const r = designSlabDDM({ ...base })            // interior panel (no exterior edges)
    const wu = 1.2 * 5 + 1.6 * 2                     // 10.0 kPa
    const ln = 6 - 0.4                               // 5.6 m
    const Mo = (wu * 6 * ln * ln) / 8
    expect(r.wu).toBeCloseTo(wu, 9)
    expect(r.x.ln).toBeCloseTo(ln, 9)
    expect(r.x.Mo).toBeCloseTo(Mo, 6)
    const neg = r.x.locations.find((l) => l.name === 'Support −M')!
    const pos = r.x.locations.find((l) => l.name === '+M')!
    expect(neg.coeff).toBeCloseTo(0.65, 9)
    expect(pos.coeff).toBeCloseTo(0.35, 9)
    // column + middle moment sum back to the location total
    expect(neg.column.M + neg.middle.M).toBeCloseTo(0.65 * Mo, 6)
  })

  it('end span uses 0.16 / 0.57 / 0.70 with beams on all edges', () => {
    const r = designSlabDDM({ ...base, exterior: { x: true, y: false } })
    const coeffs = r.x.locations.map((l) => l.coeff)
    expect(coeffs).toEqual([0.16, 0.57, 0.70])
    // exterior negative goes entirely to the column strip (no edge beam, βt = 0)
    const ext = r.x.locations[0]
    expect(ext.csFrac).toBe(1.0)
    expect(ext.middle.M).toBeCloseTo(0, 9)
  })

  it('square panel is symmetric in x and y', () => {
    const r = designSlabDDM({ ...base })
    expect(r.x.Mo).toBeCloseTo(r.y.Mo, 6)
  })
})

describe('slab DDM — steel & checks', () => {
  it('every section meets temp/shrinkage minimum and the 2h/450 spacing cap', () => {
    const r = designSlabDDM({ ...base, h: 180 })
    const asMin = 0.0018 * 1000 * 180                       // per metre width
    for (const loc of [...r.x.locations, ...r.y.locations]) {
      for (const strip of [loc.column, loc.middle]) {
        if (strip.b < 1) continue
        expect(strip.As / strip.b).toBeGreaterThanOrEqual(asMin / 1000 - 1e-6) // ≥ ρ_min·b
        expect(strip.spacing).toBeLessThanOrEqual(Math.min(2 * 180, 450) + 1)
        expect(strip.bars).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('minimum thickness from §408.3.1.2 and a sensible default h', () => {
    const r = designSlabDDM({ ...base })
    const lnLong = 6 - 0.4, beta = 1
    const hmin = (lnLong * 1000 * (0.8 + 415 / 1400)) / (36 + 9 * beta)
    expect(r.hmin).toBeCloseTo(Math.max(90, hmin), 3)
    expect(r.h).toBeGreaterThanOrEqual(r.hmin)
  })

  it('flags DDM-applicability violations', () => {
    const oneWay = designSlabDDM({ ...base, ly: 14 })       // 14/6 > 2
    expect(oneWay.twoWay).toBe(false)
    expect(oneWay.applicable).toBe(false)
    const heavyLL = designSlabDDM({ ...base, D: 2, L: 6 })  // L > 2D
    expect(heavyLL.applicable).toBe(false)
    expect(heavyLL.notes.some((n) => /Live load/.test(n))).toBe(true)
  })
})

// ── Tension control vs the §408.3.1.2 minimum thickness ───────────────────

describe('the minimum thickness is not always enough', () => {
  const panel = (o: Record<string, unknown> = {}) => designSlabDDM({
    lx: 6, ly: 7, colWidth: 400, D: 8, L: 6, fc: 28, fy: 415, cover: 20, barDia: 12, ...o,
  } as Parameters<typeof designSlabDDM>[0])

  it('ρ at εt = 0.005 matches the hand calc', () => {
    // 0.85 · β1(28)=0.85 · (28/415) · 3/8 = 0.0182801
    expect(panel().rhoMax).toBeCloseTo(0.0182801, 7)
  })

  it('grows h when it owns the thickness', () => {
    // §408.3.1.2's hmin is the with-beams (αfm ≥ 2) form, but this module
    // does NOT credit beam stiffness for the slab steel — so on a heavily
    // loaded beamless panel the minimum leaves the section over-reinforced.
    const r = panel()
    expect(r.h).toBeGreaterThan(Math.ceil(r.hmin / 5) * 5)
    expect(r.hGrownForSteel).toBe(true)
    expect(r.tensionControlled).toBe(true)
    expect(r.notes.some((n) => /Thickness raised/.test(n))).toBe(true)
  })

  it('reports, and does not repair, a thickness the caller pinned', () => {
    const r = panel({ h: 155 })
    expect(r.h).toBe(155)                 // left exactly where it was put
    expect(r.hGrownForSteel).toBe(false)
    expect(r.tensionControlled).toBe(false)
    expect(r.applicable).toBe(false)      // φ = 0.90 does not apply
    expect(r.notes.some((n) => /Over-reinforced/.test(n))).toBe(true)
  })

  it('flags the individual strip, not just the panel', () => {
    const r = panel({ h: 155 })
    const strips = [r.x, r.y].flatMap((d) => d.locations.flatMap((l) => [l.column, l.middle]))
    expect(strips.some((st) => !st.tensionControlled)).toBe(true)
    for (const st of strips) {
      if (st.b <= 0) continue
      const d = st === r.x.locations[0].column ? r.x.d : undefined
      if (d) expect(st.tensionControlled).toBe(st.As / (st.b * d) <= r.rhoMax + 1e-9)
    }
  })

  it('leaves an ordinary panel alone', () => {
    const easy = designSlabDDM({
      lx: 6, ly: 6, colWidth: 400, D: 5, L: 2, fc: 28, fy: 415, cover: 20, barDia: 12,
    })
    expect(easy.hGrownForSteel).toBe(false)
    expect(easy.tensionControlled).toBe(true)
    expect(easy.applicable).toBe(true)
  })
})
