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
  const lap = (c.lapB ?? c.lapC ?? 0) / 1000

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
      text: c.lapB != null ? 'CLASS (B) SPLICE' : 'COMPRESSION SPLICE', size: 0.05, anchor: 'start', color: REBAR, weight: 600,
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

  P.push({
    kind: 'text', x: x0 + bM / 2, y: Y(lu + bd + lu * 0.28),
    text: `TYPICAL COLUMN DETAIL — ${c.mark}`, size: 0.075, anchor: 'middle', color: INK, weight: 700,
  })
  if (opts.detailNo) {
    // Clear of the title. At bM 0.4 the title runs roughly x −0.4…0.8, so the
    // bubble has to sit outside that — it was landing inside the word "TYPICAL".
    const cx = x0 - bM * 1.5, cy = Y(lu + bd + lu * 0.28)
    P.push({ kind: 'circle', cx, cy, r: bM * 0.17, stroke: INK, fill: '#fff', width: 0.8 })
    P.push({ kind: 'text', x: cx, y: cy + bM * 0.055, text: opts.detailNo, size: 0.062, anchor: 'middle', color: INK, weight: 700 })
    if (opts.sheetRef) P.push({ kind: 'text', x: cx, y: cy + bM * 0.36, text: opts.sheetRef, size: 0.042, anchor: 'middle', color: NOTE })
  }
  P.push({ kind: 'line', x1: x0 - bM * 1.6, y1: Y(-lu * 0.1), x2: x1 + bM * 1.6, y2: Y(-lu * 0.1), stroke: GRID, width: 0.6 })

  return {
    primitives: P,
    title: `TYPICAL COLUMN DETAIL — ${c.mark}`,
    bounds: {
      minX: x0 - bM * 2.0, maxX: x1 + bM * 3.4,
      minY: Y(lu + bd + lu * 0.4), maxY: Y(-lu * 0.16 - notes.length * lu * 0.055 - lu * 0.06),
    },
  }
}
