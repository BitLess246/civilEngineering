// ─────────────────────────────────────────────────────────────────────────
// Fines content per layer, from the sieve tests that were actually run. Layer 8.
//
// The liquefaction fines correction needs FC%, and where that number comes from
// changes the answer: treating a silty sand as clean sand overstates its
// resistance, so a guessed FC is unconservative in the direction that matters.
//
// This resolves it the same way the parameter engine resolves everything else —
// from the evidence, with the source reported — rather than letting the page
// invent one. A layer with no sieve test returns NOTHING, and the caller says
// so on screen.
//
// UNITS: percent passing the 0.075 mm (No. 200) sieve.
// ─────────────────────────────────────────────────────────────────────────

import type { Borehole, Sample } from './model'
import { governingTest } from './classifySample'
import { readSieve } from './lab'
import { gradation } from './sieve'

export interface LayerFines {
  layerId: string
  /** Percent passing 0.075 mm. */
  fines: number
  /** Sample the value came from. */
  sampleId: string
  sampleName: string
  /** More than one sieve in the layer — the mean is used and this lists them. */
  fromSamples: { sampleName: string; fines: number }[]
}

/** Samples attributed to a layer, or falling inside its depth range. */
function samplesFor(bh: Borehole, layerId: string): Sample[] {
  const layer = bh.layers.find((l) => l.id === layerId)
  return bh.samples.filter((s) =>
    s.layerId === layerId ||
    (s.layerId == null && layer != null &&
      s.depthTop >= layer.depthTop && s.depthTop < layer.depthBottom))
}

/**
 * Fines content for every layer that has a completed sieve to support one.
 *
 * Where a layer has several sieves the MEAN is taken and every contributing
 * sample is listed, because averaging two samples that disagree is a judgement
 * the reader should be able to see and overrule.
 */
export function finesByLayer(bh: Borehole): LayerFines[] {
  const out: LayerFines[] = []

  for (const layer of bh.layers) {
    const found: { sampleId: string; sampleName: string; fines: number }[] = []

    for (const sample of samplesFor(bh, layer.id)) {
      const { test } = governingTest(sample, 'sieve')
      if (!test) continue
      const data = readSieve(test)
      if (!data) continue
      try {
        found.push({ sampleId: sample.id, sampleName: sample.name, fines: gradation(data).fines })
      } catch {
        // A sieve whose masses do not reconcile is a data error the laboratory
        // tab already reports; it must not silently become a fines content.
        continue
      }
    }

    if (!found.length) continue
    const mean = found.reduce((s, f) => s + f.fines, 0) / found.length
    out.push({
      layerId: layer.id,
      fines: mean,
      sampleId: found[0].sampleId,
      sampleName: found[0].sampleName,
      fromSamples: found.map((f) => ({ sampleName: f.sampleName, fines: f.fines })),
    })
  }

  return out
}

/** The shape `liquefactionProfile` takes, keyed by layer id. */
export const finesMap = (rows: LayerFines[]): Record<string, number> =>
  Object.fromEntries(rows.map((r) => [r.layerId, r.fines]))
