// ─────────────────────────────────────────────────────────────────────────
// Borehole log drawing — pure geometry. Layer 8.
//
// Emits the same typed `PlanPrimitive` list the structural plan renderer uses,
// so `planToSvg` serialises a borehole log with no new painting code. That is
// the whole reason this is a geometry module and not JSX: the column positions,
// the depth scale, the hatch spacing and the label collision handling are all
// arithmetic, and arithmetic belongs somewhere it can be tested.
//
// LAYOUT (x to the right, y DOWNWARD = increasing depth, drafting convention):
//
//     depth   symbol   strata column        description        SPT N
//     ────────────────────────────────────────────────────────────────
//     0.00 ─  [SM]     ▓▓▓▓▓▓▓▓▓▓▓▓         Silty SAND          8
//     1.50 ─  [CL]     ░░░░░░░░░░░░         Lean CLAY          14
//
// The drawing is in MILLIMETRES of paper, not metres of ground: a log is a
// drafted sheet, and fixing the paper geometry here keeps the depth scale
// explicit (`mmPerMetre`) rather than hidden in a viewBox.
//
// UNITS: ground depth m; drawing coordinates mm of paper.
// ─────────────────────────────────────────────────────────────────────────

import type { PlanPrimitive, Drawing } from '../planRenderer'
import type { Borehole, SoilLayer } from './model'
import { layerThickness, soilFamily, type SoilFamily } from './model'
import { fieldN } from './model'

/** Column x-positions and widths, mm of paper. */
export interface LogLayout {
  depthColX: number
  symbolColX: number
  strataX: number
  strataW: number
  descX: number
  descW: number
  sptX: number
  /** Paper millimetres per metre of depth. */
  mmPerMetre: number
  /** Header height above depth zero, mm. */
  headerH: number
}

export const DEFAULT_LAYOUT: LogLayout = {
  depthColX: 0,
  symbolColX: 22,
  strataX: 42,
  strataW: 26,
  descX: 74,
  descW: 88,
  sptX: 172,
  mmPerMetre: 8,
  headerH: 14,
}

/**
 * Hatch pattern per USCS family. Coarse soils get sparse dots/rings, fine soils
 * get dense lines — the convention on a hand-drafted log, kept because an
 * engineer reads the column before reading the words.
 */
export type HatchKind = SoilFamily

/**
 * Hatch family for a layer. Delegates to `soilFamily` so the drawing and the
 * SPT table cannot disagree about what a layer is — they did once, and a
 * "Silty Sand" came out drawn as silt and described as "firm".
 */
export const hatchFor = (symbol: string | undefined, name: string): HatchKind =>
  soilFamily(symbol, name)

/**
 * Fill colour per soil family. Exported so the cross-section paints a stratum
 * the same colour the borehole log does — a section whose clay is a different
 * blue from the log beside it reads as a different material.
 */
export const HATCH_FILL: Record<HatchKind, string> = {
  gravel: '#d6d3d1',
  sand: '#fde68a',
  silt: '#d9f99d',
  clay: '#bfdbfe',
  organic: '#a8a29e',
  fill: '#e7e5e4',
  rock: '#a1a1aa',
  unknown: '#f5f5f4',
}

export interface LogDrawing extends Drawing {
  title: string
  /** Depth of the deepest thing drawn, m — for a caller sizing a page. */
  maxDepth: number
}

export interface LogOptions {
  layout?: Partial<LogLayout>
  /** Draw the SPT column. Off for a hole with no tests. */
  showSpt?: boolean
  /** Description text wraps at this many characters. */
  wrapChars?: number
}

/** Y coordinate (mm of paper) for a ground depth (m). */
export const yOf = (depth: number, L: LogLayout): number => L.headerH + depth * L.mmPerMetre

/**
 * Break a description onto lines of at most `max` characters, on word
 * boundaries. A word longer than the limit is left intact rather than cut —
 * splitting "poorly-graded" mid-word makes a log harder to read, not easier.
 */
export function wrapText(text: string, max: number): string[] {
  if (max <= 0) return [text]
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (!line) line = w
    else if (line.length + 1 + w.length <= max) line += ` ${w}`
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines
}

export function buildBoreholeLog(bh: Borehole, opts: LogOptions = {}): LogDrawing {
  const L: LogLayout = { ...DEFAULT_LAYOUT, ...opts.layout }
  const wrapChars = opts.wrapChars ?? 30
  const showSpt = opts.showSpt ?? bh.spt.length > 0
  const p: PlanPrimitive[] = []

  const layers = [...bh.layers].sort((a, b) => a.depthTop - b.depthTop)
  const maxDepth = Math.max(
    bh.actualDepth,
    layers.length ? layers[layers.length - 1].depthBottom : 0,
    ...bh.spt.map((t) => t.depth),
  )
  const bottomY = yOf(maxDepth, L)
  const rightX = showSpt ? L.sptX + 18 : L.descX + L.descW

  // ── Header ──
  p.push({ kind: 'text', x: L.depthColX, y: 6, text: bh.name, size: 4.5, weight: 700 })
  const headerBits = [
    bh.groundElevation != null ? `EL ${bh.groundElevation.toFixed(2)} m` : null,
    `depth ${bh.actualDepth.toFixed(2)} m`,
    bh.groundwaterDepth != null ? `GWT ${bh.groundwaterDepth.toFixed(2)} m` : 'GWT not encountered',
  ].filter(Boolean)
  p.push({ kind: 'text', x: L.strataX, y: 6, text: headerBits.join('  ·  '), size: 2.6, color: '#475569' })

  for (const [x, label] of [
    [L.depthColX, 'DEPTH (m)'], [L.symbolColX, 'USCS'],
    [L.strataX, 'STRATA'], [L.descX, 'DESCRIPTION'],
    ...(showSpt ? [[L.sptX, 'SPT N'] as [number, string]] : []),
  ] as [number, string][]) {
    p.push({ kind: 'text', x, y: L.headerH - 3, text: label, size: 2.4, weight: 700, color: '#334155' })
  }
  p.push({ kind: 'line', x1: L.depthColX, y1: L.headerH, x2: rightX, y2: L.headerH, stroke: '#334155', width: 0.5 })

  // ── Strata column ──
  for (const l of layers) {
    const y1 = yOf(l.depthTop, L)
    const y2 = yOf(l.depthBottom, L)
    const h = y2 - y1
    const kind = hatchFor(l.symbol, l.name)

    p.push({
      kind: 'rect', x: L.strataX, y: y1, w: L.strataW, h,
      fill: HATCH_FILL[kind], stroke: '#334155', width: 0.3,
    })
    p.push(...hatchLines(kind, L.strataX, y1, L.strataW, h))

    // Depth tick + label at the TOP of every layer.
    p.push({ kind: 'line', x1: L.depthColX + 14, y1, x2: L.strataX, y2: y1, stroke: '#94a3b8', width: 0.25 })
    p.push({ kind: 'text', x: L.depthColX, y: y1 + 1, text: l.depthTop.toFixed(2), size: 2.6 })

    if (l.symbol) {
      p.push({ kind: 'text', x: L.symbolColX, y: y1 + 3.2, text: l.symbol, size: 2.8, weight: 700, color: '#0056b3' })
    }

    const desc = l.description ?? l.name
    const lines = wrapText(desc, wrapChars)
    // Text is anchored to the layer top rather than centred, so a thin layer's
    // label still lands inside its own band instead of drifting into the next.
    lines.slice(0, Math.max(1, Math.floor(h / 3.2))).forEach((ln, k) => {
      p.push({ kind: 'text', x: L.descX, y: y1 + 3.2 + k * 3.2, text: ln, size: 2.6 })
    })
  }

  // Base of the logged profile.
  const baseY = layers.length ? yOf(layers[layers.length - 1].depthBottom, L) : L.headerH
  p.push({ kind: 'text', x: L.depthColX, y: baseY + 1, text: (layers.length ? layers[layers.length - 1].depthBottom : 0).toFixed(2), size: 2.6 })

  // ── Groundwater ──
  if (bh.groundwaterDepth != null) {
    const y = yOf(bh.groundwaterDepth, L)
    p.push({ kind: 'line', x1: L.strataX - 6, y1: y, x2: L.descX + L.descW, y2: y, stroke: '#0284c7', width: 0.5, dash: [3, 1.5] })
    // Standard water-table triangle.
    p.push({
      kind: 'path', closed: true, fill: '#0284c7', stroke: '#0284c7', width: 0.3,
      cmds: [
        { c: 'M', x: L.strataX - 6, y: y - 2.2 },
        { c: 'L', x: L.strataX - 2, y: y - 2.2 },
        { c: 'L', x: L.strataX - 4, y },
      ],
    })
  }

  // ── SPT column ──
  if (showSpt) {
    for (const t of [...bh.spt].sort((a, b) => a.depth - b.depth)) {
      const y = yOf(t.depth, L)
      const N = fieldN(t)
      const refusal = t.penetration?.some((v) => v < 150) ?? false
      p.push({ kind: 'line', x1: L.descX + L.descW, y1: y, x2: L.sptX - 2, y2: y, stroke: '#cbd5e1', width: 0.25 })
      p.push({
        kind: 'text', x: L.sptX, y: y + 1,
        // A refusal prints as "50/75mm"-style notation, never as a bare number:
        // the log must not let a lower bound read as a measurement.
        text: refusal ? `${N}*` : String(N),
        size: 2.8, weight: refusal ? 700 : 400,
        color: refusal ? '#b45309' : '#0f172a',
      })
    }
    if (bh.spt.some((t) => t.penetration?.some((v) => v < 150))) {
      p.push({
        kind: 'text', x: L.sptX - 4, y: bottomY + 6,
        text: '* refusal — N is a lower bound', size: 2.2, color: '#b45309',
      })
    }
  }

  // ── Frame ──
  p.push({ kind: 'line', x1: L.depthColX, y1: bottomY, x2: rightX, y2: bottomY, stroke: '#334155', width: 0.5 })
  for (const x of [L.strataX, L.strataX + L.strataW, L.descX + L.descW]) {
    p.push({ kind: 'line', x1: x, y1: L.headerH, x2: x, y2: bottomY, stroke: '#cbd5e1', width: 0.25 })
  }

  return {
    primitives: p,
    bounds: { minX: L.depthColX - 2, minY: 0, maxX: rightX + 2, maxY: bottomY + 10 },
    title: `${bh.name} — borehole log`,
    maxDepth,
  }
}

/**
 * Hatch strokes for a strata band. Kept separate and pure so the pattern for a
 * given soil can be tested without building a whole log.
 */
export function hatchLines(kind: HatchKind, x: number, y: number, w: number, h: number): PlanPrimitive[] {
  const out: PlanPrimitive[] = []
  const stroke = '#64748b'
  const width = 0.2

  switch (kind) {
    case 'clay':
      // Dense horizontal lines.
      for (let yy = y + 1.5; yy < y + h; yy += 1.5) {
        out.push({ kind: 'line', x1: x + 1, y1: yy, x2: x + w - 1, y2: yy, stroke, width })
      }
      break
    case 'silt':
      // Horizontal lines with a dash, sparser than clay.
      for (let yy = y + 2.5; yy < y + h; yy += 2.5) {
        out.push({ kind: 'line', x1: x + 1, y1: yy, x2: x + w - 1, y2: yy, stroke, width, dash: [2, 1.5] })
      }
      break
    case 'sand':
      // Stippling on a staggered grid.
      for (let yy = y + 2, row = 0; yy < y + h; yy += 2.6, row++) {
        for (let xx = x + 2.5 + (row % 2 ? 1.6 : 0); xx < x + w - 1.5; xx += 3.2) {
          out.push({ kind: 'circle', cx: xx, cy: yy, r: 0.28, fill: stroke })
        }
      }
      break
    case 'gravel':
      // Larger rings among the stipple.
      for (let yy = y + 2.5, row = 0; yy < y + h; yy += 3.4, row++) {
        for (let xx = x + 3 + (row % 2 ? 2.2 : 0); xx < x + w - 2; xx += 4.4) {
          out.push({ kind: 'circle', cx: xx, cy: yy, r: 0.85, stroke, width })
        }
      }
      break
    case 'organic':
      // Short vertical tufts.
      for (let yy = y + 2.5, row = 0; yy < y + h; yy += 3, row++) {
        for (let xx = x + 3 + (row % 2 ? 2 : 0); xx < x + w - 2; xx += 4) {
          out.push({ kind: 'line', x1: xx, y1: yy - 1, x2: xx, y2: yy + 1, stroke, width })
        }
      }
      break
    case 'fill':
      // Irregular cross-hatch, drawn as opposing diagonals.
      for (let yy = y + 3; yy < y + h; yy += 3) {
        out.push({ kind: 'line', x1: x + 1, y1: yy, x2: x + w - 1, y2: yy - 2.5, stroke, width })
      }
      break
    case 'rock': {
      // Diagonal hatch one way only, the drafting convention for rock. Each
      // line x + y = c is CLIPPED to the band; the earlier version walked y
      // past the band height and drew outside it, which showed up as strokes
      // on a zero-height layer.
      const x0 = x + 1, x1e = x + w - 1, y0 = y + 1, y1e = y + h - 1
      if (x1e <= x0 || y1e <= y0) break
      for (let c = x0 + y0 + 2.5; c < x1e + y1e; c += 2.5) {
        const ax = Math.max(x0, c - y1e)
        const bx = Math.min(x1e, c - y0)
        if (bx <= ax) continue
        out.push({ kind: 'line', x1: ax, y1: c - ax, x2: bx, y2: c - bx, stroke, width })
      }
      break
    }
    case 'unknown':
      break
  }
  return out
}

/** Layer at a depth, for a click-through on the drawn column. */
export function layerAtLogDepth(bh: Borehole, depth: number): SoilLayer | undefined {
  return bh.layers.find((l) => depth >= l.depthTop && depth < l.depthBottom)
}

/** Total drawn height in mm, for a caller sizing a page. */
export const logHeight = (d: LogDrawing): number => d.bounds.maxY - d.bounds.minY

/** Thickness of the thinnest layer, m — a log needs a bigger scale to show it. */
export function thinnestLayer(bh: Borehole): number | undefined {
  if (!bh.layers.length) return undefined
  return Math.min(...bh.layers.map(layerThickness))
}
