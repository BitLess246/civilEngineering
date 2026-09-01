// ─────────────────────────────────────────────────────────────────────────
// LINTEL BEAM — the beam over an opening, and the wall it actually carries.
//
// The design is an ordinary RC beam; what makes a lintel its own calculation
// is the LOAD, because a masonry wall over an opening does not deliver all of
// itself to the beam.
//
// ARCHING. Above an opening, masonry corbels and arches over: a triangle of
// wall bears on the lintel and the rest is carried around it to the jambs.
// The triangle is taken as equilateral — 60° base angles — which is the usual
// assumption, and its apex therefore sits 0.866·ℓ above the lintel. The angle
// is an input rather than a constant because it IS an assumption; a shallower
// arch is a heavier lintel and the drawing prints which one was used.
//
// THE ARCH HAS TO HAVE ROOM TO FORM. If the wall above is shorter than the
// triangle's height there is no arch, and the lintel carries the whole
// rectangle of wall over it. That is the case that catches people out — a
// lintel just under a slab soffit carries far more than the triangle formula
// suggests — so it is decided here from the geometry rather than left to the
// user to remember.
//
// THE TRIANGLE IS A TRIANGULAR LOAD, NOT A UDL. Smeared to a uniform load of
// the same total it would give M = Wℓ/8; a symmetric triangular load peaking at
// midspan gives Wℓ/6, which is 33% more. Using the wrong one is not a rounding
// difference.
//
// Units: spans m, sections mm, loads kN and kN/m, stresses MPa.
// ─────────────────────────────────────────────────────────────────────────
import { designBeam, type BeamDesignResult } from './beamDesign'

/** φ for bearing on concrete — ACI 318-14 Table 21.2.1, bearing. */
const PHI_BEARING = 0.65
/** Unit weight of reinforced concrete, kN/m³. */
const GAMMA_C = 24

export interface LintelInput {
  /** Clear width of the opening, m. */
  opening: number
  /** Bearing length at EACH end, mm. */
  bearing: number
  /** Lintel section, mm. */
  b: number
  h: number
  cover: number
  barDia: number
  stirrupDia: number
  fc: number
  fy: number
  /** Wall thickness, mm — the width of masonry the triangle is cut from. */
  wallThickness: number
  /** Height of wall standing ON the lintel, m, top of lintel to top of wall. */
  wallHeightAbove: number
  /** Unit weight of the masonry, kN/m³. CHB with grout is around 21. */
  wallUnitWeight: number
  /** Base angle of the arching triangle, degrees. 60 = equilateral. */
  archAngleDeg?: number
  /**
   * Any other DEAD line load reaching the lintel, kN/m — a slab or beam
   * bearing on the wall low enough that the arch cannot carry it round.
   *
   * Where an arch DOES form, a load applied above its apex is carried to the
   * jambs and is not the lintel's; `arching` says which case this is, and the
   * result reports the load as excluded rather than silently dropping it.
   */
  udlAbove?: number
  /** Live line load on the lintel, kN/m. */
  live?: number
}

export interface LintelLoads {
  /** True when the wall above is tall enough for the triangle to close. */
  arching: boolean
  /** Height of the arching triangle, m — 0 when no arch forms. */
  triangleHeight: number
  /** Masonry weight the lintel carries, kN — a triangle, or the whole rectangle. */
  masonry: number
  /** Lintel self weight, kN/m. */
  selfWeight: number
  /** Dead line load from `udlAbove` that reaches the lintel, kN/m. */
  udlDead: number
  /** `udlAbove` the arch carries round instead, kN/m — reported, not dropped. */
  udlArched: number
  live: number
}

export interface LintelResult {
  /** Clear span, and the effective span design is done on, m. */
  ln: number
  span: number
  loads: LintelLoads
  /** Factored moment and shear on the effective span, kN·m and kN. */
  Mu: number
  Vu: number
  design: BeamDesignResult
  /** Bearing: the factored end reaction, the stress under it, and its limit. */
  bearingStress: number
  bearingLimit: number
  bearingOK: boolean
  ok: boolean
  notes: string[]
}

/**
 * Effective span — ACI 318-14 §6.3.2.1: for a member not built integrally with
 * its supports, the clear span plus the depth, but never more than the distance
 * between support centres.
 */
export function lintelSpan(openingM: number, hMm: number, bearingMm: number): number {
  return Math.min(openingM + hMm / 1000, openingM + (2 * bearingMm) / 1000)
}

/** Height of the arching triangle over a span, m. */
export function archTriangleHeight(span: number, archAngleDeg = 60): number {
  const a = (Math.min(89, Math.max(1, archAngleDeg)) * Math.PI) / 180
  return (span / 2) * Math.tan(a)
}

/** What the lintel actually carries. */
export function lintelLoads(i: LintelInput, span: number): LintelLoads {
  const t = i.wallThickness / 1000
  const triangleHeight = archTriangleHeight(span, i.archAngleDeg)
  const arching = i.wallHeightAbove >= triangleHeight - 1e-9
  const masonry = arching
    // ½ · base · height · thickness · γ
    ? 0.5 * span * triangleHeight * t * i.wallUnitWeight
    // no room for the arch: the whole rectangle of wall over the opening
    : span * i.wallHeightAbove * t * i.wallUnitWeight
  const extra = i.udlAbove ?? 0
  return {
    arching,
    triangleHeight: arching ? triangleHeight : 0,
    masonry,
    selfWeight: (i.b / 1000) * (i.h / 1000) * GAMMA_C,
    udlDead: arching ? 0 : extra,
    udlArched: arching ? extra : 0,
    live: i.live ?? 0,
  }
}

/**
 * Design a lintel.
 *
 * The masonry triangle is a TRIANGULAR load — M = Wℓ/6, V = W/2 — and
 * everything else is uniform, so the two are added rather than one being
 * smeared into the other.
 */
export function designLintel(i: LintelInput): LintelResult {
  const notes: string[] = []
  const ln = i.opening
  const span = lintelSpan(ln, i.h, i.bearing)
  const loads = lintelLoads(i, span)

  // Dead: the masonry, plus the lintel's own weight and anything the arch does
  // not carry round. Live: whatever was given.
  const wD = loads.selfWeight + loads.udlDead
  const wL = loads.live
  const wu = 1.2 * wD + 1.6 * wL
  const Wu = 1.2 * loads.masonry

  const Mu = loads.arching
    // triangular load peaking at midspan: Wℓ/6, NOT the Wℓ/8 a smeared UDL gives
    ? (Wu * span) / 6 + (wu * span * span) / 8
    // no arch — the masonry is a rectangle and behaves as a UDL like the rest
    : ((Wu / span + wu) * span * span) / 8
  const Vu = loads.arching
    ? Wu / 2 + (wu * span) / 2
    : (Wu + wu * span) / 2

  const design = designBeam({
    b: i.b, h: i.h, cover: i.cover, barDia: i.barDia, stirrupDia: i.stirrupDia,
    fc: i.fc, fy: i.fy, Mu, Vu,
  })

  // Bearing on the jamb — §22.8.3.2, φ·0.85·f′c over the contact area.
  const A1 = (i.b / 1000) * (i.bearing / 1000)                 // m²
  const bearingStress = A1 > 0 ? Vu / (A1 * 1000) : Infinity    // MPa
  const bearingLimit = PHI_BEARING * 0.85 * i.fc
  const bearingOK = bearingStress <= bearingLimit + 1e-9

  if (!loads.arching) {
    notes.push(`The wall above is ${i.wallHeightAbove.toFixed(2)} m, less than the `
      + `${archTriangleHeight(span, i.archAngleDeg).toFixed(2)} m the arch needs to close — `
      + 'the lintel carries the whole rectangle of wall, not a triangle.')
  }
  if (loads.udlArched > 0) {
    notes.push(`${loads.udlArched.toFixed(2)} kN/m applied above the arch is carried `
      + 'round to the jambs and is not on the lintel. Add it as a load only if it '
      + 'lands inside the triangle.')
  }
  if (!bearingOK) {
    notes.push(`Bearing ${bearingStress.toFixed(2)} MPa over ${i.bearing} mm exceeds `
      + `φ(0.85f′c) = ${bearingLimit.toFixed(2)} MPa — lengthen the bearing or widen the lintel.`)
  }

  return {
    ln, span, loads, Mu, Vu, design,
    bearingStress, bearingLimit, bearingOK,
    ok: design.flexOK && design.comprNAOK && bearingOK,
    notes,
  }
}
