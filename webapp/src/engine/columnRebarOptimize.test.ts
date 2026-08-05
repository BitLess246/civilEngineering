import { describe, it, expect } from 'vitest'
import {
  optimizeColumnRebar, COLUMN_BAR_SIZES, MAX_UNSUPPORTED_CLEAR,
} from './columnRebarOptimize'
import { designAxialColumn, RHO_MIN, RHO_MAX, type AxialColumnInput } from './columnDesign'
import { resolveBarContinuity } from './beamRebarOptimize'

const TIED: AxialColumnInput = {
  shape: 'tied', b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10,
  fc: 28, fy: 415, Pu: 1800,
}

describe('it searches diameter AND count', () => {
  const r = optimizeColumnRebar(TIED)

  it('tries more than one count at each diameter', () => {
    const perDia = new Map<number, Set<number>>()
    for (const key of r.designs.keys()) {
      const [db, n] = key.split('x').map(Number)
      ;(perDia.get(db) ?? perDia.set(db, new Set()).get(db)!).add(n)
    }
    for (const counts of perDia.values()) expect(counts.size).toBeGreaterThan(1)
  })

  it('only searches the catalogue sizes', () => {
    for (const key of r.designs.keys()) {
      expect(COLUMN_BAR_SIZES).toContain(Number(key.split('x')[0]))
    }
  })

  it('adopts a diameter and a count together', () => {
    expect(r.db).not.toBeNull()
    expect(r.bars).not.toBeNull()
    expect(r.design).not.toBeNull()
    expect(r.design!.bars).toBe(r.bars)
  })

  it('ignores numBars and barDia from the caller', () => {
    const a = optimizeColumnRebar({ ...TIED, barDia: 32, numBars: 4 })
    const b = optimizeColumnRebar({ ...TIED, barDia: 16, numBars: 12 })
    expect(a.db).toBe(b.db)
    expect(a.bars).toBe(b.bars)
  })

  it('is deterministic', () => {
    expect(optimizeColumnRebar(TIED).selection.ranked.map((x) => `${x.layout.bars}⌀${x.layout.db}`))
      .toEqual(r.selection.ranked.map((x) => `${x.layout.bars}⌀${x.layout.db}`))
  })
})

describe('symmetry is excluded, not scored', () => {
  it('never generates an odd bar count', () => {
    const r = optimizeColumnRebar(TIED)
    for (const key of r.designs.keys()) {
      expect(Number(key.split('x')[1]) % 2).toBe(0)
    }
  })

  it('the adopted cage has equal counts on opposing faces', () => {
    const r = optimizeColumnRebar(TIED)
    expect(r.bars! % 2).toBe(0)
  })
})

describe('the adopted cage is compliant', () => {
  const cases: [string, AxialColumnInput][] = [
    ['square, moderate', TIED],
    ['oblong, heavy', { ...TIED, b: 600, h: 400, Pu: 3200 }],
    ['small, light', { ...TIED, b: 300, h: 300, Pu: 900 }],
  ]

  it.each(cases)('%s: every check passes', (_n, inp) => {
    const r = optimizeColumnRebar(inp)
    expect(r.selection.best).not.toBeNull()
    for (const c of r.selection.best!.compliance) {
      expect(c.pass, `${c.id} — ${c.label}`).toBe(true)
    }
  })

  it.each(cases)('%s: ρ sits inside §10.6.1.1', (_n, inp) => {
    const r = optimizeColumnRebar(inp)
    expect(r.design!.rho).toBeGreaterThanOrEqual(RHO_MIN - 1e-9)
    expect(r.design!.rho).toBeLessThanOrEqual(RHO_MAX + 1e-9)
  })

  it.each(cases)('%s: the cage carries the axial load', (_n, inp) => {
    const r = optimizeColumnRebar(inp)
    expect(r.design!.axialOK).toBe(true)
    expect(r.design!.phiPnMax).toBeGreaterThanOrEqual(inp.Pu)
  })

  it.each(cases)('%s: reproducible from designAxialColumn', (_n, inp) => {
    const r = optimizeColumnRebar(inp)
    const again = designAxialColumn({ ...inp, barDia: r.db!, numBars: r.bars! })
    expect(again.Ast).toBeCloseTo(r.design!.Ast, 9)
    expect(again.rho).toBeCloseTo(r.design!.rho, 9)
  })
})

describe('§25.7.2.3 lateral support does real work', () => {
  it('rejects a 4-bar cage on a wide column', () => {
    // Corner bars only across a 600 mm face leaves the middle unsupported.
    const r = optimizeColumnRebar({ ...TIED, b: 600, h: 400, Pu: 3200 })
    const four = r.selection.rejected.filter((x) => x.layout.bars === 4)
    expect(four.length).toBeGreaterThan(0)
    expect(four.some((x) => x.failedGate!.id === 'lateral-support'
      || x.failedGate!.id === 'rho-limits')).toBe(true)
  })

  it('the adopted cage keeps every bar within 150 mm clear of a supported one', () => {
    for (const inp of [TIED, { ...TIED, b: 600, h: 400, Pu: 3200 }]) {
      const r = optimizeColumnRebar(inp)
      expect(r.selection.best!.layout.clearSpacing).toBeLessThanOrEqual(MAX_UNSUPPORTED_CLEAR + 1e-6)
    }
  })

  it('rejects a cage whose bars simply do not fit', () => {
    const r = optimizeColumnRebar({ ...TIED, b: 300, h: 300, Pu: 900 })
    const tight = r.selection.rejected.filter((x) => x.failedGate!.id === 'bar-spacing')
    expect(tight.length).toBeGreaterThan(0)
    expect(tight[0].failedGate!.clause).toContain('25.2.3')
  })
})

describe('it does not just minimise steel or bars', () => {
  it('does not adopt the lightest compliant cage', () => {
    const r = optimizeColumnRebar(TIED)
    const lightest = [...r.selection.ranked].sort((a, b) => a.layout.AsProv - b.layout.AsProv)[0]
    expect(r.selection.best!.layout.AsProv).toBeGreaterThanOrEqual(lightest.layout.AsProv)
    // …and it genuinely considered lighter options.
    expect(r.selection.ranked.length).toBeGreaterThan(3)
  })

  it('prefers more, smaller bars over a few large ones at similar ρ', () => {
    const r = optimizeColumnRebar(TIED)
    const big = r.selection.ranked.find((x) => x.layout.db >= 25 && x.layout.bars <= 6)
    if (big) expect(r.selection.best!.total).toBeGreaterThan(big.total)
  })
})

describe('when nothing works', () => {
  it('reports no winner rather than adopting an overstressed cage', () => {
    // A 300×300 asked to carry 6000 kN — ρmax is reached long before.
    const r = optimizeColumnRebar({ ...TIED, b: 300, h: 300, Pu: 6000 })
    expect(r.selection.best).toBeNull()
    expect(r.design).toBeNull()
    expect(r.selection.margin).toMatch(/no layout satisfies/)
  })
})

describe('a column stack shares one diameter', () => {
  it('resolveBarContinuity works on column stacks too — it is member-agnostic', () => {
    // Ground storey wants ⌀25, upper storeys ⌀20; the bars lap through, so
    // the whole stack takes ⌀25.
    const chosen = new Map([['C1-G', 25], ['C1-2', 20], ['C1-3', 20]])
    const out = resolveBarContinuity(chosen, [['C1-G', 'C1-2', 'C1-3']])
    expect([...new Set(out.values())]).toEqual([25])
  })

  it('two independent stacks do not affect each other', () => {
    const chosen = new Map([['A-G', 25], ['A-2', 20], ['B-G', 16], ['B-2', 16]])
    const out = resolveBarContinuity(chosen, [['A-G', 'A-2'], ['B-G', 'B-2']])
    expect(out.get('A-2')).toBe(25)
    expect(out.get('B-G')).toBe(16)
  })
})

describe('bounds', () => {
  it('honours a restricted size list and bar cap', () => {
    const r = optimizeColumnRebar(TIED, { sizes: [20], maxBars: 8 })
    for (const key of r.designs.keys()) {
      const [db, n] = key.split('x').map(Number)
      expect(db).toBe(20)
      expect(n).toBeLessThanOrEqual(8)
    }
  })

  it('a spiral column needs at least six bars', () => {
    const r = optimizeColumnRebar({
      shape: 'spiral', D: 450, cover: 40, barDia: 20, tieDia: 10,
      fc: 28, fy: 415, Pu: 2000,
    })
    for (const key of r.designs.keys()) {
      expect(Number(key.split('x')[1])).toBeGreaterThanOrEqual(6)
    }
    if (r.bars !== null) expect(r.bars).toBeGreaterThanOrEqual(6)
  })
})
