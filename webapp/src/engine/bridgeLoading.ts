// ─────────────────────────────────────────────────────────────────────────
// BRIDGE LOADING — AASHTO HL-93 live load on a SIMPLE SPAN, per design lane,
// brought to one girder by the lever rule.
//
// This engine builds on the influence-line machinery (engine/influenceBeam):
// simple-span ILs are exact piecewise lines, and the vehicle walk evaluates
// the force effect exactly at the positions where the piecewise-linear
// result kinks — no sampling error anywhere.
//
// THE LOAD MODEL (AASHTO LRFD 3.6.1.2, metric):
//   · Design truck (HS-20 pattern): 35 kN front axle, then two 145 kN
//     axles — the first 4.26 m behind the front, the second between 4.26
//     and 9.0 m behind the first (the spacing is varied for the maximum).
//   · Design tandem: two 110 kN axles, 1.2 m apart.
//   · The truck OR the tandem governs per section — whichever is larger.
//   · Dynamic load allowance IM = 33 % on the vehicle only, never on the
//     lane load.
//   · Design lane load: 9.3 kN/m uniformly over the full lane, acting
//     simultaneously with the vehicle.
//
// TRANSVERSE DISTRIBUTION — the lever rule (simple transverse statics, the
// hand method; sanctioned by AASHTO 4.6.2.2 for exterior girders and
// shear, and the board-exam standard):
//   · Wheels sit 1.8 m apart on the axle; the design lane is 3.6 m wide;
//     the first lane starts 0.6 m from the deck edge.
//   · Interior girder, one lane: one wheel line placed on the girder, its
//     partner 1.8 m into the span between girders.
//   · Exterior girder: the deck strip runs from the girder to the first
//     interior girder (span S) with a cantilever d to the edge; wheels
//     take their measured positions and the strip reacts as a simple beam
//     with overhang.
//   · g = Σ(reaction per unit wheel load) / 2 — i.e. the girder's share of
//     ONE design lane's axle. Multiple presence m = 1.2 (one lane) or
//     1.0 (two lanes) multiplies on top, per AASHTO 3.6.1.1.2.
// ─────────────────────────────────────────────────────────────────────────

import { ilValueAt, type ILPoint } from './influenceBeam'

// ── the HL-93 vehicles ───────────────────────────────────────────────────

export interface Axle { p: number; o: number } // load kN, offset from the leading axle, m

export const TRUCK_FRONT_GAP = 4.26
export const TRUCK_MIN_GAP = 4.26
export const TRUCK_MAX_GAP = 9.0
export const TANDEM_GAP = 1.2
export const LANE_LOAD = 9.3 // kN/m per design lane
export const IM = 0.33 // dynamic load allowance

/** Design truck axles with the rear-axle spacing s (offsets from the FRONT axle). */
export function truckAxles(s: number): Axle[] {
  if (!(s >= TRUCK_MIN_GAP - 1e-9 && s <= TRUCK_MAX_GAP + 1e-9))
    throw new Error(`Truck rear-axle spacing must be within ${TRUCK_MIN_GAP}–${TRUCK_MAX_GAP} m`)
  return [{ p: 35, o: 0 }, { p: 145, o: TRUCK_FRONT_GAP }, { p: 145, o: TRUCK_FRONT_GAP + s }]
}

export function tandemAxles(): Axle[] {
  return [{ p: 110, o: 0 }, { p: 110, o: TANDEM_GAP }]
}

/** Mirror a vehicle so it can also drive right-to-left (matters for shear signs). */
export function reversedAxles(ax: Axle[]): Axle[] {
  const total = ax[ax.length - 1].o
  return [...ax].reverse().map((a) => ({ p: a.p, o: total - a.o }))
}

// ── simple-span influence lines (exact piecewise linear) ─────────────────

// ilValueAt clamps outside an IL to its END ordinate. Off-span axles must
// contribute ZERO, so every IL gets a zero shoulder just outside the span
// (and at a shear section's far side): the walk's candidate positions hit
// the shoulder breakpoints exactly, so the piecewise-linear extreme stays
// exact while clamped axles read 0 instead of a phantom peak.
const EPS = 1e-6

/** Moment IL at section a: 0 → a(L−a)/L → 0 (zero outside the span). */
export function momentIL(L: number, a: number): ILPoint[] {
  return [{ x: 0, v: 0 }, { x: a, v: a * (L - a) / L }, { x: L, v: 0 }]
}

/** Positive-shear IL at section a: (L−x)/L for x just right of a, 0 left of it. */
export function shearPlusIL(L: number, a: number): ILPoint[] {
  if (a <= 1e-9) return reactionIL(L) // section on the support: the same line
  return [
    { x: 0, v: 0 },
    { x: a - EPS, v: 0 },
    { x: a, v: (L - a) / L },
    { x: L, v: 0 },
  ]
}

/** Negative-shear IL at section a: −x/L for x just left of a, 0 right of it. */
export function shearMinusIL(L: number, a: number): ILPoint[] {
  return [
    { x: 0, v: 0 },
    { x: a, v: -a / L },
    { x: Math.min(L, a + EPS), v: 0 },
    { x: L, v: 0 },
  ]
}

/** Reaction IL at the left support: (L−x)/L on the span, 0 for axles off either end. */
export function reactionIL(L: number): ILPoint[] {
  return [
    { x: -EPS, v: 0 },
    { x: 0, v: 1 },
    { x: L, v: 0 },
    { x: L + EPS, v: 0 },
  ]
}

// ── the vehicle walk ─────────────────────────────────────────────────────

export interface WalkHit { v: number; x: number }

/**
 * Extreme of Σ Pᵢ·IL(x + oᵢ) as the leading axle travels x ∈ [xlo, xhi].
 *
 * F(x) is piecewise linear with kinks where any axle crosses an IL
 * breakpoint, so evaluating at those positions (+ the ends) is EXACT —
 * axles off the span contribute zero because ilValueAt clamps at the ends.
 */
export function walkVehicle(pts: ILPoint[], axles: Axle[], xlo: number, xhi: number): WalkHit {
  if (xhi < xlo) throw new Error('Empty travel range')
  const cands = new Set<number>([xlo, xhi])
  for (const b of pts) {
    for (const a of axles) {
      const x = b.x - a.o
      if (x >= xlo - 1e-9 && x <= xhi + 1e-9) cands.add(Math.min(xhi, Math.max(xlo, x)))
    }
  }
  let best: WalkHit | null = null
  for (const x of cands) {
    let v = 0
    for (const a of axles) v += a.p * ilValueAt(pts, x + a.o)
    if (best === null || Math.abs(v) > Math.abs(best.v)) best = { v, x }
  }
  return best!
}

/** Best over every rear-axle spacing of the design truck (both drive directions). */
export function walkTruck(pts: ILPoint[], L: number): WalkHit & { spacing: number; axles: Axle[] } {
  let best: (WalkHit & { spacing: number; axles: Axle[] }) | null = null
  const STEP = 0.05
  for (let s = TRUCK_MIN_GAP; s <= TRUCK_MAX_GAP + 1e-9; s += STEP) {
    const ax = truckAxles(s)
    for (const orientation of [ax, reversedAxles(ax)]) {
      const hit = walkVehicle(pts, orientation, -12, L) // allow axles off either end
      if (best === null || Math.abs(hit.v) > Math.abs(best.v)) best = { ...hit, spacing: s, axles: orientation }
    }
  }
  return best!
}

export function walkTandem(pts: ILPoint[], L: number): WalkHit & { axles: Axle[] } {
  let best: (WalkHit & { axles: Axle[] }) | null = null
  for (const orientation of [tandemAxles(), reversedAxles(tandemAxles())]) {
    const hit = walkVehicle(pts, orientation, -6, L)
    if (best === null || Math.abs(hit.v) > Math.abs(best.v)) best = { ...hit, axles: orientation }
  }
  return best!
}

/** Per-axle ordinates at a parked position — feeds the governing-load drawing. */
export function axleOrdinates(pts: ILPoint[], axles: Axle[], x: number): { p: number; x: number; ord: number; contribution: number }[] {
  return axles.map((a) => {
    const ord = ilValueAt(pts, x + a.o)
    return { p: a.p, x: x + a.o, ord, contribution: a.p * ord }
  })
}

// ── lane-load effects (closed form on a simple span) ─────────────────────

export function laneMoment(L: number, a: number, w = LANE_LOAD): number {
  return w * a * (L - a) / 2
}

export function laneShearPlus(L: number, a: number, w = LANE_LOAD): number {
  return w * (L - a) * (L - a) / (2 * L) // load on the right of a
}

export function laneShearMinus(L: number, a: number, w = LANE_LOAD): number {
  return -w * a * a / (2 * L) // load on the left of a
}

// ── transverse distribution: the lever rule ──────────────────────────────

export interface DeckInput {
  /** Girder spacing, m. */
  S: number
  /** Overhang from the deck edge to the exterior girder centre, m (exterior case). */
  d?: number
  /** Which girder the lever strip serves. */
  girder: 'interior' | 'exterior'
  /** Loaded design lanes — chosen by the assembly, not the caller (1 or 2). */
  lanes?: 1 | 2
  /** Wheel-line spacing on the axle, m (default 1.8). */
  wheelSpacing?: number
  /** Design lane width, m (default 3.6). */
  laneWidth?: number
  /** Setback of the first lane from the deck edge, m (default 0.6). */
  edgeSetback?: number
}

export interface LeverResult {
  /** Distribution factor (multiple presence NOT yet applied). */
  g: number
  /** Multiple presence factor that applies with this lane count. */
  m: number
  /** Wheel positions measured from the reference girder, m, with their simple-beam reaction shares. */
  wheels: { x: number; r: number }[]
  /** Σr before the division by 2. */
  sumR: number
}

/**
 * Lever-rule distribution factor. Every wheel of every loaded lane is
 * placed at its measured transverse position; the deck strip between the
 * reference girder and its neighbour (span S, plus the exterior overhang)
 * reacts as a simply supported beam with overhang; the girder's share of
 * one design lane's axle is Σr/2.
 */
export function leverRule(p: DeckInput): LeverResult {
  const wheelSpacing = p.wheelSpacing ?? 1.8
  const laneWidth = p.laneWidth ?? 3.6
  const setback = p.edgeSetback ?? 0.6
  const lanes = p.lanes ?? 1
  if (!(p.S > 0)) throw new Error('Girder spacing must be positive')
  if (lanes !== 1 && lanes !== 2) throw new Error('Load one or two design lanes')

  const wheels: { x: number; r: number }[] = []
  if (p.girder === 'interior') {
    // Optimal single-lane placement: one wheel line ON the girder, its
    // partner wheelSpacing away inside the span between girders. The second
    // lane mirrors around the girder; its near wheel also lands on the
    // girder (the usual lever simplification when two lanes squeeze the
    // beam) and its far wheel reacts through the span on the other side,
    // where this girder is the far support — share (S−|x|)/S, the mirror
    // of the right-side wheel.
    const share = (x: number): number => (p.S - Math.min(Math.abs(x), p.S)) / p.S
    if (lanes === 1) {
      for (const o of [0, wheelSpacing]) wheels.push({ x: o, r: share(o) })
    } else {
      for (const o of [0, wheelSpacing, 0, -wheelSpacing]) wheels.push({ x: o, r: share(o) })
    }
  } else {
    const d = p.d
    if (!(d != null && d >= 0)) throw new Error('Exterior lever rule needs the overhang d (edge → girder)')
    for (let lane = 0; lane < lanes; lane++) {
      const laneStart = setback + lane * laneWidth // strip start from the edge
      for (const w of [laneWidth / 2 - wheelSpacing / 2, laneWidth / 2 + wheelSpacing / 2]) {
        const fromEdge = laneStart + w
        const x = fromEdge - d // position relative to the exterior girder
        // simple beam A (girder) — B (first interior girder, span S), cantilever left of A
        let r: number
        if (x <= 0) r = 1 + x / p.S // on the overhang: A takes more than the wheel
        else if (x >= p.S) r = 0 // at or beyond B: nothing comes to A
        else r = (p.S - x) / p.S
        wheels.push({ x, r })
      }
    }
  }
  const sumR = wheels.reduce((s, w) => s + w.r, 0)
  const g = sumR / 2
  const m = lanes === 1 ? 1.2 : 1.0
  return { g, m, wheels, sumR }
}

// ── the assembly ─────────────────────────────────────────────────────────

export interface BridgeInput {
  /** Span length, m. */
  L: number
  /** Deck transverse case for the lever rule. */
  deck: DeckInput
  /** Dynamic load allowance override (default 0.33). */
  IM?: number
  /** Lane load override, kN/m (default 9.3). */
  laneW?: number
}

export interface GoverningCase {
  value: number
  section: number
  vehicle: 'truck' | 'tandem'
  spacing: number | null
  /** Leading-axle position from the left support, m. */
  position: number
  axles: { p: number; x: number; ord: number; contribution: number }[]
}

export interface BridgeEnvelopePoint {
  x: number
  /** Combined moment at the section (always ≥ 0 on a simple span), kN·m. */
  M: number
  /** Combined positive / negative shear, kN. */
  Vpos: number
  Vneg: number
}

export interface BridgeResult {
  L: number
  /** Governing lever-rule case and the losing one, for transparency. */
  lever: { governing: LeverResult; other: LeverResult }
  /** Final distribution factor g·m of the governing case. */
  DF: number
  IM: number
  laneW: number
  /** Envelope across the span at ~101 sections, combined per girder. */
  envelope: BridgeEnvelopePoint[]
  moment: GoverningCase & { lanePart: number; vehPart: number }
  shear: GoverningCase & { sign: 1 | -1; lanePart: number; vehPart: number; sectionLabel: string }
  reaction: GoverningCase & { lanePart: number; vehPart: number }
}

/**
 * Full HL-93 simple-span result: per-lane envelopes from the IL walks,
 * lever-rule DF, and the combined per-girder governing cases.
 */
export function hl93SimpleSpan(p: BridgeInput): BridgeResult {
  const L = p.L
  if (!(L > 0)) throw new Error('Span must be positive')
  const im = p.IM ?? IM
  const w = p.laneW ?? LANE_LOAD

  // — transverse: try one lane and two lanes, keep the governing —
  const lever1 = leverRule({ ...p.deck, lanes: 1 })
  const lever2 = leverRule({ ...p.deck, lanes: 2 })
  const g1 = lever1.g * lever1.m
  const g2 = lever2.g * lever2.m
  const governing = g2 >= g1 ? lever2 : lever1
  const other = g2 >= g1 ? lever1 : lever2
  const DF = governing.g * governing.m

  // — longitudinal envelopes per design lane —
  const N = 100
  const xs: number[] = []
  for (let j = 0; j <= N; j++) xs.push((L * j) / N)

  const vehMaxMoment = (a: number): { v: number; vehicle: 'truck' | 'tandem'; spacing: number | null; x: number } => {
    const t = walkTruck(momentIL(L, a), L)
    const d = walkTandem(momentIL(L, a), L)
    return Math.abs(t.v) >= Math.abs(d.v)
      ? { v: t.v, vehicle: 'truck', spacing: t.spacing, x: t.x }
      : { v: d.v, vehicle: 'tandem', spacing: null, x: d.x }
  }
  const vehMaxShearPlus = (a: number) => {
    const t = walkTruck(shearPlusIL(L, a), L)
    const d = walkTandem(shearPlusIL(L, a), L)
    return Math.abs(t.v) >= Math.abs(d.v)
      ? { v: Math.max(0, t.v), vehicle: 'truck' as const, spacing: t.spacing, x: t.x }
      : { v: Math.max(0, d.v), vehicle: 'tandem' as const, spacing: null, x: d.x }
  }
  const vehMaxShearMinus = (a: number) => {
    const t = walkTruck(shearMinusIL(L, a), L)
    const d = walkTandem(shearMinusIL(L, a), L)
    return Math.abs(t.v) >= Math.abs(d.v)
      ? { v: Math.min(0, t.v), vehicle: 'truck' as const, spacing: t.spacing, x: t.x }
      : { v: Math.min(0, d.v), vehicle: 'tandem' as const, spacing: null, x: d.x }
  }

  const envelope: BridgeEnvelopePoint[] = xs.map((x) => {
    const vm = vehMaxMoment(x)
    const M = DF * (1 + im) * vm.v + DF * laneMoment(L, x, w)
    const vp = vehMaxShearPlus(x)
    const vmn = vehMaxShearMinus(x)
    const Vpos = DF * (1 + im) * vp.v + DF * laneShearPlus(L, x, w)
    const Vneg = DF * (1 + im) * vmn.v + DF * laneShearMinus(L, x, w)
    return { x, M, Vpos, Vneg }
  })

  // — governing cases with per-axle detail —
  const buildCase = (
    which: 'moment' | 'shearPlus' | 'shearMinus',
  ): GoverningCase => {
    // find the section with the largest combined effect, then re-run the
    // walk at that section for the per-axle parking drawing
    let bestJ = 0
    let bestVal = -Infinity
    envelope.forEach((e, j) => {
      const val = which === 'moment' ? e.M : which === 'shearPlus' ? e.Vpos : Math.abs(e.Vneg)
      if (val > bestVal) { bestVal = val; bestJ = j }
    })
    const a = xs[bestJ]
    const pts = which === 'moment' ? momentIL(L, a) : which === 'shearPlus' ? shearPlusIL(L, a) : shearMinusIL(L, a)
    const t = walkTruck(pts, L)
    const d = walkTandem(pts, L)
    const veh = Math.abs(t.v) >= Math.abs(d.v)
      ? { v: t.v, vehicle: 'truck' as const, spacing: t.spacing as number | null, x: t.x, axles: t.axles }
      : { v: d.v, vehicle: 'tandem' as const, spacing: null as number | null, x: d.x, axles: d.axles }
    const parked = axleOrdinates(pts, veh.axles, veh.x)
    const value = which === 'shearMinus' ? -Math.abs(bestVal) : bestVal
    return {
      value: which === 'shearMinus' ? Math.min(0, value) : value,
      section: a,
      vehicle: veh.vehicle,
      spacing: veh.spacing,
      position: veh.x,
      axles: parked,
    }
  }

  const momentCase = buildCase('moment')
  const shearPlusCase = buildCase('shearPlus')
  const shearMinusCase = buildCase('shearMinus')
  const usePlus = Math.abs(shearPlusCase.value) >= Math.abs(shearMinusCase.value)
  const shearCaseRaw = usePlus ? shearPlusCase : shearMinusCase

  // — reaction at the left support —
  const rIL = reactionIL(L)
  const tR = walkTruck(rIL, L)
  const dR = walkTandem(rIL, L)
  const rVeh = Math.abs(tR.v) >= Math.abs(dR.v)
    ? { v: tR.v, vehicle: 'truck' as const, spacing: tR.spacing as number | null, x: tR.x, axles: tR.axles }
    : { v: dR.v, vehicle: 'tandem' as const, spacing: null as number | null, x: dR.x, axles: dR.axles }
  const rParked = axleOrdinates(rIL, rVeh.axles, rVeh.x)
  const reaction: GoverningCase & { lanePart: number; vehPart: number } = {
    value: DF * (1 + im) * Math.abs(rVeh.v) + DF * w * L / 2,
    section: 0,
    vehicle: rVeh.vehicle,
    spacing: rVeh.spacing,
    position: rVeh.x,
    axles: rParked,
    lanePart: DF * w * L / 2,
    vehPart: DF * (1 + im) * Math.abs(rVeh.v),
  }

  return {
    L,
    lever: { governing, other },
    DF,
    IM: im,
    laneW: w,
    envelope,
    moment: {
      ...momentCase,
      lanePart: DF * laneMoment(L, momentCase.section, w),
      vehPart: momentCase.value - DF * laneMoment(L, momentCase.section, w),
    },
    shear: {
      ...shearCaseRaw,
      sign: usePlus ? 1 : -1,
      lanePart: usePlus ? DF * laneShearPlus(L, shearCaseRaw.section, w) : DF * laneShearMinus(L, shearCaseRaw.section, w),
      vehPart: Math.abs(shearCaseRaw.value) - Math.abs(usePlus ? DF * laneShearPlus(L, shearCaseRaw.section, w) : DF * laneShearMinus(L, shearCaseRaw.section, w)),
      sectionLabel: Math.abs(shearCaseRaw.section) < L / 200 ? 'support' : `${shearCaseRaw.section.toFixed(2)} m`,
    },
    reaction,
  }
}
