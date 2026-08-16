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
import { felleniusFS, type Slice } from './slopeStability'
import { consolidationSettlement, timeFactor, effectiveStress, stressUnderRect } from './settlement'
import { bromsSand, bromsClay } from './lateralPile'
import { newmarkDirect } from './directTimeHistory'
import { bilinearPath, bilinearCycleEnergy } from './hysteresis'
import { nonlinearFrame } from './nonlinearFrame'
import { computeSeismic } from './seismic'
import { torsionalVerdict } from './irregularity'
import { jacobiEigen } from './modal'
import { elasticResponseSpectrum } from './accelSpectrum'
import { generateGridModel } from './modelBuilder'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support } from './frame3d'
import { solveActiveSet, type AxialMode } from './axialOnly'
import { memberServiceDeflection, tSectionGross } from './memberDeflection'
import { arcLengthFrame } from './arcLength'
import { biaxialProbe, newBiaxialState } from './biaxialHinge'
import { nonlinearFrame3D, type NL3Input } from './nonlinearFrame3d'
import { runBiaxialPushover } from './biaxialFrameModel'
import { Ec as concreteE } from './slabDeflection'
import { solveBoltedConnection } from './boltedConnection'
import { solveWeldedConnection } from './weldedConnection'
import { boltGeomFromPositions, outOfPlaneBoltGroup, pryingAction } from './steelDesign'
import { columnStabilityFactor, beamStabilityFactor, getWoodRef } from './woodDesign'
import { designWoodSlab } from './woodSlab'
import { designSlabOpening } from './slabOpening'
import { shearFrictionSteel } from './wallDetail'
import { designBeamColumnJoint } from './beamColumnJoint'
import { velocity, hazenWilliamsHead, gpmToLps } from './waterSupply'
import { designDrainage } from './drainage'
import { designSepticTank } from './septicTank'
import { cyclicStressRatio, crr75 } from './soils/liquefaction'
import { nGamma, generalBearingCapacity } from './bearingGeneral'
import { coulombKa, mononobeOkabe } from './coulomb'
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

// ── 11. Method of slices — Fellenius FS vs a 3-slice hand calc ───────────────
// c = 10 kPa, φ = 20°; slices b = 2 m at α = −10°/15°/35°, W = 100/150/120 kN/m.
// driving Σ W·sinα = 90.28717 ; resisting Σ c·l + Σ W·cosα·tanφ = 189.7893
//   FS = 189.7893 / 90.28717 = 2.10205
const slopeSlices = (() => {
  const rr = (d: number) => (d * Math.PI) / 180
  const mk = (aDeg: number, W: number): Slice => {
    const alpha = rr(aDeg), b = 2
    return { x: 0, b, h: 1, alpha, W, u: 0, l: b / Math.cos(alpha) }
  }
  const sl = [mk(-10, 100), mk(15, 150), mk(35, 120)]
  return { manual: 2.10205, software: felleniusFS(sl, { c: 10, phiDeg: 20, gamma: 18 }).FS }
})()

// ── 12. Direct-integration MDOF — free-vibration logarithmic decrement ───────
// A damped oscillator released from u₀ = 1 returns, one damped period later, to
// u/u₀ = exp(−2πζ/√(1−ζ²)). Integrated here through the FULL MDOF Newmark path
// (1×1 system) with Rayleigh mass-proportional damping α = 2ζω.
const directDecay = (() => {
  const omega = 3.0, zeta = 0.05, dt = 0.001
  const idx = Math.round((2 * Math.PI) / omega / dt)
  const zeros = Array.from({ length: idx + 5 }, () => [0])
  const r = newmarkDirect([[1]], [[2 * zeta * omega]], [[omega * omega]], zeros, dt, { u0: [1] })
  return {
    manual: Math.exp((-2 * Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)),
    software: r ? r.u[idx][0] : NaN,
  }
})()

// ── 13. Hysteretic loop energy — 4·Fy·(A − u_y) per steady-state cycle ───────
// Elastic-perfectly-plastic spring, k₀ = 100, Fy = 10 (u_y = 0.1), cycled to
// A = 0.4. The measured loop area is taken as (energy after one full cycle)
// minus (energy of the virgin half-excursion), matching the closed form's
// steady-state definition.
const hystLoop = (() => {
  const p = { k0: 100, Fy: 10 }
  const A = 0.4
  const seg = (pts: number[], from: number, to: number) => {
    for (let i = 1; i <= 400; i++) pts.push(from + ((to - from) * i) / 400)
  }
  const first: number[] = []; seg(first, 0, A)
  const cyc = [...first]; seg(cyc, A, -A); seg(cyc, -A, A)
  const e1 = bilinearPath(first, p).state.dissipated
  const e2 = bilinearPath(cyc, p).state.dissipated
  return { manual: bilinearCycleEnergy(A, p), software: e2 - e1 }
})()

// ── 13a. Cracked service deflection — moment-diagram integration ≡ 5wL⁴/384EI ─
// A simply supported span carrying a uniform service load: integrating the
// member's own M/EcIe diagram twice must reproduce the textbook coefficient.
// Kept UNCRACKED (Ma < Mcr) so the closed form applies exactly — the cracked
// path only swaps Ig for Branson's Ie in the same integral.
const beamDeflIntegration = (() => {
  const L = 7, b = 300, h = 500, fc = 28, w = 3      // m, mm, mm, MPa, kN/m
  const N = 400
  const xs = Array.from({ length: N + 1 }, (_, k) => (L * k) / N)
  const M = xs.map((x) => (w * x * (L - x)) / 2)
  const r = memberServiceDeflection({
    xs, MD: M, ML: xs.map(() => 0), L, b, h, d: 437.5, As: 1200, fc, support: 'simple',
  })
  const EI = concreteE(fc) * ((b * h ** 3) / 12) * 1e-9      // kN·m²
  return { manual: ((5 * w * L ** 4) / (384 * EI)) * 1000, software: r.deltaD }
})()

// ── 13c. Arc-length path following — peak λ IS the collapse load ────────────
// Load control cannot reach the peak (no equilibrium exists above it) and has
// to bracket it by the last converged step. Arc-length walks THROUGH the limit
// point on the sign of det(Kt), so the peak of the traced path is a directly
// reported number and must equal the rigid-plastic cantilever mechanism Mp/L.
// The hinge is PERFECTLY plastic (b = 0) so the plateau is exactly Mp/L; with
// hardening the peak legitimately rises above it and the comparison would be
// against the wrong reference, not a solver error.
const arcCollapse = (() => {
  const E = 200000, I = 1e8, A = 1e4, L = 3, Mp = 100
  const r = arcLengthFrame({
    nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: L, y: 0 }],
    members: [{ id: 'm', i: 'n1', j: 'n2', E, I, A, Mp, b: 0 }],
    supports: [{ node: 'n1', type: 'fixed' }],
    loads: [{ node: 'n2', Fy: -1 }],
    controlNode: 'n2', controlDir: 'y',
    arcLength: 0.002, arcSteps: 300, dispStop: 0.3,
  })
  return { manual: Mp / L, software: r ? r.peakLambda : NaN }
})()

// NOTE on Boussinesq: the tabulated corner factor (0.1752 at m = n = 1) is
// published to four decimals, so it cannot meet this page's 0.01% bar — the
// gap is the table's rounding, not the engine's error. That comparison lives in
// `settlement.test.ts` at the precision the reference actually carries, rather
// than being forced in here by loosening the gate.

// ── 11c. Terzaghi 1-D consolidation of a normally consolidated layer ────────
// Sc = Cc·H/(1+e₀)·log₁₀((σ′₀+Δσ)/σ′₀) evaluated at mid-height — the textbook
// hand calculation. Driving the engine with ONE slice makes it evaluate at the
// same point, so any difference is a formula error, not a discretisation one.
const consolidation = (() => {
  const H = 2, gamma = 18, e0 = 0.9, Cc = 0.3, q = 100, B = 2, L = 2
  const layers = [{ H, gamma, e0, Cc }]
  const zMid = H / 2
  const s0 = effectiveStress(layers, zMid)
  const sf = s0 + stressUnderRect(q, B, L, zMid)
  return {
    manual: ((Cc * H) / (1 + e0)) * Math.log10(sf / s0) * 1000,
    software: consolidationSettlement({ layers, q, B, L, slices: 1 }).total,
  }
})()

// ── 11d. Consolidation time factor at U = 90% ───────────────────────────────
// Tv = 1.781 − 0.933·log₁₀(100 − U%) → 0.848, the standard tabulated value.
const tv90 = (() => ({ manual: 0.848, software: timeFactor(0.9) }))()

// ── 11e. Broms short free-head pile in sand ────────────────────────────────
// Moments about the toe: the triangular 3·Kp·γ·z·d resultant is 1.5·Kp·γ·d·L²
// acting L/3 above the toe, so H(e+L) = 0.5·Kp·γ·d·L³. The published closed
// form, derived independently here from the resultant and its lever arm.
const bromsSandShort = (() => {
  const L = 10, d = 0.6, gamma = 10, phiDeg = 32, e = 1.5
  const Kp = Math.tan(((45 + phiDeg / 2) * Math.PI) / 180) ** 2
  const P = 1.5 * Kp * gamma * d * L * L      // resultant, kN
  return {
    manual: (P * (L / 3)) / (e + L),
    software: bromsSand({ L, d, gamma, phiDeg, e, My: 1e12 }).shortPile,
  }
})()

// ── 11f. Broms short free-head pile in clay — the 0.414 result ─────────────
// With the load at ground level and the 1.5d gap zone collapsed, the free-head
// rigid-pile equilibrium has the exact answer H = (√2 − 1)·q·L. Reproducing it
// checks the derivation rather than a remembered chart value.
const bromsClayShort = (() => {
  const L = 10, cu = 40, d = 1e-9
  const q = 9 * cu * d
  return {
    manual: (Math.SQRT2 - 1) * q * L,
    software: bromsClay({ L, d, cu, My: 1e12, e: 0 }).shortPile,
  }
})()

// ── 12b. T-section gross inertia — composite vs the transfer-axis identity ──
// A monolithic beam and its slab form a T for stiffness. The engine sums the
// two rectangles about the centroid; the reference builds the SAME section's
// inertia about the top fibre and transfers it with I_c = I_top − A·ȳ². Two
// different pieces of algebra for one number, so agreement is a real check
// rather than a restatement.
const tBeamGross = (() => {
  const b = 300, h = 600, bf = 1000, hf = 120
  const hw = h - hf, Af = bf * hf, Aw = b * hw
  const yf = hf / 2, yw = hf + hw / 2, A = Af + Aw
  const Itop = (bf * hf ** 3) / 12 + Af * yf ** 2 + (b * hw ** 3) / 12 + Aw * yw ** 2
  const yBar = (Af * yf + Aw * yw) / A
  return { manual: (Itop - A * yBar ** 2) / 1e6, software: tSectionGross({ b, h, bf, hf }).Ig / 1e6 }
})()

// ── 13c-bis. Biaxial hinge — the return map must land on the published surface
// Orbison's surface (McGuire/Gallagher/Ziemian Eq. 10.18) can be solved in
// closed form on either bending axis, because setting the other normalised
// moment to zero collapses it to a quadratic. Pushing the hinge far past yield
// about the strong axis alone must therefore reproduce
//     m_z = √((1 − 1.15p²) / (1 + 3.67p²))
// exactly. This checks the closest-point projection against the SURFACE ITSELF
// rather than against another solver, so it is a true external reference.
const biaxOrbison = (() => {
  const Mpz = 200, p = 0.3, p2 = p * p
  const r = biaxialProbe(0, 0.01, newBiaxialState(), {
    k0y: 1e5, k0z: 1e5, Mpy: 100, Mpz, p, surface: { kind: 'orbison' },
  })
  return { manual: Math.sqrt((1 - 1.15 * p2) / (1 + 3.67 * p2)) * Mpz, software: r.Mz }
})()

// ── 13c-ter. Biaxial hinge — skew projection onto the circular surface ───────
// With equal capacities the α = 2 surface is a CIRCLE of radius Mp, so a 45°
// radial push must project to Mp/√2 on each axis. Two uncoupled 1-D hinges
// would instead report Mp on each — 41% unconservative — which is the whole
// reason the coupled surface exists.
const biaxSkew = (() => {
  const Mp = 100
  const r = biaxialProbe(0.01, 0.01, newBiaxialState(), { k0y: 1e5, k0z: 1e5, Mpy: Mp, Mpz: Mp })
  return { manual: Mp / Math.SQRT2, software: r.My }
})()

// ── 13c-quater. Space frame with biaxial hinges — skew cantilever collapse ──
// A cantilever pushed at angle α in its local y′–z′ plane puts My = P·L·sinα
// and Mz = P·L·cosα on the base hinge, so the elliptical yield surface fixes
// the mechanism load in closed form:
//     P = 1 / (L·√((sinα/Mpy)² + (cosα/Mpz)²))
// Two UNCOUPLED 1-D hinges would instead report min(Mpy/sinα, Mpz/cosα)·(1/L)
// — 41% high at 45° with equal capacities — so this is the check that the
// coupling actually reaches the frame level and is not just in the hinge law.
// A token hardening (b = 1e-6) keeps the mechanism tangent non-singular; it
// lifts the plateau by ~1e-6 relative, which is inside the tolerance below.
const biaxSkewFrame = (() => {
  const E = 200000, G = 77000, A = 1e4, Iy = 5e7, Iz = 1e8, J = 1e6
  const L = 3, Mpy = 100, Mpz = 200, a = Math.PI / 4, b = 1e-6
  const inp: NL3Input = {
    nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }],
    members: [{ id: 'm', i: 'a', j: 'b', E, G, A, Iy, Iz, J, Mpy, Mpz, by: b, bz: b }],
    supports: [{ node: 'a', fixity: 'fixed' }],
    loads: [{ node: 'b', Fy: -Math.cos(a), Fz: -Math.sin(a) }],
    controlNode: 'b', controlDir: 'y', control: 'displacement', dispMax: 0.2, steps: 200,
  }
  const r = nonlinearFrame3D(inp)
  const peak = r ? Math.max(...r.steps.filter((s) => s.converged).map((s) => Math.abs(s.lambda))) : NaN
  return { manual: 1 / (L * Math.hypot(Math.sin(a) / Mpy, Math.cos(a) / Mpz)), software: peak }
})()

// ── 13c-quinquies. Biaxial pushover on the real 3-D model — plan symmetry ───
// A square-plan frame with square sections is 4-fold symmetric, so pushing it
// along +X and along +Z are the SAME problem relabelled and the capacity curves
// must coincide exactly. No closed form is involved; the value of the check is
// that it is exact, and that essentially every way of getting the 3-D bridge
// wrong — a swapped local axis, a mis-projected hinge, an axis-preferring
// control scheme — breaks it. It also guards the convergence fix: a push that
// silently fails to converge reports a capacity that is not symmetric.
const biaxPlanSymmetry = (() => {
  const sec = { id: 's', name: 's', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const model = generateGridModel({ baysX: [5], baysZ: [5], storeyH: [3, 3], section: sec })
  const at = (angleDeg: number) => runBiaxialPushover(model, { angleDeg, steps: 8 })?.peakShear ?? NaN
  return { manual: at(0), software: at(90) }
})()

// ── 13d. Smooth-material arc-length — same collapse load as the plastic law ──
// The C^∞ hinge backbone rounds the corner of the bilinear law, so the question
// is whether that costs limit capacity. For a PERFECTLY PLASTIC hinge it does
// not: both asymptotes are the same plateau, and the traced peak lands on the
// rigid-plastic cantilever mechanism Mp/L just as the bilinear material does.
const arcSmoothCollapse = (() => {
  const E = 200000, I = 1e8, A = 1e4, L = 3, Mp = 100
  const r = arcLengthFrame({
    nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: L, y: 0 }],
    members: [{ id: 'm', i: 'n1', j: 'n2', E, I, A, Mp, b: 0 }],
    supports: [{ node: 'n1', type: 'fixed' }],
    loads: [{ node: 'n2', Fy: -1 }],
    controlNode: 'n2', controlDir: 'y',
    material: 'smooth', arcLength: 5e-4, arcSteps: 900, dispStop: 0.06,
  })
  return { manual: Mp / L, software: r ? r.peakLambda : NaN }
})()

// ── 13b. Tension-only cross-brace — active set ≡ removing the slack brace ────
// The active-set iteration's entire claim is that a limited member which
// violates its mode contributes nothing. The independent check is therefore a
// SEPARATE model with that diagonal physically deleted: the two lateral drifts
// must agree to solver precision. A cross-braced bay pushed +X: d14 is
// stretched, d23 shortened, so a tension-only d23 must drop out.
const braceActiveSet = (() => {
  const E = 200000, G = 76900
  const col = { A: 5000, Iy: 2e7, Iz: 2e7, J: rectJ(70, 70) }
  const brc = { A: 1200, Iy: 1e5, Iz: 1e5, J: rectJ(30, 30) }
  const nodes: F3Node[] = [
    { id: 'n1', x: 0, y: 0, z: 0 }, { id: 'n2', x: 4, y: 0, z: 0 },
    { id: 'n3', x: 0, y: 3, z: 0 }, { id: 'n4', x: 4, y: 3, z: 0 },
  ]
  const all: F3Member[] = [
    { id: 'c13', i: 'n1', j: 'n3', E, G, ...col },
    { id: 'c24', i: 'n2', j: 'n4', E, G, ...col },
    { id: 'b34', i: 'n3', j: 'n4', E, G, ...col },
    { id: 'd14', i: 'n1', j: 'n4', E, G, ...brc },
    { id: 'd23', i: 'n2', j: 'n3', E, G, ...brc },
  ]
  const sup: F3Support[] = [{ node: 'n1', fixity: 'fixed' }, { node: 'n2', fixity: 'fixed' }]
  const load = [{ kind: 'node' as const, node: 'n3', Fx: 50, cat: 'E' as const }]
  const modes = new Map<string, AxialMode>([['d14', 'tension-only'], ['d23', 'tension-only']])
  const act = solveActiveSet(nodes, all, sup, load, modes)
  const cut = solveFrame3D(nodes, all.filter((m) => m.id !== (act?.inactive[0] ?? '')), sup, load)
  return { manual: cut ? cut.d[6 * 2] * 1000 : NaN, software: act ? act.result.d[6 * 2] * 1000 : NaN }
})()

// ── 14. Plastic collapse of a fixed–fixed beam — 3-hinge mechanism ───────────
// Central point load, span L: the work equation P·(L/2)·θ = 4·Mp·θ gives the
// rigid-plastic collapse load P = 8·Mp/L. Recovered here by pushing the
// concentrated-hinge frame solver until the mechanism forms (the reported value
// is the first load step at which a hinge yields, so it lands within one
// increment above the exact answer).
const plasticCollapse = (() => {
  const E = 200000, I = 1e8, A = 1e4, Mp = 100, L = 6
  // "does the mechanism form at this load?" — bisected, so the reported value is
  // not limited by a load-step size (and the bracket is not tuned to the answer).
  const yieldsAt = (lambda: number): boolean => {
    const r = nonlinearFrame({
      nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'c', x: L / 2, y: 0 }, { id: 'b', x: L, y: 0 }],
      members: [
        { id: 'm1', i: 'a', j: 'c', E, I, A, Mp, b: 1e-4 },
        { id: 'm2', i: 'c', j: 'b', E, I, A, Mp, b: 1e-4 },
      ],
      supports: [{ node: 'a', type: 'fixed' }, { node: 'b', type: 'fixed' }],
      loads: [{ node: 'c', Fy: -1 }],
      controlNode: 'c', controlDir: 'y', schedule: [lambda],
    })
    return (r?.steps[0]?.hinges ?? 0) > 0
  }
  let lo = 0, hi = 400
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    if (yieldsAt(mid)) hi = mid; else lo = mid
  }
  return { manual: (8 * Mp) / L, software: (lo + hi) / 2 }
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

// ── Slab opening trimmer bars — NSCP §408.5.4.2 + §425.4.2.3 ────────────────
const slabOpeningTrimmer = (() => {
  // 6.0 × 5.0 m panel, h = 150 mm, ⌀12 @ 200 mat both ways, f'c 21 / fy 415,
  // opening 1.00 × 0.80 m at (2.50, 2.00) — clear of both column strips.
  //
  // The manual side rebuilds the whole replacement bar from the inputs: the
  // §425.4.2.3 development length from its own formula (cb = min(cover + db/2,
  // s/2) = 26 mm, Ktr = 0 in a mat, ψt = ψe = λ = 1, ψs = 0.8 for db ≤ 20), and
  // the bar as the opening plus ℓd beyond each face. It does NOT call
  // calcDevLength, so a wrong confinement term or a dropped ψ shows up here.
  const db = 12, fc = 21, fy = 415, s = 200, cover = 20
  const cb = Math.min(cover + db / 2, s / 2)
  const ld = (fy * 0.8 * db) / (1.1 * Math.sqrt(fc) * (cb / db))
  const r = designSlabOpening({
    lx: 6, ly: 5, h: 150, barDia: db, spacingX: s, spacingY: s, cover, fc, fy,
    opening: { id: 'O1', kind: 'rect', x: 2.5, y: 2.0, w: 1.0, h: 0.8 },
  })
  return { manual: 1000 + 2 * ld, software: r.x.barLength }
})()

// ── Shear friction across a wall construction joint — NSCP §422.9 ──────────
const shearFrictionJoint = (() => {
  // 3.00 m × 200 mm wall web, Vu = 400 kN across a joint intentionally
  // roughened to a 6 mm amplitude (μ = 1.0λ, Table 422.9.4.2), fy = 415 MPa.
  //
  // The manual side is the clause written out: Vn = μ·Avf·fy with φ = 0.75, so
  // Avf = (Vu/φ)/(μ·fy). It also re-derives the §422.9.4.4 ceiling from its
  // three limbs rather than reading the engine's answer back.
  const Vu = 400, fy = 415, mu = 1.0
  const manual = ((Vu / 0.75) * 1000) / (mu * fy)
  const r = shearFrictionSteel({ Vu, Ac: 3000 * 200, fc: 21, fy, surface: 'roughened' })
  return { manual, software: r.Avf }
})()

// ── Beam–column joint shear — NSCP §418.8.4 ────────────────────────────────
const jointShear = (() => {
  // 400 × 400 column, 250 × 300 beam framing in one side with 2-⌀28 top bars,
  // joint confined on three faces, f'c 21 / fy 415.
  //
  // The manual side writes both clauses out — φγλ√f'c·Aj for the strength and
  // 1.25·fy·As for the demand — and takes the effective width from its own
  // least-of rather than from the engine. The pair is reported as the ratio
  // Vu/φVn so one row exercises both halves of the check.
  const fc = 21, fy = 415, colB = 400, colH = 400, beamB = 250, db = 28
  const bj = Math.min(beamB + colH, beamB + colB, colB)      // 400
  const Aj = bj * colH
  const phiVn = 0.85 * 1.2 * Math.sqrt(fc) * Aj / 1000       // kN
  const As = 2 * (Math.PI / 4) * db * db
  const Vu = (1.25 * fy * As) / 1000                          // kN
  const r = designBeamColumnJoint({
    colB, colH, colBarDia: 20, colBars: 8, hoopDia: 10, hoopSpacing: 100,
    beamB, beamH: 300, beamBarDia: db, topBars: 2, botBars: 2,
    confinement: 'three-faces', fc, fy, cover: 40,
  })
  return { manual: Vu / phiVn, software: r.Vu / r.phiVn }
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
    id: 'slope-slices-fellenius', category: 'Geotech', title: 'Method of slices — Fellenius FS',
    reference: 'Fellenius / OMS', formula: 'FS = Σ[c·l + (W·cosα − u·l)·tanφ] / Σ[W·sinα]',
    manual: slopeSlices.manual, software: slopeSlices.software, unit: '—', tol: 1e-3,
  },
  {
    id: 'coulomb-reduces-to-rankine', category: 'Geotech', title: 'Coulomb Ka at δ = θ = β = 0',
    reference: 'Coulomb (1776); reduction to Rankine', formula: 'Ka → tan²(45 − φ/2) when δ = θ = β = 0',
    manual: rankineKa(30), software: coulombKa({ phiDeg: 30 }), unit: '—', tol: 1e-12,
  },
  {
    id: 'coulomb-ka-wall-friction', category: 'Geotech', title: 'Coulomb Ka with wall friction (φ 30°, δ 20°)',
    reference: 'Das §7, Coulomb active', formula: 'Ka = cos²(φ−θ) / {cos²θ cos(δ+θ)[1 + √(…)]²}',
    manual: 0.29731, software: coulombKa({ phiDeg: 30, deltaDeg: 20 }), unit: '—', tol: 1e-4,
  },
  {
    id: 'mononobe-okabe-kae', category: 'Geotech', title: 'Mononobe–Okabe Kae (kh = 0.2)',
    reference: 'Mononobe–Okabe; Seed & Whitman', formula: 'ψ = arctan[kh/(1−kv)];  Kae per M–O',
    manual: 0.45396,
    software: mononobeOkabe({ phiDeg: 30, deltaDeg: 20, gamma: 18, H: 5, kh: 0.2 }).K,
    unit: '—', tol: 1e-4,
  },
  {
    id: 'bearing-ngamma-vesic', category: 'Geotech', title: 'Nγ — Vesić (φ = 35°)',
    reference: 'Vesić (1973); Das Table 3.3', formula: 'Nγ = 2(Nq + 1)tanφ',
    manual: 48.029, software: nGamma(35, 'vesic'), unit: '—', tol: 1e-3,
  },
  {
    id: 'bearing-ngamma-meyerhof', category: 'Geotech', title: 'Nγ — Meyerhof (φ = 35°)',
    reference: 'Meyerhof (1963); Das Table 3.3', formula: 'Nγ = (Nq − 1)tan(1.4φ)',
    manual: 37.152, software: nGamma(35, 'meyerhof'), unit: '—', tol: 1e-3,
  },
  {
    id: 'bearing-general-qult', category: 'Geotech', title: 'General bearing equation (Vesić, square)',
    reference: 'Das §3, Vesić factors', formula: 'qu = q·Nq·sq·dq + ½γB·Nγ·sγ  (c = 0)',
    // 2×2 m at Df = 1.5 m, φ = 32°, γ = 18 kN/m³, dry, vertical concentric load.
    manual: 1553.72,
    software: generalBearingCapacity({ c: 0, phiDeg: 32, gamma: 18, B: 2, L: 2, Df: 1.5, method: 'vesic' }).qult,
    unit: 'kPa', tol: 1e-3,
  },
  {
    id: 'liq-csr', category: 'Geotech', title: 'Liquefaction cyclic stress ratio',
    reference: 'Youd et al. (2001) NCEER eq. 2', formula: "CSR = 0.65(a_max/g)(σv0/σ'v0)·rd",
    // 6 m in sand, WT 1.5 m, γ = 18/20 kN/m³, a_max = 0.40 g:
    //   σv0 = 117.0, σ'v0 = 72.855, rd = 1 − 0.00765(6) = 0.95410
    //   CSR = 0.65(0.40)(117/72.855)(0.95410) = 0.39838
    manual: 0.39838, software: cyclicStressRatio(0.40, 117.0, 72.855, 6), unit: '—', tol: 1e-4,
  },
  {
    id: 'liq-crr', category: 'Geotech', title: 'Liquefaction clean-sand resistance at (N₁)₆₀ = 10',
    reference: 'Youd et al. (2001) NCEER eq. 4', formula: '1/(34−N) + N/135 + 50/(10N+45)² − 1/200',
    // The published clean-sand base curve is read at CRR ≈ 0.113 for N = 10.
    manual: 0.11312, software: crr75(10) ?? NaN, unit: '—', tol: 1e-4,
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
    id: 'plastic-collapse-fixed-beam', category: 'Analysis', title: 'Plastic collapse — fixed–fixed beam',
    reference: 'Limit analysis (Neal)', formula: 'P = 8·Mp/L (3-hinge mechanism)',
    manual: plasticCollapse.manual, software: plasticCollapse.software, unit: 'kN', tol: 2e-3,
  },
  {
    id: 'hysteretic-loop-energy', category: 'Dynamics', title: 'Hysteretic loop energy per cycle',
    reference: 'Chopra, Dynamics of Structures §7', formula: 'E = 4·Fy·(A − u_y)',
    manual: hystLoop.manual, software: hystLoop.software, unit: 'kN·m', tol: 1e-6,
  },
  {
    id: 'direct-th-decay', category: 'Dynamics', title: 'Direct-integration free-vibration decay',
    reference: 'Chopra, Dynamics of Structures', formula: 'u(T)/u₀ = exp(−2πζ/√(1−ζ²))',
    manual: directDecay.manual, software: directDecay.software, unit: '—', tol: 1e-3,
  },
  {
    id: 'beam-defl-integration', category: 'RC', title: 'Service deflection by moment-diagram integration',
    reference: 'NSCP 424.2 / ACI 318-14 §24.2', formula: 'δ = ∬(M/EcIe) dx  ≡  5wℓ⁴/384EcIg (uncracked SS span)',
    manual: beamDeflIntegration.manual, software: beamDeflIntegration.software, unit: 'mm', tol: 1e-4,
  },
  {
    id: 'broms-sand-short', category: 'Geotech', title: 'Broms short free-head pile in sand',
    reference: 'Broms (1964b)', formula: 'H·(e+L) = 0.5·Kp·γ·d·L³  (resultant 1.5·Kp·γ·d·L² at L/3)',
    manual: bromsSandShort.manual, software: bromsSandShort.software, unit: 'kN', tol: 1e-9,
  },
  {
    id: 'broms-clay-short', category: 'Geotech', title: 'Broms short free-head pile in clay',
    reference: 'Broms (1964a)', formula: 'H = (√2 − 1)·q·L,  q = 9·cu·d, load at ground level',
    manual: bromsClayShort.manual, software: bromsClayShort.software, unit: 'kN', tol: 1e-6,
  },
  {
    id: 'consolidation-nc', category: 'Geotech', title: 'Primary consolidation — normally consolidated layer',
    reference: 'Terzaghi 1-D consolidation', formula: 'Sc = Cc·H/(1+e₀)·log₁₀((σ′₀+Δσ)/σ′₀)',
    manual: consolidation.manual, software: consolidation.software, unit: 'mm', tol: 1e-9,
  },
  {
    id: 'consolidation-tv90', category: 'Geotech', title: 'Consolidation time factor at U = 90%',
    reference: 'Terzaghi', formula: 'Tv = 1.781 − 0.933·log₁₀(100 − U%)',
    manual: tv90.manual, software: tv90.software, unit: '—', tol: 1e-9,
  },
  {
    id: 'tbeam-gross-inertia', category: 'RC', title: 'T-section gross inertia — composite section',
    reference: 'Parallel-axis theorem (NSCP 424.2 / ACI 318-14 §24.2)',
    formula: 'I_c = Σ(I_i + A_i·y_i²) − A·ȳ²,  300×600 web + 1000×120 flange',
    manual: tBeamGross.manual, software: tBeamGross.software, unit: '×10⁶ mm⁴', tol: 1e-9,
  },
  {
    id: 'arc-length-collapse', category: 'Analysis', title: 'Arc-length peak load — cantilever mechanism',
    reference: 'Limit analysis (rigid-plastic)', formula: 'λpeak = Mp / L',
    manual: arcCollapse.manual, software: arcCollapse.software, unit: 'kN', tol: 1e-9,
  },
  {
    id: 'arc-length-smooth-collapse', category: 'Analysis', title: 'Smooth-hinge arc-length peak — cantilever mechanism',
    reference: 'Limit analysis (rigid-plastic)', formula: 'λpeak = Mp / L, C^∞ backbone',
    manual: arcSmoothCollapse.manual, software: arcSmoothCollapse.software, unit: 'kN', tol: 1e-5,
  },
  {
    id: 'biaxial-orbison-contour', category: 'Analysis', title: 'Biaxial hinge — Orbison contour under axial load',
    reference: 'McGuire/Gallagher/Ziemian, Matrix Structural Analysis Eq. 10.18',
    formula: 'm_z = √((1 − 1.15p²)/(1 + 3.67p²)),  p = 0.3',
    manual: biaxOrbison.manual, software: biaxOrbison.software, unit: 'kN·m', tol: 1e-9,
  },
  {
    id: 'biaxial-skew-projection', category: 'Analysis', title: 'Biaxial hinge — 45° projection onto the circular surface',
    reference: 'Closest-point projection (Simo & Hughes Box 3.2)', formula: 'M = Mp/√2 per axis',
    manual: biaxSkew.manual, software: biaxSkew.software, unit: 'kN·m', tol: 1e-9,
  },
  {
    id: 'biaxial-frame-skew-collapse', category: 'Analysis', title: 'Biaxial hinge frame — skew cantilever collapse',
    reference: 'Limit analysis on the P–M–M surface', formula: 'P = 1/(L·√((sinα/Mpy)² + (cosα/Mpz)²)), α = 45°',
    manual: biaxSkewFrame.manual, software: biaxSkewFrame.software, unit: 'kN', tol: 1e-4,
  },
  {
    id: 'biaxial-plan-symmetry', category: 'Analysis', title: 'Biaxial pushover — plan symmetry of a square frame',
    reference: 'Equivalent-model check (no closed form)', formula: 'peak base shear at 0° ≡ at 90° (4-fold symmetric plan)',
    manual: biaxPlanSymmetry.manual, software: biaxPlanSymmetry.software, unit: 'kN', tol: 1e-9,
  },
  {
    id: 'brace-active-set', category: 'Analysis', title: 'Tension-only brace — active set vs slack brace removed',
    reference: 'Equivalent-model check (no closed form)', formula: 'Δ(active set) = Δ(model without the slack diagonal)',
    manual: braceActiveSet.manual, software: braceActiveSet.software, unit: 'mm', tol: 1e-9,
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
    id: 'slab-opening-trimmer', category: 'RC', title: 'Slab opening — trimmer bar length',
    reference: 'NSCP 408.5.4.2 / ACI 318-14 §8.5.4.2 + §25.4.2.3',
    formula: 'L = w_opening + 2·ℓd,  ℓd = fy·ψt·ψe·ψs·db / (1.1·λ·√f′c·(cb+Ktr)/db)',
    manual: slabOpeningTrimmer.manual, software: slabOpeningTrimmer.software, unit: 'mm', tol: 1e-9,
  },
  {
    id: 'shear-friction-avf', category: 'RC', title: 'Shear friction — steel across a construction joint',
    reference: 'NSCP 422.9 / ACI 318-14 §22.9, Table 422.9.4.2',
    formula: 'Avf = (Vu/φ) / (μ·fy),  μ = 1.0λ roughened to 6 mm, φ = 0.75',
    manual: shearFrictionJoint.manual, software: shearFrictionJoint.software, unit: 'mm²', tol: 1e-9,
  },
  {
    id: 'joint-shear-ratio', category: 'RC', title: 'Beam–column joint — shear utilisation',
    reference: 'NSCP 418.8.4 / ACI 318-14 §18.8, Table 418.8.4.3',
    formula: 'Vu/φVn,  Vu = 1.25·fy·As,  φVn = 0.85·γ·λ·√f′c·bj·h',
    manual: jointShear.manual, software: jointShear.software, unit: '—', tol: 1e-9,
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
