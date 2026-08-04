import { describe, it, expect } from 'vitest'
import { DEV_HINTS, type CodeHintSpec } from './devLengthHints'
import { calcDevLength, devSqrtFc, SQRT_FC_MAX, type DevLengthInput } from '../engine/devLength'

// ─────────────────────────────────────────────────────────────────────────
// A hint that disagrees with the engine is worse than no hint: it teaches
// the wrong rule with the authority of a clause number. So every factor a
// hint table quotes is checked against what the engine actually computes
// for that same condition.
// ─────────────────────────────────────────────────────────────────────────

const BASE: DevLengthInput = {
  db: 20, fc: 28, fy: 415, topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 1.5,
}
const specs = Object.entries(DEV_HINTS) as [string, CodeHintSpec][]

describe('every hint is well formed', () => {
  it.each(specs)('%s carries a clause, a statement and a reason', (_k, h) => {
    expect(h.title.length).toBeGreaterThan(4)
    expect(h.clause).toMatch(/ACI 318-14/)
    expect(h.clause).toMatch(/§\d|Table/)
    // A statement short enough to be a label is not a statement.
    expect(h.statement.length).toBeGreaterThan(60)
    expect(h.why!.length).toBeGreaterThan(60)
  })

  it.each(specs)('%s has a rectangular table with a header', (_k, h) => {
    if (!h.table) return
    expect(h.table.head.length).toBeGreaterThanOrEqual(2)
    for (const row of h.table.rows) expect(row.length).toBe(h.table.head.length)
    expect(h.table.rows.length).toBeGreaterThan(1)
  })
})

describe('the ψs table matches the engine', () => {
  it.each([[10, 0.8], [16, 0.8], [20, 0.8], [25, 1.0], [32, 1.0], [36, 1.0]])(
    '⌀%i → ψs = %f', (db, psi) => {
      expect(calcDevLength({ ...BASE, db }).psi_s).toBe(psi)
    })

  it('quotes the same two values the engine can produce', () => {
    const quoted = DEV_HINTS.db.table.rows.map((r) => parseFloat(r[1]))
    expect(new Set(quoted)).toEqual(new Set([0.8, 1.0]))
  })
})

describe("the √f'c table matches §25.4.1.4 as implemented", () => {
  it.each(DEV_HINTS.fc.table.rows)("f'c = %s MPa", (fcStr, used) => {
    const fc = parseFloat(fcStr)
    const expected = devSqrtFc(fc)
    // The cell may read "8.31 → 8.3 (cap)" or "8.3 (capped)"; take its first
    // number and, when the cap applies, require the cell to say so.
    const shown = parseFloat(used)
    if (Math.sqrt(fc) > SQRT_FC_MAX) {
      expect(used).toMatch(/cap/i)
      expect(expected).toBe(SQRT_FC_MAX)
    } else {
      expect(shown).toBeCloseTo(expected, 2)
    }
  })

  it('names the cap value the engine uses', () => {
    expect(DEV_HINTS.fc.statement).toContain(String(SQRT_FC_MAX))
  })
})

describe('the ψe table matches the engine', () => {
  it.each([
    ['none' as const, 1.0], ['coated-light' as const, 1.2], ['coated-heavy' as const, 1.5],
  ])('%s → ψe = %f', (epoxy, psi) => {
    expect(calcDevLength({ ...BASE, epoxy }).psi_e).toBe(psi)
  })

  it('quotes every value the engine can produce', () => {
    const quoted = DEV_HINTS.psiE.table.rows.map((r) => parseFloat(r[1]))
    expect(new Set(quoted)).toEqual(new Set([1.0, 1.2, 1.5]))
  })

  it('states the 1.7 product cap the engine applies', () => {
    expect(DEV_HINTS.psiE.statement).toContain('1.7')
    const worst = calcDevLength({ ...BASE, topBar: true, epoxy: 'coated-heavy' })
    expect(worst.psi_t * worst.psi_e).toBeCloseTo(1.95, 6)
    expect(worst.psi_te).toBe(1.7)
  })
})

describe('the ψt table matches the engine', () => {
  it('1.3 for a top bar, 1.0 otherwise', () => {
    expect(calcDevLength({ ...BASE, topBar: true }).psi_t).toBe(1.3)
    expect(calcDevLength({ ...BASE, topBar: false }).psi_t).toBe(1.0)
    expect(DEV_HINTS.psiT.table.rows.map((r) => parseFloat(r[1]))).toEqual([1.3, 1.0])
  })

  it('names the 300 mm trigger, not a vaguer "near the top"', () => {
    expect(DEV_HINTS.psiT.statement).toContain('300 mm')
    expect(DEV_HINTS.psiT.table.rows[0][0]).toContain('300 mm')
  })
})

describe('the λ table', () => {
  it('offers exactly the values Table 19.2.4.1(a) lists', () => {
    expect(DEV_HINTS.lambda.table.rows.map((r) => parseFloat(r[1]))).toEqual([1.0, 0.85, 0.75])
  })

  it('lengthens ld, matching the "divides" wording', () => {
    const light = calcDevLength({ ...BASE, lambda: 0.75 })
    expect(light.ld).toBeCloseTo(calcDevLength(BASE).ld / 0.75, 6)
    expect(DEV_HINTS.lambda.statement).toMatch(/DIVIDES/)
  })
})

describe('the confinement hint', () => {
  it('states the 2.5 cap the engine enforces', () => {
    expect(DEV_HINTS.confine.statement).toContain('2.5')
    expect(calcDevLength({ ...BASE, cbKtr_db: 4 }).confine).toBe(2.5)
  })

  it('defines cb to the bar CENTRE — the distinction the drawing makes', () => {
    expect(DEV_HINTS.confine.statement).toMatch(/centre of the bar/i)
  })

  it('gives Ktr in the form the clause uses', () => {
    expect(DEV_HINTS.confine.statement).toContain('40')
  })
})

describe('the hook hint matches §25.4.3 as implemented', () => {
  it('quotes ψc and ψr the engine applies', () => {
    const both = calcDevLength({ ...BASE, hookCover: true, hookTies: true })
    expect(both.psi_c).toBe(0.7)
    expect(both.psi_r).toBe(0.8)
    const cells = DEV_HINTS.hook.table.rows.map((r) => r[1]).join(' ')
    expect(cells).toContain('0.7')
    expect(cells).toContain('0.8')
  })

  it('states the floor and the geometry the engine returns', () => {
    const r = calcDevLength(BASE)
    expect(r.ldh).toBeGreaterThanOrEqual(Math.max(8 * BASE.db, 150))
    const cells = DEV_HINTS.hook.table.rows.map((r2) => r2.join(' ')).join(' | ')
    expect(cells).toContain('8db')
    expect(cells).toContain('150')
    expect(cells).toContain('12db')          // r.hookTail = 12db
    expect(cells).toMatch(/6db.*8db/)        // r.hookBendDia steps 6db → 8db
    expect(r.hookTail).toBe(12 * BASE.db)
    expect(r.hookBendDia).toBe(6 * BASE.db)
  })

  it('says ψt does not apply — and the engine agrees', () => {
    expect(DEV_HINTS.hook.statement).toMatch(/ψt does\s+NOT apply/)
    expect(calcDevLength({ ...BASE, topBar: true }).ldh)
      .toBeCloseTo(calcDevLength(BASE).ldh, 9)
  })
})
