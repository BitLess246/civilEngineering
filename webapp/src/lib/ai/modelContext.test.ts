import { describe, it, expect } from 'vitest'
import { modelPageSnapshot, rcBeamFailures, MAX_LISTED } from './modelContext'
import { formatPageSnapshot, MAX_SNAPSHOT_CHARS } from './pageContext'
import { generateGridModel, buildGravityLoads } from '../../engine/modelBuilder'
import { designStructure, designOK, failingChecks } from '../../engine/pipeline'
import type { RectSection } from '../../engine/model'

const rc: RectSection = { id: 'S', name: 'RC', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const value = (s: ReturnType<typeof modelPageSnapshot>, label: string) =>
  [...s.inputs, ...s.results].find((f) => f.label === label)?.value

function frame(beam?: Partial<RectSection>) {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: rc, slabThickness: 150 })
  if (beam) for (const b of m.members.filter((x) => x.role !== 'column')) Object.assign(m.sections.find((s) => s.id === b.section)!, beam)
  m.loads = buildGravityLoads(m, 2.4, 4.8)
  return m
}

describe('modelPageSnapshot — what the assistant sees of Model Space', () => {
  it('an empty workspace says so, rather than sending nothing', () => {
    const s = modelPageSnapshot(null, null, null)
    expect(s.route).toBe('/model')
    expect(s.notes.join(' ')).toMatch(/no model yet/)
  })

  it('describes the frame before analysis: members, storeys, sections, loads — and says what has not run', () => {
    const m = frame()
    const s = modelPageSnapshot(m, null, null)
    const cols = m.members.filter((x) => x.role === 'column').length
    expect(value(s, 'frame')).toContain(`${cols} columns`)
    expect(value(s, 'plan × height')).toBe('12.0 × 5.0 m, 6.5 m tall')
    expect(value(s, 'storeys')).toBe('Level 1 @ +3.5 m, Level 2 @ +6.5 m')
    expect(value(s, 'sections')).toContain('column RC 300×500')
    expect(value(s, 'materials')).toBe("f'c 28 / fy 415 MPa")
    expect(value(s, 'loads')).toMatch(/^D: self-weight ×\d+, [\d.]+ kPa area ×4; L: 4.8 kPa area ×4$/)
    expect(value(s, 'analysis')).toBe('not run yet')
    expect(value(s, 'design')).toBe('not run yet')
  })

  it('after design: the verdict, peak utilisation and governing case the page reports', () => {
    const m = frame(), d = designStructure(m, soil)!
    const s = modelPageSnapshot(m, { combos: 7, governing: d.govName }, d)
    expect(value(s, 'analysis')).toBe(`run — 7 load combinations, governing ${d.govName}`)
    const verdict = value(s, 'design')!
    expect(verdict).toContain(designOK(d) ? 'ALL CHECKS PASS' : `${failingChecks(d)} failing check`)
    expect(verdict).toContain(`governing case ${d.govName}`)
    expect(value(s, 'most utilised (passing)')).toBeTruthy()
    expect(value(s, 'other checks')).toMatch(/footings: \d+ \(\d+ fail\)/)
  })

  it('names every failing member (to a limit) with the reason the pipeline failed it', () => {
    const m = frame({ b: 200, h: 250 }), d = designStructure(m, soil)!
    const failing = d.beams.filter((b) => !b.ok)
    expect(failing.length).toBeGreaterThan(0)
    const s = modelPageSnapshot(m, { combos: 7, governing: d.govName }, d)
    const line = value(s, `failing members (${failing.length + d.columns.filter((c) => !c.ok).length})`)!
    expect(line).toContain(failing[0]!.id)
    // the reason is the pipeline's own, not a guess
    for (const why of rcBeamFailures(failing[0]!)) expect(line).toContain(why)
    expect(line.split(' | ').filter((x) => x !== '…').length).toBeLessThanOrEqual(MAX_LISTED)
    expect(rcBeamFailures(failing[0]!).join(' ')).toMatch(/Table 409.3.1.1|flexure|shear|joint|compression/)
  })

  it('lists the failing slab panels with the thickness that would let a bar mat comply', () => {
    const m = frame({ b: 250, h: 350 }), d = designStructure(m, soil)!
    const bad = d.slabs.filter((x) => !x.ok)
    expect(bad.length).toBeGreaterThan(0)
    const line = value(modelPageSnapshot(m, null, d), 'failing slabs')!
    expect(line).toContain(bad[0]!.plate)
    if (bad[0]!.minThickness) expect(line).toContain(`needs h ≥ ${Math.round(bad[0]!.minThickness)} mm`)
  })

  it('the selected member leads the results, with its own design line', () => {
    const m = frame({ b: 200, h: 250 }), d = designStructure(m, soil)!
    const bad = d.beams.find((b) => !b.ok)!
    const s = modelPageSnapshot(m, { combos: 7, governing: d.govName }, d, bad.id)
    expect(s.results[0]!.label).toBe('selected')
    expect(s.results[0]!.value).toMatch(new RegExp(`^${bad.id} \\(\\w+, RC 200×250\\) — FAILS: `))
  })

  it('fits the snapshot cap on a real building', () => {
    const m = generateGridModel({ baysX: [6, 6, 6, 6], baysZ: [5, 5, 5], storeyH: [3.5, 3, 3, 3, 3], section: { ...rc, b: 200, h: 250 }, slabThickness: 150 })
    m.loads = buildGravityLoads(m, 2.4, 4.8)
    const d = designStructure(m, soil)!
    const t = formatPageSnapshot(modelPageSnapshot(m, { combos: 7, governing: d.govName }, d))
    expect(t.length).toBeLessThanOrEqual(MAX_SNAPSHOT_CHARS + 1)
    expect(t).toContain('Open calculator: Model Space')
  })
})
