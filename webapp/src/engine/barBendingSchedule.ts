// ─────────────────────────────────────────────────────────────────────────
// BAR BENDING SCHEDULE — every bar the cages place, as the fabricator reads it.
//
// The cage is the one source: the 3D view paints its runs, the frame
// elevations project them, the take-off weighs them. The schedule here is the
// fourth reader of the same objects, so a bar cannot be drawn one length and
// billed another.
//
// A run is a bar SHAPE in 3D (corner vertices + bend diameters). The schedule
// needs it flat: each run is laid into its own plane (first leg along +x),
// classified, and its legs measured. Identical shapes — same Ø, same legs to
// the nearest 5 mm, same closure — are one schedule TYPE however many members
// carry them, which is how a BBS is cut and bundled on site.
//
// Shape codes (after the BS 8666 / SP-66 families, named plainly):
//   A  straight
//   B  one bend — an L, a hooked end
//   C  two bends turning the same way — a U, a bar hooked at both ends
//   D  two bends turning opposite ways — a crank / joggle
//   E  closed — stirrup, tie or hoop
//   F  anything else
//
// Units: legs and cut lengths mm, totals m, weights kg. Model geometry is m.
// ─────────────────────────────────────────────────────────────────────────
import { cutLength, kgPerM, turnAngles, type RebarCage, type RebarRole, type RebarRun, type Vec3 } from './rebarModel'

export type ShapeCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface BbsShape {
  code: ShapeCode
  /** The bar laid flat, mm, from its first vertex, longest leg along +x. */
  pts: [number, number][]
  /** Corner-to-corner centreline leg lengths, mm, one per segment. */
  legs: number[]
  /** Deviation at each bend, degrees. */
  turns: number[]
  closed: boolean
}

export interface BbsRow {
  mark: string
  member: string
  role: RebarRole
  dia: number
  count: number
  shape: BbsShape
  /** Developed (cut) length of one bar, mm — `cutLength`, bends deducted. */
  cutMm: number
  /** count × cut, m. */
  totalM: number
  kgPerM: number
  kg: number
}

/** One schedule type: identical bars, wherever they sit. */
export interface BbsType extends Omit<BbsRow, 'mark' | 'member'> {
  /** 'A', 'B', … then 'AA', … — the type's label on the sheet. */
  type: string
  /** The member marks that use it, and the run marks. */
  members: string[]
  marks: string[]
}

const sub = (a: Vec3, b: Vec3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): [number, number, number] =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): [number, number, number] => { const l = norm(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/**
 * Lay a run flat and classify it.
 *
 * The plane is the first leg and the first leg that is not parallel to it.
 * Bars are plane curves (a closed tie leans one Ø out of plane over its whole
 * run, which the projection drops — it is 0.03 % of a leg). A straight bar has
 * no second direction, so it is simply its length along x.
 */
export function bbsShape(run: RebarRun): BbsShape {
  const P = run.path
  const closed = !!run.closed
  const n = P.length
  const segs: [Vec3, Vec3][] = []
  for (let k = 1; k < n; k++) segs.push([P[k - 1], P[k]])
  if (closed && n > 2) segs.push([P[n - 1], P[0]])
  const legs = segs.map(([a, b]) => norm(sub(b, a)) * 1000)
  const turns = turnAngles(P as Vec3[], closed).filter((t) => t > 1)

  // x runs along the LONGEST leg, so a hooked bar lies the way it is read —
  // main leg across, hooks up or down — whichever end it was modelled from
  let longest = 0
  for (let k = 1; k < segs.length; k++) if (legs[k] > legs[longest]) longest = k
  const e1 = unit(sub(segs[longest]?.[1] ?? P[0], segs[longest]?.[0] ?? P[0]))
  let nrm: [number, number, number] | null = null
  for (const [a, b] of segs) {
    const c = cross(e1, unit(sub(b, a)))
    if (norm(c) > 1e-6) { nrm = unit(c); break }
  }
  const e2 = nrm ? cross(nrm, e1) : [0, 1, 0] as [number, number, number]
  const pts: [number, number][] = P.map((p) => {
    const d = sub(p, P[0])
    return [dot(d, e1) * 1000, dot(d, e2) * 1000]
  })

  // signed turn at each interior corner, in the plane — same sign = U, opposite = crank
  const signs: number[] = []
  for (let k = 1; k < pts.length - 1; k++) {
    const [ax, ay] = [pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]]
    const [bx, by] = [pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]]
    const z = ax * by - ay * bx
    if (Math.abs(z) > 1e-6 * (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1)) signs.push(Math.sign(z))
  }
  const code: ShapeCode = closed ? 'E'
    : turns.length === 0 ? 'A'
    : turns.length === 1 ? 'B'
    : turns.length === 2 ? (signs.length === 2 && signs[0] === signs[1] ? 'C' : 'D')
    : 'F'
  return { code, pts, legs, turns, closed }
}

/** One row per run of every cage, in cage order. */
export function bendingSchedule(cages: readonly RebarCage[]): BbsRow[] {
  const out: BbsRow[] = []
  for (const c of cages) {
    for (const r of c.runs) {
      if (r.count <= 0 || r.path.length < 2) continue
      const cut = cutLength(r)
      const w = kgPerM(r.dia)
      out.push({
        mark: r.mark, member: r.member, role: r.role, dia: r.dia, count: r.count,
        shape: bbsShape(r), cutMm: cut, totalM: (r.count * cut) / 1000, kgPerM: w,
        kg: ((r.count * cut) / 1000) * w,
      })
    }
  }
  return out
}

/** Round a leg to the 5 mm a bender works to. */
const r5 = (mm: number) => Math.round(mm / 5) * 5

/** The key two bars must share to be one type. */
export function shapeKey(r: Pick<BbsRow, 'dia' | 'shape' | 'role'>): string {
  const legs = r.shape.legs.map(r5)
  // a bar read from either end is the same bar
  const fwd = legs.join(','), rev = [...legs].reverse().join(',')
  return `${r.dia}|${r.shape.code}|${r.shape.closed ? 'c' : 'o'}|${fwd < rev ? fwd : rev}`
}

/** Spreadsheet-style labels: A … Z, AA, AB, … */
export function typeLabel(i: number): string {
  let s = '', k = i
  do { s = String.fromCharCode(65 + (k % 26)) + s; k = Math.floor(k / 26) - 1 } while (k >= 0)
  return s
}

/**
 * Group identical bars into schedule types, largest Ø first and longest
 * first within a Ø — the order bars are cut in, heavy stock first.
 */
export function scheduleTypes(rows: readonly BbsRow[]): BbsType[] {
  const by = new Map<string, BbsRow[]>()
  for (const r of rows) {
    const k = shapeKey(r)
    const list = by.get(k) ?? []
    list.push(r); by.set(k, list)
  }
  const groups = [...by.values()].sort((a, b) => b[0].dia - a[0].dia || b[0].cutMm - a[0].cutMm)
  return groups.map((g, i) => {
    const count = g.reduce((s, r) => s + r.count, 0)
    const totalM = g.reduce((s, r) => s + r.totalM, 0)
    const f = g[0]
    return {
      type: typeLabel(i), role: f.role, dia: f.dia, count, shape: f.shape,
      cutMm: f.cutMm, totalM, kgPerM: f.kgPerM, kg: totalM * f.kgPerM,
      members: [...new Set(g.map((r) => r.member))],
      marks: [...new Set(g.map((r) => r.mark))],
    }
  })
}

/** Total fabricated weight, kg — equal to Σ runWeight over the same cages. */
export const scheduleWeight = (rows: readonly { kg: number }[]) => rows.reduce((s, r) => s + r.kg, 0)
