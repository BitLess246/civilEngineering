/**
 * Plan-canvas view math — the pure core of the Drafting3D floor-plan camera.
 * Shared by FloorPlanCanvas (interaction) and its tests; kept out of the
 * component file so fast refresh sees components only.
 */

/** px per metre at zoom 1. */
export const CANVAS_SCALE = 50
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 5

/** The view (zoom + pan) that keeps the world point under the pinch centroid
 *  stationary while the fingers spread and slide. `base` is the two-finger
 *  snapshot at the gesture's birth; `currDist` / `currCentroid` are the live
 *  readings. Pure — unit-tested: spread = zoom, slide = pan, both at once. */
export function nextPinchView(
  base: { dist: number; zoom: number; centroid: { x: number; y: number }; pan: { x: number; y: number } },
  currDist: number,
  currCentroid: { x: number; y: number },
): { zoom: number; pan: { x: number; y: number } } {
  const scale = base.dist < 1e-6 ? 1 : currDist / base.dist
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, base.zoom * scale))
  // world = (screen − pan) / (zoom · SCALE); hold world under the centroid.
  const wx = (base.centroid.x - base.pan.x) / (base.zoom * CANVAS_SCALE)
  const wy = (base.centroid.y - base.pan.y) / (base.zoom * CANVAS_SCALE)
  return {
    zoom,
    pan: {
      x: currCentroid.x - wx * zoom * CANVAS_SCALE,
      y: currCentroid.y - wy * zoom * CANVAS_SCALE,
    },
  }
}

/** Wheel zoom about a fixed screen point: the world point under the cursor
 *  stays under the cursor. Pure — unit-tested. */
export function anchoredZoom(
  prev: { zoom: number; pan: { x: number; y: number } },
  anchor: { x: number; y: number },
  factor: number,
): { zoom: number; pan: { x: number; y: number } } {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * factor))
  return {
    zoom,
    pan: {
      x: anchor.x - ((anchor.x - prev.pan.x) * zoom) / prev.zoom,
      y: anchor.y - ((anchor.y - prev.pan.y) * zoom) / prev.zoom,
    },
  }
}
