// ─────────────────────────────────────────────────────────────────────────
// CSV / AT2 accelerogram parser for time-history analysis.
//
// Supported formats:
//   Two-column CSV   : each row is "t[s], ag"  (dt derived from the time axis)
//   One-column CSV   : each row is a single ag value (dt from header or opts.dt)
//   PEER AT2 (NGA)   : NPTS/DT= header followed by rows of 5–8 values each
//   Comment lines starting with #, %, or ! are skipped.
//   Non-numeric header rows are skipped.
//
// Units: opts.units = 'g' scales the output by 9.81 so the result is m/s².
//        opts.units = 'ms2' (default) leaves values unchanged.
// ─────────────────────────────────────────────────────────────────────────

export interface AccelerogramOpts {
  /** Time step (s). Required for one-column / AT2 format when the CSV has no DT= header. */
  dt?: number
  /** Acceleration unit in the file. 'g' multiplies by 9.81. Default: 'ms2' (m/s²). */
  units?: 'g' | 'ms2'
}

export interface ParsedAccelerogram {
  /** Uniform time step, s. */
  dt: number
  /** Ground acceleration samples, m/s². */
  ag: number[]
  /** Number of samples. */
  npts: number
  /** Peak ground acceleration, m/s². */
  pga: number
  /** Whether the input was two-column (time, ag). */
  twoColumn: boolean
}

/**
 * Parse a CSV / AT2 accelerogram string into a uniform ground-acceleration array.
 * Returns null if the format cannot be determined (e.g. one-column with no dt hint).
 */
export function parseAccelerogram(
  csv: string,
  opts?: AccelerogramOpts,
): ParsedAccelerogram | null {
  const scale = opts?.units === 'g' ? 9.81 : 1

  // opts.dt takes priority; fall back to PEER AT2 DT= header if not provided
  let dtHint: number | undefined = opts?.dt
  if (dtHint == null) {
    for (const line of csv.split('\n')) {
      const m = line.match(/DT\s*=\s*([\d.eE+\-]+)\s*SEC/i)
      if (m) {
        const v = parseFloat(m[1])
        if (v > 0) { dtHint = v; break }
      }
    }
  }

  const ag: number[] = []
  const times: number[] = []
  let modeDecided = false
  let twoColumn = false

  for (const raw of csv.split('\n')) {
    const line = raw.trim()
    if (!line || /^[#%!]/.test(line)) continue

    const parts = line.split(/[\s,;]+/).filter(Boolean)
    const nums = parts.map(Number)
    if (nums.some((v) => !isFinite(v) || isNaN(v))) continue  // header or mixed → skip

    if (!modeDecided) {
      // Exactly two values and no DT hint → two-column (time, ag)
      twoColumn = nums.length === 2 && dtHint == null
      modeDecided = true
    }

    if (twoColumn) {
      if (nums.length === 2) {
        times.push(nums[0])
        ag.push(nums[1] * scale)
      }
    } else {
      // One-column or AT2 multi-value-per-row
      for (const v of nums) ag.push(v * scale)
    }
  }

  if (ag.length === 0) return null

  let dt: number
  if (twoColumn && times.length >= 2) {
    dt = times[1] - times[0]
  } else if (dtHint != null && dtHint > 0) {
    dt = dtHint
  } else {
    return null  // one-column with no dt source
  }

  if (dt <= 0 || !isFinite(dt)) return null

  const pga = ag.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  return { dt, ag, npts: ag.length, pga, twoColumn }
}
