// ─────────────────────────────────────────────────────────────────────────
// SLAB AND FOOTING MATS — search diameter × SPACING, score, adopt.
//
// A mat is not detailed the way a beam or a column is. Nobody writes "17
// bars" on a slab; they write "⌀12 @ 150 mm". The decision variable is the
// SPACING, and it comes off a module — 100, 125, 150, 175, 200 — because a
// bar-setter works to a tape and a chalk line, not to a bar count. A layout
// at 143 mm c/c is arithmetic, not a drawing.
//
// So the search here is db × spacing module, and the count falls out:
//
//     n = floor((b − 2·cover) / s) + 1
//
// That is the third distinct search shape in this series:
//
//   beam    — diameter only; n = ceil(As/Ab) and any larger n is worse
//   column  — diameter × count; 8⌀20 and 4⌀25 are both real cages
//   mat     — diameter × spacing module; the count is a consequence
//
// ── SYMMETRY DOES NOT APPLY ──────────────────────────────────────────────
//
// A beam has a web centreline and a column has opposing faces, so an even
// count means something on both. A mat has neither — 17 bars across a strip
// is exactly as sensible as 18. `wantSymmetric: false`.
//
// ── WHAT THE CODE ASKS FOR ───────────────────────────────────────────────
//
//   §22.2       the section can resist Mu at all (before any layout question)
//   §21.2.2     tension-controlled, ρ ≤ 0.85·β1·(f′c/fy)·(3/8)
//   §7.6.1.1    As,min = 0.0018·Ag (Grade 420) — shrinkage & temperature
//   §7.7.2.3    one-way slabs and footings: s ≤ min(3h, 450 mm)
//   §8.7.2.2    two-way slabs:              s ≤ min(2h, 450 mm)
//   §25.2.1     clear spacing ≥ max(db, 25 mm, 4/3·d_agg)
//
// §25.2.1's aggregate term is carried here explicitly. It is the one the
// beam engine omits (see `beamRebarOptimize`), and on a thin slab with a
// large bar it is the term that bites.
//
// ── NO SECOND STRENGTH IMPLEMENTATION ────────────────────────────────────
//
// Required steel is read off `designSquareFooting` / `designSlabDDM`, run
// once per diameter. This module decides the LAYOUT and nothing else — a
// rival implementation of §22.2 that drifts from the verified one is worse
// than no search at all.
//
// Units: mm, mm², kN·m, MPa.
// ─────────────────────────────────────────────────────────────────────────

import { designSquareFooting, type SquareFootingInput, type SquareFootingResult } from './isolatedFooting'
import { designRectangularFooting, type RectFootingInput, type RectFootingResult } from './rectangularFooting'
import { designEccentricSquareFooting, type EccentricFootingInput, type EccentricFootingResult } from './eccentricFooting'
import {
  designSlabDDM, type SlabInput, type SlabDesignResult, type SlabDirResult,
} from './slabDDM'
import {
  dominantBlocker, selectRebar, type Candidate, type ComplianceCheck,
  type RebarLayout, type RebarSelection, type ScoreContext,
} from './rebarScore'

/** Bar diameters searched in a mat. ⌀10 is normal here and ⌀32 never is. */
export const MAT_BAR_SIZES = [10, 12, 16, 20, 25] as const

/** Spacings a bar-setter actually works to, mm. */
export const SPACING_MODULES = [75, 100, 125, 150, 175, 200, 250, 300] as const

/** §25.2.1 assumes a nominal maximum aggregate; 20 mm is the usual local mix. */
export const DEFAULT_AGGREGATE = 20

/** Which maximum-spacing clause governs. */
export type MatKind = 'one-way' | 'two-way'

export interface MatRebarOptions {
  sizes?: readonly number[]
  spacings?: readonly number[]
  /** Nominal maximum aggregate size for §25.2.1, mm. */
  aggregate?: number
}

/** The strip a mat's steel is spread over. */
export interface MatStrip {
  label: string
  /** Width the steel spreads across, mm. */
  b: number
  /** Effective depth at this layer, mm. */
  d: number
  /** Steel the flexure check demands over `b`, mm². */
  AsReq: number
}

/** Section properties the code limits depend on. */
export interface MatSection {
  /** Total thickness, mm. */
  h: number
  cover: number
  fc: number
  fy: number
  kind: MatKind
}

export interface MatRebarChoice {
  selection: RebarSelection
  db: number | null
  /** Centre-to-centre spacing adopted, mm. */
  spacing: number | null
  bars: number | null
  /**
   * When nothing complies, the gate that did most of the rejecting.
   *
   * On a mat this is nearly always a SECTION problem, not a bar problem: too
   * thin for Mu, or thin enough that the steel it needs is no longer
   * tension-controlled at φ = 0.90. The answer is a thicker slab, and saying
   * so is more use than a list of failed spacings.
   */
  blocker: ComplianceCheck | null
}

// ── Code limits ───────────────────────────────────────────────────────────

/**
 * β1 per ACI 318-14 Table 22.2.2.4.3.
 *
 * The SI table is not continuous and must not be written as one: the sloped
 * row runs 28 < f′c < 55, and the last row is a flat 0.65 for f′c ≥ 55. The
 * slope evaluated at 55 gives 0.657, so `max(0.65, slope)` would return that
 * instead of the 0.65 the table actually prescribes.
 */
export function beta1(fc: number): number {
  if (fc <= 28) return 0.85
  if (fc >= 55) return 0.65
  return 0.85 - 0.05 * (fc - 28) / 7
}

/**
 * ρ at the tension-controlled limit — εt = 0.005, so c/d = 3/8
 * (ACI 318-14 §21.2.2 with §22.2.2.1's εcu = 0.003).
 */
export function rhoTensionControlled(fc: number, fy: number): number {
  return 0.85 * beta1(fc) * (fc / fy) * (3 / 8)
}

/** §7.6.1.1 / §8.6.1.1 shrinkage-and-temperature minimum, on the GROSS area. */
export function asMinShrinkage(fy: number, b: number, h: number): number {
  return (fy >= 420 ? 0.0018 : 0.0020) * b * h
}

/** §7.7.2.3 (one-way, footings) or §8.7.2.2 (two-way) maximum spacing, mm. */
export function maxSpacing(kind: MatKind, h: number): number {
  return Math.min(kind === 'one-way' ? 3 * h : 2 * h, 450)
}

/** §25.2.1 minimum clear spacing, mm. */
export function minClear(db: number, aggregate: number): number {
  return Math.max(db, 25, (4 / 3) * aggregate)
}

// ── One candidate mat ─────────────────────────────────────────────────────

/**
 * Bars laid at `s` centres across `b`, the outermost sitting a cover in from
 * each edge. The count is what the spacing produces, not what an area demands.
 */
function barsAt(b: number, cover: number, s: number): number {
  return Math.max(2, Math.floor((b - 2 * cover) / s) + 1)
}

function complianceOf(
  strip: MatStrip, sec: MatSection, db: number, s: number, n: number,
  AsProv: number, aggregate: number,
): ComplianceCheck[] {
  const rho = strip.b * strip.d > 0 ? AsProv / (strip.b * strip.d) : Infinity
  const rhoMax = rhoTensionControlled(sec.fc, sec.fy)
  const asMin = asMinShrinkage(sec.fy, strip.b, sec.h)
  const sMax = maxSpacing(sec.kind, sec.h)
  const clear = s - db
  const clearMin = minClear(db, aggregate)

  return [
    {
      // Asked first: if the slab is simply too thin for Mu, saying "the bars
      // do not fit" is answering a question nobody asked.
      id: 'section-adequate',
      clause: 'ACI 318-14 §22.2',
      label: 'the section can develop Mu at this depth',
      pass: strip.d > 0 && strip.AsReq > 0 && Number.isFinite(strip.AsReq),
      detail: `d = ${strip.d.toFixed(0)} mm, As,req = ${strip.AsReq.toFixed(0)} mm²`,
    },
    {
      id: 'tension-controlled',
      clause: 'ACI 318-14 §21.2.2',
      label: `ρ ≤ ρ at εt = 0.005 (${rhoMax.toFixed(4)})`,
      pass: rho <= rhoMax + 1e-9,
      detail: `ρ = ${rho.toFixed(4)}`,
    },
    {
      id: 'flexural-capacity',
      clause: 'ACI 318-14 §22.2',
      label: 'As provided ≥ As required',
      pass: AsProv >= strip.AsReq - 1e-6,
      detail: `${AsProv.toFixed(0)} vs ${strip.AsReq.toFixed(0)} mm²`,
    },
    {
      id: 'min-steel',
      clause: `ACI 318-14 §${sec.kind === 'one-way' ? '7' : '8'}.6.1.1`,
      label: 'shrinkage & temperature minimum',
      pass: AsProv >= asMin - 1e-6,
      detail: `${AsProv.toFixed(0)} vs ${asMin.toFixed(0)} mm²`,
    },
    {
      id: 'max-spacing',
      clause: `ACI 318-14 §${sec.kind === 'one-way' ? '7.7.2.3' : '8.7.2.2'}`,
      label: `spacing ≤ min(${sec.kind === 'one-way' ? '3h' : '2h'}, 450 mm)`,
      pass: s <= sMax + 1e-9,
      detail: `${s} mm vs ${sMax.toFixed(0)} mm`,
    },
    {
      id: 'min-clear',
      clause: 'ACI 318-14 §25.2.1',
      label: `clear ≥ max(db, 25, 4/3·d_agg) = ${clearMin.toFixed(0)} mm`,
      pass: clear >= clearMin - 1e-9,
      detail: `clear ${clear.toFixed(0)} mm`,
    },
    {
      id: 'min-bars',
      clause: 'Detailing — a mat is not two bars',
      label: 'at least 2 bars across the strip',
      pass: n >= 2,
    },
  ]
}

/**
 * The scoring context for a mat.
 *
 * `sMax` is the code's own maximum-spacing clause rather than a §24.3.2 crack
 * limit: on a slab it is §7.7.2.3/§8.7.2.2 that plays the distribution role,
 * so margin against it is the right thing to reward. One layer, no symmetry.
 */
export function matContext(strip: MatStrip, sec: MatSection): ScoreContext {
  return {
    sMax: maxSpacing(sec.kind, sec.h),
    sMinCode: 25,
    // A mat is laid on chairs on a flat surface, so placing room is a much
    // weaker constraint than in a cage — 50 mm clear is comfortable.
    sComfort: 50,
    maxLayers: 1,
    // The count scales with the strip, so the comfort threshold has to as
    // well: this is the bar count a perfectly ordinary 150 mm mat produces.
    barComfort: barsAt(strip.b, sec.cover, 150),
    wantSymmetric: false,
    naming: 'spacing',
  }
}

/** Every (diameter, spacing) pair for one strip, with its compliance record. */
export function matCandidates(
  strips: readonly MatStrip[], sec: MatSection, db: number, opts: MatRebarOptions = {},
): Candidate[] {
  const aggregate = opts.aggregate ?? DEFAULT_AGGREGATE
  const spacings = opts.spacings ?? SPACING_MODULES
  const Ab = (Math.PI / 4) * db * db
  const out: Candidate[] = []

  for (const s of spacings) {
    // A layout is only as good as its worst strip: the panel is detailed with
    // one bar at one spacing, so a spacing that fails anywhere fails.
    const per = strips.map((strip) => {
      const n = barsAt(strip.b, sec.cover, s)
      const AsProv = n * Ab
      return {
        strip, n, AsProv,
        compliance: complianceOf(strip, sec, db, s, n, AsProv, aggregate),
      }
    })
    if (per.length === 0) continue

    // Report against the strip that demands the most steel per unit width —
    // the one that decides whether this spacing is usable at all.
    const gov = per.reduce((a, c) =>
      c.strip.AsReq / c.strip.b > a.strip.AsReq / a.strip.b ? c : a)

    // With more than one strip the failing check has to say WHICH strip
    // failed, or the message sends the user to the wrong part of the panel.
    const compliance: ComplianceCheck[] = per.length === 1
      ? gov.compliance
      : per.flatMap((p) => p.compliance.map((c) =>
          c.pass ? c : { ...c, label: `${c.label} — at ${p.strip.label}` }))

    const layout: RebarLayout = {
      db,
      bars: gov.n,
      layers: [gov.n],
      AsProv: gov.AsProv,
      AsReq: gov.strip.AsReq,
      clearSpacing: s - db,
      spacing: s,
      d: gov.strip.d,
      utilization: gov.AsProv > 0 ? gov.strip.AsReq / gov.AsProv : Infinity,
    }
    out.push({ layout, compliance })
  }
  return out
}

/**
 * Search diameter × spacing over a set of strips detailed with ONE bar at ONE
 * spacing, and adopt the best-scoring compliant mat.
 */
export function optimizeMatRebar(
  strips: readonly MatStrip[], sec: MatSection, opts: MatRebarOptions = {},
): MatRebarChoice {
  const sizes = opts.sizes ?? MAT_BAR_SIZES
  const candidates = sizes.flatMap((db) => matCandidates(strips, sec, db, opts))
  if (candidates.length === 0) {
    return {
      selection: { best: null, ranked: [], rejected: [], margin: 'no candidates were generated' },
      db: null, spacing: null, bars: null, blocker: null,
    }
  }
  const gov = strips.reduce((a, c) => (c.AsReq / c.b > a.AsReq / a.b ? c : a))
  const selection = selectRebar(candidates, matContext(gov, sec))
  const best = selection.best?.layout ?? null
  return {
    selection,
    db: best?.db ?? null,
    spacing: best?.spacing ?? null,
    bars: best?.bars ?? null,
    blocker: dominantBlocker(selection),
  }
}

// ── Footings ──────────────────────────────────────────────────────────────

/**
 * A concentric square footing's mat choice.
 *
 * Kept as a name because callers use it; it is now just the generic search
 * result, so the square, rectangular and eccentric paths share one shape.
 */
export type FootingRebarChoice = MatSearchChoice<SquareFootingResult>

/**
 * Optimise an isolated footing's bottom mat.
 *
 * The diameter is not just a layout choice here: `designSquareFooting` sizes
 * Dc from `d_required + cover + db`, so a bigger bar makes a thicker footing,
 * which changes q_net, which changes B — the whole design moves. So the
 * designer is re-run per diameter rather than the mat being re-cut against a
 * fixed section.
 */
/**
 * A footing designed at ONE bar diameter: the section it produced and the
 * strips its steel spreads over.
 *
 * Every footing engine sizes its own thickness from `d_required + cover + db`,
 * so the whole design travels with the bar and has to be re-run per diameter
 * rather than the mat being re-cut against a fixed section.
 */
export interface MatTrial<T> {
  design: T
  sec: MatSection
  strips: MatStrip[]
}

export interface MatSearchChoice<T> extends MatRebarChoice {
  design: T | null
  designs: Map<number, T>
  /**
   * The mat adopted for each strip at the chosen diameter.
   *
   * A rectangular footing has two directions carrying different steel; giving
   * both the governing strip's spacing over-provides the lighter one. One
   * diameter, spacing per direction — the same rule the slab panel follows.
   */
  strips: { label: string; b: number; AsReq: number; spacing: number; bars: number }[]
}

/**
 * Search diameter × spacing over a family of per-diameter designs.
 *
 * Shared by every footing shape. Was written inline for the concentric square
 * one; the rectangular and eccentric footings need exactly the same loop, and
 * three copies of it would be three chances for the gates to drift.
 */
export function optimizeMatSearch<T>(
  trial: (db: number) => MatTrial<T> | null, opts: MatRebarOptions = {},
): MatSearchChoice<T> {
  const sizes = opts.sizes ?? MAT_BAR_SIZES
  const designs = new Map<number, T>()
  const trialsAt = new Map<number, MatTrial<T>>()
  const candidates: Candidate[] = []
  let govSec: MatSection | null = null
  let govStrip: MatStrip | null = null
  let hMax = 0

  for (const db of sizes) {
    let t: MatTrial<T> | null
    try {
      t = trial(db)
    } catch {
      continue
    }
    if (!t || t.strips.length === 0) continue
    designs.set(db, t.design)
    trialsAt.set(db, t)
    candidates.push(...matCandidates(t.strips, t.sec, db, opts))
    // Score every candidate against ONE spacing cap — the deepest section any
    // diameter produced. Otherwise a bigger bar scores better merely because
    // the thicker footing it forces has a looser §7.7.2.3 limit.
    if (t.sec.h > hMax) { hMax = t.sec.h; govSec = t.sec }
    const gov = t.strips.reduce((a, c) => (c.AsReq / c.b > a.AsReq / a.b ? c : a))
    if (!govStrip || gov.AsReq / gov.b > govStrip.AsReq / govStrip.b) govStrip = gov
  }

  if (candidates.length === 0 || !govSec || !govStrip) {
    return {
      selection: { best: null, ranked: [], rejected: [], margin: 'no candidates were generated' },
      db: null, spacing: null, bars: null, blocker: null, design: null, designs, strips: [],
    }
  }

  const selection = selectRebar(candidates, matContext(govStrip, govSec))
  const best = selection.best?.layout ?? null

  // Re-cut every strip at the adopted diameter to its OWN best spacing.
  const strips: MatSearchChoice<T>['strips'] = []
  if (best) {
    const t = trialsAt.get(best.db)
    for (const strip of t?.strips ?? []) {
      const per = selectRebar(
        matCandidates([strip], t!.sec, best.db, opts), matContext(strip, t!.sec),
      )
      const l = per.best?.layout
      strips.push({
        label: strip.label, b: strip.b, AsReq: strip.AsReq,
        spacing: l?.spacing ?? best.spacing, bars: l?.bars ?? best.bars,
      })
    }
  }

  return {
    selection,
    db: best?.db ?? null,
    spacing: best?.spacing ?? null,
    bars: best?.bars ?? null,
    blocker: dominantBlocker(selection),
    design: best ? designs.get(best.db) ?? null : null,
    designs, strips,
  }
}

/** Concentric square footing — one bottom mat, each way. */
export function optimizeFootingRebar(
  i: SquareFootingInput, opts: MatRebarOptions = {},
): FootingRebarChoice {
  return optimizeMatSearch<SquareFootingResult>((db) => {
    const r = designSquareFooting({ ...i, barDia: db })
    return {
      design: r,
      // Footings are detailed as one-way slabs — ACI 318-14 §13.3.2.1.
      sec: { h: r.Dc, cover: i.cover, fc: i.fc, fy: i.fy, kind: 'one-way' },
      strips: [{ label: 'bottom mat', b: r.B * 1000, d: r.dFlex, AsReq: r.steelArea }],
    }
  }, opts)
}

/**
 * Rectangular footing — TWO mats, and they are not interchangeable.
 *
 * The long direction spreads across By and the short across Bx, with the
 * short direction's central band concentrated per §13.3.3.3. One diameter
 * serves both (a footing detailed in two bar sizes is a schedule nobody
 * thanks you for); the spacing differs per direction.
 */
export function optimizeRectFootingRebar(
  i: RectFootingInput, opts: MatRebarOptions = {},
): MatSearchChoice<RectFootingResult> {
  return optimizeMatSearch<RectFootingResult>((db) => {
    const r = designRectangularFooting({ ...i, barDia: db })
    return {
      design: r,
      sec: { h: r.Dc, cover: i.cover, fc: i.fc, fy: i.fy, kind: 'one-way' },
      strips: [
        { label: 'long direction', b: r.By * 1000, d: r.dFlex, AsReq: r.long.As },
        { label: 'short direction', b: r.Bx * 1000, d: r.dFlex, AsReq: r.short.As },
      ],
    }
  }, opts)
}

/** Eccentric square footing — one mat, sized from the peak bearing pressure. */
export function optimizeEccentricFootingRebar(
  i: EccentricFootingInput, opts: MatRebarOptions = {},
): MatSearchChoice<EccentricFootingResult> {
  return optimizeMatSearch<EccentricFootingResult>((db) => {
    const r = designEccentricSquareFooting({ ...i, barDia: db })
    return {
      design: r,
      sec: { h: r.Dc, cover: i.cover, fc: i.fc, fy: i.fy, kind: 'one-way' },
      strips: [{ label: 'bottom mat', b: r.B * 1000, d: r.dFlex, AsReq: r.steelArea }],
    }
  }, opts)
}

// ── Two-way slabs ─────────────────────────────────────────────────────────

export interface SlabRebarChoice extends MatRebarChoice {
  design: SlabDesignResult | null
  designs: Map<number, SlabDesignResult>
  /** Spacing adopted for each strip at the chosen diameter, mm. */
  strips: { label: string; b: number; AsReq: number; spacing: number; bars: number }[]
  /**
   * The thickness at which a compliant mat first becomes possible, mm — set
   * only when nothing complied and the panel is too thin to be detailed at
   * any bar or spacing. `null` whenever a mat WAS found, and also when the
   * blocker is something depth cannot cure.
   *
   * Two of the gates are a section question, not a bar question:
   *
   *   §22.2     As,prov ≥ As,req
   *   §21.2.2   ρ = As,prov/(b·d) ≤ ρ at εt = 0.005
   *
   * Together they can only BOTH hold if the steel the moment demands is
   * itself tension-controlled — ρreq = As,req/(b·d) ≤ ρmax. No choice of bar
   * or spacing escapes that; it is fixed by the depth. A panel in that squeeze
   * rejects its thin mats on §22.2 and its thick ones on §21.2.2, and the
   * answer to both is the same: a deeper slab.
   *
   * As,req ≈ Mu/(φ·fy·jd) ∝ 1/d, so ρreq ∝ 1/d², and the depth that clears the
   * limit is d·√(ρreq/ρmax). That extra depth is added to the panel thickness
   * and rounded up to the 25-mm step slabs are actually built in.
   */
  minThickness: number | null
}

/** Flatten a DDM panel into the strips its steel is actually detailed on. */
export function slabStrips(r: SlabDesignResult): MatStrip[] {
  const out: MatStrip[] = []
  for (const dr of [r.x, r.y]) {
    for (const loc of dr.locations) {
      out.push({
        label: `${dr.dir}-dir ${loc.name} column strip`,
        b: loc.column.b, d: dr.d, AsReq: loc.column.As,
      })
      if (loc.middle.b > 0) {
        out.push({
          label: `${dr.dir}-dir ${loc.name} middle strip`,
          b: loc.middle.b, d: dr.d, AsReq: loc.middle.As,
        })
      }
    }
  }
  return out
}

/**
 * Fold the adopted per-strip mats back into a DDM result.
 *
 * `optimizeSlabRebar` chooses one diameter for the panel and a spacing per
 * strip; `designSlabDDM` lays out whatever it was handed. Leaving both in play
 * puts two different mats on one panel — the schedule saying one thing and the
 * selection it cites saying another. The strip labels are built here, so the
 * mapping back belongs here too.
 */
export function applySlabMats(
  r: SlabDesignResult, strips: readonly SlabRebarChoice['strips'][number][],
): SlabDesignResult {
  const by = new Map(strips.map((s) => [s.label, s]))
  const dir = (dr: SlabDirResult): SlabDirResult => ({
    ...dr,
    locations: dr.locations.map((loc) => {
      const cut = (which: 'column' | 'middle') => {
        const m = by.get(`${dr.dir}-dir ${loc.name} ${which} strip`)
        return m ? { ...loc[which], bars: m.bars, spacing: m.spacing } : loc[which]
      }
      return { ...loc, column: cut('column'), middle: cut('middle') }
    }),
  })
  return { ...r, x: dir(r.x), y: dir(r.y) }
}

/**
 * Optimise a two-way slab panel.
 *
 * One diameter serves the whole panel — mixing ⌀12 and ⌀16 mats in one slab is
 * how the wrong bar ends up in the wrong strip — but the SPACING is chosen per
 * strip, which is exactly how a slab is drawn: "⌀12 @ 150 T, @ 200 B".
 *
 * The panel is therefore scored on its GOVERNING strip (most steel per unit
 * width), and once a diameter is adopted every other strip is re-cut at that
 * diameter to its own best spacing.
 */
export function optimizeSlabRebar(
  i: SlabInput, opts: MatRebarOptions = {},
): SlabRebarChoice {
  const { designs, candidates, govStrip, sec } = matSearch(i, opts)

  if (!sec || !govStrip || candidates.length === 0) {
    return {
      selection: { best: null, ranked: [], rejected: [], margin: 'no candidates were generated' },
      db: null, spacing: null, bars: null, blocker: null,
      design: null, designs, strips: [], minThickness: null,
    }
  }

  const selection = selectRebar(candidates, matContext(govStrip, sec))
  const best = selection.best?.layout ?? null
  const design = best ? designs.get(best.db) ?? null : null
  const minThickness = best ? null : thicknessForMat(i, opts)

  // Re-cut every strip at the adopted diameter to its own best spacing.
  const strips: SlabRebarChoice['strips'] = []
  if (best && design) {
    const secAdopted: MatSection = {
      h: design.h, cover: i.cover ?? 20, fc: i.fc, fy: i.fy, kind: 'two-way',
    }
    for (const strip of slabStrips(design)) {
      const per = selectRebar(matCandidates([strip], secAdopted, best.db, opts),
        matContext(strip, secAdopted))
      const l = per.best?.layout
      strips.push({
        label: strip.label, b: strip.b, AsReq: strip.AsReq,
        spacing: l?.spacing ?? best.spacing, bars: l?.bars ?? best.bars,
      })
    }
  }

  return {
    selection,
    db: best?.db ?? null,
    spacing: best?.spacing ?? null,
    bars: best?.bars ?? null,
    blocker: dominantBlocker(selection),
    design, designs, strips, minThickness,
  }
}

/** The candidate set for one panel at one thickness — the part of the panel
 *  search that depends on nothing but the input, so it can be re-run at a
 *  trial thickness without re-entering `optimizeSlabRebar`. */
function matSearch(i: SlabInput, opts: MatRebarOptions): {
  designs: Map<number, SlabDesignResult>
  candidates: Candidate[]
  govStrip: MatStrip | null
  sec: MatSection | null
} {
  const sizes = opts.sizes ?? MAT_BAR_SIZES
  const designs = new Map<number, SlabDesignResult>()
  const candidates: Candidate[] = []
  let govStrip: MatStrip | null = null
  let sec: MatSection | null = null

  for (const db of sizes) {
    let r: SlabDesignResult
    try {
      r = designSlabDDM({ ...i, barDia: db })
    } catch {
      continue
    }
    designs.set(db, r)
    const s: MatSection = {
      h: r.h, cover: i.cover ?? 20, fc: i.fc, fy: i.fy, kind: 'two-way',
    }
    sec ??= s
    const strips = slabStrips(r)
    if (strips.length === 0) continue
    const gov = strips.reduce((a, c) => (c.AsReq / c.b > a.AsReq / a.b ? c : a))
    govStrip ??= gov
    candidates.push(...matCandidates([gov], s, db, opts))
  }
  return { designs, candidates, govStrip, sec }
}

/** How far above the panel's own thickness `thicknessForMat` will look,
 *  in 25-mm steps. Ten steps is 250 mm of slab; a panel still undetailable
 *  after that is not a thickness problem. */
const MAT_THICKNESS_PROBES = 10

/**
 * The panel thickness at which a compliant mat becomes possible, mm.
 *
 * SEARCHED, not estimated, because the squeeze that makes a panel
 * undetailable runs ACROSS diameters and no single closed form sees it. A
 * 150-mm interior panel on a 6 × 5 m bay rejects ⌀10/⌀12/⌀16 on §22.2 —
 * the steel it needs will not fit within the §8.7.2.2 spacing — and rejects
 * ⌀20/⌀25 on §21.2.2, because at the depth those bars leave, the steel it
 * needs is no longer tension-controlled. Read at any ONE diameter the panel
 * looks curable by a different bar; only the whole set shows that depth is
 * the only way out.
 *
 * So the mat search itself is re-run at 25-mm increments and the first
 * thickness that yields a compliant layout is returned. Each probe is closed
 * form — a DDM design per diameter and its candidate mats, no analysis — and
 * only failing panels probe at all. Returns null if none of the probes
 * complies, which is the honest answer that depth is not the obstacle.
 */
function thicknessForMat(i: SlabInput, opts: MatRebarOptions): number | null {
  const h0 = i.h ?? 0
  if (!Number.isFinite(h0) || h0 <= 0) return null
  for (let k = 1; k <= MAT_THICKNESS_PROBES; k++) {
    const h = Math.ceil(h0 / 25) * 25 + 25 * k
    const { candidates, govStrip, sec } = matSearch({ ...i, h }, opts)
    if (!sec || !govStrip || candidates.length === 0) continue
    if (selectRebar(candidates, matContext(govStrip, sec)).best) return h
  }
  return null
}
