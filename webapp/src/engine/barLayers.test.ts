// The rule under test: no layer carries a single bar. It lived only inside
// `beamDesign`, so the T-beam engine — which stacked bars with its own greedy
// loop — could detail one bar sitting alone in the top layer with nothing to
// tie to on either side. These tests belong to the rule, not to either engine.

import { describe, it, expect } from 'vitest'
import { splitLayers, centroidRise } from './barLayers'

const total = (l: number[]) => l.reduce((s, k) => s + k, 0)

describe('splitLayers', () => {
  it('keeps everything in one layer while it fits', () => {
    expect(splitLayers(4, 4)).toEqual({ bars: 4, layers: [4] })
    expect(splitLayers(2, 5)).toEqual({ bars: 2, layers: [2] })
  })

  it('fills the bottom layer first', () => {
    // The extreme layer is the one doing the work; a half-full bottom layer
    // would raise the group centroid and cost effective depth for nothing.
    expect(splitLayers(7, 4).layers).toEqual([4, 3])
  })

  it('pairs a lone bar in the upper layer — the bug this exists to stop', () => {
    // 5 bars, 4 per layer, is [4, 1] naively. The 1 has no neighbour to sit
    // beside the stirrup leg with, so it becomes [4, 2] and the count goes up.
    expect(splitLayers(5, 4)).toEqual({ bars: 6, layers: [4, 2] })
    expect(splitLayers(3, 2)).toEqual({ bars: 4, layers: [2, 2] })
    expect(splitLayers(9, 4)).toEqual({ bars: 10, layers: [4, 4, 2] })
  })

  it('never returns a layer of one, for any count or width', () => {
    for (let per = 2; per <= 8; per++) {
      for (let n = 2; n <= 60; n++) {
        const r = splitLayers(n, per)
        expect(r.layers.every((k) => k >= 2)).toBe(true)
        expect(total(r.layers)).toBe(r.bars)
      }
    }
  })

  it('only ever ADDS steel — pairing is conservative on As', () => {
    // Never the other direction. A section detailed with fewer bars than the
    // strength calculation demanded is the one failure mode that matters here.
    for (let per = 2; per <= 8; per++) {
      for (let n = 2; n <= 60; n++) {
        expect(splitLayers(n, per).bars).toBeGreaterThanOrEqual(n)
        expect(splitLayers(n, per).bars).toBeLessThanOrEqual(n + 1)
      }
    }
  })

  it('leaves a one-bar-wide web alone', () => {
    // maxPerLayer < 2 means the web cannot hold two bars side by side at all.
    // The honest answer is that the section is too narrow, not that it wants
    // another bar — so pairing is skipped rather than looping forever.
    expect(splitLayers(3, 1)).toEqual({ bars: 3, layers: [1, 1, 1] })
  })

  it('handles a single bar and none at all', () => {
    expect(splitLayers(1, 4)).toEqual({ bars: 1, layers: [1] })
    expect(splitLayers(0, 4)).toEqual({ bars: 0, layers: [] })
  })

  it('rounds a fractional demand up', () => {
    expect(splitLayers(4.2, 4).bars).toBe(6)   // 5 → paired to 6
  })
})

describe('centroidRise', () => {
  it('is zero for a single layer — d is unaffected', () => {
    expect(centroidRise([4], 45)).toBe(0)
  })

  it('is the Varignon average of the layer heights', () => {
    // [4, 2] at 45 mm pitch: (4·0 + 2·45) / 6 = 15 mm.
    expect(centroidRise([4, 2], 45)).toBeCloseTo(15, 9)
    // [4, 4] is symmetric about the gap: exactly half the pitch.
    expect(centroidRise([4, 4], 45)).toBeCloseTo(22.5, 9)
  })

  it('always raises the centroid as layers are added, never lowers it', () => {
    // Stacking must REDUCE effective depth. A rise that went the other way
    // would silently overstate capacity.
    expect(centroidRise([4, 4, 2], 45)).toBeGreaterThan(centroidRise([4, 4], 45))
    expect(centroidRise([4, 4], 45)).toBeGreaterThan(centroidRise([4], 45))
  })

  it('is safe on an empty group', () => {
    expect(centroidRise([], 45)).toBe(0)
  })
})
