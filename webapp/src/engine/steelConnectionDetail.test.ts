import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { buildConnectionDetail } from './steelConnectionDetail'
import { connectionMarks, type ConnectionType } from '../lib/steelMarks'
import { buildSheetSet } from '../lib/planSheets'
import type { PlanPrimitive } from './planRenderer'
import { STEEL } from './sheetInk'
import { shapeByName } from './aiscSections'
import { columnJ10 } from './columnJointChecks'
import type { RectSection } from './model'

const steel: RectSection = { id: 'S', name: 'W310x79', b: 254, h: 307, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

/** A 2×1-bay steel frame: moment connections at column flanges and webs. */
function frame() {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: steel, slabThickness: 150 })
  m.loads = buildGravityLoads(m, 1.0, 1.9)
  return m
}
/** A secondary beam framing into a through girder's web — a coped fin plate. */
function girderFrame() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: steel })
  m.nodes.push({ id: 'ga', x: 0, y: 3, z: 2.5 }, { id: 'gm', x: 3, y: 3, z: 2.5 }, { id: 'gb', x: 6, y: 3, z: 2.5 }, { id: 'sc', x: 3, y: 3, z: 0 })
  m.sections.push({ ...steel, id: 'g1s', shape: 'W360x51' }, { ...steel, id: 'g2s', shape: 'W360x51' }, { ...steel, id: 'sbs', shape: 'W310x38.7' })
  m.members.push({ id: 'g1', i: 'ga', j: 'gm', role: 'girder', section: 'g1s' }, { id: 'g2', i: 'gm', j: 'gb', role: 'girder', section: 'g2s' }, { id: 'sb', i: 'gm', j: 'sc', role: 'beam', section: 'sbs' })
  m.supports.push({ node: 'ga', fixity: 'fixed' }, { node: 'gb', fixity: 'fixed' }, { node: 'sc', fixity: 'pin' })
  m.loads = [...buildGravityLoads(m, 4.8, 2.4), { kind: 'member-point', member: 'sb', t: 0.4, P: 60, cat: 'D' }]
  return m
}

const mFrame = frame(), dFrame = designStructure(mFrame, soil)!
const mGirder = girderFrame(), dGirder = designStructure(mGirder, soil)!
const types = [...connectionMarks(dFrame).types, ...connectionMarks(dGirder).types]
const byKind = (k: ConnectionType['kind']) => types.find((t) => t.kind === k)!
const draw = (t: ConnectionType) => buildConnectionDetail({ conn: t.sample, hostShape: t.hostShape, hostKind: t.hostKind, faceType: t.faceType, beamShape: t.beamShape, mark: t.mark, Vu: t.Vu, Mu: t.Mu, ends: t.ends.length })
const texts = (ps: PlanPrimitive[]) => ps.flatMap((p) => (p.kind === 'text' ? [p.text] : []))

describe('buildConnectionDetail — the designed connection, drawn', () => {
  it('the frames produce all three kinds this sheet draws', () => {
    for (const k of ['moment-flange-weld', 'moment-web-plate', 'fin-plate'] as const) expect(byKind(k), k).toBeTruthy()
  })

  it('draws every designed bolt at its designed position, in both views', () => {
    for (const t of types) {
      const d = draw(t)
      // bolts are the circles in the accent; the title bubble is a circle too
      const circles = d.primitives.filter((p) => p.kind === 'circle' && p.stroke === STEEL)
      expect(circles, t.mark).toHaveLength(t.sample.bolts.n)
      // elevation: bolt centres sit the designed pitch apart
      if (t.sample.bolts.n > 1) {
        const ys = circles.map((c) => (c as { cy: number }).cy).sort((a, b) => a - b)
        expect(ys[1]! - ys[0]!).toBeCloseTo(t.sample.bolts.pitchMm, 6)
      }
      // and every bolt is dimensioned at the designed diameter
      for (const c of circles) expect((c as { r: number }).r).toBeCloseTo(t.sample.bolts.dia / 2, 9)
    }
  })

  it('dimensions the plate at its designed height and calls it out', () => {
    for (const t of types) {
      const d = draw(t)
      const dims = d.primitives.filter((p) => p.kind === 'dim').map((p) => (p as { text: string }).text)
      expect(dims).toContain(`${Math.round(t.sample.tab.hMm)}`)
      expect(texts(d.primitives).join(' | ')).toContain(`PL ${t.sample.tab.t}×${Math.round(t.sample.tab.wMm)}×${Math.round(t.sample.tab.hMm)}`)
      expect(texts(d.primitives).join(' | ')).toContain(`${t.sample.tab.weldSizeMm} E70XX FILLET`)
    }
  })

  it('names what each kind adds: CJP flanges, extension plates, a cope', () => {
    const mf = texts(draw(byKind('moment-flange-weld')).primitives).join(' | ')
    expect(mf).toMatch(/CJP FLANGE WELDS/)
    expect(mf).toMatch(/MOMENT CONNECTION/)
    const mp = byKind('moment-web-plate'), wp = mp.sample.flange!.webPlate!
    expect(texts(draw(mp).primitives).join(' | ')).toContain(`EXT. PL ${wp.tMm}×${Math.round(wp.wMm)}`)
    const fp = byKind('fin-plate')
    const fpd = draw(fp)
    expect(fpd.title).toMatch(/^FP\d+ — FIN PLATE — BEAM TO GIRDER WEB$/)
    expect(texts(fpd.primitives).join(' | ')).toMatch(/SIMPLE \(SHEAR\) CONNECTION/)
    expect(fp.sample.cope).toBeTruthy()
    const cope = fp.sample.cope!
    expect(fpd.primitives.some((p) => p.kind === 'dim' && p.text === `COPE ${cope.lengthMm}×${cope.depthMm}`)).toBe(true)
  })

  it('names the column face with a leader whose arrow lands ON that face', () => {
    const s = shapeByName('W310x79')!
    const col = { d: s.d!, tf: s.tf!, bf: s.bf! }
    const tipOf = (label: string, t: ConnectionType) => {
      const ps = draw(t).primitives
      const k = ps.findIndex((p) => p.kind === 'text' && p.text === label)
      const arrow = ps[k - 2]
      return arrow.kind === 'path' ? arrow.cmds[0] : null
    }
    // the flange the plate welds to is the band's beam-side strip, d − tf … d
    const f = tipOf('COLUMN FLANGE', byKind('moment-flange-weld'))!
    expect(f.x).toBeGreaterThan(col.d - col.tf - 1e-9)
    expect(f.x).toBeLessThan(col.d + 1e-9)
    // the web sits on the band's centre line, bf/2
    const w = tipOf('COLUMN WEB', byKind('moment-web-plate'))!
    expect(w.x).toBeCloseTo(col.bf / 2, 9)
  })

  it('draws the column stiffening the design calls for: continuity plates and a doubler, called out', () => {
    const t = byKind('moment-flange-weld')
    const j10 = columnJ10({ name: 'W310x79', d: 307, bf: 254, tf: 14.6, tw: 8.76, A: 10100, Fy: 345 },
      [{ beamId: 'L', Pf: 300, bfb: 165, tfb: 9.7 }, { beamId: 'R', Pf: 300, bfb: 165, tfb: 9.7 }],
      { atEnd: false, twoSided: true, Pr: 500, beamDepth: 310 })
    const plain = texts(draw(t).primitives).join(' | ')
    expect(plain).not.toMatch(/CONTINUITY|DOUBLER/)
    const d = buildConnectionDetail({ conn: { ...t.sample, j10 }, hostShape: t.hostShape, hostKind: t.hostKind, faceType: t.faceType, beamShape: t.beamShape, mark: t.mark })
    const all = texts(d.primitives).join(' | ')
    expect(all).toContain(`CONTINUITY PL ${j10.stiffeners!.ts}×${Math.round(j10.stiffeners!.bs)}`)
    expect(all).toContain(`DOUBLER PL ${j10.doubler!.td}`)
    // two plates of thickness ts, edge-on, at the beam-flange levels
    const plates = d.primitives.filter((p) => p.kind === 'rect' && Math.abs(p.h - j10.stiffeners!.ts) < 1e-9)
    expect(plates.length).toBeGreaterThanOrEqual(2)
  })

  it('cuts the girder as an I with its top flush with the beam (top of steel)', () => {
    const d = draw(byKind('fin-plate'))
    // the first filled path with 12 vertices is the girder cut; the beam is the coped 6-vertex outline
    const paths = d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'path' }> => p.kind === 'path' && p.cmds.length === 12)
    const girder = paths[0]!, beam = d.primitives.find((p): p is Extract<PlanPrimitive, { kind: 'path' }> => p.kind === 'path' && p.cmds.length === 6)!
    expect(Math.min(...girder.cmds.map((c) => c.y))).toBeCloseTo(Math.min(...beam.cmds.map((c) => c.y)), 9)
  })

  it('every primitive is finite and inside the sheet bounds; the mark heads the title', () => {
    for (const t of types) {
      const d = draw(t)
      expect(d.title.startsWith(`${t.mark} — `)).toBe(true)
      const { minX, minY, maxX, maxY } = d.bounds
      for (const p of d.primitives) {
        const pts: [number, number][] = p.kind === 'line' || p.kind === 'dim' ? [[p.x1, p.y1], [p.x2, p.y2]]
          : p.kind === 'rect' ? [[p.x, p.y], [p.x + p.w, p.y + p.h]] : p.kind === 'circle' ? [[p.cx, p.cy]]
          : p.kind === 'path' ? p.cmds.map((c) => [c.x, c.y] as [number, number]) : [[p.x, p.y]]
        for (const [x, y] of pts) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
          expect(x >= minX - 1e-6 && x <= maxX + 1e-6 && y >= minY - 1e-6 && y <= maxY + 1e-6).toBe(true)
        }
      }
    }
  })
})

describe('the sheet set carries one sheet per connection mark', () => {
  it('S-11, keyed by mark, titled by the drawing', () => {
    for (const [m, d] of [[mFrame, dFrame], [mGirder, dGirder]] as const) {
      const sheets = buildSheetSet(m, d, soil).filter((s) => s.group === 'Steel connections')
      const marks = connectionMarks(d).types
      expect(sheets.map((s) => s.key)).toEqual(marks.map((t) => `steel-connection-${t.mark.toLowerCase()}`))
      for (const s of sheets) expect(texts(s.drawing.primitives)).toContain('S-11')
    }
  })
})
