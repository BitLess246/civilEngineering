// ─────────────────────────────────────────────────────────────────────────
// RC stair flight (waist-slab type) — NSCP 2015 / ACI 318-14.
// A waist slab spans the flight; treads sit on top as triangular concrete.
//   Loads per m² of HORIZONTAL projection:
//     waist self-wt   = γc·t / cosθ          (t ⊥ slope → per plan area)
//     steps self-wt   = γc·R / 2             (triangular, average R/2)
//     + finishes + live (NSCP 205: 4.8 kPa for stairs/exits)
//   θ = atan(R/G),  cosθ = G/√(G²+R²)
//   Design as a one-way slab per metre width: Mu = wu·Ln²/k (k by support),
//   main bars along the span + distribution (shrinkage/temperature) steel.
// Units: spans m; t/R/G/cover/db mm; loads kPa; moments kN·m/m; As mm²/m.
// ─────────────────────────────────────────────────────────────────────────
import { flexuralSteel, rhoMin } from './flexure'

const GAMMA_C = 24            // kN/m³, reinforced concrete

export type StairSupport = 'simple' | 'one-end' | 'both-ends'

/** Flight geometry from riser R and going G (mm). */
export function stairGeometry(R: number, G: number): { thetaDeg: number; cosTheta: number; slopeFactor: number } {
  const hyp = Math.hypot(R, G)
  const cosTheta = G / hyp
  return { thetaDeg: (Math.atan2(R, G) * 180) / Math.PI, cosTheta, slopeFactor: 1 / cosTheta }
}

export interface StairLoads {
  waist: number; steps: number; finishes: number   // kPa (dead components)
  dead: number; live: number; wu: number           // kPa (wu = 1.2D + 1.6L)
}

/** Service + factored gravity load on a stair flight, kPa of plan area. */
export function stairLoads(p: {
  t: number; R: number; G: number; finishes: number; live: number; gammaC?: number
}): StairLoads {
  const gc = p.gammaC ?? GAMMA_C
  const { cosTheta } = stairGeometry(p.R, p.G)
  const waist = (gc * (p.t / 1000)) / cosTheta            // kPa, waist ⊥ slope → per plan area
  const steps = (gc * (p.R / 1000)) / 2                   // triangular treads, average R/2
  const dead = waist + steps + p.finishes
  const wu = 1.2 * dead + 1.6 * p.live
  return { waist, steps, finishes: p.finishes, dead, live: p.live, wu }
}

/** Span coefficient k in Mu = wu·Ln²/k. */
const momentDenom = (s: StairSupport): number => (s === 'simple' ? 8 : s === 'one-end' ? 9 : 11)
/** Minimum one-way slab thickness denominator (Table 409.3.1.1). */
const thicknessDenom = (s: StairSupport): number => (s === 'simple' ? 20 : s === 'one-end' ? 24 : 28)

export interface StairDesign {
  geom: { thetaDeg: number; cosTheta: number }
  loads: StairLoads
  Mu: number                  // kN·m per metre width
  d: number                   // effective depth, mm
  AsMain: number              // main steel, mm²/m
  mainSpacing: number         // bar spacing, mm
  AsDist: number              // distribution steel, mm²/m
  distSpacing: number
  tMin: number; tMinOK: boolean   // min waist thickness, mm
  ok: boolean
}

/**
 * Design a waist-slab stair flight per metre width. `span` is the clear flight
 * span (m) along the slope's horizontal projection.
 */
export function designStair(p: {
  span: number; t: number; R: number; G: number;
  fc: number; fy: number; barDia: number; distBarDia?: number; cover: number;
  finishes: number; live: number; support?: StairSupport; gammaC?: number;
}): StairDesign {
  const support = p.support ?? 'simple'
  const geom = stairGeometry(p.R, p.G)
  const loads = stairLoads({ t: p.t, R: p.R, G: p.G, finishes: p.finishes, live: p.live, gammaC: p.gammaC })

  const Mu = (loads.wu * p.span ** 2) / momentDenom(support)        // kN·m/m
  const d = Math.max(p.t - p.cover - p.barDia / 2, 0.5 * p.t)
  const flex = flexuralSteel({ Mu, b: 1000, d, fc: p.fc, fy: p.fy })
  const AsMain = Math.max(flex.As, rhoMin(p.fc, p.fy) * 1000 * d)

  // distribution steel: 0.0018·Ag (Grade-420 shrinkage/temperature, §424.4.3.2)
  const AsDist = 0.0018 * 1000 * p.t
  const distDia = p.distBarDia ?? 10

  const sMax = Math.min(3 * p.t, 450)
  const spacing = (dia: number, As: number) => {
    const Ab = (Math.PI / 4) * dia ** 2
    return As > 0 ? Math.max(50, Math.min(sMax, Math.floor((1000 * Ab) / As / 5) * 5)) : sMax
  }

  const tMin = (p.span * 1000) / thicknessDenom(support)
  return {
    geom: { thetaDeg: geom.thetaDeg, cosTheta: geom.cosTheta },
    loads, Mu, d,
    AsMain, mainSpacing: spacing(p.barDia, AsMain),
    AsDist, distSpacing: spacing(distDia, AsDist),
    tMin, tMinOK: p.t >= tMin - 1e-9,
    ok: flex.As > 0 && d > 0,
  }
}
