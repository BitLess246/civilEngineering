// ─────────────────────────────────────────────────────────────────────────
// ROOF TRUSSES ON A FRAME — layer 1/2 model builder.
//
// Puts a planar steel truss on every roof grid line of a frame model, in the
// span direction asked for, and the purlins between them. The truss is BUILT
// INTO the model, not drawn over it: its members are ordinary model members
// (role 'brace' — axial steel, designed by the pipeline's §D2/§E3 brace
// check), so stiffness, loads, the design schedules and the 3D view all
// inherit it with nothing special-cased downstream.
//
// What it does to the roof it lands on:
//   · the roof-level beams lying ON a truss line are replaced by the truss's
//     bottom chord — a beam and a chord on the same two nodes would double the
//     stiffness (`duplicate-member`) and the chord is what the truss needs;
//   · the roof-level SLABS go — a trussed roof is cladding on purlins, not a
//     concrete plate; their area loads go with them (`removeElements`);
//   · the beams square to the trusses stay, as the eaves / tie beams.
//
// Panel points include every existing roof node on the line, so a truss
// bears on (and is supported by) each column top it crosses; each bay
// between them is split into ceil(bay / panel) equal panels, and a gable
// truss gets a panel point at mid-span for its apex.
//
// Joint idealisation — the usual one for a welded or bolted roof truss: the
// CHORDS run continuous through the joints, the WEBS are pinned (My, Mz
// released both ends). Every panel joint therefore keeps a continuous member
// and a non-zero rotational stiffness, which a fully pinned 3D truss would
// not — its free rotations would make the stiffness matrix singular. At a
// BEARING (a column top) the chords are pinned too: a truss seat bolted to a
// cap plate is a pin, and left rigid the column tops clamp the truss ends and
// take a share of its moment the seat cannot deliver. The column and the
// eaves beams still hold that node, so it stays stiff.
//
// LOADS. Roofing dead load and roof live load (kPa, on plan) are STORED on the
// model (`model.roofing`) as each top-chord panel point's tributary plan area,
// and `buildGravityLoads` turns them into node loads every time the loads are
// rebuilt — the same reason stair reactions are generated rather than stored:
// a stored D node load would be dropped by the next rebuild (which regenerates
// every D load), and a stored Lr one would be doubled by it.
//
// Units: geometry m; sections mm; loads kPa → kN.
// ─────────────────────────────────────────────────────────────────────────
import type { Member, Node, RectSection, StructuralModel, RoofingLoads } from './model'
import { removeElements } from './modelBuilder'
import { shapeByName, sectionBoundingBox } from './aiscSections'

export type TrussProfile = 'gable' | 'flat'
export type TrussWeb = 'howe' | 'pratt' | 'warren'

export interface RoofTrussSpec {
  /** The plan axis the trusses SPAN along; they stand on the grid lines across it. */
  spanAlong: 'x' | 'z'
  profile: TrussProfile
  web: TrussWeb
  /** Apex height above the bearing (gable) or truss depth (flat), m. */
  rise: number
  /** Target panel length on plan, m. */
  panel: number
  /** AISC shape names. */
  chordShape: string
  webShape: string
  /** Purlin shape; omit for no purlins. */
  purlinShape?: string
  steelFy?: number
  steelFu?: number
  /** Roofing dead load and roof live load, kPa on plan. */
  qD: number
  qLr: number
}

export type { RoofingLoads }

export interface RoofTrussResult {
  model: StructuralModel
  /** Truss lines placed, at the across-coordinate (m). */
  lines: number[]
  /** Ids of everything added. */
  added: { nodes: string[]; members: string[] }
  /** Ids removed: roof beams under the chords, roof slabs. */
  removed: string[]
  /** Why nothing was placed, when nothing was. */
  reason?: string
}

const TOL = 1e-6

/**
 * Panel points along one line: the existing nodes' along-coordinates `us`
 * (sorted), each bay split into ceil(bay/panel) equal panels, plus the
 * mid-span point a gable needs for its apex. Pure — exported for the tests.
 */
export function panelPoints(us: readonly number[], panel: number, gable: boolean): number[] {
  const pts: number[] = [us[0]]
  const p = Math.max(0.3, panel)
  for (let i = 0; i + 1 < us.length; i++) {
    const a = us[i], b = us[i + 1], n = Math.max(1, Math.ceil((b - a) / p - 1e-9))
    for (let k = 1; k <= n; k++) pts.push(a + ((b - a) * k) / n)
  }
  if (gable) {
    const mid = (us[0] + us[us.length - 1]) / 2
    if (!pts.some((u) => Math.abs(u - mid) < 1e-6)) { pts.push(mid); pts.sort((x, y) => x - y) }
  }
  return pts
}

/** Height of the top chord above the bearing at `u`, m. */
const topHeight = (u: number, u0: number, L: number, rise: number, gable: boolean) =>
  gable ? rise * (1 - Math.abs(u - (u0 + L / 2)) / (L / 2)) : rise

/**
 * The web members of one truss, as [bottom index, top index] pairs into its
 * panel points. A vertical at every point that has a top node (the ends of a
 * gable have none — the chords meet at the bearing); diagonals per pattern:
 *   · Pratt — falling toward mid-span, so they pull under gravity;
 *   · Howe — rising toward it, so they push (the timber-truss layout);
 *   · Warren — zig-zagging panel to panel. With a vertical at every point,
 *     so no chord node is left joined only by two collinear chord members.
 * A gable's end panel is already a triangle (bottom chord, top chord,
 * vertical) and takes no diagonal.
 */
export function webPairs(us: readonly number[], web: TrussWeb, gable: boolean): [number, number][] {
  const n = us.length - 1
  const mid = (us[0] + us[n]) / 2
  const hasTop = (i: number) => !(gable && (i === 0 || i === n))
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) if (hasTop(i)) out.push([i, i])
  for (let i = 0; i < n; i++) {
    if (gable && (i === 0 || i === n - 1)) continue
    let pair: [number, number]
    if (web === 'warren') pair = i % 2 === 0 ? [i, i + 1] : [i + 1, i]
    else {
      const left = (us[i] + us[i + 1]) / 2 < mid
      pair = left === (web === 'pratt') ? [i + 1, i] : [i, i + 1]
    }
    if (hasTop(pair[1])) out.push(pair)
  }
  return out
}

/** Place the roof trusses. Returns the model unchanged with a `reason` when it cannot. */
export function addRoofTrusses(model: StructuralModel, spec: RoofTrussSpec): RoofTrussResult {
  const none = (reason: string): RoofTrussResult => ({ model, lines: [], added: { nodes: [], members: [] }, removed: [], reason })
  if (!(spec.rise > 0)) return none('the rise must be greater than zero')
  if (!shapeByName(spec.chordShape) || !shapeByName(spec.webShape)) return none('chord or web shape is not in the AISC library')
  if (spec.purlinShape && !shapeByName(spec.purlinShape)) return none('purlin shape is not in the AISC library')
  if (model.nodes.length === 0) return none('the model has no nodes')
  // the roof is the highest node level — which, once trusses are on, is their
  // apex: a second set would stand on top of the first
  if (model.roofing || model.members.some((m) => /^rt\d/.test(m.id)))
    return none('the roof already carries trusses — remove them first')

  const roofY = Math.max(...model.nodes.map((n) => n.y))
  const roof = model.nodes.filter((n) => Math.abs(n.y - roofY) < TOL)
  if (roof.length < 2) return none('the roof level has fewer than two nodes')
  const along = (n: Pick<Node, 'x' | 'z'>) => (spec.spanAlong === 'x' ? n.x : n.z)
  const across = (n: Pick<Node, 'x' | 'z'>) => (spec.spanAlong === 'x' ? n.z : n.x)

  // grid lines across the span direction, each with its roof nodes in order
  const lineMap = new Map<string, Node[]>()
  for (const n of roof) {
    const k = across(n).toFixed(6)
    lineMap.set(k, [...(lineMap.get(k) ?? []), n])
  }
  const lines = [...lineMap.values()]
    .map((ns) => ns.sort((a, b) => along(a) - along(b)))
    .filter((ns) => along(ns[ns.length - 1]) - along(ns[0]) > TOL)
    .sort((a, b) => across(a[0]) - across(b[0]))
  if (lines.length === 0) return none(`no roof grid line runs along ${spec.spanAlong.toUpperCase()}`)
  const gable = spec.profile === 'gable'

  // roof beams on the truss lines (both ends on the same line) are replaced
  const lineOf = new Map<string, number>()
  lines.forEach((ns, li) => ns.forEach((n) => lineOf.set(n.id, li)))
  const removed = new Set<string>()
  for (const m of model.members) {
    if (m.role === 'column') continue
    const li = lineOf.get(m.i), lj = lineOf.get(m.j)
    if (li !== undefined && li === lj) removed.add(m.id)
  }
  for (const p of model.plates)
    if (p.role !== 'wall' && p.corners.every((c) => roof.some((n) => n.id === c))) removed.add(p.id)
  const base = removeElements(model, removed)

  const nodes: Node[] = [], members: Member[] = [], sections: RectSection[] = []
  const usedIds = new Set([...model.nodes.map((n) => n.id), ...model.members.map((m) => m.id)])
  const fresh = (id: string) => { let k = id, i = 1; while (usedIds.has(k)) k = `${id}_${i++}`; usedIds.add(k); return k }
  const steel = (id: string, shape: string): string => {
    const box = sectionBoundingBox(shapeByName(shape)!)
    const tmpl = model.sections[0]
    sections.push({
      id, name: shape, b: box.b, h: box.h,
      fc: tmpl?.fc ?? 28, fy: tmpl?.fy ?? 415, barDia: tmpl?.barDia ?? 16, tieDia: tmpl?.tieDia ?? 10, cover: tmpl?.cover ?? 40,
      material: 'steel', shape, steelFy: spec.steelFy ?? 248, steelFu: spec.steelFu ?? 400,
    })
    return id
  }
  const PIN = { My: true, Mz: true }
  const existing = new Set(model.nodes.map((n) => n.id))
  /** `pinned` releases both ends; otherwise only an end that lands on an
   *  EXISTING node — a bearing on a column top — is released, the seat. */
  const addMember = (id: string, i: string, j: string, shape: string, role: Member['role'], pinned: boolean) => {
    const mid = fresh(id)
    const ri = pinned || existing.has(i), rj = pinned || existing.has(j)
    const releases = ri || rj ? { ...(ri ? { iEnd: PIN } : {}), ...(rj ? { jEnd: PIN } : {}) } : undefined
    members.push({ id: mid, i, j, role, section: steel(mid, shape), ...(releases ? { releases } : {}) })
  }
  const at = (ref: Node, u: number, h: number): Pick<Node, 'x' | 'y' | 'z'> => spec.spanAlong === 'x'
    ? { x: u, y: roofY + h, z: ref.z } : { x: ref.x, y: roofY + h, z: u }

  const tops: (string | null)[][] = []          // per line, the top node id at each panel point
  const pointsOf: number[][] = []
  const roofing: RoofingLoads['points'] = []
  lines.forEach((ns, li) => {
    const us = ns.map(along)
    const u0 = us[0], L = us[us.length - 1] - u0
    const pts = panelPoints(us, spec.panel, gable)
    pointsOf.push(pts)
    const tag = `rt${li + 1}`
    const bot = pts.map((u, k) => {
      const hit = ns.find((n) => Math.abs(along(n) - u) < 1e-6)
      if (hit) return hit.id
      const id = fresh(`${tag}.b${k}`)
      nodes.push({ id, ...at(ns[0], u, 0) })
      return id
    })
    const n = pts.length - 1
    const top = pts.map((u, k) => {
      const h = topHeight(u, u0, L, spec.rise, gable)
      if (h < 1e-6) return null
      const id = fresh(`${tag}.t${k}`)
      nodes.push({ id, ...at(ns[0], u, h) })
      return id
    })
    tops.push(top)
    const T = (k: number) => top[k] ?? bot[k]
    for (let k = 0; k < n; k++) addMember(`${tag}.bc${k}`, bot[k], bot[k + 1], spec.chordShape, 'brace', false)
    for (let k = 0; k < n; k++) addMember(`${tag}.tc${k}`, T(k), T(k + 1), spec.chordShape, 'brace', false)
    let w = 0
    for (const [bi, ti] of webPairs(pts, spec.web, gable)) {
      const tn = top[ti]
      if (!tn || tn === bot[bi]) continue
      addMember(`${tag}.w${w++}`, bot[bi], tn, spec.webShape, 'brace', true)
    }
    // tributary plan area of each top-chord point: half the panels either
    // side along the truss × half the spacing to the neighbouring lines
    const c = across(ns[0])
    const prev = li > 0 ? across(lines[li - 1][0]) : c, next = li < lines.length - 1 ? across(lines[li + 1][0]) : c
    const width = (c - prev) / 2 + (next - c) / 2
    pts.forEach((u, k) => {
      const half = ((k > 0 ? u - pts[k - 1] : 0) + (k < n ? pts[k + 1] - u : 0)) / 2
      roofing.push({ node: T(k), area: half * width })
    })
  })

  // purlins: top-chord point to the matching point on the next truss, where
  // the two trusses have the same panel layout (a regular grid always does)
  if (spec.purlinShape) {
    for (let li = 0; li + 1 < lines.length; li++) {
      const a = pointsOf[li], b = pointsOf[li + 1]
      if (a.length !== b.length || a.some((u, k) => Math.abs(u - b[k]) > 1e-6)) continue
      a.forEach((_, k) => {
        const ta = tops[li][k], tb = tops[li + 1][k]
        if (ta && tb) addMember(`pu${li + 1}.${k}`, ta, tb, spec.purlinShape!, 'beam', true)
      })
    }
  }

  const out: StructuralModel = {
    ...base,
    nodes: [...base.nodes, ...nodes],
    sections: [...base.sections.filter((s) => !removed.has(s.id)), ...sections],
    members: [...base.members, ...members],
    roofing: { qD: spec.qD, qLr: spec.qLr, points: roofing },
  }
  return {
    model: out,
    lines: lines.map((ns) => across(ns[0])),
    added: { nodes: nodes.map((n) => n.id), members: members.map((m) => m.id) },
    removed: [...removed],
  }
}

// The roofing's node loads live beside `buildGravityLoads`, which calls them.
export { roofingLoads } from './modelBuilder'
