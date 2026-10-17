// ─────────────────────────────────────────────────────────────────────────
// HSS-TO-HSS TRUSS JOINTS — AISC 360-16 Chapter K, §K3 (rectangular HSS).
//
// A welded HSS truss is usually governed at its JOINTS, not its members: the
// web (branch) presses on, or pulls at, the thin face of the chord, and that
// face bends long before the branch reaches its own §D2/§E3 strength. The
// member checks (`steelBrace`) see none of it. This module checks a panel
// point the way Table K3.2 does.
//
// CLASSIFICATION (§K3 user note, Commentary K3): by how each branch's
// punching load P·sinθ is equilibrated —
//   · K: two branches on the same chord face whose perpendicular components
//     are of opposite sense and balance within 20 %; the chord carries little
//     of it in beam shear. The model nodes the branches at the chord's
//     centreline (e = 0), and at a vertical-plus-diagonal N joint of light
//     tubes that makes them OVERLAP, not gap. So the layout is chosen the
//     way a detailer would: as noded if that is a valid gap (g ≥ tb1 + tb2)
//     or overlap (25–100 %); else the eccentricity that gives the minimum
//     gap, or a 25 % overlap — the first inside −0.55 ≤ e/H ≤ 0.25, the band
//     in which the joint moment e causes may be neglected. The layout and
//     its e are reported for the detailer, who may also fix e (`JointInput.e`).
//     Overlapping, the narrower (then thinner, then less loaded) branch laps
//     onto the other;
//   · KT: a vertical between two diagonals, the three balancing within 20 %
//     — Packer (2014), EJ 51(3): gapped, split into two K sub-connections
//     whose utilisations add on the shared branch; overlapped, branch by
//     branch (see the KT block). Reproduces that paper's worked example;
//   · T (perpendicular branch) or Y (inclined) otherwise — the punching load
//     taken out by beam shear in the chord.
//
// LIMIT STATES (Table K3.2, φ in brackets; Pn sinθ unless stated):
//   T, Y   chord wall plastification, β ≤ 0.85 [1.00]
//            Fy·t²·[2η/(1−β) + 4/√(1−β)]·Qf
//          shear yielding (punching), 0.85 < β ≤ 1 − 1/γ, or B/t < 10 [0.95]
//            0.6·Fy·t·B·(2η + 2βeop)
//          local yielding of chord sidewalls, β = 1.0 [1.00]
//            2·Fy·t·(5k + lb),  k = 1.5t (outside corner radius, unknown)
//          local yielding of the branch, uneven load, β > 0.85 [0.95]
//            Pn = Fyb·tb·(2Hb + 2beoi − 4tb)
//   K gap  chord wall plastification, all β [0.90]
//            Fy·t²·(9.8·βeff·√γ)·Qf
//          shear yielding (punching), Bb < B − 2t, not for square branches [0.95]
//            0.6·Fy·t·B·(2η + β + βeop)
//          shear yielding of the chord SIDEWALLS in the gap, §G4 [0.90]
//            Vn = 0.6·Fy·Aw·Cv2, Aw = 2ht, h = H − 3t, against the branch's
//            perpendicular component
//          local yielding of the branch, uneven load — not for square
//            branches, nor when B/t ≥ 15 [0.95]
//            Pn = Fyb·tb·(2Hb + Bb + beoi − 4tb)
//   K over local yielding of the branches, uneven load [0.95], overlapping i:
//            Ov 25–50 %: Fybi·tbi·[(Ov/50)(2Hbi − 4tbi) + beoi + beov]
//            Ov 50–80 %: Fybi·tbi·(2Hbi − 4tbi + beoi + beov)
//            Ov 80–100 %: Fybi·tbi·(2Hbi − 4tbi + Bbi + beov)
//          overlapped j: Pn,i·(Abj·Fybj)/(Abi·Fybi);
//          beov = 10/(Bbj/tbj)·(Fybj·tbj)/(Fybi·tbi)·Bbi ≤ Bbi
// with β = Bb/B, η = lb/B, lb = Hb/sinθ, γ = B/2t, βeop = 5β/γ ≤ β,
// beoi = 10/(B/t)·(Fy·t)/(Fyb·tb)·Bb ≤ Bb, βeff = Σ(Bb + Hb)/(4B), and the
// chord-stress function Qf = 1 (chord face in tension) or
// 1.3 − 0.4·U/β (T, Y) | 1.3 − 0.4·U/βeff (K), ≤ 1.0, U = |Pro/(Fy·Ag)|
// (Eq. K1-1, the chord's axial part — a truss chord's moment at a panel point
// is small and is not carried here), Pro on the side of lower compression.
//
// LIMITS (Table K3.2A) are checked first. A joint outside them — most often a
// shallow diagonal at θ < 30° near a gable's eaves — is not FAILED: Chapter K
// does not cover it, it is detailed with a gusset plate, and the result says
// so as `covered: false`.
//
// Units: mm, MPa, kN; angles in degrees.
// ─────────────────────────────────────────────────────────────────────────
import { shapeByName } from './aiscSections'
import { E_STEEL } from './steelDesign'
/** A rectangular HSS given by its dimensions rather than by catalogue name —
 *  e.g. ASTM A1085, whose design wall is the full nominal t (§B4.2), where
 *  the A500 catalogue carries 0.93t. mm, mm². */
export interface HssDims {
  /** Face width, out of the truss plane. */
  B: number
  /** Depth in the truss plane. */
  H: number
  /** Design wall thickness. */
  t: number
  A: number
}

export interface JointBranch {
  id: string
  shape: string
  /** Geometry in place of the catalogue's `shape`. */
  section?: HssDims
  /** Angle between the branch and the chord, degrees (90 = vertical). */
  theta: number
  /** Which way it runs along the chord from the joint, −1 / +1 (0 vertical);
   *  absent, a pair of inclined branches is taken to fan out either side. */
  lean?: -1 | 0 | 1
  /** Axial force, kN, + tension. */
  P: number
  Fy: number; Fu: number
}
export interface JointInput {
  node: string
  chordShape: string
  /** Geometry in place of the catalogue's `chordShape`. */
  chord?: HssDims
  Fy: number; Fu: number
  /** Chord axial force each side of the joint, kN, + tension. */
  chordN: number[]
  branches: JointBranch[]
  /** The detailer's noding eccentricity, mm (+ away from the branches);
   *  absent, the layout is chosen (see the header). */
  e?: number
}

export interface JointCheck {
  name: string
  clause: string
  /** Demand and design strength, kN (along the branch, or shear for the sidewalls). */
  demand: number
  capacity: number
  util: number
}
export interface BranchResult {
  id: string
  /** How this branch's load is equilibrated. */
  kind: 'K' | 'KT' | 'T' | 'Y'
  checks: JointCheck[]
  util: number
  governs: string
}
export interface JointResult {
  node: string
  chordShape: string
  branches: BranchResult[]
  /** K / KT geometry for the detailer: the (smallest) gap, or the overlap of
   *  the overlapping branch, at noding eccentricity e. */
  gap?: { g: number; e: number; eLimitOk: boolean; kind: 'gap' | 'overlap'; Ov?: number; kt?: boolean }
  /** Chord utilisation U = |Pro/(Fy·Ag)| on the lower-compression side (0 in tension). */
  U: number
  /** Inside the Table K3.2A limits — otherwise not designed here, and `ok`
   *  says nothing about it: it is detailed with a gusset plate instead. */
  covered: boolean
  limitNotes: string[]
  util: number
  governs: string
  ok: boolean
}

type Hss = HssDims
function hssOf(name: string, dims?: HssDims): Hss | null {
  if (dims) return dims
  const s = shapeByName(name)
  if (!s || s.family !== 'HSS' || !s.b || !s.h || !s.t) return null
  // the chord's face width B is the HSS b, its depth in the truss plane H
  return { B: s.b, H: s.h, t: s.t, A: s.A }
}
const rad = (d: number) => (d * Math.PI) / 180

/** The work-point eccentricity that gives gap g between two branches (AISC
 *  Manual Part 8 / Commentary K3): e = (Hb1/2sinθ1 + Hb2/2sinθ2 + g)·sinθ1·sinθ2/sin(θ1+θ2) − H/2. */
export function eccentricityForGap(H: number, Hb1: number, th1: number, Hb2: number, th2: number, g: number): number {
  const s1 = Math.sin(rad(th1)), s2 = Math.sin(rad(th2)), s12 = Math.sin(rad(th1 + th2))
  return (Hb1 / (2 * s1) + Hb2 / (2 * s2) + g) * (s1 * s2) / s12 - H / 2
}

/** The gap between two branches' toes on the chord face at eccentricity e
 *  (negative = an overlap), mm — the inverse of `eccentricityForGap`. */
export function gapAt(H: number, Hb1: number, th1: number, Hb2: number, th2: number, e: number): number {
  const s1 = Math.sin(rad(th1)), s2 = Math.sin(rad(th2)), s12 = Math.sin(rad(th1 + th2))
  return (e + H / 2) * s12 / (s1 * s2) - Hb1 / (2 * s1) - Hb2 / (2 * s2)
}

type Live = { b: JointBranch; s: Hss }

export function designTrussJoint(j: JointInput): JointResult | null {
  const c = hssOf(j.chordShape, j.chord)
  if (!c) return null
  const { B, H, t } = c
  const gamma = B / (2 * t)
  const limitNotes: string[] = []
  // chord-stress: the side of the joint with the LOWER compression stress
  const lowComp = Math.max(...j.chordN)          // most tensile / least compressive, kN
  const Uchord = lowComp >= 0 ? 0 : Math.abs((lowComp * 1000) / (j.Fy * c.A))
  const Qf = (beta: number) => (lowComp >= 0 ? 1 : Math.min(1, 1.3 - (0.4 * Uchord) / beta))

  // ── limits common to every branch (Table K3.2A) ─────────────────────────
  if (B / t > 35 || H / t > 35) limitNotes.push(`chord wall B/t = ${(B / t).toFixed(1)} > 35`)
  if (j.Fy > 360) limitNotes.push(`chord Fy = ${j.Fy} MPa > 360`)
  if (j.Fy / j.Fu > 0.8) limitNotes.push(`chord Fy/Fu = ${(j.Fy / j.Fu).toFixed(2)} > 0.8`)
  if (H / B < 0.5 || H / B > 2) limitNotes.push(`chord H/B = ${(H / B).toFixed(2)} outside 0.5–2.0`)
  const live = j.branches.map((b) => ({ b, s: hssOf(b.shape, b.section) })).filter((x) => x.s && Math.abs(x.b.P) > 1e-6) as Live[]
  for (const { b, s } of live) {
    if (b.theta < 30 - 0.05) limitNotes.push(`${b.id}: θ = ${b.theta.toFixed(1)}° < 30°`)
    const slender = b.P < 0 ? Math.min(35, 1.25 * Math.sqrt(E_STEEL / b.Fy)) : 35
    if (s.B / s.t > slender || s.H / s.t > slender) limitNotes.push(`${b.id}: branch wall b/t = ${(s.B / s.t).toFixed(1)} > ${slender.toFixed(1)}`)
    if (s.H / s.B < 0.5 || s.H / s.B > 2) limitNotes.push(`${b.id}: branch Hb/Bb outside 0.5–2.0`)
    if (b.Fy > 360) limitNotes.push(`${b.id}: Fyb = ${b.Fy} MPa > 360`)
  }

  const mk = (name: string, clause: string, demand: number, capacity: number): JointCheck =>
    ({ name, clause, demand, capacity, util: capacity > 0 ? demand / capacity : Infinity })
  const sinOf = (x: Live) => Math.sin(rad(x.b.theta))
  const perp = (x: Live) => x.b.P * sinOf(x)
  /** The branch's footprint length on the chord face, Hb/sinθ. */
  const foot = (x: Live) => x.s.H / sinOf(x)
  const eLim = (e: number) => e >= -0.55 * H - 1e-9 && e <= 0.25 * H + 1e-9
  // the overlapped (through) branch is the wider, then the thicker; equal
  // tubes, the one with the larger force (Packer 2014; DG24 §8)
  const throughFirst = (x1: Live, x2: Live): [Live, Live] => {
    const w1 = x1.s.B * x1.s.t, w2 = x2.s.B * x2.s.t
    const j1 = Math.abs(w1 - w2) > 1e-9 ? w1 > w2 : Math.abs(x1.b.P) >= Math.abs(x2.b.P)
    return j1 ? [x2, x1] : [x1, x2]          // [overlapping i, overlapped j]
  }
  const beoiOf = (x: Live) => Math.min(x.s.B, (10 / (B / t)) * ((j.Fy * t) / (x.b.Fy * x.s.t)) * x.s.B)
  const beovOf = (xi: Live, xj: Live) => Math.min(xi.s.B, (10 / (xj.s.B / xj.s.t)) * ((xj.b.Fy * xj.s.t) / (xi.b.Fy * xi.s.t)) * xi.s.B)
  /** Overlapping branch i on j: local yielding from uneven load, Pn,i kN by its overlap band (Eqs. K3-15–K3-17). */
  const pnOverlapping = (xi: Live, xj: Live, Ov: number) => {
    const core = 2 * xi.s.H - 4 * xi.s.t, beoi = beoiOf(xi), beov = beovOf(xi, xj)
    const len = Ov < 0.5 ? (Ov / 0.5) * core + beoi + beov : Ov < 0.8 ? core + beoi + beov : core + xi.s.B + beov
    return (xi.b.Fy * xi.s.t * len) / 1000
  }
  const overlapLimits = (xi: Live, xj: Live) => {
    if (xi.s.B / xj.s.B < 0.75) limitNotes.push(`overlapped: ${xi.b.id} on ${xj.b.id}, Bbi/Bbj < 0.75`)
    if (xi.s.t > xj.s.t + 1e-9) limitNotes.push(`overlapped: ${xi.b.id} is thicker than ${xj.b.id}, the branch it laps onto`)
  }
  const overlapCommon = (xs: Live[]) => {
    if (B / t > 30) limitNotes.push(`overlapped K: chord B/t = ${(B / t).toFixed(1)} > 30`)
    for (const x of xs) {
      if (x.s.B / B < 0.25) limitNotes.push(`${x.b.id}: Bb/B = ${(x.s.B / B).toFixed(2)} < 0.25`)
      if (x.b.P < 0 && x.s.B / x.s.t > 1.1 * Math.sqrt(E_STEEL / x.b.Fy)) limitNotes.push(`${x.b.id}: compression branch b/t > 1.1√(E/Fyb)`)
    }
  }
  const overlapCheck = (x: Live, Pn: number, Ov: number, clause = '§K3 Table K3.2 (overlapped K)') =>
    mk(`branch local yielding, overlap ${(Ov * 100).toFixed(0)} %`, clause, Math.abs(x.b.P), 0.95 * Pn)
  /** Gapped K between two branches carrying P1, P2 (kN, + tension — for a KT
   *  sub-connection, the share of each this K takes). */
  const gappedK = (x1: Live, P1: number, x2: Live, P2: number, tag = ''): [JointCheck[], JointCheck[]] => {
    const betaEff = (x1.s.B + x1.s.H + x2.s.B + x2.s.H) / (4 * B)
    if (betaEff < 0.35) limitNotes.push(`K${tag}: βeff = ${betaEff.toFixed(2)} < 0.35`)
    for (const x of [x1, x2]) if (x.s.B / B < 0.1 + gamma / 50) limitNotes.push(`${x.b.id}: Bb/B = ${(x.s.B / B).toFixed(2)} < 0.1 + γ/50`)
    if (Math.min(x1.s.B, x2.s.B) < 0.63 * Math.max(x1.s.B, x2.s.B)) limitNotes.push(`K${tag}: smaller branch width < 0.63 × the larger`)
    const qf = Qf(betaEff)
    const hw = H - 3 * t, Aw = 2 * hw * t
    const lam = 1.1 * Math.sqrt((5 * E_STEEL) / j.Fy)
    const Cv2 = hw / t <= lam ? 1 : lam / (hw / t)
    const phiVn = (0.9 * 0.6 * j.Fy * Aw * Cv2) / 1000
    return ([[x1, P1], [x2, P2]] as const).map(([x, P]) => {
      const sin = sinOf(x), Pu = Math.abs(P)
      const checks: JointCheck[] = []
      checks.push(mk(`chord wall plastification${tag}`, '§K3 Table K3.2 (gapped K)', Pu, (0.9 * j.Fy * t * t * 9.8 * betaEff * Math.sqrt(gamma) * qf) / sin / 1000))
      const square = Math.abs(x.s.B - x.s.H) < 1e-6
      const beta = x.s.B / B, eta = x.s.H / sin / B, betaEop = Math.min(beta, (5 * beta) / gamma)
      if (!square && x.s.B < B - 2 * t)
        checks.push(mk(`shear yielding (punching)${tag}`, '§K3 Table K3.2 (gapped K)', Pu, (0.95 * 0.6 * j.Fy * t * B * (2 * eta + beta + betaEop)) / sin / 1000))
      checks.push(mk(`chord sidewall shear in the gap${tag}`, '§K3 Table K3.2 → §G4', Pu * sin, phiVn))
      if (!square && B / t < 15)
        checks.push(mk(`branch local yielding (uneven load)${tag}`, '§K3 Table K3.2 (gapped K)', Pu, (0.95 * x.b.Fy * x.s.t * (2 * x.s.H + x.s.B + beoiOf(x) - 4 * x.s.t)) / 1000))
      return checks
    }) as [JointCheck[], JointCheck[]]
  }
  const result = (x: Live, kind: BranchResult['kind'], checks: JointCheck[]): BranchResult => {
    const w = checks.reduce((a, q) => (q.util > a.util ? q : a))
    return { id: x.b.id, kind, checks, util: w.util, governs: w.name }
  }

  const branches: BranchResult[] = []
  const handled = new Set<Live>()
  let gap: JointResult['gap']

  // ── KT: a vertical between two diagonals, their punching loads balancing
  // within 20 % (Packer 2014, "HSS Truss Connections with Three Branches",
  // EJ 51(3)). Gapped: the odd-sense branch is split so that each share
  // balances one neighbour, the two K sub-connections are checked by Table
  // K3.2, and that branch's utilisations ADD. Overlapped (the vertical lapping
  // onto both diagonals, the diagonals onto each other): branch by branch —
  // the overlapping diagonal by Eqs. K3-15–17, the vertical with BOTH its
  // transverse faces on branches, Pn = Fyb·tb·(2Hb − 4tb + beov,1 + beov,2)
  // (Packer's Eq. 2), and the through branch at no more of its yield force
  // than the least of the branches lapping onto it (the basis of Eq. K3-18).
  const vert = live.filter((x) => Math.abs(x.b.theta - 90) < 1)
  const diag = live.filter((x) => Math.abs(x.b.theta - 90) >= 1)
  const fanOut = diag.length === 2 && (diag[0].b.lean === undefined || diag[1].b.lean === undefined || diag[0].b.lean * diag[1].b.lean < 0)
  const sumPerp = live.reduce((a, x) => a + perp(x), 0), maxPerp = Math.max(0, ...live.map((x) => Math.abs(perp(x))))
  if (live.length === 3 && vert.length === 1 && fanOut && Math.abs(sumPerp) <= 0.2 * maxPerp + 1e-9) {
    const [a, bb] = diag, v = vert[0]
    const ha = foot(a) / 2, hb = foot(bb) / 2, hv = v.s.H / 2
    const cot = (x: Live) => 1 / Math.tan(rad(x.b.theta))
    // footprints along the chord face at eccentricity e: a to the left of the
    // vertical, b to the right, the vertical centred on the work point
    const at = (e: number) => {
      const ca = -(H / 2 + e) * cot(a), cb = (H / 2 + e) * cot(bb)
      return { A: [ca - ha, ca + ha], V: [-hv, hv], Bf: [cb - hb, cb + hb] }
    }
    const [di, dj] = throughFirst(a, bb)
    const kind = (e: number): { kind: 'gap'; g: number } | { kind: 'overlap'; Ov: number } | null => {
      const f = at(e)
      const gA = f.V[0] - f.A[1], gB = f.Bf[0] - f.V[1]
      if (gA >= a.s.t + v.s.t - 1e-9 && gB >= bb.s.t + v.s.t - 1e-9) return { kind: 'gap', g: Math.min(gA, gB) }
      const Ov = (f.A[1] - f.Bf[0]) / foot(di)
      // the vertical wholly on the two diagonals, which overlap 25–100 %
      if (Ov >= 0.25 - 1e-9 && Ov <= 1 + 1e-9 && f.V[0] >= f.A[0] - 1e-9 && f.V[1] <= f.Bf[1] + 1e-9) return { kind: 'overlap', Ov: Math.min(1, Ov) }
      return null
    }
    let e: number | null = null
    if (j.e !== undefined) { if (kind(j.e)) e = j.e }
    else if (kind(0)) e = 0
    else {
      // the least e that opens both gaps; else a 25 % diagonal overlap
      const eg = Math.max((a.s.t + v.s.t + ha + hv) / cot(a), (bb.s.t + v.s.t + hb + hv) / cot(bb)) - H / 2
      const eo = eccentricityForGap(H, a.s.H, a.b.theta, bb.s.H, bb.b.theta, -0.25 * foot(di))
      if (eLim(eg) && kind(eg)?.kind === 'gap') e = eg
      else if (eLim(eo) && kind(eo)?.kind === 'overlap') e = eo
    }
    const lay = e === null ? null : kind(e)
    if (e === null || !lay) limitNotes.push(`KT: no layout with both gaps open nor the vertical lapping onto two diagonals overlapping 25–100 %${j.e !== undefined ? ` at the given e = ${j.e.toFixed(0)} mm` : ' within −0.55H ≤ e ≤ 0.25H'}`)
    else {
      if (!eLim(e)) limitNotes.push(`KT: e = ${e.toFixed(0)} mm outside −0.55H ≤ e ≤ 0.25H`)
      gap = lay.kind === 'gap'
        ? { g: lay.g, e, eLimitOk: eLim(e), kind: 'gap', kt: true }
        : { g: -lay.Ov * foot(di), e, eLimitOk: eLim(e), kind: 'overlap', Ov: lay.Ov, kt: true }
      if (lay.kind === 'overlap') {
        const f = at(e)
        // what each transverse face of the vertical lands on: the
        // overlapping diagonal where it reaches, else the through one
        const on = (x0: number) => (x0 >= (di === a ? f.A : f.Bf)[0] - 1e-9 && x0 <= (di === a ? f.A : f.Bf)[1] + 1e-9 ? di : dj)
        const vL = on(f.V[0]), vR = on(f.V[1])
        overlapCommon([a, bb, v])
        overlapLimits(di, dj); overlapLimits(v, vL); if (vR !== vL) overlapLimits(v, vR)
        const PnI = pnOverlapping(di, dj, lay.Ov)
        const PnV = (v.b.Fy * v.s.t * (2 * v.s.H - 4 * v.s.t + beovOf(v, vL) + beovOf(v, vR))) / 1000
        const ay = (x: Live) => x.s.A * x.b.Fy
        const PnJ = ay(dj) * Math.min(PnI / ay(di), PnV / ay(v))
        branches.push(result(di, 'KT', [overlapCheck(di, PnI, lay.Ov)]))
        branches.push(result(v, 'KT', [overlapCheck(v, PnV, 1, '§K3 Table K3.2, KT (Packer 2014, Eq. 2)')]))
        branches.push(result(dj, 'KT', [overlapCheck(dj, PnJ, lay.Ov, '§K3 Eq. K3-18, KT')]))
      } else {
        // the odd-sense branch o balances its two neighbours, in proportion
        const sgn = live.map((x) => Math.sign(perp(x)))
        const o = live.find((_, k) => sgn.filter((s) => s === sgn[k]).length === 1)!
        const others = live.filter((x) => x !== o)
        const sumO = others.reduce((s, x) => s + perp(x), 0)
        const shares: { checks: JointCheck[]; util: number }[] = []
        const otherChecks = new Map<Live, JointCheck[]>()
        for (const n of others) {
          const Po = o.b.P * (perp(n) / sumO)
          const [co, cn] = gappedK(o, Po, n, n.b.P, ` (with ${n.b.id})`)
          shares.push({ checks: co, util: Math.max(...co.map((q) => q.util)) })
          otherChecks.set(n, cn)
        }
        for (const n of others) branches.push(result(n, 'KT', otherChecks.get(n)!))
        const total = shares.reduce((s, x) => s + x.util, 0)
        branches.push({ id: o.b.id, kind: 'KT', checks: shares.flatMap((x) => x.checks), util: total, governs: 'the two K sub-connections, utilisations added (Packer 2014)' })
      }
    }
    for (const x of live) handled.add(x)
  }

  // ── K: the best-balanced opposite-sense pair ────────────────────────────
  let pair: [Live, Live] | null = null, best = Infinity
  if (!handled.size) for (let p = 0; p < live.length; p++) for (let k = p + 1; k < live.length; k++) {
    const pa = perp(live[p]), pk = perp(live[k])
    if (pa * pk >= 0) continue
    const imbalance = Math.abs(pa + pk) / Math.max(Math.abs(pa), Math.abs(pk))
    if (imbalance <= 0.2 + 1e-9 && imbalance < best) { best = imbalance; pair = [live[p], live[k]] }
  }

  if (pair) {
    const [x1, x2] = pair
    const gMin = x1.s.t + x2.s.t
    const [xi, xj] = throughFirst(x1, x2)
    const p = foot(xi)
    // how the detailer makes the joint: as noded (e = 0) if that is a valid
    // gap or overlap; else the eccentricity that gives the minimum gap, or a
    // 25 % overlap — whichever stays inside −0.55H ≤ e ≤ 0.25H
    type Layout = { kind: 'gap'; g: number; e: number } | { kind: 'overlap'; Ov: number; e: number }
    const layoutAt = (e: number): Layout | null => {
      const g = gapAt(H, x1.s.H, x1.b.theta, x2.s.H, x2.b.theta, e)
      if (g >= gMin - 1e-9) return { kind: 'gap', g, e }
      if (-g / p >= 0.25 - 1e-9 && -g / p <= 1 + 1e-9) return { kind: 'overlap', Ov: Math.min(1, -g / p), e }
      return null
    }
    let layout = layoutAt(j.e ?? 0)
    if (j.e === undefined && !layout) {
      const eg = eccentricityForGap(H, x1.s.H, x1.b.theta, x2.s.H, x2.b.theta, gMin)
      const eo = eccentricityForGap(H, x1.s.H, x1.b.theta, x2.s.H, x2.b.theta, -0.25 * p)
      if (eLim(eg)) layout = { kind: 'gap', g: gMin, e: eg }
      else if (eLim(eo)) layout = { kind: 'overlap', Ov: 0.25, e: eo }
    }
    const g0 = gapAt(H, x1.s.H, x1.b.theta, x2.s.H, x2.b.theta, j.e ?? 0)
    if (!layout) limitNotes.push(`K: no gap ≥ ${gMin.toFixed(1)} mm nor a 25–100 % overlap ${j.e !== undefined ? `at the given e = ${j.e.toFixed(0)} mm` : 'within −0.55H ≤ e ≤ 0.25H'} (g = ${g0.toFixed(0)} mm ${j.e !== undefined ? 'there' : 'as noded'})`)
    else if (!eLim(layout.e)) limitNotes.push(`K: e = ${layout.e.toFixed(0)} mm outside −0.55H ≤ e ≤ 0.25H`)
    gap = layout ? { g: layout.kind === 'gap' ? layout.g : -layout.Ov * p, e: layout.e, eLimitOk: eLim(layout.e), kind: layout.kind, Ov: layout.kind === 'overlap' ? layout.Ov : undefined } : undefined

    if (layout?.kind === 'gap') {
      const [c1, c2] = gappedK(x1, x1.b.P, x2, x2.b.P)
      branches.push(result(x1, 'K', c1), result(x2, 'K', c2))
    } else if (layout?.kind === 'overlap') {
      // overlapped K (Table K3.2): local yielding of the branches from uneven
      // load, the overlapping branch i by its overlap band, the overlapped
      // branch j in proportion to its own yield force (Eq. K3-18)
      overlapCommon([xi, xj]); overlapLimits(xi, xj)
      const PnI = pnOverlapping(xi, xj, layout.Ov)
      const PnJ = PnI * (xj.s.A * xj.b.Fy) / (xi.s.A * xi.b.Fy)
      branches.push(result(xi, 'K', [overlapCheck(xi, PnI, layout.Ov)]), result(xj, 'K', [overlapCheck(xj, PnJ, layout.Ov)]))
    }
    handled.add(x1); handled.add(x2)
  }

  // ── every other loaded branch: T (perpendicular) or Y (inclined) ─────────
  live.forEach((x) => {
    if (handled.has(x)) return
    const sin = Math.sin(rad(x.b.theta)), Pu = Math.abs(x.b.P)
    const beta = x.s.B / B, lb = x.s.H / sin, eta = lb / B
    if (beta < 0.25) limitNotes.push(`${x.b.id}: Bb/B = ${beta.toFixed(2)} < 0.25`)
    const betaEop = Math.min(beta, (5 * beta) / gamma)
    const qf = Qf(beta)
    const checks: JointCheck[] = []
    if (beta <= 0.85)
      checks.push(mk('chord wall plastification', '§K3 Table K3.2 (T, Y)', Pu, (1.0 * j.Fy * t * t * ((2 * eta) / (1 - beta) + 4 / Math.sqrt(1 - beta)) * qf) / sin / 1000))
    if ((beta > 0.85 && beta <= 1 - 1 / gamma) || B / t < 10)
      checks.push(mk('shear yielding (punching)', '§K3 Table K3.2 (T, Y)', Pu, (0.95 * 0.6 * j.Fy * t * B * (2 * eta + 2 * betaEop)) / sin / 1000))
    if (beta >= 0.99)
      checks.push(mk('chord sidewall local yielding', '§K3 Table K3.2 (T, Y)', Pu, (1.0 * 2 * j.Fy * t * (5 * 1.5 * t + lb)) / sin / 1000))
    if (beta > 0.85) {
      const beoi = Math.min(x.s.B, (10 / (B / t)) * ((j.Fy * t) / (x.b.Fy * x.s.t)) * x.s.B)
      checks.push(mk('branch local yielding (uneven load)', '§K3 Table K3.2 (T, Y)', Pu, (0.95 * x.b.Fy * x.s.t * (2 * x.s.H + 2 * beoi - 4 * x.s.t)) / 1000))
    }
    if (!checks.length) return
    const w = checks.reduce((a, q) => (q.util > a.util ? q : a))
    branches.push({ id: x.b.id, kind: Math.abs(x.b.theta - 90) < 1e-6 ? 'T' : 'Y', checks, util: w.util, governs: w.name })
  })

  const covered = limitNotes.length === 0
  const worst = branches.reduce<BranchResult | null>((a, b) => (!a || b.util > a.util ? b : a), null)
  return {
    node: j.node, chordShape: j.chordShape, branches, gap, U: Uchord, covered, limitNotes,
    util: worst?.util ?? 0, governs: worst ? `${worst.id}: ${worst.governs}` : '—',
    // a joint outside the limits is not designed here — not failed (`covered`)
    ok: !covered || (worst?.util ?? 0) <= 1 + 1e-9,
  }
}
