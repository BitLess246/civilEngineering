// ─────────────────────────────────────────────────────────────────────────
// TYPICAL BEAM / GIRDER DETAIL — a reinforcement elevation for one member,
// drafted from its designed critical sections.
//
// Like the column sheet, this adds no new calculation. `BeamScheduleRow` already
// carries a `BeamSectionDesign` per critical section (left support, midspan,
// right support) with its own bar count and stirrup spacing; the schedule showed
// them as three rows of numbers and nothing drew the bars.
//
// What the drawing has to get right, and what a bar schedule cannot say:
//
//   • TOP steel is continuous through a support and belongs to BOTH adjacent
//     spans, so the count over a support is the GREATER of the two sides
//     (§409.7.7 continuity / the standard continuous-beam detail). Detailing
//     each span independently leaves a support short from one side.
//   • Stirrups tighten toward the supports, where shear peaks — the spacing
//     drawn is the one `designBeam` adopted for that section, not an average.
//   • Top bars extend past the face of support before they may be cut
//     (§409.7.3 / §425.4): the sheet marks the extension rather than showing a
//     bar stopping at the point of inflection, which is where the classic
//     "bars cut at the wrong place" failure comes from.
//
// Units: geometry m; bar/stirrup sizes mm.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, Drawing } from './planRenderer'

export interface BeamDetailSection {
  /** 'LEFT' | 'MID' | 'RIGHT' — position along the member. */
  label: string
  /** Distance from the left end, m. */
  x: number
  /** True for a hogging (top-steel) section. */
  hogging: boolean
  /** Bars provided at this section. */
  bars: number
  /** Stirrup spacing adopted here, mm. */
  stirrupSpacing: number
}

export interface BeamDetailInput {
  /** Member mark (B1, G2 …). */
  mark: string
  /** Clear span, m. */
  L: number
  /** Web width and overall depth, mm. */
  b: number
  h: number
  /** Longitudinal bar diameter, mm. */
  barDia: number
  /** Stirrup diameter, mm, and number of legs. */
  stirrupDia: number
  legs?: number
  /** The designed critical sections. */
  sections: BeamDetailSection[]
  /** Top-steel count carried in from the ADJACENT span at each support, if any
   *  — the continuity rule needs both sides to resolve. */
  adjacentTopLeft?: number
  adjacentTopRight?: number
}

export interface BeamDetailOptions { detailNo?: string; sheetRef?: string }
export interface BeamDetailDrawing extends Drawing { title: string }

const INK = '#1e293b', REBAR = '#b45309', GRID = '#9aa5b5', NOTE = '#475569', ACCENT = '#0f766e'

/**
 * Top steel to detail over a support — the greater of what the two adjacent
 * spans need there (§409.7.7).
 *
 * A support is one piece of concrete with one set of top bars running through
 * it. Designing each span in isolation and detailing each answer over its own
 * half leaves the support short from whichever side asked for more, which is
 * the error the "place the greater reinforcement" note on every typical
 * continuous-beam detail exists to prevent.
 */
export function continuousTopSteel(thisSpan: number, adjacent?: number): number {
  return Math.max(thisSpan, adjacent ?? 0)
}

/**
 * Where a top bar may stop, m from the face of support.
 *
 * §409.7.3.8.4: reinforcement continues at least d or 12·db past the point it is
 * no longer required, and §409.7.3.3 keeps at least a third of the negative
 * steel past the inflection point by that same margin. This returns the
 * extension itself; the sheet marks it as a dimension rather than implying a
 * bar ends at the theoretical cut-off.
 */
export function barExtension(d: number, barDia: number): number {
  return Math.max(d, 12 * barDia) / 1000
}

/** Build the beam reinforcement elevation. */
export function buildBeamDetail(i: BeamDetailInput, opts: BeamDetailOptions = {}): BeamDetailDrawing {
  const P: PlanPrimitive[] = []
  const L = Math.max(i.L, 0.1)
  const hM = i.h / 1000
  const Y = (z: number) => -z
  const cov = 0.05

  const left = i.sections.find((s) => s.hogging && s.x < L / 2)
  const right = i.sections.find((s) => s.hogging && s.x >= L / 2)
  const mid = i.sections.find((s) => !s.hogging)

  const topL = continuousTopSteel(left?.bars ?? 0, i.adjacentTopLeft)
  const topR = continuousTopSteel(right?.bars ?? 0, i.adjacentTopRight)
  const botM = mid?.bars ?? 0

  // ── beam outline and the two supports ──
  P.push({ kind: 'rect', x: 0, y: Y(hM), w: L, h: hM, stroke: INK, width: 1.2, fill: 'none' })
  for (const x of [0, L]) {
    P.push({ kind: 'rect', x: x - hM * 0.22, y: Y(0), w: hM * 0.44, h: hM * 0.5, stroke: INK, width: 1.0, fill: '#f1f5f9' })
  }

  // ── longitudinal steel ──
  const yTop = hM - cov, yBot = cov
  // bottom bars run the full length
  P.push({ kind: 'line', x1: 0.02, y1: Y(yBot), x2: L - 0.02, y2: Y(yBot), stroke: REBAR, width: 1.3 })
  // top bars over each support, extended past the face
  const ext = barExtension(hM * 1000 - 60, i.barDia)
  const topRun = Math.min(L * 0.34 + ext, L * 0.46)
  P.push({ kind: 'line', x1: 0.02, y1: Y(yTop), x2: topRun, y2: Y(yTop), stroke: REBAR, width: 1.3 })
  P.push({ kind: 'line', x1: L - topRun, y1: Y(yTop), x2: L - 0.02, y2: Y(yTop), stroke: REBAR, width: 1.3 })
  // continuous top bars through the span (the pair that never stops)
  P.push({ kind: 'line', x1: 0.02, y1: Y(yTop - 0.035), x2: L - 0.02, y2: Y(yTop - 0.035), stroke: REBAR, width: 0.9, dash: [0.12, 0.08] })

  // ── stirrups, at the spacing each section adopted ──
  const zones: [number, number, number][] = [
    [0, L * 0.25, left?.stirrupSpacing ?? 0],
    [L * 0.25, L * 0.75, mid?.stirrupSpacing ?? 0],
    [L * 0.75, L, right?.stirrupSpacing ?? 0],
  ]
  for (const [xa, xb, sMm] of zones) {
    const s = Math.max(sMm, 50) / 1000
    for (let x = xa + s / 2; x < xb; x += s) {
      P.push({ kind: 'line', x1: x, y1: Y(cov * 0.6), x2: x, y2: Y(hM - cov * 0.6), stroke: REBAR, width: 0.7 })
    }
  }

  // ── callouts ──
  const call = (x: number, z: number, text: string, anchor: 'start' | 'middle' | 'end' = 'middle') =>
    P.push({ kind: 'text', x, y: Y(z), text, size: 0.09, anchor, color: REBAR, weight: 600 })
  if (topL > 0) call(topRun / 2, hM + 0.19, `${topL}-⌀${i.barDia} TOP`)
  if (topR > 0) call(L - topRun / 2, hM + 0.19, `${topR}-⌀${i.barDia} TOP`)
  if (botM > 0) call(L / 2, -0.16, `${botM}-⌀${i.barDia} BOT`)

  zones.forEach(([xa, xb, sMm]) => {
    if (sMm > 0) call((xa + xb) / 2, hM + 0.33, `${i.legs ?? 2}L-⌀${i.stirrupDia}@${Math.round(sMm)}`)
  })

  // extension dimension at the left support — the thing a schedule cannot say
  // Below the callout row, not through it — at Y(hM + 0.05) this printed
  // straight over the "n-⌀d TOP" text.
  P.push({ kind: 'dim', x1: 0, y1: Y(hM + 0.055), x2: topRun, y2: Y(hM + 0.055), text: `${Math.round(topRun * 1000)}`, off: 0, size: 0.068 })

  P.push({ kind: 'dim', x1: 0, y1: Y(-0.34), x2: L, y2: Y(-0.34), text: `${Math.round(L * 1000)}`, off: 0, size: 0.085 })

  const notes = [
    'TOP STEEL OVER A SUPPORT IS THE GREATER OF THE TWO ADJACENT SPANS (§409.7.7)',
    `TOP BARS EXTEND ${Math.round(ext * 1000)} MIN. PAST THE POINT NO LONGER REQUIRED — max(d, 12db) §409.7.3.8.4`,
    'STIRRUP SPACING IS PER ZONE AS SHOWN; TIGHTEST SPACING AT THE SUPPORTS',
  ]
  notes.forEach((t, k) => P.push({
    kind: 'text', x: 0, y: Y(-0.52 - k * 0.14), text: t, size: 0.078, anchor: 'start', color: NOTE,
  }))

  P.push({
    kind: 'text', x: L / 2, y: Y(hM + 0.62), text: `TYPICAL BEAM DETAIL — ${i.mark} (${i.b}×${i.h})`,
    size: 0.13, anchor: 'middle', color: INK, weight: 700,
  })
  if (opts.detailNo) {
    P.push({ kind: 'circle', cx: -0.2, cy: Y(hM + 0.62), r: 0.14, stroke: INK, fill: '#fff', width: 0.8 })
    P.push({ kind: 'text', x: -0.2, y: Y(hM + 0.58), text: opts.detailNo, size: 0.1, anchor: 'middle', color: INK, weight: 700 })
  }
  P.push({ kind: 'line', x1: 0, y1: Y(-0.42), x2: L, y2: Y(-0.42), stroke: GRID, width: 0.6 })
  // Its own line: at Y(hM + 0.30) it sat on the right-hand stirrup callout.
  P.push({ kind: 'text', x: L, y: Y(hM + 0.44), text: `SPAN ${L.toFixed(2)} m`, size: 0.075, anchor: 'end', color: ACCENT })

  return {
    primitives: P,
    title: `TYPICAL BEAM DETAIL — ${i.mark}`,
    bounds: { minX: -0.4, maxX: L + 0.4, minY: Y(hM + 0.78), maxY: Y(-0.52 - notes.length * 0.14 - 0.1) },
  }
}
