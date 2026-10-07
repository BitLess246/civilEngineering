// ─────────────────────────────────────────────────────────────────────────
// THE REST OF A SINGLE-PLATE SHEAR CONNECTION — what the bolts alone do not
// settle. `steelConnections` sizes the bolt column (shear, bearing, tear-out)
// and these check the plate, its welds and a coped beam behind it:
//
//   plate   §J4.2(a) shear yielding, §J4.2(b) shear rupture, §J4.3 block
//           shear, and flexure at the bolt line — yielding with shear
//           interaction (AISC Manual Part 10, Eq. 10-5), rupture on the net
//           plastic modulus, and buckling of the plate as a cantilever
//           (Manual Part 9, λ and Q, Eq. 9-18 – 9-20, c = a)
//   welds   two fillets along the support face by the elastic line method
//           (V and the moment V·a about the weld line), the Table J2.4
//           minimum leg, and the base metal on both sides of the weld:
//           §J4.2(b) shear rupture of the tab and of the support
//   coped   the reduced section at the cope: §J4.2 shear yielding and
//           rupture, flexural rupture on Znet, and local web buckling
//           (Manual Part 9, top flange coped: Fcr = Q·Fy, Eq. 9-7 – 9-11)
//
// Every function is pure and returns its numbers, so the worked solution and
// the drawing state what was checked rather than re-deriving it.
// Units: mm, MPa, kN, kN·mm (moments) unless named otherwise.
// ─────────────────────────────────────────────────────────────────────────
import type { BoltGroup, ShearTab } from './steelConnections'
import { minFilletSize, shearTabBlockShear, type BlockShearCase } from './steelDesign'
import { solveWeldedConnection } from './weldedConnection'

const PHI_V_YIELD = 1.0     // §J4.2(a)
const PHI_V_RUPT = 0.75     // §J4.2(b)
const PHI_B = 0.9           // flexural yielding / buckling
const PHI_RUPT = 0.75       // flexural rupture, block shear
const PHI_WELD = 0.75       // §J2.4

export const holeDiameter = (db: number) => db + 2   // standard hole, Table J3.3M

/** Manual Part 9 slenderness of a plate or coped web acting as a cantilever:
 *  λ = ho·√Fy / (10·t·√(475 + 280(ho/c)²)), Fy in ksi (converted here). */
export function cantileverLambda(ho: number, t: number, c: number, Fy: number): number {
  const FyKsi = Fy / 6.894757
  return (ho * Math.sqrt(FyKsi)) / (10 * t * Math.sqrt(475 + 280 * (ho / Math.max(c, 1e-9)) ** 2))
}
/** Manual Part 9 reduction: Q = 1 (λ ≤ 0.7), 1.34 − 0.486λ (≤ 1.41), 1.30/λ². */
export function qFactor(lambda: number): number {
  if (lambda <= 0.7) return 1
  if (lambda <= 1.41) return 1.34 - 0.486 * lambda
  return 1.3 / (lambda * lambda)
}

/** Plastic modulus of a rectangle h × t about mid-height with the holes taken
 *  out — each hole at y (from mid-height) removes t·dh·|y|, or t·dh²/4 where
 *  it straddles the axis. */
export function netPlasticModulus(h: number, t: number, holeYs: number[], dh: number): number {
  const removed = holeYs.reduce((s, y) => s + (Math.abs(y) < dh / 2 ? t * (dh * dh / 4 + y * y) : t * dh * Math.abs(y)), 0)
  return (t * h * h) / 4 - removed
}

export interface TabFlexure {
  /** Weld line → bolt line, mm, and the moment there, kN·mm. */
  a: number; Mu: number
  Z: number; Znet: number; S: number
  /** Eq. 10-5: (Vu/φVy)² + (Mu/φFyZ)². */
  interaction: number
  phiMnRupture: number      // 0.75·Fu·Znet, kN·mm
  lambda: number; Q: number; Fcr: number
  phiMnBuckling: number     // 0.9·Fcr·S, kN·mm
  util: number
}

export interface TabPlateChecks {
  t: number; h: number; Fy: number; Fu: number
  phiVy: number              // §J4.2(a), kN
  Anv: number; phiVr: number // §J4.2(b), mm² / kN
  blockShear: BlockShearCase  // the governing §J4.3 case
  flexure: TabFlexure
  util: number
  governs: 'shear yielding' | 'shear rupture' | 'block shear' | 'flexure (yield + shear)' | 'flexural rupture' | 'plate buckling'
  ok: boolean
}

/** Every plate limit state of a single-column shear tab carrying Vu (kN)
 *  delivered at the bolt line, welded along x = 0. Fy/Fu: the plate's. */
export function tabPlateChecks(bolts: BoltGroup, tab: ShearTab, Vu: number, Fy = 248, Fu = 400): TabPlateChecks {
  const t = tab.t, h = tab.hMm, dh = holeDiameter(bolts.dia)
  const n = bolts.locations.length
  const phiVy = (PHI_V_YIELD * 0.6 * Fy * t * h) / 1000
  const Anv = Math.max(0, (h - n * dh) * t)
  const phiVr = (PHI_V_RUPT * 0.6 * Fu * Anv) / 1000

  // §J4.3: the tab is pushed DOWN by the bolts; both cases, the weaker governs
  const ys = bolts.locations.map((b) => b.y)
  const a = Math.max(...bolts.locations.map((b) => b.x))
  const cases = shearTabBlockShear(n, bolts.pitchMm, h - Math.max(...ys), Math.min(...ys), tab.wMm - a, bolts.dia, t, Fy, Fu)
  const blockShear = cases.reduce((m, c) => (c.phiRn < m.phiRn ? c : m))

  // flexure at the bolt line: Mu = Vu·a on the gross and net plate
  const Mu = Vu * a
  const Z = (t * h * h) / 4, S = (t * h * h) / 6
  const Znet = netPlasticModulus(h, t, ys.map((y) => y - h / 2), dh)
  const interaction = (Vu / phiVy) ** 2 + (Mu / ((PHI_B * Fy * Z) / 1000)) ** 2
  const phiMnRupture = (PHI_RUPT * Fu * Znet) / 1000
  const lambda = cantileverLambda(h, t, a, Fy), Q = qFactor(lambda), Fcr = Q * Fy
  const phiMnBuckling = (PHI_B * Fcr * S) / 1000
  const flexUtil = Math.max(Math.sqrt(interaction), Mu / phiMnRupture, Mu / phiMnBuckling)
  const flexure: TabFlexure = { a, Mu, Z, Znet, S, interaction, phiMnRupture, lambda, Q, Fcr, phiMnBuckling, util: flexUtil }

  const ratios: [number, TabPlateChecks['governs']][] = [
    [Vu / phiVy, 'shear yielding'], [Vu / phiVr, 'shear rupture'], [Vu / blockShear.phiRn, 'block shear'],
    [Math.sqrt(interaction), 'flexure (yield + shear)'], [Mu / phiMnRupture, 'flexural rupture'], [Mu / phiMnBuckling, 'plate buckling'],
  ]
  const [util, governs] = ratios.reduce((m, r) => (r[0] > m[0] ? r : m))
  return { t, h, Fy, Fu, phiVy, Anv, phiVr, blockShear, flexure, util, governs, ok: util <= 1 + 1e-9 }
}

export interface TabWeldCheck {
  /** Fillet leg on each face of the tab, mm; electrode strength, MPa. */
  w: number; FEXX: number; L: number
  /** Resultant per unit length at the governing end of the weld line —
   *  both fillets together — and its design strength, N/mm. */
  fMax: number; phiWeld: number
  /** §J4.2(b) base metal, N/mm: the tab (one shear plane through t, the two
   *  fillets on its faces) and the support (the weld force passes into it on
   *  two planes through its thickness — halved where a tab lands opposite). */
  phiTab: number; phiSupport: number
  tSupport: number; FuSupport: number
  /** Table J2.4 minimum leg for the thinner part. */
  wMin: number
  util: number
  governs: 'weld' | 'tab base metal' | 'support base metal' | 'minimum size'
  ok: boolean
}

/** The tab's two fillets along x = 0, carrying Vu at the bolt line. `others`:
 *  the weld force per unit length another tab puts into the SAME support
 *  element opposite this one, N/mm — the support's base metal carries both. */
export function tabWeldCheck(
  bolts: BoltGroup, tab: ShearTab, Vu: number, w: number,
  support: { t: number; Fu: number }, FEXX = 482, tabFu = 400, others = 0,
): TabWeldCheck {
  const L = tab.hMm
  const a = Math.max(...bolts.locations.map((b) => b.x))
  const r = solveWeldedConnection({
    segments: [{ id: 'W', x1: 0, y1: 0, x2: 0, y2: L }], size: 2 * w, FEXX, phi: PHI_WELD,
    load: { P: Vu, angleDeg: -90, px: a, py: L / 2 },
  })
  const fMax = r.fMax, phiWeld = r.capacityPerLen
  const phiTab = PHI_V_RUPT * 0.6 * tabFu * tab.t
  const phiSupport = 2 * PHI_V_RUPT * 0.6 * support.Fu * support.t
  const wMin = minFilletSize(Math.min(tab.t, support.t))
  const ratios: [number, TabWeldCheck['governs']][] = [
    [fMax / phiWeld, 'weld'], [fMax / phiTab, 'tab base metal'], [(fMax + others) / phiSupport, 'support base metal'],
  ]
  const [util, gov] = ratios.reduce((m, q) => (q[0] > m[0] ? q : m))
  const sizeOk = w >= wMin - 1e-9
  return {
    w, FEXX, L, fMax, phiWeld, phiTab, phiSupport, tSupport: support.t, FuSupport: support.Fu, wMin, util,
    governs: sizeOk ? gov : 'minimum size', ok: sizeOk && util <= 1 + 1e-9,
  }
}

/** The smallest fillet (whole mm, from the Table J2.4 minimum up) whose weld
 *  line passes, and its check. Base-metal limits do not move with w, so a
 *  thin tab or support fails here whatever the weld. */
export function sizeTabWeld(
  bolts: BoltGroup, tab: ShearTab, Vu: number, support: { t: number; Fu: number }, FEXX = 482, tabFu = 400,
): TabWeldCheck {
  let w = minFilletSize(Math.min(tab.t, support.t))
  let c = tabWeldCheck(bolts, tab, Vu, w, support, FEXX, tabFu)
  for (; c.fMax > c.phiWeld + 1e-9 && w < 25; w++) c = tabWeldCheck(bolts, tab, Vu, w + 1, support, FEXX, tabFu)
  return c
}

export interface CopedBeamChecks {
  d: number; dc: number; c: number; ho: number; tw: number
  /** Distance from the support face to the face of the cope, mm, and the
   *  moment there, kN·mm. */
  e: number; Mu: number
  Snet: number; Znet: number
  phiVy: number; phiVr: number
  lambda: number; Q: number; Fcr: number
  phiMnBuckling: number; phiMnRupture: number
  util: number
  governs: 'shear yielding' | 'shear rupture' | 'local web buckling' | 'flexural rupture'
  ok: boolean
}

/** Elastic and plastic section moduli of the tee left under a top-flange cope:
 *  the web up to ho and the bottom flange, about its own neutral axis (S to
 *  the cut top edge, which is the compression fibre under the end reaction). */
export function copedTee(ho: number, tw: number, bf: number, tf: number): { S: number; Z: number; ybar: number; I: number } {
  const hw = Math.max(0, ho - tf)
  const Af = bf * tf, Aw = tw * hw, A = Af + Aw
  const ybar = (Af * tf / 2 + Aw * (tf + hw / 2)) / A               // from the bottom
  const I = (bf * tf ** 3) / 12 + Af * (ybar - tf / 2) ** 2 + (tw * hw ** 3) / 12 + Aw * (tf + hw / 2 - ybar) ** 2
  const S = I / Math.max(ho - ybar, 1e-9)
  // plastic neutral axis: half the area each side
  let yp: number
  if (Af >= A / 2) yp = A / 2 / bf
  else yp = tf + (A / 2 - Af) / tw
  const Z = yp <= tf
    ? bf * yp * yp / 2 + bf * (tf - yp) ** 2 / 2 + Aw * (tf + hw / 2 - yp)
    : Af * (yp - tf / 2) + tw * (yp - tf) ** 2 / 2 + tw * (ho - yp) ** 2 / 2
  return { S, Z, ybar, I }
}

/** The coped end of a beam framing into a girder: the reaction Vu acts at the
 *  support face (13 mm setback), so the cope face sees Vu·(c + 13). */
export function copedBeamChecks(
  beam: { d: number; bf: number; tf: number; tw: number }, cope: { lengthMm: number; depthMm: number },
  bolts: BoltGroup, Vu: number, Fy: number, Fu: number, setback = 13,
): CopedBeamChecks {
  const { d, bf, tf, tw } = beam
  const dc = cope.depthMm, c = cope.lengthMm, ho = d - dc
  const e = c + setback, Mu = Vu * e
  const { S, Z } = copedTee(ho, tw, bf, tf)
  const dh = holeDiameter(bolts.dia)
  const phiVy = (PHI_V_YIELD * 0.6 * Fy * tw * ho) / 1000
  const phiVr = (PHI_V_RUPT * 0.6 * Fu * Math.max(0, ho - bolts.locations.length * dh) * tw) / 1000
  const lambda = cantileverLambda(ho, tw, c, Fy), Q = qFactor(lambda), Fcr = Q * Fy
  const phiMnBuckling = (PHI_B * Fcr * S) / 1000
  const phiMnRupture = (PHI_RUPT * Fu * Z) / 1000
  const ratios: [number, CopedBeamChecks['governs']][] = [
    [Vu / phiVy, 'shear yielding'], [Vu / phiVr, 'shear rupture'],
    [Mu / phiMnBuckling, 'local web buckling'], [Mu / phiMnRupture, 'flexural rupture'],
  ]
  const [util, governs] = ratios.reduce((m, r) => (r[0] > m[0] ? r : m))
  return { d, dc, c, ho, tw, e, Mu, Snet: S, Znet: Z, phiVy, phiVr, lambda, Q, Fcr, phiMnBuckling, phiMnRupture, util, governs, ok: util <= 1 + 1e-9 }
}
