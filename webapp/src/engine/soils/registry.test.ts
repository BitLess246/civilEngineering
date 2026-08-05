import { describe, it, expect } from 'vitest'
import {
  CALCULATIONS, type CalcId, calc, isCalcId,
  calculationsIn, limitationsOf, assumptionsOf,
} from './registry'
import { STANDARDS, type StandardId, cite, citeFull, isStandardId, standardsByCategory } from './standards'
import { texToPlain } from '../../lib/texText'

const IDS = Object.keys(CALCULATIONS) as CalcId[]
const STANDARD_IDS = Object.keys(STANDARDS) as StandardId[]

// ─────────────────────────────────────────────────────────────────────────
// The registry is a promise: every calculation this module performs is
// declared with its equation, units, assumptions and source BEFORE it is
// implemented. These tests are what keep that promise honest as entries are
// added — an entry that skips its reference or its symbol table fails here
// rather than surfacing as a blank line in a printed calculation sheet.
// ─────────────────────────────────────────────────────────────────────────

describe('every registry entry is fully described', () => {
  it('has entries to check', () => {
    expect(IDS.length).toBeGreaterThan(15)
  })

  it.each(IDS)('%s — title, equation, unit and symbols', (id) => {
    const e = calc(id)
    expect(e.title.length, 'title').toBeGreaterThan(3)
    expect(e.equation.length, 'equation').toBeGreaterThan(5)
    expect(e.unit.length, 'unit').toBeGreaterThan(0)
    expect(Object.keys(e.symbols).length, 'symbols').toBeGreaterThan(0)
  })

  it.each(IDS)('%s — cites a standard or a published reference', (id) => {
    // A formula with no source is exactly the "opaque collection of formulas"
    // this registry exists to prevent.
    const e = calc(id)
    expect(e.standard ?? e.reference, `${id} has neither a standard nor a reference`).toBeTruthy()
    if (e.standard) expect(isStandardId(e.standard)).toBe(true)
  })

  it.each(IDS)('%s — every symbol description states its units', (id) => {
    // "mass of water" is not enough; "mass of water, g" is. A genuinely
    // dimensionless quantity says so by being a coefficient/index/ratio.
    // The unit follows the last comma but need not END the string: compound
    // units like "% per log cycle" and "blows/300 mm" are legitimate.
    // `s` and `seconds` joined the vocabulary with the permeability engine —
    // the first entries in the registry whose symbols include a time.
    const HAS_UNIT = /,\s*[^,]*(%|\bg\b|\bmm\b|\bm\b|mm²|m²|m³|m\/s|kPa|MPa|kN\/m³|\bN\b|\bs\b|seconds|degrees|blows|°C)/i
    const DIMENSIONLESS = /\b(coefficient|index|ratio|factor|correction|specific gravity|group symbol|strain)\b/i
    for (const [sym, desc] of Object.entries(calc(id).symbols)) {
      expect(desc.length, `${id}/${sym}`).toBeGreaterThan(5)
      expect(
        HAS_UNIT.test(desc) || DIMENSIONLESS.test(desc),
        `${id}/${sym}: "${desc}" states neither a unit nor that it is dimensionless`,
      ).toBe(true)
    }
  })

  it.each(IDS)('%s — the equation converts cleanly for the PDF', (id) => {
    // Registry equations are printed in calculation sheets through texToPlain.
    // A stray command would print as a gap, so it is caught here.
    const plain = texToPlain(calc(id).equation)
    expect(plain, id).not.toMatch(/\\[a-zA-Z]/)
    expect(plain.length, id).toBeGreaterThan(3)
  })

  it('every symbol used in an equation appears in the symbol table', () => {
    // Guards the common drift: an equation gains a term and the nomenclature
    // block silently stops explaining it.
    const missing: string[] = []
    for (const id of IDS) {
      const e = calc(id)
      // Parentheses too, so '(N_1)_{60}' reduces to the root N.
      const declared = Object.keys(e.symbols).map((s) => s.replace(/[\\{}()]/g, ''))
      // Root symbols only — a subscripted variant is covered by its root.
      const roots = new Set(declared.map((d) => d.split('_')[0]).filter(Boolean))
      const used = [...e.equation.matchAll(/(?<![\\a-zA-Z])([A-Za-z]{1,3})_\{?/g)].map((m) => m[1])
      for (const u of used) {
        if (!roots.has(u) && !['log', 'tan', 'sin', 'cos', 'text', 'frac', 'sum', 'le'].includes(u)) {
          missing.push(`${id}: ${u}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

describe('correlations carry their caveats', () => {
  const correlations = calculationsIn('correlation')

  it('there are correlations registered', () => {
    expect(correlations.length).toBeGreaterThanOrEqual(4)
  })

  it.each(correlations)('%s — states a reference and at least one limitation', (id) => {
    // A correlation without a stated range of validity is the single most
    // dangerous thing this module could ship: it reads exactly like a
    // measurement. Every one must say where it stops holding.
    const e = calc(id)
    expect(e.reference, `${id} must name whose correlation it is`).toBeTruthy()
    expect(e.limitations?.length ?? 0, `${id} must state its limitations`).toBeGreaterThan(0)
  })

  it('names the scatter or applicability, not just the formula', () => {
    const text = correlations.flatMap((id) => calc(id).limitations ?? []).join(' ')
    expect(text).toMatch(/scatter|±|ranges|not applicable|outside the data|read high/i)
  })
})

describe('limitation and assumption aggregation', () => {
  it('de-duplicates across calculations', () => {
    const ids: CalcId[] = ['correlation.phi-from-n60', 'correlation.phi-from-n60', 'ucs.undrained-strength']
    const lims = limitationsOf(ids)
    expect(new Set(lims).size).toBe(lims.length)
    expect(lims.length).toBeGreaterThan(2)
  })

  it('returns an empty list for entries that declare none', () => {
    expect(limitationsOf(['uscs.a-line'])).toEqual([])
    expect(assumptionsOf(['uscs.a-line'])).toEqual([])
  })

  it('collects the assumption behind cu = qu/2, which is the one that bites', () => {
    const a = assumptionsOf(['ucs.undrained-strength']).join(' ')
    expect(a).toMatch(/saturated cohesive/i)
    expect(limitationsOf(['ucs.undrained-strength']).join(' ')).toMatch(/granular|fissured/i)
  })
})

describe('id guards', () => {
  it('recognises real ids and rejects invented ones', () => {
    expect(isCalcId('spt.n60')).toBe(true)
    expect(isCalcId('spt.n61')).toBe(false)
    expect(isCalcId(42)).toBe(false)
  })

  it('categories partition the registry', () => {
    const cats = ['index', 'classification', 'field', 'strength', 'consolidation', 'correlation', 'analysis'] as const
    const total = cats.reduce((n, c) => n + calculationsIn(c).length, 0)
    expect(total).toBe(IDS.length)
  })
})

describe('standards catalogue', () => {
  it.each(STANDARD_IDS)('%s — designation, title and body', (id) => {
    const s = STANDARDS[id]
    expect(s.designation).toMatch(/^(ASTM|AASHTO|BS|ISO|NSCP|PNS)\s/)
    expect(s.title.length).toBeGreaterThan(15)
  })

  it('renders a short citation and a full one', () => {
    expect(cite('d4318')).toBe('ASTM D4318')
    expect(citeFull('d4318')).toContain('Liquid Limit')
  })

  it('has no duplicate designations', () => {
    const designations = STANDARD_IDS.map((id) => STANDARDS[id].designation)
    expect(new Set(designations).size).toBe(designations.length)
  })

  it('groups by category', () => {
    expect(standardsByCategory('classification').map((s) => s.designation)).toContain('ASTM D2487')
    expect(standardsByCategory('field').map((s) => s.designation)).toContain('ASTM D1586')
  })

  it('rejects an id that is not in the catalogue', () => {
    expect(isStandardId('d9999')).toBe(false)
    expect(isStandardId(undefined)).toBe(false)
  })
})
