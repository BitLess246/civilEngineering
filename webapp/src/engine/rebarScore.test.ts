import { describe, it, expect } from 'vitest'
import {
  selectRebar, compareByTotal, comparePair, firstFailure,
  blockingGates, dominantBlocker,
  PRIORITY_WEIGHTS, NEAR_TIE, MAX_TIE_STEEL, COMMON_BARS,
  type Candidate, type ComplianceCheck, type RebarLayout, type ScoreContext,
} from './rebarScore'

const CTX: ScoreContext = { sMax: 280, sMinCode: 25, sComfort: 40, maxLayers: 3, barComfort: 8 }

const ok = (id: string): ComplianceCheck =>
  ({ id, clause: 'ACI 318-14 §9.x', label: id, pass: true })
const fail = (id: string, clause = 'ACI 318-14 §9.x'): ComplianceCheck =>
  ({ id, clause, label: id, pass: false })

/** A layout with sensible defaults; override only what a test is about. */
const layout = (over: Partial<RebarLayout> = {}): RebarLayout => {
  const db = over.db ?? 20
  const bars = over.bars ?? 4
  return {
    db, bars,
    layers: over.layers ?? [bars],
    AsProv: over.AsProv ?? bars * (Math.PI / 4) * db * db,
    AsReq: over.AsReq ?? bars * (Math.PI / 4) * db * db * 0.95,
    clearSpacing: over.clearSpacing ?? 55,
    spacing: over.spacing ?? 90,
    d: over.d ?? 500,
    utilization: over.utilization ?? 0.9,
    ...over,
  }
}
const cand = (l: Partial<RebarLayout>, checks: ComplianceCheck[] = [ok('strength')]): Candidate =>
  ({ layout: layout(l), compliance: checks })

describe('the weights encode the stated priority order', () => {
  it('sums to 1', () => {
    const sum = Object.values(PRIORITY_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 12)
  })

  it('ranks serviceability > constructability > economy > simplicity', () => {
    const { serviceability: s, constructability: c, economy: e, simplicity: p } = PRIORITY_WEIGHTS
    expect(s).toBeGreaterThan(c)
    expect(c).toBeGreaterThan(e)
    expect(e).toBeGreaterThan(p)
  })
})

describe('compliance is a GATE, never a score', () => {
  it('excludes a non-compliant layout however well it scores otherwise', () => {
    // The failing candidate is ideal on every other axis: one layer, common
    // bar, even count, generous spacing, least steel. It must still lose.
    const r = selectRebar([
      cand({ db: 16, bars: 4, AsProv: 800, spacing: 60, clearSpacing: 70 }, [fail('strength')]),
      cand({ db: 25, bars: 6, AsProv: 2945, spacing: 120, clearSpacing: 45 }),
    ], CTX)
    expect(r.best!.layout.db).toBe(25)
    expect(r.ranked.map((x) => x.layout.db)).not.toContain(16)
    expect(r.rejected).toHaveLength(1)
  })

  it('reports the FIRST failed clause, not the last', () => {
    // Someone sent to widen the web when the section is simply too shallow
    // has been sent to the wrong place.
    const r = selectRebar([
      cand({ db: 20 }, [fail('strength', '§22.2'), fail('clear spacing', '§25.2.1')]),
    ], CTX)
    expect(r.best).toBeNull()
    expect(r.rejected[0].failedGate!.id).toBe('strength')
    expect(r.rejected[0].failedGate!.clause).toBe('§22.2')
    expect(r.rejected[0].reason).toContain('§22.2')
  })

  it('returns no winner when nothing complies, and says so', () => {
    const r = selectRebar([
      cand({ db: 16 }, [fail('a')]),
      cand({ db: 20 }, [fail('b')]),
    ], CTX)
    expect(r.best).toBeNull()
    expect(r.ranked).toHaveLength(0)
    expect(r.margin).toMatch(/no layout satisfies/)
    expect(r.margin).toContain('2 candidates')
  })

  it('firstFailure passes a fully compliant set', () => {
    expect(firstFailure([ok('a'), ok('b')])).toBeNull()
  })

  it('handles an empty candidate set without throwing', () => {
    const r = selectRebar([], CTX)
    expect(r.best).toBeNull()
    expect(r.margin).toMatch(/no candidates/)
  })
})

describe('it does NOT simply minimise steel', () => {
  it('prefers a better-distributed cage over the lightest one', () => {
    // 3⌀25 (1473 mm²) is lighter than 6⌀16 (1206... ) — make the point
    // explicitly: give the big-bar option LESS steel and worse spacing.
    const r = selectRebar([
      cand({ db: 25, bars: 3, AsProv: 1473, AsReq: 1400, spacing: 170, clearSpacing: 60, layers: [3] }),
      cand({ db: 16, bars: 8, AsProv: 1608, AsReq: 1400, spacing: 70, clearSpacing: 45, layers: [8] }),
    ], CTX)
    expect(r.best!.layout.db).toBe(16)
    expect(r.best!.layout.AsProv).toBeGreaterThan(1473)   // it bought MORE steel
  })

  it('does NOT simply minimise bar count either', () => {
    const r = selectRebar([
      cand({ db: 32, bars: 2, AsProv: 1608, AsReq: 1500, spacing: 200, clearSpacing: 80, layers: [2] }),
      cand({ db: 20, bars: 5, AsProv: 1571, AsReq: 1500, spacing: 85, clearSpacing: 50, layers: [5] }),
    ], CTX)
    expect(r.best!.layout.bars).toBe(5)
  })

  it('still prefers less steel when everything else is equal', () => {
    // Economy is the decider only where performance is equivalent.
    const r = selectRebar([
      cand({ db: 20, bars: 6, AsProv: 1885, AsReq: 1400, spacing: 90, clearSpacing: 50, layers: [6] }),
      cand({ db: 20, bars: 5, AsProv: 1571, AsReq: 1400, spacing: 90, clearSpacing: 50, layers: [5] }),
    ], CTX)
    expect(r.best!.layout.bars).toBe(5)
  })
})

describe('serviceability', () => {
  it('rewards spacing well inside the §24.3.2 limit', () => {
    const r = selectRebar([
      cand({ db: 20, bars: 4, spacing: 270, clearSpacing: 60 }),
      cand({ db: 20, bars: 4, spacing: 100, clearSpacing: 60 }),
    ], CTX)
    expect(r.best!.layout.spacing).toBe(100)
    expect(r.ranked[0].scores.serviceability).toBeGreaterThan(r.ranked[1].scores.serviceability)
  })

  it('rewards steel AT the tension face over steel buried in a stack', () => {
    const flat = cand({ db: 20, bars: 6, layers: [6], clearSpacing: 45 })
    const stacked = cand({ db: 20, bars: 6, layers: [3, 3], clearSpacing: 45 })
    const r = selectRebar([stacked, flat], CTX)
    const s = (n: number) => r.ranked.find((x) => x.layout.layers.length === n)!
    expect(s(1).scores.serviceability).toBeGreaterThan(s(2).scores.serviceability)
  })

  it('treats diameter RELATIVELY — a set of one size does not all score badly', () => {
    const r = selectRebar([
      cand({ db: 32, bars: 4, spacing: 90 }),
      cand({ db: 32, bars: 5, spacing: 90 }),
    ], CTX)
    // Nothing differs on diameter, so it must not separate them.
    expect(r.ranked[0].scores.serviceability)
      .toBeCloseTo(r.ranked[1].scores.serviceability, 9)
  })
})

describe('constructability', () => {
  it('penalises every extra layer', () => {
    const r = selectRebar([
      cand({ db: 20, bars: 8, layers: [8] }),
      cand({ db: 20, bars: 8, layers: [4, 4] }),
      cand({ db: 20, bars: 8, layers: [3, 3, 2] }),
    ], CTX)
    const by = (n: number) => r.ranked.find((x) => x.layout.layers.length === n)!.scores.constructability
    expect(by(1)).toBeGreaterThan(by(2))
    expect(by(2)).toBeGreaterThan(by(3))
  })

  it('penalises clear spacing that is legal but too tight to vibrate', () => {
    // 26 mm clears §25.2.1 and is still no place for a poker.
    const r = selectRebar([
      cand({ db: 20, bars: 6, clearSpacing: 26 }),
      cand({ db: 20, bars: 6, clearSpacing: 55 }),
    ], CTX)
    expect(r.best!.layout.clearSpacing).toBe(55)
  })

  it('does not separate layouts that are all comfortably spaced', () => {
    const r = selectRebar([
      cand({ db: 20, bars: 4, clearSpacing: 60, layers: [4] }),
      cand({ db: 20, bars: 4, clearSpacing: 90, layers: [4] }),
    ], CTX)
    const [a, b] = r.ranked
    expect(a.scores.constructability).toBeCloseTo(b.scores.constructability, 9)
  })

  it('only counts bars against a layout once it is genuinely crowded', () => {
    // 4 vs 6 bars is not a labour difference; 6 vs 20 is.
    const small = selectRebar([
      cand({ db: 20, bars: 4, layers: [4] }), cand({ db: 20, bars: 6, layers: [6] }),
    ], CTX)
    const [a, b] = small.ranked
    expect(a.scores.constructability).toBeCloseTo(b.scores.constructability, 9)
  })
})

describe('the near-tie rule', () => {
  it('breaks a near-tie on serviceability + constructability, not economy', () => {
    // Built so the economical one edges the total by less than NEAR_TIE while
    // being clearly worse distributed and harder to build.
    const cheap = cand({
      db: 25, bars: 4, AsProv: 1963, AsReq: 1900,
      spacing: 200, clearSpacing: 28, layers: [2, 2],
    })
    const better = cand({
      db: 20, bars: 6, AsProv: 1885, AsReq: 1900,
      spacing: 95, clearSpacing: 55, layers: [6],
    })
    const r = selectRebar([cheap, better], CTX)
    expect(r.best!.layout.db).toBe(20)
    const pair = (s: typeof r.ranked[0]) => s.scores.serviceability + s.scores.constructability
    expect(pair(r.ranked[0])).toBeGreaterThan(pair(r.ranked[1]))
  })

  it('uses the total when the gap is CLEAR of the near-tie band', () => {
    // b has the better pair score but is 0.40 behind — far outside the band,
    // so it must not be promoted.
    const r = selectRebar([
      cand({ db: 20, bars: 4, layers: [4], spacing: 250, clearSpacing: 90, AsProv: 1257, AsReq: 1250 }),
      cand({ db: 16, bars: 12, layers: [4, 4, 4], spacing: 40, clearSpacing: 26, AsProv: 2413, AsReq: 1250 }),
    ], CTX)
    expect(r.best!.layout.db).toBe(20)
    expect(r.best!.total).toBeGreaterThan(r.ranked[1].total)
  })

  it('the ranking is a TOTAL ORDER — the comparator cannot be intransitive', () => {
    // Ranking is by total (a real order) and the near-tie rule is applied as
    // a leading-group promotion, not as a comparator. Written as a comparator
    // it would be intransitive: A~B, B~C, but A and C differ by more than the
    // band, and Array.sort would then give an implementation-defined order.
    const mk = (total: number, serv: number) =>
      ({ total, scores: { serviceability: serv, constructability: 0, economy: 0, simplicity: 0 },
         layout: { db: 20, bars: 4, layers: [4] } }) as never
    const a = mk(0.90, 0), b = mk(0.88, 0.5), c = mk(0.86, 1)
    // compareByTotal is a strict order on the totals.
    expect(compareByTotal(a, b)).toBeLessThan(0)
    expect(compareByTotal(b, c)).toBeLessThan(0)
    expect(compareByTotal(a, c)).toBeLessThan(0)
    // comparePair is a strict order on the pair score.
    expect(comparePair(c, b)).toBeLessThan(0)
    expect(comparePair(b, a)).toBeLessThan(0)
    expect(comparePair(c, a)).toBeLessThan(0)
  })

  it('promotes the best of the WHOLE leading group, not just the runner-up', () => {
    // Three candidates inside the band; the third has the best pair score and
    // must win even though it has the lowest total.
    const r = selectRebar([
      cand({ db: 25, bars: 4, layers: [2, 2], spacing: 200, clearSpacing: 28, AsProv: 1963, AsReq: 1950 }),
      cand({ db: 25, bars: 5, layers: [3, 2], spacing: 190, clearSpacing: 30, AsProv: 2454, AsReq: 1950 }),
      cand({ db: 20, bars: 7, layers: [7], spacing: 80, clearSpacing: 55, AsProv: 2199, AsReq: 1950 }),
    ], CTX)
    const pairs = r.ranked.map((s) => s.scores.serviceability + s.scores.constructability)
    expect(pairs[0]).toBe(Math.max(...pairs.filter((_, k) => r.ranked[0].total - r.ranked[k].total <= NEAR_TIE)))
  })

  it('NEAR_TIE is small enough to be a tie and not a policy', () => {
    expect(NEAR_TIE).toBeGreaterThan(0)
    expect(NEAR_TIE).toBeLessThan(0.10)
  })
})

describe('simplicity', () => {
  it('prefers an even (symmetric) bar count when symmetry is wanted', () => {
    const r = selectRebar([
      cand({ db: 20, bars: 5, layers: [5], AsProv: 1571, AsReq: 1500 }),
      cand({ db: 20, bars: 6, layers: [6], AsProv: 1885, AsReq: 1500 }),
    ], { ...CTX, wantSymmetric: true })
    const five = r.ranked.find((x) => x.layout.bars === 5)!
    const six = r.ranked.find((x) => x.layout.bars === 6)!
    expect(six.scores.simplicity).toBeGreaterThan(five.scores.simplicity)
  })

  it('does not ask a slab mat to be symmetric', () => {
    const r = selectRebar([
      cand({ db: 12, bars: 7, layers: [7] }),
      cand({ db: 12, bars: 8, layers: [8] }),
    ], { ...CTX, wantSymmetric: false })
    const [a, b] = r.ranked
    expect(a.scores.simplicity).toBeCloseTo(b.scores.simplicity, 9)
  })

  it('prefers a commonly stocked bar size', () => {
    const r = selectRebar([
      cand({ db: 36, bars: 4, layers: [4] }),
      cand({ db: 20, bars: 4, layers: [4] }),
    ], CTX)
    const big = r.ranked.find((x) => x.layout.db === 36)!
    const std = r.ranked.find((x) => x.layout.db === 20)!
    expect(std.scores.simplicity).toBeGreaterThan(big.scores.simplicity)
    expect(COMMON_BARS.has(20)).toBe(true)
    expect(COMMON_BARS.has(36)).toBe(false)
  })

  it('prefers a regular stack over a ragged one', () => {
    const r = selectRebar([
      cand({ db: 20, bars: 6, layers: [3, 3] }),
      cand({ db: 20, bars: 6, layers: [4, 2] }),
    ], CTX)
    const even = r.ranked.find((x) => x.layout.layers[0] === 3)!
    const ragged = r.ranked.find((x) => x.layout.layers[0] === 4)!
    expect(even.scores.simplicity).toBeGreaterThan(ragged.scores.simplicity)
  })
})

describe('the result carries the ranking and the reason', () => {
  const r = selectRebar([
    cand({ db: 16, bars: 8, AsProv: 1608, AsReq: 1500, spacing: 70, clearSpacing: 45, layers: [8] }),
    cand({ db: 20, bars: 5, AsProv: 1571, AsReq: 1500, spacing: 95, clearSpacing: 55, layers: [5] }),
    cand({ db: 25, bars: 4, AsProv: 1963, AsReq: 1500, spacing: 150, clearSpacing: 65, layers: [4] }),
    cand({ db: 32, bars: 2, AsProv: 1608, AsReq: 1500, spacing: 210, clearSpacing: 90, layers: [2] }, [fail('min bars', '§9.7.2.1')]),
  ], CTX)

  it('ranks every compliant candidate, best first', () => {
    expect(r.ranked).toHaveLength(3)
    for (let i = 1; i < r.ranked.length; i++) {
      expect(r.ranked[i - 1].total).toBeGreaterThanOrEqual(r.ranked[i].total - NEAR_TIE)
    }
  })

  it('gives the winner a reason naming the arrangement', () => {
    expect(r.best!.reason).toContain(`⌀${r.best!.layout.db}`)
    expect(r.best!.reason).toContain(String(r.best!.layout.bars))
  })

  it('explains the margin over the runner-up', () => {
    expect(r.margin.length).toBeGreaterThan(20)
    expect(r.margin).toContain(`⌀${r.best!.layout.db}`)
  })

  it('lists the rejected candidate with its clause', () => {
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].failedGate!.clause).toBe('§9.7.2.1')
  })

  it('is deterministic — same input, same ranking', () => {
    const again = selectRebar([
      cand({ db: 16, bars: 8, AsProv: 1608, AsReq: 1500, spacing: 70, clearSpacing: 45, layers: [8] }),
      cand({ db: 20, bars: 5, AsProv: 1571, AsReq: 1500, spacing: 95, clearSpacing: 55, layers: [5] }),
      cand({ db: 25, bars: 4, AsProv: 1963, AsReq: 1500, spacing: 150, clearSpacing: 65, layers: [4] }),
      cand({ db: 32, bars: 2, AsProv: 1608, AsReq: 1500, spacing: 210, clearSpacing: 90, layers: [2] }, [fail('min bars', '§9.7.2.1')]),
    ], CTX)
    expect(again.ranked.map((x) => `${x.layout.bars}⌀${x.layout.db}`))
      .toEqual(r.ranked.map((x) => `${x.layout.bars}⌀${x.layout.db}`))
  })

  it('every score is a proper 0..1 fraction', () => {
    for (const s of [...r.ranked, ...r.rejected]) {
      for (const v of Object.values(s.scores)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      expect(s.total).toBeGreaterThanOrEqual(0)
      expect(s.total).toBeLessThanOrEqual(1)
    }
  })

  it('says so plainly when there was only one compliant option', () => {
    const one = selectRebar([
      cand({ db: 20 }),
      cand({ db: 25 }, [fail('x')]),
    ], CTX)
    expect(one.margin).toMatch(/only compliant/)
  })
})

// ── Saying what to fix when nothing complies ──────────────────────────────

describe('blocking gates', () => {
  it('names nothing while something complies — there is nothing to fix', () => {
    const some = selectRebar([cand({ db: 20 }), cand({ db: 25 }, [fail('x')])], CTX)
    expect(blockingGates(some)).toEqual([])
    expect(dominantBlocker(some)).toBeNull()
  })

  it('tallies the gates by how many candidates each rejected, most first', () => {
    const none = selectRebar([
      cand({ db: 12 }, [fail('too-shallow', '§9.3.1')]),
      cand({ db: 16 }, [fail('too-shallow', '§9.3.1')]),
      cand({ db: 20 }, [fail('too-shallow', '§9.3.1')]),
      cand({ db: 25 }, [fail('no-room', '§25.2.1')]),
    ], CTX)
    const gates = blockingGates(none)
    expect(gates.map((g) => [g.check.id, g.n])).toEqual([['too-shallow', 3], ['no-room', 1]])
    expect(dominantBlocker(none)?.id).toBe('too-shallow')
  })

  it('puts the gates and their clauses into the margin, not just a count', () => {
    // "no layout complies" is true and useless; the combination of gates is
    // the diagnosis, so up to two of them are named with their clauses.
    const none = selectRebar([
      cand({ db: 12 }, [fail('too-shallow', '§9.3.1')]),
      cand({ db: 25 }, [fail('no-room', '§25.2.1')]),
    ], CTX)
    expect(none.margin).toMatch(/2 candidates rejected/)
    expect(none.margin).toMatch(/§9.3.1/)
    expect(none.margin).toMatch(/§25.2.1/)
  })

  it('only ever reports the FIRST failure of each candidate, so the tally is not double-counted', () => {
    const none = selectRebar([
      cand({ db: 12 }, [fail('too-shallow', '§9.3.1'), fail('no-room', '§25.2.1')]),
    ], CTX)
    expect(blockingGates(none)).toHaveLength(1)
    expect(dominantBlocker(none)?.id).toBe('too-shallow')
  })
})

// ── The near-tie rule breaks ties; it does not buy steel ──────────────────

describe('the near-tie steel guard', () => {
  it('promotes a near-tie contender that costs no more steel', () => {
    const r = selectRebar([
      // Lower total, better serviceability, essentially the same area.
      cand({ db: 16, bars: 8, AsProv: 1608, AsReq: 1500, spacing: 60, clearSpacing: 44, layers: [8] }),
      cand({ db: 20, bars: 5, AsProv: 1571, AsReq: 1500, spacing: 110, clearSpacing: 70, layers: [5] }),
    ], CTX)
    expect(r.best!.layout.AsProv).toBeLessThanOrEqual(1608)
  })

  it('refuses to promote one that buys its way there', () => {
    const lean = cand({ db: 20, bars: 5, AsProv: 1571, AsReq: 1500, spacing: 110, clearSpacing: 70, layers: [5] })
    // Far better distributed, and 2.5× the steel. Whatever the totals say,
    // these two are not "nearly equivalent".
    const fat = cand({ db: 12, bars: 35, AsProv: 3958, AsReq: 1500, spacing: 30, clearSpacing: 18, layers: [35] })
    const r = selectRebar([lean, fat], CTX)
    if (r.best) {
      const leader = r.ranked.reduce((a, s) => (s.total > a.total ? s : a))
      expect(r.best.layout.AsProv)
        .toBeLessThanOrEqual(leader.layout.AsProv * (1 + MAX_TIE_STEEL) + 1e-9)
    }
  })

  it('the leader always survives its own guard, so a winner always exists', () => {
    for (const As of [800, 1500, 4000]) {
      const r = selectRebar([
        cand({ db: 16, bars: 8, AsProv: As, AsReq: As * 0.9, spacing: 60, clearSpacing: 44, layers: [8] }),
      ], CTX)
      expect(r.best).not.toBeNull()
    }
  })

  it('the guard is a fraction, and a loose one — it is not a second economy score', () => {
    expect(MAX_TIE_STEEL).toBeGreaterThan(0)
    expect(MAX_TIE_STEEL).toBeLessThan(0.5)
  })
})
