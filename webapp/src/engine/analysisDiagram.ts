// ─────────────────────────────────────────────────────────────────────────
// ANALYSIS DIAGRAMS — the analytical model, its loads, and its results,
// drawn as vector `Drawing`s for the Analysis Appendix.
//
// A 250-page STAAD output is mostly numbers, and so was this appendix: every
// reaction, every displacement, every member force in a table, and not one
// picture of the structure they belong to. A reviewer cannot check a table of
// node ids against a building they cannot see. These are the figures that
// make the tables auditable — the model with its ids and supports, what was
// applied to it, and what came back.
//
// WHAT THIS MODULE IS NOT. It computes nothing. Every ordinate is an engine
// result handed in: node coordinates from the model, displacements from the
// solver's own `d`, member ordinates from `F3MemberResult`. The only
// arithmetic here is projection and scaling to a page box.
//
// PROJECTION. Parallel (no perspective), four views. `iso` is the standard
// 30° isometric a frame is read in; `xy`, `zy` and `xz` are the orthographic
// elevations and the plan. Page +Y is DOWN, which is what `planToSvg` and the
// PDF painter expect, so a world level y draws at −y.
//
// Units: geometry m, forces kN, moments kN·m, displacements m. Page units are
// millimetres — the box is sized so the painter maps it 1:1.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, Node, ModelLoad, SupportFixity } from './model'
import type { LoadCategory } from './beamAnalysis'
import type { Drawing, PlanPrimitive } from './planRenderer'
import type { F3Result, F3MemberResult } from './frame3d'
import { memberDiagramRibbon, type DiagramComp } from './memberDiagram3d'
import { localAxes, type V3 } from './frame3d'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, SHEET_WARN, STEEL } from './sheetInk'

export type DiagramView = 'iso' | 'xy' | 'zy' | 'xz'

/** Page box, mm — matches the appendix figure slot (content width × the
 *  painter's 95 mm ceiling), so the drawing lands roughly 1:1 and a 3 mm text
 *  size really is 3 mm on the sheet. */
export const DIAGRAM_W = 178
export const DIAGRAM_H = 92

const COS30 = Math.cos(Math.PI / 6)
const SIN30 = 0.5

/**
 * World point → view plane, BEFORE fitting. Page +Y down.
 *
 * `iso` is the SE isometric: x runs down-right, z down-left, y up the page.
 * The orthographic views drop one axis each — `xy` looks along −z (the
 * X elevation), `zy` along +x (the Z elevation), `xz` is the plan looking
 * down, where the page's +Y is world +z so the plan is not mirrored.
 */
export function projectView(p: { x: number; y: number; z: number }, view: DiagramView): [number, number] {
  switch (view) {
    case 'xy': return [p.x, -p.y]
    case 'zy': return [p.z, -p.y]
    case 'xz': return [p.x, p.z]
    default: return [(p.x - p.z) * COS30, (p.x + p.z) * SIN30 - p.y]
  }
}

const v3 = (n: { x: number; y: number; z: number }): V3 => [n.x, n.y, n.z]
const asPoint = (p: V3) => ({ x: p[0], y: p[1], z: p[2] })

/**
 * The projection AND the page fit as one function, so every element of a
 * figure — and, where a caller wants it, two figures side by side — lands on
 * the same transform. Isotropic: the scale is the same on both axes, so a
 * square bay stays square.
 */
export interface DiagramFit {
  view: DiagramView
  /** World (or displaced-world) point → page mm. */
  at: (p: { x: number; y: number; z: number }) => [number, number]
  /** Metres per page mm — for sizing a symbol in world terms. */
  scale: number
  box: { w: number; h: number }
}

export function fitView(
  pts: { x: number; y: number; z: number }[], view: DiagramView,
  o: { w?: number; h?: number; pad?: number } = {},
): DiagramFit {
  const w = o.w ?? DIAGRAM_W, h = o.h ?? DIAGRAM_H, pad = o.pad ?? 10
  const uv = pts.map((p) => projectView(p, view))
  const us = uv.map((p) => p[0]), vs = uv.map((p) => p[1])
  const u0 = us.length ? Math.min(...us) : 0, u1 = us.length ? Math.max(...us) : 1
  const v0 = vs.length ? Math.min(...vs) : 0, v1 = vs.length ? Math.max(...vs) : 1
  const du = Math.max(u1 - u0, 1e-6), dv = Math.max(v1 - v0, 1e-6)
  const s = Math.min((w - 2 * pad) / du, (h - 2 * pad) / dv)
  const ox = (w - s * du) / 2 - s * u0
  const oy = (h - s * dv) / 2 - s * v0
  return {
    view, scale: s > 1e-12 ? 1 / s : 1, box: { w, h },
    at: (p) => { const [u, v] = projectView(p, view); return [ox + s * u, oy + s * v] },
  }
}

// ── shared ink ───────────────────────────────────────────────────────────
const COL_INK = SHEET_INK
const BEAM_INK = '#334155'
const GHOST = SHEET_GRID
const LOAD_INK = '#b45309'
const DEF_INK = '#0f4c92'
const MODE_INK = '#7c3aed'
const TRACE_INKS = ['#0f4c92', '#b45309', '#0f766e']

const f1 = (v: number) => v.toFixed(1)
const f2 = (v: number) => v.toFixed(2)
const f3 = (v: number) => v.toFixed(3)
const pct = (v: number) => `${(v * 100).toFixed(0)}%`

/** Title strip + a one-line legend, in the same place on every figure. */
function frameChrome(P: PlanPrimitive[], fit: DiagramFit, title: string, legend?: string): void {
  P.push({ kind: 'text', x: 2, y: 5, text: title, size: 3.4, anchor: 'start', color: SHEET_INK, weight: 700 })
  if (legend) P.push({ kind: 'text', x: 2, y: fit.box.h - 1.5, text: legend, size: 2.5, anchor: 'start', color: SHEET_NOTE })
  P.push({ kind: 'text', x: fit.box.w - 2, y: 5, text: VIEW_LABEL[fit.view], size: 2.5, anchor: 'end', color: SHEET_NOTE })
}

export const VIEW_LABEL: Record<DiagramView, string> = {
  iso: 'ISOMETRIC', xy: 'ELEVATION — X-Y (looking along −Z)',
  zy: 'ELEVATION — Z-Y (looking along +X)', xz: 'PLAN — X-Z (looking down)',
}

/**
 * A support symbol at a page point, drawn to the fixity.
 *
 * Deliberately schematic and view-independent: a pin is a triangle, a roller
 * the same triangle on wheels, a fixed support the triangle with the ground
 * hatch, a spring a coil. Drawing them in the projection instead would put a
 * roller's wheels edge-on in half the views and say nothing.
 */
export function supportSymbol(x: number, y: number, fixity: SupportFixity, s = 2.6): PlanPrimitive[] {
  const P: PlanPrimitive[] = []
  const ink = SHEET_INK
  const tri = (yTop: number): PlanPrimitive => ({
    kind: 'path', stroke: ink, width: 0.4, fill: '#ffffff', closed: true,
    cmds: [{ c: 'M', x, y: yTop }, { c: 'L', x: x - s, y: yTop + s * 1.5 }, { c: 'L', x: x + s, y: yTop + s * 1.5 }],
  })
  const ground = (yg: number) => {
    P.push({ kind: 'line', x1: x - s * 1.4, y1: yg, x2: x + s * 1.4, y2: yg, stroke: ink, width: 0.5 })
    for (let k = -3; k <= 3; k++)
      P.push({ kind: 'line', x1: x + k * s * 0.45, y1: yg, x2: x + k * s * 0.45 - s * 0.4, y2: yg + s * 0.5, stroke: ink, width: 0.3 })
  }
  if (fixity === 'fixed') {
    P.push({ kind: 'rect', x: x - s, y, w: 2 * s, h: s * 0.7, stroke: ink, width: 0.4, fill: '#ffffff' })
    ground(y + s * 0.7)
  } else if (fixity === 'spring') {
    let yy = y
    const cmds: { c: 'M' | 'L'; x: number; y: number }[] = [{ c: 'M', x, y: yy }]
    for (let k = 0; k < 6; k++) { yy += s * 0.28; cmds.push({ c: 'L', x: x + (k % 2 ? -s * 0.6 : s * 0.6), y: yy }) }
    yy += s * 0.28
    cmds.push({ c: 'L', x, y: yy })
    P.push({ kind: 'path', stroke: ink, width: 0.4, fill: 'none', cmds })
    ground(yy)
  } else {
    P.push(tri(y))
    if (fixity === 'roller') {
      P.push({ kind: 'circle', cx: x - s * 0.5, cy: y + s * 1.5 + s * 0.35, r: s * 0.35, stroke: ink, width: 0.3, fill: '#ffffff' })
      P.push({ kind: 'circle', cx: x + s * 0.5, cy: y + s * 1.5 + s * 0.35, r: s * 0.35, stroke: ink, width: 0.3, fill: '#ffffff' })
      ground(y + s * 1.5 + s * 0.7)
    } else ground(y + s * 1.5)
  }
  return P
}

/** The wireframe every figure is drawn over. `ink` null ⇒ ghosted context. */
function wireframe(model: StructuralModel, fit: DiagramFit, ghost = false): PlanPrimitive[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const P: PlanPrimitive[] = []
  for (const m of model.members) {
    const a = byId.get(m.i), b = byId.get(m.j)
    if (!a || !b) continue
    const [x1, y1] = fit.at(a), [x2, y2] = fit.at(b)
    P.push({
      kind: 'line', x1, y1, x2, y2,
      stroke: ghost ? GHOST : m.role === 'column' ? COL_INK : BEAM_INK,
      width: ghost ? 0.35 : m.role === 'column' ? 0.7 : 0.55,
      ...(m.role === 'brace' ? { dash: [1.6, 1.2] } : {}),
    })
  }
  return P
}

export interface ModelDiagramOpts {
  view?: DiagramView
  /** Print node ids. Suppressed automatically above `maxLabels` nodes. */
  nodeLabels?: boolean
  /** Print member ids. */
  memberLabels?: boolean
  /** Above this many nodes/members the labels are dropped rather than
   *  overprinted into an unreadable mat. Default 60. */
  maxLabels?: number
  w?: number; h?: number
  title?: string
}

/**
 * A.x — THE ANALYTICAL MODEL: every member, every node id, every support.
 *
 * This is the figure the whole appendix is indexed against; `c0.1.0` in a
 * reaction table means nothing until it can be found on a picture.
 *
 * Labels are dropped on a big model rather than overprinted — a legible
 * drawing that says "ids omitted, N nodes" is worth more than a black mat,
 * and the node table carries the ids either way.
 */
export function modelDiagram(model: StructuralModel, o: ModelDiagramOpts = {}): Drawing {
  const view = o.view ?? 'iso'
  const fit = fitView(model.nodes, view, { w: o.w, h: o.h })
  const P: PlanPrimitive[] = [...wireframe(model, fit)]
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const cap = o.maxLabels ?? 60
  const showNodes = (o.nodeLabels ?? true) && model.nodes.length <= cap
  const showMembers = (o.memberLabels ?? true) && model.members.length <= cap

  // Labels sit OFF the member, on its perpendicular, at 0.4 along rather than
  // at midspan: in an isometric two members crossing at their midpoints put
  // two labels on the same pixel, and a label printed over the line it names
  // is the one thing worse than no label.
  if (showMembers) for (const m of model.members) {
    const a = byId.get(m.i), b = byId.get(m.j)
    if (!a || !b) continue
    const [x1, y1] = fit.at(a), [x2, y2] = fit.at(b)
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const off = 1.6
    // Stagger the station by which world axis the member runs along, so the
    // x-beam and the z-beam that share a node do not label on the same point.
    const along = Math.abs(b.y - a.y) > Math.abs(b.x - a.x) + Math.abs(b.z - a.z) ? 0.5
      : Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? 0.34 : 0.66
    P.push({
      kind: 'text', x: x1 + dx * along - (dy / len) * off, y: y1 + dy * along + (dx / len) * off,
      text: m.id, size: 1.9, anchor: 'middle', color: STEEL,
    })
  }
  for (const n of model.nodes) {
    const [x, y] = fit.at(n)
    P.push({ kind: 'circle', cx: x, cy: y, r: 0.7, fill: SHEET_INK, stroke: 'none' })
    if (showNodes) P.push({ kind: 'text', x: x + 1.3, y: y - 1.1, text: n.id, size: 2, anchor: 'start', color: SHEET_NOTE })
  }
  for (const s of model.supports) {
    const n = byId.get(s.node)
    if (!n) continue
    const [x, y] = fit.at(n)
    P.push(...supportSymbol(x, y, s.fixity))
  }
  const omitted = [
    showNodes ? '' : `${model.nodes.length} node ids omitted`,
    showMembers ? '' : `${model.members.length} member ids omitted`,
  ].filter(Boolean).join(' · ')
  frameChrome(P, fit, o.title ?? 'ANALYTICAL MODEL',
    `${model.nodes.length} nodes · ${model.members.length} members · ${model.supports.length} supports${omitted ? ` · ${omitted} for legibility` : ''}`)
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: fit.box.w, maxY: fit.box.h } }
}

// ── loads ────────────────────────────────────────────────────────────────
/** An arrow of page length `len` ending at (x, y), pointing along (dx, dy). */
function arrow(x: number, y: number, dx: number, dy: number, len: number, ink: string, width = 0.4): PlanPrimitive[] {
  const m = Math.hypot(dx, dy) || 1
  const ux = dx / m, uy = dy / m
  const x0 = x - ux * len, y0 = y - uy * len
  const head = Math.min(1.5, len * 0.45)
  const px = -uy, py = ux
  return [
    { kind: 'line', x1: x0, y1: y0, x2: x, y2: y, stroke: ink, width },
    { kind: 'path', stroke: 'none', fill: ink, closed: true, cmds: [
      { c: 'M', x, y },
      { c: 'L', x: x - ux * head + px * head * 0.42, y: y - uy * head + py * head * 0.42 },
      { c: 'L', x: x - ux * head - px * head * 0.42, y: y - uy * head - py * head * 0.42 },
    ] },
  ]
}

export const CATEGORY_LABEL: Partial<Record<LoadCategory, string>> = {
  D: 'DEAD (D)', L: 'LIVE (L)', Lr: 'ROOF LIVE (Lr)', E: 'SEISMIC (E)', W: 'WIND (W)',
  S: 'SNOW (S)', R: 'RAIN (R)', T: 'THERMAL (T)',
}

/**
 * B.x — ONE LOAD CATEGORY, on the model it is applied to.
 *
 * Every load kind the model carries is drawn where it acts: a node load as a
 * single arrow, a member UDL as a row of arrows along the member with the
 * intensity called out, a member point load as one arrow at its station, and
 * an area load as a label at the panel centroid (a plate's own arrows would
 * bury the frame).
 *
 * ARROWS ARE SCALED, NOT UNIFORM. Every arrow on a figure is drawn against
 * the same peak, so a 40 kN node force and a 4 kN one do not look alike —
 * which is the whole reason to draw the loads rather than tabulate them. The
 * peak arrow is `ARROW_MAX` mm and the length is proportional down to
 * `ARROW_FLOOR` of it; below that the arrow stops shrinking, because an arrow
 * shorter than its own head is a dot and a load that is drawn as nothing
 * reads as a load that was never applied.
 *
 * Returns null when the category has no load — the caller then leaves the
 * figure out rather than printing an empty frame.
 */
export function loadDiagram(model: StructuralModel, cat: LoadCategory, o: ModelDiagramOpts = {}): Drawing | null {
  return drawLoads(model, model.loads.filter((l) => l.cat === cat), CATEGORY_LABEL[cat] ?? cat, o)
}

/**
 * The same figure for ONE DIRECTIONAL CASE rather than a whole category.
 *
 * A model carries only the load pattern that was committed to it — the primary
 * direction, untorsioned — while the analysis solves EVERY case the E/W
 * builders produced. Drawn from the category alone, the report therefore
 * showed one seismic and one wind figure for a run that enveloped twelve.
 * This takes the case's own loads so each one can be drawn as it was solved.
 */
export function caseLoadDiagram(
  model: StructuralModel, loads: ModelLoad[], title: string, o: ModelDiagramOpts = {},
): Drawing | null {
  return drawLoads(model, loads, title, o)
}

function drawLoads(
  model: StructuralModel, loads: ModelLoad[], title: string, o: ModelDiagramOpts = {},
): Drawing | null {
  if (!loads.length) return null
  const view = o.view ?? 'iso'
  // Arrows are drawn in PAGE units, so the geometry fit cannot see them: pad
  // by the longest arrow plus its label or a node load at the roof draws off
  // the top of the box.
  const fit = fitView(model.nodes, view, { w: o.w, h: o.h, pad: 16 })
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const memById = new Map(model.members.map((m) => [m.id, m]))
  const plateById = new Map(model.plates.map((p) => [p.id, p]))
  const P: PlanPrimitive[] = [...wireframe(model, fit, true)]

  const ARROW_MAX = 9
  const ARROW_FLOOR = 0.12
  const mag = (l: ModelLoad): number =>
    l.kind === 'node' ? Math.hypot(l.Fx ?? 0, l.Fy ?? 0, l.Fz ?? 0)
      : l.kind === 'member-udl' ? Math.abs(l.w)
        : l.kind === 'member-point' ? Math.abs(l.P)
          : l.kind === 'area' ? Math.abs(l.q) : 0
  const peakNode = Math.max(1e-9, ...loads.filter((l) => l.kind === 'node' || l.kind === 'member-point').map(mag))
  const peakUdl = Math.max(1e-9, ...loads.filter((l) => l.kind === 'member-udl').map(mag))
  const len = (v: number, peak: number) => Math.max(ARROW_MAX * ARROW_FLOOR, (ARROW_MAX * Math.abs(v)) / peak)

  // Page-space "down" — where gravity points once projected. Every view here
  // keeps world +y up the page, so this is a constant; taking it from the
  // projection anyway means a new view cannot silently draw gravity sideways.
  const [ax0, ay0] = projectView({ x: 0, y: 0, z: 0 }, view)
  const [ax1, ay1] = projectView({ x: 0, y: -1, z: 0 }, view)
  const down: [number, number] = [ax1 - ax0, ay1 - ay0]

  let udlNoted = false
  for (const l of loads) {
    if (l.kind === 'node') {
      const n = byId.get(l.node)
      if (!n) continue
      const [x, y] = fit.at(n)
      // Each global component gets its own arrow, so a lateral case reads as
      // lateral rather than as an arbitrary resultant direction.
      for (const [comp, val] of [['x', l.Fx ?? 0], ['y', l.Fy ?? 0], ['z', l.Fz ?? 0]] as const) {
        if (Math.abs(val) < 1e-9) continue
        const tip = { x: n.x + (comp === 'x' ? Math.sign(val) : 0), y: n.y + (comp === 'y' ? Math.sign(val) : 0), z: n.z + (comp === 'z' ? Math.sign(val) : 0) }
        const [tx, ty] = fit.at(tip)
        const dx = tx - x, dy = ty - y
        P.push(...arrow(x, y, dx, dy, len(val, peakNode), LOAD_INK, 0.45))
        P.push({ kind: 'text', x: x - dx * 0.9, y: y - dy * 0.9 - 0.8, text: `${f1(Math.abs(val))}`, size: 2, anchor: 'middle', color: LOAD_INK })
      }
    } else if (l.kind === 'member-udl') {
      const m = memById.get(l.member)
      const a = m && byId.get(m.i), b = m && byId.get(m.j)
      if (!a || !b) continue
      const arrowLen = len(l.w, peakUdl)
      const n = 5
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
        const [x, y] = fit.at(p)
        P.push(...arrow(x, y, down[0], down[1], arrowLen, LOAD_INK, 0.3))
      }
      const [mx, my] = fit.at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 })
      P.push({ kind: 'text', x: mx, y: my - arrowLen - 1.2, text: `${f1(Math.abs(l.w))} kN/m`, size: 1.9, anchor: 'middle', color: LOAD_INK })
      udlNoted = true
    } else if (l.kind === 'member-point') {
      const m = memById.get(l.member)
      const a = m && byId.get(m.i), b = m && byId.get(m.j)
      if (!a || !b) continue
      const p = { x: a.x + (b.x - a.x) * l.t, y: a.y + (b.y - a.y) * l.t, z: a.z + (b.z - a.z) * l.t }
      const [x, y] = fit.at(p)
      P.push(...arrow(x, y, down[0], down[1], len(l.P, peakNode), LOAD_INK, 0.45))
      P.push({ kind: 'text', x, y: y - len(l.P, peakNode) - 1.2, text: `${f1(Math.abs(l.P))} kN`, size: 2, anchor: 'middle', color: LOAD_INK })
    } else if (l.kind === 'area') {
      const pl = plateById.get(l.plate)
      if (!pl) continue
      const cs = pl.corners.map((c) => byId.get(c)).filter((n): n is Node => !!n)
      if (cs.length < 3) continue
      const c = { x: cs.reduce((s, n) => s + n.x, 0) / cs.length, y: cs.reduce((s, n) => s + n.y, 0) / cs.length, z: cs.reduce((s, n) => s + n.z, 0) / cs.length }
      const [x, y] = fit.at(c)
      P.push({
        kind: 'path', stroke: LOAD_INK, width: 0.3, fill: LOAD_INK, opacity: 0.1, closed: true,
        cmds: cs.map((n, k) => { const [px, py] = fit.at(n); return { c: k === 0 ? 'M' as const : 'L' as const, x: px, y: py } }),
      })
      P.push({ kind: 'text', x, y, text: `${f1(Math.abs(l.q))} kPa`, size: 2.1, anchor: 'middle', color: LOAD_INK, weight: 600 })
    }
  }
  const kinds = [...new Set(loads.map((l) => l.kind))].join(', ')
  frameChrome(P, fit, `${title} — APPLIED LOADS`,
    `${loads.length} assignment${loads.length === 1 ? '' : 's'} (${kinds})`
    + `${udlNoted ? ` · line loads to ${f1(peakUdl)} kN/m` : ''} · arrow length ∝ magnitude, not to scale with the geometry`)
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: fit.box.w, maxY: fit.box.h } }
}

// ── deflected shape ──────────────────────────────────────────────────────
/**
 * The displaced position of every node, from the solver's own `d`.
 * Node order is the model's, which is the DOF order `modelToFrame3D` builds.
 */
export function displacedNodes(model: StructuralModel, r: F3Result, amp: number): Node[] {
  return model.nodes.map((n, i) => ({
    id: n.id,
    x: n.x + amp * (r.d[6 * i + 0] ?? 0),
    y: n.y + amp * (r.d[6 * i + 1] ?? 0),
    z: n.z + amp * (r.d[6 * i + 2] ?? 0),
  }))
}

/**
 * A member's deflected curve, sampled — cubic Hermite from its OWN end
 * displacements and rotations, in local axes, not a straight chord between
 * displaced nodes.
 *
 * This is the element's own shape function: the same cubic the stiffness
 * matrix was integrated from, so the curve is the element's homogeneous
 * solution and nothing invented. It does NOT carry the particular solution of
 * a span load, so a UDL beam draws with slightly less sag at midspan than it
 * really has — the standard post-processor picture, and it is stated in the
 * caption rather than left to be discovered.
 */
export function memberDeflectedCurve(
  a: Node, b: Node, di: number[], dj: number[], amp: number, n = 12,
): V3[] {
  const dir: V3 = [b.x - a.x, b.y - a.y, b.z - a.z]
  const L = Math.hypot(...dir) || 1
  const [ex, ey, ez] = localAxes(dir)
  const dot = (v: number[], e: V3) => v[0] * e[0] + v[1] * e[1] + v[2] * e[2]
  // Translations and rotations, resolved onto the member's own axes.
  const u1 = dot(di, ex), v1 = dot(di, ey), w1 = dot(di, ez)
  const u2 = dot(dj, ex), v2 = dot(dj, ey), w2 = dot(dj, ez)
  const ri: V3 = [di[3] ?? 0, di[4] ?? 0, di[5] ?? 0]
  const rj: V3 = [dj[3] ?? 0, dj[4] ?? 0, dj[5] ?? 0]
  // θz bends in the x′–y′ plane, θy in x′–z′ (with the sign the right-hand
  // rule gives: a +θy rotation moves the section in −z′).
  const tz1 = dot(ri, ez), tz2 = dot(rj, ez)
  const ty1 = -dot(ri, ey), ty2 = -dot(rj, ey)
  const out: V3[] = []
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = t * L
    const H1 = 1 - 3 * t * t + 2 * t ** 3
    const H2 = x * (1 - t) ** 2
    const H3 = 3 * t * t - 2 * t ** 3
    const H4 = x * t * (t - 1)
    const u = u1 + (u2 - u1) * t
    const v = H1 * v1 + H2 * tz1 + H3 * v2 + H4 * tz2
    const w = H1 * w1 + H2 * ty1 + H3 * w2 + H4 * ty2
    const base: V3 = [a.x + dir[0] * t, a.y + dir[1] * t, a.z + dir[2] * t]
    out.push([
      base[0] + amp * (u * ex[0] + v * ey[0] + w * ez[0]),
      base[1] + amp * (u * ex[1] + v * ey[1] + w * ez[1]),
      base[2] + amp * (u * ex[2] + v * ey[2] + w * ez[2]),
    ])
  }
  return out
}

export interface DeflectedOpts extends ModelDiagramOpts {
  /** Displacement amplification. Omitted ⇒ chosen so the largest displacement
   *  draws as `targetFraction` of the model's diagonal. */
  amp?: number
  targetFraction?: number
  /** What the shape belongs to — printed in the title. */
  caseName?: string
}

/**
 * The amplification a deflected shape is drawn at.
 *
 * A real building's drift is a few hundredths of a percent of its height: at
 * true scale the deflected shape is the undeformed one. So it is exaggerated,
 * and the factor is REPORTED on the figure — an unlabelled exaggerated shape
 * is the classic way to make a sound structure look broken.
 */
export function autoAmplification(model: StructuralModel, r: F3Result, targetFraction = 0.06): number {
  let dMax = 0
  for (let i = 0; i < model.nodes.length; i++)
    dMax = Math.max(dMax, Math.hypot(r.d[6 * i] ?? 0, r.d[6 * i + 1] ?? 0, r.d[6 * i + 2] ?? 0))
  const xs = model.nodes.map((n) => n.x), ys = model.nodes.map((n) => n.y), zs = model.nodes.map((n) => n.z)
  const span = model.nodes.length
    ? Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs))
    : 1
  if (dMax < 1e-12 || span < 1e-9) return 1
  return (targetFraction * span) / dMax
}

/** C.x — the deflected shape over the undeformed model. */
export function deflectedDiagram(model: StructuralModel, r: F3Result, o: DeflectedOpts = {}): Drawing {
  const view = o.view ?? 'iso'
  const amp = o.amp ?? autoAmplification(model, r, o.targetFraction)
  const disp = displacedNodes(model, r, amp)
  const fit = fitView([...model.nodes, ...disp], view, { w: o.w, h: o.h })
  const P: PlanPrimitive[] = [...wireframe(model, fit, true)]
  const byId = new Map(model.nodes.map((n, i) => [n.id, { n, i }]))
  let dMax = 0
  for (let i = 0; i < model.nodes.length; i++)
    dMax = Math.max(dMax, Math.hypot(r.d[6 * i] ?? 0, r.d[6 * i + 1] ?? 0, r.d[6 * i + 2] ?? 0))
  for (const m of model.members) {
    const a = byId.get(m.i), b = byId.get(m.j)
    if (!a || !b) continue
    const di = r.d.slice(6 * a.i, 6 * a.i + 6)
    const dj = r.d.slice(6 * b.i, 6 * b.i + 6)
    const pts = memberDeflectedCurve(a.n, b.n, di, dj, amp)
    P.push({
      kind: 'path', stroke: DEF_INK, width: 0.7, fill: 'none', join: 'round', cap: 'round',
      cmds: pts.map((p, k) => { const [x, y] = fit.at(asPoint(p)); return { c: k === 0 ? 'M' as const : 'L' as const, x, y } }),
    })
  }
  for (const s of model.supports) {
    const a = byId.get(s.node)
    if (!a) continue
    const [x, y] = fit.at(a.n)
    P.push(...supportSymbol(x, y, s.fixity))
  }
  frameChrome(P, fit, `DEFLECTED SHAPE${o.caseName ? ` — ${o.caseName}` : ''}`,
    `amplified ×${amp >= 100 ? amp.toFixed(0) : f1(amp)} · peak resultant node displacement ${f2(dMax * 1000)} mm · grey = undeformed`)
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: fit.box.w, maxY: fit.box.h } }
}

// ── internal-force diagrams ──────────────────────────────────────────────
export const COMP_LABEL: Record<DiagramComp, { title: string; unit: string }> = {
  N: { title: 'AXIAL FORCE', unit: 'kN' },
  Vy: { title: 'SHEAR Vy', unit: 'kN' },
  Vz: { title: 'SHEAR Vz', unit: 'kN' },
  T: { title: 'TORSION T', unit: 'kN·m' },
  My: { title: 'BENDING MOMENT My', unit: 'kN·m' },
  Mz: { title: 'BENDING MOMENT Mz', unit: 'kN·m' },
}

export interface ForceDiagramOpts extends ModelDiagramOpts {
  /** Metres of offset per force unit. Omitted ⇒ the peak ordinate on the
   *  structure draws as `targetFraction` of the model diagonal. */
  scale?: number
  targetFraction?: number
  caseName?: string
  /** Print the peak ordinate of each member beside it. Off above `maxLabels`. */
  peakLabels?: boolean
}

/**
 * C.x — one internal-force component, drawn on every member at once.
 *
 * The ribbon geometry is `memberDiagramRibbon`'s — the same builder the 3D
 * viewport paints its inline diagrams with, so the PDF and the screen cannot
 * disagree about which side of a member the sagging moment is drawn on. Here
 * the 3-D curve is simply projected.
 *
 * SIGN. The ordinate is the solver's own, plotted on the member's local
 * transverse axis, positive along +y′ (Mz, Vy, N) or +z′ (My, Vz, T). For a
 * horizontal member y′ is global up, so a sagging Mz draws BELOW the member —
 * the drawing convention for moment on the tension side.
 */
/**
 * Split an ordinate array into maximal runs of one sign, so each lobe of a
 * diagram is one polygon. A run is extended THROUGH the zero crossing (the
 * station at or nearest zero belongs to both neighbours) so the two lobes
 * meet on the axis instead of leaving a gap.
 */
export function signRuns(ord: number[]): { lo: number; hi: number; positive: boolean }[] {
  const out: { lo: number; hi: number; positive: boolean }[] = []
  if (ord.length < 2) return out
  const sign = (v: number) => (v > 1e-12 ? 1 : v < -1e-12 ? -1 : 0)
  let lo = 0
  let cur = 0
  for (let k = 0; k < ord.length; k++) {
    const sg = sign(ord[k]!)
    if (sg === 0) continue
    if (cur === 0) { cur = sg; lo = k > 0 ? k - 1 : 0; continue }
    if (sg !== cur) {
      out.push({ lo, hi: k, positive: cur > 0 })
      cur = sg
      lo = k - 1
    }
  }
  if (cur !== 0) out.push({ lo, hi: ord.length - 1, positive: cur > 0 })
  return out
}

export function forceDiagram(
  model: StructuralModel, r: F3Result, comp: DiagramComp, o: ForceDiagramOpts = {},
): Drawing {
  const view = o.view ?? 'iso'
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const resById = new Map(r.members.map((m) => [m.id, m]))
  const ord = (m: F3MemberResult) => m[comp]
  let peak = 0
  for (const m of r.members) for (const v of ord(m)) peak = Math.max(peak, Math.abs(v))
  const xs = model.nodes.map((n) => n.x), ys = model.nodes.map((n) => n.y), zs = model.nodes.map((n) => n.z)
  const span = model.nodes.length
    ? Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs))
    : 1
  const scale = o.scale ?? (peak > 1e-9 ? ((o.targetFraction ?? 0.08) * span) / peak : 0)

  // Every ribbon in world coordinates first, so the page fit sees the
  // diagram's own extent and a tall moment is not clipped by the frame's box.
  const ribbons: { id: string; curve: V3[]; base: V3[]; ord: number[]; peak: number }[] = []
  for (const m of model.members) {
    const a = byId.get(m.i), b = byId.get(m.j), res = resById.get(m.id)
    if (!a || !b || !res) continue
    const ys2 = ord(res)
    const rib = memberDiagramRibbon(v3(a), v3(b), res.xs, ys2, comp, scale)
    ribbons.push({ id: m.id, curve: rib.curve, base: rib.base, ord: ys2, peak: Math.max(0, ...ys2.map(Math.abs)) })
  }
  const fit = fitView(
    [...model.nodes, ...ribbons.flatMap((rb) => rb.curve.map(asPoint))], view, { w: o.w, h: o.h },
  )
  const P: PlanPrimitive[] = [...wireframe(model, fit, true)]
  const POS = '#0f4c92', NEG = '#b91c1c'
  // ONE LOBE PER SIGN. Colouring a whole member by its peak cannot show the
  // point of contraflexure — the thing a moment diagram exists to show — and
  // colouring segment by segment leaves a seam between every pair of quads.
  // So consecutive stations of one sign are collected into a single closed
  // lobe, which is also how a bending-moment diagram is drawn by hand.
  for (const rb of ribbons) {
    for (const run of signRuns(rb.ord)) {
      if (run.hi - run.lo < 1) continue
      const ink = run.positive ? POS : NEG
      const top = rb.curve.slice(run.lo, run.hi + 1)
      const bot = rb.base.slice(run.lo, run.hi + 1)
      P.push({
        kind: 'path', stroke: 'none', fill: ink, opacity: 0.2, closed: true,
        cmds: [...bot, ...[...top].reverse()].map((p, n) => {
          const [x, y] = fit.at(asPoint(p))
          return { c: (n === 0 ? 'M' : 'L') as 'M' | 'L', x, y }
        }),
      })
      P.push({
        kind: 'path', stroke: ink, width: 0.5, fill: 'none', join: 'round',
        cmds: top.map((p, n) => {
          const [x, y] = fit.at(asPoint(p))
          return { c: (n === 0 ? 'M' : 'L') as 'M' | 'L', x, y }
        }),
      })
    }
  }
  const cap = o.maxLabels ?? 40
  if ((o.peakLabels ?? true) && ribbons.length <= cap)
    for (const rb of ribbons) {
      if (rb.peak < peak * 0.4) continue
      let best = 0
      for (let k = 1; k < rb.curve.length; k++) {
        const d = (c: V3, b: V3) => Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2])
        if (d(rb.curve[k]!, rb.base[k]!) > d(rb.curve[best]!, rb.base[best]!)) best = k
      }
      const [x, y] = fit.at(asPoint(rb.curve[best]!))
      P.push({ kind: 'text', x, y: y - 0.9, text: f1(rb.peak), size: 1.9, anchor: 'middle', color: SHEET_INK })
    }
  const label = COMP_LABEL[comp]
  frameChrome(P, fit, `${label.title}${o.caseName ? ` — ${o.caseName}` : ''}`,
    `peak |${comp}| = ${f1(peak)} ${label.unit} · blue +ve, red −ve · one scale over the whole structure`)
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: fit.box.w, maxY: fit.box.h } }
}

/** A reaction figure is the model with an arrow at every support, so the
 *  equilibrium check in the table has a picture to be read against. */
export function reactionDiagram(model: StructuralModel, r: F3Result, o: ModelDiagramOpts & { caseName?: string } = {}): Drawing {
  const view = o.view ?? 'iso'
  const fit = fitView(model.nodes, view, { w: o.w, h: o.h })
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const P: PlanPrimitive[] = [...wireframe(model, fit, true)]
  const peak = Math.max(1e-9, ...r.reactions.map((x) => Math.hypot(...x.F)))
  let sumY = 0
  for (const rc of r.reactions) {
    const n = byId.get(rc.node)
    if (!n) continue
    sumY += rc.F[1]
    const [x, y] = fit.at(n)
    const len = Math.max(2, (11 * Math.hypot(...rc.F)) / peak)
    // Drawn as it acts ON the structure: an upward reaction points up.
    const [tx, ty] = fit.at({ x: n.x + rc.F[0] / peak, y: n.y + rc.F[1] / peak, z: n.z + rc.F[2] / peak })
    P.push(...arrow(x, y, tx - x, ty - y, len, SHEET_WARN, 0.5))
    P.push({ kind: 'text', x, y: y + 3.4, text: f1(rc.F[1]), size: 2, anchor: 'middle', color: SHEET_WARN })
  }
  frameChrome(P, fit, `SUPPORT REACTIONS${o.caseName ? ` — ${o.caseName}` : ''}`,
    `${r.reactions.length} supports · ΣFy = ${f1(sumY)} kN · the number at each support is its vertical reaction, the arrow its resultant`)
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: fit.box.w, maxY: fit.box.h } }
}

/** The view a model reads best in: a single frame line collapses to its own
 *  elevation, and anything genuinely three-dimensional goes isometric. */
export function bestView(model: StructuralModel): DiagramView {
  const xs = new Set(model.nodes.map((n) => Math.round(n.x * 1000)))
  const zs = new Set(model.nodes.map((n) => Math.round(n.z * 1000)))
  if (zs.size <= 1) return 'xy'
  if (xs.size <= 1) return 'zy'
  return 'iso'
}

export { SHEET_GRID }

// ── mode shapes ──────────────────────────────────────────────────────────
/**
 * D.x — one mode shape, drawn over the model it belongs to.
 *
 * `Mode.shape` is a UNITLESS node-displacement vector normalised so the
 * largest component is 1, which is the only sensible normalisation for a
 * picture: a mode has no amplitude of its own. So the amplification here is
 * simply "draw the peak at `targetFraction` of the model diagonal", and the
 * figure says the shape is normalised rather than implying millimetres.
 *
 * STRAIGHT CHORDS, not the cubic the deflected shape uses. The eigenproblem
 * is solved on the translational mass DOFs alone (`modal.ts` is lumped-mass),
 * so there are no end rotations to interpolate with — drawing a curve would
 * be inventing curvature the analysis never computed.
 */
export function modeShapeDiagram(
  model: StructuralModel, mode: { period: number; shape: Record<string, [number, number, number]>; effMassRatio: [number, number, number] },
  index: number, o: ModelDiagramOpts & { targetFraction?: number } = {},
): Drawing {
  const view = o.view ?? 'iso'
  const xs = model.nodes.map((n) => n.x), ys = model.nodes.map((n) => n.y), zs = model.nodes.map((n) => n.z)
  const span = model.nodes.length
    ? Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs))
    : 1
  const peak = Math.max(1e-12, ...Object.values(mode.shape).map((v) => Math.hypot(v[0], v[1], v[2])))
  const amp = ((o.targetFraction ?? 0.07) * span) / peak
  const moved = model.nodes.map((n) => {
    const s = mode.shape[n.id] ?? [0, 0, 0]
    return { id: n.id, x: n.x + amp * s[0], y: n.y + amp * s[1], z: n.z + amp * s[2] }
  })
  const fit = fitView([...model.nodes, ...moved], view, { w: o.w, h: o.h })
  const P: PlanPrimitive[] = [...wireframe(model, fit, true)]
  const byId = new Map(moved.map((n) => [n.id, n]))
  for (const m of model.members) {
    const a = byId.get(m.i), b = byId.get(m.j)
    if (!a || !b) continue
    const [x1, y1] = fit.at(a), [x2, y2] = fit.at(b)
    P.push({ kind: 'line', x1, y1, x2, y2, stroke: MODE_INK, width: 0.7 })
  }
  for (const s of model.supports) {
    const n = model.nodes.find((x) => x.id === s.node)
    if (!n) continue
    const [x, y] = fit.at(n)
    P.push(...supportSymbol(x, y, s.fixity))
  }
  const [rx, ry, rz] = mode.effMassRatio
  // A MODE SHAPE HAS NO AMPLIFICATION FACTOR, because it has no amplitude:
  // printing "×1.0" beside a unit-normalised eigenvector says nothing. What
  // the reader needs is that the peak was drawn at a chosen fraction of the
  // structure — and, when no direction carries mass, that the mode is
  // torsional, which is the single most useful thing a mode figure can say.
  const torsional = Math.max(rx, ry, rz) < 0.05
  frameChrome(P, fit, `MODE ${index} — T = ${f3(mode.period)} s`,
    `effective mass ${pct(rx)} X · ${pct(ry)} Y · ${pct(rz)} Z`
    + `${torsional ? ' — no translational mass, a TORSIONAL mode' : ''}`
    + ` · unit-normalised shape, peak drawn at ${pct(o.targetFraction ?? 0.07)} of the model diagonal`)
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: fit.box.w, maxY: fit.box.h } }
}

// ── time-history traces ──────────────────────────────────────────────────
export interface Series {
  xs: number[]
  ys: number[]
  label?: string
  color?: string
  /** Drawn dashed — the elastic reference against the inelastic run. */
  dashed?: boolean
  /** Dot at each station; `true` in the parallel array makes it an EVENT dot
   *  (larger, in the warning ink) — which is how a pushover curve marks the
   *  step where a new hinge formed. */
  dots?: boolean[]
}

export interface SeriesOpts {
  title: string
  xLabel: string
  yLabel: string
  w?: number; h?: number
  /** Mark the largest |y| on the first series and print it. */
  markPeak?: boolean
  note?: string
}

/**
 * A signed XY plot — the trace figure for a time history.
 *
 * `capacityCurveDrawing` cannot serve: it assumes both axes start at zero and
 * rise, which is true of a pushover curve and false of every response
 * history, where the interesting half of the record is below the axis. Here
 * the y range spans the data and the zero line is drawn where zero actually
 * falls.
 */
export function seriesDrawing(series: Series[], o: SeriesOpts): Drawing {
  const W = o.w ?? DIAGRAM_W, H = o.h ?? 78
  const L = 20, R = 4, T = 10, B = 13
  const all = series.filter((s) => s.xs.length > 0)
  const xMin = all.length ? Math.min(...all.flatMap((s) => s.xs)) : 0
  const xMax = all.length ? Math.max(...all.flatMap((s) => s.xs)) : 1
  const yLo = Math.min(0, ...all.flatMap((s) => s.ys))
  const yHi = Math.max(0, ...all.flatMap((s) => s.ys))
  const dx = Math.max(xMax - xMin, 1e-9), dy = Math.max(yHi - yLo, 1e-9)
  const X = (v: number) => L + ((W - L - R) * (v - xMin)) / dx
  const Y = (v: number) => H - B - ((H - B - T) * (v - yLo)) / dy
  const P: PlanPrimitive[] = []
  P.push({ kind: 'text', x: 2, y: 5, text: o.title, size: 3.2, anchor: 'start', color: SHEET_INK, weight: 700 })
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const yv = yLo + dy * f
    P.push({ kind: 'line', x1: L, y1: Y(yv), x2: W - R, y2: Y(yv), stroke: SHEET_GRID, width: 0.25 })
    P.push({ kind: 'text', x: L - 1.2, y: Y(yv) + 0.7, text: f2(yv), size: 2.1, anchor: 'end', color: SHEET_NOTE })
    P.push({ kind: 'text', x: X(xMin + dx * f), y: H - B + 3.2, text: f2(xMin + dx * f), size: 2.1, anchor: 'middle', color: SHEET_NOTE })
  }
  // THE ZERO LINE WHERE ZERO IS. A response history straddles it; drawing the
  // axis at the bottom of the box would put the baseline somewhere the data
  // never goes and make every trace look one-sided.
  P.push({ kind: 'line', x1: L, y1: Y(0), x2: W - R, y2: Y(0), stroke: SHEET_INK, width: 0.5 })
  P.push({ kind: 'line', x1: L, y1: T, x2: L, y2: H - B, stroke: SHEET_INK, width: 0.5 })
  series.forEach((s, k) => {
    if (s.xs.length < 2) return
    const ink = s.color ?? TRACE_INKS[k % TRACE_INKS.length]
    P.push({
      kind: 'path', stroke: ink, width: s.dashed ? 0.4 : 0.6, fill: 'none', join: 'round',
      ...(s.dashed ? { dash: [1.4, 1.1] } : {}),
      cmds: s.xs.map((x, n) => ({ c: (n === 0 ? 'M' : 'L') as 'M' | 'L', x: X(x), y: Y(s.ys[n] ?? 0) })),
    })
    if (s.dots) s.xs.forEach((x, n) => {
      const marked = s.dots![n]
      P.push({
        kind: 'circle', cx: X(x), cy: Y(s.ys[n] ?? 0), r: marked ? 0.9 : 0.55,
        fill: marked ? SHEET_WARN : ink, stroke: 'none',
      })
    })
    if (s.label) P.push({
      kind: 'text', x: W - R, y: T + 3 + k * 3.2, text: s.label, size: 2.3, anchor: 'end',
      color: ink, weight: 600,
    })
  })
  if (o.markPeak && all[0]) {
    const s = all[0]
    let best = 0
    for (let k = 1; k < s.ys.length; k++) if (Math.abs(s.ys[k]!) > Math.abs(s.ys[best]!)) best = k
    const px = X(s.xs[best]!), py = Y(s.ys[best]!)
    P.push({ kind: 'circle', cx: px, cy: py, r: 0.9, fill: SHEET_WARN, stroke: 'none' })
    P.push({
      kind: 'text', x: px, y: py + (s.ys[best]! >= 0 ? -2 : 3.4),
      text: `${f2(s.ys[best]!)} @ ${f2(s.xs[best]!)}`, size: 2.2, anchor: 'middle', color: SHEET_WARN,
    })
  }
  P.push({ kind: 'text', x: (L + W - R) / 2, y: H - 1.5, text: o.xLabel, size: 2.5, anchor: 'middle', color: SHEET_INK, weight: 600 })
  // ROTATED TEXT IS ANCHORED AT ITS START, never centred. jsPDF applies the
  // alignment offset in UNROTATED space and then turns the result, so a
  // centred vertical label slides half its own width to the left — off the
  // drawing box and into the page margin, which is exactly where the y-axis
  // caption of every chart in this appendix was printing.
  P.push({ kind: 'text', x: 4.2, y: H - B, text: o.yLabel, size: 2.5, anchor: 'start', color: SHEET_INK, weight: 600, rotate: -90 })
  if (o.note) P.push({ kind: 'text', x: 2, y: H - 5.5, text: o.note, size: 2.2, anchor: 'start', color: SHEET_NOTE })
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: W, maxY: H } }
}

// ── hinges ───────────────────────────────────────────────────────────────
export interface HingeMark {
  member: string
  end: 'i' | 'j'
  /** Order it formed in — printed beside the marker. Omitted ⇒ no number. */
  order?: number
  /** How far into yield, for the fill. 1 = at capacity. */
  utilisation?: number
}

/** Where a hinge marker sits: `inset` of the member's length in from its end,
 *  so two hinges at one joint do not stack on the node. */
const HINGE_INSET = 0.13

/**
 * F.x — WHERE THE HINGES FORMED, and in what order.
 *
 * The pushover table lists `bx0.1.2 @ i` sixteen times; the figure says
 * whether the sequence is a beam mechanism (hinges in the beams, columns
 * intact — what a capacity design is FOR) or a soft storey (a row of hinges
 * at one level). That judgement is the whole reason a pushover is run, and it
 * cannot be made from the table.
 *
 * Markers are inset from the member end rather than drawn on the node, so the
 * two hinges either side of a joint are told apart.
 */
export function hingeDiagram(
  model: StructuralModel, hinges: HingeMark[], o: ModelDiagramOpts & { caseName?: string; subtitle?: string } = {},
): Drawing {
  const view = o.view ?? 'iso'
  const fit = fitView(model.nodes, view, { w: o.w, h: o.h })
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const memById = new Map(model.members.map((m) => [m.id, m]))
  const P: PlanPrimitive[] = [...wireframe(model, fit)]
  let drawn = 0
  const orders = hinges.map((h) => h.order).filter((n): n is number => n != null)
  const maxOrder = orders.length ? Math.max(...orders) : 0
  for (const h of hinges) {
    const m = memById.get(h.member)
    const a = m && byId.get(m.i), b = m && byId.get(m.j)
    if (!a || !b) continue
    const t = h.end === 'i' ? HINGE_INSET : 1 - HINGE_INSET
    const [x, y] = fit.at({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
    // Early hinges are the ones that set the mechanism, so they read hottest.
    const f = maxOrder > 0 && h.order != null ? (h.order - 1) / Math.max(1, maxOrder - 1) : 0
    const ink = f < 0.34 ? '#b91c1c' : f < 0.67 ? '#d97706' : '#0f766e'
    // The marker grows with the number it has to hold — a two-digit order in
    // a disc sized for one digit prints outside its own dot.
    const label = h.order != null ? String(h.order) : ''
    const r = 1.35 + 0.32 * Math.max(0, label.length - 1)
    P.push({ kind: 'circle', cx: x, cy: y, r, fill: ink, stroke: '#ffffff', width: 0.3 })
    if (label)
      P.push({ kind: 'text', x, y: y + 0.65, text: label, size: 1.8, anchor: 'middle', color: '#ffffff', weight: 700 })
    drawn++
  }
  frameChrome(P, fit, `PLASTIC HINGES${o.caseName ? ` — ${o.caseName}` : ''}`,
    o.subtitle ?? `${drawn} hinge${drawn === 1 ? '' : 's'} drawn at the member end they formed at · red = first to yield, teal = last`)
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: fit.box.w, maxY: fit.box.h } }
}

/**
 * The EQUIVALENT PLANE FRAME the nonlinear time history actually ran on —
 * not the model.
 *
 * `nonlinearFrameModel` condenses the building by combining every frame line
 * parallel to the loading direction, so its member ids are the condensed
 * frame's and mean nothing on the 3-D model. Drawing its hinges on the model
 * would put them on members that were never analysed. This draws the frame
 * that was.
 */
export function planeFrameDiagram(
  frame: { nodes: { id: string; x: number; y: number }[]; members: { id: string; i: string; j: string }[]; supports?: { node: string }[] },
  hinges: HingeMark[] = [], o: { w?: number; h?: number; title?: string; legend?: string } = {},
): Drawing {
  const pts = frame.nodes.map((n) => ({ x: n.x, y: n.y, z: 0 }))
  const fit = fitView(pts, 'xy', { w: o.w, h: o.h })
  const byId = new Map(frame.nodes.map((n) => [n.id, { x: n.x, y: n.y, z: 0 }]))
  const P: PlanPrimitive[] = []
  for (const m of frame.members) {
    const a = byId.get(m.i), b = byId.get(m.j)
    if (!a || !b) continue
    const [x1, y1] = fit.at(a), [x2, y2] = fit.at(b)
    P.push({ kind: 'line', x1, y1, x2, y2, stroke: BEAM_INK, width: 0.6 })
  }
  for (const n of frame.nodes) {
    const [x, y] = fit.at({ x: n.x, y: n.y, z: 0 })
    P.push({ kind: 'circle', cx: x, cy: y, r: 0.6, fill: SHEET_INK, stroke: 'none' })
  }
  for (const s of frame.supports ?? []) {
    const n = byId.get(s.node)
    if (!n) continue
    const [x, y] = fit.at(n)
    P.push(...supportSymbol(x, y, 'fixed'))
  }
  const memById = new Map(frame.members.map((m) => [m.id, m]))
  for (const h of hinges) {
    const m = memById.get(h.member)
    const a = m && byId.get(m.i), b = m && byId.get(m.j)
    if (!a || !b) continue
    const t = h.end === 'i' ? HINGE_INSET : 1 - HINGE_INSET
    const [x, y] = fit.at({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0 })
    P.push({ kind: 'circle', cx: x, cy: y, r: 1.4, fill: SHEET_WARN, stroke: '#ffffff', width: 0.3 })
  }
  P.push({ kind: 'text', x: 2, y: 5, text: o.title ?? 'EQUIVALENT PLANE FRAME', size: 3.2, anchor: 'start', color: SHEET_INK, weight: 700 })
  if (o.legend) P.push({ kind: 'text', x: 2, y: fit.box.h - 1.5, text: o.legend, size: 2.4, anchor: 'start', color: SHEET_NOTE })
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: fit.box.w, maxY: fit.box.h } }
}
