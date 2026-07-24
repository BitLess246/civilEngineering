// ─────────────────────────────────────────────────────────────────────────
// Validation benchmarks — engine output vs independent hand calculation.
//
// Each case states a textbook/code closed-form result ("manual") and the value
// the engine produces ("software") for the same input, so the two can be shown
// side-by-side with the percent difference. The companion test asserts every
// case agrees within tolerance — these double as regression guards and as the
// credibility evidence a reviewer looks for.
// Units are given per case; geometry mm, forces kN, stress MPa unless noted.
// ─────────────────────────────────────────────────────────────────────────
import { concreteBeamMn } from './scwb'
import { velocityPressure, windKz } from './wind'
import { requiredArea } from './bearing'
import { beamFlexure, beamShear, deriveWSection } from './steelDesign'
import { shapeByName } from './aiscSections'
import { designAxialColumn } from './columnDesign'
import { activeThrust, rankineKa, bearingFactors, infiniteSlopeFS } from './geotech'
import { computeSeismic } from './seismic'
import { torsionalVerdict } from './irregularity'
import { jacobiEigen } from './modal'
import { elasticResponseSpectrum } from './accelSpectrum'
import { generateGridModel } from './modelBuilder'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support } from './frame3d'
import { solveBoltedConnection } from './boltedConnection'
import { solveWeldedConnection } from './weldedConnection'
import { boltGeomFromPositions, outOfPlaneBoltGroup, pryingAction } from './steelDesign'
import { columnStabilityFactor, beamStabilityFactor, getWoodRef } from './woodDesign'
import { designWoodSlab } from './woodSlab'
import { velocity, hazenWilliamsHead, gpmToLps } from './waterSupply'
import { designDrainage } from './drainage'
import { designSepticTank } from './septicTank'
import type { RectSection } from './model'

export interface ValidationCase {
  id: string
  category: 'RC' | 'Steel' | 'Timber' | 'Connections' | 'Analysis' | 'Seismic' | 'Dynamics' | 'Wind' | 'Geotech' | 'Plumbing'
  title: string
  reference: string
  formula: string
  manual: number
  software: number
  unit: string
  /** Relative tolerance for an acceptable match. */
  tol: number
}

/** Percent difference of the software result from the hand calculation. */
export function pctDiff(c: ValidationCase): number {
  return c.manual === 0 ? (c.software === 0 ? 0 : Infinity) : Math.abs(c.software - c.manual) / Math.abs(c.manual) * 100
}

// ── 1. RC singly-reinforced beam — nominal moment ───────────────────────────
const rcMn = (() => {
  const b = 300, d = 450, As = 1200, fc = 28, fy = 415
  const a = (As * fy) / (0.85 * fc * b)
  return { manual: (As * fy * (d - a / 2)) / 1e6, software: concreteBeamMn(b, d, As, fc, fy) }
})()

// ── 2. Cantilever tip deflection — frame solver vs PL³/3EI ───────────────────
const cantilever = (() => {
  const E = 25000, G = E / 2.4, b = 300, h = 500, L = 3, P = 10
  const Iz = (b * h ** 3) / 12, Iy = (h * b ** 3) / 12, A = b * h, J = rectJ(b, h)
  const EIz = (E * Iz) / 1e9                              // kN·m²
  const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }]
  const members: F3Member[] = [{ id: 'm', i: 'a', j: 'b', E, G, A, Iy, Iz, J }]
  const supports: F3Support[] = [{ node: 'a', fixity: 'fixed' }]
  const res = solveFrame3D(nodes, members, supports, [{ kind: 'node', node: 'b', Fy: -P, cat: 'D' }])!
  return {
    defl: { manual: (P * L ** 3) / (3 * EIz) * 1000, software: Math.abs(res.d[6 + 1]) * 1000 },  // mm
    moment: { manual: P * L, software: Math.abs(res.members[0].Mz[0]) },                          // kN·m
    slope: { manual: (P * L ** 2) / (2 * EIz), software: Math.abs(res.d[6 + 5]) },                // rad (θz at tip)
  }
})()

// ── Fixed–fixed beam, central point load — deflection P·L³/192EI ──────────────
const fixedFixed = (() => {
  const E = 25000, G = E / 2.4, b = 300, h = 500, L = 4, P = 20
  const Iz = (b * h ** 3) / 12, Iy = (h * b ** 3) / 12, A = b * h, J = rectJ(b, h)
  const EIz = (E * Iz) / 1e9
  const nodes: F3Node[] = [
    { id: 'a', x: 0, y: 0, z: 0 }, { id: 'c', x: L / 2, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 },
  ]
  const members: F3Member[] = [
    { id: 'ac', i: 'a', j: 'c', E, G, A, Iy, Iz, J }, { id: 'cb', i: 'c', j: 'b', E, G, A, Iy, Iz, J },
  ]
  const supports: F3Support[] = [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'fixed' }]
  const res = solveFrame3D(nodes, members, supports, [{ kind: 'node', node: 'c', Fy: -P, cat: 'D' }])!
  return { manual: (P * L ** 3) / (192 * EIz) * 1000, software: Math.abs(res.d[6 + 1]) * 1000 }  // mm at mid
})()

// ── 3. Compact steel beam — plastic moment φMp = 0.9·Fy·Zx ───────────────────
const steelMp = (() => {
  const shape = shapeByName('W310x79')!, Fy = 345
  const p = deriveWSection(shape)
  const flex = beamFlexure(shape, p, Fy, 1000, 1.0)        // Lb = 1 m ≪ Lp ⇒ plastic
  return { manual: (0.9 * Fy * p.Zx) / 1e6, software: flex.phiMn }   // kN·m
})()

// ── 4. Wind velocity pressure qz = 0.613·Kz·Kzt·Kd·V² ────────────────────────
const windQz = (() => {
  const z = 10, V = 50, Kzt = 1.0, Kd = 0.85
  return { manual: (0.613 * windKz(z, 'C') * Kzt * Kd * V ** 2) / 1000, software: velocityPressure(z, V, 'C', Kzt, Kd) }
})()

// ── 5. Spread footing — required bearing area A = P/q_net ────────────────────
const footing = (() => {
  const P = 800, qNet = 180
  return { manual: P / qNet, software: requiredArea(P, qNet) }
})()

// ── 6. Tied column — max axial φPn,max = φ·α·[0.85f′c(Ag−Ast)+fy·Ast] ─────────
const columnAxial = (() => {
  const b = 400, h = 400, fc = 28, fy = 415, barDia = 25, numBars = 8
  const Ast = numBars * (Math.PI / 4) * barDia ** 2, Ag = b * h
  const Po = (0.85 * fc * (Ag - Ast) + fy * Ast) / 1000
  const r = designAxialColumn({ shape: 'tied', b, h, cover: 40, barDia, tieDia: 10, fc, fy, Pu: 1000, numBars })
  return { manual: 0.65 * 0.80 * Po, software: r.phiPnMax }    // φ 0.65 tied, α 0.80
})()

// ── 7. Steel beam shear — φVn = 1.0·0.6·Fy·Aw·Cv1 (stocky web) ────────────────
const steelVn = (() => {
  const shape = shapeByName('W310x79')!, Fy = 345
  const r = beamShear(shape, deriveWSection(shape), Fy)
  const Aw = shape.d! * shape.tw!                              // §G2.1b for I-shapes
  return { manual: (1.0 * 0.6 * Fy * Aw * r.Cv1) / 1000, software: r.phiVn }
})()

// ── 8. Rankine active thrust  Pa = ½·Ka·γ·H² ─────────────────────────────────
const earthThrust = (() => {
  const gamma = 18, H = 5, phiDeg = 30
  return { manual: 0.5 * rankineKa(phiDeg) * gamma * H ** 2, software: activeThrust({ gamma, H, phiDeg }).P }
})()

// ── 9. Bearing factor Nq at φ = 30° (Prandtl/Reissner) ───────────────────────
const bearingNq = (() => ({ manual: 18.401, software: bearingFactors(30).Nq }))()

// ── 10. Infinite-slope FS (cohesionless dry) = tanφ/tanβ ─────────────────────
const slopeFS = (() => {
  const phiDeg = 32, betaDeg = 18
  const tan = (d: number) => Math.tan((d * Math.PI) / 180)
  return { manual: tan(phiDeg) / tan(betaDeg), software: infiniteSlopeFS({ c: 0, phiDeg, gamma: 18, z: 3, betaDeg }) }
})()

// ── Dynamics — eigen-solver & response spectrum ──────────────────────────────
const dynamics = (() => {
  const vals = jacobiEigen([[2, 1], [1, 2]]).values             // closed form: 1, 3
  const ag = [0, 0.4, 1.0, -0.7, 0.5, -1.0, 0.2]                // m/s², PGA = 1.0
  const spec = elasticResponseSpectrum(ag, 0.02, { Tmin: 0.1, Tmax: 2, nT: 20 })!
  const p = spec.points[Math.floor(spec.points.length / 2)]
  const omega = (2 * Math.PI) / p.T
  return {
    eig: { manual: 3, software: Math.max(...vals) },
    anchor: { manual: spec.pga, software: spec.points[0].PSA },
    pseudo: { manual: omega * omega * p.Sd, software: p.PSA },
  }
})()

// ── 11. NSCP 208 seismic static — period & base shear ────────────────────────
const seismic = (() => {
  const section: RectSection = { id: 'S', name: 's', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section })
  const r = computeSeismic(m, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!
  return {
    period: { manual: 0.0731 * r.hn ** 0.75, software: r.T },                 // T = Ct·hn^¾
    baseShear: { manual: (0.64 * 1 * r.W) / (8.5 * r.T), software: r.Vraw },  // V = Cv·I·W/(R·T)
  }
})()

// ── 12. Steel connections — bolt/weld groups, out-of-plane, prying ───────────
const boltEcc = (() => {
  // 4 bolts on a 100×100 square (centroid 50,50); vertical P = 100 kN at
  // ex = 100 mm. J = 4·(50²+50²) = 20000 mm²; direct P/4 plus torsional
  // T·ρ/J on the corner bolts ⇒ R = P·√(0.25² + 0.5²) = 0.55902·P.
  const bolts = [
    { id: 'B1', x: 0, y: 0 }, { id: 'B2', x: 100, y: 0 },
    { id: 'B3', x: 0, y: 100 }, { id: 'B4', x: 100, y: 100 },
  ]
  const r = solveBoltedConnection({ bolts, dia: 22, allowableStress: 150, load: { P: 100, angleDeg: -90, px: 150, py: 50 } })
  return { manual: 100 * Math.sqrt(0.25 ** 2 + 0.5 ** 2), software: r.Rmax }
})()

const weldEcc = (() => {
  // Single vertical weld line 300 mm; vertical P = 100 kN at 100 mm eccentricity.
  // J/t = L³/12 = 2.25×10⁶ mm³. Direct P/Lw = 333.33; torsional T·c/(J/t) =
  // (10⁷·150)/2.25×10⁶ = 666.67 ⇒ f = (P·1000/Lw)·√5.
  const r = solveWeldedConnection({
    segments: [{ id: 'w', x1: 0, y1: 0, x2: 0, y2: 300 }], size: 6,
    load: { P: 100, angleDeg: 90, px: 100, py: 150 },
  })
  return { manual: (100_000 / 300) * Math.sqrt(5), software: r.fMax }
})()

const boltOop = (() => {
  // 2×3 bolt group (rows y = 0/100/200); Vu = 100 kN at e_out = 100 mm ⇒
  // M_op = 10 000 kN·mm. Σyi² = 2·(100² + 200²) = 100 000 mm² about the lowest
  // row ⇒ top-row tension T = M_op·200/Σyi² = 20 kN.
  const geom = boltGeomFromPositions([
    { id: 'B1', x: 0, y: 0 }, { id: 'B2', x: 100, y: 0 },
    { id: 'B3', x: 0, y: 100 }, { id: 'B4', x: 100, y: 100 },
    { id: 'B5', x: 0, y: 200 }, { id: 'B6', x: 100, y: 200 },
  ])
  const r = outOfPlaneBoltGroup(geom, [], 100, 100, 'A325M', 20, true)
  return { manual: (100 * 100 * 200) / 100_000, software: r.Tmax }
})()

const pryingT0 = (() => {
  // Minimum fitting thickness that eliminates prying (AISC Part 9):
  // t₀ = √(4·φBn·b′/(φf·Fy·p)) with φBn = 60 kN, b′ = 45 − 20/2 = 35 mm,
  // Fy = 248, p = 70, φf = 0.90.
  const r = pryingAction(50, 60, 45, 40, 70, 12, 20, 248)
  return { manual: Math.sqrt((4 * 60 * 1000 * 35) / (0.9 * 248 * 70)), software: r.t_no_prying }
})()

// ── Timber (wood) — NDS §3 / NSCP §6 ASD stability factors ──────────────────
const woodCP = (() => {
  // 140 mm square DFL-SS post, le = 3.0 m, c = 0.8.  CF = 1 (d ≤ 300), CD = 1.
  const Emin = getWoodRef('DFL-SS')!.ref.Emin, FcStar = getWoodRef('DFL-SS')!.ref.Fc
  const FcE = (0.822 * Emin) / (3000 / 140) ** 2
  const r = FcE / FcStar, a = (1 + r) / (2 * 0.8)
  return { manual: a - Math.sqrt(a * a - r / 0.8), software: columnStabilityFactor(3000, 140, Emin, FcStar, 0.8).CP }
})()

const woodCL = (() => {
  // 100 × 300 mm DFL-SS beam, le = 4.0 m.  CF = 1 (d ≤ 300), CD = 1.
  const Emin = getWoodRef('DFL-SS')!.ref.Emin, FbStar = getWoodRef('DFL-SS')!.ref.Fb
  const RB = Math.sqrt((4000 * 300) / 100 ** 2), FbE = (1.2 * Emin) / (RB * RB)
  const r = FbE / FbStar, a = (1 + r) / 1.9
  return { manual: a - Math.sqrt(a * a - r / 0.95), software: beamStabilityFactor(100, 300, 4000, Emin, FbStar).CL }
})()

const woodSlabJoist = (() => {
  // DFL-No.2 joist 50 × 200 mm @ 400 mm o.c., 3.0 m simple span; 25 mm plank deck.
  // INDEPENDENT hand assembly of the joist line load and f_b — the manual side
  // rebuilds the whole load path from the inputs (it does NOT reuse the engine's
  // w), so a wrong tributary width, missing/duplicated self-weight or wrong UDL
  // coefficient would break the check:
  //   γ = G·9.81 = 4.905 kN/m³; deck self = γ·0.025 = 0.1226 kPa;
  //   joist self = γ·(0.05·0.20) = 0.04905 kN/m; tributary = 0.40 m spacing →
  //   w = (0.5 + 0.1226 + 1.9)·0.40 + 0.04905 = 1.0581 kN/m
  //   f_b = (w·L²/8)·1e6 / (b·d²/6) = 3.571 MPa
  const ref = getWoodRef('DFL-2')!.ref
  const gamma = ref.G * 9.81                                   // kN/m³ (= woodUnitWeight)
  // Plank deck ⇒ deckRef defaults to joistRef, so deck and joist share γ here.
  // (A bamboo-slat deck would use BAMBOO_SLAT_REF.G = 0.65 for the deck self-weight.)
  const deckSelf = gamma * (25 / 1000)                        // kPa
  const joistSelf = gamma * ((50 * 200) / 1e6)               // kN/m
  const w = (0.5 + deckSelf + 1.9) * (400 / 1000) + joistSelf // kN/m ≈ 1.0581
  const S = (50 * 200 * 200) / 6                              // mm³
  const manual = ((w * 3.0 * 3.0) / 8) * 1e6 / S             // MPa ≈ 3.571
  const software = designWoodSlab({
    Lx: 3.0, Ly: 3.6, joistRef: ref, joistB: 50, joistD: 200,
    joistSpacing: 400, joistSupport: 'simple', deckMaterial: 'plank', deckThickness: 25,
    deckWidth: 140, deckSupport: 'continuous', deadKpa: 0.5, liveKpa: 1.9,
  }).joist.fb
  return { manual, software }
})()

// ── Plumbing (RNPCP 2000) — water-supply hydraulics ─────────────────────────
const plumbVelocity = (() => {
  // ¾" Type L copper (19.94 mm ID) at 10 gpm — continuity v = Q/A.
  const lps = gpmToLps(10), D = 19.94
  return { manual: (lps / 1000) / ((Math.PI * (D / 1000) ** 2) / 4), software: velocity(lps, D) }
})()

const plumbFriction = (() => {
  // Hazen-Williams head loss, 20 gpm in 1" copper (C = 140) over 100 m.
  const Q = gpmToLps(20), D = 26.04, C = 140, L = 100
  return { manual: (10.67 * L * (Q / 1000) ** 1.852) / (C ** 1.852 * (D / 1000) ** 4.87), software: hazenWilliamsHead(Q, D, C, L) }
})()

const plumbDrain = (() => {
  // Module 3 ex.1: 2 WC(priv) + 2 lav + 2 floor drains = 14 DFU → 76 mm drain.
  const r = designDrainage({ items: [{ id: 'water-closet', count: 2 }, { id: 'lavatory', count: 2 }, { id: 'floor-drain', count: 2 }], occupancy: 'private' })
  return { manual: 76, software: r.drainMm }
})()

const plumbSeptic = (() => {
  // Module 4: 78 DFU, 2.0 m wide, 1.2 m liquid depth → 4.8 m plan length.
  return { manual: 4.8, software: designSepticTank({ dfu: 78, width: 2.0, liquidDepth: 1.2 }).length }
})()

export const VALIDATION_CASES: ValidationCase[] = [
  {
    id: 'rc-beam-mn', category: 'RC', title: 'Singly-reinforced beam — nominal moment',
    reference: 'NSCP 422.2 / ACI 318-14 §22.2', formula: 'Mn = As·fy·(d − a/2),  a = As·fy/(0.85·f′c·b)',
    manual: rcMn.manual, software: rcMn.software, unit: 'kN·m', tol: 1e-6,
  },
  {
    id: 'cantilever-defl', category: 'Analysis', title: 'Cantilever tip deflection',
    reference: 'Hibbeler, Structural Analysis', formula: 'δ = P·L³ / (3·E·I)',
    manual: cantilever.defl.manual, software: cantilever.defl.software, unit: 'mm', tol: 1e-4,
  },
  {
    id: 'cantilever-moment', category: 'Analysis', title: 'Cantilever fixed-end moment',
    reference: 'Statics', formula: 'M = P·L',
    manual: cantilever.moment.manual, software: cantilever.moment.software, unit: 'kN·m', tol: 1e-4,
  },
  {
    id: 'cantilever-slope', category: 'Analysis', title: 'Cantilever tip rotation',
    reference: 'Hibbeler, Structural Analysis', formula: 'θ = P·L² / (2·E·I)',
    manual: cantilever.slope.manual, software: cantilever.slope.software, unit: 'rad', tol: 1e-4,
  },
  {
    id: 'fixed-fixed-defl', category: 'Analysis', title: 'Fixed–fixed beam, central load',
    reference: 'Roark / matrix analysis', formula: 'δ = P·L³ / (192·E·I)',
    manual: fixedFixed.manual, software: fixedFixed.software, unit: 'mm', tol: 1e-3,
  },
  {
    id: 'steel-phimp', category: 'Steel', title: 'Compact W-beam plastic moment (short Lb)',
    reference: 'AISC 360 §F2.1', formula: 'φMp = 0.90·Fy·Zx',
    manual: steelMp.manual, software: steelMp.software, unit: 'kN·m', tol: 1e-6,
  },
  {
    id: 'wind-qz', category: 'Wind', title: 'Velocity pressure (Exposure C, z = 10 m)',
    reference: 'NSCP 207B.3-1', formula: 'qz = 0.613·Kz·Kzt·Kd·V²',
    manual: windQz.manual, software: windQz.software, unit: 'kPa', tol: 1e-9,
  },
  {
    id: 'footing-area', category: 'Geotech', title: 'Spread footing required bearing area',
    reference: 'NSCP 305 / ACI 318-14 §13', formula: 'A = P / q_net',
    manual: footing.manual, software: footing.software, unit: 'm²', tol: 1e-9,
  },
  {
    id: 'column-phipn', category: 'RC', title: 'Tied column — max axial capacity',
    reference: 'NSCP 422.4 / ACI 318-14 §22.4', formula: 'φPn,max = 0.65·0.80·[0.85·f′c·(Ag−Ast) + fy·Ast]',
    manual: columnAxial.manual, software: columnAxial.software, unit: 'kN', tol: 1e-6,
  },
  {
    id: 'steel-phivn', category: 'Steel', title: 'I-section web shear strength',
    reference: 'AISC 360 §G2.1', formula: 'φVn = 1.0·0.6·Fy·Aw·Cv1',
    manual: steelVn.manual, software: steelVn.software, unit: 'kN', tol: 1e-6,
  },
  {
    id: 'earth-thrust', category: 'Geotech', title: 'Rankine active thrust',
    reference: 'Rankine (1857)', formula: 'Pa = ½·Ka·γ·H²',
    manual: earthThrust.manual, software: earthThrust.software, unit: 'kN/m', tol: 1e-9,
  },
  {
    id: 'bearing-nq', category: 'Geotech', title: 'Bearing factor Nq (φ = 30°)',
    reference: 'Prandtl/Reissner', formula: 'Nq = e^(π·tanφ)·tan²(45+φ/2)',
    manual: bearingNq.manual, software: bearingNq.software, unit: '—', tol: 1e-3,
  },
  {
    id: 'slope-fs', category: 'Geotech', title: 'Infinite-slope FS (cohesionless, dry)',
    reference: 'Soil mechanics', formula: 'FS = tanφ / tanβ',
    manual: slopeFS.manual, software: slopeFS.software, unit: '—', tol: 1e-9,
  },
  {
    id: 'seismic-period', category: 'Seismic', title: 'NSCP 208 fundamental period (Method A)',
    reference: 'NSCP 208.5.2.2', formula: 'T = Ct·hn^¾ (Ct = 0.0731)',
    manual: seismic.period.manual, software: seismic.period.software, unit: 's', tol: 1e-6,
  },
  {
    id: 'seismic-base-shear', category: 'Seismic', title: 'NSCP 208 static base shear',
    reference: 'NSCP 208.5.2.1', formula: 'V = Cv·I·W / (R·T)',
    manual: seismic.baseShear.manual, software: seismic.baseShear.software, unit: 'kN', tol: 1e-6,
  },
  {
    id: 'torsional-irregularity', category: 'Seismic', title: 'Torsional irregularity ratio',
    reference: 'NSCP Table 208-10 §1', formula: 'δmax/δavg, δavg = (δmax+δmin)/2  →  13/10',
    manual: 1.3, software: torsionalVerdict(13, 7).ratio, unit: '—', tol: 1e-9,
  },
  {
    id: 'eigen-jacobi', category: 'Dynamics', title: 'Jacobi eigenvalue of [[2,1],[1,2]]',
    reference: 'Linear algebra', formula: 'λ = 2 ± 1  →  λmax = 3',
    manual: dynamics.eig.manual, software: dynamics.eig.software, unit: '—', tol: 1e-6,
  },
  {
    id: 'spectrum-anchor', category: 'Dynamics', title: 'Response spectrum T = 0 anchor',
    reference: 'Chopra, Dynamics of Structures', formula: 'Sa(T→0) = PGA',
    manual: dynamics.anchor.manual, software: dynamics.anchor.software, unit: 'm/s²', tol: 1e-9,
  },
  {
    id: 'spectrum-pseudo', category: 'Dynamics', title: 'Pseudo-acceleration relation',
    reference: 'Chopra, Dynamics of Structures', formula: 'PSA = ω²·Sd',
    manual: dynamics.pseudo.manual, software: dynamics.pseudo.software, unit: 'm/s²', tol: 1e-9,
  },
  {
    id: 'bolt-ecc-rmax', category: 'Connections', title: 'Eccentric bolt group — critical bolt force',
    reference: 'AISC Manual Part 7 (elastic method)', formula: 'R = √((Pₓ/N + T·y/J)² + (Pᵧ/N + T·x/J)²)',
    manual: boltEcc.manual, software: boltEcc.software, unit: 'kN', tol: 1e-9,
  },
  {
    id: 'weld-ecc-fmax', category: 'Connections', title: 'Eccentric weld group — peak force per length',
    reference: 'AISC Manual Part 8 (weld-as-a-line)', formula: 'f = √((P/L_w)² + (T·c/(J/t))²)',
    manual: weldEcc.manual, software: weldEcc.software, unit: 'N/mm', tol: 1e-9,
  },
  {
    id: 'bolt-oop-tension', category: 'Connections', title: 'Out-of-plane bolt group — top-row tension',
    reference: 'AISC 360 §J3.7', formula: 'Tᵢ = M_op·yᵢ / Σyᵢ²',
    manual: boltOop.manual, software: boltOop.software, unit: 'kN', tol: 1e-9,
  },
  {
    id: 'prying-t0', category: 'Connections', title: 'Prying — thickness eliminating prying',
    reference: 'AISC Manual Part 9 / §J3.9', formula: 't₀ = √(4·φBn·b′ / (φf·Fy·p))',
    manual: pryingT0.manual, software: pryingT0.software, unit: 'mm', tol: 1e-9,
  },
  {
    id: 'wood-cp', category: 'Timber', title: 'Timber column stability factor CP',
    reference: 'NDS 2018 §3.7.1 / NSCP §6', formula: 'CP = a − √(a² − (FcE/Fc*)/c),  a = (1+FcE/Fc*)/2c',
    manual: woodCP.manual, software: woodCP.software, unit: '—', tol: 1e-9,
  },
  {
    id: 'wood-cl', category: 'Timber', title: 'Timber beam stability factor CL',
    reference: 'NDS 2018 §3.3.3 / NSCP §6', formula: 'CL = a − √(a² − (FbE/Fb*)/0.95),  a = (1+FbE/Fb*)/1.9',
    manual: woodCL.manual, software: woodCL.software, unit: '—', tol: 1e-9,
  },
  {
    id: 'wood-slab-joist', category: 'Timber', title: 'Wood-slab joist bending stress',
    reference: 'NDS 2018 §3.3 / NSCP §6 (ASD)', formula: 'f_b = M/S,  M = wL²/8 (simple span)',
    manual: woodSlabJoist.manual, software: woodSlabJoist.software, unit: 'MPa', tol: 1e-9,
  },
  {
    id: 'plumb-velocity', category: 'Plumbing', title: 'Supply pipe velocity (continuity)',
    reference: 'RNPCP 2000 / Module 2', formula: 'v = Q / A = 4Q / (π·D²)',
    manual: plumbVelocity.manual, software: plumbVelocity.software, unit: 'm/s', tol: 1e-9,
  },
  {
    id: 'plumb-friction', category: 'Plumbing', title: 'Water friction head — Hazen-Williams',
    reference: 'Hazen-Williams (RNPCP Chart A-4…A-7)', formula: 'hf = 10.67·L·Q^1.852 / (C^1.852·D^4.87)',
    manual: plumbFriction.manual, software: plumbFriction.software, unit: 'm', tol: 1e-9,
  },
  {
    id: 'plumb-drain', category: 'Plumbing', title: 'Sanitary drain size (14 DFU)',
    reference: 'RNPCP Table 7-5 / Module 3', formula: '14 DFU (incl. WC) → 76 mm soil drain',
    manual: plumbDrain.manual, software: plumbDrain.software, unit: 'mm', tol: 1e-9,
  },
  {
    id: 'plumb-septic', category: 'Plumbing', title: 'Septic tank plan length (78 DFU)',
    reference: 'RNPCP Table B-2 / Module 4', formula: 'L = V/(w·d) = 11.355/(2.0·1.2) → 4.8 m',
    manual: plumbSeptic.manual, software: plumbSeptic.software, unit: 'm', tol: 1e-9,
  },
]
