// ─────────────────────────────────────────────────────────────────────────
// A BRACE END — the HSS slotted over a gusset, and the gusset on the frame.
//
//   brace to gusset   four fillets (both faces of the gusset, at both slotted
//                     walls) of length lw: §J2.4 weld, §J4.2(b) rupture of
//                     the HSS wall and of the gusset along them; lw long
//                     enough for the shear lag the member's rupture check
//                     takes (Table D3.1 case 5 round, 6 rectangular)
//   gusset            Whitmore section at the brace end, H + 2·lw·tan30°, of
//                     which only the width lying in the plate is counted (the
//                     part that runs into the beam or column is not); §J4.1
//                     yielding, §J4.4 buckling at K = 0.65 over Thornton's
//                     mean of the three lengths behind the section's ends and
//                     centre to the frame; §J4.3 block shear round the welds.
//                     The free edges follow the 30° spread back from the far
//                     end, so the plate is the convex hull of the brace end,
//                     its spread and the UFM interfaces, cut at the faces
//   gusset to frame   the Uniform Force Method (AISC Manual Part 13): with
//                     the work point at the beam/column centre lines, the
//                     interfaces at α (along the beam) and β (along the
//                     column) carry no moment when α − β·tanθ = eb·tanθ − ec;
//                     Hb = α·P/r, Vb = eb·P/r, Hc = ec·P/r, Vc = β·P/r,
//                     r = √((α + ec)² + (β + eb)²). Each interface welded by
//                     two fillets for its resultant ×1.25 (DG29 ductility
//                     allowance) and its gusset edge checked in shear and
//                     normal yielding.
//
// A chevron gusset under a beam is the case ec = 0, β = 0 (all to the beam);
// a gusset on a base plate is eb = 0. θ is measured from the VERTICAL, as the
// UFM writes it. Units: mm, MPa, kN.
// ─────────────────────────────────────────────────────────────────────────
import { shapeByName, type AiscShape } from './aiscSections'
import type { StructuralModel, Member } from './model'
import { localAxes, defaultAxisRotation, type V3 } from './frame3d'
import { E_STEEL, minFilletSize, FEXX_BY_CLASS } from './steelDesign'

const FEXX = FEXX_BY_CLASS.E70
const PHI_W = 0.75, PHI_R = 0.75, PHI_Y = 0.9, PHI_V = 1.0
const GUSSET_STOCK = [10, 12, 16, 19, 22, 25, 28, 32]
const CLEAR = 25, EDGE = 25, SLOT = 3

export type BraceEndKind = 'corner' | 'beam' | 'base'

export interface BraceEndFrame {
  kind: BraceEndKind
  /** Work point to the beam face (half the beam depth; 0 on a base plate), and
   *  to the column face (half its depth on a flange, half tw on a web; 0 with
   *  no column), mm. */
  eb: number; ec: number
  /** Brace angle from the vertical, radians, in the plane of the gusset. */
  theta: number
  /** Beam/plate and column steel, MPa (the gusset's own is Fy 248, Fu 400). */
  Fy?: number
  /** Whether the brace runs DOWN from this end — the gusset then hangs below
   *  its beam — and the shapes it meets, for the detail. */
  upper?: boolean
  beam?: string; column?: string
}

export interface BraceEndDesign {
  kind: BraceEndKind
  P: number                       // design axial force (larger of T and C), kN
  H: number; B: number            // brace depth in the gusset plane, and across it, mm
  tg: number                      // gusset, mm
  weld: { w: number; lw: number; phiPerLen: number; phiRn: number; hssRupture: number; gussetRupture: number; ok: boolean }
  /** Member-side net section at the slot, for the brace's §D2 rupture. */
  An: number; U: number; xbar: number
  /** Lw0 = H + 2·lw·tan30°; Lw the part of it inside the plate, between
   *  `ends` (gusset frame, mm); L the mean buckling length behind it. */
  whitmore: { Lw: number; Lw0: number; ends: [number, number][]; phiYield: number; L: number; KLr: number; Fcr: number; phiBuckle: number; ok: boolean }
  blockShear: { Agv: number; Ant: number; phiRn: number; ok: boolean }
  /** Gusset outline in its own frame (x along the beam from the work point,
   *  y along the column), the brace end and far end of the weld along it, mm. */
  outline: [number, number][]
  sEnd: number; sWeld: number
  ufm: {
    alpha: number; beta: number; r: number
    Hb: number; Vb: number; Hc: number; Vc: number
    Lh: number; Lv: number
    weldBeam: number; weldColumn: number      // fillet legs, mm
    /** Edge interaction √((V/φVn)² + (N/φNn)²) along each interface. */
    beamEdge: number; columnEdge: number
    beamEdgeOk: boolean; columnEdgeOk: boolean
  }
  util: number
  governs: string
  ok: boolean
}

/** The slotted HSS (rectangular or round) — depth H in the gusset plane,
 *  B across it, wall t; and x̄ for Table D3.1 case 5/6. */
function hssGeom(s: AiscShape): { H: number; B: number; t: number; xbar: number; round: boolean } | null {
  if ((s.family === 'HSS' || s.family === 'PIPE') && s.D && s.t) return { H: s.D, B: s.D, t: s.t, xbar: s.D / Math.PI, round: true }
  if (s.family === 'HSS' && s.b && s.h && s.t) {
    const H = s.h, B = s.b
    return { H, B, t: s.t, xbar: (B * B + 2 * B * H) / (4 * (B + H)), round: false }
  }
  return null
}

/** Shear-lag U for a slotted HSS welded over lw (Table D3.1, cases 5 and 6). */
export function slottedU(g: { H: number; xbar: number; round: boolean }, lw: number): number {
  if (g.round) return lw >= 1.3 * g.H ? 1 : Math.max(0, 1 - g.xbar / lw)
  return Math.max(0, 1 - g.xbar / lw)
}

/** Andrew's monotone chain, counter-clockwise. */
export function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: [number, number][] = [], hi: [number, number][] = []
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q) }
  for (const q of [...p].reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 1e-9) hi.pop(); hi.push(q) }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)]
}

/** The part of a polygon where a·x + b·y ≥ c (Sutherland–Hodgman, one edge). */
export function clipHalfPlane(poly: [number, number][], a: number, b: number, c: number): [number, number][] {
  const out: [number, number][] = []
  const f = (p: [number, number]) => a * p[0] + b * p[1] - c
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length], fp = f(p), fq = f(q)
    if (fp >= -1e-9) out.push(p)
    if ((fp >= -1e-9) !== (fq >= -1e-9)) {
      const t = fp / (fp - fq)
      const x: [number, number] = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]
      // land exactly on the clipping line, so the faces read back cleanly
      if (Math.abs(a) === 1 && b === 0) x[0] = c * a
      if (Math.abs(b) === 1 && a === 0) x[1] = c * b
      out.push(x)
    }
  }
  return out
}

/** The part of segment p→q inside a convex polygon (Cyrus–Beck), or null. */
export function clipSegment(p: [number, number], q: [number, number], poly: [number, number][]): [[number, number], [number, number]] | null {
  let t0 = 0, t1 = 1
  const dx = q[0] - p[0], dy = q[1] - p[1]
  // orientation-independent: the inward side of each edge is the centroid's
  const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length, cy = poly.reduce((s, v) => s + v[1], 0) / poly.length
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length]
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]
    if (nx * (cx - a[0]) + ny * (cy - a[1]) < 0) { nx = -nx; ny = -ny }
    const num = nx * (p[0] - a[0]) + ny * (p[1] - a[1]), den = nx * dx + ny * dy
    if (Math.abs(den) < 1e-12) { if (num < -1e-9) return null; continue }
    const t = -num / den
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t)
    if (t0 > t1 + 1e-12) return null
  }
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]]
}

/** Brace ends this module designs: HSS and pipe, slotted over the gusset. */
export const braceEndSupported = (s: AiscShape) => hssGeom(s) != null

export function designBraceEnd(
  s: AiscShape, Tu: number, Pu: number, frame: BraceEndFrame, Fu = 450, gussetFy = 248, gussetFu = 400,
  /** The member's §D2 rupture asks for this effective net area, mm² (the
   *  weld is lengthened until U·An reaches it, where it can). */
  AeNeed = 0,
): BraceEndDesign | null {
  const g = hssGeom(s)
  if (!g) return null
  const P = Math.max(Tu, Pu)
  let best: BraceEndDesign | null = null
  for (const tg of GUSSET_STOCK) {
    const d = designAt(tg)
    best = d
    if (d.ok) return d
  }
  return best

  function designAt(tg: number): BraceEndDesign {
    // ── brace to gusset: 4 fillet lines of lw ─────────────────────────────
    const w = Math.max(minFilletSize(Math.min(g!.t, tg)), Math.min(8, Math.floor(g!.t)))
    const weldPer = PHI_W * 0.6 * FEXX * 0.707 * w            // N/mm per line
    const hssPer = PHI_R * 0.6 * Fu * g!.t                     // wall rupture along a line
    const gusPer = (PHI_R * 0.6 * gussetFu * tg) / 2           // two lines share the gusset at each wall
    const phiPerLen = Math.min(weldPer, hssPer, gusPer)
    const An = s.A - 2 * g!.t * (tg + SLOT)
    let lw = Math.max(g!.H, Math.ceil((P * 1000) / (4 * phiPerLen) / 10) * 10)
    // lengthen for shear lag where the member's rupture needs it (round HSS
    // reaches U = 1 at 1.3D; a rectangular one only approaches it)
    for (let k = 0; k < 40 && slottedU(g!, lw) * An < AeNeed; k++) lw += 10
    const U = slottedU(g!, lw)
    const phiRn = (4 * phiPerLen * lw) / 1000
    const weld = { w, lw, phiPerLen, phiRn, hssRupture: (4 * hssPer * lw) / 1000, gussetRupture: (4 * gusPer * lw) / 1000, ok: phiRn >= P - 1e-9 }

    // ── geometry: brace end clear of the frame faces by CLEAR ─────────────
    const th = frame.theta
    const ux = Math.sin(th), uy = Math.cos(th)                 // along the brace, away from the work point
    const nx = -uy, ny = ux
    const half = g!.H / 2
    // no column: a chevron gusset under its beam, or a gusset on a base plate
    // with no column against it — the interface is centred where the brace
    // axis crosses the face, and nothing bounds x
    const noCol = frame.kind === 'beam' || frame.ec <= 0
    const sx = noCol ? 0 : (frame.ec + CLEAR + half * uy) / Math.max(ux, 1e-6)
    const sy = (frame.eb + CLEAR + half * ux) / Math.max(uy, 1e-6)
    const sEnd = Math.max(sx, sy)
    const sWeld = sEnd + lw
    const far = sWeld + EDGE
    const at = (s: number, o: number): [number, number] => [s * ux + o * nx, s * uy + o * ny]
    // the free edges follow the Whitmore spread back from the far end, so the
    // section at the brace end lies in the plate wherever the frame leaves it
    const spread = lw * Math.tan(Math.PI / 6)
    const pts: [number, number][] = [at(far, half + EDGE), at(far, -(half + EDGE)), at(sEnd, half + EDGE + spread), at(sEnd, -(half + EDGE + spread))]
    const inside = (poly: [number, number][]) => clipHalfPlane(noCol ? poly : clipHalfPlane(poly, 1, 0, frame.ec), 0, 1, frame.eb)
    const alpha0 = frame.eb * Math.tan(th)                     // where the axis crosses the beam face
    const plate = (Lh: number, Lv: number): [number, number][] => inside(convexHull(noCol
      ? [...pts, [alpha0 - Lh / 2, frame.eb], [alpha0 + Lh / 2, frame.eb]]
      : [...pts, [frame.ec, frame.eb], [frame.ec + Lh, frame.eb], [frame.ec, frame.eb + Lv]]))
    const faceSpan = (poly: [number, number][]) => {
      const onB = poly.filter((p) => Math.abs(p[1] - frame.eb) < 1e-6).map((p) => p[0])
      const onC = poly.filter((p) => Math.abs(p[0] - frame.ec) < 1e-6).map((p) => p[1])
      return {
        Lh: onB.length ? Math.max(...onB) - (noCol ? Math.min(...onB) : frame.ec) : 0,
        Lv: noCol || !onC.length ? 0 : Math.max(...onC) - frame.eb,
      }
    }
    const reachX = Math.max(...pts.map((p) => Math.abs(p[0] - alpha0)))
    let { Lh, Lv } = faceSpan(plate(noCol ? 2 * reachX : 100, 100))
    Lh = Math.max(Lh, 100); if (!noCol) Lv = Math.max(Lv, 100)

    // ── UFM: α, β for no interface moment, then the four forces ─────────────
    const t = Math.tan(th)
    let beta = Lv / 2, alpha = frame.eb * t - frame.ec + beta * t
    if (noCol) { beta = 0; alpha = alpha0 }
    else if (alpha < Lh / 4) {
      // a steep brace: fix α at the beam interface's mid-length, solve β
      alpha = Lh / 2
      beta = Math.max(0, (alpha - frame.eb * t + frame.ec) / Math.max(t, 1e-6))
    }
    if (!noCol) { Lh = Math.max(Lh, 2 * alpha); Lv = Math.max(Lv, 2 * beta) }
    const outline = plate(Lh, Lv)
    ;({ Lh, Lv } = faceSpan(outline))
    const r = Math.hypot(alpha + frame.ec, beta + frame.eb)
    // r = 0 only on a base plate with no column (the axis meets the plate at
    // the work point): the plate takes both components directly
    const Hb = r > 1e-9 ? (alpha * P) / r : P * Math.sin(th), Vb = r > 1e-9 ? (frame.eb * P) / r : P * Math.cos(th)
    const Hc = r > 1e-9 ? (frame.ec * P) / r : 0, Vc = r > 1e-9 ? (beta * P) / r : 0
    const interfaceWeld = (R: number, L: number) => {
      if (L <= 0 || R <= 0) return 0
      const need = (1.25 * R * 1000) / (2 * L * PHI_W * 0.6 * FEXX * 0.707)
      return Math.max(minFilletSize(tg), Math.ceil(need))
    }
    const weldBeam = interfaceWeld(Math.hypot(Hb, Vb), Lh)
    const weldColumn = noCol ? 0 : interfaceWeld(Math.hypot(Hc, Vc), Lv)
    // §J4.2(a) shear yielding with §J4.1(a) normal yielding along the edge
    const edgeUtil = (Hs: number, N: number, L: number) => L <= 0 ? 0 : Math.sqrt(((Hs * 1000) / (PHI_V * 0.6 * gussetFy * tg * L)) ** 2 + ((N * 1000) / (PHI_Y * gussetFy * tg * L)) ** 2)
    const beamEdge = edgeUtil(Hb, Vb, Lh), columnEdge = noCol ? 0 : edgeUtil(Vc, Hc, Lv)
    const ufm = {
      alpha, beta, r, Hb, Vb, Hc, Vc, Lh, Lv, weldBeam, weldColumn, beamEdge, columnEdge,
      beamEdgeOk: beamEdge <= 1 + 1e-9, columnEdgeOk: columnEdge <= 1 + 1e-9,
    }

    // ── Whitmore section: the part of H + 2·lw·tan30° that lies in the plate
    // (where it runs into the beam or column it is not counted) ────────────
    const Lw0 = g!.H + 2 * spread
    const ends = clipSegment(at(sEnd, Lw0 / 2), at(sEnd, -Lw0 / 2), outline)
    const Lw = ends ? Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) : 0
    const phiYield = (PHI_Y * gussetFy * Lw * tg) / 1000
    // buckling length: the mean of the distances back along the brace from
    // the section's two ends and its centre to the frame (Thornton)
    const back = (q: [number, number]) => Math.max(0, Math.min(
      (q[1] - frame.eb) / Math.max(uy, 1e-6), noCol ? Infinity : (q[0] - frame.ec) / Math.max(ux, 1e-6)))
    const wEnds = ends ?? [at(sEnd, 0), at(sEnd, 0)]
    const Lfree = (back(wEnds[0]) + back(at(sEnd, 0)) + back(wEnds[1])) / 3
    const KLr = (0.65 * Lfree) / (tg / Math.sqrt(12))
    const Fe = KLr > 0 ? (Math.PI ** 2 * E_STEEL) / KLr ** 2 : Infinity
    const Fcr = KLr <= 25 ? gussetFy : KLr <= 4.71 * Math.sqrt(E_STEEL / gussetFy) ? 0.658 ** (gussetFy / Fe) * gussetFy : 0.877 * Fe
    const phiBuckle = (PHI_Y * Fcr * Lw * tg) / 1000
    const whitmore = { Lw, Lw0, ends: wEnds, phiYield, L: Lfree, KLr, Fcr, phiBuckle, ok: phiYield >= Tu - 1e-9 && phiBuckle >= Pu - 1e-9 }

    // ── block shear: the two weld lines in shear, the slot width in tension ─
    const Agv = 2 * lw * tg, Ant = g!.H * tg
    const bsRn = Math.min(0.6 * gussetFu * Agv, 0.6 * gussetFy * Agv) + gussetFu * Ant
    const blockShear = { Agv, Ant, phiRn: (PHI_R * bsRn) / 1000, ok: (PHI_R * bsRn) / 1000 >= Tu - 1e-9 }

    const ratios: [number, string][] = [
      [P / weld.phiRn, 'brace welds'],
      [Tu / phiYield, 'Whitmore yielding'], [Pu / phiBuckle, 'gusset buckling'], [Tu / blockShear.phiRn, 'block shear'],
      [ufm.beamEdge, 'gusset edge at the beam'], [ufm.columnEdge, 'gusset edge at the column'],
    ]
    const [util, governs] = ratios.reduce((a, b) => (b[0] > a[0] ? b : a))
    return {
      kind: frame.kind, P, H: g!.H, B: g!.B, tg, weld, An, U, xbar: g!.xbar,
      whitmore, blockShear, outline, sEnd, sWeld, ufm, util, governs, ok: util <= 1 + 1e-9,
    }
  }
}

/** The frame a brace end lands on, read off the model: the brace's angle from
 *  the vertical; a column at the node (ec = d/2 on its flange, tw/2 on its
 *  web, by the column's resolved local axes); a beam collinear with the
 *  brace in plan (eb = d/2); otherwise a support's base plate (eb = 0). */
export function braceEndFrameFor(model: StructuralModel, brace: Member, node: string): BraceEndFrame {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const sec = new Map(model.sections.map((x) => [x.id, x]))
  const a = nodes.get(node)!, b = nodes.get(brace.i === node ? brace.j : brace.i)!
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z
  const hz = Math.hypot(vx, vz)
  const theta = Math.atan2(hz, Math.abs(vy))
  const px = hz > 1e-9 ? vx / hz : 1, pz = hz > 1e-9 ? vz / hz : 0
  const at = model.members.filter((m) => m.id !== brace.id && (m.i === node || m.j === node))
  const shapeOf = (m: Member) => { const s = sec.get(m.section)?.shape; return s ? shapeByName(s) : undefined }
  const col = at.find((m) => m.role === 'column')
  const beam = at.find((m) => {
    if (m.role !== 'beam' && m.role !== 'girder') return false
    const o = nodes.get(m.i === node ? m.j : m.i)!
    const dx = o.x - a.x, dz = o.z - a.z, h = Math.hypot(dx, dz)
    return h > 1e-9 && Math.abs((dx * px + dz * pz) / h) > 0.9
  })
  let ec = 0
  if (col) {
    const cs = shapeOf(col)
    const ci = nodes.get(col.i)!, cj = nodes.get(col.j)!
    const cdir: V3 = [cj.x - ci.x, cj.y - ci.y, cj.z - ci.z]
    const [, yp] = localAxes(cdir, defaultAxisRotation(cdir, col.axisRotation))
    const dh = Math.hypot(yp[0], yp[2])
    const cosA = dh > 1e-9 ? Math.abs((yp[0] * px + yp[2] * pz) / dh) : 1
    ec = cosA >= Math.SQRT1_2 ? (cs?.d ?? 300) / 2 : (cs?.tw ?? 10) / 2
  }
  const eb = beam ? (shapeOf(beam)?.d ?? 300) / 2 : 0
  const kind: BraceEndKind = beam && col ? 'corner' : beam ? 'beam' : 'base'
  return { kind, eb, ec, theta, upper: b.y < a.y, beam: beam ? sec.get(beam.section)?.shape : undefined, column: col ? sec.get(col.section)?.shape : undefined }
}
