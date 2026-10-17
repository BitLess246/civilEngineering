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
//     its e are reported for the detailer;
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

export interface JointBranch {
  id: string
  shape: string
  /** Angle between the branch and the chord, degrees (90 = vertical). */
  theta: number
  /** Axial force, kN, + tension. */
  P: number
  Fy: number; Fu: number
}
export interface JointInput {
  node: string
  chordShape: string
  Fy: number; Fu: number
  /** Chord axial force each side of the joint, kN, + tension. */
  chordN: number[]
  branches: JointBranch[]
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
  kind: 'K' | 'T' | 'Y'
  checks: JointCheck[]
  util: number
  governs: string
}
export interface JointResult {
  node: string
  chordShape: string
  branches: BranchResult[]
  /** Gapped-K geometry for the detailer, when the joint has a K pair. */
  gap?: { g: number; e: number; eLimitOk: boolean; kind: 'gap' | 'overlap'; Ov?: number }
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

type Hss = { B: number; H: number; t: number; A: number }
function hssOf(name: string): Hss | null {
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

export function designTrussJoint(j: JointInput): JointResult | null {
  const c = hssOf(j.chordShape)
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
  const live = j.branches.map((b) => ({ b, s: hssOf(b.shape) })).filter((x) => x.s && Math.abs(x.b.P) > 1e-6) as { b: JointBranch; s: Hss }[]
  for (const { b, s } of live) {
    if (b.theta < 30 - 0.05) limitNotes.push(`${b.id}: θ = ${b.theta.toFixed(1)}° < 30°`)
    const slender = b.P < 0 ? Math.min(35, 1.25 * Math.sqrt(E_STEEL / b.Fy)) : 35
    if (s.B / s.t > slender || s.H / s.t > slender) limitNotes.push(`${b.id}: branch wall b/t = ${(s.B / s.t).toFixed(1)} > ${slender.toFixed(1)}`)
    if (s.H / s.B < 0.5 || s.H / s.B > 2) limitNotes.push(`${b.id}: branch Hb/Bb outside 0.5–2.0`)
    if (b.Fy > 360) limitNotes.push(`${b.id}: Fyb = ${b.Fy} MPa > 360`)
  }

  // ── classification: the best-balanced opposite-sense pair is a K ─────────
  const perp = (x: { b: JointBranch }) => x.b.P * Math.sin(rad(x.b.theta))
  let pair: [number, number] | null = null, best = Infinity
  for (let a = 0; a < live.length; a++) for (let k = a + 1; k < live.length; k++) {
    const pa = perp(live[a]), pk = perp(live[k])
    if (pa * pk >= 0) continue
    const imbalance = Math.abs(pa + pk) / Math.max(Math.abs(pa), Math.abs(pk))
    if (imbalance <= 0.2 + 1e-9 && imbalance < best) { best = imbalance; pair = [a, k] }
  }

  const branches: BranchResult[] = []
  const mk = (name: string, clause: string, demand: number, capacity: number): JointCheck =>
    ({ name, clause, demand, capacity, util: capacity > 0 ? demand / capacity : Infinity })
  let gap: JointResult['gap']

  if (pair) {
    const [x1, x2] = pair.map((i) => live[i])
    const comp = x1.b.P < 0 ? x1 : x2, tens = comp === x1 ? x2 : x1
    const g0 = gapAt(H, x1.s.H, x1.b.theta, x2.s.H, x2.b.theta, 0)
    const gMin = comp.s.t + tens.s.t
    // the overlapping branch i laps onto the overlapped (through) branch j:
    // j is the wider, then the thicker (Commentary K3)
    const [xi, xj] = (x1.s.B * x1.s.t < x2.s.B * x2.s.t) ? [x1, x2] : [x2, x1]
    const p = xi.s.H / Math.sin(rad(xi.b.theta))
    const eLim = (e: number) => e >= -0.55 * H - 1e-9 && e <= 0.25 * H + 1e-9
    // how the detailer makes the joint: as noded (e = 0) if that is a valid
    // gap or overlap; else the eccentricity that gives the minimum gap, or a
    // 25 % overlap — whichever stays inside −0.55H ≤ e ≤ 0.25H
    let layout: { kind: 'gap'; g: number; e: number } | { kind: 'overlap'; Ov: number; e: number } | null = null
    if (g0 >= gMin - 1e-9) layout = { kind: 'gap', g: g0, e: 0 }
    else if (-g0 / p >= 0.25 - 1e-9 && -g0 / p <= 1 + 1e-9) layout = { kind: 'overlap', Ov: -g0 / p, e: 0 }
    else {
      const eg = eccentricityForGap(H, x1.s.H, x1.b.theta, x2.s.H, x2.b.theta, gMin)
      const eo = eccentricityForGap(H, x1.s.H, x1.b.theta, x2.s.H, x2.b.theta, -0.25 * p)
      if (eLim(eg)) layout = { kind: 'gap', g: gMin, e: eg }
      else if (eLim(eo)) layout = { kind: 'overlap', Ov: 0.25, e: eo }
    }
    if (!layout) limitNotes.push(`K: no gap ≥ ${gMin.toFixed(1)} mm nor a 25–100 % overlap within −0.55H ≤ e ≤ 0.25H (as noded g = ${g0.toFixed(0)} mm)`)
    gap = layout ? { g: layout.kind === 'gap' ? layout.g : -layout.Ov * p, e: layout.e, eLimitOk: true, kind: layout.kind, Ov: layout.kind === 'overlap' ? layout.Ov : undefined } : undefined

    if (layout?.kind === 'gap') {
      const betaEff = (comp.s.B + comp.s.H + tens.s.B + tens.s.H) / (4 * B)
      if (betaEff < 0.35) limitNotes.push(`K: βeff = ${betaEff.toFixed(2)} < 0.35`)
      for (const x of [x1, x2]) if (x.s.B / B < 0.1 + gamma / 50) limitNotes.push(`${x.b.id}: Bb/B = ${(x.s.B / B).toFixed(2)} < 0.1 + γ/50`)
      const bSmall = Math.min(x1.s.B, x2.s.B), bLarge = Math.max(x1.s.B, x2.s.B)
      if (bSmall < 0.63 * bLarge) limitNotes.push('K: smaller branch width < 0.63 × the larger')
      const qf = Qf(betaEff)
      const hw = H - 3 * t, Aw = 2 * hw * t
      const lam = 1.1 * Math.sqrt((5 * E_STEEL) / j.Fy)
      const Cv2 = hw / t <= lam ? 1 : lam / (hw / t)
      const phiVn = (0.9 * 0.6 * j.Fy * Aw * Cv2) / 1000
      for (const x of [x1, x2]) {
        const sin = Math.sin(rad(x.b.theta)), Pu = Math.abs(x.b.P)
        const checks: JointCheck[] = []
        checks.push(mk('chord wall plastification', '§K3 Table K3.2 (gapped K)', Pu, (0.9 * j.Fy * t * t * 9.8 * betaEff * Math.sqrt(gamma) * qf) / sin / 1000))
        const square = Math.abs(x.s.B - x.s.H) < 1e-6
        const beta = x.s.B / B, eta = x.s.H / sin / B, betaEop = Math.min(beta, (5 * beta) / gamma)
        if (!square && x.s.B < B - 2 * t)
          checks.push(mk('shear yielding (punching)', '§K3 Table K3.2 (gapped K)', Pu, (0.95 * 0.6 * j.Fy * t * B * (2 * eta + beta + betaEop)) / sin / 1000))
        checks.push(mk('chord sidewall shear in the gap', '§K3 Table K3.2 → §G4', Pu * sin, phiVn))
        if (!square && B / t < 15) {
          const beoi = Math.min(x.s.B, (10 / (B / t)) * ((j.Fy * t) / (x.b.Fy * x.s.t)) * x.s.B)
          checks.push(mk('branch local yielding (uneven load)', '§K3 Table K3.2 (gapped K)', Pu, (0.95 * x.b.Fy * x.s.t * (2 * x.s.H + x.s.B + beoi - 4 * x.s.t)) / 1000))
        }
        const w = checks.reduce((a, q) => (q.util > a.util ? q : a))
        branches.push({ id: x.b.id, kind: 'K', checks, util: w.util, governs: w.name })
      }
    } else if (layout?.kind === 'overlap') {
      // overlapped K (Table K3.2): local yielding of the branches from uneven
      // load, the overlapping branch i by its overlap band, the overlapped
      // branch j in proportion to its own yield force
      if (B / t > 30) limitNotes.push(`overlapped K: chord B/t = ${(B / t).toFixed(1)} > 30`)
      if (xi.s.B / xj.s.B < 0.75) limitNotes.push('overlapped K: Bbi/Bbj < 0.75')
      if (xi.s.t > xj.s.t + 1e-9) limitNotes.push('overlapped K: the overlapping branch is thicker than the overlapped one')
      for (const x of [xi, xj]) if (x.s.B / B < 0.25) limitNotes.push(`${x.b.id}: Bb/B = ${(x.s.B / B).toFixed(2)} < 0.25`)
      if (comp.s.B / comp.s.t > 1.1 * Math.sqrt(E_STEEL / comp.b.Fy)) limitNotes.push(`${comp.b.id}: compression branch b/t > 1.1√(E/Fyb)`)
      const Ov = layout.Ov
      const beoi = Math.min(xi.s.B, (10 / (B / t)) * ((j.Fy * t) / (xi.b.Fy * xi.s.t)) * xi.s.B)
      const beov = Math.min(xi.s.B, (10 / (xj.s.B / xj.s.t)) * ((xj.b.Fy * xj.s.t) / (xi.b.Fy * xi.s.t)) * xi.s.B)
      const core = 2 * xi.s.H - 4 * xi.s.t
      const len = Ov < 0.5 ? (Ov / 0.5) * core + beoi + beov : Ov < 0.8 ? core + beoi + beov : core + xi.s.B + beov
      const PnI = (xi.b.Fy * xi.s.t * len) / 1000
      const PnJ = PnI * (xj.s.A * xj.b.Fy) / (xi.s.A * xi.b.Fy)
      for (const [x, Pn] of [[xi, PnI], [xj, PnJ]] as const) {
        const c1 = mk(`branch local yielding, overlap ${(Ov * 100).toFixed(0)} %`, '§K3 Table K3.2 (overlapped K)', Math.abs(x.b.P), 0.95 * Pn)
        branches.push({ id: x.b.id, kind: 'K', checks: [c1], util: c1.util, governs: c1.name })
      }
    }
  }

  // ── every other loaded branch: T (perpendicular) or Y (inclined) ─────────
  live.forEach((x, idx) => {
    if (pair && pair.includes(idx)) return
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
