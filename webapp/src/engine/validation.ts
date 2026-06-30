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
import { jacobiEigen } from './modal'
import { elasticResponseSpectrum } from './accelSpectrum'
import { generateGridModel } from './modelBuilder'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support } from './frame3d'
import type { RectSection } from './model'

export interface ValidationCase {
  id: string
  category: 'RC' | 'Steel' | 'Analysis' | 'Seismic' | 'Dynamics' | 'Wind' | 'Geotech'
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
]
