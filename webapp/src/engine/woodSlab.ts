// ─────────────────────────────────────────────────────────────────────────
// Wood slab / deck-on-joist floor system — ASD per NDS 2018 §3 / NSCP 2015 §6.
//
// A wood "slab" is a decking layer (planks or bamboo slats) spanning between
// repetitive joists, which in turn span between supports.  Two flexural checks,
// both solid-rectangular ASD members reusing the woodDesign adjustment machinery:
//
//   1. Deck  — a single board (plank / bamboo slat) spans the JOIST SPACING and
//              carries the floor pressure over its own face width.  Its
//              compression edge is continuously braced by the load, so CL = 1.
//   2. Joist — a repetitive beam spans between supports and carries a tributary
//              strip one joist-spacing wide (plus its own and the deck weight).
//              Continuously braced by the decking (CL = 1); gets the repetitive-
//              member factor Cr = 1.15 when it is dimension lumber ≤ 610 mm o.c.
//
// UDL demands use standard beam coefficients (NSCP/ACI): simple span M = wL²/8,
// V = wL/2, Δ = 5wL⁴/384EI; continuous (≥3 equal spans) M = wL²/10, V = 0.6wL,
// Δ = wL⁴/145EI (end span governs).  Deflection uses the SERVICE modulus E′
// (no load-duration boost).  Live-load limit L/360, total L/240 (NSCP Table 6…).
//
// Units: geometry mm; spans m; pressures kPa (kN/m²); line load kN/m; forces kN;
// moments kN·m; stress MPa; deflection mm.
// ─────────────────────────────────────────────────────────────────────────
import {
  type WoodRefValues, type WoodKind, type WoodAdjustOpts,
  woodAdjusted, woodSectionProps, woodUnitWeight, checkWoodBeam,
} from './woodDesign'
import { BDFT_PER_M3 } from './takeoff'

/** Indicative ASD allowable stresses for flattened / laminated STRUCTURAL BAMBOO
 *  (e.g. Guadua, Bambusa / kawayan).  NOT an NDS-tabulated species — these are
 *  conservative values distilled from ISO 22156 and published test data and are
 *  meant for preliminary sizing only.  A final bamboo design should use
 *  species-specific characteristic values with the ISO 22156 partial factors and
 *  moisture/geometry modifiers; the woodDesign C-factor framework is applied here
 *  only for a consistent, conservative first pass (MPa; G = specific gravity). */
export const BAMBOO_SLAT_REF: WoodRefValues = {
  Fb: 12, Ft: 10, Fv: 1.4, FcPerp: 2.0, Fc: 14, E: 12000, Emin: 6000, G: 0.65,
}

/** Decking material — both are solid rectangular strips, differing only in the
 *  reference values and the board-vs-slat quantity reporting. */
export type DeckMaterial = 'plank' | 'bamboo-slat'
/** Support idealisation of a flexural run.  'continuous' ⇒ ≥3 equal spans. */
export type SlabSupport = 'simple' | 'continuous'

/** UDL beam coefficients {M: wL²·cM, V: wL·cV, Δ: cD·wL⁴/EI}. */
const FLEX: Record<SlabSupport, { M: number; V: number; D: number }> = {
  simple:     { M: 1 / 8,  V: 0.5, D: 5 / 384 },
  continuous: { M: 1 / 10, V: 0.6, D: 1 / 145 },  // ≥3 equal spans, end span governs
}

const DEFAULT_SLAT_LEN = 2.4   // m, nominal bamboo-slat / board stock length

export interface WoodSlabInput {
  // ── plan (m) ──
  Lx: number                 // slab dimension parallel to the JOIST SPAN
  Ly: number                 // slab dimension across which the joists repeat
  // ── joists ──
  joistRef: WoodRefValues
  joistKind?: WoodKind       // default 'sawn'
  joistB: number             // width, mm
  joistD: number             // depth, mm
  joistSpacing: number       // centre-to-centre, mm
  joistSpan?: number         // m, default Lx
  joistSupport?: SlabSupport // default 'simple'
  // ── deck ──
  deckMaterial: DeckMaterial
  deckRef?: WoodRefValues    // default: plank → joistRef, bamboo-slat → BAMBOO_SLAT_REF
  deckThickness: number      // mm
  deckWidth?: number         // face width of one board/slat, mm (default 140 plank / 50 slat)
  deckSupport?: SlabSupport   // default 'continuous' (runs over ≥3 joists)
  slatLength?: number        // m, stock length for bamboo-slat counting (default 2.4)
  // ── loads (superimposed, self-weight added internally) ──
  deadKpa: number            // finishes / superimposed dead, kPa
  liveKpa: number            // live load, kPa
  // ── options ──
  opts?: WoodAdjustOpts
  deflLiveLimit?: number     // span / n, default 360
  deflTotalLimit?: number    // span / n, default 240
}

export interface FlexuralCheck {
  b: number; d: number; span: number          // mm, mm, m
  w: number; wLive: number                     // kN/m (total, live-only)
  M: number; V: number                         // kN·m, kN
  fb: number; FbPrime: number; bendingRatio: number
  fv: number; FvPrime: number; shearRatio: number
  deflLive: number; deflLiveAllow: number; deflLiveRatio: number    // mm
  deflTotal: number; deflTotalAllow: number; deflTotalRatio: number // mm
  ratio: number; ok: boolean
}

export interface WoodSlabTakeoff {
  area: number               // m²
  joistCount: number
  joistLengthM: number       // total joist linear metres
  joistM3: number
  joistBoardFeet: number
  deckAreaM2: number
  deckM3: number
  deckBoardFeet: number
  bambooSlatCount?: number   // deck === 'bamboo-slat' only
}

export interface WoodSlabResult {
  deck: FlexuralCheck
  joist: FlexuralCheck
  loads: { deadKpa: number; liveKpa: number; deckSelfKpa: number; joistSelfKpa: number; totalKpa: number }
  takeoff: WoodSlabTakeoff
  ratio: number
  ok: boolean
  clause: string
}

/** Repetitive-member factor Cr (NDS §4.3.9): 1.15 for dimension lumber (least
 *  dimension ≤ 89 mm) spaced ≤ 610 mm with ≥3 in a row; 1.0 otherwise / bamboo. */
function repetitiveCr(kind: WoodKind, leastDim: number, spacing: number, count: number, bamboo: boolean): number {
  return !bamboo && kind === 'sawn' && leastDim <= 89 && spacing <= 610 && count >= 3 ? 1.15 : 1.0
}

/** One UDL flexural run: bending + horizontal shear (via checkWoodBeam) plus
 *  live and total service deflection.  Compression edge continuously braced so
 *  the stability factor CL = 1 (lu = 0). */
function flexuralRun(p: {
  ref: WoodRefValues; kind: WoodKind; b: number; d: number; span: number
  wTotal: number; wLive: number; support: SlabSupport
  opts: WoodAdjustOpts; deflLiveLimit: number; deflTotalLimit: number
}): FlexuralCheck {
  const c = FLEX[p.support]
  const Lm = p.span, Lmm = Lm * 1000
  const M = p.wTotal * Lm * Lm * c.M              // kN·m
  const V = p.wTotal * Lm * c.V                   // kN
  const beam = checkWoodBeam({ ref: p.ref, kind: p.kind, b: p.b, d: p.d, length: Lmm, M, V, lu: 0, opts: p.opts })
  const { I } = woodSectionProps(p.b, p.d)        // mm⁴
  const Eserv = woodAdjusted(p.ref, p.kind, p.d, p.opts).E   // MPa, service (no CD)
  // Δ = cD·w·L⁴/(E·I).  w kN/m ≡ N/mm, L mm, E MPa, I mm⁴ → Δ mm.
  const defl = (w: number) => (c.D * w * Math.pow(Lmm, 4)) / (Eserv * I)
  const deflLive = defl(p.wLive), deflTotal = defl(p.wTotal)
  const deflLiveAllow = Lmm / p.deflLiveLimit, deflTotalAllow = Lmm / p.deflTotalLimit
  const deflLiveRatio = deflLive / deflLiveAllow, deflTotalRatio = deflTotal / deflTotalAllow
  const ratio = Math.max(beam.bendingRatio, beam.shearRatio, deflLiveRatio, deflTotalRatio)
  return {
    b: p.b, d: p.d, span: p.span, w: p.wTotal, wLive: p.wLive, M, V,
    fb: beam.fb, FbPrime: beam.FbPrime, bendingRatio: beam.bendingRatio,
    fv: beam.fv, FvPrime: beam.FvPrime, shearRatio: beam.shearRatio,
    deflLive, deflLiveAllow, deflLiveRatio, deflTotal, deflTotalAllow, deflTotalRatio,
    ratio, ok: ratio <= 1,
  }
}

/** Design a wood slab (deck + repetitive joists) to NDS §3 / NSCP §6 (ASD). */
export function designWoodSlab(i: WoodSlabInput): WoodSlabResult {
  const joistKind = i.joistKind ?? 'sawn'
  const bamboo = i.deckMaterial === 'bamboo-slat'
  const deckRef = i.deckRef ?? (bamboo ? BAMBOO_SLAT_REF : i.joistRef)
  const deckKind: WoodKind = 'sawn'
  const deckWidth = i.deckWidth ?? (bamboo ? 50 : 140)
  const joistSpan = i.joistSpan ?? i.Lx
  const deflLiveLimit = i.deflLiveLimit ?? 360
  const deflTotalLimit = i.deflTotalLimit ?? 240

  // ── self weights (kPa) ──
  const deckSelfKpa = (woodUnitWeight(deckRef.G) * i.deckThickness) / 1000     // γ·t, kN/m³·mm/1000 = kN/m²
  const joistCount = Math.max(2, Math.floor((i.Ly * 1000) / i.joistSpacing) + 1)
  // smear the joist self weight over the floor area for the pressure summary
  const joistVolPerM = (i.joistB * i.joistD) / 1e6                              // m³ per linear m
  const joistSelfKpa = (woodUnitWeight(i.joistRef.G) * joistVolPerM * joistCount * joistSpan) / (i.Lx * i.Ly)

  const superKpa = i.deadKpa + i.liveKpa
  const deadTotKpa = i.deadKpa + deckSelfKpa + joistSelfKpa

  // ── deck: one board spans the joist spacing, tributary = its own width ──
  const spacingM = i.joistSpacing / 1000, deckWm = deckWidth / 1000
  const deckDeadKpa = i.deadKpa + deckSelfKpa          // deck sees finishes + own weight (not the joist)
  const deck = flexuralRun({
    ref: deckRef, kind: deckKind, b: deckWidth, d: i.deckThickness, span: spacingM,
    wTotal: (deckDeadKpa + i.liveKpa) * deckWm, wLive: i.liveKpa * deckWm,
    support: i.deckSupport ?? 'continuous',
    opts: { ...i.opts, Cr: repetitiveCr(deckKind, i.deckThickness, deckWidth, 3, bamboo) },
    deflLiveLimit, deflTotalLimit,
  })

  // ── joist: tributary strip one spacing wide, + its own smeared weight ──
  const joistSelfPerM = woodUnitWeight(i.joistRef.G) * joistVolPerM            // kN/m
  const joist = flexuralRun({
    ref: i.joistRef, kind: joistKind, b: i.joistB, d: i.joistD, span: joistSpan,
    wTotal: (deadTotKpa - joistSelfKpa + i.liveKpa) * spacingM + joistSelfPerM,
    wLive: i.liveKpa * spacingM,
    support: i.joistSupport ?? 'simple',
    opts: { ...i.opts, Cr: repetitiveCr(joistKind, Math.min(i.joistB, i.joistD), i.joistSpacing, joistCount, false) },
    deflLiveLimit, deflTotalLimit,
  })

  // ── take-off ──
  const area = i.Lx * i.Ly
  const joistLengthM = joistCount * joistSpan
  const joistM3 = joistLengthM * joistVolPerM
  const deckM3 = area * (i.deckThickness / 1000)
  const slatLen = i.slatLength ?? DEFAULT_SLAT_LEN
  const courses = Math.ceil(i.Lx / deckWm)                       // deck runs across joists, courses stack along Lx
  const takeoff: WoodSlabTakeoff = {
    area, joistCount, joistLengthM, joistM3, joistBoardFeet: joistM3 * BDFT_PER_M3,
    deckAreaM2: area, deckM3, deckBoardFeet: deckM3 * BDFT_PER_M3,
    ...(bamboo ? { bambooSlatCount: courses * Math.ceil(i.Ly / slatLen) } : {}),
  }

  const ratio = Math.max(deck.ratio, joist.ratio)
  return {
    deck, joist,
    loads: { deadKpa: i.deadKpa, liveKpa: i.liveKpa, deckSelfKpa, joistSelfKpa, totalKpa: superKpa + deckSelfKpa + joistSelfKpa },
    takeoff, ratio, ok: ratio <= 1,
    clause: 'NDS §3.3–§3.4 / NSCP §6 (ASD)',
  }
}
