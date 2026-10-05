import { describe, it, expect } from 'vitest'
import { nextPinchView, anchoredZoom, CANVAS_SCALE, MIN_ZOOM, MAX_ZOOM } from './planCanvasView'

const base = {
  dist: 200,
  zoom: 1,
  centroid: { x: 300, y: 200 },
  pan: { x: 40, y: 40 },
}

describe('nextPinchView', () => {
  it('spreading fingers zooms in about the centroid', () => {
    const v = nextPinchView(base, 400, base.centroid)  // fingers ×2 apart
    expect(v.zoom).toBeCloseTo(2, 9)
    // the world point under the centroid must STAY under the centroid
    const wx0 = (base.centroid.x - base.pan.x) / (base.zoom * CANVAS_SCALE)
    const wy0 = (base.centroid.y - base.pan.y) / (base.zoom * CANVAS_SCALE)
    const wx1 = (base.centroid.x - v.pan.x) / (v.zoom * CANVAS_SCALE)
    const wy1 = (base.centroid.y - v.pan.y) / (v.zoom * CANVAS_SCALE)
    expect(wx1).toBeCloseTo(wx0, 9)
    expect(wy1).toBeCloseTo(wy0, 9)
  })

  it('sliding fingers pans the sheet', () => {
    const v = nextPinchView(base, 200, { x: 360, y: 260 })  // same spread, moved
    expect(v.zoom).toBeCloseTo(1, 9)
    const wx0 = (base.centroid.x - base.pan.x) / (base.zoom * CANVAS_SCALE)
    expect((360 - v.pan.x) / (v.zoom * CANVAS_SCALE)).toBeCloseTo(wx0, 9)
  })

  it('clamps the zoom into [MIN, MAX]', () => {
    expect(nextPinchView(base, 4000, base.centroid).zoom).toBe(MAX_ZOOM)
    expect(nextPinchView(base, 2, base.centroid).zoom).toBe(MIN_ZOOM)
  })

  it('a degenerate (zero-distance) base does not divide by zero', () => {
    const v = nextPinchView({ ...base, dist: 0 }, 100, base.centroid)
    expect(Number.isFinite(v.zoom)).toBe(true)
    expect(Number.isFinite(v.pan.x)).toBe(true)
  })
})

describe('anchoredZoom', () => {
  it('keeps the world point under the cursor stationary', () => {
    const prev = { zoom: 1, pan: { x: 40, y: 40 } }
    const anchor = { x: 300, y: 250 }
    const next = anchoredZoom(prev, anchor, 1.1)
    const wx0 = (anchor.x - prev.pan.x) / (prev.zoom * CANVAS_SCALE)
    const wy0 = (anchor.y - prev.pan.y) / (prev.zoom * CANVAS_SCALE)
    expect((anchor.x - next.pan.x) / (next.zoom * CANVAS_SCALE)).toBeCloseTo(wx0, 9)
    expect((anchor.y - next.pan.y) / (next.zoom * CANVAS_SCALE)).toBeCloseTo(wy0, 9)
  })

  it('zoom-out factors shrink the zoom and re-anchor identically', () => {
    const prev = { zoom: 2, pan: { x: 0, y: 0 } }
    const next = anchoredZoom(prev, { x: 100, y: 100 }, 0.9)
    expect(next.zoom).toBeCloseTo(1.8, 9)
    const wx0 = (100 - 0) / (2 * CANVAS_SCALE)
    expect((100 - next.pan.x) / (next.zoom * CANVAS_SCALE)).toBeCloseTo(wx0, 9)
  })

  it('clamps into [MIN, MAX]', () => {
    expect(anchoredZoom({ zoom: MAX_ZOOM, pan: { x: 0, y: 0 } }, { x: 0, y: 0 }, 10).zoom).toBe(MAX_ZOOM)
    expect(anchoredZoom({ zoom: MIN_ZOOM, pan: { x: 0, y: 0 } }, { x: 0, y: 0 }, 0.01).zoom).toBe(MIN_ZOOM)
  })
})
