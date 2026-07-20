// ─────────────────────────────────────────────────────────────────────────
// Building water-supply design — RNPCP 2000 (Module 2).  Fixture-unit demand,
// design flow via Hunter's curve, static head, friction loss, velocity and
// building-supply pipe sizing.
//
// Two demands matter and must not be confused:
//   • MAXIMUM demand  = Σ WSFU × 8 gpm  — every fixture discharging at once (an
//     upper bound, used for the drainage side and as a sanity ceiling).
//   • DESIGN (probable) flow — the realistic simultaneous flow, read from the
//     code's Chart A-2 / A-3, which is HUNTER'S CURVE: a nonlinear FU→flow map
//     embedding diversity of use.  This engine evaluates Hunter's curve directly
//     (flush-tank / flush-valve tables) instead of a chart read; the value can
//     be overridden with a chart-specific flow.
//
// Friction uses Hazen-Williams (the physics behind Charts A-4…A-7).  Sizing
// picks the smallest standard pipe whose friction over the developed length
// stays within the available head and whose velocity stays under the code cap
// (≤ 2.4 m/s target, 3 m/s max).
//
// Units: flow L/s (also gpm at the boundary); diameter mm; length m; pressure
// kPa; velocity m/s.
// ─────────────────────────────────────────────────────────────────────────
import { type FixtureCount, type Occupancy, totalWSFU } from './plumbingFixtures'
import { type SolutionStep, sn0, sn1, sn2, sn3 } from '../lib/solution'

// ── Unit conversions ────────────────────────────────────────────────────────
export const GPM_PER_LPS = 15.850323      // 1 L/s = 15.8503 gpm
export const LPS_PER_GPM = 1 / GPM_PER_LPS
export const KPA_PER_PSI = 6.89476
export const gpmToLps = (gpm: number) => gpm * LPS_PER_GPM
export const lpsToGpm = (lps: number) => lps * GPM_PER_LPS

/** Water density head: 1 m of water column = 9.81 kPa (γ = 9.81 kN/m³). */
export const GAMMA_W = 9.81               // kPa per metre of head

// ── Demand ──────────────────────────────────────────────────────────────────
/** 1 fixture unit ≈ 8 gpm of instantaneous discharge (RNPCP; Module 2). */
export const GPM_PER_FU = 8

export interface WaterDemand {
  wsfu: number
  maxGpm: number; maxLps: number          // theoretical maximum (Σ FU × 8)
}

/** Maximum demand (Σ WSFU × 8 gpm) for a fixture schedule — an upper bound. */
export function waterDemand(items: FixtureCount[], occ: Occupancy): WaterDemand {
  const wsfu = totalWSFU(items, occ)
  const maxGpm = wsfu * GPM_PER_FU
  return { wsfu, maxGpm, maxLps: gpmToLps(maxGpm) }
}

// ── Hunter's curve — probable design flow from fixture units (Chart A-2/A-3) ──
export type HunterSystem = 'tank' | 'valve'
// [fixture units, gpm]; standard Hunter values (Wujek & Dagostino; the basis of
// RNPCP Chart A-2 flush-tank / A-3 flush-valve). Diversity is already embedded.
const HUNTER_TANK: [number, number][] = [
  [1, 3.0], [2, 5.0], [3, 6.5], [4, 8.0], [5, 9.4], [6, 10.7], [8, 12.8], [10, 14.6],
  [12, 16.3], [15, 18.7], [20, 22.2], [25, 25.4], [30, 28.3], [40, 33.6], [50, 38.3],
  [60, 42.6], [80, 50.3], [100, 57.1], [150, 72.0], [200, 84.8], [300, 107.0], [500, 143.0], [1000, 216.0],
]
const HUNTER_VALVE: [number, number][] = [
  [5, 15.0], [10, 27.0], [15, 34.5], [20, 41.0], [25, 46.5], [30, 51.5], [40, 60.5], [50, 68.5],
  [60, 75.5], [80, 88.0], [100, 99.0], [150, 121.0], [200, 142.5], [300, 175.0], [500, 227.0], [1000, 321.0],
]

/** Probable design flow (gpm) for a total fixture-unit load, by system type,
 *  via piecewise-linear interpolation of Hunter's curve. */
export function hunterFlowGpm(wsfu: number, system: HunterSystem = 'tank'): number {
  const t = system === 'valve' ? HUNTER_VALVE : HUNTER_TANK
  if (wsfu <= t[0][0]) return (wsfu / t[0][0]) * t[0][1]          // scale down to origin
  for (let i = 1; i < t.length; i++) {
    if (wsfu <= t[i][0]) {
      const [x0, y0] = t[i - 1], [x1, y1] = t[i]
      return y0 + ((y1 - y0) * (wsfu - x0)) / (x1 - x0)
    }
  }
  return t[t.length - 1][1]                                        // clamp at the top
}
export const hunterFlowLps = (wsfu: number, system: HunterSystem = 'tank') =>
  gpmToLps(hunterFlowGpm(wsfu, system))

// ── Static head ───────────────────────────────────────────────────────────
/** Pressure change from an elevation rise Z (m) — a loss going up: γ·Z kPa. */
export const staticHead = (Zm: number) => GAMMA_W * Zm     // magnitude, kPa

// ── Velocity (continuity) ─────────────────────────────────────────────────
/** Average velocity v = Q/A for a round pipe (m/s), from flow (L/s) and inside
 *  diameter (mm).  Equals the customary v = 0.409·Q[gpm]/D[in]². */
export function velocity(lps: number, dMm: number): number {
  if (dMm <= 0) return Infinity
  return (4000 * lps) / (Math.PI * dMm * dMm)              // (L/s→m³/s)/(π D²/4)
}

// ── Friction loss — Hazen-Williams ────────────────────────────────────────
/** Hazen-Williams roughness C by pipe material. */
export const HAZEN_C: Record<string, number> = {
  copper: 140, plastic: 150, brass: 130, ferrous: 120, 'galvanized-old': 100,
}

/** Head loss (m) over length L (m) for flow Q (L/s) in a pipe of inside
 *  diameter D (mm): hf = 10.67·L·Q^1.852 / (C^1.852·D^4.87), SI form. */
export function hazenWilliamsHead(lps: number, dMm: number, C: number, Lm: number): number {
  if (dMm <= 0 || C <= 0) return Infinity
  const Q = lps / 1000, D = dMm / 1000                    // → m³/s, m
  return (10.67 * Lm * Math.pow(Q, 1.852)) / (Math.pow(C, 1.852) * Math.pow(D, 4.87))
}

/** Friction pressure drop, kPa, over length L. */
export const frictionDrop = (lps: number, dMm: number, C: number, Lm: number) =>
  hazenWilliamsHead(lps, dMm, C, Lm) * GAMMA_W

// ── Building-supply pipe schedule (copper Type L inside diameters, mm) ──────
export interface PipeSize { nominalIn: number; label: string; idMm: number }
export const COPPER_TYPE_L: PipeSize[] = [
  { nominalIn: 0.5, label: '½"', idMm: 13.84 },
  { nominalIn: 0.75, label: '¾"', idMm: 19.94 },
  { nominalIn: 1.0, label: '1"', idMm: 26.04 },
  { nominalIn: 1.25, label: '1¼"', idMm: 32.13 },
  { nominalIn: 1.5, label: '1½"', idMm: 38.24 },
  { nominalIn: 2.0, label: '2"', idMm: 50.42 },
  { nominalIn: 2.5, label: '2½"', idMm: 62.61 },
  { nominalIn: 3.0, label: '3"', idMm: 74.80 },
  { nominalIn: 4.0, label: '4"', idMm: 99.4 },
]

/** RNPCP: no building water-service pipe smaller than 19 mm (¾"). */
export const MIN_SERVICE_MM = 19
/** Velocity cap: RNPCP notes velocities shall not exceed ~3 m/s; 2.4 m/s is the
 *  common design target to limit noise and erosion. */
export const V_TARGET = 2.4
export const V_MAX = 3.0

export interface PipeSizingResult {
  size: PipeSize | null
  velocity: number          // m/s at the chosen size
  frictionDrop: number      // kPa over L at the chosen size
  velocityOK: boolean       // ≤ vMax
  frictionOK: boolean       // ≤ allowable
  governedBy: 'velocity' | 'friction' | 'min-size' | 'none'
}

/** Smallest schedule pipe (≥ 19 mm) whose friction over L stays within the
 *  available head AND whose velocity stays ≤ vMax. */
export function sizeSupplyPipe(p: {
  lps: number; Lm: number; allowableDropKPa: number
  material?: keyof typeof HAZEN_C; schedule?: PipeSize[]; vMax?: number
}): PipeSizingResult {
  const C = HAZEN_C[p.material ?? 'copper']
  const vMax = p.vMax ?? V_MAX
  const schedule = (p.schedule ?? COPPER_TYPE_L).filter((s) => s.idMm >= MIN_SERVICE_MM)
  for (const size of schedule) {
    const v = velocity(p.lps, size.idMm)
    const drop = frictionDrop(p.lps, size.idMm, C, p.Lm)
    if (v <= vMax && drop <= p.allowableDropKPa) {
      return { size, velocity: v, frictionDrop: drop, velocityOK: true, frictionOK: true, governedBy: 'velocity' }
    }
  }
  // none satisfy both — report the largest with the failing check flagged
  const largest = schedule[schedule.length - 1]
  if (!largest) return { size: null, velocity: Infinity, frictionDrop: Infinity, velocityOK: false, frictionOK: false, governedBy: 'none' }
  const v = velocity(p.lps, largest.idMm), drop = frictionDrop(p.lps, largest.idMm, C, p.Lm)
  return {
    size: largest, velocity: v, frictionDrop: drop,
    velocityOK: v <= vMax, frictionOK: drop <= p.allowableDropKPa,
    governedBy: drop > p.allowableDropKPa ? 'friction' : 'velocity',
  }
}

// ── Full design ────────────────────────────────────────────────────────────
export interface WaterSupplyInput {
  items: FixtureCount[]
  occupancy: Occupancy
  hunterSystem?: HunterSystem   // 'tank' (Chart A-2) or 'valve' (Chart A-3)
  designFlowLps?: number        // override the Hunter estimate with a chart value
  Lpipe: number                 // developed pipe length, m
  fittingLength: number         // equivalent length of fittings, m (Table A-2)
  riseZ: number                 // elevation of highest fixture above source, m
  pMainKPa: number              // pressure at the water main / service
  pMeterKPa: number             // pressure drop across the meter
  pFixtureKPa: number           // required residual pressure at the fixture
  material?: keyof typeof HAZEN_C
}

export interface WaterSupplyResult {
  demand: WaterDemand
  designFlowLps: number         // flow used for sizing (Hunter or override)
  designFlowGpm: number
  flowSource: 'hunter' | 'override'
  developedLength: number       // Lpipe + fittingLength, m
  staticKPa: number
  availableForFriction: number  // kPa left for friction after static + meter + residual
  allowablePer30m: number       // kPa per 30.4 m (the chart basis)
  pipe: PipeSizingResult
  ok: boolean
}

/** Method-1 building-supply sizing (RNPCP §609): available head after static
 *  lift, meter loss and the required residual is spent on friction over the
 *  developed length; the smallest pipe that fits the Hunter design flow governs. */
export function designWaterSupply(inp: WaterSupplyInput): WaterSupplyResult {
  const demand = waterDemand(inp.items, inp.occupancy)
  const flowSource: 'hunter' | 'override' = inp.designFlowLps != null ? 'override' : 'hunter'
  const designFlowLps = inp.designFlowLps ?? hunterFlowLps(demand.wsfu, inp.hunterSystem ?? 'tank')
  const developedLength = inp.Lpipe + inp.fittingLength
  const staticKPa = staticHead(inp.riseZ)
  const availableForFriction = inp.pMainKPa - (staticKPa + inp.pMeterKPa + inp.pFixtureKPa)
  const allowablePer30m = developedLength > 0 ? (availableForFriction * 30.4) / developedLength : Infinity
  const pipe = sizeSupplyPipe({
    lps: designFlowLps, Lm: developedLength,
    allowableDropKPa: Math.max(0, availableForFriction), material: inp.material,
  })
  return {
    demand, designFlowLps, designFlowGpm: lpsToGpm(designFlowLps), flowSource,
    developedLength, staticKPa, availableForFriction, allowablePer30m, pipe,
    ok: availableForFriction > 0 && pipe.frictionOK && pipe.velocityOK && !!pipe.size,
  }
}

// ── Worked solution ────────────────────────────────────────────────────────
export function waterSupplySolution(inp: WaterSupplyInput, r: WaterSupplyResult): SolutionStep[] {
  const d = r.demand
  return [
    {
      title: 'Fixture units & design flow', clause: 'RNPCP Table 6-5 / Chart A-2·A-3',
      lines: [
        { text: `Σ WSFU = ${sn0(d.wsfu)} (${inp.occupancy}). Maximum demand Σ FU × 8 = ${sn0(d.maxGpm)} gpm (upper bound).` },
        { tex: `Q_{design} = ${r.flowSource === 'override' ? '\\text{(chart)}' : `\\text{Hunter}(${sn0(d.wsfu)})`} = ${sn1(r.designFlowGpm)}\\ \\text{gpm} = ${sn3(r.designFlowLps)}\\ \\text{L/s}` },
        { text: `Hunter's curve (${inp.hunterSystem === 'valve' ? 'flush-valve, Chart A-3' : 'flush-tank, Chart A-2'}) already embeds simultaneous-use diversity.` },
      ],
    },
    {
      title: 'Available head for friction', clause: 'RNPCP §609.6',
      lines: [
        { tex: `P_{static} = \\gamma_w Z = 9.81\\times ${sn2(inp.riseZ)} = ${sn2(r.staticKPa)}\\ \\text{kPa}` },
        { tex: `\\Delta P_{avail} = P_{main} - (P_{static}+P_{meter}+P_{fixture})` },
        { tex: `= ${sn1(inp.pMainKPa)} - (${sn1(r.staticKPa)}+${sn1(inp.pMeterKPa)}+${sn1(inp.pFixtureKPa)}) = ${sn1(r.availableForFriction)}\\ \\text{kPa}` },
        { text: `Developed length L = ${sn1(inp.Lpipe)} + ${sn1(inp.fittingLength)} (fittings) = ${sn1(r.developedLength)} m; allowable ≈ ${sn1(r.allowablePer30m)} kPa per 30.4 m.` },
      ],
      pass: r.availableForFriction > 0,
    },
    {
      title: 'Pipe size (Hazen-Williams friction + velocity cap)', clause: 'RNPCP Chart A-4…A-7',
      lines: r.pipe.size ? [
        { text: `Smallest ${inp.material ?? 'copper'} pipe (C = ${HAZEN_C[inp.material ?? 'copper']}) meeting both limits: ${r.pipe.size.label} (${sn1(r.pipe.size.idMm)} mm ID).` },
        { tex: `v = \\dfrac{4000\\,Q}{\\pi D^2} = ${sn2(r.pipe.velocity)}\\ \\text{m/s}\\ (\\le ${sn1(V_MAX)})` },
        { tex: `\\Delta P_{friction} = ${sn1(r.pipe.frictionDrop)}\\ \\text{kPa} \\le ${sn1(Math.max(0, r.availableForFriction))}\\ \\text{kPa}` },
      ] : [{ text: 'No schedule pipe satisfies both the head and velocity limits — increase available pressure or shorten the run.' }],
      pass: r.ok,
      note: `Minimum building-service pipe is 19 mm (¾"). Velocity target ${sn1(V_TARGET)} m/s, max ${sn1(V_MAX)} m/s.`,
    },
  ]
}

// re-export for the page
export { sn0, sn1, sn2, sn3 }
