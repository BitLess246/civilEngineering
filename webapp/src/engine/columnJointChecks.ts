// ─────────────────────────────────────────────────────────────────────────
// THE COLUMN UNDER A MOMENT CONNECTION — AISC 360-16 §J10.
//
// A beam welded to a column flange delivers its moment as a flange-force
// couple Pf = Mu/(d − tf): the tension flange pulls the column flange (§J10.1
// local bending, §J10.2 web yielding), the compression flange pushes it
// (§J10.2 yielding, §J10.3 crippling, and §J10.5 web buckling where beams on
// BOTH flanges push the web from either side), and the panel between the
// flanges carries the couple in shear (§J10.6). Where a limit state falls short
// the column is stiffened: a pair of transverse stiffeners (continuity plates)
// at each beam-flange level carries the difference (§J10.7, detailed per
// §J10.8), and a web doubler plate makes up the panel zone (§J10.9).
//
// Pure: every number the worked solution and the drawing print comes back.
// Units: mm, MPa, kN.
// ─────────────────────────────────────────────────────────────────────────
import { E_STEEL, minFilletSize } from './steelDesign'

const PHI = { flb: 0.9, wly: 1.0, wcr: 0.75, wcb: 0.9, pz: 0.9, st: 0.9, weld: 0.75 } as const
export const STIFFENER_STOCK = [8, 10, 12, 16, 19, 22, 25, 28, 32] // mm
const CLIP = 20                                                     // corner clip at the web-flange fillet, mm

export interface ColumnSection { name: string; d: number; bf: number; tf: number; tw: number; A: number; Fy: number }
/** One beam flange landing on a column flange: the force it delivers, kN,
 *  and the flange that delivers it, mm. */
export interface FlangeForce { beamId: string; Pf: number; bfb: number; tfb: number }

interface Check { Rn: number; phiRn: number; ok: boolean }

export interface ColumnJ10 {
  col: ColumnSection
  /** Design flange force, kN — the largest of the beams framing in. */
  Ru: number
  /** Bearing length of the flange force (the beam flange thickness) and the
   *  column k (taken as tf: the fillet ignored, which only lowers §J10.2), mm. */
  lb: number; k: number
  /** The joint is at the column's end (no column above or below): §J10.1
   *  halves within 10tf, §J10.2/§J10.3 take their end forms, §J10.5 halves. */
  atEnd: boolean
  /** Beams on both flanges push the web from either side (§J10.5 applies). */
  twoSided: boolean
  flangeLocalBending: Check   // §J10.1
  webLocalYielding: Check     // §J10.2
  webCrippling: Check         // §J10.3
  webBuckling?: Check         // §J10.5
  /** The least of the applicable concentrated-force strengths, kN, and which. */
  phiRnMin: number
  governs: 'flange local bending' | 'web local yielding' | 'web crippling' | 'web compression buckling'
  /** §J10.6: panel shear Vu (both sides' flange forces added — the sway
   *  sense, conservative under gravity), axial Pr, Py = Fy·A, strength. */
  panel: { Vu: number; Pr: number; Py: number; Rn: number; phiRv: number; ok: boolean }
  /** §J10.7/§J10.8 — a pair at each beam-flange level, when required. */
  stiffeners?: {
    Fst: number                // force the pair carries, kN
    bs: number; ts: number     // each plate's width and thickness, mm
    As: number; phiRn: number  // 2·bs·ts, 0.9·Fy·As
    fullDepth: boolean         // §J10.5 governs → full depth
    weld: number               // fillet to the column flange, both faces, mm
  }
  /** §J10.9 — web doubler, when the panel needs one. */
  doubler?: { td: number; phiRv: number; weld: number; Vd: number }
  ok: boolean
}

/** §J10.1 – §J10.6 for one column at one beam-flange level, and the
 *  stiffeners and doubler the deficits call for. `Pr`: column axial, kN
 *  (compression +). `beamDepth`: for the doubler's welded length, mm. */
export function columnJ10(
  col: ColumnSection, forces: FlangeForce[], opts: { atEnd: boolean; twoSided: boolean; Pr: number; FEXX?: number; beamDepth: number },
): ColumnJ10 {
  const { d, bf, tf, tw, Fy } = col
  const FEXX = opts.FEXX ?? 482
  const worst = forces.reduce((a, b) => (b.Pf > a.Pf ? b : a))
  const Ru = worst.Pf
  const lb = worst.tfb, k = tf
  const mk = (Rn: number, phi: number): Check => ({ Rn, phiRn: phi * Rn, ok: phi * Rn >= Ru - 1e-9 })

  // §J10.1 Eq. J10-1 — 50 % within 10·tf of the member end
  const flb = mk((6.25 * Fy * tf * tf * (opts.atEnd ? 0.5 : 1)) / 1000, PHI.flb)
  // §J10.2 Eq. J10-2 (interior) / J10-3 (within d of the end)
  const wly = mk((Fy * tw * ((opts.atEnd ? 2.5 : 5) * k + lb)) / 1000, PHI.wly)
  // §J10.3 Eq. J10-4 (interior) / J10-5a,b (within d/2 of the end), Qf = 1
  const root = Math.sqrt((E_STEEL * Fy * tf) / tw)
  const r15 = (tw / tf) ** 1.5
  const wcrN = opts.atEnd
    ? (lb / d <= 0.2 ? 0.4 * tw * tw * (1 + 3 * (lb / d) * r15) * root : 0.4 * tw * tw * (1 + (4 * lb / d - 0.2) * r15) * root)
    : 0.8 * tw * tw * (1 + 3 * (lb / d) * r15) * root
  const wcr = mk(wcrN / 1000, PHI.wcr)
  // §J10.5 Eq. J10-8, h = clear web between the flanges; 50 % at the end
  const h = d - 2 * tf
  const wcb = opts.twoSided ? mk(((24 * tw ** 3 * Math.sqrt(E_STEEL * Fy)) / h) * (opts.atEnd ? 0.5 : 1) / 1000, PHI.wcb) : undefined

  const cands: [number, ColumnJ10['governs']][] = [
    [flb.phiRn, 'flange local bending'], [wly.phiRn, 'web local yielding'], [wcr.phiRn, 'web crippling'],
    ...(wcb ? [[wcb.phiRn, 'web compression buckling'] as [number, ColumnJ10['governs']]] : []),
  ]
  const [phiRnMin, governs] = cands.reduce((a, b) => (b[0] < a[0] ? b : a))

  // §J10.6(a): panel deformation not in the analysis
  const Py = (Fy * col.A) / 1000
  const Vu = forces.reduce((s, f) => s + f.Pf, 0)
  const Pr = Math.max(0, opts.Pr)
  const pzFactor = Pr <= 0.4 * Py ? 1 : 1.4 - Pr / Py
  const Rn = (0.6 * Fy * d * tw * pzFactor) / 1000
  const panel = { Vu, Pr, Py, Rn, phiRv: PHI.pz * Rn, ok: PHI.pz * Rn >= Vu - 1e-9 }

  // §J10.7/§J10.8: stiffener pair for the deficit
  let stiffeners: ColumnJ10['stiffeners']
  if (phiRnMin < Ru - 1e-9) {
    const Fst = Ru - phiRnMin
    // the plate fills the flange outstand (to a 5 mm module), never below
    // §J10.8's bfb/3 − tw/2: width is cheaper than thickness
    const bsMax = (bf - tw) / 2
    const bs = Math.max(Math.floor(bsMax / 5) * 5, Math.min(bsMax, worst.bfb / 3 - tw / 2))
    const tMin = Math.max(worst.tfb / 2, bs / 16, (Fst * 1000) / (PHI.st * Fy * 2 * bs))
    const ts = STIFFENER_STOCK.find((t) => t >= tMin - 1e-9) ?? Math.ceil(tMin)
    const As = 2 * bs * ts
    // fillets both faces of each plate to the column flange, net of the clip
    const Lw = 2 * 2 * Math.max(bs - CLIP, 10)
    const wReq = (Fst * 1000) / (PHI.weld * 0.6 * FEXX * 0.707 * Lw)
    const weld = Math.max(minFilletSize(Math.min(ts, tf)), Math.ceil(wReq))
    stiffeners = { Fst, bs, ts, As, phiRn: (PHI.st * Fy * As) / 1000, fullDepth: governs === 'web compression buckling', weld }
  }

  // §J10.9: doubler for the panel deficit, its share welded along both edges
  let doubler: ColumnJ10['doubler']
  if (!panel.ok) {
    const tNeed = (Vu * 1000) / (PHI.pz * 0.6 * Fy * d * pzFactor) - tw
    const td = STIFFENER_STOCK.find((t) => t >= tNeed - 1e-9) ?? Math.ceil(tNeed)
    const phiRv = (PHI.pz * 0.6 * Fy * d * (tw + td) * pzFactor) / 1000
    const Vd = (Vu * td) / (tw + td)
    const wReq = (Vd * 1000) / (PHI.weld * 0.6 * FEXX * 0.707 * 2 * opts.beamDepth)
    doubler = { td, phiRv, Vd, weld: Math.max(minFilletSize(Math.min(td, tf)), Math.ceil(wReq)) }
  }

  const stiffOk = !stiffeners || stiffeners.phiRn >= stiffeners.Fst - 1e-9
  const panelOk = panel.ok || (!!doubler && doubler.phiRv >= Vu - 1e-9)
  return {
    col, Ru, lb, k, atEnd: opts.atEnd, twoSided: opts.twoSided,
    flangeLocalBending: flb, webLocalYielding: wly, webCrippling: wcr, ...(wcb ? { webBuckling: wcb } : {}),
    phiRnMin, governs, panel, ...(stiffeners ? { stiffeners } : {}), ...(doubler ? { doubler } : {}),
    ok: stiffOk && panelOk,
  }
}
