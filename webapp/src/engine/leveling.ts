// ─────────────────────────────────────────────────────────────────────────
// DIFFERENTIAL LEVELING — page-book reduction by both classic methods.
//
// The field book lists, per station row, the rod readings taken there:
//
//   STA | BS  | HI   | IFS | FS  | ELEV
//   BM1 | 1.50| 101.5|     |     | 100.00
//   TP1 | 1.20| 101.8|     | 0.90| 100.60
//   S1  |     |      | 2.30|     |  99.20   (intermediate / profile point)
//   BM2 |     |      |     | 2.05|  99.75
//
// The engine walks the book once and produces both classic reductions:
//
//   · HI method   — HI = Elev + BS; the next row's Elev = HI − its FS
//                   (IFS rows: Elev = HI − rod)
//   · Rise & fall — rise = BS(setup) − FS(setup) read from the SAME setup,
//                   i.e. the previous row's BS against this row's FS
//
// Both must agree, and the page check ΣBS − ΣFS = Σrise − Σfall = ΔElev is
// the arithmetic proof the engine asserts before returning — a book that
// does not page-check has a copied digit, and the engine refuses it.
//
// Misclosure: when a known closing elevation is supplied, the error is
// distributed over the intermediate points in proportion to the setups
// elapsed (the standard "correct by setup count" adjustment taught for
// construction control). Tolerances are reported against the conventional
// order-of-accuracy limits c·√K (K = path length in km, c in mm/km):
//   first order 4√K · second order 8√K · third order 12√K (geodetic practice)
// ─────────────────────────────────────────────────────────────────────────

export interface LevelRow {
  /** Station name (BM, TP1, STA 0+020, …) — free text. */
  sta: string
  /** Backsight reading (m), on this station looking back. */
  bs?: number
  /** Foresight reading (m), closing the setup started at the previous BS. */
  fs?: number
  /** Intermediate sights (m), read from the current HI (profile points). */
  ifs?: number[]
}

export interface LevelInput {
  rows: LevelRow[]
  /** Elevation of the first station (m). */
  startElev: number
  /** Known elevation of the last station (m), if the run closes on a BM. */
  endElev?: number
  /** Approximate leveling path length (km) for the order-of-accuracy check. */
  distanceKm?: number
}

export interface LevelPoint {
  sta: string
  bs: number | null
  hi: number | null
  fs: number | null
  /** Elevations (m) of the intermediate sights on this row, in rod order. */
  ifs: number[]
  /** Uncorrected elevation (m). */
  elev: number
  /** Elevation after misclosure distribution (m) — equals `elev` when open. */
  adj: number
  /** Rise (+) or fall (−) from the previous turning point (m); null elsewhere. */
  riseFall: number | null
  /** Setups completed when this point was established — the adjustment weight. */
  setups: number
}

export interface LevelResult {
  points: LevelPoint[]
  sumBS: number
  sumFS: number
  sumRise: number
  sumFall: number
  /** Measured Δelev = last − first, before adjustment (m). */
  measured: number
  /** Measured − known; negative when the run ends too high. */
  misclosure: number | null
  /** Correction applied per setup (m) — −misclosure / setups. */
  perSetup: number | null
  setups: number
  /** c·√K limits (mm): first 4, second 8, third 12. */
  tolerance: { first: number; second: number; third: number } | null
  /** |misclosure| in mm, for the tolerance comparison. */
  misclosureMm: number | null
  /** Arithmetic proof, reported on the sheet: all three must be equal. */
  pageCheck: { bsFs: number; riseFall: number; delta: number }
}

/** Reduce a differential-leveling field book. Throws when the book is
 *  structurally unusable (empty rows, FS before any BS, …). */
export function reduceLeveling(input: LevelInput): LevelResult {
  const rows = input.rows
  if (rows.length < 2) throw new Error('A level run needs at least two rows (BM → TP/BM).')
  if (rows[0].bs === undefined) throw new Error('The first row must carry a backsight on the starting benchmark.')
  if (rows[0].fs !== undefined) throw new Error('The first row cannot carry a foresight — nothing has been set up yet.')

  const points: LevelPoint[] = []
  let elev = input.startElev
  let hi: number | null = null
  let setups = 0
  let sumBS = 0
  let sumFS = 0
  let sumRise = 0
  let sumFall = 0
  // The BS of the setup in progress: the previous row's BS, kept across any
  // number of IFS-only rows (those hang off the same setup and never close it).
  let prevBs: number | null = null

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const bs = r.bs ?? null
    const fs = r.fs ?? null
    const ifs = r.ifs ?? []
    const last = i === rows.length - 1

    if (bs === null && fs === null && ifs.length === 0) {
      throw new Error(`Row "${r.sta}" has no readings.`)
    }
    if (fs !== null && prevBs === null) {
      throw new Error(`Row "${r.sta}" closes with a foresight but no backsight is in progress.`)
    }
    if (last && bs !== null) {
      throw new Error(`Row "${r.sta}" is the last row — close it with a foresight, not a backsight.`)
    }

    let riseFall: number | null = null
    if (fs !== null) {
      riseFall = prevBs! - fs
      sumRise += riseFall > 0 ? riseFall : 0
      sumFall += riseFall < 0 ? -riseFall : 0
      elev = elev + riseFall
      setups++
      sumFS += fs
    }
    if (bs !== null) sumBS += bs

    if (bs !== null) { hi = elev + bs; prevBs = bs }

    const point: LevelPoint = { sta: r.sta, bs, hi, fs, ifs: [], elev, adj: elev, riseFall, setups }

    // Intermediate sights hang off the HI in force on this row — the setup
    // that started here (when a BS is present) or the one still running.
    if (hi === null) throw new Error(`Row "${r.sta}" has readings before the first backsight.`)
    for (const z of ifs) {
      if (z < 0) throw new Error(`Intermediate sight on "${r.sta}" is negative.`)
      point.ifs.push(hi - z)
    }
    // A pure profile row (no BS, no FS) IS the sight: its elevation column in
    // the book is the ground shot itself, not the turning point it hangs off.
    if (bs === null && fs === null && point.ifs.length > 0) point.elev = point.ifs[0]
    points.push(point)
  }

  // ── page check: the book must balance before any adjustment is legal ──
  const bsFs = sumBS - sumFS
  const riseFallNet = sumRise - sumFall
  const delta = points[points.length - 1].elev - input.startElev
  const eps = 1e-9
  if (Math.abs(bsFs - riseFallNet) > eps || Math.abs(riseFallNet - delta) > eps) {
    throw new Error('Page check failed: ΣBS−ΣFS ≠ Σrise−Σfall = Δelev — the field book has an arithmetic error.')
  }

  // ── misclosure + distribution over the intermediate points ──
  let misclosure: number | null = null
  let perSetup: number | null = null
  let tolerance: LevelResult['tolerance'] = null
  let misclosureMm: number | null = null
  if (input.endElev !== undefined) {
    misclosure = points[points.length - 1].elev - input.endElev
    perSetup = setups > 0 ? -misclosure / setups : 0
    for (const p of points) p.adj = p.elev + perSetup * p.setups
    if (input.distanceKm !== undefined && input.distanceKm > 0) {
      const rootK = Math.sqrt(input.distanceKm)
      tolerance = { first: 4 * rootK, second: 8 * rootK, third: 12 * rootK }
      misclosureMm = Math.abs(misclosure) * 1000
    }
  }

  return {
    points, sumBS, sumFS, sumRise, sumFall,
    measured: delta, misclosure, perSetup, setups, tolerance, misclosureMm,
    pageCheck: { bsFs, riseFall: riseFallNet, delta },
  }
}

/** Human sentence for the accuracy class the misclosure satisfies. */
export function accuracyClass(res: LevelResult): string {
  if (res.tolerance === null || res.misclosureMm === null) return 'path length not given — order of accuracy not rated'
  const { tolerance: t, misclosureMm: e } = res
  if (e <= t.first) return `first order (|ε| = ${e.toFixed(1)} mm ≤ 4√K = ${t.first.toFixed(1)} mm)`
  if (e <= t.second) return `second order (|ε| = ${e.toFixed(1)} mm ≤ 8√K = ${t.second.toFixed(1)} mm)`
  if (e <= t.third) return `third order (|ε| = ${e.toFixed(1)} mm ≤ 12√K = ${t.third.toFixed(1)} mm)`
  return `below third-order tolerance (${e.toFixed(1)} mm > 12√K = ${t.third.toFixed(1)} mm) — re-run the loop`
}
