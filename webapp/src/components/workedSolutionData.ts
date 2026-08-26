// The design case shown on the landing page, and the engine output for it.
//
// Split out of `WorkedSolutionPreview.tsx` because a file that exports both a
// component and constants breaks Fast Refresh — and because the test wants the
// data without pulling JSX in behind it.
//
// EVERY NUMBER IS THE ENGINE'S. `workedSolutionPreview.test.ts` runs
// `designBeam` over `DEMO_INPUT` and asserts each figure below still matches,
// so the landing page cannot drift into advertising arithmetic the app no
// longer produces. Written as literals so the landing page does not pull the
// design engine into its bundle.

/** The design case shown. Mirrored by the test, which re-runs the engine on it. */
export const DEMO_INPUT = {
  b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10,
  fc: 28, fy: 415, Mu: 180, Vu: 120,
} as const

/** Engine outputs, as displayed. Pinned to `designBeam` by the test. */
export const DEMO_RESULT = {
  d: 440,
  rhoMin: 0.0034, rho: 0.0090, rhoMax: 0.0183,
  As: 1188.6, bars: 4, sClear: 40, sMinClear: 26.7,
  Vc: 116.4, phiVc: 87.3, VsReq: 43.6,
  sReq: 658, sMax: 220, sAdopt: 220, legs: 2,
} as const
