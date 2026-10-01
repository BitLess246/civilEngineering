// ─────────────────────────────────────────────────────────────────────────
// TIMBER POST BASE — a steel base plate with two side straps through-bolted to
// the post, anchored to an RC pedestal by two rods outboard of the post. LRFD.
//
//   post end bearing      NDS §3.10.1      fc = Pu/(b·d) ≤ F*c
//   bolts (uplift, ∥)     NDS §12.3.1      double shear, steel side plates —
//                                          yield modes Im, Is, IIIs, IV
//   bolts (base shear, ⊥) NDS §12.3.1      the same at θ = 90°, Fe⊥ = 212·G^1.45/√D
//   strap tension         AISC 360 §J4.1   φ0.90·Fy·Ag, φ0.75·Fu·An
//   plate                 AISC DG1         bearing cantilever, and the rod's
//                                          pull bending the plate off the strap
//   rods in concrete      ACI 318-14 Ch.17 `anchorDesign` (nx = 2, ny = 1)
//
// Yield-limit equations (NDS Table 12.3.1A, double shear), SI — dimensionally
// consistent with the psi/inch originals: D, ℓ mm, F MPa → Z in N.
//   Im   Z = D·ℓm·Fem / Rd
//   Is   Z = 2·D·ℓs·Fes / Rd
//   IIIs Z = 2·k3·D·ℓs·Fem / ((2 + Re)·Rd)
//   IV   Z = (2·D²/Rd)·√(2·Fem·Fyb / (3(1 + Re)))
//   Re = Fem/Fes;  k3 = −1 + √(2(1 + Re)/Re + 2Fyb(2 + Re)D²/(3·Fem·ℓs²))
//   Rd = 4Kθ (Im, Is), 3.2Kθ (IIIs, IV);  Kθ = 1 + 0.25·θ/90  (6.4 ≤ D ≤ 25.4)
//   Fe∥ = 11 200·G psi = 77.22·G MPa;  Fe⊥ = 212·G^1.45/√D(mm) MPa;
//   A36 side plate Fes = 87 000 psi (1.5·Fu)
// LRFD (NDS Appendix N): Z′ = Z · CM · KF 3.32 · φz 0.65 · λ, with CM 0.7
// in wet service (Table 11.3.3). End distance 7D, spacing 4D (§12.5.1), so
// CΔ = 1 and the group factor of a two-to-four-bolt row is taken as 1.
// Units: mm, kN at the interface.
// ─────────────────────────────────────────────────────────────────────────
import type { WoodRefValues, WoodKind } from './woodDesign'
import { woodAdjusted } from './woodDesign'
import { checkAnchorGroup, type AnchorGroupResult } from './anchorDesign'
import { PLATE_STOCK, ANCHOR_FU, ANCHOR_FY } from './baseplate'

export interface PostBaseInput {
  /** Post b (across the straps' width) and d (through the bolts), mm. */
  b: number; d: number
  ref: WoodRefValues; kind: WoodKind; wet?: boolean
  /** Envelope factored compression, net uplift and base shear, kN — and
   *  whether the uplift / shear came from a seismic combination. */
  Pu: number; Tu: number; Vu: number; seismic?: boolean
  /** Pedestal: side and height (mm), concrete f′c. */
  pedestalSide: number; pedestalHeight: number; fc: number
}

export interface PostBaseCheck { name: string; clause: string; util: number }

export interface PostBaseResult {
  plate: { N: number; B: number; t: number }
  straps: { t: number; w: number; h: number }
  bolts: { n: number; D: number; end: number; spacing: number }
  rods: { n: number; da: number; hef: number; x: number }
  /** Per-bolt LRFD capacity parallel / perpendicular to grain, kN. */
  ZparPrime: number; ZperpPrime: number
  anchors: AnchorGroupResult
  checks: PostBaseCheck[]
  util: number
  governs: string
  ok: boolean
}

const STEEL_FY = 248, STEEL_FU = 400       // A36 plate and strap
// NDS's own values, converted exactly (1 psi = 0.00689476 MPa) so the SI
// equations reproduce the code's tables rather than a rounding of them
const PSI = 0.00689476
const BOLT_FYB = 45000 * PSI                // A307 bolt bending yield, NDS Table I1
const FES_A36 = 87000 * PSI                 // A36 side plate, 1.5·Fu (Fu 58 ksi)
const KF_Z = 3.32, PHI_Z = 0.65             // NDS Appendix N, connections
const ROD_DA = 16
const STRAP_T = [6, 8, 10, 12, 16]
const BOLT_D = [12, 16, 20]

/** NDS Table 12.3.1A, double shear, steel side members: the governing
 *  (least) yield mode, N. θ is the load-to-grain angle in degrees. */
export function boltZDoubleSteel(D: number, lm: number, ls: number, G: number, theta: number): { Z: number; mode: string } {
  // Fe∥ = 11 200·G psi; Fe⊥ = 6 100·G^1.45/√D(in) psi (NDS Table 12.3.3 fn.)
  const Fem = theta === 0 ? 11200 * PSI * G : (6100 * PSI * G ** 1.45) / Math.sqrt(D / 25.4)
  const Fes = FES_A36
  const Re = Fem / Fes
  const Kt = 1 + 0.25 * (theta / 90)
  const k3 = -1 + Math.sqrt((2 * (1 + Re)) / Re + (2 * BOLT_FYB * (2 + Re) * D * D) / (3 * Fem * ls * ls))
  const modes: [string, number][] = [
    ['Im', (D * lm * Fem) / (4 * Kt)],
    ['Is', (2 * D * ls * Fes) / (4 * Kt)],
    ['IIIs', (2 * k3 * D * ls * Fem) / ((2 + Re) * 3.2 * Kt)],
    ['IV', ((2 * D * D) / (3.2 * Kt)) * Math.sqrt((2 * Fem * BOLT_FYB) / (3 * (1 + Re)))],
  ]
  const [mode, Z] = modes.reduce((a, b) => (b[1] < a[1] ? b : a))
  return { Z, mode }
}

export function designPostBase(i: PostBaseInput): PostBaseResult {
  const Tu = Math.max(0, i.Tu), Vu = Math.max(0, i.Vu), Pu = Math.max(0, i.Pu)
  const lambdaGravity = 0.8, lambdaLateral = 1.0
  const lam = i.seismic || Tu > 0 ? lambdaLateral : lambdaGravity
  const adj = woodAdjusted(i.ref, i.kind, i.d, { method: 'LRFD', lambda: lambdaGravity, wet: i.wet })
  const CM = i.wet ? 0.7 : 1
  const checks: PostBaseCheck[] = []

  // ── post end bearing on the plate (NDS §3.10.1) ──
  checks.push({ name: 'post end bearing', clause: 'NDS §3.10.1', util: (Pu * 1000) / (i.b * i.d) / adj.FcStar })

  // ── bolts through the post, double shear on the two straps ──
  let pick: { D: number; n: number; ts: number; Zp: number; Zq: number } | null = null
  search:
  for (const D of BOLT_D) {
    for (const n of [2, 3, 4]) {
      for (const ts of STRAP_T) {
        const Zp = (boltZDoubleSteel(D, i.d, ts, i.ref.G, 0).Z * CM * KF_Z * PHI_Z * lam) / 1000
        const Zq = (boltZDoubleSteel(D, i.d, ts, i.ref.G, 90).Z * CM * KF_Z * PHI_Z * lam) / 1000
        const w = Math.min(i.b - 20, 100)
        const strapCap = Math.min(0.9 * STEEL_FY * w * ts, 0.75 * STEEL_FU * (w - (D + 2)) * ts) / 1000
        const boltUtil = Tu / (n * Zp) + Vu / (n * Zq)
        if (boltUtil <= 1 && Tu / 2 <= strapCap) { pick = { D, n, ts, Zp, Zq }; break search }
        pick = { D, n, ts, Zp, Zq }
      }
    }
  }
  const { D, n, ts, Zp, Zq } = pick!
  const w = Math.min(i.b - 20, 100)
  const end = 7 * D, spacing = 4 * D
  const h = end + spacing * (n - 1) + 2 * D
  checks.push({ name: 'bolts — uplift ∥ + shear ⊥ to grain', clause: 'NDS §12.3.1', util: Tu / (n * Zp) + Vu / (n * Zq) })
  const strapCap = Math.min(0.9 * STEEL_FY * w * ts, 0.75 * STEEL_FU * (w - (D + 2)) * ts) / 1000
  checks.push({ name: 'strap tension', clause: 'AISC §J4.1', util: Tu / 2 / strapCap })

  // ── plate: rods outboard of the post along d ──
  const e = 50
  const rodX = i.d / 2 + e
  const N = i.d + 4 * e, B = i.b + 40
  const fp = (Pu * 1000) / (N * B)
  const m = (N - i.d) / 2
  const tBear = m * Math.sqrt((2 * fp) / (0.9 * STEEL_FY))
  // each rod pulls Tu/2 at e off the strap face; plastic plate over B
  const Mrod = (Tu / 2) * 1000 * e
  const tUp = Math.sqrt((4 * Mrod) / (0.9 * STEEL_FY * B))
  // demand over provided — the 8 mm floor is a detailing minimum, not a demand
  const tDemand = Math.max(tBear, tUp)
  const tReq = Math.max(tDemand, 8)
  const t = PLATE_STOCK.find((x) => x >= tReq - 1e-9) ?? Math.ceil(tReq / 5) * 5
  checks.push({ name: 'plate bending', clause: 'AISC DG1', util: tDemand / t })

  // ── rods in the pedestal (ACI 318-14 Ch. 17) ──
  const half = i.pedestalSide / 2
  const hMax = i.pedestalHeight - 100
  const at = (hef: number) => checkAnchorGroup({
    nx: 2, ny: 1, sx: 2 * rodX, sy: 0, edges: [half - rodX, half - rodX, half, half],
    hef, da: ROD_DA, futa: ANCHOR_FU.A307, fya: ANCHOR_FY.A307, fc: i.fc, ha: i.pedestalHeight,
    edgeReinf: 'bars', Nua: Tu, Vua: Vu, seismic: i.seismic,
  })
  let hef = Math.min(150, hMax), anchors = at(hef)
  while (anchors.util > 1 && hef + 25 <= hMax) { hef += 25; anchors = at(hef) }
  checks.push({ name: `anchor rods (${anchors.governs})`, clause: 'ACI 318-14 Ch. 17', util: anchors.util })

  const worst = checks.reduce((a, b) => (b.util > a.util ? b : a))
  return {
    plate: { N, B, t }, straps: { t: ts, w, h }, bolts: { n, D, end, spacing },
    rods: { n: 2, da: ROD_DA, hef, x: rodX },
    ZparPrime: Zp, ZperpPrime: Zq, anchors, checks,
    util: worst.util, governs: `${worst.name} (${worst.clause})`,
    ok: worst.util <= 1 + 1e-9 && anchors.edgeOK && anchors.spacingOK,
  }
}
