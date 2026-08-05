// ─────────────────────────────────────────────────────────────────────────
// COLUMN LONGITUDINAL STEEL — search diameter AND count, score, adopt.
//
// A column's search space is genuinely two-dimensional, and this is the one
// real difference from the beam.
//
// In a beam the required area fixes the count once the diameter is chosen:
// n = ceil(As/Ab), and any larger n is strictly worse — more steel, no
// benefit. In a column it is not. 8⌀20 and 4⌀25 are both legitimate, both
// carry ρ well inside §10.6.1.1, and they are different columns: the eight
// bars are better distributed around the perimeter, give the ties more to
// grip, and raise the moment capacity near the balanced point; the four are
// quicker to cage and leave more room for the beam bars coming through the
// joint.
//
// So both axes are enumerated.
//
// ── SYMMETRY IS NOT A PREFERENCE HERE ────────────────────────────────────
//
// A column cage is symmetric or it is wrong: the bars have to be placeable
// around the perimeter with equal counts on opposing faces, or the section
// is no longer the one the P–M interaction was computed for. Counts are
// therefore restricted to even numbers ≥ 4 (tied) or ≥ 6 (spiral) — not
// scored down for being odd, excluded.
//
// ── WHAT THE CODE ACTUALLY ASKS FOR ──────────────────────────────────────
//
//   §10.6.1.1   0.01 ≤ ρ ≤ 0.08
//   §10.7.3.1   at least 4 bars in a tied column, 6 in a spiral
//   §25.2.3     clear spacing ≥ max(1.5db, 40 mm) — a COLUMN rule, looser
//               than the beam's max(db, 25) because the bars are placed
//               vertically into a deeper form
//   §22.4.2     φPn,max ≥ Pu
//   §25.7.2.3   every corner and alternate bar laterally supported by a tie
//               corner, and no bar more than 150 mm clear from one
//
// The last one is what actually stops a 4-bar cage being used on a wide
// column: with only corner bars, the face between them is unsupported.
//
// ── CONTINUITY ───────────────────────────────────────────────────────────
//
// A column stack is a bar-continuity group like a beam run: the bars lap
// storey to storey, so one diameter has to serve the stack. Use
// `resolveBarContinuity` from `beamRebarOptimize` on the groups
// `barContinuityGroups` returns — it is member-type agnostic.
//
// Units: mm, mm², kN.
// ─────────────────────────────────────────────────────────────────────────

import {
  designAxialColumn, RHO_MIN, RHO_MAX,
  type AxialColumnInput, type AxialColumnResult,
} from './columnDesign'
import {
  selectRebar, type Candidate, type ComplianceCheck, type RebarLayout,
  type RebarSelection, type ScoreContext,
} from './rebarScore'

/** Bar diameters searched by default. Columns rarely go below ⌀16. */
export const COLUMN_BAR_SIZES = [16, 20, 25, 28, 32] as const

/** §25.7.2.3 — no bar may sit further than this, clear, from a bar that is
 *  laterally supported by the corner of a tie. */
export const MAX_UNSUPPORTED_CLEAR = 150

export interface ColumnRebarOptions {
  sizes?: readonly number[]
  /** Largest bar count to consider. More than this is a cage nobody ties. */
  maxBars?: number
  /** Clear spacing below which placing concrete around the cage is awkward. */
  sComfort?: number
  /**
   * Extra gates for THIS cage, appended to the code checks.
   *
   * `designAxialColumn` is a pure axial design, and a real column usually
   * carries a moment too. Rather than a second search that re-derives the P–M
   * interaction here, the caller supplies the check it already knows how to
   * make — the model-space pipeline gates on utilisation at the eccentricity
   * Mu/Pu, using the same `capacityAtEccentricity` its schedule reports.
   */
  extraChecks?: (i: AxialColumnInput, r: AxialColumnResult) => ComplianceCheck[]
  /**
   * Which bar counts to consider for a diameter. Defaults to the full even
   * sweep, which is the two-axis search this module exists for.
   *
   * A caller that cannot STORE a count must narrow it to the one its own
   * downstream will re-derive — otherwise the search adopts a cage that is
   * silently recomputed into a different one, and a P–M check that passed
   * during the search fails on the section that actually shipped. The
   * model-space pipeline used to be exactly that caller; `RectSection.barCount`
   * now carries the count, so it searches both axes and stores the winner.
   */
  counts?: (i: AxialColumnInput, db: number) => readonly number[]
}

export interface ColumnRebarChoice {
  selection: RebarSelection
  /** The design that produced the winning layout. */
  design: AxialColumnResult | null
  /** Diameter and count adopted. */
  db: number | null
  bars: number | null
  /** Every design tried, keyed `${db}x${bars}`. */
  designs: Map<string, AxialColumnResult>
}

/**
 * Bars on one face — the TWO-FACE split, matching `InteractionInput`'s
 * default layout.
 *
 * A cage with bars on all four faces shares its corners and so puts FEWER
 * bars along any one face, giving wider clear spacing. Reading the spacing
 * two-face is therefore the conservative one: it can only reject a layout an
 * all-around arrangement would have allowed, never admit one it would not.
 */
const perFace = (bars: number) => Math.ceil(bars / 2)

/**
 * Clear spacing between bars along the wider face, mm.
 *
 * Negative when the bars do not fit, which the caller turns into a failed
 * §25.2.3 check rather than a thrown error.
 */
function clearSpacingOf(i: AxialColumnInput, bars: number): number {
  const face = i.shape === 'tied' ? (i.b ?? 0) : (i.D ?? 0)
  const n = perFace(bars)
  if (n <= 1) return face
  const usable = face - 2 * (i.cover + i.tieDia) - n * i.barDia
  return usable / (n - 1)
}

function complianceOf(
  i: AxialColumnInput, r: AxialColumnResult, bars: number, sClear: number,
): ComplianceCheck[] {
  const tied = i.shape === 'tied'
  const sMin = Math.max(1.5 * i.barDia, 40)
  return [
    {
      id: 'axial-capacity',
      clause: 'ACI 318-14 §22.4.2 · §10.5.1',
      label: 'φPn,max ≥ Pu',
      pass: r.axialOK,
      detail: `φPn,max = ${r.phiPnMax.toFixed(0)} kN vs Pu = ${i.Pu.toFixed(0)} kN`,
    },
    {
      id: 'rho-limits',
      clause: 'ACI 318-14 §10.6.1.1',
      label: `steel ratio within ${RHO_MIN}–${RHO_MAX}`,
      pass: r.rhoOK,
      detail: `ρ = ${r.rho.toFixed(4)}`,
    },
    {
      id: 'min-bars',
      clause: 'ACI 318-14 §10.7.3.1',
      label: `at least ${tied ? 4 : 6} bars`,
      pass: bars >= (tied ? 4 : 6),
    },
    {
      id: 'symmetric',
      clause: 'Placement — equal counts on opposing faces',
      label: 'the cage is symmetric',
      pass: bars % 2 === 0,
    },
    {
      id: 'bar-spacing',
      clause: 'ACI 318-14 §25.2.3',
      label: 'clear spacing ≥ max(1.5db, 40 mm)',
      pass: sClear >= sMin - 1e-6,
      detail: `clear ${sClear.toFixed(0)} mm vs ${sMin.toFixed(0)} mm required`,
    },
    {
      id: 'lateral-support',
      clause: 'ACI 318-14 §25.7.2.3',
      label: `no bar more than ${MAX_UNSUPPORTED_CLEAR} mm clear from a tie-supported bar`,
      // With bars only at the corners of a face, the gap between them is the
      // unsupported distance. Adding intermediate bars is what fixes it — so
      // this is the check that stops a 4-bar cage on a wide column.
      pass: sClear <= MAX_UNSUPPORTED_CLEAR + 1e-6,
      detail: `clear ${sClear.toFixed(0)} mm`,
    },
  ]
}

/**
 * Enumerate diameter × count, score, and adopt the best compliant cage.
 *
 * `i.numBars` is ignored — the count is what is being searched. Pass it to
 * `designAxialColumn` directly if you want to analyse a specific cage.
 */
export function optimizeColumnRebar(
  i: AxialColumnInput, opts: ColumnRebarOptions = {},
): ColumnRebarChoice {
  const sizes = opts.sizes ?? COLUMN_BAR_SIZES
  const maxBars = opts.maxBars ?? 16
  const tied = i.shape === 'tied'
  const minBars = tied ? 4 : 6

  const designs = new Map<string, AxialColumnResult>()
  const candidates: Candidate[] = []

  for (const db of sizes) {
    const Ab = (Math.PI / 4) * db * db
    const sweep: number[] = []
    for (let n = minBars; n <= maxBars; n += 2) sweep.push(n)
    for (const bars of opts.counts?.(i, db) ?? sweep) {
      const trial: AxialColumnInput = { ...i, barDia: db, numBars: bars }
      let r: AxialColumnResult
      try {
        r = designAxialColumn(trial)
      } catch {
        continue
      }
      const key = `${db}x${bars}`
      designs.set(key, r)

      const sClear = clearSpacingOf(trial, bars)
      const layout: RebarLayout = {
        db,
        bars,
        // A column cage is one ring, not a stack of layers — the "layers"
        // the beam scorer counts do not exist here, so it is always one.
        layers: [bars],
        AsProv: bars * Ab,
        AsReq: r.AstReq,
        clearSpacing: sClear,
        // Centre-to-centre along the face, which is what §25.7.2.3 is about.
        spacing: sClear + db,
        d: r.Ag > 0 ? (i.h ?? i.D ?? 0) : 0,
        utilization: r.phiPnMax > 0 ? i.Pu / r.phiPnMax : Infinity,
      }
      candidates.push({
        layout,
        compliance: [
          ...complianceOf(trial, r, bars, sClear),
          ...(opts.extraChecks?.(trial, r) ?? []),
        ],
      })
    }
  }

  const ctx: ScoreContext = {
    // §25.7.2.3's 150 mm is the real distribution limit on a column face —
    // there is no §24.3.2 crack-control question here, because the bars are
    // wrapped by ties rather than sitting on a cracked tension face.
    sMax: MAX_UNSUPPORTED_CLEAR,
    sMinCode: 40,
    sComfort: opts.sComfort ?? 50,
    // One ring: the layer term cannot discriminate, so give it no room to.
    maxLayers: 1,
    barComfort: 12,
    wantSymmetric: true,
  }

  const selection = selectRebar(candidates, ctx)
  const best = selection.best?.layout ?? null
  return {
    selection,
    design: best ? designs.get(`${best.db}x${best.bars}`) ?? null : null,
    db: best?.db ?? null,
    bars: best?.bars ?? null,
    designs,
  }
}
