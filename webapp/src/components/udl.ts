// Arrow placement for a distributed-load glyph. Its own file because `dims`
// exports components and this is arithmetic — and because two elevations now
// share it (BeamElevation and the prestressed-beam page), which is exactly
// how the hand-typed version drifted out of being uniform in the first place.

/**
 * Where the arrows of a distributed load go, as fractions of the loaded length.
 *
 * ALWAYS INCLUSIVE OF BOTH ENDS AND ALWAYS EVENLY SPACED. That is the whole
 * point of the helper: the prestressed-beam elevation used to carry a
 * hand-typed list, `[0.08, 0.26, 0.44, 0.62, 0.8, 0.96]`, which was neither.
 * Its last gap was 11% shorter than the rest and it sat 19.8 units from the
 * left end of the beam but 9.9 from the right — a uniformly distributed load
 * drawn non-uniformly, and off-centre.
 *
 * `minSpacing` is a floor on the gap in viewBox units, so a short span does
 * not become a comb; three arrows is the fewest that still reads as a UDL
 * rather than as point loads.
 */
export function udlStations(lengthPx: number, minSpacing = 26): number[] {
  // Total by construction. A NaN or Infinity length went straight into
  // `Array.from({ length })`, which yields an EMPTY array — the load would
  // vanish from the drawing rather than fail loudly. The upper cap stops an
  // absurd length emitting thousands of arrows.
  const span = Number.isFinite(lengthPx) ? Math.max(0, lengthPx) : 0
  const step = Number.isFinite(minSpacing) && minSpacing > 0 ? minSpacing : 26
  const n = Math.min(64, Math.max(3, Math.floor(span / step)))
  return Array.from({ length: n + 1 }, (_, j) => j / n)
}
