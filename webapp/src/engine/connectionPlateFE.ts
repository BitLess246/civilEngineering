// ─────────────────────────────────────────────────────────────────────────
// The designed connection plates as plane-stress FE models (`plateFE`).
//
//   shear tab   the plate as designed (w × h × t), its bolt holes (standard,
//               db + 2), welded along x = 0; each bolt bearing DOWN on its
//               hole with Vu/n — the load path the plate checks (Eq. 10-5,
//               Mu = Vu·a at the bolt line) and the weld (elastic line, Vu·a
//               at the weld) are designed for: the tab cantilevers from its
//               weld. (The bolt group is sized the other conventional way,
//               the moment on the bolts; that is the bolts' check, not the
//               plate's.)
//   gusset      the outline `braceConnection` designed, welded along the UFM
//               interfaces it was designed for (the beam / base-plate face,
//               and the column face where there is one), the brace force
//               delivered along the two slotted-HSS weld lines, half to each
//
// Units: mm, N, MPa (the designs carry kN; converted here).
// ─────────────────────────────────────────────────────────────────────────
import { solvePlateFE, type PlateFEResult, type Pt } from './plateFE'
import { holeDiameter } from './shearTabChecks'
import type { BeamConnection } from './steelConnections'
import type { BraceEndDesign, BraceEndFrame } from './braceConnection'

export interface ConnectionPlateFE {
  fe: PlateFEResult
  /** What the plate is and what loads it, for the panel. */
  kind: 'tab' | 'gusset'
  t: number; Fy: number
  outline: Pt[]
  holes: { x: number; y: number; d: number }[]
  /** Welded edges. */
  welds: [Pt, Pt][]
  /** Applied forces, N, at their points (bolt centres / weld-line midpoints). */
  forces: { at: Pt; Fx: number; Fy: number }[]
  /** The highest von Mises clear of the bolt holes (more than a hole
   *  diameter from each centre) and of the welds' ends (two elements): the
   *  plate working as a section. A hole edge is bolt bearing (§J3.10's
   *  domain), and where a welded edge meets a free one the elastic field is
   *  singular — its value there is the mesh's, not the plate's. */
  peakAway: number
  /** Whether the overall peak is at a hole (bolt bearing). */
  peakAtHole: boolean
}

function away(fe: PlateFEResult, holes: { x: number; y: number; d: number }[], welds: [Pt, Pt][]): { peakAway: number; peakAtHole: boolean } {
  const r = 2 * Math.max(fe.hx, fe.hy)
  const ends = welds.flat()
  const clearOfHoles = (p: Pt) => holes.every((h) => Math.hypot(p[0] - h.x, p[1] - h.y) > h.d)
  const clear = (p: Pt) => clearOfHoles(p) && ends.every((e) => Math.hypot(p[0] - e[0], p[1] - e[1]) > r)
  let peakAway = 0
  fe.nodes.forEach((p, k) => { if (clear(p) && fe.nodalVm[k] > peakAway) peakAway = fe.nodalVm[k] })
  return { peakAway, peakAtHole: !clearOfHoles(fe.maxAt) }
}

/** A shear tab / fin plate / moment-connection web plate. */
export function tabPlateFE(c: BeamConnection): ConnectionPlateFE | null {
  const { wMm: W, hMm: H, t } = c.tab
  const locs = c.bolts.locations
  if (!locs.length || !(W > 0) || !(H > 0)) return null
  const d = holeDiameter(c.bolts.dia)
  const holes = locs.map((b) => ({ x: b.x, y: b.y, d }))
  const loads = locs.map((_, k) => ({ kind: 'hole' as const, hole: k, Fx: 0, Fy: (-c.Vu * 1000) / locs.length }))
  const outline: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]]
  const fe = solvePlateFE({
    outline, holes, t, Fy: c.plate.Fy,
    h: Math.min(d / 5, Math.max(W, H) / 40),
    supports: [{ a: [0, 0], b: [0, H] }],
    loads,
  })
  if (!fe) return null
  return {
    fe, kind: 'tab', t, Fy: c.plate.Fy, outline, holes, welds: [[[0, 0], [0, H]]],
    forces: loads.map((l, k) => ({ at: [holes[k].x, holes[k].y] as Pt, Fx: l.Fx, Fy: l.Fy })),
    ...away(fe, holes, [[[0, 0], [0, H]]]),
  }
}

/** A brace end's gusset, in its own frame (x along the beam, y along the column). */
export function gussetPlateFE(end: BraceEndDesign, frame: BraceEndFrame, gussetFy = 248): ConnectionPlateFE | null {
  const o = end.outline
  const noCol = frame.kind === 'beam' || frame.ec <= 0
  const ux = Math.sin(frame.theta), uy = Math.cos(frame.theta), nx = -uy, ny = ux
  const at = (s: number, off: number): Pt => [s * ux + off * nx, s * uy + off * ny]
  const onB = o.filter((p) => Math.abs(p[1] - frame.eb) < 1e-6).map((p) => p[0])
  const welds: [Pt, Pt][] = [[[Math.min(...onB), frame.eb], [Math.max(...onB), frame.eb]]]
  if (!noCol) welds.push([[frame.ec, frame.eb], [frame.ec, frame.eb + end.ufm.Lv]])
  // tension pulls the gusset along +u (away from the work point); von Mises
  // does not see the sign, so the larger of tension and compression is drawn
  const P = end.P * 1000
  const half = end.H / 2
  const lines = [-1, 1].map((sg) => ({ a: at(end.sEnd, sg * half), b: at(end.sWeld, sg * half) }))
  const fe = solvePlateFE({
    outline: o, t: end.tg, Fy: gussetFy,
    supports: welds.map(([a, b]) => ({ a, b })),
    loads: lines.map(({ a, b }) => ({ kind: 'line' as const, a, b, Fx: (P / 2) * ux, Fy: (P / 2) * uy })),
  })
  if (!fe) return null
  return {
    fe, kind: 'gusset', t: end.tg, Fy: gussetFy, outline: o, holes: [], welds,
    forces: lines.map(({ a, b }) => ({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt, Fx: (P / 2) * ux, Fy: (P / 2) * uy })),
    ...away(fe, [], welds),
  }
}
