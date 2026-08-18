// ─────────────────────────────────────────────────────────────────────────
// TYPICAL COLUMN DETAIL — an elevation through one floor showing the lateral
// tie schedule and the lap splice, drafted from the designed column.
//
// Nothing here is a new calculation. Every figure it draws already existed and
// was simply never put on a sheet:
//
//   ℓo, s_conf, s_out   `columnDesign` → seismicLoZone / seismicSConf /
//                       seismicSOut (NSCP §418.7.5.1/.3/.4/.5)
//   Class B lap         `devLength`   → ls_B (§425.5.2, 1.3·ℓd)
//   compression lap     `devLength`   → lsc  (§425.5.5)
//
// The detail this reproduces is the standard one: closely spaced ties over a
// length ℓo at EACH end of the clear height, the first tie at s/2 from the
// joint face (§418.7.5.3), wider ties through the middle, and the lap splice
// confined to the centre half of the clear height (§418.7.4.3) — which is the
// rule the drawing exists to communicate, because a splice at the joint face
// is exactly where the plastic hinge wants to be.
//
// Emits the same typed PlanPrimitive[] as the plan renderer, so `planToSvg`
// paints it. Units: geometry m; bar/column/tie sizes mm.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, Drawing } from './planRenderer'

export interface ColumnDetailInput {
  /** Column mark (C1, C2 …). */
  mark: string
  /** Column width b (x) and depth h (y), mm. */
  b: number
  h?: number
  /** Storey height centre-to-centre of floors, m. */
  storey: number
  /** Depth of the supported beam / slab band at the top, mm. */
  beamDepth: number
  /** Longitudinal bars — count and diameter, mm. */
  bars: number
  barDia: number
  /** Lateral tie diameter, mm. */
  tieDia: number
  /** Confinement zone length ℓo, mm — `AxialColumnResult.seismicLoZone`. */
  loZone?: number
  /** Tie spacing inside ℓo, mm — `seismicSConf`. */
  sConf: number
  /** Tie spacing outside ℓo, mm — `seismicSOut`, or the non-seismic spacing. */
  sOut: number
  /** Class B tension lap ls_B, mm — `calcDevLength(...).ls_B`. */
  lapB?: number
  /** Compression lap lsc, mm — `calcDevLength(...).lsc`. Used when no lapB. */
  lapC?: number
  /** Clear cover to the tie, mm (default 40). */
  cover?: number
}

export interface ColumnDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface ColumnDetailDrawing extends Drawing { title: string }

const INK = '#1e293b', REBAR = '#b45309', GRID = '#9aa5b5', CONF = '#0f766e', NOTE = '#475569'

/**
 * Clear height ℓu and the two confinement zones, m.
 *
 * ℓu is the storey height less the depth of the member framing in at the top —
 * the length that can actually hinge, and the length §418.7.5 is written
 * against. Using the storey height instead understates ℓo and puts the first
 * tie in the wrong place.
 */
export function clearHeight(storey: number, beamDepth: number): number {
  return Math.max(0, storey - beamDepth / 1000)
}

/**
 * Where a lap splice may sit — the centre half of the clear height
 * (§418.7.4.3). Returns [zStart, zEnd] measured from the bottom of the clear
 * height, m.
 */
export function spliceWindow(lu: number): [number, number] {
  return [lu / 4, (3 * lu) / 4]
}

/**
 * Tie positions up the clear height, m from the base of the clear height.
 *
 * Bottom: first tie at s_conf/2 from the joint face (§418.7.5.3), then at
 * s_conf to the end of ℓo. Top: mirrored. The middle then SPANS the remaining
 * gap in equal steps of at most s_out.
 *
 * Stepping the middle from `ℓo + s_out` instead — the obvious way to write it —
 * leaves an oversized gap at the transition: with ℓu 2.5, ℓo 0.6, s_conf 100
 * and s_out 200 the last confinement tie lands at 0.55 and the first middle tie
 * at 0.80, a 250 mm gap where the limit is 200. Spanning the gap fixes both
 * that and the asymmetry it produced between the two ends.
 */
export function tiePositions(lu: number, lo: number, sConf: number, sOut: number): number[] {
  const sC = Math.max(sConf, 25) / 1000, sO = Math.max(sOut, 25) / 1000
  const loM = Math.min(Math.max(lo, 0) / 1000, lu / 2)
  if (lu <= 0) return []
  const bottom: number[] = [], top: number[] = []
  for (let z = sC / 2; z <= loM + 1e-9; z += sC) bottom.push(z)
  for (let z = lu - sC / 2; z >= lu - loM - 1e-9; z -= sC) top.push(z)
  // With no confinement zone the whole height is ordinary spacing; anchor it
  // the same way so the first tie still sits half a spacing off the face.
  if (bottom.length === 0) bottom.push(sO / 2)
  if (top.length === 0) top.push(lu - sO / 2)

  const lastB = bottom[bottom.length - 1], firstT = Math.min(...top)
  const mid: number[] = []
  const gap = firstT - lastB
  if (gap > sO + 1e-9) {
    const n = Math.ceil(gap / sO - 1e-9)          // steps of at most s_out
    for (let k = 1; k < n; k++) mid.push(lastB + (gap * k) / n)
  }
  return [...new Set([...bottom, ...mid, ...top].map((z) => Math.round(z * 1e6) / 1e6))]
    .filter((z) => z >= 0 && z <= lu)
    .sort((a, b) => a - b)
}

/** Build the typical column detail elevation. */
export function buildColumnDetail(c: ColumnDetailInput, opts: ColumnDetailOptions = {}): ColumnDetailDrawing {
  const P: PlanPrimitive[] = []
  const bM = c.b / 1000
  const lu = clearHeight(c.storey, c.beamDepth)
  const loM = Math.min(Math.max(c.loZone ?? 0, 0) / 1000, lu / 2)
  const bd = c.beamDepth / 1000
  const cov = (c.cover ?? 40) / 1000
  const ties = tiePositions(lu, c.loZone ?? 0, c.sConf, c.sOut)
  const [wz0, wz1] = spliceWindow(lu)
  // The GOVERNING lap, not simply the tension one. A column bar under load
  // reversal is spliced for both states, and the ordering is not fixed: the
  // compression splice (§425.5.5) takes no credit for confinement while tension
  // development (§425.4.2) does, so at the cbKtr/db cap a Class B lap can come
  // out SHORTER than the compression splice — 593 vs 602 mm for ⌀20 / f'c 21 in
  // the pipeline's own fixture. Preferring tension would print the shorter bar.
  const lapGov = Math.max(c.lapB ?? 0, c.lapC ?? 0)
  const lapIsTension = (c.lapB ?? 0) >= (c.lapC ?? 0)
  const lap = lapGov / 1000

  // y is measured UP from the base of the clear height; the renderer is Y-down,
  // so every y is negated at emit time through `Y`.
  const Y = (z: number) => -z
  const x0 = 0, x1 = bM

  // ── column faces, and the beam band it frames into ──
  P.push({ kind: 'rect', x: x0, y: Y(lu), w: bM, h: lu, stroke: INK, width: 1.2, fill: 'none' })
  P.push({ kind: 'rect', x: x0 - bM * 0.55, y: Y(lu + bd), w: bM * 2.1, h: bd, stroke: INK, width: 1.0, fill: '#f1f5f9' })
  P.push({ kind: 'text', x: x0 + bM * 1.15, y: Y(lu + bd / 2), text: 'SLAB / BEAM', size: 0.052, anchor: 'start', color: NOTE })
  // column continuing above
  P.push({ kind: 'rect', x: x0, y: Y(lu + bd + lu * 0.18), w: bM, h: lu * 0.18, stroke: INK, width: 1.2, fill: 'none' })

  // ── confinement zones, shaded ──
  const zone = (za: number, zb: number) =>
    P.push({ kind: 'rect', x: x0, y: Y(zb), w: bM, h: zb - za, stroke: CONF, width: 0.7, fill: 'rgba(15,118,110,0.07)', dash: [0.06, 0.05] })
  if (loM > 0) { zone(0, loM); zone(lu - loM, lu) }

  // ── longitudinal bars (the two outer faces, in elevation) ──
  for (const x of [x0 + cov, x1 - cov]) {
    P.push({ kind: 'line', x1: x, y1: Y(0), x2: x, y2: Y(lu + bd + lu * 0.18), stroke: REBAR, width: 1.1 })
  }

  // ── lap splice, drawn where the code allows it ──
  if (lap > 0) {
    const zs = Math.max(wz0, Math.min(wz1 - lap, wz0))
    for (const x of [x0 + cov, x1 - cov]) {
      P.push({ kind: 'line', x1: x + bM * 0.055, y1: Y(zs), x2: x + bM * 0.055, y2: Y(zs + lap), stroke: REBAR, width: 1.1, dash: [0.05, 0.04] })
    }
    P.push({ kind: 'dim', x1: x1 + bM * 0.28, y1: Y(zs), x2: x1 + bM * 0.28, y2: Y(zs + lap), text: `${Math.round(lap * 1000)}`, off: 0, size: 0.05 })
    P.push({
      kind: 'text', x: x1 + bM * 0.45, y: Y(zs + lap / 2),
      text: lapIsTension ? 'CLASS (B) SPLICE' : 'COMPRESSION SPLICE', size: 0.05, anchor: 'start', color: REBAR, weight: 600,
    })
  }
  // the window itself — the rule the sheet exists to state
  P.push({ kind: 'line', x1: x0 - bM * 0.3, y1: Y(wz0), x2: x1 + bM * 0.18, y2: Y(wz0), stroke: CONF, width: 0.6, dash: [0.08, 0.06] })
  P.push({ kind: 'line', x1: x0 - bM * 0.3, y1: Y(wz1), x2: x1 + bM * 0.18, y2: Y(wz1), stroke: CONF, width: 0.6, dash: [0.08, 0.06] })
  // On the RIGHT: anchored 'end' on the left it ran outside the sheet bounds
  // and collided with the ℓu dimension text.
  P.push({ kind: 'text', x: x1 + bM * 0.22, y: Y(wz1) - bM * 0.14, text: 'SPLICE ZONE — CENTRE HALF (§418.7.4.3)', size: 0.045, anchor: 'start', color: CONF })

  // ── ties ──
  for (const z of ties) {
    P.push({ kind: 'line', x1: x0 + cov * 0.7, y1: Y(z), x2: x1 - cov * 0.7, y2: Y(z), stroke: REBAR, width: 0.9 })
  }

  // ── dimensions & annotation ──
  const dimX = x0 - bM * 0.85
  if (loM > 0) {
    P.push({ kind: 'dim', x1: dimX, y1: Y(0), x2: dimX, y2: Y(loM), text: `ℓo = ${Math.round(loM * 1000)}`, off: 0, size: 0.05 })
    P.push({ kind: 'dim', x1: dimX, y1: Y(lu - loM), x2: dimX, y2: Y(lu), text: `ℓo = ${Math.round(loM * 1000)}`, off: 0, size: 0.05 })
  }
  P.push({ kind: 'dim', x1: dimX - bM * 0.5, y1: Y(0), x2: dimX - bM * 0.5, y2: Y(lu), text: `ℓu = ${Math.round(lu * 1000)}`, off: 0, size: 0.05 })

  const notes: string[] = [
    `TIES ⌀${c.tieDia} — ${Math.round(c.sConf)} C/C WITHIN ℓo, ${Math.round(c.sOut)} C/C ELSEWHERE`,
    `FIRST TIE AT ${Math.round(c.sConf / 2)} FROM FACE OF JOINT (§418.7.5.3)`,
    'REMOVE LAITANCE FROM TOP OF COLUMN CONC.',
    `VERT. ${c.bars}-⌀${c.barDia}   COLUMN ${Math.round(c.b)}×${Math.round(c.h ?? c.b)}`,
  ]
  notes.forEach((t, i) => P.push({
    kind: 'text', x: x0 - bM * 0.85, y: Y(-lu * 0.16 - i * lu * 0.055), text: t, size: 0.046, anchor: 'start', color: NOTE,
  }))

  // ── title block, BELOW the drawing and the notes ────────────────────────
  //
  // It used to sit ABOVE the column, alone among the detail sheets: printed
  // beside the beam elevation and the joint detail — which both carry an AIA
  // block under their notes — a set of three details read with one title in a
  // different place and in a different form. Same block, same corner, here too.
  const title = `TYPICAL COLUMN DETAIL — ${c.mark}`
  const noteBot = -lu * 0.16 - (notes.length - 1) * lu * 0.055
  const sheetL = x0 - bM * 1.6, sheetR = x1 + bM * 3.4
  const rad = bM * 0.30
  const bx = sheetL + rad + bM * 0.1
  const blockTop = noteBot - lu * 0.10
  P.push({ kind: 'line', x1: sheetL, y1: Y(blockTop), x2: sheetR, y2: Y(blockTop), stroke: INK, width: 1.0 })
  // AIA detail bubble: detail number over sheet reference, split by a diameter
  const cy = blockTop - rad - bM * 0.12
  P.push({ kind: 'circle', cx: bx, cy: Y(cy), r: rad, stroke: INK, fill: '#fff', width: 0.9 })
  P.push({ kind: 'line', x1: bx - rad, y1: Y(cy), x2: bx + rad, y2: Y(cy), stroke: INK, width: 0.9 })
  P.push({ kind: 'text', x: bx, y: Y(cy + rad * 0.48), text: opts.detailNo ?? '1', size: rad * 0.90, anchor: 'middle', color: INK, weight: 700 })
  P.push({ kind: 'text', x: bx, y: Y(cy - rad * 0.52), text: opts.sheetRef ?? 'S-06', size: rad * 0.58, anchor: 'middle', color: INK, weight: 600 })
  const tx = bx + rad + bM * 0.25
  P.push({ kind: 'text', x: tx, y: Y(cy + rad * 0.30), text: title, size: rad * 0.78, anchor: 'start', color: INK, weight: 700 })
  P.push({ kind: 'line', x1: tx, y1: Y(cy - rad * 0.10), x2: sheetR, y2: Y(cy - rad * 0.10), stroke: GRID, width: 0.6 })
  P.push({ kind: 'text', x: tx, y: Y(cy - rad * 0.62), text: 'SCALE', size: rad * 0.58, anchor: 'start', color: NOTE, weight: 600 })
  P.push({ kind: 'text', x: sheetR, y: Y(cy - rad * 0.62), text: opts.scale ?? 'NTS', size: rad * 0.58, anchor: 'end', color: NOTE, weight: 600 })
  const blockBot = cy - rad - bM * 0.12
  P.push({ kind: 'line', x1: sheetL, y1: Y(blockBot), x2: sheetR, y2: Y(blockBot), stroke: INK, width: 1.0 })

  return {
    primitives: P,
    title: `TYPICAL COLUMN DETAIL — ${c.mark}`,
    bounds: {
      // The title no longer sits above the column, so the sheet stops reserving
      // a band of empty paper up there; it ends under the title block instead.
      minX: x0 - bM * 2.0, maxX: x1 + bM * 3.4,
      minY: Y(lu + bd + lu * 0.12), maxY: Y(blockBot - lu * 0.05),
    },
  }
}

// ── Offset bent bars — NSCP §410.7.4 / ACI 318-14 §10.7.4 ──────────────────
//
// Where a column narrows from one storey to the next, the bars from below have
// to be cranked inward to line up with the smaller cage above. The code governs
// that crank, and until now nothing in the app checked it even though the model
// has always been able to represent the change:
//
//   §410.7.4.1  slope of the INCLINED portion ≤ 1 in 6 relative to the axis
//   §410.7.4.2  the portions above and below the offset stay parallel to the axis
//   §410.7.4.3  horizontal support by ties/spirals placed within 150 mm of the
//               bend — they carry 1.5× the horizontal component of the bar force
//   §410.7.4.5  where the face offset exceeds 75 mm, the bars may NOT be bent:
//               separate dowels lapped with the bars below are required
//
// The last one is the rule that matters most and the one most often missed: a
// big step in column size is not a bend problem, it is a dowel detail.

/** Maximum slope of the inclined portion, §410.7.4.1 — 1 horizontal in 6 vertical. */
export const OFFSET_MAX_SLOPE = 1 / 6
/** §410.7.4.5 — face offset beyond which bars must be doweled, not bent, mm. */
export const OFFSET_DOWEL_LIMIT = 75
/** §410.7.4.3 — ties giving horizontal support sit within this of the bend, mm. */
export const OFFSET_TIE_REACH = 150

export interface OffsetBentBarResult {
  /** Horizontal offset of the bar per face, mm. */
  offset: number
  /** Vertical length the crank needs at the limiting 1:6 slope, mm. */
  minCrankLength: number
  /** Actual slope run:rise as a fraction, at `crankLength` if one is supplied. */
  slope: number | null
  /** §410.7.4.1 satisfied. */
  slopeOK: boolean
  /** True when §410.7.4.5 forbids bending — separate dowels are required. */
  dowelsRequired: boolean
  /** 1.5 × the horizontal component of the bar force, kN — §410.7.4.3. */
  tieForce: number
  notes: string[]
}

/**
 * Check the crank where a column steps from `bLower` to `bUpper` (mm, the same
 * face both times), with `barDia` verticals of yield `fy`.
 *
 * `crankLength` is the vertical length available for the bend, mm; omit it to
 * get the minimum the slope limit demands.
 *
 * The offset per face is HALF the change in width — the cage narrows on both
 * sides — which is the step people get wrong by a factor of two, and it is the
 * factor that decides whether §410.7.4.5 forces dowels.
 */
export function offsetBentBars(
  bLower: number, bUpper: number, barDia: number, fy = 415, crankLength?: number,
): OffsetBentBarResult {
  const notes: string[] = []
  const offset = Math.max(0, (bLower - bUpper) / 2)
  const minCrankLength = offset / OFFSET_MAX_SLOPE          // rise = run / (1/6)
  const slope = crankLength && crankLength > 0 ? offset / crankLength : null
  const slopeOK = slope == null ? true : slope <= OFFSET_MAX_SLOPE + 1e-9
  const dowelsRequired = offset > OFFSET_DOWEL_LIMIT

  // §410.7.4.3 — the tie force is 1.5× the HORIZONTAL component of the bar
  // force, and the horizontal component follows the crank slope.
  const Ab = (Math.PI / 4) * barDia * barDia
  const s = slope ?? OFFSET_MAX_SLOPE
  const tieForce = (1.5 * Ab * fy * s) / 1e3                // N → kN

  if (dowelsRequired) {
    notes.push(`offset ${Math.round(offset)} mm > ${OFFSET_DOWEL_LIMIT} mm — bars may NOT be bent; use separate dowels lapped with the bars below (§410.7.4.5)`)
  }
  if (!slopeOK) {
    notes.push(`crank slope 1:${(1 / (slope as number)).toFixed(1)} is steeper than the 1:6 limit — lengthen the bend to ${Math.ceil(minCrankLength)} mm (§410.7.4.1)`)
  }
  if (offset > 0) {
    notes.push(`provide ties within ${OFFSET_TIE_REACH} mm of the bend for ${tieForce.toFixed(1)} kN horizontal (§410.7.4.3)`)
  }
  return { offset, minCrankLength, slope, slopeOK, dowelsRequired, tieForce, notes }
}
