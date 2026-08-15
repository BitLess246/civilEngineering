// ─────────────────────────────────────────────────────────────────────────
// TYPICAL DETAIL OF A CONTINUOUS BEAM — the reinforcement elevation for one
// member, drafted from its designed critical sections.
//
// Like the column sheet, this adds no new calculation. `BeamScheduleRow` already
// carries a `BeamSectionDesign` per critical section (left support, midspan,
// right support) with its own bar count and stirrup spacing; the schedule showed
// them as three rows of numbers and nothing drew the bars.
//
// The arrangement drawn is the standard continuous-beam one:
//
//   TOP     continuous straight bars the full length, plus EXTRA top bars at
//           every support, run 0.25ℓ into the span from the support centreline
//           (§409.7.3 / the standard detail) — top steel is what carries the
//           hogging moment and it is needed at the supports, not at midspan.
//   BOTTOM  continuous bars the full length, plus EXTRA bottom bars through the
//           middle, started 0.15ℓ off each support where the sagging moment has
//           grown enough to need them.
//   HOOPS   closely spaced over 2h from each support face, the first at 50 mm
//           (§418.6.4.1 / §418.6.4.4), wider through the middle.
//   ENDS    at an END support the beam bars have nowhere to continue to, so they
//           are hooked DOWN into the column with a standard 90° hook and 60 mm
//           clear to the end of the hook, inside the joint hoops (§425.4.3,
//           §418.8.3; ACI SP-17 typical beam-column joint).
//
// What the drawing has to get right, and what a bar schedule cannot say:
//
//   • TOP steel is continuous through a support and belongs to BOTH adjacent
//     spans, so the count over a support is the GREATER of the two sides
//     (§409.7.7). Detailing each span independently leaves a support short from
//     one side.
//   • Hoops tighten toward the SUPPORTS, where shear peaks. A section that
//     needed no stirrups reports a spacing of ZERO, and reading that as "as
//     tight as the drawing allows" put the densest hoops at midspan and the
//     widest at the supports — the exact opposite of a beam. See `zoneSpacing`.
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
  /** Stirrup spacing adopted here, mm. ZERO means the design needed none. */
  stirrupSpacing: number
}

export interface BeamDetailInput {
  /** Member mark (B1, G2 …). */
  mark: string
  /** Span, m — support centreline to support centreline. */
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
  /** Supporting column width, mm — sets how much of the joint is drawn. */
  colB?: number
  /** Whether the beam CONTINUES past each support. An end support anchors the
   *  bars with a hook; a continuous one runs them through. */
  continuousLeft?: boolean
  continuousRight?: boolean
  /** Clear cover to the stirrup, mm (default 40 — §420.6.1.3.1). */
  cover?: number
}

export interface BeamDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface BeamDetailDrawing extends Drawing { title: string }

const INK = '#1e293b', REBAR = '#b45309', GRID = '#9aa5b5', NOTE = '#475569', ACCENT = '#0f766e'
const CONC = '#f1f5f9'

/** Mean glyph width / font size for Arial capitals — note wrapping only. */
const GLYPH_W = 0.63

// ── the detailing rules the drawing is built from ──────────────────────────

/** §418.6.4.1 — hoops are closely spaced over 2h from the face of the support. */
export const HOOP_ZONE_DEPTHS = 2
/** §418.6.4.4 — the first hoop sits 50 mm from the face of the support, mm. */
export const FIRST_HOOP = 50
/** Extra TOP bars run this fraction of the span from the support centreline. */
export const EXTRA_TOP_FRACTION = 0.25
/** Extra BOTTOM bars start this fraction of the span off each support. */
export const EXTRA_BOTTOM_FRACTION = 0.15
/** §418.8.3 — clear cover to the end of a beam-bar hook in the joint, mm. */
export const HOOK_END_COVER = 60

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

/**
 * The stirrup spacing to DRAW in a zone, mm.
 *
 * A section the design gave no stirrups reports `0` — "none required here",
 * not "as tight as possible". The sheet used to clamp that with
 * `Math.max(s, 50)`, which drew 50 mm hoops at midspan against 110 mm at the
 * supports: the densest steel where the shear is lowest, and a drawing that
 * contradicts its own notes. Where a zone has no designed spacing the drawing
 * falls back to the §409.7.6.2.2 maximum (d/2, capped at 600), which is what a
 * detailer would put there.
 */
export function zoneSpacing(designed: number, h: number, cover = 40): number {
  if (designed > 0) return designed
  const d = Math.max(h - cover - 20, 60)
  return Math.min(d / 2, 600)
}

/**
 * Hoop positions along the span, m from the left support centreline.
 *
 * Dense over 2h from each support face, the first at 50 mm (§418.6.4), then the
 * middle spanned in equal steps of at most the midspan spacing. The middle is
 * SPANNED rather than stepped from the end of the dense zone, for the same
 * reason the column sheet spans its middle: stepping leaves an oversized gap at
 * the transition.
 */
export function hoopPositions(L: number, h: number, sEnd: number, sMid: number, faceOffset = 0): number[] {
  if (!(L > 0)) return []
  const zone = Math.min(HOOP_ZONE_DEPTHS * h, L / 2 - faceOffset)
  const se = Math.max(sEnd, 25) / 1000, sm = Math.max(sMid, 25) / 1000
  const first = FIRST_HOOP / 1000
  const left: number[] = [], right: number[] = []
  for (let x = faceOffset + first; x <= faceOffset + Math.max(zone, 0) + 1e-9; x += se) left.push(x)
  for (let x = L - faceOffset - first; x >= L - faceOffset - Math.max(zone, 0) - 1e-9; x -= se) right.push(x)
  if (!left.length) left.push(faceOffset + first)
  if (!right.length) right.push(L - faceOffset - first)

  const lastL = left[left.length - 1], firstR = Math.min(...right)
  const mid: number[] = []
  const gap = firstR - lastL
  if (gap > sm + 1e-9) {
    const n = Math.ceil(gap / sm - 1e-9)
    for (let k = 1; k < n; k++) mid.push(lastL + (gap * k) / n)
  }
  return [...new Set([...left, ...mid, ...right].map((x) => Math.round(x * 1e6) / 1e6))]
    .filter((x) => x >= 0 && x <= L)
    .sort((a, b) => a - b)
}

/** Wrap a note to `max` characters a line. */
export function wrapNote(text: string, max: number): string[] {
  if (max < 8) return [text]
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > max) { out.push(line); line = word } else line += (line ? ' ' : '') + word
  }
  if (line) out.push(line)
  return out
}

/** Build the continuous-beam reinforcement elevation. */
export function buildBeamDetail(i: BeamDetailInput, opts: BeamDetailOptions = {}): BeamDetailDrawing {
  const P: PlanPrimitive[] = []
  const L = Math.max(i.L, 0.1)
  const hM = i.h / 1000
  const cw = Math.max(i.colB ?? 400, 150) / 1000          // support width, m
  const cov = Math.max(i.cover ?? 40, 10) / 1000
  const Y = (z: number) => -z
  const u = L / 60                                        // one text unit

  const left = i.sections.find((s) => s.hogging && s.x < L / 2)
  const right = i.sections.find((s) => s.hogging && s.x >= L / 2)
  const mid = i.sections.find((s) => !s.hogging)

  const topL = continuousTopSteel(left?.bars ?? 0, i.adjacentTopLeft)
  const topR = continuousTopSteel(right?.bars ?? 0, i.adjacentTopRight)
  const botM = mid?.bars ?? 0

  // Spacings: the ends take whichever support was designed tighter, the middle
  // its own — and neither is ever the drawing's floor. See `zoneSpacing`.
  const sEnd = Math.min(
    zoneSpacing(left?.stirrupSpacing ?? 0, i.h, i.cover),
    zoneSpacing(right?.stirrupSpacing ?? 0, i.h, i.cover),
  )
  const sMid = zoneSpacing(mid?.stirrupSpacing ?? 0, i.h, i.cover)

  const yTop = hM - cov, yBot = cov
  const face = cw / 2                                     // support face from its centreline
  const x0 = -face, x1 = L + face                         // the drawn extent of the beam

  // ── the two supporting columns, and the beam between them ──
  const hookDrop = Math.max((12 * i.barDia) / 1000, 0.12)   // 12db tail, §425.3.1
  const colDrop = Math.max(hM * 0.9, hookDrop + 0.06), colRise = hM * 0.45
  for (const cx of [0, L]) {
    P.push({ kind: 'rect', x: cx - face, y: Y(0), w: cw, h: colDrop, stroke: INK, width: 1.1, fill: CONC })
    P.push({ kind: 'rect', x: cx - face, y: Y(hM + colRise), w: cw, h: colRise, stroke: INK, width: 1.1, fill: CONC })
  }
  P.push({ kind: 'rect', x: x0, y: Y(hM), w: x1 - x0, h: hM, stroke: INK, width: 1.3, fill: 'none' })
  // break lines where a continuous support carries the beam on
  for (const [cont, cx, dir] of [[i.continuousLeft, 0, -1], [i.continuousRight, L, 1]] as const) {
    if (!cont) continue
    const bx = cx + dir * face
    P.push({ kind: 'line', x1: bx, y1: Y(-hM * 0.12), x2: bx, y2: Y(hM * 1.12), stroke: GRID, width: 0.8, dash: [u * 1.2, u * 0.9] })
  }

  // ── longitudinal steel ──────────────────────────────────────────────────
  // TOP continuous straight bars, the pair that never stops
  P.push({ kind: 'line', x1: x0 + cov, y1: Y(yTop), x2: x1 - cov, y2: Y(yTop), stroke: REBAR, width: 1.4 })
  // BOTTOM continuous bars
  P.push({ kind: 'line', x1: x0 + cov, y1: Y(yBot), x2: x1 - cov, y2: Y(yBot), stroke: REBAR, width: 1.4 })

  // EXTRA top bars at each support — 0.25ℓ into the span from the centreline,
  // hooked down into the column where the beam stops there.
  const topRun = EXTRA_TOP_FRACTION * L
  const yTop2 = yTop - 0.055 * hM * (300 / Math.max(i.h, 120))   // just under the continuous pair
  for (const [cont, cx, dir] of [[i.continuousLeft, 0, 1], [i.continuousRight, L, -1]] as const) {
    const end = cx + dir * topRun
    if (cont) {
      P.push({ kind: 'line', x1: cx - dir * face, y1: Y(yTop2), x2: end, y2: Y(yTop2), stroke: REBAR, width: 1.4 })
    } else {
      // 90° standard hook turned DOWN into the column, 60 mm clear of its face
      const hx = cx - dir * (face - HOOK_END_COVER / 1000)
      P.push({
        kind: 'path', stroke: REBAR, width: 2.2, cap: 'round', join: 'round',
        cmds: [{ c: 'M', x: end, y: Y(yTop2) }, { c: 'L', x: hx, y: Y(yTop2) }, { c: 'L', x: hx, y: Y(yTop2 - hookDrop) }],
      })
    }
  }

  // EXTRA bottom bars through the middle, started 0.15ℓ off each support
  const botStart = EXTRA_BOTTOM_FRACTION * L
  if (botM > 0) {
    P.push({ kind: 'line', x1: botStart, y1: Y(yBot + 0.055 * hM), x2: L - botStart, y2: Y(yBot + 0.055 * hM), stroke: REBAR, width: 1.4 })
  }

  // ── hoops ───────────────────────────────────────────────────────────────
  const hoops = hoopPositions(L, hM, sEnd, sMid, face)
  for (const x of hoops) {
    P.push({ kind: 'line', x1: x, y1: Y(cov * 0.8), x2: x, y2: Y(hM - cov * 0.8), stroke: REBAR, width: 0.75 })
  }
  // JOINT hoops — inside the column, through the depth of the beam (§418.8.3)
  for (const cx of [0, L]) {
    for (const t of [-0.28, 0.28]) {
      P.push({ kind: 'line', x1: cx + t * cw, y1: Y(cov * 0.8), x2: cx + t * cw, y2: Y(hM - cov * 0.8), stroke: REBAR, width: 0.75 })
    }
  }

  // ── callouts ────────────────────────────────────────────────────────────
  const call = (x: number, z: number, text: string, anchor: 'start' | 'middle' | 'end' = 'middle') =>
    P.push({ kind: 'text', x, y: Y(z), text, size: u * 1.5, anchor, color: REBAR, weight: 600 })
  call(L / 2, hM + colRise + u * 5.6, `${Math.max(topL, topR)}-⌀${i.barDia} TOP CONT.`)
  if (topL > 0) call(topRun / 2, hM + colRise + u * 1.4, `${topL}-⌀${i.barDia} EXTRA`)
  if (topR > 0) call(L - topRun / 2, hM + colRise + u * 1.4, `${topR}-⌀${i.barDia} EXTRA`)
  if (botM > 0) call(L / 2, -colDrop - u * 3.4, `${botM}-⌀${i.barDia} BOT. CONT. + EXTRA`)
  call(L / 2, -colDrop - u * 5.2, `${i.legs ?? 2}L-⌀${i.stirrupDia} HOOPS @ ${Math.round(sEnd)} O/ 2h EA. END, @ ${Math.round(sMid)} ELSEWHERE`)

  // ── dimensions ──────────────────────────────────────────────────────────
  const dimTop = hM + colRise + u * 3.6
  P.push({ kind: 'dim', x1: 0, y1: Y(dimTop), x2: topRun, y2: Y(dimTop), text: `0.25L = ${Math.round(topRun * 1000)}`, off: 0, size: u * 1.35 })
  P.push({ kind: 'dim', x1: L - topRun, y1: Y(dimTop), x2: L, y2: Y(dimTop), text: `0.25L = ${Math.round(topRun * 1000)}`, off: 0, size: u * 1.35 })
  if (botM > 0) {
    P.push({ kind: 'dim', x1: 0, y1: Y(-colDrop - u * 1.6), x2: botStart, y2: Y(-colDrop - u * 1.6), text: `0.15L`, off: 0, size: u * 1.3 })
    P.push({ kind: 'dim', x1: L - botStart, y1: Y(-colDrop - u * 1.6), x2: L, y2: Y(-colDrop - u * 1.6), text: `0.15L`, off: 0, size: u * 1.3 })
  }
  // the 2h hoop zone at the left support, and the 50 mm first hoop
  const zone = Math.min(HOOP_ZONE_DEPTHS * hM, L / 2 - face)
  P.push({ kind: 'dim', x1: face, y1: Y(-colDrop - u * 7.0), x2: face + zone, y2: Y(-colDrop - u * 7.0), text: `2h = ${Math.round(zone * 1000)}`, off: 0, size: u * 1.3 })
  P.push({ kind: 'text', x: face, y: Y(-colDrop - u * 8.8), text: `${FIRST_HOOP} FIRST HOOP`, size: u * 1.2, anchor: 'start', color: NOTE })
  P.push({ kind: 'dim', x1: 0, y1: Y(-colDrop - u * 11.0), x2: L, y2: Y(-colDrop - u * 11.0), text: `L = ${Math.round(L * 1000)}`, off: 0, size: u * 1.5 })

  // hook cover at an end support — the dimension image 3 turns on
  for (const [cont, cx, dir] of [[i.continuousLeft, 0, 1], [i.continuousRight, L, -1]] as const) {
    if (cont) continue
    const hx = cx - dir * (face - HOOK_END_COVER / 1000)
    const ty = yTop2 - hookDrop - u * 2.2
    P.push({ kind: 'line', x1: hx, y1: Y(yTop2 - hookDrop), x2: hx - dir * u * 2.4, y2: Y(ty), stroke: NOTE, width: 0.5 })
    P.push({
      kind: 'text', x: hx - dir * u * 2.6, y: Y(ty),
      text: `${HOOK_END_COVER} CL.`, size: u * 1.15,
      anchor: dir > 0 ? 'end' : 'start', color: NOTE,
    })
  }

  // ── notes ───────────────────────────────────────────────────────────────
  const notes = [
    'TOP STEEL OVER A SUPPORT IS THE GREATER OF THE TWO ADJACENT SPANS (§409.7.7)',
    `EXTRA TOP BARS RUN 0.25L FROM THE SUPPORT; EXTRA BOTTOM BARS START 0.15L OFF IT`,
    `HOOPS @ ${Math.round(sEnd)} OVER 2h = ${Math.round(zone * 1000)} FROM EACH SUPPORT FACE, FIRST AT ${FIRST_HOOP} (§418.6.4.1/§418.6.4.4)`,
    `HOOPS @ ${Math.round(sMid)} THROUGH THE MIDDLE — SPACING IS WIDEST WHERE THE SHEAR IS LOWEST`,
    `AT AN END SUPPORT BEAM BARS ARE HOOKED INTO THE COLUMN, ${HOOK_END_COVER} CLEAR TO THE END OF THE HOOK (§425.4.3 / §418.8.3)`,
    `TOP BARS EXTEND ${Math.round(barExtension(i.h - 60, i.barDia) * 1000)} MIN. PAST THE POINT NO LONGER REQUIRED — max(d, 12db) §409.7.3.8.4`,
  ]
  const noteSize = u * 1.35
  const sheetW = L + u * 8
  const wrapped = notes.flatMap((t) => wrapNote(t, Math.max(24, Math.floor(sheetW / (GLYPH_W * noteSize)))))
  const noteTop = -colDrop - u * 14.5
  wrapped.forEach((t, k) => P.push({
    kind: 'text', x: x0, y: Y(noteTop - k * u * 2.0), text: t, size: noteSize, anchor: 'start', color: NOTE,
  }))

  // ── title block, BELOW the drawing and the notes ────────────────────────
  const title = `TYPICAL DETAIL OF CONTINUOUS BEAM — ${i.mark} (${i.b}×${i.h})`
  const blockTop = noteTop - wrapped.length * u * 2.0 - u * 2.4
  const r = u * 2.6
  const bx = x0 + r
  P.push({ kind: 'line', x1: x0, y1: Y(blockTop), x2: x0 + sheetW, y2: Y(blockTop), stroke: INK, width: 1.0 })
  // AIA detail bubble: detail number over sheet reference, split by a diameter
  const cy = blockTop - r - u * 0.8
  P.push({ kind: 'circle', cx: bx, cy: Y(cy), r, stroke: INK, fill: '#fff', width: 0.9 })
  P.push({ kind: 'line', x1: bx - r, y1: Y(cy), x2: bx + r, y2: Y(cy), stroke: INK, width: 0.9 })
  P.push({ kind: 'text', x: bx, y: Y(cy + r * 0.48), text: opts.detailNo ?? '1', size: u * 2.0, anchor: 'middle', color: INK, weight: 700 })
  P.push({ kind: 'text', x: bx, y: Y(cy - r * 0.52), text: opts.sheetRef ?? 'S-07', size: u * 1.3, anchor: 'middle', color: INK, weight: 600 })
  // title, then the scale line under it
  const tx = bx + r + u * 1.6
  P.push({ kind: 'text', x: tx, y: Y(cy + r * 0.30), text: title, size: u * 2.4, anchor: 'start', color: INK, weight: 700 })
  P.push({ kind: 'line', x1: tx, y1: Y(cy - r * 0.10), x2: x0 + sheetW, y2: Y(cy - r * 0.10), stroke: GRID, width: 0.6 })
  P.push({ kind: 'text', x: tx, y: Y(cy - r * 0.62), text: 'SCALE', size: u * 1.3, anchor: 'start', color: NOTE, weight: 600 })
  P.push({ kind: 'text', x: x0 + sheetW, y: Y(cy - r * 0.62), text: opts.scale ?? 'NTS', size: u * 1.3, anchor: 'end', color: NOTE, weight: 600 })
  const blockBot = cy - r - u * 0.8
  P.push({ kind: 'line', x1: x0, y1: Y(blockBot), x2: x0 + sheetW, y2: Y(blockBot), stroke: INK, width: 1.0 })

  P.push({ kind: 'text', x: x1, y: Y(hM + colRise + u * 7.4), text: `SPAN ${L.toFixed(2)} m`, size: u * 1.35, anchor: 'end', color: ACCENT })

  // ── bounds: fit the content, so nothing is ever clipped ─────────────────
  const b = {
    minX: x0 - u * 1.5, maxX: Math.max(x1, x0 + sheetW) + u * 1.5,
    minY: Y(hM + colRise + u * 8.6), maxY: Y(blockBot - u * 1.5),
  }
  for (const p of P) {
    let xs: number[] = [], ys: number[] = []
    if (p.kind === 'line' || p.kind === 'dim') { xs = [p.x1, p.x2]; ys = [p.y1, p.y2] }
    else if (p.kind === 'rect') { xs = [p.x, p.x + p.w]; ys = [p.y, p.y + p.h] }
    else if (p.kind === 'circle') { xs = [p.cx - p.r, p.cx + p.r]; ys = [p.cy - p.r, p.cy + p.r] }
    else if (p.kind === 'path') { xs = p.cmds.map((c) => c.x); ys = p.cmds.map((c) => c.y) }
    else if (p.kind === 'text') {
      const tw = p.text.length * GLYPH_W * p.size, th = p.size
      const lead = p.anchor === 'middle' ? -tw / 2 : p.anchor === 'end' ? -tw : 0
      xs = [p.x + lead, p.x + lead + tw]; ys = [p.y - th / 2, p.y + th / 2]
    }
    for (const x of xs) { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x) }
    for (const y of ys) { b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y) }
  }

  return { primitives: P, title: `TYPICAL DETAIL OF CONTINUOUS BEAM — ${i.mark}`, bounds: b }
}
