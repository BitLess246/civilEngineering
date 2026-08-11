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
import { BDFT_PER_M3, type TimberSizeQty } from './takeoff'
import { type SolutionStep, sn1, sn2, sn3, sn4 } from '../lib/solution'

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

// ── Worked solution ────────────────────────────────────────────────────────
// Both members are the same ASD check on a different span and tributary width,
// so the bending / shear / deflection steps are generated once and reused. The
// step titles name the member, because a reader scanning the report needs to
// know whether a FAIL chip belongs to a 25 mm board or a 50×200 joist.

/** The three checks on one flexural run, as steps. `cM`/`cD` are the UDL
 *  coefficients actually used, so a continuous run prints wL²/10 not wL²/8. */
function runSteps(name: string, c: FlexuralCheck, support: SlabSupport, tributary: string): SolutionStep[] {
  const k = FLEX[support]
  const S = (c.b * c.d * c.d) / 6                      // mm³
  const { I } = woodSectionProps(c.b, c.d)             // mm⁴
  const spanLabel = support === 'continuous' ? 'continuous (≥3 equal spans, end span governs)' : 'simple span'
  return [
    {
      title: `${name} — bending`, clause: 'NDS §3.3 / NSCP §6',
      lines: [
        { text: `${c.b}×${c.d} mm over ${sn3(c.span)} m, ${spanLabel}. ${tributary}` },
        { tex: `M = c_M\\,wL^2 = ${sn3(k.M)}\\times ${sn3(c.w)}\\times ${sn3(c.span)}^2 = ${sn3(c.M)}\\ \\text{kN·m}` },
        { tex: `f_b = \\dfrac{M}{S} = \\dfrac{${sn3(c.M)}\\times 10^6}{${sn2(S)}} = ${sn2(c.fb)}\\ \\text{MPa} \\;${c.fb <= c.FbPrime ? '\\le' : '>'}\\; F_b' = ${sn2(c.FbPrime)}\\ \\text{MPa}` },
        { text: `Utilisation ${sn2(c.bendingRatio)}. Fb′ is the reference Fb with every applicable NDS §4.3 adjustment; the compression edge is braced by the load it carries, so CL = 1.` },
      ],
      pass: c.bendingRatio <= 1,
    },
    {
      title: `${name} — horizontal shear`, clause: 'NDS §3.4.2',
      lines: [
        { tex: `V = c_V\\,wL = ${sn2(k.V)}\\times ${sn3(c.w)}\\times ${sn3(c.span)} = ${sn3(c.V)}\\ \\text{kN}` },
        { tex: `f_v = \\dfrac{3V}{2bd} = \\dfrac{3\\times ${sn3(c.V)}\\times 10^3}{2\\times ${c.b}\\times ${c.d}} = ${sn3(c.fv)}\\ \\text{MPa} \\;${c.fv <= c.FvPrime ? '\\le' : '>'}\\; F_v' = ${sn3(c.FvPrime)}\\ \\text{MPa}` },
      ],
      pass: c.shearRatio <= 1,
      note: 'Shear rarely governs a floor member; deflection usually does.',
    },
    {
      title: `${name} — deflection`, clause: 'NSCP Table 6 (L/360 live, L/240 total)',
      lines: [
        { tex: `\\Delta = c_\\Delta\\dfrac{wL^4}{E'I},\\quad c_\\Delta = ${sn4(k.D)},\\; I = ${sn2(I / 1e6)}\\times 10^6\\ \\text{mm}^4` },
        { tex: `\\Delta_{L} = ${sn2(c.deflLive)}\\ \\text{mm} \\;${c.deflLiveRatio <= 1 ? '\\le' : '>'}\\; \\dfrac{L}{360} = ${sn2(c.deflLiveAllow)}\\ \\text{mm}` },
        { tex: `\\Delta_{D+L} = ${sn2(c.deflTotal)}\\ \\text{mm} \\;${c.deflTotalRatio <= 1 ? '\\le' : '>'}\\; \\dfrac{L}{240} = ${sn2(c.deflTotalAllow)}\\ \\text{mm}` },
        { text: 'Deflection uses the SERVICE modulus E′ — the load-duration factor CD raises stresses, never stiffness.' },
      ],
      pass: c.deflLiveRatio <= 1 && c.deflTotalRatio <= 1,
    },
  ]
}

/** Step-by-step ASD check of a wood slab, for the printable calculation report. */
export function woodSlabSolution(i: WoodSlabInput, r: WoodSlabResult): SolutionStep[] {
  const bamboo = i.deckMaterial === 'bamboo-slat'
  const deckWidth = i.deckWidth ?? (bamboo ? 50 : 140)
  const spacingM = i.joistSpacing / 1000
  return [
    {
      title: 'Loads on the floor', clause: 'NSCP §204 / §205',
      lines: [
        { text: `Superimposed dead ${sn2(r.loads.deadKpa)} kPa, live ${sn2(r.loads.liveKpa)} kPa.` },
        { tex: `w_{deck,self} = \\gamma t = ${sn3(woodUnitWeight((i.deckRef ?? (bamboo ? BAMBOO_SLAT_REF : i.joistRef)).G))}\\times \\dfrac{${i.deckThickness}}{1000} = ${sn3(r.loads.deckSelfKpa)}\\ \\text{kPa}` },
        { tex: `w_{joist,self} = ${sn3(r.loads.joistSelfKpa)}\\ \\text{kPa}\\ \\text{(smeared over the } ${sn2(r.takeoff.area)}\\ \\text{m}^2 \\text{ floor)}` },
        { tex: `w_{total} = ${sn3(r.loads.totalKpa)}\\ \\text{kPa}` },
      ],
      note: 'The deck carries finishes and its own weight only — it sits on the joists, so it never carries them.',
    },
    ...runSteps(
      bamboo ? 'Deck (bamboo slat)' : 'Deck (plank)', r.deck, i.deckSupport ?? 'continuous',
      `One board spans the ${i.joistSpacing} mm joist spacing and carries the floor pressure over its own ${deckWidth} mm face width.`,
    ),
    ...runSteps(
      'Joist', r.joist, i.joistSupport ?? 'simple',
      `Each joist carries a tributary strip one spacing wide (${sn3(spacingM)} m) plus its own weight; ${r.takeoff.joistCount} joists at ${i.joistSpacing} mm o.c.`,
    ),
    {
      title: 'Governing utilisation', clause: r.clause,
      lines: [
        { tex: `\\text{ratio} = \\max(${sn2(r.deck.ratio)}_{deck},\\ ${sn2(r.joist.ratio)}_{joist}) = ${sn2(r.ratio)}` },
        { text: r.ok
          ? `The ${r.joist.ratio >= r.deck.ratio ? 'joist' : 'deck'} governs at ${sn1(r.ratio * 100)}% of its allowable.`
          : `The ${r.joist.ratio >= r.deck.ratio ? 'joist' : 'deck'} is overstressed at ${sn1(r.ratio * 100)}% — increase the depth, or close the spacing.` },
      ],
      pass: r.ok,
      note: 'Bearing at the joist supports, the fastener schedule and diaphragm action are separate checks, not covered here.',
    },
  ]
}

/** Express a wood-slab take-off as wood-frame BOM rows (TimberSizeQty, board-feet
 *  by size × species), so the slab's joists and decking aggregate into — and cost
 *  through the same `costTimberRows` as — the wood-frame bill of materials. */
export function woodSlabTimberSizes(
  i: WoodSlabInput, r: WoodSlabResult, labels: { joist?: string; deck?: string } = {},
): TimberSizeQty[] {
  const bamboo = i.deckMaterial === 'bamboo-slat'
  const deckWidth = i.deckWidth ?? (bamboo ? 50 : 140)
  const deckLenM = r.takeoff.deckM3 / ((deckWidth / 1000) * (i.deckThickness / 1000))  // total board linear metres
  return [
    {
      name: `${i.joistB}×${i.joistD}`, species: labels.joist ?? '—', kind: i.joistKind ?? 'sawn',
      count: r.takeoff.joistCount, L: r.takeoff.joistLengthM, m3: r.takeoff.joistM3, boardFeet: r.takeoff.joistBoardFeet,
    },
    {
      name: `deck ${deckWidth}×${i.deckThickness}`, species: labels.deck ?? (bamboo ? 'bamboo' : labels.joist ?? '—'),
      kind: 'sawn', count: r.takeoff.bambooSlatCount ?? Math.ceil(i.Lx / (deckWidth / 1000)),
      L: deckLenM, m3: r.takeoff.deckM3, boardFeet: r.takeoff.deckBoardFeet,
    },
  ]
}
