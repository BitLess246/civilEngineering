// ─────────────────────────────────────────────────────────────────────────
// BEAM–COLUMN JOINT — NSCP 2015 §418.8 (ACI 318-14 §18.8), and the two-view
// detail sheet the joint is built from.
//
// The joint is the piece of the frame nothing else checks. The beam sheet
// designs the beam, the column sheet designs the column, and the block of
// concrete where they cross carries the forces of both.
//
// §418.8.2 splits into two cases, and CONFLATING THEM IS THE EASY MISTAKE —
// this module made it and was corrected in review:
//
//   §418.8.2.3  "Where longitudinal beam reinforcement EXTENDS THROUGH a
//               beam-column joint", the column dimension parallel to that
//               reinforcement shall be at least 20db (26db lightweight). It is
//               a bond/slip rule: a bar passing through is pulled one way on
//               one face and pushed the other way on the other, and it needs
//               that much joint to do it. A bar that STOPS in the joint is not
//               doing that, so the rule does not reach it.
//   §418.8.2.2  Beam reinforcement TERMINATED in a column shall extend to the
//               far face of the confined core and be developed in tension per
//               §418.8.5. That — not 20db — is what governs a hooked bar.
//
// So the two checks are asked separately, per direction, of whichever bars are
// actually doing that thing. A ⌀28 bar hooked into a 400 mm column may well
// fail its anchorage; it does not fail the 20db rule, because it never passes
// through. The bars that DO pass through may be the spandrel's, in which case
// 20db is measured against the column dimension parallel to THEM.
//
// The rest:
//
//   §418.8.4    the joint has its own shear strength, φVn = φ·γ·λ·√f'c·Aj, and
//               its own demand — from the FREE BODY of the joint, with the beam
//               steel stressed to 1.25fy (§418.8.2.1). See `JointForces`.
//   §418.8.3    column confinement hoops CONTINUE through the joint. Where four
//               beams frame in and each is at least ¾ the column width the
//               amount may be halved, at up to 150 mm.
//   §418.8.5.1  ℓdh = fy·db / (5.4·λ·√f'c) — shorter than the §425.4.3 hook
//               because the joint core is confined, floored at 8db and 150 mm.
//
// Nothing here re-designs the beam or the column: it takes what those two
// designed and checks the block they share.
//
// Units: sections mm; forces kN; stresses MPa; drawing geometry m.
// ─────────────────────────────────────────────────────────────────────────
import { hookClearToFace, hookEmbedmentAvailable } from './devLength'
import { GLYPH_W, wrapNote } from './detailSheet'

// ── code constants ─────────────────────────────────────────────────────────

/** How the joint is confined by the beams framing into it — Table 418.8.4.3. */
export type JointConfinement = 'four-faces' | 'three-faces' | 'two-opposite' | 'other'

/** γ in Vn = γ·λ·√f'c·Aj, SI (MPa, mm²) — Table 418.8.4.3. */
export const JOINT_GAMMA: Record<JointConfinement, number> = {
  'four-faces': 1.7,
  'three-faces': 1.2,
  'two-opposite': 1.2,
  'other': 1.0,
}

/** §421.2.4.3 — φ for shear in a joint. NOT the 0.75 used for member shear. */
export const PHI_JOINT = 0.85
/** §418.8.2.3 — joint dimension parallel to bars PASSING THROUGH, in bar dias. */
export const THROUGH_BAR_DIAS = 20
/** §418.8.2.3 — the same rule for lightweight concrete. */
export const THROUGH_BAR_DIAS_LIGHTWEIGHT = 26
/** §418.8.2.1 — beam steel is taken at this multiple of fy at a joint. */
export const PROBABLE_FY = 1.25
/** §418.8.3.2 — hoop spacing allowed through a joint confined on four faces. */
export const JOINT_HOOP_SPACING_MAX = 150

const area = (d: number) => (Math.PI / 4) * d * d

// ── the checks ─────────────────────────────────────────────────────────────

/**
 * Effective joint width b_j, mm — §418.8.4.3 via §415.4.2.
 *
 * The lesser of the beam width plus the joint depth and the beam width plus
 * twice the distance from the beam's axis to the column side, and never more
 * than the column width. The middle term is the one that bites on an ECCENTRIC
 * beam: a beam pushed to one face of the column cannot mobilise the far side.
 */
export function effectiveJointWidth(beamB: number, colB: number, colH: number, eccentricity = 0): number {
  const x = Math.max(colB / 2 - Math.abs(eccentricity), 0)   // beam axis → nearer column side
  return Math.min(beamB + colH, beamB + 2 * x, colB)
}

/**
 * Development length of a beam bar hooked into a joint, mm — §418.8.5.1.
 *
 *   ℓdh = fy·db / (5.4·λ·√f'c),  not less than 8db or 150 mm
 *
 * This is the SEISMIC hook, and it is shorter than the §425.4.3 one because the
 * joint core is confined by hoops. Using the general clause here would be
 * conservative; using this one anywhere else would not be.
 */
export function jointHookLdh(db: number, fy: number, fc: number, lambda = 1): number {
  const raw = (fy * db) / (5.4 * lambda * Math.sqrt(Math.max(fc, 1)))
  return Math.max(raw, 8 * db, 150)
}

/** §418.8.2.3 applied to ONE direction — and only to bars that pass through. */
export interface ThroughBarCheck {
  /** These bars extend THROUGH the joint, so §418.8.2.3 reaches them. */
  applies: boolean
  /** Largest bar diameter passing through in this direction, mm. */
  dia: number
  /** The column dimension PARALLEL to those bars, mm. */
  provided: number
  /** 20db, or 26db in lightweight concrete, mm. */
  required: number
  ok: boolean
}

/**
 * §418.8.2.3 for one direction.
 *
 * `applies` is the whole point: the rule is conditioned on the bars extending
 * through the joint. Asked of bars that terminate in it, the answer is "not
 * this rule" — not "fail".
 */
export function throughBarCheck(through: boolean, dia: number, provided: number, lambda = 1): ThroughBarCheck {
  const factor = lambda < 1 ? THROUGH_BAR_DIAS_LIGHTWEIGHT : THROUGH_BAR_DIAS
  const required = factor * Math.max(dia, 0)
  return {
    applies: through && dia > 0,
    dia, provided, required,
    ok: !through || dia <= 0 || provided >= required - 1e-9,
  }
}

/**
 * The free body of the joint — §418.8.2.1 with §418.8.4.
 *
 * The demand is NOT "1.25·fy·As". It is the horizontal equilibrium of the block:
 * the beam steel entering it is stressed to 1.25fy (§418.8.2.1), and the joint
 * shear is what is left once the column shear is taken off.
 *
 *   Vu = T + C − Vcol
 *
 * At an INTERIOR joint the far beam's flexural couple pushes on the same face
 * that the near beam's top steel pulls, and C equals that beam's own bar
 * tension by section equilibrium — so the two add. At an EXTERIOR joint there
 * is no far beam and C is zero.
 */
export interface JointForces {
  /** Tension from the near beam's top steel at 1.25fy, kN. */
  T: number
  /** Compression delivered by the far beam, kN — zero at an exterior joint. */
  C: number
  /** Column shear acting against them, kN. */
  Vcol: number
  /** Vu = T + C − Vcol, floored at zero. */
  Vu: number
}

export function jointForces(
  AsTop: number, AsBot: number, fy: number, interior: boolean, Vcol = 0,
): JointForces {
  const T = (PROBABLE_FY * fy * AsTop) / 1000
  const C = interior ? (PROBABLE_FY * fy * AsBot) / 1000 : 0
  const V = Math.max(Vcol, 0)
  return { T, C, Vcol: V, Vu: Math.max(T + C - V, 0) }
}

export interface BeamColumnJointInput {
  mark?: string
  /** Column width (perpendicular to the beam) and depth (parallel to it), mm. */
  colB: number
  colH: number
  /** Column longitudinal bars and the hoop set. */
  colBarDia: number
  colBars: number
  hoopDia: number
  /** Column hoop spacing in the confinement zone, mm — what continues through. */
  hoopSpacing: number
  /** The beam framing in: width, overall depth, bar Ø, and the bar counts. */
  beamB: number
  beamH: number
  /**
   * Depth of the SHALLOWEST beam framing into the joint, mm — §415.4.2.2 caps
   * the joint hoop spacing at half of it, and on a joint where beams of
   * different depths meet that is not the one this check is drawn for.
   * Defaults to `beamH`.
   */
  shallowestBeamH?: number
  /** Legs of the hoop set through the joint, and the hoop yield. §415.4.2 is
   *  an AREA rule, so it needs both. Default 2 legs, fyt = 415. */
  hoopLegs?: number
  fyt?: number
  beamBarDia: number
  topBars: number
  botBars: number
  /** Beams frame in from BOTH sides in the direction of the shear. */
  interior?: boolean
  /**
   * The beam's longitudinal bars EXTEND THROUGH the joint rather than
   * terminating in it. Defaults to `interior`: a beam continuing past the
   * column runs its bars through, one that stops there hooks them.
   *
   * This is the flag §418.8.2.3 turns on. Getting it wrong is how a hooked bar
   * comes to "fail" a rule written for a different bar.
   */
  barsThrough?: boolean
  /** Largest bar of the PERPENDICULAR (spandrel) beam, mm, and whether ITS bars
   *  pass through — then §418.8.2.3 is measured against `colB`. */
  spandrelBarDia?: number
  spandrelThrough?: boolean
  /** Confinement class for γ — Table 418.8.4.3. */
  confinement?: JointConfinement
  /** Every framing beam covers ≥ ¾ of the column width (§418.8.3.2). */
  wideBeams?: boolean
  /** Column shear from the analysis, kN — part of the joint free body. */
  Vcol?: number
  /** Beam axis offset from the column centreline, mm. */
  eccentricity?: number
  fc?: number
  fy?: number
  lambda?: number
  /** Clear cover to the hoop, mm (default 40). */
  cover?: number
}

export interface BeamColumnJointResult {
  gamma: number
  /** Effective joint width and area — §418.8.4.3. */
  bj: number
  Aj: number
  /** Nominal and design joint shear, kN. */
  Vn: number
  phiVn: number
  /** The free body the demand comes from — §418.8.2.1. */
  forces: JointForces
  /** Vu from that free body, kN. */
  Vu: number
  shearOK: boolean
  /** §418.8.2.3, asked separately of each direction's THROUGH bars. */
  through: { main: ThroughBarCheck; spandrel: ThroughBarCheck }
  /** The near beam's bars terminate in the joint — §418.8.2.2 / §418.8.5. */
  terminated: boolean
  /** §418.8.5.1 hook, with the values it was computed from. */
  ldh: number
  ldhInputs: { db: number; fy: number; fc: number; lambda: number }
  /** Straight embedment available inside the confined core, mm —
   *  colH − cover − hoop Ø − column bar Ø. */
  ldhAvail: number
  /** Clear from the far FACE to the outside of the bend, mm — cover + hoop +
   *  column bar. The drawing places the hook here and the notes quote it, so
   *  neither can drift from the other or from `ldhAvail`. */
  ldhClear: number
  ldhFits: boolean
  /** 12db hook tail, §425.3.1. */
  hookTail: number
  /** Hoop spacing to detail through the joint, mm, and whether §418.8.3.2's
   *  relaxation was available. */
  jointHoopSpacing: number
  halvedHoops: boolean
  /** §415.4.2 — the transverse steel a joint needs whatever else applies. */
  joint415: Joint415
  /** Which rule set the spacing through the joint. */
  spacingGovern: string
  ok: boolean
  notes: string[]
}

/**
 * §415.4.2 — the transverse reinforcement a beam–column joint needs.
 *
 * §418.4.4 sends an intermediate moment frame's joints straight here, and
 * §415.2.3 brings every moment-transferring joint under §415.4. Two things
 * come out of it, and neither was being asked:
 *
 *   §415.4.2    the area of ALL LEGS in each principal direction is at least
 *               the greater of 0.062·√f'c·b·s/fyt and 0.35·b·s/fyt, where b is
 *               the column dimension PERPENDICULAR to the direction considered
 *   §415.4.2.2  the spacing s is at most HALF the depth of the shallowest beam
 *               framing into the joint
 *
 * §415.4.2.1 puts that steel within the column height over at least the
 * deepest beam framing in, which is the band `jointHoopSpacing` already fills.
 *
 * The area rule is the one with teeth: it can demand more legs than the column
 * happens to carry, and nothing else in the joint check looks at leg area at
 * all.
 */
export interface Joint415 {
  /** Spacing cap from §415.4.2.2, mm — half the shallowest beam's depth. */
  sMax: number
  /** Required leg area at the adopted spacing, mm². */
  AvReq: number
  /** Leg area provided by the hoop set at that spacing, mm². */
  AvProv: number
  /** Legs the hoop set has, and the least it needs. */
  legs: number
  legsReq: number
  ok: boolean
}

export function jointTransverse(
  i: { colB: number; colH: number; beamH: number; hoopDia: number; fc: number },
  s: number, legs: number, fyt: number, shallowestBeamH: number = i.beamH,
): Joint415 {
  const sMax = shallowestBeamH / 2
  // b is measured PERPENDICULAR to the direction the legs resist in. The
  // governing direction is the wider one — it asks for the most steel.
  const b = Math.max(i.colB, i.colH)
  const AvReq = Math.max(0.062 * Math.sqrt(i.fc) * b * s / fyt, (0.35 * b * s) / fyt)
  const aLeg = (Math.PI / 4) * i.hoopDia ** 2
  const AvProv = legs * aLeg
  const legsReq = Math.max(2, Math.ceil(AvReq / Math.max(aLeg, 1e-9) - 1e-9))
  return { sMax, AvReq, AvProv, legs, legsReq, ok: AvProv >= AvReq - 1e-9 }
}

/**
 * Check the joint the beam and the column share.
 *
 * Each rule is asked of the bars it was written for: §418.8.2.3 of whatever
 * passes THROUGH (in either direction, against the column dimension parallel to
 * it), §418.8.2.2 / §418.8.5.1 of whatever TERMINATES, and §418.8.4 of the
 * whole free body.
 */
export function designBeamColumnJoint(i: BeamColumnJointInput): BeamColumnJointResult {
  const notes: string[] = []
  const fc = i.fc ?? 21, fy = i.fy ?? 415, lambda = i.lambda ?? 1
  const cover = i.cover ?? 40
  const confinement = i.confinement ?? 'other'
  const gamma = JOINT_GAMMA[confinement]

  const bj = effectiveJointWidth(i.beamB, i.colB, i.colH, i.eccentricity ?? 0)
  const Aj = bj * i.colH
  const Vn = (gamma * lambda * Math.sqrt(Math.max(fc, 1)) * Aj) / 1000        // kN
  const phiVn = PHI_JOINT * Vn

  const forces = jointForces(
    i.topBars * area(i.beamBarDia), i.botBars * area(i.beamBarDia),
    fy, !!i.interior, i.Vcol ?? 0,
  )
  const shearOK = forces.Vu <= phiVn + 1e-9

  // §418.8.2.3 — per direction, and only for bars that actually pass through.
  // A beam that continues past the column runs its bars through; one that stops
  // there terminates them, and this rule is not about those.
  const barsThrough = i.barsThrough ?? !!i.interior
  const main = throughBarCheck(barsThrough, i.beamBarDia, i.colH, lambda)
  const spandrel = throughBarCheck(!!i.spandrelThrough, i.spandrelBarDia ?? 0, i.colB, lambda)
  const terminated = !barsThrough

  // §418.8.2.2 / §418.8.5.1 — the terminated bars' anchorage.
  const ldh = jointHookLdh(i.beamBarDia, fy, fc, lambda)
  // The hook turns DOWN inside the far-face column longitudinals, so the depth
  // it can occupy is the core less that bar. Shared with the §425.4.3 hook on
  // the dev-length page — one formula, so the joint sheet and that page cannot
  // quote different room for the same bar in the same column.
  const ldhClear = hookClearToFace(cover, i.hoopDia, i.colBarDia)
  const ldhAvail = hookEmbedmentAvailable(i.colH, cover, i.hoopDia, i.colBarDia)
  const ldhFits = !terminated || ldh <= ldhAvail + 1e-9
  const hookTail = 12 * i.beamBarDia

  // §418.8.3.2 — four beams, each ≥ ¾ the column width: half the hoops, ≤150.
  const halvedHoops = confinement === 'four-faces' && !!i.wideBeams
  // §415.4.2.2 caps the spacing at half the shallowest beam's depth whatever
  // §418.8.3 allows — the relaxation of §418.8.3.2 doubles the column spacing
  // and could otherwise step straight past it.
  const s415 = (i.shallowestBeamH ?? i.beamH) / 2
  const jointHoopSpacing = Math.min(
    halvedHoops ? Math.min(JOINT_HOOP_SPACING_MAX, 2 * i.hoopSpacing) : i.hoopSpacing,
    s415,
  )
  const joint415 = jointTransverse(
    { colB: i.colB, colH: i.colH, beamH: i.beamH, hoopDia: i.hoopDia, fc: i.fc ?? 28 },
    jointHoopSpacing, i.hoopLegs ?? 2, i.fyt ?? 415, i.shallowestBeamH ?? i.beamH,
  )
  const spacingGovern = jointHoopSpacing >= s415 - 1e-9
    ? '§415.4.2.2 (half the shallowest beam)'
    : halvedHoops ? '§418.8.3.2' : '§418.8.3.1 (column confinement)'
  if (!joint415.ok) {
    notes.push(`§415.4.2 wants ${Math.round(joint415.AvReq)} mm² of hoop leg through the joint at ${Math.round(jointHoopSpacing)} centres and ${joint415.legs} legs of ⌀${Math.round(i.hoopDia)} give ${Math.round(joint415.AvProv)} mm² — provide ${joint415.legsReq} legs, or close the hoops up`)
  }

  if (main.applies && !main.ok) {
    notes.push(`⌀${Math.round(main.dia)} beam bars pass THROUGH the joint, so §418.8.2.3 needs a column depth of ${Math.round(main.required)} mm parallel to them — ${Math.round(main.provided)} mm provided`)
  }
  if (spandrel.applies && !spandrel.ok) {
    notes.push(`the spandrel's ⌀${Math.round(spandrel.dia)} bars pass THROUGH the joint, so §418.8.2.3 needs ${Math.round(spandrel.required)} mm of column WIDTH parallel to them — ${Math.round(spandrel.provided)} mm provided`)
  }
  if (terminated && !ldhFits) {
    notes.push(`ℓdh ${Math.round(ldh)} mm = ${fy}(${Math.round(i.beamBarDia)}) / (5.4·${lambda.toFixed(2)}·√${fc}) does not fit the ${Math.round(ldhAvail)} mm available inside the confined core — the terminated bars cannot be developed in this joint (§418.8.2.2 / §418.8.5.1)`)
  }
  if (!shearOK) {
    notes.push(`joint shear Vu ${Math.round(forces.Vu)} kN = T ${Math.round(forces.T)} + C ${Math.round(forces.C)} − Vcol ${Math.round(forces.Vcol)} exceeds φVn ${Math.round(phiVn)} kN (γ = ${gamma.toFixed(1)}, §418.8.4.3) — enlarge the joint or frame more beams into it`)
  }
  if (confinement === 'other') {
    notes.push(`γ = 1.0: the joint is not confined by beams on three or four faces, which is the lowest strength Table 418.8.4.3 allows`)
  }

  return {
    gamma, bj, Aj, Vn, phiVn,
    forces, Vu: forces.Vu, shearOK,
    through: { main, spandrel }, terminated,
    ldh, ldhInputs: { db: i.beamBarDia, fy, fc, lambda }, ldhAvail, ldhClear, ldhFits, hookTail,
    jointHoopSpacing, halvedHoops, joint415, spacingGovern,
    ok: shearOK && main.ok && spandrel.ok && ldhFits,
    notes,
  }
}


// The two-view joint SHEET is gone, and with it the drawing half of this
// module. It drew a SCHEMATIC of a joint — a column, a beam framing in, a
// spandrel across — while the frame elevations and the 3D cage draw the same
// steel from the bars `cageBuilder` placed, so the sheet could only ever
// agree with them by coincidence, and did not. The CHECKS above are
// untouched: §418.8 is still asked, and is still the one thing neither
// member design looks at.

// Re-exported so the existing callers and tests keep their import site; the
// implementation now lives in `detailSheet` as a single copy.
export { GLYPH_W, wrapNote }
