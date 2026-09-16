// ─────────────────────────────────────────────────────────────────────────
// MEMBER STRESS RECOVERY — the frame's internal forces, expressed as stress
// on the cross-section that carries them.
//
// `frame3d` already recovers N, Vy, Vz, T, My, Mz at 25+ stations along every
// member, and the viewport draws those as force diagrams. This module turns the
// SAME arrays into stress: it never re-derives an internal force, so the
// contour and the diagram cannot disagree about what the member is carrying.
// A stress plot that quietly ran its own statics would be a second opinion, and
// the one nobody is looking at is the one that drifts.
//
// THE SECTION IS THE GROSS SECTION, DELIBERATELY. `BridgeOpts.crackedSections`
// hands the solver 0.35·Ig for beams and 0.70·Ig for columns (ACI 318-14
// §6.6.3.1.1) — a STIFFNESS idealisation that changes how force distributes
// around a redundant frame. It does not change the piece of concrete. Computing
// σ = M·c/I on the cracked I would report roughly three times the real stress
// on every beam. So the forces come from the (possibly cracked) analysis, which
// is right, and the stresses put those forces on the real section, which is
// also right. The two are consistent; using the cracked I in both would not be.
//
// Units, stated because this module is where three conventions meet:
//   forces   kN and kN·m           (as `F3MemberResult` carries them)
//   geometry mm, mm², mm⁴, mm³     (as the section library carries them)
//   stress   MPa = N/mm²
// ─────────────────────────────────────────────────────────────────────────
import type { RectSection } from './model'
import { shapeByName, type AiscShape } from './aiscSections'
import { sectionProps } from './modelBridge'

/** Internal forces at one station. kN / kN·m, local member axes. */
export interface MemberForces {
  N: number     // + tension
  Vy: number; Vz: number
  T: number
  My: number; Mz: number
}

/**
 * The section outline, as the shape stress is actually integrated over.
 *
 * Kept separate from the section PROPERTIES (A, Iy, Iz) on purpose: the
 * properties come from the AISC table and the outline from the shape's
 * dimensions, so integrating over the outline is an independent check on the
 * properties rather than a restatement of them. See `sectionResultants`.
 */
export type SectionGeom =
  | { kind: 'rect'; b: number; h: number }
  /** d deep (along y′) × bf wide (along z′), flanges tf, web tw. */
  | { kind: 'wide-flange'; d: number; bf: number; tf: number; tw: number }
  | { kind: 'hss-rect'; b: number; h: number; t: number }
  /** Solid when t is absent. */
  | { kind: 'round'; D: number; t?: number }

/** A point on the section where stress is evaluated. */
export interface Fibre {
  /** Distance from the centroid along local y′ (the section DEPTH), mm. */
  y: number
  /** Distance from the centroid along local z′ (the section WIDTH), mm. */
  z: number
  label: string
  /**
   * Shear-flow data for VQ/(I·t), one pair per transverse direction.
   *
   * `Qz`/`tz` carry Vy (shear down the depth, pairing with Mz); `Qy`/`ty` carry
   * Vz. Absent ⇒ this fibre is a FREE SURFACE and carries no shear from that
   * direction — which is the case at every extreme fibre, and is why the
   * largest normal stress and the largest shear stress are never at the same
   * point on the section.
   */
  Qz?: number; tz?: number
  Qy?: number; ty?: number
}

export interface StressSection {
  geom: SectionGeom
  /** mm², mm⁴ — from the section library, NOT from `geom`. */
  A: number; Iy: number; Iz: number; J: number
  /** Torsional section modulus, mm³: τ_torsion = |T| / Ct. */
  Ct: number
  fibres: Fibre[]
  /**
   * False when a bounding box stood in for a shape whose dimensions the
   * library does not carry. The stresses are then indicative, and the caller
   * is expected to say so rather than print them as if they were the section's.
   */
  exact: boolean
  /** Extreme-fibre distances, mm. */
  cy: number; cz: number
}

// ── stress at a point ──────────────────────────────────────────────────────

/**
 * Normal stress at (y, z) on the section, MPa. Positive is TENSION.
 *
 *   σ = N/A − Mz·y/Iz + My·z/Iy
 *
 * THE TWO SIGNS ARE NOT THE SAME, AND THEY WERE MEASURED, NOT REASONED.
 * `frame3d` recovers the two bending planes with opposite conventions —
 * dMz/dx = +Vy but dMy/dx = −Vz, visible in `postprocessMember` as
 * `mz = −f[5] + f[1]x` against `my = −f[4] − f[2]x` — so a formula symmetric in
 * the two axes is wrong in exactly one of them, which is the kind of error that
 * reads as plausible on a gravity frame and inverts every lateral case.
 *
 * What was measured, on the repo's own cantilever fixture (3 m, 300×500):
 *   • a downward tip load P = 20 gives Mz(base) = −60 kN·m, and hogging must
 *     put the TOP fibre in tension → the Mz term needs the minus;
 *   • a tip load of −15 along z gives My(base) = +45 kN·m, and the beam bends
 *     toward −z so the +z fibre is in tension → the My term needs the plus.
 * Both are pinned as tests, driven through the real solver.
 *
 * The consequence for the resultants is that Mz = −∫σ·y dA while My = +∫σ·z dA;
 * `sectionResultants` integrates with exactly those definitions.
 *
 * 1000 converts kN→N; 1e6 converts kN·m→N·mm.
 */
export function normalStress(s: StressSection, f: MemberForces, y: number, z: number): number {
  const axial = s.A > 0 ? (f.N * 1e3) / s.A : 0
  const bendZ = s.Iz > 0 ? (f.Mz * 1e6 * y) / s.Iz : 0
  const bendY = s.Iy > 0 ? (f.My * 1e6 * z) / s.Iy : 0
  return axial - bendZ + bendY
}

/**
 * Shear stress at a fibre, MPa — the resultant of the two transverse shears
 * (VQ/(I·t), §J4.2 / any mechanics text) and St-Venant torsion (τ = T/Ct).
 *
 * The two transverse components act along different axes and are combined as a
 * vector; torsion is added to the magnitude, which is the conservative reading
 * at a point where their directions are not tracked. Saying so matters: this is
 * an upper bound at a fibre, not a resolved shear vector.
 */
export function shearStress(s: StressSection, f: MemberForces, fib: Fibre): number {
  const vy = fib.Qz && fib.tz && s.Iz > 0 ? (f.Vy * 1e3 * fib.Qz) / (s.Iz * fib.tz) : 0
  const vz = fib.Qy && fib.ty && s.Iy > 0 ? (f.Vz * 1e3 * fib.Qy) / (s.Iy * fib.ty) : 0
  const tor = s.Ct > 0 ? (Math.abs(f.T) * 1e6) / s.Ct : 0
  return Math.hypot(vy, vz) + tor
}

export interface FibreStress { sigma: number; tau: number; vonMises: number }

/** Normal, shear and von Mises at one fibre, MPa. */
export function fibreStress(s: StressSection, f: MemberForces, fib: Fibre): FibreStress {
  const sigma = normalStress(s, f, fib.y, fib.z)
  const tau = shearStress(s, f, fib)
  // Uniaxial normal + shear: σvm = √(σ² + 3τ²) — the beam-theory reduction of
  // the general form, since σy = σz = 0 in a slender member.
  return { sigma, tau, vonMises: Math.sqrt(sigma * sigma + 3 * tau * tau) }
}

/** The quantities a contour can paint, per station. */
export interface StationStress {
  /** Most tensile and most compressive normal stress over the fibres, MPa. */
  sigmaMax: number; sigmaMin: number
  /** Largest |σ| — what "stress on the member" means without a sign. */
  sigmaAbs: number
  tauMax: number
  vonMisesMax: number
}

/** Envelope the fibres at one station. */
export function stationStress(s: StressSection, f: MemberForces): StationStress {
  let sigmaMax = -Infinity, sigmaMin = Infinity, tauMax = 0, vm = 0
  for (const fib of s.fibres) {
    const r = fibreStress(s, f, fib)
    if (r.sigma > sigmaMax) sigmaMax = r.sigma
    if (r.sigma < sigmaMin) sigmaMin = r.sigma
    if (r.tau > tauMax) tauMax = r.tau
    if (r.vonMises > vm) vm = r.vonMises
  }
  if (!Number.isFinite(sigmaMax)) { sigmaMax = 0; sigmaMin = 0 }
  return {
    sigmaMax, sigmaMin,
    sigmaAbs: Math.max(Math.abs(sigmaMax), Math.abs(sigmaMin)),
    tauMax, vonMisesMax: vm,
  }
}

// ── the consistency check: integrate the stress back into forces ───────────

export interface Cell {
  y: number; z: number; dA: number
  /**
   * The cell's OWN second moments about its own centroid, mm⁴.
   *
   * Present for the axis-aligned rectangular cells the straight-sided shapes
   * are built from, and the reason the round-trip below is exact rather than
   * merely convergent. The stress field is linear in y and z, so the midpoint
   * rule is exact for ∫σ dA — but not for ∫σ·y dA, which picks up the cell's
   * own dA·dy²/12. Dropping it leaves a residual of (dy/h)², about 0.02% at 64
   * divisions: small enough to hide behind a tolerance, and large enough that
   * the tolerance hiding it would also hide a real error. Carrying the term
   * removes the excuse.
   */
  dIz?: number; dIy?: number
}

/**
 * Discretise the section outline into area cells, mm.
 *
 * `n` is the number of divisions across the section's depth; the width is
 * divided to keep cells roughly square, so a thin web does not get one cell
 * across. Midpoint rule — for the straight-sided shapes here it is exact on the
 * area and on the second moments in the direction the cells align with, and
 * the round section converges as O(n⁻²).
 */
export function sectionCells(geom: SectionGeom, n = 48): Cell[] {
  const cells: Cell[] = []
  /** A solid rectangle centred at (cy, cz), h deep × b wide. */
  const rect = (cy: number, cz: number, h: number, b: number) => {
    const ny = Math.max(1, Math.round((n * h) / Math.max(h, b)))
    const nz = Math.max(1, Math.round((n * b) / Math.max(h, b)))
    const dy = h / ny, dz = b / nz, dA = dy * dz
    const dIz = (dA * dy * dy) / 12, dIy = (dA * dz * dz) / 12
    for (let i = 0; i < ny; i++) {
      for (let k = 0; k < nz; k++) {
        cells.push({ y: cy - h / 2 + (i + 0.5) * dy, z: cz - b / 2 + (k + 0.5) * dz, dA, dIz, dIy })
      }
    }
  }
  switch (geom.kind) {
    case 'rect':
      rect(0, 0, geom.h, geom.b)
      break
    case 'wide-flange': {
      const { d, bf, tf, tw } = geom
      rect((d - tf) / 2, 0, tf, bf)         // top flange
      rect(-(d - tf) / 2, 0, tf, bf)        // bottom flange
      rect(0, 0, d - 2 * tf, tw)            // web (clear depth — no fillets)
      break
    }
    case 'hss-rect': {
      const { b, h, t } = geom
      rect((h - t) / 2, 0, t, b)            // top wall (full width)
      rect(-(h - t) / 2, 0, t, b)           // bottom wall
      rect(0, (b - t) / 2, h - 2 * t, t)    // side walls between them
      rect(0, -(b - t) / 2, h - 2 * t, t)
      break
    }
    case 'round': {
      const R = geom.D / 2, Ri = geom.t ? Math.max(0, R - geom.t) : 0
      const nr = Math.max(2, Math.round(n / 2)), nt = Math.max(8, 4 * n)
      for (let i = 0; i < nr; i++) {
        const r0 = Ri + ((R - Ri) * i) / nr, r1 = Ri + ((R - Ri) * (i + 1)) / nr
        const rm = (r0 + r1) / 2
        const dA = (Math.PI * (r1 * r1 - r0 * r0)) / nt
        for (let k = 0; k < nt; k++) {
          const th = (2 * Math.PI * (k + 0.5)) / nt
          cells.push({ y: rm * Math.sin(th), z: rm * Math.cos(th), dA })
        }
      }
      break
    }
  }
  return cells
}

/** Area and second moments of a cell set, mm² / mm⁴ — the outline's own opinion
 *  of the properties the stress formula was handed. */
export function cellProperties(cells: readonly Cell[]): { A: number; Iy: number; Iz: number } {
  let A = 0, Iy = 0, Iz = 0
  for (const c of cells) {
    A += c.dA
    Iz += c.y * c.y * c.dA + (c.dIz ?? 0)     // parallel axis, plus the cell's own
    Iy += c.z * c.z * c.dA + (c.dIy ?? 0)
  }
  return { A, Iy, Iz }
}

/**
 * Integrate the normal-stress field over the section and report the resultants
 * it carries: N = ∫σ dA, Mz = −∫σ·y dA, My = +∫σ·z dA.
 *
 * Those two moment signs are the solver's, measured — see `normalStress`.
 *
 * THIS IS THE CONSISTENCY CHECK, and it is deliberately not a tautology. The
 * stress field is built from the LIBRARY's A, Iy, Iz; the integration runs over
 * the outline built from the shape's DIMENSIONS. For a rectangle those are two
 * routes to the same b·h, so the round-trip is exact and only proves the
 * algebra. For an AISC W-shape they are genuinely independent — the tabulated A
 * and Ix include the web-to-flange fillets, and the three-rectangle outline
 * does not — so the residual is the fillet contribution and nothing else. Its
 * SIZE is the evidence: a few percent means the geometry and the signs are
 * right, and any sign error or factor of two shows up as a residual of 100% or
 * more, not of 3%.
 */
export function sectionResultants(
  s: StressSection, f: MemberForces, n = 48,
): { N: number; My: number; Mz: number } {
  const cells = sectionCells(s.geom, n)
  // σ(y,z) = a + p·y + q·z. The p and q gradients are what the cells' own
  // second moments multiply; see `Cell.dIz`.
  const p = s.Iz > 0 ? -(f.Mz * 1e6) / s.Iz : 0
  const q = s.Iy > 0 ? (f.My * 1e6) / s.Iy : 0
  let N = 0, Mz = 0, My = 0
  for (const c of cells) {
    const sig = normalStress(s, f, c.y, c.z)       // MPa = N/mm²
    N += sig * c.dA                                 // N
    Mz -= sig * c.dA * c.y + p * (c.dIz ?? 0)       // N·mm
    My += sig * c.dA * c.z + q * (c.dIy ?? 0)
  }
  return { N: N / 1e3, My: My / 1e6, Mz: Mz / 1e6 }   // → kN, kN·m
}

// ── building a section ─────────────────────────────────────────────────────

/**
 * St-Venant torsional section modulus Ct (mm³), τ_max = T/Ct.
 *
 * Solid rectangle: Roark's Formulas for Stress and Strain, Table 10.1 case 1 —
 * τmax = T/(α·a·b²) at the MIDDLE OF THE LONG SIDE (not at the corner, where
 * shear is zero), with a the long side and b the short one. Note α is not the
 * β that gives J: at a/b = 1 they are 0.208 and 0.1406, and using one for the
 * other is a 48% error in the same direction on every square column.
 */
function rectTorsionModulus(b: number, h: number): number {
  const a = Math.max(b, h), c = Math.min(b, h)
  if (!(a > 0 && c > 0)) return 0
  const r = c / a
  const alpha = (1 / 3) / (1 + 0.6095 * r + 0.8865 * r * r - 1.8023 * r ** 3 + 0.9100 * r ** 4)
  return alpha * a * c * c
}

/** Rectangle fibres: the four corners (σ extreme, shear-free) plus the
 *  neutral-axis points, where the shear is largest and the normal stress from
 *  bending is zero. Both are needed — the governing von Mises is at one or the
 *  other and which one depends on the load. */
function rectFibres(b: number, h: number): Fibre[] {
  const cy = h / 2, cz = b / 2
  const Qz = (b * h * h) / 8, Qy = (h * b * b) / 8     // first moment of half the section
  return [
    { y: cy, z: cz, label: 'top +z' }, { y: cy, z: -cz, label: 'top −z' },
    { y: -cy, z: cz, label: 'bottom +z' }, { y: -cy, z: -cz, label: 'bottom −z' },
    { y: 0, z: 0, label: 'centroid', Qz, tz: b, Qy, ty: h },
    { y: cy, z: 0, label: 'top mid' }, { y: -cy, z: 0, label: 'bottom mid' },
    { y: 0, z: cz, label: 'mid +z', Qz, tz: b }, { y: 0, z: -cz, label: 'mid −z', Qz, tz: b },
  ]
}

/** W / WT fibres: flange tips and the web at the neutral axis. Q at the web NA
 *  is flange + half web, the standard VQ/(I·tw) web shear. */
function wideFlangeFibres(d: number, bf: number, tf: number, tw: number): Fibre[] {
  const cy = d / 2, cz = bf / 2
  const hw = d / 2 - tf                                   // half the clear web depth
  const Qz = bf * tf * (d - tf) / 2 + (tw * hw * hw) / 2
  const Qy = (tf * bf * bf) / 4                           // half a flange about y′, both flanges
  return [
    { y: cy, z: cz, label: 'top flange tip +z' }, { y: cy, z: -cz, label: 'top flange tip −z' },
    { y: -cy, z: cz, label: 'bot flange tip +z' }, { y: -cy, z: -cz, label: 'bot flange tip −z' },
    { y: cy, z: 0, label: 'top flange mid' }, { y: -cy, z: 0, label: 'bot flange mid' },
    { y: 0, z: 0, label: 'web centroid', Qz, tz: tw, Qy, ty: 2 * tf },
    { y: hw, z: 0, label: 'web top', Qz: bf * tf * (d - tf) / 2, tz: tw },
    { y: -hw, z: 0, label: 'web bottom', Qz: bf * tf * (d - tf) / 2, tz: tw },
  ]
}

function hssRectFibres(b: number, h: number, t: number): Fibre[] {
  const cy = h / 2, cz = b / 2
  const hw = h / 2 - t
  const Qz = b * t * (h - t) / 2 + 2 * (t * hw * hw) / 2   // top wall + both side walls
  const Qy = h * t * (b - t) / 2 + 2 * (t * (b / 2 - t) ** 2) / 2
  return [
    { y: cy, z: cz, label: 'corner +y+z' }, { y: cy, z: -cz, label: 'corner +y−z' },
    { y: -cy, z: cz, label: 'corner −y+z' }, { y: -cy, z: -cz, label: 'corner −y−z' },
    { y: 0, z: cz, label: 'side wall +z', Qz, tz: 2 * t },
    { y: 0, z: -cz, label: 'side wall −z', Qz, tz: 2 * t },
    { y: cy, z: 0, label: 'top wall mid', Qy, ty: 2 * t },
    { y: -cy, z: 0, label: 'bottom wall mid', Qy, ty: 2 * t },
  ]
}

function roundFibres(D: number, t?: number): Fibre[] {
  const R = D / 2, Ri = t ? Math.max(0, R - t) : 0
  // Q of a half annulus about the diameter, and the thickness cut there.
  const Qz = (2 / 3) * (R ** 3 - Ri ** 3)
  const tz = t ? 2 * t : D
  const out: Fibre[] = []
  for (let k = 0; k < 8; k++) {
    const th = (2 * Math.PI * k) / 8
    out.push({ y: R * Math.sin(th), z: R * Math.cos(th), label: `${(k * 45)}°` })
  }
  out.push({ y: 0, z: 0, label: 'centroid', Qz, tz, Qy: Qz, ty: tz })
  return out
}

const BOUNDING_BOX_NOTE = 'bounding box'

/** Section geometry + properties for a steel shape the library describes. */
function steelStressSection(shape: AiscShape, A: number, Iy: number, Iz: number, J: number): StressSection | null {
  if ((shape.family === 'W' || shape.family === 'WT' || shape.family === 'C')
    && shape.d && shape.bf && shape.tf && shape.tw) {
    const { d, bf, tf, tw } = shape
    return {
      geom: { kind: 'wide-flange', d, bf, tf, tw },
      A, Iy, Iz, J,
      // Thin-walled OPEN section: τ = T·t_max/J. Ct = J/t_max.
      Ct: J / Math.max(tf, tw),
      fibres: wideFlangeFibres(d, bf, tf, tw),
      exact: true, cy: d / 2, cz: bf / 2,
    }
  }
  if (shape.family === 'HSS' && shape.b && shape.h && shape.t) {
    const { b, h, t } = shape
    // Closed thin-walled: Bredt, τ = T/(2·Am·t) with Am the mid-wall area.
    const Am = (b - t) * (h - t)
    return {
      geom: { kind: 'hss-rect', b, h, t },
      A, Iy, Iz, J, Ct: 2 * Am * t,
      fibres: hssRectFibres(b, h, t),
      exact: true, cy: h / 2, cz: b / 2,
    }
  }
  if ((shape.family === 'HSS' || shape.family === 'PIPE') && shape.D) {
    const { D, t } = shape
    return {
      geom: { kind: 'round', D, ...(t ? { t } : {}) },
      A, Iy, Iz, J, Ct: J / (D / 2),        // τ = T·r/J on a circular section — exact
      fibres: roundFibres(D, t),
      exact: true, cy: D / 2, cz: D / 2,
    }
  }
  return null
}

/**
 * Build the stress section for a model section.
 *
 * Properties come from `sectionProps` — the SAME function the bridge uses to
 * build the solver's stiffness — so the section the stress is computed on is
 * the section the analysis ran on, not a second opinion about what a W310x38.7
 * is. The outline comes from the shape's dimensions, which is what makes
 * `sectionResultants` an independent check rather than a restatement.
 *
 * Note the gross-section point in the file header: `sectionProps` is
 * uncracked, which is what stress needs.
 */
export function stressSection(sec: RectSection): StressSection {
  const p = sectionProps(sec)
  if (sec.material === 'steel' && sec.shape) {
    const shape = shapeByName(sec.shape)
    if (shape) {
      const built = steelStressSection(shape, p.A, p.Iy, p.Iz, p.J)
      if (built) return built
      // A shape the library lists but has no dimensions for (single angles,
      // odd families). The bounding box is a real approximation and is
      // FLAGGED as one rather than printed as the section's own stress.
      return {
        geom: { kind: 'rect', b: sec.b, h: sec.h },
        A: p.A, Iy: p.Iy, Iz: p.Iz, J: p.J,
        Ct: rectTorsionModulus(sec.b, sec.h),
        fibres: rectFibres(sec.b, sec.h),
        exact: false, cy: sec.h / 2, cz: sec.b / 2,
      }
    }
  }
  return {
    geom: { kind: 'rect', b: sec.b, h: sec.h },
    A: p.A, Iy: p.Iy, Iz: p.Iz, J: p.J,
    Ct: rectTorsionModulus(sec.b, sec.h),
    fibres: rectFibres(sec.b, sec.h),
    exact: true, cy: sec.h / 2, cz: sec.b / 2,
  }
}

export { rectTorsionModulus, BOUNDING_BOX_NOTE }

// ── whole-member recovery ──────────────────────────────────────────────────

/** Per-station stress along one member, aligned with `xs`. */
export interface MemberStress {
  id: string
  xs: number[]
  sigmaMax: number[]; sigmaMin: number[]; sigmaAbs: number[]
  tauMax: number[]; vonMisesMax: number[]
  /** The station-wise extremes, for a read-out beside the legend. */
  peak: { sigmaMax: number; sigmaMin: number; tauMax: number; vonMisesMax: number }
  /** False when the section fell back to a bounding box. */
  exact: boolean
}

/** The slice of `F3MemberResult` this module consumes — named so a caller
 *  cannot accidentally pass something that merely looks like it. */
export interface MemberForceArrays {
  id: string; xs: number[]
  N: number[]; Vy: number[]; Vz: number[]; T: number[]; My: number[]; Mz: number[]
}

/**
 * Stress along a member, from the force arrays the diagrams already draw.
 *
 * Takes `F3MemberResult` itself (structurally) rather than re-solving: the
 * contour and the diagram are then the same numbers through two presentations,
 * which is the only way they can be guaranteed to agree.
 */
export function memberStress(r: MemberForceArrays, s: StressSection): MemberStress {
  const n = r.xs.length
  const sigmaMax: number[] = [], sigmaMin: number[] = [], sigmaAbs: number[] = []
  const tauMax: number[] = [], vonMisesMax: number[] = []
  for (let i = 0; i < n; i++) {
    const st = stationStress(s, {
      N: r.N[i] ?? 0, Vy: r.Vy[i] ?? 0, Vz: r.Vz[i] ?? 0,
      T: r.T[i] ?? 0, My: r.My[i] ?? 0, Mz: r.Mz[i] ?? 0,
    })
    sigmaMax.push(st.sigmaMax); sigmaMin.push(st.sigmaMin); sigmaAbs.push(st.sigmaAbs)
    tauMax.push(st.tauMax); vonMisesMax.push(st.vonMisesMax)
  }
  const hi = (a: number[]) => (a.length ? Math.max(...a) : 0)
  const lo = (a: number[]) => (a.length ? Math.min(...a) : 0)
  return {
    id: r.id, xs: [...r.xs],
    sigmaMax, sigmaMin, sigmaAbs, tauMax, vonMisesMax,
    peak: {
      sigmaMax: hi(sigmaMax), sigmaMin: lo(sigmaMin),
      tauMax: hi(tauMax), vonMisesMax: hi(vonMisesMax),
    },
    exact: s.exact,
  }
}
