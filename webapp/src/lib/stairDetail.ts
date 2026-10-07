// ─────────────────────────────────────────────────────────────────────────
// Longitudinal-section geometry of a waist-slab flight WITH its landings and
// the reinforcement detail at both junctions. Pure — drawn by
// `components/stairSketches`. Units mm; x = plan from the lower bearing line,
// z = up from the lower landing's top.
//
// The flight spans L (plan) between landing beams centred on x = 0 and x = L —
// the span the engine designs. At each junction one face of the slab turns
// through a REENTRANT corner; a tension bar bent round a reentrant corner
// pulls straight and spalls the cover, so there the bars CROSS and each runs
// on past the corner (detailing practice — e.g. Reynolds' handbook, ACI 315):
//
//   • upper junction, soffit reentrant — the flight's bottom bars run straight
//     on into the upper landing to its top layer; the landing's bottom bars
//     run straight on into the flight to the waist's top layer;
//   • lower junction, top face reentrant — the landing's top bars run on into
//     the waist to its soffit layer; the flight's top bars run down into the
//     landing to its bottom layer.
//
// Where a face turns through a CONVEX corner (lower soffit, upper top face)
// the bar bends round it: tension pulls it into the concrete, not out.
// ─────────────────────────────────────────────────────────────────────────

export type Pt = [number, number]

export interface StairDetailInput {
  /** Plan span between bearing lines, mm. */
  L: number
  t: number; R: number; G: number
  cover: number; db: number
  /** Landing drawn each side (broken off), mm. */
  landing?: number
  /** Landing beam width × depth below the landing top, mm. */
  beamB?: number; beamD?: number
  /** Tension development length of the bars, mm — each crossing bar runs at
   *  least this far past the corner it crosses. Default 40·db. */
  ld?: number
}

export interface StairDetail {
  n: number
  /** Top of the upper landing above the lower one, mm (= n·R). */
  zTop: number
  /** Concrete outline, one closed polygon (landings, flight, beams). */
  outline: Pt[]
  /** Step profile (for dimensions): inner/outer corners in order. */
  steps: Pt[]
  /** Reinforcement polylines. */
  flightBottom: Pt[]      // main bars: lower landing bottom → flight soffit → straight into the upper landing
  upperLandingBottom: Pt[] // upper landing bottom → straight into the flight's top layer (crosses flightBottom)
  lowerLandingTop: Pt[]    // lower landing top → straight into the waist's soffit layer
  flightTopLower: Pt[]     // flight top bar at the lower junction → down into the landing bottom layer
  flightTopUpper: Pt[]     // flight top bar at the upper junction, bent round the convex corner into the landing top
  /** Where the bars cross at each reentrant corner. */
  crossUpper: Pt
  crossLower: Pt
  /** Landing beams, centred on x = 0 and x = L: [x0, z0, x1, z1]. */
  beams: [number, number, number, number][]
  ld: number
  /** Far, broken ends of the landings. */
  xLeft: number; xRight: number
  tan: number; cos: number
}

export function stairDetail(i: StairDetailInput): StairDetail {
  const { L, t, R, G, cover, db } = i
  const Lb = i.landing ?? 1000
  const bw = i.beamB ?? 250, bd = i.beamD ?? Math.max(400, t + 150)
  const tan = R / Math.max(G, 1)
  const cos = 1 / Math.hypot(1, tan)
  const n = Math.max(1, Math.ceil(L / Math.max(G, 1) - 1e-9))
  const zTop = n * R
  const xLeft = -Lb, xRight = L + Lb

  // soffit of the waist: z = x·tan − t/cos; a line offset `o` up from it
  const soffitZ = (x: number) => x * tan - t / cos
  const xOnSoffit = (o: number, z: number) => (z + (t - o) / cos) / tan
  // top of the waist (the root line through the inner step corners), offset down
  const topAt = (o: number) => (x: number) => x * tan - o / cos
  const xOnTop = (o: number, z: number) => (z + o / cos) / tan

  // the step profile, from the lower landing's top to the upper landing's
  const steps: Pt[] = [[0, 0]]
  for (let k = 0; k < n; k++) {
    steps.push([k * G, (k + 1) * R])
    if (k < n - 1) steps.push([(k + 1) * G, (k + 1) * R])
  }

  // the outline, clockwise from the lower landing's broken top corner
  const lb = [-bw / 2, bw / 2], ub = [L - bw / 2, L + bw / 2]
  const zsLow = Math.max(-bd, Math.min(-t, soffitZ(lb[1])))
  const zsUp = Math.max(zTop - bd, Math.min(zTop - t, soffitZ(ub[0])))
  const outline: Pt[] = [
    [xLeft, 0], ...steps,
    [xRight, zTop], [xRight, zTop - t],
    [ub[1], zTop - t], [ub[1], zTop - bd], [ub[0], zTop - bd], [ub[0], zsUp],
    [lb[1], zsLow], [lb[1], -bd], [lb[0], -bd], [lb[0], -t],
    [xLeft, -t],
  ]

  const ld = i.ld ?? 40 * db
  const cB = cover + db / 2, cT = cover + db / 2
  const sin = tan * cos
  /** Continue a bar from its last point along a unit direction until its run
   *  past `from` (a point on its first leg) reaches ld — the bend after the
   *  straight leg crosses the slab, along the face it arrives at. */
  const developed = (line: Pt[], from: Pt, dir: Pt, xMin: number, xMax: number): Pt[] => {
    const got = runPast(line, from)
    if (got >= ld) return line
    const [ex, ez] = line[line.length - 1]
    let rem = ld - got
    // never past a landing's broken end
    if (dir[0] > 0) rem = Math.min(rem, (xMax - ex) / dir[0])
    if (dir[0] < 0) rem = Math.min(rem, (xMin - ex) / dir[0])
    return rem > 1 ? [...line, [ex + dir[0] * rem, ez + dir[1] * rem]] : line
  }
  const zLowBot = -t + cB, zUpBot = zTop - t + cB
  const zLowTop = -cT, zUpTop = zTop - cT

  // main: lower landing bottom → bend at the convex soffit corner → up the
  // soffit → straight on past the upper (reentrant) corner to the top layer
  const xBendLow = xOnSoffit(cB, zLowBot)
  // crossings — upper: main bar line ∩ upper landing bottom; lower: landing top ∩ flight top line
  const crossUpper: Pt = [xOnSoffit(cB, zUpBot), zUpBot]
  const crossLower: Pt = [xOnTop(cT, zLowTop), zLowTop]
  const xL = xLeft + cover, xR = xRight - cover
  const flightBottom = developed([
    [xL, zLowBot], [xBendLow, zLowBot],
    [xOnSoffit(cB, zUpTop), zUpTop],
  ], crossUpper, [1, 0], xL, xR)                       // then along the landing top
  // upper landing bottom → straight on into the flight to its top layer,
  // then down the waist's top layer
  const upperLandingBottom = developed(
    [[xR, zUpBot], [xOnTop(cT, zUpBot), zUpBot]], crossUpper, [-cos, -sin], xL, xR)
  // lower landing top → straight on into the waist to its soffit layer,
  // then up the soffit layer
  const lowerLandingTop = developed(
    [[xL, zLowTop], [xOnSoffit(cB, zLowTop), zLowTop]], crossLower, [cos, sin], xL, xR)
  // flight top bar at the lower junction: from a quarter span up the waist,
  // straight down past the reentrant corner to the landing's bottom layer,
  // then back along it
  const flightTopLower = developed(
    [[L / 4, topAt(cT)(L / 4)], [xOnTop(cT, zLowBot), zLowBot]], crossLower, [-1, 0], xL, xR)
  // at the upper junction the top face turns CONVEX: bend round it
  const xBendUp = xOnTop(cT, zUpTop)
  const flightTopUpper: Pt[] = [[L * 0.75, topAt(cT)(L * 0.75)], [xBendUp, zUpTop], [xR, zUpTop]]

  return {
    n, zTop, outline, steps,
    flightBottom, upperLandingBottom, lowerLandingTop, flightTopLower, flightTopUpper,
    crossUpper, crossLower,
    beams: [[lb[0], -bd, lb[1], 0], [ub[0], zTop - bd, ub[1], zTop]],
    ld, xLeft, xRight, tan, cos,
  }
}

/** Length of a polyline past a point along it, mm (for the ℓd check). */
export function runPast(line: Pt[], from: Pt): number {
  // distance from `from` to the polyline's far end, measured along it
  let best = Infinity, idx = 0, proj: Pt = line[0]
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1]
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1
    const u = Math.max(0, Math.min(1, ((from[0] - ax) * dx + (from[1] - az) * dz) / len2))
    const p: Pt = [ax + u * dx, az + u * dz]
    const d = Math.hypot(p[0] - from[0], p[1] - from[1])
    if (d < best) { best = d; idx = k; proj = p }
  }
  let run = Math.hypot(line[idx + 1][0] - proj[0], line[idx + 1][1] - proj[1])
  for (let k = idx + 1; k < line.length - 1; k++) run += Math.hypot(line[k + 1][0] - line[k][0], line[k + 1][1] - line[k][1])
  return run
}
