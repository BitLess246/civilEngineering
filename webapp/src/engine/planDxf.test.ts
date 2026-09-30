import { describe, it, expect } from 'vitest'
import { planToDxf, planSetToDxf, arcBulge, dxfText } from './planDxf'
import type { Drawing, PlanPrimitive } from './planRenderer'
import { STEEL, STEEL_LIGHT, SHEET_INK } from './sheetInk'
import { buildSheetSet } from '../lib/planSheets'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'

/** DXF as (code, value) pairs — the whole grammar of the ASCII format. */
function pairs(dxf: string): [number, string][] {
  const lines = dxf.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  expect(lines.length % 2).toBe(0)
  const out: [number, string][] = []
  for (let k = 0; k < lines.length; k += 2) {
    const code = Number(lines[k])
    expect(Number.isInteger(code), `code at line ${k}: "${lines[k]}"`).toBe(true)
    out.push([code, lines[k + 1]!])
  }
  return out
}

/** Entities of the ENTITIES section, each as its list of pairs. */
function entities(dxf: string): { type: string; g: [number, string][] }[] {
  const p = pairs(dxf)
  const start = p.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && p[i - 1]![1] === 'SECTION')
  const out: { type: string; g: [number, string][] }[] = []
  for (let i = start + 1; i < p.length; i++) {
    const [c, v] = p[i]!
    if (c === 0 && v === 'ENDSEC') break
    if (c === 0) out.push({ type: v, g: [] })
    else out[out.length - 1]!.g.push([c, v])
  }
  return out
}
const val = (e: { g: [number, string][] }, code: number) => e.g.find(([c]) => c === code)?.[1]
const num = (e: { g: [number, string][] }, code: number) => Number(val(e, code))

const sheet = (primitives: PlanPrimitive[]): Drawing => ({ primitives, bounds: { minX: 0, minY: 0, maxX: 2, maxY: 1 } })

describe('planToDxf — the file', () => {
  const dxf = planToDxf(sheet([{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0.5, stroke: STEEL }]))

  it('is well-formed R12: code/value pairs, sections closed, EOF last', () => {
    const p = pairs(dxf)
    expect(p[0]).toEqual([0, 'SECTION'])
    expect(p[p.length - 1]).toEqual([0, 'EOF'])
    expect(p.filter(([c, v]) => c === 0 && v === 'SECTION').length).toBe(p.filter(([c, v]) => c === 0 && v === 'ENDSEC').length)
    const ver = p.findIndex(([c, v]) => c === 9 && v === '$ACADVER')
    expect(p[ver + 1]).toEqual([1, 'AC1009'])
  })

  it('writes millimetres, y up', () => {
    const [ln] = entities(dxf)
    expect(ln!.type).toBe('LINE')
    expect([num(ln!, 10), num(ln!, 20), num(ln!, 11), num(ln!, 21)]).toEqual([0, 0, 1000, -500])
  })

  it('declares every layer it uses, and puts steel on its own layer', () => {
    const p = pairs(dxf)
    const declared = new Set(p.filter(([c], i) => c === 2 && p[i - 1]![1] === 'LAYER').map(([, v]) => v))
    for (const e of entities(dxf)) expect(declared.has(val(e, 8)!)).toBe(true)
    expect(val(entities(dxf)[0]!, 8)).toBe('REBAR')
  })
})

describe('planToDxf — primitives', () => {
  it('a filled bar dot is a donut: two half-circle bulges, a radius wide', () => {
    const [d] = entities(planToDxf(sheet([{ kind: 'circle', cx: 1, cy: 0.5, r: 0.01, fill: STEEL }])))
    expect(d!.type).toBe('POLYLINE')
    expect(num(d!, 70)).toBe(1)                // closed
    expect(num(d!, 40)).toBeCloseTo(10, 9)      // width = r, mm
    const verts = entities(planToDxf(sheet([{ kind: 'circle', cx: 1, cy: 0.5, r: 0.01, fill: STEEL }]))).filter((e) => e.type === 'VERTEX')
    expect(verts.map((v) => num(v, 42))).toEqual([1, 1])
    expect(verts.map((v) => num(v, 10))).toEqual([995, 1005])
  })

  it('an outlined circle stays a CIRCLE; an invisible one is dropped', () => {
    const e = entities(planToDxf(sheet([
      { kind: 'circle', cx: 0, cy: 0, r: 0.2, stroke: SHEET_INK },
      { kind: 'circle', cx: 0, cy: 0, r: 0.2, stroke: '#fff', fill: '#ffffff' },
    ])))
    expect(e.map((x) => x.type)).toEqual(['CIRCLE'])
    expect(num(e[0]!, 40)).toBe(200)
  })

  it('drops the screen-only white casing strokes and fills', () => {
    const e = entities(planToDxf(sheet([
      { kind: 'path', cmds: [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 1, y: 0 }], stroke: '#fff', width: 4 },
      { kind: 'path', cmds: [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: 1, y: 0 }], stroke: STEEL },
    ])))
    expect(e.filter((x) => x.type === 'POLYLINE')).toHaveLength(1)
  })

  it('a rectangle is one closed polyline; a dashed one carries the DASHED line type', () => {
    const dxf = planToDxf(sheet([{ kind: 'rect', x: 0, y: 0, w: 0.4, h: 0.4, stroke: SHEET_INK, dash: [0.02, 0.01] }]))
    const e = entities(dxf)
    expect(e.filter((x) => x.type === 'VERTEX')).toHaveLength(4)
    expect(val(e[0]!, 6)).toBe('DASHED')
    expect(num(e[0]!, 70)).toBe(1)
    expect(pairs(dxf).some(([c, v]) => c === 2 && v === 'DASHED')).toBe(true)
  })

  it('text: aligned at its anchor, cap height from the em, rotation in the y-up sense', () => {
    const e = entities(planToDxf(sheet([
      { kind: 'text', x: 1, y: 0.5, text: '8-20mmØ BARS', size: 0.1, anchor: 'middle' },
      { kind: 'text', x: 1, y: 0.5, text: 'x', size: 0.1, anchor: 'end', rotate: -90 },
    ])))
    expect(val(e[0]!, 1)).toBe('8-20mm%%c BARS')
    expect(num(e[0]!, 72)).toBe(1)
    expect(num(e[0]!, 73)).toBe(2)
    expect(num(e[0]!, 40)).toBeCloseTo(72, 9)
    expect([num(e[0]!, 11), num(e[0]!, 21)]).toEqual([1000, -500])
    expect(num(e[1]!, 72)).toBe(2)
    expect(num(e[1]!, 50)).toBe(90)
  })

  it('a dimension is written as its lines, ticks and text', () => {
    const e = entities(planToDxf(sheet([{ kind: 'dim', x1: 0, y1: -0.3, x2: 1.2, y2: -0.3, text: '1200', off: 0, size: 0.1, ext: 0 }])))
    expect(e.filter((x) => x.type === 'LINE').length).toBe(1 + 2 + 2)   // dim line, ticks, extension lines
    expect(e.find((x) => x.type === 'TEXT') && val(e.find((x) => x.type === 'TEXT')!, 1)).toBe('1200')
    expect(new Set(e.map((x) => val(x, 8)))).toEqual(new Set(['DIMENSIONS']))
  })

  it('SVG arcs become bulges on the vertex they leave', () => {
    // a U-hook: down, half-circle, up
    const e = entities(planToDxf(sheet([{
      kind: 'path', stroke: STEEL_LIGHT, cmds: [
        { c: 'M', x: 0, y: 0 }, { c: 'L', x: 0, y: 1 },
        { c: 'A', rx: 0.1, ry: 0.1, x: 0.2, y: 1, sweep: 0 }, { c: 'L', x: 0.2, y: 0 },
      ],
    }])))
    const verts = e.filter((x) => x.type === 'VERTEX')
    expect(verts).toHaveLength(4)
    expect(Math.abs(num(verts[1]!, 42))).toBeCloseTo(1, 9)
    expect(val(verts[0]!, 42)).toBeUndefined()
    expect(val(e[0]!, 8)).toBe('REBAR-TIES')
  })
})

describe('planSetToDxf — the whole set in one file', () => {
  const a: Drawing = { primitives: [{ kind: 'line', x1: 0, y1: 0, x2: 2, y2: 1, stroke: STEEL }], bounds: { minX: 0, minY: 0, maxX: 2, maxY: 1 } }
  const b: Drawing = { primitives: [{ kind: 'line', x1: 5, y1: 5, x2: 6, y2: 7, stroke: STEEL }], bounds: { minX: 5, minY: 5, maxX: 6, maxY: 7 } }
  it('keeps every sheet, side by side, clear of each other and at true scale', () => {
    const [l1, l2] = entities(planSetToDxf([a, b])).filter((e) => e.type === 'LINE')
    // the first at the origin, the second moved to start a gap past it
    expect([num(l1!, 10), num(l1!, 11)]).toEqual([0, 2000])
    expect(num(l2!, 10)).toBeGreaterThan(2000)
    // lengths unchanged — a translation, not a rescale
    expect(num(l2!, 11) - num(l2!, 10)).toBeCloseTo(1000, 9)
    expect(num(l2!, 21) - num(l2!, 20)).toBeCloseTo(-2000, 9)
    // both sheets' tops on one line
    expect(num(l2!, 20)).toBeCloseTo(num(l1!, 20), 9)
  })
  it('wraps into rows', () => {
    const ls = entities(planSetToDxf([a, a, a], 2)).filter((e) => e.type === 'LINE')
    expect(num(ls[2]!, 10)).toBe(0)
    expect(num(ls[2]!, 20)).toBeLessThan(num(ls[0]!, 21))    // a row lower (y up)
  })
})

describe('arcBulge', () => {
  it('is tan(θ/4): ±1 for a half circle, tan(π/8) for a quarter', () => {
    expect(arcBulge([0, 0], [2, 0], 1, 0, 1)).toBeCloseTo(1, 12)
    expect(arcBulge([1, 0], [0, 1], 1, 0, 1)).toBeCloseTo(Math.tan(Math.PI / 8), 12)
    expect(arcBulge([1, 0], [0, 1], 1, 1, 1)).toBeCloseTo(Math.tan((3 * Math.PI) / 8), 12)
  })
  it('SVG sweep 1 (clockwise on a y-down screen) is counter-clockwise once y is up', () => {
    expect(arcBulge([1, 0], [0, 1], 1, 0, 1)).toBeGreaterThan(0)
    expect(arcBulge([1, 0], [0, 1], 1, 0, 0)).toBeLessThan(0)
  })
  it('scales a radius too small for the chord up to it, as SVG does', () => {
    expect(arcBulge([0, 0], [2, 0], 0.2, 0, 1)).toBeCloseTo(1, 12)
  })
})

describe('dxfText', () => {
  it('uses AutoCAD codes for Ø ° ± and ASCII for typography', () => {
    expect(dxfText('⌀10 @ 90° ±5')).toBe('%%c10 @ 90%%d %%p5')
    expect(dxfText('400×400 — ℓd ≥ 300')).toBe('400x400 - ld >= 300')
  })
  it('escapes anything else rather than writing bytes R12 cannot hold', () => {
    expect(dxfText('ж')).toBe('\\U+0436')
  })
})

describe('every sheet of a designed frame exports', () => {
  const role = (b: number, h: number, id: string) => ({ id, name: id, b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 })
  const soil = { qAllow: 150, gammaSoil: 18, gammaConc: 24, H: 1.5 }
  const model = generateGridModel({
    baysX: [6, 6], baysZ: [6], storeyH: [3, 3],
    column: role(400, 400, 'COL'), girder: role(300, 500, 'GIR'), beam: role(250, 450, 'BEA'), slabThickness: 150,
  })
  model.loads = buildGravityLoads(model, 4.8, 2.4)
  const design = designStructure(model, soil as never)!
  const sheets = buildSheetSet(model, design, soil)

  it('as well-formed DXF with finite coordinates, declared layers and no unescaped bytes', () => {
    expect(sheets.length).toBeGreaterThan(5)
    for (const s of sheets) {
      const dxf = planToDxf(s.drawing)
      // printable ASCII and newlines only: R12 has no encoding for anything else
      expect(/[^\n -~]/.test(dxf), s.key).toBe(false)
      const p = pairs(dxf)
      const declared = new Set(p.filter(([c], i) => c === 2 && p[i - 1]![1] === 'LAYER').map(([, v]) => v))
      const es = entities(dxf)
      expect(es.length, s.key).toBeGreaterThan(10)
      for (const e of es) {
        if (e.type !== 'SEQEND') expect(declared.has(val(e, 8)!), `${s.key} ${e.type}`).toBe(true)
        for (const [c, v] of e.g) if (c >= 10 && c <= 59) expect(Number.isFinite(Number(v)), `${s.key} ${e.type} ${c}`).toBe(true)
      }
    }
  }, 60_000)
})
