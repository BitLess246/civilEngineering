// ─────────────────────────────────────────────────────────────────────────
// Subsurface cross-sections between boreholes. Layer 9.
//
// A borehole log says what is under ONE point. A section claims to say what is
// under the ground between two points, and that claim is an interpretation —
// the single most over-read drawing in a geotechnical report.
//
// SO THE DRAWING SEPARATES WHAT WAS MEASURED FROM WHAT WAS INFERRED.
// Strata boundaries are solid where a hole proves them and dashed everywhere
// between, the holes are drawn as the only hard data on the sheet, and a layer
// that appears in one hole and not the next is NOT quietly carried across —
// it is pinched out at the midpoint and flagged, because "the clay continues"
// and "the clay was not found in BH-02" are different statements.
//
// CORRELATION IS BY IDENTITY, NOT BY DEPTH. Two layers are joined only when
// they carry the same USCS symbol or the same name. Joining the third layer in
// one hole to the third in another because both are third is how a section
// invents a stratum that does not exist.
//
// UNITS: chainage and depth m; chart coordinates mm of paper.
// ─────────────────────────────────────────────────────────────────────────

import type { PlanPrimitive, Drawing } from '../planRenderer'
import type { Borehole, SoilLayer } from './model'
import { AXIS, GRID, INK, plate, linearTicks } from './chartKit'
import { hatchFor, HATCH_FILL } from './logRenderer'

/** Metres per degree of latitude — good to ~0.5% at site scale. */
const M_PER_DEG = 111_320

/** Colour for a boundary that no hole proves. */
const INFERRED = '#64748b'

export interface PlacedHole {
  borehole: Borehole
  /** Distance along the section line from the first hole, m. */
  chainage: number
  /** Ground level, m. Falls back to 0 when the hole carries no elevation. */
  ground: number
  hasElevation: boolean
}

/**
 * Place holes along a section line in the order given.
 *
 * Coordinates are taken as latitude/longitude and projected with an
 * equirectangular approximation about the first hole. Over a site that is
 * accurate to well under a metre; over tens of kilometres it is not, and a
 * section that long is not a thing anyone should draw.
 *
 * A hole with no coordinates cannot be placed. Rather than dropping it or
 * inventing a spacing, the whole set falls back to EVEN SPACING and says so —
 * a section drawn to a made-up scale is worse than one drawn to none.
 */
export function placeHoles(boreholes: Borehole[], evenSpacing = 25): {
  holes: PlacedHole[]; scaled: boolean; notes: string[]
} {
  const notes: string[] = []
  const withCoords = boreholes.filter((b) => b.latitude != null && b.longitude != null)
  const scaled = withCoords.length === boreholes.length && boreholes.length > 0

  if (!scaled && boreholes.length) {
    notes.push(
      `${boreholes.length - withCoords.length} of ${boreholes.length} holes have no coordinates, so the section is drawn at EVEN ${evenSpacing} m spacing. Horizontal distances on it mean nothing — record coordinates before scaling anything off it.`,
    )
  }
  if (boreholes.some((b) => b.groundElevation == null)) {
    notes.push('Some holes have no ground elevation; those are drawn from a common datum of 0 m, so the ground surface between them is not a real profile.')
  }

  const origin = withCoords[0]
  const holes = boreholes.map((b, i) => {
    let chainage = i * evenSpacing
    if (scaled && origin) {
      const dLat = (b.latitude! - origin.latitude!) * M_PER_DEG
      const dLon = (b.longitude! - origin.longitude!) * M_PER_DEG *
        Math.cos((origin.latitude! * Math.PI) / 180)
      chainage = Math.hypot(dLat, dLon)
    }
    return {
      borehole: b, chainage,
      ground: b.groundElevation ?? 0,
      hasElevation: b.groundElevation != null,
    }
  })

  // Keep them in chainage order, or the section folds back on itself.
  holes.sort((a, b) => a.chainage - b.chainage)
  return { holes, scaled, notes }
}

/** How a layer was matched between two holes. */
export type Correlation = 'symbol' | 'name' | 'none'

/**
 * Match a layer in one hole to a layer in the next.
 *
 * BY IDENTITY ONLY. Symbol first, then name; never by position in the
 * sequence. Two holes with four layers each do not necessarily share four
 * strata, and joining the nth to the nth invents ground.
 */
export function matchLayer(layer: SoilLayer, candidates: SoilLayer[]): {
  layer?: SoilLayer; by: Correlation
} {
  if (layer.symbol) {
    const bySymbol = candidates.find((c) => c.symbol && c.symbol === layer.symbol)
    if (bySymbol) return { layer: bySymbol, by: 'symbol' }
  }
  const key = layer.name.trim().toLowerCase()
  const byName = candidates.find((c) => c.name.trim().toLowerCase() === key)
  if (byName) return { layer: byName, by: 'name' }
  return { by: 'none' }
}

export interface SectionBand {
  /** Layer as logged in the left-hand hole. */
  layer: SoilLayer
  fromChainage: number
  toChainage: number
  /** Top and base elevations at each end, m. */
  topLeft: number
  baseLeft: number
  topRight: number
  baseRight: number
  correlation: Correlation
  /** True when the band had to be pinched out because the next hole lacks it. */
  pinchesOut: boolean
}

export interface SubsurfaceSection {
  holes: PlacedHole[]
  bands: SectionBand[]
  scaled: boolean
  notes: string[]
}

/** Build the correlated section between consecutive holes. */
export function buildSection(boreholes: Borehole[], evenSpacing = 25): SubsurfaceSection {
  const { holes, scaled, notes } = placeHoles(boreholes, evenSpacing)
  const bands: SectionBand[] = []
  let pinched = 0
  let byName = 0

  for (let i = 0; i < holes.length - 1; i++) {
    const left = holes[i]
    const right = holes[i + 1]
    for (const layer of [...left.borehole.layers].sort((a, b) => a.depthTop - b.depthTop)) {
      const m = matchLayer(layer, right.borehole.layers)
      const topLeft = left.ground - layer.depthTop
      const baseLeft = left.ground - layer.depthBottom

      if (m.layer) {
        if (m.by === 'name') byName++
        bands.push({
          layer, fromChainage: left.chainage, toChainage: right.chainage,
          topLeft, baseLeft,
          topRight: right.ground - m.layer.depthTop,
          baseRight: right.ground - m.layer.depthBottom,
          correlation: m.by, pinchesOut: false,
        })
      } else {
        // Not found in the next hole. Pinch out at the midpoint rather than
        // carrying it across — "it continues" is a claim the data denies.
        pinched++
        const mid = (left.chainage + right.chainage) / 2
        const midEl = (topLeft + baseLeft) / 2
        bands.push({
          layer, fromChainage: left.chainage, toChainage: mid,
          topLeft, baseLeft, topRight: midEl, baseRight: midEl,
          correlation: 'none', pinchesOut: true,
        })
      }
    }

    // And the mirror case: a layer the RIGHT hole has and the left does not.
    // Without this the section leaves a white void where a stratum wedges in,
    // which reads as "nothing here" rather than "this is where it appears".
    for (const layer of [...right.borehole.layers].sort((a, b) => a.depthTop - b.depthTop)) {
      if (matchLayer(layer, left.borehole.layers).layer) continue
      pinched++
      const mid = (left.chainage + right.chainage) / 2
      const topRight = right.ground - layer.depthTop
      const baseRight = right.ground - layer.depthBottom
      const midEl = (topRight + baseRight) / 2
      bands.push({
        layer, fromChainage: mid, toChainage: right.chainage,
        topLeft: midEl, baseLeft: midEl, topRight, baseRight,
        correlation: 'none', pinchesOut: true,
      })
    }
  }

  if (pinched) {
    notes.push(
      `${pinched} layer${pinched === 1 ? '' : 's'} could not be matched in the adjacent hole and ${pinched === 1 ? 'is' : 'are'} shown wedging to a point at the midpoint of the gap. Where it actually ends is unknown — the midpoint is a drafting convention, not a finding.`,
    )
  }
  if (byName) {
    notes.push(
      `${byName} correlation${byName === 1 ? ' was' : 's were'} made on layer NAME rather than USCS symbol. Classify the layers to correlate on something firmer than a description.`,
    )
  }
  if (holes.length < 2) {
    notes.push('A section needs at least two holes; with one there is nothing to correlate and only the log is drawn.')
  }

  return { holes, bands, scaled, notes }
}

// ── Drawing ───────────────────────────────────────────────────────────────

const BOX = { w: 150, h: 78, left: 22, top: 10 }

/**
 * Draw the section.
 *
 * Solid where a hole proves a boundary, DASHED everywhere between. That
 * distinction is the whole point of the drawing and is asserted by its tests.
 */
export function sectionDrawing(s: SubsurfaceSection): Drawing {
  const p: PlanPrimitive[] = []
  const bounds = { minX: 0, minY: 0, maxX: BOX.left + BOX.w + 6, maxY: BOX.top + BOX.h + 20 }
  if (!s.holes.length) return { primitives: p, bounds }

  const maxChain = Math.max(...s.holes.map((h) => h.chainage), 1)
  const elevations = s.holes.flatMap((h) => [h.ground, h.ground - h.borehole.actualDepth])
  const ea = linearTicks(Math.min(...elevations), Math.max(...elevations))

  const X = (c: number) => BOX.left + (c / maxChain) * BOX.w
  const Y = (el: number) => BOX.top + ((ea.hi - el) / (ea.hi - ea.lo)) * BOX.h

  p.push({ kind: 'text', x: BOX.left, y: BOX.top - 3.5, text: 'Subsurface section', size: 3.4, weight: 700, color: '#0056b3' })

  // Elevation axis.
  for (const el of ea.ticks) {
    p.push({ kind: 'line', x1: BOX.left, y1: Y(el), x2: BOX.left + BOX.w, y2: Y(el), stroke: GRID, width: 0.2 })
    p.push({ kind: 'text', x: BOX.left - 1.5, y: Y(el) + 0.8, text: el.toFixed(0), size: 2.1, anchor: 'end', color: AXIS })
  }
  p.push({ kind: 'text', x: BOX.left - 13, y: BOX.top + BOX.h / 2, text: 'elevation (m)', size: 2.5, anchor: 'middle', rotate: -90, color: AXIS })

  // Strata bands: fill, then boundaries dashed between holes.
  for (const b of s.bands) {
    const x1 = X(b.fromChainage)
    const x2 = X(b.toChainage)
    const fill = HATCH_FILL[hatchFor(b.layer.symbol, b.layer.name)]
    p.push({
      kind: 'path',
      cmds: [
        { c: 'M', x: x1, y: Y(b.topLeft) },
        { c: 'L', x: x2, y: Y(b.topRight) },
        { c: 'L', x: x2, y: Y(b.baseRight) },
        { c: 'L', x: x1, y: Y(b.baseLeft) },
      ],
      closed: true, fill, opacity: 0.55,
    })
    // The boundary itself is INFERRED between holes, so it is dashed.
    for (const [ya, yb] of [[b.topLeft, b.topRight], [b.baseLeft, b.baseRight]]) {
      p.push({
        kind: 'line', x1, y1: Y(ya), x2, y2: Y(yb),
        stroke: b.pinchesOut ? '#b45309' : INFERRED, width: 0.35, dash: [2, 1.4],
      })
    }
  }

  // The holes — the only hard data on the sheet, so they are drawn last and solid.
  for (const h of s.holes) {
    const x = X(h.chainage)
    const top = Y(h.ground)
    const base = Y(h.ground - h.borehole.actualDepth)
    p.push({ kind: 'line', x1: x, y1: top, x2: x, y2: base, stroke: INK, width: 0.9 })
    for (const l of h.borehole.layers) {
      p.push({
        kind: 'line', x1: x - 1.6, y1: Y(h.ground - l.depthTop),
        x2: x + 1.6, y2: Y(h.ground - l.depthTop), stroke: INK, width: 0.5,
      })
    }
    p.push({ kind: 'text', x, y: top - 2, text: h.borehole.name, size: 2.4, anchor: 'middle', weight: 700, color: INK })
    if (h.borehole.groundwaterDepth != null) {
      const wy = Y(h.ground - h.borehole.groundwaterDepth)
      p.push({ kind: 'line', x1: x - 2.4, y1: wy, x2: x + 2.4, y2: wy, stroke: '#0ea5e9', width: 0.6 })
    }
    p.push({
      kind: 'text', x, y: BOX.top + BOX.h + 4,
      text: `${h.chainage.toFixed(0)} m`, size: 2.0, anchor: 'middle', color: AXIS,
    })
  }

  p.push({ kind: 'line', x1: BOX.left, y1: BOX.top + BOX.h, x2: BOX.left + BOX.w, y2: BOX.top + BOX.h, stroke: AXIS, width: 0.4 })
  p.push({
    kind: 'text', x: BOX.left + BOX.w / 2, y: BOX.top + BOX.h + 9,
    text: s.scaled ? 'chainage (m)' : 'holes at EVEN SPACING — not to scale',
    size: 2.5, anchor: 'middle', color: s.scaled ? AXIS : '#b45309',
  })

  p.push(...plate(BOX.left + 2, BOX.top + 3, 2.2, [
    { text: 'solid = logged in a hole · dashed = inferred between holes', color: INFERRED },
  ]))

  return { primitives: p, bounds }
}
