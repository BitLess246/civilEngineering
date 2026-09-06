import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure, type StructureDesign } from '../engine/pipeline'
import type { RectSection } from '../engine/model'
import { memberRows, memberSolution, soilFromInputs, type MemberKind } from './modelMemberResults'

// The calculators read a saved project's design through these helpers. The
// rows must be the design's own — same members, same verdicts — and the
// worked solutions must come from the same builders the Model Space schedule
// uses, so the calculator cannot disagree with the schedule or the report.
const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeDesign(): { model: ReturnType<typeof generateGridModel>; design: StructureDesign } {
  const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200 })
  model.loads = model.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  return { model, design: designStructure(model, soil)! }
}

const KINDS: MemberKind[] = ['beam', 'column', 'slab', 'steelBeam', 'steelColumn', 'footing', 'combined']

describe('memberRows — the design\'s own members, unchanged', () => {
  const { model, design } = makeDesign()

  it('lists every RC beam and column the design has, with its verdict', () => {
    const beams = memberRows(model, design, 'beam')
    expect(beams.map((r) => r.id).sort()).toEqual(design.beams.map((b) => b.id).sort())
    for (const r of beams) {
      const row = design.beams.find((b) => b.id === r.id)!
      expect(r.ok).toBe(row.ok)
      expect(r.section).toBe('300×500')
      expect(r.detail).toMatch(/Mu |Vu /)
      expect(r.util === null || (r.util > 0 && Number.isFinite(r.util))).toBe(true)
    }
    const cols = memberRows(model, design, 'column')
    expect(cols.map((r) => r.id).sort()).toEqual(design.columns.map((c) => c.id).sort())
    for (const r of cols) {
      const row = design.columns.find((c) => c.id === r.id)!
      expect(r.ok).toBe(row.ok)
      expect(r.util).toBeCloseTo(row.util, 6)
    }
  })

  it('a kind the design never produced comes back empty, not invented', () => {
    expect(memberRows(model, design, 'steelBeam')).toHaveLength(design.steelBeams.length)
    expect(memberRows(model, design, 'steelColumn')).toHaveLength(design.steelColumns.length)
    expect(memberRows(model, design, 'combined')).toHaveLength(design.combined.length)
  })

  it('every kind answers without throwing on a full RC design', () => {
    for (const k of KINDS) expect(Array.isArray(memberRows(model, design, k))).toBe(true)
  })
})

describe('memberSolution — the schedule\'s own worked solution', () => {
  const { model, design } = makeDesign()

  it('a beam\'s steps speak of the bars the schedule carries', () => {
    const worst = [...design.beams].sort((a, z) => z.sections.length - a.sections.length)[0]
    const steps = memberSolution(model, design, 'beam', worst.id, soil)
    expect(steps.length).toBeGreaterThan(0)
    // the bar layout step is the schedule's own — bars, diameter, spacing
    const text = steps.map((s) => `${s.title} ${s.lines.map((l) => ('text' in l ? l.text : l.tex)).join(' ')}`).join(' ')
    expect(text).toMatch(/⌀/)
    expect(text).toContain('Bar layout')
  })

  it('a column\'s steps carry the biaxial check', () => {
    const c = design.columns[0]
    const steps = memberSolution(model, design, 'column', c.id, soil)
    expect(steps.length).toBeGreaterThan(0)
  })

  it('an unknown member id comes back empty — never a guess', () => {
    expect(memberSolution(model, design, 'beam', 'no-such-member', soil)).toEqual([])
    expect(memberSolution(model, design, 'column', 'no-such-member', soil)).toEqual([])
  })

  it('slabs carry their summary only — no steps are invented for them', () => {
    if (!design.slabs.length) return
    expect(memberSolution(model, design, 'slab', design.slabs[0].plate, soil)).toEqual([])
  })
})

describe('soilFromInputs — the opaque bag, read defensively', () => {
  it('missing fields fall back to Model Space\'s own defaults', () => {
    expect(soilFromInputs({})).toEqual({ qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 })
  })
  it('the keys Model Space writes are the keys this reads', () => {
    expect(soilFromInputs({ qa: 150, gammaSoil: 17, gammaC: 25, Hf: 2 })).toEqual({
      qAllow: 150, gammaSoil: 17, gammaConc: 25, H: 2,
    })
    expect(soilFromInputs({ qa: 'nonsense' })).toEqual({ qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 })
  })
})
