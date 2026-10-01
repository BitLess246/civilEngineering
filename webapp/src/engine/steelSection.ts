// ─────────────────────────────────────────────────────────────────────────
// THE DRAWN STEEL SECTION — one description of a rolled shape's outline.
//
// `steelProfile` is the outline of a W, WT, C, L (single or back-to-back 2L),
// HSS or pipe from its `aiscSections` dimensions, in mm, with its CENTROID at
// (0, 0), y UP — the point the analysis line runs through, so a tee, channel
// or angle hangs off the member axis the way it is actually connected. The 3D extrusion (`lib/sectionShapes3d`) and the section sheet both
// read it, so the shape on the sheet and the shape in the model are one
// geometry — there used to be three (this, the 3D one, and a hand-drawn SVG
// `WShapeSection` beside the steel schedule).
//
// `buildSteelSectionDetail` is the sheet: the section cut solid, its axes,
// d / bf / tf / tw (or t, D) dimensioned, and the catalogue properties the
// design used (A, I, S, Z, r) — AISC 360-16, Table 1-1 style.
// Units: mm throughout.
// ─────────────────────────────────────────────────────────────────────────
import type { AiscShape, EffectiveSection } from './aiscSections'
import { shapeByName, effectiveSection } from './aiscSections'
import { deriveWSection } from './steelDesign'
import type { PlanPrimitive, PathCmd, Drawing } from './planRenderer'
import { SHEET_INK, SHEET_GRID } from './sheetInk'
import { titleBlock } from './detailSheet'

type P2 = [number, number]
/** One closed outline and the holes cut from it, mm, y up. */
export interface SteelProfile { outer: P2[]; holes: P2[][] }

const circle = (r: number, n = 48): P2[] =>
  Array.from({ length: n }, (_, k) => [r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n)] as P2)

/** An angle with its heel at x0, legs running `dir` (±1) and up. */
function angle(x0: number, dir: 1 | -1, t: number, legH: number, legV: number): P2[] {
  const bot = -legV / 2, top = legV / 2
  return [[x0, bot], [x0 + dir * legH, bot], [x0 + dir * legH, bot + t], [x0 + dir * t, bot + t], [x0 + dir * t, top], [x0, top]]
}

/** The outline(s) of a section, mm, centroid at the origin, y up. */
export function steelProfile(eff: EffectiveSection): SteelProfile[] {
  const ps = rawProfile(eff)
  const [cx, cy] = profileCentroid(ps)
  if (Math.abs(cx) < 1e-9 && Math.abs(cy) < 1e-9) return ps
  const mv = (q: P2[]): P2[] => q.map(([x, y]) => [x - cx, y - cy])
  return ps.map((p) => ({ outer: mv(p.outer), holes: p.holes.map(mv) }))
}

/** The outline(s) about the bounding-box centre. */
function rawProfile(eff: EffectiveSection): SteelProfile[] {
  const s = eff.base
  if (eff.family === 'W' || eff.family === 'WT') {
    const bf = s.bf ?? 100, d = s.d ?? 100, tf = s.tf ?? 8, tw = s.tw ?? 6
    const X = bf / 2, Y = d / 2
    if (eff.family === 'WT')
      return [{ outer: [[-X, Y], [X, Y], [X, Y - tf], [tw / 2, Y - tf], [tw / 2, -Y], [-tw / 2, -Y], [-tw / 2, Y - tf], [-X, Y - tf]], holes: [] }]
    return [{ outer: [
      [-X, Y], [X, Y], [X, Y - tf], [tw / 2, Y - tf], [tw / 2, -(Y - tf)], [X, -(Y - tf)],
      [X, -Y], [-X, -Y], [-X, -(Y - tf)], [-tw / 2, -(Y - tf)], [-tw / 2, Y - tf], [-X, Y - tf],
    ], holes: [] }]
  }
  if (eff.family === 'C') {
    const bf = s.bf ?? 60, d = s.d ?? 100, tf = s.tf ?? 9, tw = s.tw ?? 8
    const X = bf / 2, Y = d / 2
    return [{ outer: [[-X, Y], [X, Y], [X, Y - tf], [-X + tw, Y - tf], [-X + tw, -(Y - tf)], [X, -(Y - tf)], [X, -Y], [-X, -Y]], holes: [] }]
  }
  if (eff.family === 'L') {
    const legV = Math.max(s.leg1 ?? 50, s.leg2 ?? 50), legH = Math.min(s.leg1 ?? 50, s.leg2 ?? 50), t = s.t ?? 8
    if (eff.double) {
      const g = eff.gap ?? 0
      return [{ outer: angle(-g / 2, -1, t, legH, legV), holes: [] }, { outer: angle(g / 2, 1, t, legH, legV), holes: [] }]
    }
    return [{ outer: angle(-legH / 2, 1, t, legH, legV), holes: [] }]
  }
  if (eff.family === 'HSS') {
    const b = s.b ?? 100, h = s.h ?? 100, t = s.t ?? 6
    return [{
      outer: [[-b / 2, h / 2], [b / 2, h / 2], [b / 2, -h / 2], [-b / 2, -h / 2]],
      holes: [[[-b / 2 + t, h / 2 - t], [b / 2 - t, h / 2 - t], [b / 2 - t, -(h / 2 - t)], [-b / 2 + t, -(h / 2 - t)]]],
    }]
  }
  const R = (s.D ?? 100) / 2, t = s.t ?? 6
  return [{ outer: circle(R), holes: [circle(R - t)] }]
}

const ringArea = (q: P2[]) => q.reduce((s, p, k) => { const n = q[(k + 1) % q.length]!; return s + p[0] * n[1] - n[0] * p[1] }, 0) / 2

/** Area centroid of a profile set (holes subtracted), mm. Each ring's own
 *  centroid (Σ(xᵢ+xᵢ₊₁)·cᵢ / 6a, c the shoelace cross term) weighted by ±|a|,
 *  so the winding a ring was written in does not matter. */
export function profileCentroid(ps: SteelProfile[]): P2 {
  let A = 0, Mx = 0, My = 0
  const add = (q: P2[], sign: 1 | -1) => {
    const a = ringArea(q)
    if (Math.abs(a) < 1e-12) return
    let sx = 0, sy = 0
    q.forEach((p, k) => { const n = q[(k + 1) % q.length]!; const c = p[0] * n[1] - n[0] * p[1]; sx += (p[0] + n[0]) * c; sy += (p[1] + n[1]) * c })
    const w = sign * Math.abs(a)
    A += w; Mx += w * (sx / (6 * a)); My += w * (sy / (6 * a))
  }
  for (const p of ps) { add(p.outer, 1); for (const h of p.holes) add(h, -1) }
  return A > 0 ? [Mx / A, My / A] : [0, 0]
}

/** Shoelace area of a profile set, mm² — what the outline encloses. */
export function profileArea(ps: SteelProfile[]): number {
  const a = (q: P2[]) => Math.abs(ringArea(q))
  return ps.reduce((s, p) => s + a(p.outer) - p.holes.reduce((h, q) => h + a(q), 0), 0)
}

export interface SteelSectionOptions { detailNo?: string; sheetRef?: string; title?: string; scale?: string }
export interface SteelSectionDrawing extends Drawing { title: string; shape: AiscShape }

/**
 * The section sheet for one shape: cut solid, centroidal axes, dimensions and
 * the catalogue properties. Null for a name the catalogue does not hold.
 */
export function buildSteelSectionDetail(shapeName: string, opts: SteelSectionOptions = {}): SteelSectionDrawing | null {
  const shape = shapeByName(shapeName)
  if (!shape) return null
  const eff = effectiveSection(shape)
  const prof = steelProfile(eff)
  const P: PlanPrimitive[] = []
  const xs = prof.flatMap((p) => p.outer.map((q) => q[0])), ys = prof.flatMap((p) => p.outer.map((q) => q[1]))
  const W = Math.max(...xs) - Math.min(...xs), H = Math.max(...ys) - Math.min(...ys)
  const size = Math.max(W, H)
  const ts = size * 0.07                                  // text and offset unit
  // the cut: solid steel, holes knocked out (even-odd); sheet y runs DOWN
  for (const p of prof) {
    // each ring closed back onto its first vertex, so every edge is stroked
    const ring = (q: P2[]): PathCmd[] => [...q, q[0]!].map(([x, y], k) => ({ c: k === 0 ? 'M' : 'L', x, y: -y }) as PathCmd)
    P.push({
      kind: 'path', cmds: [...ring(p.outer), ...p.holes.flatMap(ring)], closed: true,
      fill: SHEET_INK, stroke: SHEET_INK, width: 0.8, fillRule: 'evenodd',
    })
  }
  // centroidal axes, chain-dotted, labelled at their ends
  const ax = size * 0.75
  P.push({ kind: 'line', x1: -ax, y1: 0, x2: ax, y2: 0, stroke: SHEET_GRID, width: 0.6, dash: [ts * 0.6, ts * 0.25, ts * 0.1, ts * 0.25] })
  P.push({ kind: 'line', x1: 0, y1: -ax, x2: 0, y2: ax, stroke: SHEET_GRID, width: 0.6, dash: [ts * 0.6, ts * 0.25, ts * 0.1, ts * 0.25] })
  P.push({ kind: 'text', x: ax + ts * 0.3, y: ts * 0.25, text: 'x', size: ts * 0.75, anchor: 'start', color: SHEET_INK, weight: 700 })
  P.push({ kind: 'text', x: ts * 0.35, y: -ax - ts * 0.2, text: 'y', size: ts * 0.75, anchor: 'start', color: SHEET_INK, weight: 700 })
  // dimensions — overall depth on the left, width below, plate thicknesses called out
  const left = Math.min(...xs), right = Math.max(...xs), top = -Math.max(...ys), bot = -Math.min(...ys)
  P.push({ kind: 'dim', x1: left - ts * 1.6, y1: top, x2: left - ts * 1.6, y2: bot, text: `${fmt(H)}`, off: 0, size: ts * 0.65, ext: left })
  P.push({ kind: 'dim', x1: left, y1: bot + ts * 1.6, x2: right, y2: bot + ts * 1.6, text: `${fmt(W)}`, off: 0, size: ts * 0.65, ext: bot })
  const notes: string[] = []
  const s = shape
  if (s.family === 'W' || s.family === 'WT' || s.family === 'C') {
    P.push({ kind: 'text', x: right + ts * 0.5, y: top + (s.tf ?? 0) / 2 + ts * 0.25, text: `tf = ${fmt(s.tf ?? 0)}`, size: ts * 0.6, anchor: 'start', color: SHEET_INK, weight: 600 })
    P.push({ kind: 'text', x: (s.tw ?? 0) / 2 + ts * 0.4, y: ts * 1.2, text: `tw = ${fmt(s.tw ?? 0)}`, size: ts * 0.6, anchor: 'start', color: SHEET_INK, weight: 600 })
  } else if (s.family === 'L' && s.t != null) {
    // beside the end of the outstanding (horizontal) leg
    P.push({ kind: 'text', x: right + ts * 0.5, y: bot - s.t / 2 + ts * 0.25, text: `t = ${fmt(s.t)}`, size: ts * 0.6, anchor: 'start', color: SHEET_INK, weight: 600 })
  } else if (s.t != null) {
    // HSS / pipe: the DESIGN wall (AISC 360-16 §B4.2, 0.93·tnom) is what A and
    // r are computed on; the fabricator orders the nominal one in the name
    const tnom = /x([\d.]+)$/.exec(s.name)?.[1]
    P.push({ kind: 'text', x: right + ts * 0.5, y: top + ts * 0.5, text: `t = ${fmt(s.t)} des.${tnom ? ` (${tnom} nom.)` : ''}`, size: ts * 0.6, anchor: 'start', color: SHEET_INK, weight: 600 })
  }
  // properties: what the design used
  notes.push(`A = ${Math.round(s.A)} mm²`)
  if (s.family === 'W') {
    const p = deriveWSection(s)
    notes.push(`Ix = ${(p.Ix / 1e6).toFixed(1)}×10⁶ mm⁴   Sx = ${(p.Sx / 1e3).toFixed(0)}×10³   Zx = ${(p.Zx / 1e3).toFixed(0)}×10³ mm³`)
    notes.push(`Iy = ${(p.Iy / 1e6).toFixed(2)}×10⁶ mm⁴`)
  }
  notes.push(`rx = ${s.rx.toFixed(1)} mm   ry = ${s.ry.toFixed(1)} mm${s.rz != null ? `   rz = ${s.rz.toFixed(1)} mm` : ''}`)
  notes.push(`MASS = ${((s.A / 1e6) * 7850).toFixed(1)} kg/m`)
  const nx = left, ny0 = bot + ts * 3.2
  notes.forEach((t, k) => P.push({ kind: 'text', x: nx, y: ny0 + k * ts * 0.95, text: t, size: ts * 0.55, anchor: 'start', color: SHEET_INK, weight: 500 }))
  // the name sits just above the cut, unless that lands on the y-axis label
  // (a short angle or tee, whose top is near the axis end) — then above it
  const nameY0 = top - ts * 1.1, yLabel = -ax - ts * 0.2
  const nameY = nameY0 > yLabel - ts * 1.3 && nameY0 < yLabel + ts * 1.0 ? yLabel - ts * 1.3 : nameY0
  P.push({ kind: 'text', x: 0, y: nameY, text: s.name, size: ts * 0.9, anchor: 'middle', color: SHEET_INK, weight: 700 })
  const title = opts.title ?? `STEEL SECTION — ${s.name}`
  const tbTop = ny0 + notes.length * ts * 0.95 + ts * 1.2
  const tbX = left - ts * 3
  P.push(...titleBlock({ x: tbX, w: Math.max(right + ts * 6, size * 1.6) - tbX, top: tbTop, u: ts * 0.45, title, detailNo: opts.detailNo, sheetRef: opts.sheetRef, scale: opts.scale ?? 'NTS' }).prims)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const pr of P) {
    if (pr.kind === 'line' || pr.kind === 'dim') { acc(pr.x1, pr.y1); acc(pr.x2, pr.y2) }
    else if (pr.kind === 'rect') { acc(pr.x, pr.y); acc(pr.x + pr.w, pr.y + pr.h) }
    else if (pr.kind === 'circle') { acc(pr.cx - pr.r, pr.cy - pr.r); acc(pr.cx + pr.r, pr.cy + pr.r) }
    else if (pr.kind === 'path') { for (const c of pr.cmds) acc(c.x, c.y) }
    else {
      const w = pr.text.length * pr.size * 0.58, a = pr.anchor ?? 'start'
      acc(a === 'start' ? pr.x : a === 'end' ? pr.x - w : pr.x - w / 2, pr.y - pr.size * 0.6)
      acc(a === 'start' ? pr.x + w : a === 'end' ? pr.x : pr.x + w / 2, pr.y + pr.size * 0.6)
    }
  }
  return { primitives: P, bounds: { minX, minY, maxX, maxY }, title, shape }
}

const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? `${Math.round(v)}` : v.toFixed(1))
