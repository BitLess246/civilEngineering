import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { addRoofTrusses, trussPart, isPurlin } from './roofTruss'
import { designStructure } from './pipeline'
import { buildTrussElevation, governingForce } from './trussElevation'
import { trussElevationBundles } from '../lib/trussElevations'
import { buildSheetSet } from '../lib/planSheets'
import { planToSvg, type PlanPrimitive } from './planRenderer'
import { SHEET_WARN, SHEET_STEELWORK } from './sheetInk'

const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
// 2 × 1 bays, one storey; trusses span the 12 m along X on grid lines 1 and 2
const trussed = () => {
  const m0 = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2], section })
  const r = addRoofTrusses({ ...m0, loads: [] }, {
    spanAlong: 'x', profile: 'gable', web: 'howe', rise: 1.5, panel: 1.5,
    chordShape: 'HSS89x89x6.4', webShape: 'HSS64x64x4.8', purlinShape: 'C150x12.2', qD: 0.5, qLr: 0.6,
  })
  return { ...r.model, loads: buildGravityLoads(r.model, 2, 2) }
}
const model = trussed()
const design = designStructure(model, soil)!
const texts = (P: PlanPrimitive[]) => P.filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text')

describe('trussPart / isPurlin — the id convention, read back', () => {
  it('names the truss and the part', () => {
    expect(trussPart('rt2.bc3')).toEqual({ truss: 2, part: 'bottom' })
    expect(trussPart('rt1.tc0_1')).toEqual({ truss: 1, part: 'top' })
    expect(trussPart('rt12.w7')).toEqual({ truss: 12, part: 'web' })
    expect(trussPart('bx0.0.1')).toBeNull()
    expect(isPurlin('pu1.3')).toBe(true)
    expect(isPurlin('rt1.w0')).toBe(false)
  })
})

describe('trussElevationBundles — one sheet per truss, on its own grid line', () => {
  const bundles = trussElevationBundles(model, design)

  it('finds both trusses, each on the plan grid line it stands on', () => {
    expect(bundles.map((b) => b.line)).toEqual(['1', '2'])
    const b = bundles[0].input
    expect(b.bearingY).toBeCloseTo(3.2, 9)
    // it bears on the three columns A, B, C along that line
    expect(b.grids.map((g) => g.label)).toEqual(['A', 'B', 'C'])
    expect(b.members.length).toBe(16 + 13)
    expect(b.purlinAt.length).toBe(7)
    expect(b.purlinShape).toBe('C150x12.2')
  })

  it('carries the brace schedule’s own forces — the sheet and S-07 quote one number', () => {
    const rows = new Map((design.steelBraces ?? []).map((r) => [r.id, r]))
    const b = bundles[0].input
    expect(b.members.every((m) => rows.has(m.id))).toBe(true)
    for (const m of b.members) {
      expect(m.Pu).toBe(rows.get(m.id)!.Pu)
      expect(m.Tu).toBe(rows.get(m.id)!.Tu)
    }
  })

  it('the strip width read back from the roofing equals half the spacing either side', () => {
    // two lines 5 m apart: each truss carries a 2.5 m strip
    expect(bundles[0].input.spacing).toBeCloseTo(2.5, 9)
  })

  it('before a design there are no forces, and the sheet says nothing it does not know', () => {
    const pre = trussElevationBundles(model, null)[0].input
    expect(pre.members.every((m) => m.Pu === undefined && m.util === undefined)).toBe(true)
    const d = buildTrussElevation(pre)
    expect(texts(d.primitives).some((t) => /^[TC] \d/.test(t.text))).toBe(false)
    expect(texts(d.primitives).some((t) => t.text === 'OK' || t.text === 'FAIL')).toBe(false)
  })
})

describe('buildTrussElevation', () => {
  const b = trussElevationBundles(model, design)[0]
  const d = buildTrussElevation(b.input, { detailNo: '1', sheetRef: 'S-14' })
  const T = texts(d.primitives)

  it('every member drawn to scale — a band its rolled width wide', () => {
    const bands = d.primitives.filter((p) => p.kind === 'path' && p.closed && p.fill === SHEET_STEELWORK)
    expect(bands.length).toBe(b.input.members.length)
    // a 6 m bay of the bottom chord split into four 1.5 m panels: the band's
    // long side is the member length, mm; its short side the HSS89 width
    const bc0 = bands[0] as Extract<PlanPrimitive, { kind: 'path' }>
    const [p0, p1, , p3] = bc0.cmds as { x: number; y: number }[]
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeCloseTo(1500, 6)
    expect(Math.hypot(p3.x - p0.x, p3.y - p0.y)).toBeCloseTo(88.9, 1)
  })

  it('labels each member with its governing force, T or C', () => {
    const labels = T.filter((t) => /^[TC] \d+\.\d$/.test(t.text))
    expect(labels.length).toBe(b.input.members.length)
    expect(governingForce({ Pu: 3, Tu: 8 })).toEqual({ sense: 'T', kN: 8 })
    expect(governingForce({ Pu: 9, Tu: 8 })).toEqual({ sense: 'C', kN: 9 })
    expect(governingForce({})).toBeNull()
  })

  it('dimensions the panel chain, the span and the rise', () => {
    const dims = d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'dim' }> => p.kind === 'dim')
    expect(dims.filter((x) => x.text === '1500' && x.y1 === x.y2).length).toBe(8)          // eight 1500 panels
    expect(dims.some((x) => x.text === 'SPAN 12000')).toBe(true)
    expect(dims.some((x) => x.text === '1500' && x.x1 === x.x2)).toBe(true)          // the rise, vertical
    expect(T.some((t) => t.text === 'APEX +4.700')).toBe(true)
    expect(T.some((t) => t.text === 'BEARING +3.200')).toBe(true)
  })

  it('pitch, roofing and the schedule are on the sheet', () => {
    const all = T.map((t) => t.text).join(' ')
    expect(all).toMatch(/PITCH 1 : 4\.00 \(14\.0°\)/)                  // 1.5 m over 6 m
    expect(all).toMatch(/0\.50 kPa DEAD \+ 0\.60 kPa ROOF LIVE/)
    expect(all).toMatch(/TRUSS MEMBER SCHEDULE/)
    expect(all).toMatch(/HSS89x89x6\.4/)
    expect(all).toMatch(/PURLIN C150x12\.2/)
    expect(d.title).toBe('ROOF TRUSS ELEVATION — GRID 1')
  })

  it('a failing member is drawn and scheduled in the warning ink, and raised', () => {
    const bad = { ...b.input, members: b.input.members.map((m, k) => (k === 0 ? { ...m, ok: false, util: 1.4 } : m)) }
    const f = buildTrussElevation(bad)
    expect(f.designNotes[0]).toMatch(/fails its axial check — utilisation 1\.40/)
    expect(f.primitives.some((p) => p.kind === 'path' && p.stroke === SHEET_WARN)).toBe(true)
    expect(texts(f.primitives).some((t) => t.text === 'FAIL' && t.color === SHEET_WARN)).toBe(true)
  })

  it('a flat truss is labelled by its top chord, not an apex, and zero-force members read 0', () => {
    const m0 = generateGridModel({ baysX: [9], baysZ: [5], storeyH: [3.2], section })
    const r = addRoofTrusses({ ...m0, loads: [] }, { spanAlong: 'x', profile: 'flat', web: 'warren', rise: 1.2, panel: 1.5,
      chordShape: 'HSS89x89x6.4', webShape: 'HSS64x64x4.8', qD: 0.5, qLr: 0 })
    const m = { ...r.model, loads: buildGravityLoads(r.model, 2, 2) }
    const fb = trussElevationBundles(m, designStructure(m, soil)!)[0]
    const ft = texts(buildTrussElevation(fb.input).primitives).map((t) => t.text)
    expect(ft).toContain('TOP CHORD +4.400')
    expect(ft.some((t) => t.startsWith('APEX'))).toBe(false)
    expect(ft.join(' ')).not.toMatch(/PITCH/)
    expect(ft.some((t) => /^[TC] 0\.0$/.test(t))).toBe(false)
  })

  it('serialises to SVG', () => {
    const svg = planToSvg(d)
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('ROOF TRUSS ELEVATION')
  })
})

describe('the design treats a truss member as a truss member', () => {
  it('member check only — its ends are panel points, not frame gussets — and it passes on this light roof', () => {
    const rows = (design.steelBraces ?? []).filter((r) => trussPart(r.id))
    expect(rows.length).toBe(2 * 29)
    for (const r of rows) {
      expect(r.truss).toBe(true)
      expect(r.ends).toEqual([])
      expect(r.member.tension.U).toBe(1)                  // welded all round, Table D3.1 case 1
      expect(r.ok).toBe(r.member.ok)
    }
    expect(rows.every((r) => r.ok)).toBe(true)
  })
})

describe('in the sheet set', () => {
  it('one S-14 sheet per truss, after the frame elevations', () => {
    const sheets = buildSheetSet(model, design, soil)
    const trusses = sheets.filter((s) => s.group === 'Roof truss elevations')
    expect(trusses.map((s) => s.title)).toEqual(['Grid 1 — roof truss', 'Grid 2 — roof truss'])
    const idx = (g: string) => sheets.findIndex((s) => s.group === g)
    expect(idx('Roof truss elevations')).toBeGreaterThan(idx('Frame elevations'))
    expect(new Set(sheets.map((s) => s.key)).size).toBe(sheets.length)
  })

  it('a model without trusses has none', () => {
    const m0 = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3.2], section })
    const m = { ...m0, loads: buildGravityLoads(m0, 2, 2) }
    expect(buildSheetSet(m, designStructure(m, soil)!, soil).some((s) => s.group === 'Roof truss elevations')).toBe(false)
    expect(m.members.some((x) => trussPart(x.id))).toBe(false)
  })
})
