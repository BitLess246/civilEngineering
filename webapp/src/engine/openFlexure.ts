// ─────────────────────────────────────────────────────────────────────────
// Flexure and shear of CHANNELS and TEES — AISC 360-16 (NSCP 2015 Ch. 5)
//
// CHANNEL, strong axis — §F2 (it covers "doubly symmetric compact I-shaped
// members AND CHANNELS bent about their major axis"):
//   Mp = Fy·Zx; LTB Lp = 1.76·ry·√(E/Fy) (F2-5), Lr by F2-6 with
//   c = (ho/2)·√(Iy/Cw) (F2-8b — the channel value, not 1), rts² = √(Iy·Cw)/Sx.
//   §F2 needs a COMPACT flange and web (Table B4.1b cases 10, 15; b = bf for a
//   channel). §F3/§F4 are written for I-shapes, not channels, so a noncompact
//   channel is out of scope — the user note says every ASTM A6 C/MC is compact
//   for Fy ≤ 345, so in practice none is refused.
// CHANNEL, weak axis — §F6 (I-shapes AND channels about the minor axis):
//   Mn = min(Fy·Zy, 1.6·Fy·Sy), with FLB (F6-2) for a noncompact flange.
// CHANNEL shear — §G2.1(b): Aw = d·tw, kv = 5.34, φ = 0.90 (the φ = 1.00 of
//   §G2.1(a) is for rolled I-shapes only).
//
// TEE (flange up), strong axis — §F9, in BOTH senses, because a beam sees both:
//   stem in TENSION (sagging): Mp = Fy·Zx ≤ 1.6·My (F9-2); LTB F9-6/F9-7 with
//     B = +2.3(d/Lb)√(Iy/J); flange local buckling F9-14/F9-15 on Sxc.
//   stem in COMPRESSION (hogging): Mp = My (F9-4); LTB Mcr ≤ My with
//     B = −2.3(d/Lb)√(Iy/J) (F9-10); stem local buckling F9-16..F9-19.
//   My = Fy·Sx with Sx the SMALLER modulus (to the stem tip), as tabulated.
// TEE shear — §G3: Vn = 0.6·Fy·d·tw·Cv2 with kv = 1.2, h/t = d/tw; φ = 0.90.
//
// Weak-axis bending of a TEE has no §F clause written for it (F6 is I-shapes
// and channels), so it is not provided — callers that need it fail closed.
//
// Section properties: Ix, Iy are the tabulated A·r². Z, centroids and
// extreme-fibre distances are from a plate decomposition (no fillets); the
// channel's weak axis models the rolled 1:6 flange taper (see channelGeom).
// J and Cw are `torsionProps` (thin-wall, DG9). Loads are assumed to act
// through the shear centre or the member to be restrained against twisting —
// the premise of §F2 for channels, stated, not modelled.
//
// Units: mm, mm², mm³, mm⁴, MPa; moments kN·m, shears kN, Lb in mm.
// ─────────────────────────────────────────────────────────────────────────

import type { AiscShape } from './aiscSections'
import type { PlateClass } from './steelDesign'
import { torsionProps } from './steelCompression'

const E = 200_000
const PHI_B = 0.90, PHI_V = 0.90

const cls = (lam: number, lp: number, lr: number): PlateClass => lam <= lp ? 'compact' : lam <= lr ? 'noncompact' : 'slender'

export interface OpenFlexure {
  applicable: boolean
  reason?: string
  clause: 'F2' | 'F6' | 'F9' | 'out-of-scope'
  Mp: number; My: number; Mn: number; phiMn: number      // kN·m
  Lp: number; Lr: number                                  // mm (Infinity when LTB is not a limit state)
  ltbZone: 'plastic' | 'inelastic' | 'elastic'
  lambdaF: number; lambdaPF: number; lambdaRF: number; flangeClass: PlateClass
  lambdaW: number; lambdaPW: number; lambdaRW: number; webClass: PlateClass
  MnLTB: number; MnFLB: number; MnLB: number              // kN·m, Infinity when not a limit state
  governing: 'yielding' | 'LTB' | 'FLB' | 'local buckling'
  Ix: number; Sx: number; Zx: number
}

const finish = (o: Omit<OpenFlexure, 'Mn' | 'phiMn' | 'governing' | 'ltbZone'> & { Lb: number }): OpenFlexure => {
  const Mn = o.applicable ? Math.min(o.Mp, o.MnLTB, o.MnFLB, o.MnLB) : 0
  const governing: OpenFlexure['governing'] = Mn >= o.Mp - 1e-9 ? 'yielding'
    : Mn === o.MnLTB ? 'LTB' : Mn === o.MnFLB ? 'FLB' : 'local buckling'
  const ltbZone = !Number.isFinite(o.Lp) || o.Lb <= o.Lp ? 'plastic' : o.Lb <= o.Lr ? 'inelastic' : 'elastic'
  const { Lb: _Lb, ...rest } = o
  void _Lb
  return { ...rest, Mn, phiMn: PHI_B * Mn, governing, ltbZone }
}

// ── Channels ──────────────────────────────────────────────────────────────

/** Channel geometry. Strong axis: rectangles (Zx lands on the Manual —
 *  C10×15.3 15.86 against 15.9 in³). Weak axis: the flanges are TAPERED, as
 *  rolled (American Standard channels slope 1:6 about the mean thickness tf),
 *  because with rectangles the centroid sits 14 % too far from the web
 *  (C10×15.3: 0.722 in against the tabulated 0.634) and Sy reads ~5 % high —
 *  unconservative. With the taper x̄ is 0.638 in. Returns Zx, and the weak-axis
 *  centroid (from the web back), plastic and elastic (to the tips) moduli. */
function channelGeom(s: AiscShape) {
  const d = s.d!, bf = s.bf!, tf = s.tf!, tw = s.tw!
  const hw = d - 2 * tf
  const Zx = bf * tf * (d - tf) + (tw * hw * hw) / 4
  const L = bf - tw
  const t1 = tf + L / 12, t2 = tf - L / 12                      // flange thickness at the web, at the tip
  const Aw = tw * d, Af = 2 * L * tf, A = Aw + Af
  const xf = tw + (L * (t1 + 2 * t2)) / (3 * (t1 + t2))          // trapezoid centroid
  const xbar = (Aw * tw / 2 + Af * xf) / A
  let Zy: number
  if (Aw >= A / 2) {
    const xp = A / 2 / d                                         // plastic axis in the web
    Zy = (d * (xp ** 2 + (tw - xp) ** 2)) / 2 + Af * (xf - xp)
  } else {
    // plastic axis in the flanges: integrate strips (never reached by a rolled C)
    const n = 400, w = L / n, thick = (x: number) => 2 * (t1 + (t2 - t1) * ((x - tw) / L))
    let acc = Aw, xp = bf
    for (let k = 0; k < n; k++) { const x = tw + (k + 0.5) * w, a = thick(x) * w; if (acc + a >= A / 2) { xp = x - w / 2 + (A / 2 - acc) / thick(x); break } acc += a }
    Zy = Aw * (xp - tw / 2)
    for (let k = 0; k < n; k++) { const x = tw + (k + 0.5) * w; Zy += thick(x) * w * Math.abs(x - xp) }
  }
  const Iy = s.A * s.ry ** 2
  const Sy = Iy / (bf - xbar)                                    // to the flange tips (the far fibre)
  return { Zx, Zy, Sy, xbar }
}

/** §F2 strong-axis flexure of a channel. Lb mm, Cb ≥ 1 (1.0 conservative). */
export { channelGeom }

export function channelFlexure(s: AiscShape, Fy: number, Lb: number, Cb = 1.0): OpenFlexure {
  const d = s.d!, bf = s.bf!, tf = s.tf!, tw = s.tw!
  const rt = Math.sqrt(E / Fy)
  const Ix = s.A * s.rx ** 2, Iy = s.A * s.ry ** 2, Sx = Ix / (d / 2)
  const { Zx } = channelGeom(s)
  const Mp = (Fy * Zx) / 1e6, My = (Fy * Sx) / 1e6
  const lamF = bf / tf, lpF = 0.38 * rt, lrF = 1.0 * rt              // Table B4.1b case 10 (b = bf)
  const lamW = (d - 2 * tf) / tw, lpW = 3.76 * rt, lrW = 5.70 * rt    // case 15
  const base = { lambdaF: lamF, lambdaPF: lpF, lambdaRF: lrF, flangeClass: cls(lamF, lpF, lrF),
    lambdaW: lamW, lambdaPW: lpW, lambdaRW: lrW, webClass: cls(lamW, lpW, lrW), Ix, Sx, Zx, Mp, My, Lb }
  const none = { MnLTB: Infinity, MnFLB: Infinity, MnLB: Infinity, Lp: Infinity, Lr: Infinity }
  if (lamF > lpF || lamW > lpW)
    return finish({ ...base, ...none, applicable: false, clause: 'out-of-scope',
      reason: `${s.name}: noncompact ${lamF > lpF ? 'flange' : 'web'} — §F2 covers compact channels only (§F3/§F4 are written for I-shapes)` })
  const tp = torsionProps(s)!
  const ho = d - tf
  const rts = Math.sqrt(Math.sqrt(Iy * tp.Cw) / Sx)                 // F2-7
  const c = (ho / 2) * Math.sqrt(Iy / tp.Cw)                          // F2-8b
  const Lp = 1.76 * s.ry * rt                                         // F2-5
  const jr = (tp.J * c) / (Sx * ho)
  const Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(jr + Math.sqrt(jr ** 2 + 6.76 * (0.7 * Fy / E) ** 2))  // F2-6
  let MnLTB = Infinity
  if (Lb > Lr) {
    const Fcr = ((Cb * Math.PI ** 2 * E) / (Lb / rts) ** 2) * Math.sqrt(1 + 0.078 * jr * (Lb / rts) ** 2)     // F2-4
    MnLTB = Math.min(Mp, (Fcr * Sx) / 1e6)                                                                    // F2-3
  } else if (Lb > Lp) {
    MnLTB = Math.min(Mp, Cb * (Mp - (Mp - 0.7 * My) * ((Lb - Lp) / (Lr - Lp))))                                // F2-2
  }
  return finish({ ...base, applicable: true, clause: 'F2', MnLTB, MnFLB: Infinity, MnLB: Infinity, Lp, Lr })
}

export interface WeakAxis { Zy: number; Sy: number; Mn: number; phiMn: number; flangeClass: PlateClass; clause: 'F6' }

/** §F6 weak-axis flexure of a channel. */
export function channelWeakFlexure(s: AiscShape, Fy: number): WeakAxis {
  const { Zy, Sy } = channelGeom(s)
  const rt = Math.sqrt(E / Fy)
  const lam = s.bf! / s.tf!, lp = 0.38 * rt, lr = 1.0 * rt
  const Mp = Math.min(Fy * Zy, 1.6 * Fy * Sy) / 1e6                                      // F6-1
  let Mn = Mp
  if (lam > lr) Mn = Math.min(Mp, (0.69 * E / lam ** 2) * Sy / 1e6)                       // F6-3, F6-4
  else if (lam > lp) Mn = Math.min(Mp, Mp - (Mp - 0.7 * Fy * Sy / 1e6) * ((lam - lp) / (lr - lp)))   // F6-2
  return { Zy, Sy, Mn, phiMn: PHI_B * Mn, flangeClass: cls(lam, lp, lr), clause: 'F6' }
}

export interface OpenShear { Aw: number; Cv: number; slenderness: number; Vn: number; phiVn: number; phiV: number; clause: 'G2.1' | 'G3' }

/** §G2.1(b) shear of a channel web: kv = 5.34, φ = 0.90. */
export function channelShear(s: AiscShape, Fy: number): OpenShear {
  const Aw = s.d! * s.tw!, ht = (s.d! - 2 * s.tf!) / s.tw!
  const lim = 1.10 * Math.sqrt(5.34 * E / Fy)
  const Cv = ht <= lim ? 1.0 : lim / ht                                                    // G2-3 / G2-4
  const Vn = (0.6 * Fy * Aw * Cv) / 1000
  return { Aw, Cv, slenderness: ht, Vn, phiVn: PHI_V * Vn, phiV: PHI_V, clause: 'G2.1' }
}

// ── Tees ──────────────────────────────────────────────────────────────────

/** Rectangle geometry of a tee with the flange UP: centroid ȳ from the
 *  flange top, plastic modulus, and the elastic moduli to the flange (Sxc)
 *  and to the stem tip (Sxt, the smaller). */
export function teeGeom(s: AiscShape) {
  const d = s.d!, bf = s.bf!, tf = s.tf!, tw = s.tw!
  const Af = bf * tf, As = (d - tf) * tw, A = Af + As
  const ybar = (Af * tf / 2 + As * (tf + (d - tf) / 2)) / A
  // plastic neutral axis from the top
  const yp = Af >= A / 2 ? (A / 2) / bf : tf + (A / 2 - Af) / tw
  const Zx = yp <= tf
    ? bf * (yp ** 2 + (tf - yp) ** 2) / 2 + As * (tf + (d - tf) / 2 - yp)
    : Af * (yp - tf / 2) + tw * ((yp - tf) ** 2 + (d - yp) ** 2) / 2
  const Ix = s.A * s.rx ** 2
  return { ybar, Zx, Ix, Sxc: Ix / ybar, Sxt: Ix / (d - ybar) }
}

/** §F9 strong-axis flexure of a tee, flange up. `stem`: which side is in
 *  compression decides the whole clause set — sagging puts the stem in
 *  TENSION, hogging in COMPRESSION. Lb mm. */
export function teeFlexure(s: AiscShape, Fy: number, Lb: number, stem: 'tension' | 'compression'): OpenFlexure {
  const d = s.d!, bf = s.bf!, tf = s.tf!, tw = s.tw!
  const rt = Math.sqrt(E / Fy)
  const g = teeGeom(s)
  const Iy = s.A * s.ry ** 2
  const Sx = Math.min(g.Sxc, g.Sxt)
  const My = (Fy * Sx) / 1e6                                                                  // F9-3
  const lamF = bf / (2 * tf), lpF = 0.38 * rt, lrF = 1.0 * rt                                 // Table B4.1b case 10
  const lamW = d / tw, lpW = 0.84 * rt, lrW = 1.52 * rt                                       // F9.4 stem limits
  const J = torsionProps(s)!.J
  const Mp = stem === 'tension' ? Math.min((Fy * g.Zx) / 1e6, 1.6 * My) : My                 // F9-2 / F9-4
  const Lp = 1.76 * s.ry * rt                                                                 // F9-8
  const Lr = 1.95 * (E / Fy) * (Math.sqrt(Iy * J) / Sx) * Math.sqrt(2.36 * (Fy / E) * (d * Sx) / J + 1)   // F9-9
  const Mcr = (B: number) => (1.95 * E / Lb) * Math.sqrt(Iy * J) * (B + Math.sqrt(1 + B * B)) / 1e6        // F9-7 / F9-10
  const Bmag = 2.3 * (d / Lb) * Math.sqrt(Iy / J)
  let MnLTB = Infinity, MnFLB = Infinity, MnLB = Infinity
  if (stem === 'tension') {
    if (Lb > Lr) MnLTB = Math.min(Mp, Mcr(Bmag))                                                          // F9-7
    else if (Lb > Lp) MnLTB = Math.min(Mp, Mp - (Mp - My) * ((Lb - Lp) / (Lr - Lp)))                      // F9-6
    // §F9.3 flange local buckling — the flange is the compression side
    if (lamF > lrF) MnFLB = (0.7 * E * g.Sxc / lamF ** 2) / 1e6                                           // F9-15
    else if (lamF > lpF) MnFLB = Math.min(1.6 * My, Mp - (Mp - 0.7 * Fy * g.Sxc / 1e6) * ((lamF - lpF) / (lrF - lpF)))   // F9-14 (Mp already ≤ 1.6My)
  } else {
    MnLTB = Math.min(My, Mcr(-Bmag))                                                                      // F9-10 (Mn ≤ My)
    // §F9.4 local buckling of the stem in flexural compression, on the stem-tip modulus
    const Fcr = lamW <= lpW ? Fy                                                                          // F9-17
      : lamW <= lrW ? (1.43 - 0.515 * lamW * Math.sqrt(Fy / E)) * Fy                                      // F9-18
      : (1.52 * E) / lamW ** 2                                                                            // F9-19
    MnLB = (Fcr * g.Sxt) / 1e6                                                                            // F9-16
  }
  return finish({
    applicable: true, clause: 'F9', Mp, My, Ix: g.Ix, Sx, Zx: g.Zx, Lb, Lp, Lr,
    lambdaF: lamF, lambdaPF: lpF, lambdaRF: lrF, flangeClass: cls(lamF, lpF, lrF),
    lambdaW: lamW, lambdaPW: lpW, lambdaRW: lrW, webClass: cls(lamW, lpW, lrW),
    MnLTB, MnFLB, MnLB,
  })
}

/** §G3 shear of a tee stem: Vn = 0.6·Fy·d·tw·Cv2, kv = 1.2, h/t = d/tw. */
export function teeShear(s: AiscShape, Fy: number): OpenShear {
  const Aw = s.d! * s.tw!, ht = s.d! / s.tw!, kv = 1.2
  const l1 = 1.10 * Math.sqrt(kv * E / Fy), l2 = 1.37 * Math.sqrt(kv * E / Fy)
  const Cv = ht <= l1 ? 1.0 : ht <= l2 ? l1 / ht : (1.51 * kv * E) / (ht ** 2 * Fy)              // G2-9..11
  const Vn = (0.6 * Fy * Aw * Cv) / 1000
  return { Aw, Cv, slenderness: ht, Vn, phiVn: PHI_V * Vn, phiV: PHI_V, clause: 'G3' }
}
