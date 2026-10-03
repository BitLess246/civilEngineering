// ─────────────────────────────────────────────────────────────────────────
// STORM SEWER — urban storm-drainage network sizing by the Rational Method
// with Manning full-flow pipe capacity and travel-time flow accumulation.
//
//   Catchment → inlet i:      Qi = C·i(tc,i)·A     (the /rational-method law)
//   Run at the point of concentration:
//       tc = max( own inlet time, upstream arrival )
//       upstream arrival = upstream run's tc + its travel time L/V
//       (the standard "longest upstream time" rule — intensity falls as
//       the network accumulates, so pipe 2 is not sized at the inlet's tc)
//   Whole accumulated area is priced at the run's own tc:
//       Q = Ccomp · i(tc) · ΣA ,  Ccomp = Σ(C·A)/ΣA
//   Full-flow pipe capacity (Manning, circular running just full):
//       Qf = (1/n)·A·R^(2/3)·√S ,  A = πD²/4,  R = D/4
//   Sizing picks the smallest standard diameter with Qf ≥ Q and a part-full
//   (normal-depth) velocity ≥ Vmin for self-cleansing. Velocity caps warn.
//
// The network is a LINEAR ladder: each run names the run immediately
// upstream (−1 = begins at its own inlet). Runs must be listed head-first.
// ─────────────────────────────────────────────────────────────────────────
import { normalDepth, manningV, type ChannelShape } from './openChannel'

/** Standard commercial circular pipe diameters, mm. */
export const STD_DN = [300, 375, 450, 525, 600, 675, 750, 825, 900, 1050, 1200, 1350, 1500, 1650, 1800, 2100, 2400, 2700, 3000]

/** Manning full-flow capacity of a circular pipe running just full. */
export function fullFlowQ(Dm: number, n: number, S: number): number {
  if (!(Dm > 0)) throw new Error('Diameter must be positive.')
  if (!(n > 0)) throw new Error('Manning n must be positive.')
  if (!(S > 0)) throw new Error('Slope must be positive.')
  const A = Math.PI * Dm * Dm / 4
  const R = Dm / 4
  return (1 / n) * A * Math.pow(R, 2 / 3) * Math.sqrt(S)
}

/** Full-flow velocity of a circular pipe at the given discharge. */
export function velocityAt(Dm: number, Q: number): number {
  const A = Math.PI * Dm * Dm / 4
  return Q / A
}

/**
 * Part-full (normal-depth) velocity of a circular pipe carrying Q at slope
 * S — the self-cleansing check runs on this, not on the full-flow figure,
 * because a pipe sized by capacity usually flows well below the crown.
 */
export function velocityPartFull(Dm: number, Q: number, n: number, S: number): number {
  const shape: ChannelShape = { kind: 'circle', D: Dm }
  const y = normalDepth(shape, Q, n, S)
  return manningV(shape, y, n, S)
}

/** Smallest standard DN whose capacity ≥ Q and part-full velocity ≥ Vmin. */
export function pickDiameter(Q: number, n: number, S: number, Vmin: number):
  { dn: number; Qfull: number; Vfull: number } {
  for (const dn of STD_DN) {
    const Qfull = fullFlowQ(dn / 1000, n, S)
    if (Qfull < Q) continue
    if (velocityPartFull(dn / 1000, Q, n, S) >= Vmin) {
      return { dn, Qfull, Vfull: velocityAt(dn / 1000, Qfull) }
    }
  }
  const last = STD_DN[STD_DN.length - 1]
  const Qfull = fullFlowQ(last / 1000, n, S)
  return { dn: last, Qfull, Vfull: velocityAt(last / 1000, Qfull) }
}

export interface InletRow {
  name: string
  /** Contributing area, hectares. */
  areaHa: number
  /** Composite runoff coefficient C. */
  C: number
  /** Inlet time of concentration, minutes. */
  tcMin: number
}

export interface RunRow {
  name: string
  /** Index of the run immediately upstream, −1 = begins at its own inlet. */
  upstream: number
  /** Run length, m. */
  L: number
  /** Run slope, %. */
  slopePct: number
  /** Manning n of the pipe material. */
  n: number
  /** Contributing inlet attached to the head of this run. */
  inlet: InletRow
}

export interface RunResult {
  name: string
  inlet: InletRow
  upstreamNames: string[]
  areaHa: number
  Ccomp: number
  Qdesign: number        // m³/s
  tcHead: number         // tc at the head of the run, min
  iDesign: number        // design intensity, mm/h
  dn: number
  Qfull: number
  Vfull: number
  utilization: number    // Q / Qfull
  travelMin: number
  slopePct: number       // the run's grade, %
  warnings: string[]
}

export interface SewerResult {
  runs: RunResult[]
  Vmin: number
  Vwarn: number
  Vmax: number
}

/**
 * Size a linear storm-sewer ladder. IDF in the classic power form
 * i = a / (tc + b)^c (mm/h, tc in min) — coefficients entered once.
 */
export function designSewer(
  runs: RunRow[], idf: { a: number; b: number; c: number },
  limits: { Vmin?: number; Vwarn?: number; Vmax?: number } = {},
): SewerResult {
  if (runs.length === 0) throw new Error('Add at least one pipe run.')
  const Vmin = limits.Vmin ?? 0.75
  const Vwarn = limits.Vwarn ?? 3.0
  const Vmax = limits.Vmax ?? 4.5
  if (!(idf.a > 0) || !(idf.b >= 0) || !(idf.c > 0)) throw new Error('IDF coefficients must be positive (b may be 0).')

  const idfIntensity = (tcMin: number) => idf.a / Math.pow(Math.max(tcMin + idf.b, 0.1), idf.c)

  const out: RunResult[] = []
  const upIdx: number[] = []   // upstream index of each computed run, for the walk
  runs.forEach((run, idx) => {
    const warns: string[] = []
    if (run.upstream >= idx) throw new Error(`Run ${idx} (“${run.name}”) references an upstream run defined later — list the network head-first.`)
    if (!(run.inlet.areaHa > 0)) throw new Error(`Inlet area of ${run.name} must be positive.`)
    if (!(run.inlet.C > 0 && run.inlet.C <= 1)) throw new Error(`Runoff coefficient of ${run.name} must be 0–1.`)
    if (!(run.inlet.tcMin > 0)) throw new Error(`Inlet time of ${run.name} must be positive.`)
    if (!(run.slopePct > 0)) throw new Error(`Slope of ${run.name} must be positive.`)

    // Walk the upstream chain (linear ladder → indices are strictly decreasing).
    const chain: RunResult[] = []
    let up: number = run.upstream
    const seen = new Set<number>()
    while (up >= 0) {
      if (seen.has(up)) { warns.push('Loop in the upstream chain — check the upstream column.'); break }
      seen.add(up)
      const prev = out[up]
      if (!prev) throw new Error(`Upstream run ${up} not found.`)
      chain.unshift(prev)
      up = upIdx[up] ?? -1
    }
    const upstreamNames = chain.map((c) => c.name)

    // Arrival time of the upstream flow = last chain run's tc + its travel.
    let tcUp = 0
    if (chain.length > 0) {
      const last = chain[chain.length - 1]
      tcUp = last.tcHead + last.travelMin
    }
    const tcHead = Math.max(run.inlet.tcMin, tcUp)
    const iDesign = idfIntensity(tcHead)

    // Accumulate area and C·A over the chain plus the local inlet.
    let areaHa = run.inlet.areaHa
    let caSum = run.inlet.areaHa * run.inlet.C
    for (const c of chain) {
      areaHa += c.inlet.areaHa
      caSum += c.inlet.areaHa * c.inlet.C
    }
    const Ccomp = caSum / areaHa
    // Q = C·i·A with i in mm/h and A in ha → the classic 0.00278 factor:
    // Q (m³/s) = C·i/1000/3600 · A·10⁴ = C·i·A / 360.
    const Qdesign = (Ccomp * iDesign * areaHa) / 360

    const S = run.slopePct / 100
    const pick = pickDiameter(Qdesign, run.n, S, Vmin)
    const travelMin = pick.Vfull > 0 ? run.L / pick.Vfull / 60 : 0
    const utilization = pick.Qfull > 0 ? Qdesign / pick.Qfull : 0
    if (pick.Vfull > Vmax) warns.push(`V = ${pick.Vfull.toFixed(2)} m/s exceeds the ${Vmax} m/s erosion cap — flatten the run or add a drop structure.`)
    else if (pick.Vfull > Vwarn) warns.push(`V = ${pick.Vfull.toFixed(2)} m/s is above the ${Vwarn} m/s comfort check — a flatter grade would settle it.`)
    if (pick.dn === STD_DN[STD_DN.length - 1] && pick.Qfull < Qdesign) {
      warns.push(`Even DN ${pick.dn} cannot carry ${Qdesign.toFixed(2)} m³/s at this slope — steepen the grade or add a parallel barrel.`)
    }

    out.push({
      name: run.name, inlet: run.inlet, upstreamNames,
      areaHa, Ccomp, Qdesign, tcHead, iDesign,
      dn: pick.dn, Qfull: pick.Qfull, Vfull: pick.Vfull,
      utilization, travelMin, slopePct: run.slopePct, warnings: warns,
    })
    upIdx[idx] = run.upstream
  })

  return { runs: out, Vmin, Vwarn, Vmax }
}
