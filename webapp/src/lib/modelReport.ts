// Assembles the Model Space design results into a renderer-agnostic report
// payload for the direct-PDF export (lib/modelPdf.ts): overall verdict, design
// summary checks, schedule tables and EVERY member's worked solution, reusing
// the same step builders the on-screen schedules use. Presentation only — all
// numbers come from the pipeline's StructureDesign rows.
import type { StructuralModel, RectSection, Node } from '../engine/model'
import type {
  StructureDesign, SoilOptions,
  SteelBeamScheduleRow, SteelColumnScheduleRow,
  OptimizeResult,
} from '../engine/pipeline'
import { designOK } from '../engine/pipeline'
import { appliedResultant, type F3Analysis } from '../engine/frame3d'
import type { ModalResult } from '../engine/modal'
import type { PushoverModelResult } from '../engine/pushoverModel'
import type { BiaxialPushoverResult } from '../engine/biaxialFrameModel'
import type { DriftRow } from '../engine/seismic'
import type { NonlinearModelResult } from '../engine/nonlinearModel'
import type { NonlinearFrameModelResult } from '../engine/nonlinearFrameModel'
import type { IrregularityFlag } from '../engine/irregularity'
import type { BeamRatioRow } from '../engine/cageBuilder'
import { beamSectionSolution, columnRowSolution, footingRowSolution, combinedRowSolution,
  woodBeamRowSolution, woodColumnRowSolution, woodSlabRowSolution } from './modelSpaceSolutions'
import { connectionRowSolution } from './connectionSolution'
import { buildPrestressedSolution } from './prestressedSolution'
import type { SolutionStep, SolutionLine } from './solution'

export interface ReportStat { label: string; value: string; unit?: string }
export interface ReportCheck { name: string; detail: string; ratio: number | null; ok: boolean }
export interface ReportTable { title: string; head: string[]; rows: string[][]; right?: number[] }
/** Cross-section geometry for a member, drawn (vector) in the PDF report so the
 *  reader can see the bar layout in the section. */
export interface ReportSection {
  kind: 'beam' | 'column'
  b: number; h: number; cover: number; barDia: number; stirrupDia: number
  bars: number
  layers?: number[]         // beam: tension bars per layer (bottom-first)
  comprLayers?: number[]    // beam: compression bars per layer (top-first)
  hogging?: boolean         // beam: tension steel at the top
  bf?: number; hf?: number  // beam: T-flange (sagging flanged section)
  /** beam: the flange projects on ONE side only — Table 406.3.2.1's edge row,
   *  an L (spandrel) rather than a symmetric T. */
  edge?: boolean
  fourFace?: boolean        // column: bars distributed on all four faces
  legs?: number             // stirrup legs: 2 perimeter + interior crossties
}
export interface ReportSolution {
  title: string; sub?: string; steps: SolutionStep[]; section?: ReportSection
  details?: string          // demand summary (Mu/Vu for beams, Pu/Mu for columns)
  loc?: string              // plan grid line + floor the member sits on
}
export interface ReportGroup { title: string; items: ReportSolution[] }

// ── Workflow payloads ────────────────────────────────────────────────────────
// Every field below is OPTIONAL on ModelReport and is populated only when the
// corresponding engine state actually exists — the PDF prints a section only
// when its payload is present, and every number in it comes from the engine
// (spec data-integrity rules: nothing invented, nothing hardcoded).

/** One ✓/—/✗ line of the executive summary's status panels. `ok === null`
 *  means the analysis was not run / not applicable — never rendered as PASS. */
export interface ReportExecStatus { label: string; ok: boolean | null; note?: string }
export interface ReportExec {
  analysis: ReportExecStatus[]
  design: ReportExecStatus[]
  optimization: ReportExecStatus | null
}
/** Statics self-check on one load-case run: ΣApplied vs ΣReactions (kN). */
export interface ReportEquilibrium {
  combo: string
  applied: [number, number, number]
  reacted: [number, number, number]
  residPct: number
  ok: boolean
}
export interface ReportLinear {
  runs: number
  skipped: number
  governingCombo: string
  equilibrium: ReportEquilibrium | null
  worstResidPct: number | null
  /** Governing-run support reactions (full table; report body). */
  reactions: ReportTable | null
  /** Per-level peak displacements, governing run (mm). */
  displacements: ReportTable | null
  /** Design-connected governing forces — one row per designed member, straight
   *  from the schedule rows (which carry each member's governing case). */
  governingForces: ReportTable | null
  /** Full member force envelopes across every run (appendix). */
  memberEnvelope: ReportTable | null
}
export interface ReportModal {
  modes: number
  table: ReportTable
  totalMass: [number, number, number]
  coverage: [number, number, number]
}
export interface ReportNonlinear {
  source: string
  period: number | null
  converged: boolean
  maxIterations: number | null
  worstResidual: number | null
  ductility: number | null
  yieldedHinges: number | null
  totalDissipated: number | null
  peakBaseShear: number | null
  peakDisp: number | null
}
export interface ReportPushover {
  controlNode: string
  totalHeight: number
  pmInteraction: boolean
  pDelta: boolean
  events: number
  mechanism: boolean
  /** Capacity curve, x = control-node displacement (mm), y = base shear (kN). */
  curve: { x: number; y: number }[]
  hingeTable: ReportTable
  hingeOverflow: ReportTable | null   // when the hinge list exceeds the body cap
}
export interface ReportBiaxial {
  table: ReportTable
  skewPushover: {
    angleDeg: number
    controlDir: string
    curve: { x: number; y: number }[]
    peakShear: number
    yieldedHinges: number
  } | null
}
export interface ReportOptimization {
  converged: boolean
  stopReason?: string
  steps: ReportTable
  /** Initial vs final per changed element, with the final governing utilisation. */
  initialVsFinal: ReportTable
  /** The optimizer's ACTUAL staged objective, in words the code backs. */
  objective: string[]
  totals: { label: string; before: string; after: string }[]
}
/** One member's analysis → design → schedule chain (spec §12). */
export interface ReportTrace {
  member: string
  kind: 'beam' | 'column'
  loc?: string
  combo?: string
  demand: string
  required: string
  provided: string
  util?: number
  ok?: boolean
}
export interface ReportGoverning { table: ReportTable }
export interface ReportStatus {
  check: string
  status: 'PASS' | 'FAIL' | 'NOT RUN' | 'PARTIAL' | 'COMPLETE' | 'STOPPED'
  detail?: string
}
export interface ReportAppendix { letter: string; title: string; tables: ReportTable[] }

/** The analysis/optimization states the caller threads in (all optional — a
 *  section is only built from state that exists). */
export interface ModelReportExtras {
  analysis?: F3Analysis | null
  /** Bridge node order, for mapping the displacement vector back to nodes.
   *  Must be the SAME bridge the analysis ran on — guarded by length. */
  nodeOrder?: { id: string; y: number }[] | null
  modal?: ModalResult | null
  po?: PushoverModelResult | null
  bx?: BiaxialPushoverResult | null
  nl?: { inelastic: NonlinearModelResult | null; elastic: NonlinearModelResult | null } | null
  nlHinge?: { inelastic: NonlinearFrameModelResult | null; elastic: NonlinearFrameModelResult | null } | null
  drift?: DriftRow[] | null
  opt?: OptimizeResult | null
  tryBars?: boolean
}

export interface ModelReport {
  ok: boolean
  governing: string
  stats: ReportStat[]
  checks: ReportCheck[]
  props: [string, string][]
  tables: ReportTable[]
  groups: ReportGroup[]
  /** Workflow sections — present only when their engine state was supplied. */
  exec?: ReportExec
  linear?: ReportLinear
  modal?: ReportModal
  nonlinear?: ReportNonlinear
  pushover?: ReportPushover
  biaxial?: ReportBiaxial
  optimization?: ReportOptimization
  trace?: ReportTrace[]
  governingSummary?: ReportGoverning
  status?: ReportStatus[]
  appendices?: ReportAppendix[]
}

const f0 = (v: number) => v.toFixed(0)
const f1 = (v: number) => v.toFixed(1)
const f2 = (v: number) => v.toFixed(2)
const txt = (text: string): SolutionLine => ({ text })

// ── Steel worked "solutions" from the stored row detail ──────────────────────
// The steel schedule rows carry every intermediate §F2/§G2.1/§E3/§H1-1 value;
// these steps just narrate them (no re-calculation).
export function steelBeamRowSolution(r: SteelBeamScheduleRow): SolutionStep[] {
  return [
    { title: `Section ${r.shape}`, clause: 'AISC 360-16', lines: [
      txt(`d = ${f0(r.d)} mm · bf = ${f0(r.bf)} mm · tf = ${f1(r.tf)} mm · tw = ${f1(r.tw)} mm`),
      txt(`Ix = ${(r.Ix / 1e6).toFixed(1)}×10⁶ mm⁴ · Sx = ${(r.Sx / 1e3).toFixed(0)}×10³ mm³ · Zx = ${(r.Zx / 1e3).toFixed(0)}×10³ mm³ · ry = ${f1(r.ry)} mm`),
      txt(`Classification (Table B4.1b): flange λ = ${f1(r.lambdaF)} vs λp = ${f1(r.lambdaPF)}, λr = ${f1(r.lambdaRF)} → ${r.flangeClass}; web λ = ${f1(r.lambdaW)} vs λp = ${f1(r.lambdaPW)}, λr = ${f1(r.lambdaRW)} → ${r.webClass}  ⇒ §${r.clause}`),
    ] },
    { title: `Flexure — §${r.clause}`, clause: `AISC 360-16 §${r.clause}`, pass: r.utilM <= 1, lines: [
      txt(`Mp = ${f1(r.Mp)} kN·m · Lp = ${f2(r.Lp / 1000)} m · Lr = ${f2(r.Lr / 1000)} m · Lb = ${f2(r.Lb / 1000)} m → ${r.ltbZone}`),
      // §F3 takes the LESSER of LTB and flange local buckling; a compact flange
      // has no FLB limit state, so only the reduced case is worth printing.
      ...(Number.isFinite(r.MnFLB) ? [txt(`Flange local buckling (§F3.2): Mn = ${f1(r.MnFLB)} kN·m — ${r.flangeClass} flange`)] : []),
      txt(`Mn = ${f1(r.Mn)} kN·m (${r.governing} governs) → φMn = 0.90·Mn = ${f1(r.phiMn)} kN·m`),
      txt(`Mu = ${f1(r.Mu)} kN·m ≤ φMn = ${f1(r.phiMn)} kN·m → util ${f2(r.utilM)} ${r.utilM <= 1 ? '✓' : '✗'}`),
    ] },
    { title: 'Shear', clause: 'AISC 360-16 §G2.1', pass: r.utilV <= 1, lines: [
      txt(`Aw = d·tw = ${f0(r.Aw)} mm² · h/tw = ${f1(r.hwTw)} → Cv1 = ${f2(r.Cv1)} · φv = ${f2(r.phiV)}`),
      txt(`φVn = φv·0.6·Fy·Aw·Cv1 = ${f1(r.phiVn)} kN ≥ Vu = ${f1(r.Vu)} kN → util ${f2(r.utilV)} ${r.utilV <= 1 ? '✓' : '✗'}`),
    ] },
    { title: 'Deflection (SS bound)', clause: 'L/240', pass: r.deflOK, lines: [
      txt(`δ ≈ 5·Mu·L²/48EI = ${f1(r.defl)} mm ≤ L/240 = ${f1(r.deflLim)} mm ${r.deflOK ? '✓' : '✗'}`),
    ] },
  ]
}

export function steelColumnRowSolution(r: SteelColumnScheduleRow): SolutionStep[] {
  return [
    { title: `Section ${r.shape}`, clause: 'AISC 360-16', lines: [
      txt(`A = ${f0(r.A)} mm² · rx = ${f1(r.rx)} mm · ry = ${f1(r.ry)} mm · L = ${f2(r.L)} m (K = 1.0)`),
    ] },
    { title: 'Axial — flexural buckling', clause: 'AISC 360-16 §E3', pass: r.Pu <= r.phiPn, lines: [
      txt(`KL/r: x = ${f1(r.slendernessX)} · y = ${f1(r.slendernessY)} → governing ${f1(r.slenderness)}`),
      txt(`Fe = π²E/(KL/r)² = ${f1(r.Fe)} MPa → Fcr = ${f1(r.Fcr)} MPa`),
      txt(`φPn = 0.90·Fcr·A = ${f1(r.phiPn)} kN ≥ Pu = ${f1(r.Pu)} kN ${r.Pu <= r.phiPn ? '✓' : '✗'}`),
    ] },
    { title: 'Combined axial + flexure', clause: 'AISC 360-16 §H1-1', pass: r.ok, lines: [
      txt(`Mu = ${f1(r.Mu)} kN·m · φMn = ${f1(r.phiMn)} kN·m · equation ${r.equation}`),
      txt(`Interaction ratio = ${f2(r.ratio)} ≤ 1.00 ${r.ok ? '✓' : '✗'}`),
    ] },
  ]
}

// ── Payload assembly ──────────────────────────────────────────────────────────
export function buildModelReport(
  model: StructuralModel, design: StructureDesign, props: [string, string][], soil: SoilOptions,
  irregular?: IrregularityFlag[] | null,
  /** §418.6.3.2/§418.4.2.2 moment-strength ratios, measured on the placed
   *  cages (`structureMomentRatios`). Omitted → the section is left out, which
   *  is also what a gravity design gets. */
  ratios?: BeamRatioRow[] | null,
  /** Analysis / modal / nonlinear / pushover / biaxial / optimizer states.
   *  Every workflow section is built ONLY from state present here — omitted
   *  state means the section is left out, never stubbed with placeholders. */
  extras?: ModelReportExtras,
): ModelReport {
  const sectionFor = (memberId: string): RectSection | undefined => {
    const m = model.members.find((x) => x.id === memberId)
    return m ? model.sections.find((s) => s.id === m.section) : undefined
  }
  const colSectionAt = (node: string): RectSection | undefined => {
    const c = model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
    return c ? sectionFor(c.id) : undefined
  }
  const fallbackSec = model.sections[0]

  // ── Plan grid + floor locator ──
  // A/B/C column lines from unique X coords, 1/2/3 rows from unique Z coords,
  // floor from the nearest storey elevation (n.y is the vertical axis, m).
  const uniqAxis = (vals: number[]): number[] => {
    const out: number[] = []
    for (const v of vals.slice().sort((a, b) => a - b))
      if (!out.length || Math.abs(v - out[out.length - 1]) > 0.05) out.push(v)
    return out
  }
  const xs = uniqAxis(model.nodes.map((n) => n.x))
  const zs = uniqAxis(model.nodes.map((n) => n.z))
  const nearestIdx = (arr: number[], v: number) =>
    arr.reduce((best, c, i) => (Math.abs(c - v) < Math.abs(arr[best] - v) ? i : best), 0)
  const grid = (n: Node) => `${String.fromCharCode(65 + nearestIdx(xs, n.x))}${nearestIdx(zs, n.z) + 1}`
  const floorAt = (yy: number) =>
    model.storeys.length
      ? model.storeys.reduce((b, s) => (Math.abs(s.elevation - yy) < Math.abs(b.elevation - yy) ? s : b)).name
      : `El. ${f2(yy)} m`
  const memberLoc = (memberId: string): string | undefined => {
    const m = model.members.find((x) => x.id === memberId)
    if (!m) return undefined
    const ni = model.nodes.find((n) => n.id === m.i)
    const nj = model.nodes.find((n) => n.id === m.j)
    if (!ni || !nj) return undefined
    if (m.role === 'column') {
      const lo = ni.y <= nj.y ? ni : nj, hi = ni.y <= nj.y ? nj : ni
      const a = floorAt(lo.y), b = floorAt(hi.y)
      return `${grid(lo)} · ${a === b ? a : `${a}→${b}`}`
    }
    const g = grid(ni) === grid(nj) ? grid(ni) : `${grid(ni)}–${grid(nj)}`
    return `${floorAt(Math.max(ni.y, nj.y))} · ${g}`
  }

  // ── Design-summary checks (group verdicts + governing ratios) ──
  const checks: ReportCheck[] = []
  const worst = <T,>(rows: T[], ratio: (r: T) => number): { r: number; row: T } | null =>
    rows.length ? rows.map((row) => ({ r: ratio(row), row })).reduce((a, b) => (b.r > a.r ? b : a)) : null
  if (design.beams.length) {
    const bad = design.beams.filter((b) => !b.ok).length
    checks.push({ name: 'RC beams & girders', detail: `${design.beams.length} members · ${design.beams.reduce((s, b) => s + b.sections.length, 0)} critical sections${bad ? ` · ${bad} failing` : ''}`, ratio: null, ok: bad === 0 })
  }
  // §424.2 computed deflection, where the service solves made it available.
  // §409.3.1.1 lets a member skip the calculation when h ≥ hMin, so a computed
  // exceedance is only a FAILURE for a member that is also below hMin.
  const withDefl = design.beams.filter((b) => b.deflection)
  if (withDefl.length) {
    const w = worst(withDefl, (b) => b.deflection!.deltaTotal / Math.max(b.deflection!.limitL240, 1e-9))!
    const failing = withDefl.filter((b) => !b.thickOK && !(b.deflection!.liveOK && b.deflection!.totalOK))
    checks.push({
      name: 'RC beam serviceability (§424.2)',
      detail: `${withDefl.length} members · governing ${w.row.id} at δtotal/(L/240) = ${f2(w.r)}`
        + `${failing.length ? ` · ${failing.length} exceeding` : ''}`,
      ratio: w.r, ok: failing.length === 0,
    })
  }
  if (design.columns.length) {
    const w = worst(design.columns, (c) => c.util)!
    checks.push({ name: 'RC columns', detail: `${design.columns.length} members · governing ${w.row.id}`, ratio: w.r, ok: design.columns.every((c) => c.ok) })
  }
  if (design.scwb.length) {
    const w = design.scwb.reduce((a, b) => (b.ratio < a.ratio ? b : a))
    checks.push({ name: 'Strong column / weak beam', detail: `${design.scwb.length} joints · min ΣMnc/ΣMnb = ${f2(w.ratio)} at ${w.node} (≥ 1.20)`, ratio: null, ok: design.scwb.every((j) => j.ok) })
  }
  if (ratios && ratios.length) {
    // The tightest of every check on every beam — the one bar count that came
    // closest to breaking the strength envelope the system requires.
    const all = ratios.flatMap((r) => r.ratios.checks
      .filter((c) => c.required > 0).map((c) => ({ id: r.id, u: c.provided / c.required, c })))
    const w = all.reduce((a, b) => (b.u < a.u ? b : a))
    const failing = ratios.filter((r) => !r.ratios.ok)
    checks.push({
      name: `Beam moment-strength ratios (${ratios[0].ratios.clause})`,
      detail: `${ratios.length} beams · tightest ${w.c.rule} at ${w.id} ${w.c.where}`
        + ` (${f1(w.c.provided)} / ${f1(w.c.required)} kN·m)`
        + `${failing.length ? ` · ${failing.length} failing` : ''}`,
      ratio: w.u > 0 ? 1 / w.u : null, ok: failing.length === 0,
    })
  }
  if (design.slabs.length)
    checks.push({ name: 'Slabs (DDM)', detail: `${design.slabs.length} panels`, ratio: null, ok: design.slabs.every((s) => s.ok) })
  if (design.woodSlabs.length) {
    const w = worst(design.woodSlabs, (s) => s.design.ratio)!
    checks.push({ name: 'Timber deck slabs (NDS §3)', detail: `${design.woodSlabs.length} panels · governing ${w.row.plate}`, ratio: w.r, ok: design.woodSlabs.every((s) => s.ok) })
  }
  if (design.walls.length) {
    const w = worst(design.walls, (x) => (x.design.phiVn > 0 ? x.Vu / x.design.phiVn : 99))!
    checks.push({ name: 'Shear walls', detail: `${design.walls.length} walls · governing ${w.row.id}`, ratio: w.r, ok: design.walls.every((x) => x.ok) })
  }
  if (design.steelBeams.length) {
    const w = worst(design.steelBeams, (b) => Math.max(b.utilM, b.utilV))!
    checks.push({ name: 'Steel beams & girders', detail: `${design.steelBeams.length} members · governing ${w.row.id}`, ratio: w.r, ok: design.steelBeams.every((b) => b.ok) })
  }
  if (design.steelColumns.length) {
    const w = worst(design.steelColumns, (c) => c.ratio)!
    checks.push({ name: 'Steel columns (§H1-1)', detail: `${design.steelColumns.length} members · governing ${w.row.id}`, ratio: w.r, ok: design.steelColumns.every((c) => c.ok) })
  }
  if (design.woodBeams.length) {
    const w = worst(design.woodBeams, (b) => Math.max(b.utilM, b.utilV))!
    checks.push({ name: 'Timber beams & girders (NDS §3)', detail: `${design.woodBeams.length} members · governing ${w.row.id}`, ratio: w.r, ok: design.woodBeams.every((b) => b.ok) })
  }
  if (design.woodColumns.length) {
    const w = worst(design.woodColumns, (c) => c.ratio)!
    checks.push({ name: 'Timber columns (NDS §3.9)', detail: `${design.woodColumns.length} members · governing ${w.row.id}`, ratio: w.r, ok: design.woodColumns.every((c) => c.ok) })
  }
  if (design.basePlates.length) {
    const w = worst(design.basePlates, (p) => p.design.bearingUtil)!
    checks.push({ name: 'Base plates', detail: `${design.basePlates.length} plates · governing ${w.row.node}`, ratio: w.r, ok: design.basePlates.every((p) => p.ok) })
  }
  const nConn = design.joints.reduce((s, j) => s + j.connections.length, 0)
    + design.beamJoints.reduce((s, j) => s + j.connections.length, 0)
  if (nConn)
    checks.push({ name: 'Steel connections', detail: `${nConn} connections at ${design.joints.length + design.beamJoints.length} joints`, ratio: null, ok: design.joints.every((j) => j.ok) && design.beamJoints.every((j) => j.ok) })
  if (design.prestressed.length) {
    const w = worst(design.prestressed, (p) => p.design.Mu / Math.max(p.design.phiMn, 1e-9))!
    checks.push({ name: 'Prestressed members', detail: `${design.prestressed.length} members · governing ${w.row.id}`, ratio: w.r, ok: design.prestressed.every((p) => p.ok) })
  }
  if (design.footings.length)
    checks.push({ name: 'Isolated footings', detail: `${design.footings.length} footings`, ratio: null, ok: design.footings.every((f) => f.ok) })
  if (design.combined.length)
    checks.push({ name: 'Combined footings', detail: `${design.combined.length} pairs`, ratio: null, ok: design.combined.every((c) => c.ok) })
  if (design.unchecked.length)
    checks.push({ name: 'Unchecked members', detail: design.unchecked.map((u) => `${u.id} (${u.shape})`).join(', '), ratio: null, ok: false })
  if (design.pDeltaIssues.length)
    checks.push({ name: 'P-Δ convergence', detail: `failed: ${design.pDeltaIssues.join(', ')}`, ratio: null, ok: false })
  // seismic regularity (advisory — does not gate designOK; irregular structures
  // are permitted but trigger the code's added detailing/analysis requirements)
  if (irregular)
    checks.push({
      name: 'Seismic regularity (NSCP 208-9/10)',
      detail: irregular.length === 0
        ? 'Regular — torsional, soft-storey, mass & vertical-geometric checks all pass'
        : irregular.map((f) => `${f.code} ${f.name.toLowerCase()}${f.elevation != null ? ` @ EL ${f2(f.elevation)} m` : ''}`).join('; '),
      ratio: null, ok: irregular.length === 0,
    })

  const ok = designOK(design)
  const withRatio = checks.filter((c) => c.ratio !== null)
  const govCheck = withRatio.length ? withRatio.reduce((a, b) => (b.ratio! > a.ratio! ? b : a)) : null
  const governing = ok
    ? `All checks pass · envelope of ${design.cases.length} load cases${govCheck ? ` · peak utilization ${f2(govCheck.ratio!)} (${govCheck.name})` : ''}`
    : `${checks.filter((c) => !c.ok).map((c) => c.name).join(', ')} — see design summary`

  const stats: ReportStat[] = [
    { label: 'Load cases', value: String(design.cases.length) },
    { label: 'Members checked', value: String(design.beams.length + design.columns.length + design.steelBeams.length + design.steelColumns.length + design.woodBeams.length + design.woodColumns.length) },
    { label: 'Concrete', value: f1(design.totals.concrete), unit: 'm³' },
    ...(design.totals.steelKg > 0 ? [{ label: 'Steel', value: f2(design.totals.steelKg / 1000), unit: 't' }] : []),
    ...(design.totals.woodVolume > 0 ? [{ label: 'Timber', value: f2(design.totals.woodVolume), unit: 'm³' }] : []),
    { label: 'Footings', value: String(design.footings.length + design.combined.length) },
    { label: 'Governing combo', value: design.govName },
  ]

  // ── Schedule tables (mirror the on-screen schedules) ──
  const tables: ReportTable[] = []
  if (design.beams.length) tables.push({
    title: 'RC beam & girder schedule',
    head: ['Member', 'Section', 'Mu (kN·m)', 'Vu (kN)', 'Mode', 'Tension', 'Stirrups', 'Case'],
    right: [2, 3],
    rows: design.beams.flatMap((bm) => {
      const sec = sectionFor(bm.id)
      return bm.sections.map((s, k) => {
        const d = s.design
        return [
          k === 0 ? `${bm.id} (${bm.role} ${sec?.name ?? ''}, ${f1(bm.L)} m)` : '',
          `${s.label}${s.hogging ? ' (hog)' : s.bf
            ? ` · ${s.flangeKind ?? 'T'}${s.design.flangeAction === 'true-T' ? '(true)' : ''} bf=${Math.round(s.bf)}` : ''}`,
          f1(Math.abs(s.Mu)), f1(s.Vu), d.mode,
          `${d.bars}⌀${sec?.barDia}${d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}${s.hogging ? ' top' : ''}`,
          // A HOGGING section is in the 2h hinge zone, so the spacing it is
          // built at is `sHinge` — `sAdopt` capped by §418.6.4.4 / §418.4.2.4.
          // Reporting `sAdopt` there printed @220 in the schedule while the
          // cage laid the hoops at @110, which is the schedule disagreeing
          // with the drawing about the same bar.
          ((): string => {
            const sp = s.hogging ? d.sHinge : d.sAdopt
            return sp > 0 ? `${d.legs}L-⌀${sec?.tieDia}@${Math.round(sp)}` : d.region === 'none' ? 'none' : '⚠'
          })(),
          k === 0 ? (bm.gov ?? '') : '',
        ]
      })
    }),
  })
  if (withDefl.length) tables.push({
    title: 'RC beam serviceability — NSCP §424.2 computed deflection',
    head: ['Member', 'Span (m)', 'Support', 'Ie/Ig', 'δ dead (mm)', 'λΔ·δD (mm)', 'δ live (mm)', 'δ total (mm)', 'L/240 (mm)', 'h ≥ hmin', 'Verdict'],
    right: [1, 3, 4, 5, 6, 7, 8],
    rows: withDefl.map((bm) => {
      const r = bm.deflection!
      const within = r.liveOK && r.totalOK
      return [
        bm.id, f1(bm.L), r.support,
        f2(r.Ie / r.Ig), f2(r.deltaD), f2(r.deltaLong), f2(r.deltaL), f2(r.deltaTotal), f1(r.limitL240),
        r.hMinOK ? `yes (${f0(r.hMin)})` : `no (${f0(r.hMin)})`,
        within ? 'within limits' : r.hMinOK ? 'deemed to comply (§409.3.1.1)' : 'EXCEEDS',
      ]
    }),
  })
  if (design.columns.length) tables.push({
    title: 'RC column schedule',
    head: ['Column', 'Section', 'Pu (kN)', 'Mu (kN·m)', 'Bars / ties', 'Util', 'Case'],
    right: [2, 3, 5],
    rows: design.columns.map((c) => {
      const cs = sectionFor(c.id)
      return [c.id, cs?.name ?? '', f1(c.Pu), f1(c.Mu),
        `${c.bars}⌀${cs?.barDia} · ties @${Math.round(c.tieSpacingFinal)}${c.seismicSConf !== undefined ? ' (seismic)' : ''}`,
        `${(c.util * 100).toFixed(0)}%`, c.gov ?? '']
    }),
  })
  if (design.prestressed.length) tables.push({
    title: 'Prestressed member checks (§24.5 · PCI losses)',
    head: ['Member', 'L (m)', 'Loss %', 'fse (MPa)', 'Transfer', 'Service', 'φMn (kN·m)', 'Mu', '1.2Mcr', 'Status'],
    right: [1, 2, 3, 6, 7],
    rows: design.prestressed.map((p) => [p.id, f2(p.L), p.design.lossPct.toFixed(1), f1(p.design.fse),
      p.design.transferOK ? 'PASS' : 'FAIL', p.design.serviceOK ? 'PASS' : 'FAIL',
      f1(p.design.phiMn), f1(p.design.Mu), p.design.crackingOK ? 'PASS' : 'FAIL', p.ok ? 'PASS' : 'FAIL']),
  })
  if (ratios && ratios.length) tables.push({
    title: `Beam moment-strength ratios (NSCP ${ratios[0].ratios.clause})`,
    head: ['Beam', 'Ln (m)', 'Mn− face i', 'Mn+ face i', 'Mn− face j', 'Mn+ face j',
      'min Mn along', 'Status'],
    right: [1, 2, 3, 4, 5, 6],
    rows: ratios.map((r) => {
      const st = r.ratios.stations
      const a = st[0], z = st[st.length - 1]
      const along = Math.min(...st.flatMap((x) => [x.MnNeg, x.MnPos]))
      return [r.id, f2(r.Ln), f1(a.MnNeg), f1(a.MnPos), f1(z.MnNeg), f1(z.MnPos),
        f1(along), r.ratios.ok ? 'PASS' : 'FAIL']
    }),
  })
  if (design.scwb.length) tables.push({
    title: 'Strong-column / weak-beam joints (NSCP §418.7.3.2)',
    head: ['Joint', 'Cols', 'Beams', 'ΣMnc (kN·m)', 'ΣMnb (kN·m)', 'Ratio', 'Status'],
    right: [3, 4, 5],
    rows: design.scwb.map((j) => [j.node, String(j.nCols), String(j.nBeams), f1(j.sumMnc), f1(j.sumMnb), f2(j.ratio), j.ok ? 'PASS' : 'FAIL']),
  })
  if (design.slabs.length) tables.push({
    title: 'Slab schedule (DDM)',
    head: ['Panel', 'lx × ly (m)', 'h (mm)', 'wu (kPa)', 'System', 'Status'],
    right: [2, 3],
    rows: design.slabs.map((s) => [s.plate, `${f2(s.lx)} × ${f2(s.ly)}`, f0(s.design.h), f2(s.design.wu),
      s.design.twoWay ? 'two-way' : 'one-way', s.ok ? 'PASS' : 'FAIL']),
  })
  if (design.woodSlabs.length) tables.push({
    title: 'Timber deck slab schedule (NDS §3 / NSCP §6)',
    head: ['Panel', 'Span (m)', 'Species', 'Joists', 'Deck t (mm)', 'Deck util', 'Joist util', 'Bd·ft', 'Status'],
    right: [1, 4, 5, 6, 7],
    rows: design.woodSlabs.map((s) => [s.plate, f2(s.design.joist.span), s.species,
      `${s.design.takeoff.joistCount}·${f0(s.design.joist.b)}×${f0(s.design.joist.d)}`, f0(s.design.deck.d),
      f2(s.design.deck.ratio), f2(s.design.joist.ratio),
      f0(s.design.takeoff.joistBoardFeet + s.design.takeoff.deckBoardFeet), s.ok ? 'PASS' : 'FAIL']),
  })
  if (design.walls.length) tables.push({
    title: 'Shear wall schedule',
    head: ['Wall', 'ℓw × hw × t (m·m·mm)', 'Vu (kN)', 'φVn (kN)', 'ρt horiz', 'ρℓ vert', 'Status'],
    right: [2, 3],
    rows: design.walls.map((w) => [w.id, `${f2(w.lw)} × ${f2(w.hw)} × ${f0(w.thickness)}`, f1(w.Vu), f1(w.design.phiVn),
      `ρ ${w.design.horiz.rho.toFixed(4)} @${Math.round(w.design.horiz.spacing)}`, `ρ ${w.design.vert.rho.toFixed(4)} @${Math.round(w.design.vert.spacing)}`,
      w.ok ? 'PASS' : 'FAIL']),
  })
  if (design.steelBeams.length) tables.push({
    title: 'Steel beam & girder schedule (AISC 360-16)',
    head: ['Member', 'Shape', 'L (m)', 'Mu (kN·m)', 'φMn', 'Zone', 'Vu (kN)', 'φVn', 'Util', 'Case'],
    right: [2, 3, 4, 6, 7, 8],
    rows: design.steelBeams.map((b) => [b.id, b.shape, f2(b.L), f1(b.Mu), f1(b.phiMn), b.ltbZone,
      f1(b.Vu), f1(b.phiVn), f2(Math.max(b.utilM, b.utilV)), b.gov ?? '']),
  })
  if (design.steelColumns.length) tables.push({
    title: 'Steel column schedule (AISC 360-16)',
    head: ['Member', 'Shape', 'L (m)', 'Pu (kN)', 'φPn', 'Mu (kN·m)', 'φMn', 'KL/r', '§H1-1', 'Case'],
    right: [2, 3, 4, 5, 6, 7, 8],
    rows: design.steelColumns.map((c) => [c.id, c.shape, f2(c.L), f1(c.Pu), f1(c.phiPn), f1(c.Mu), f1(c.phiMn),
      f1(c.slenderness), f2(c.ratio), c.gov ?? '']),
  })
  if (design.woodBeams.length) tables.push({
    title: 'Timber beam & girder schedule (NDS §3 / NSCP §6)',
    head: ['Member', 'Section', 'Species', 'L (m)', 'Mu (kN·m)', 'f_b/F′b', 'Vu (kN)', 'f_v/F′v', 'Util', 'Status'],
    right: [3, 4, 5, 6, 7, 8],
    rows: design.woodBeams.map((b) => [b.id, `${f0(b.b)}×${f0(b.d)}`, `${b.species || '—'} (${b.kind})`, f2(b.L),
      f1(b.Mu), `${f2(b.fb)}/${f2(b.FbPrime)}`, f1(b.Vu), `${f2(b.fv)}/${f2(b.FvPrime)}`,
      f2(Math.max(b.utilM, b.utilV)), b.ok ? 'PASS' : 'FAIL']),
  })
  if (design.woodColumns.length) tables.push({
    title: 'Timber column schedule (NDS §3.7 / §3.9)',
    head: ['Member', 'Section', 'Species', 'L (m)', 'Pu (kN)', 'f_c/F′c', 'C_P', 'Mu (kN·m)', 'Ratio', 'Status'],
    right: [3, 4, 5, 6, 7, 8],
    rows: design.woodColumns.map((c) => [c.id, `${f0(c.b)}×${f0(c.d)}`, `${c.species || '—'} (${c.kind})`, f2(c.L),
      f1(c.Pu), `${f2(c.fc)}/${f2(c.FcPrime)}`, f2(c.CP), f1(c.Mu), f2(c.ratio), c.ok ? 'PASS' : 'FAIL']),
  })
  if (design.basePlates.length) tables.push({
    title: 'Base plate schedule',
    head: ['Node', 'Shape', 'Pu (kN)', 'Plate N × B × t (mm)', 'Bearing util', 'Status'],
    right: [2, 4],
    rows: design.basePlates.map((p) => [p.node, p.shape, f1(p.Pu),
      `${f0(p.design.N)} × ${f0(p.design.B)} × ${f0(p.tAdopt)}`, f2(p.design.bearingUtil), p.ok ? 'PASS' : 'FAIL']),
  })
  const connRows: string[][] = [
    ...design.joints.flatMap((j) => j.connections.map((c) => [j.nodeId, `${j.columnId} (${j.columnShape} ${c.faceType})`,
      c.beamId, c.connType, f1(c.Vu), `${c.bolts.n}⌀${c.bolts.dia}`, `${c.tab.t}×${c.tab.wMm}×${c.tab.hMm}`, c.ok ? 'PASS' : 'FAIL'])),
    ...design.beamJoints.flatMap((j) => j.connections.map((c) => [j.nodeId, `${j.girderId} (${j.girderShape} web)`,
      c.beamId, c.connType, f1(c.Vu), `${c.bolts.n}⌀${c.bolts.dia}`, `${c.tab.t}×${c.tab.wMm}×${c.tab.hMm}`, c.ok ? 'PASS' : 'FAIL'])),
  ]
  if (connRows.length) tables.push({
    title: 'Steel connection schedule',
    head: ['Node', 'Support', 'Beam', 'Type', 'Vu (kN)', 'Bolts', 'Plate (mm)', 'Status'],
    right: [4],
    rows: connRows,
  })
  if (design.footings.length) tables.push({
    title: 'Isolated footing schedule',
    head: ['Node', 'P (kN)', 'Pu (kN)', 'B (m)', 'Dc (mm)', 'Reinforcement', 'Status'],
    right: [1, 2, 3, 4],
    rows: design.footings.map((f) => {
      return [f.node, f0(f.P), f0(f.Pu), f2(f.design.B), f0(f.design.Dc),
        `${f.design.bars}⌀${f.barDia}@${Math.round(f.design.barSpacing)} e.w.`, f.ok ? 'PASS' : 'FAIL']
    }),
  })
  if (design.combined.length) tables.push({
    title: 'Combined footing schedule',
    head: ['Nodes', 'Shape', 'Spacing (m)', 'Bx (m)', 'By (m)', 'Dc (mm)', 'Status'],
    right: [2, 3, 4, 5],
    rows: design.combined.map((c) => [c.nodes.join(' + '), c.design.shape, f2(c.spacing), f2(c.design.Bx),
      c.design.shape === 'Trapezoidal (CTF)' ? `${f2(c.design.By1)}/${f2(c.design.By2)}` : f2(c.design.By),
      f0(c.design.Dc), c.ok ? 'PASS' : 'FAIL']),
  })
  if (irregular && irregular.length) tables.push({
    title: 'Structural irregularities (NSCP Table 208-9/10)',
    head: ['Code', 'Type', 'Location', 'Ratio', 'Limit', 'Classification'],
    right: [3, 4],
    rows: irregular.map((f) => [
      f.code, f.name, f.elevation != null ? `EL ${f2(f.elevation)} m${f.dir ? ` · ${f.dir.toUpperCase()}` : ''}` : (f.dir ? f.dir.toUpperCase() : '—'),
      f2(f.ratio), f2(f.limit), f.verdict === 'extreme' ? 'Extreme' : 'Irregular',
    ]),
  })

  // ── Worked solutions — every member (user-selected depth) ──
  const groups: ReportGroup[] = []
  if (design.beams.length) groups.push({
    title: 'RC beams & girders',
    items: design.beams.flatMap((bm) => {
      const sec = sectionFor(bm.id)
      if (!sec) return []
      return bm.sections.map((s) => ({
        title: `${bm.id} · ${s.label}`,
        sub: `${bm.role} ${sec.name} · L = ${f1(bm.L)} m · ${bm.gov ?? ''}`,
        details: `Mu ${f1(Math.abs(s.Mu))} kN·m · Vu ${f1(s.Vu)} kN`,
        loc: memberLoc(bm.id),
        steps: beamSectionSolution(sec, s),
        section: {
          kind: 'beam' as const, b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, stirrupDia: sec.tieDia,
          bars: s.design.bars, layers: s.design.layers, comprLayers: s.design.comprLayers,
          hogging: s.hogging, bf: s.bf, hf: s.hf, edge: s.edge, legs: s.design.legs,
        },
      }))
    }),
  })
  if (design.prestressed.length) groups.push({
    title: 'Prestressed members',
    items: design.prestressed.flatMap((p) => {
      const sec = sectionFor(p.id)
      if (!sec?.ps) return []
      return [{
        title: p.id,
        sub: `${sec.name} · L = ${f2(p.L)} m · Aps ${sec.ps.Aps} mm²`,
        steps: buildPrestressedSolution({
          b: sec.b, h: sec.h, span: p.L, fc: sec.fc, fci: sec.ps.fci,
          Aps: sec.ps.Aps, fpu: sec.ps.fpu, e: sec.ps.e, wSDL: 0, wLL: 0,
        }, p.design),
      }]
    }),
  })
  if (design.columns.length) groups.push({
    title: 'RC columns',
    items: design.columns.flatMap((c) => {
      const cs = sectionFor(c.id)
      return cs ? [{
        title: c.id, sub: `${cs.name} · L = ${f1(c.L)} m · ${c.gov ?? ''}`,
        details: `Pu ${f1(c.Pu)} kN · Mu ${f1(c.Mu)} kN·m`,
        loc: memberLoc(c.id),
        steps: columnRowSolution(cs, c),
        section: {
          kind: 'column' as const, b: cs.b, h: cs.h, cover: cs.cover, barDia: cs.barDia, stirrupDia: cs.tieDia,
          bars: c.bars, fourFace: c.layout === 'all-around',
        },
      }] : []
    }),
  })
  if (design.steelBeams.length) groups.push({
    title: 'Steel beams & girders',
    items: design.steelBeams.map((b) => ({ title: b.id, sub: `${b.shape} · L = ${f2(b.L)} m · ${b.gov ?? ''}`, steps: steelBeamRowSolution(b) })),
  })
  if (design.steelColumns.length) groups.push({
    title: 'Steel columns',
    items: design.steelColumns.map((c) => ({ title: c.id, sub: `${c.shape} · L = ${f2(c.L)} m · ${c.gov ?? ''}`, steps: steelColumnRowSolution(c) })),
  })
  if (design.woodBeams.length) groups.push({
    title: 'Timber beams & girders',
    items: design.woodBeams.map((b) => ({ title: b.id, sub: `${f0(b.b)}×${f0(b.d)} mm · ${b.species || 'timber'} · L = ${f2(b.L)} m · ${b.gov ?? ''}`, steps: woodBeamRowSolution(b) })),
  })
  if (design.woodColumns.length) groups.push({
    title: 'Timber columns',
    items: design.woodColumns.map((c) => ({ title: c.id, sub: `${f0(c.b)}×${f0(c.d)} mm · ${c.species || 'timber'} · L = ${f2(c.L)} m · ${c.gov ?? ''}`, steps: woodColumnRowSolution(c) })),
  })
  if (design.woodSlabs.length) groups.push({
    title: 'Timber deck slabs',
    items: design.woodSlabs.map((s) => ({ title: s.plate, sub: `${f2(s.lx)} × ${f2(s.ly)} m · ${s.species} · deck-on-joist`, steps: woodSlabRowSolution(s) })),
  })
  const connItems: ReportSolution[] = [
    ...design.joints.flatMap((j) => j.connections.map((c) => ({
      title: `Joint ${j.nodeId} · ${c.beamId}`,
      sub: `${c.connType} to ${j.columnShape} ${c.faceType} face`,
      steps: connectionRowSolution(c, { kind: 'column' as const, shape: j.columnShape, faceType: c.faceType }),
    }))),
    ...design.beamJoints.flatMap((j) => j.connections.map((c) => ({
      title: `Joint ${j.nodeId} · ${c.beamId}`,
      sub: `${c.connType} to girder ${j.girderShape} web`,
      steps: connectionRowSolution(c, { kind: 'girder' as const, shape: j.girderShape }),
    }))),
  ]
  if (connItems.length) groups.push({ title: 'Steel connections', items: connItems })
  if (design.footings.length) groups.push({
    title: 'Isolated footings',
    items: design.footings.map((f) => ({
      title: `Footing at ${f.node}`,
      sub: `B = ${f2(f.design.B)} m · Dc = ${f0(f.design.Dc)} mm`,
      steps: footingRowSolution(colSectionAt(f.node) ?? fallbackSec, soil, f),
    })),
  })
  if (design.combined.length) groups.push({
    title: 'Combined footings',
    items: design.combined.map((c) => ({
      title: `Combined footing ${c.nodes.join(' + ')}`,
      sub: `${c.design.shape} · ${f2(c.design.Bx)} m long`,
      steps: combinedRowSolution(colSectionAt(c.nodes[0]) ?? fallbackSec, colSectionAt(c.nodes[1]) ?? fallbackSec, soil, c),
    })),
  })

  return { ok, governing, stats, checks, props, tables, groups, ...buildWorkflowSections(model, design, extras, irregular, { loc: memberLoc, secOf: sectionFor }) }
}

// ── Workflow sections (spec: complete analysis → design → optimization →
//    schedule → detailing chain, from engine state only) ──────────────────────
const PASS_FLOOR = 1e-9

function buildWorkflowSections(
  model: StructuralModel, design: StructureDesign, extras: ModelReportExtras | undefined,
  irregular: IrregularityFlag[] | null | undefined,
  helpers: { loc: (memberId: string) => string | undefined; secOf: (memberId: string) => RectSection | undefined },
): Partial<Pick<ModelReport, 'exec' | 'linear' | 'modal' | 'nonlinear' | 'pushover' | 'biaxial' | 'optimization' | 'trace' | 'governingSummary' | 'status' | 'appendices'>> {
  const { loc: memberLoc, secOf } = helpers
  const out: Partial<Pick<ModelReport, 'exec' | 'linear' | 'modal' | 'nonlinear' | 'pushover' | 'biaxial' | 'optimization' | 'trace' | 'governingSummary' | 'status' | 'appendices'>> = {}
  if (!extras) return out
  const { analysis, modal, po, bx, nl, nlHinge, drift, opt, tryBars } = extras

  // member length (m) from the model — the same measure appliedResultant needs
  const lenOf = (id: string): number => {
    const m = model.members.find((x) => x.id === id)
    if (!m) return 0
    const a = model.nodes.find((n) => n.id === m.i), b = model.nodes.find((n) => n.id === m.j)
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : 0
  }

  // ── Linear static (F3Analysis) ──
  let linear: ReportLinear | undefined
  if (analysis) {
    const valid = analysis.perCombo.filter((r) => !!r.result)
    const govRun = analysis.perCombo[analysis.govIdx]
    const equilOf = (i: number): ReportEquilibrium | null => {
      const run = analysis.perCombo[i]
      if (!run?.result) return null
      const rt = run.result.reactions
      const reacted: [number, number, number] = [
        rt.reduce((s, r) => s + r.F[0], 0), rt.reduce((s, r) => s + r.F[1], 0), rt.reduce((s, r) => s + r.F[2], 0),
      ]
      const applied = appliedResultant(run.factored, lenOf)
      const resid: [number, number, number] = [applied[0] + reacted[0], applied[1] + reacted[1], applied[2] + reacted[2]]
      const scale = Math.max(Math.abs(reacted[0]), Math.abs(reacted[1]), Math.abs(reacted[2]), Math.abs(applied[1]), PASS_FLOOR)
      const residPct = (Math.max(...resid.map(Math.abs)) / scale) * 100
      return { combo: run.combo.name, applied, reacted, residPct, ok: residPct < 1 }
    }
    const equil = equilOf(analysis.govIdx)
    let worstResid: number | null = null
    for (const run of valid) {
      const e = equilOf(analysis.perCombo.indexOf(run))
      if (e && (worstResid === null || e.residPct > worstResid)) worstResid = e.residPct
    }

    const reactionsTable = govRun?.result
      ? {
          title: `Support reactions — governing case ${govRun.combo.name}`,
          head: ['Node', 'Fixity', 'Fx (kN)', 'Fy (kN)', 'Fz (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Mz (kN·m)'],
          right: [2, 3, 4, 5, 6, 7],
          rows: [...govRun.result.reactions]
            .sort((a, b) => a.node.localeCompare(b.node))
            .map((r) => [r.node, r.fixity, f2(r.F[0]), f2(r.F[1]), f2(r.F[2]), f2(r.M[0]), f2(r.M[1]), f2(r.M[2])]),
        }
      : null

    // per-level peak displacements — needs the SAME bridge node order the run
    // used; guarded by length so a stale analysis omits the table instead of
    // mapping displacements onto the wrong nodes.
    let displacements: ReportTable | null = null
    const order = extras.nodeOrder
    if (govRun?.result && order && govRun.result.d.length === order.length * 6) {
      const byLevel = new Map<number, [number, number, number]>()
      order.forEach((n, i) => {
        const d = govRun.result!.d
        const ux = Math.abs(d[i * 6]) * 1000, uy = Math.abs(d[i * 6 + 1]) * 1000, uz = Math.abs(d[i * 6 + 2]) * 1000
        const key = Math.round(n.y * 100) / 100
        const cur = byLevel.get(key) ?? [0, 0, 0]
        byLevel.set(key, [Math.max(cur[0], ux), Math.max(cur[1], uy), Math.max(cur[2], uz)])
      })
      displacements = {
        title: `Nodal displacements — governing case ${govRun.combo.name} (per level, peaks)`,
        head: ['Level (m)', 'max |UX| (mm)', 'max |UY| (mm)', 'max |UZ| (mm)'],
        right: [1, 2, 3],
        rows: [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([lv, v]) => [f2(lv), f2(v[0]), f2(v[1]), f2(v[2])]),
      }
    }

    // governing forces, straight from the design rows (each row already names
    // the case that governed it) — analysis → design made explicit
    const gfRows: string[][] = [
      ...design.beams.map((b) => [b.id, 'beam', b.gov ?? '', '—', f1(Math.max(...b.sections.map((s) => Math.abs(s.Mu)))), f1(Math.max(...b.sections.map((s) => s.Vu)))]),
      ...design.columns.map((c) => [c.id, 'column', c.gov ?? '', f1(c.Pu), f1(c.Mu), '—']),
      ...design.steelBeams.map((b) => [b.id, 'steel beam', b.gov ?? '', '—', f1(b.Mu), f1(b.Vu)]),
      ...design.steelColumns.map((c) => [c.id, 'steel column', c.gov ?? '', f1(c.Pu), f1(c.Mu), '—']),
    ]
    const governingForces = gfRows.length
      ? { title: 'Governing design forces per member (from the schedule rows)', head: ['Member', 'Type', 'Case', 'Pu (kN)', 'Mu (kN·m)', 'Vu (kN)'], right: [3, 4, 5], rows: gfRows }
      : null

    // full member envelopes across every run (appendix dataset)
    const env = new Map<string, { Nt: number; Nc: number; V: number; M: number; combo: string }>()
    for (const run of analysis.perCombo) {
      if (!run.result) continue
      for (const m of run.result.members) {
        const e = env.get(m.id) ?? { Nt: -Infinity, Nc: Infinity, V: 0, M: 0, combo: run.combo.name }
        for (const n of m.N) { if (n > e.Nt) e.Nt = n; if (n < e.Nc) e.Nc = n }
        if (m.Vmax > e.V) e.V = m.Vmax
        if (m.Mmax > e.M) { e.M = m.Mmax; e.combo = run.combo.name }
        env.set(m.id, e)
      }
    }
    const memberEnvelope = env.size
      ? {
          title: 'Member force envelopes — all runs',
          head: ['Member', 'N max tension (kN)', 'N max compression (kN)', 'V max (kN)', 'M max (kN·m)', 'Governing case'],
          right: [1, 2, 3, 4],
          rows: [...env.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([id, e]) => [id, f1(e.Nt), f1(e.Nc), f1(e.V), f1(e.M), e.combo]),
        }
      : null

    linear = {
      runs: analysis.perCombo.length,
      skipped: analysis.perCombo.length - valid.length,
      governingCombo: design.govName,
      equilibrium: equil,
      worstResidPct: worstResid,
      reactions: reactionsTable,
      displacements,
      governingForces,
      memberEnvelope,
    }
  }

  // ── Modal ──
  let modalOut: ReportModal | undefined
  if (modal && modal.modes.length) {
    let cx = 0, cz = 0
    const rows = modal.modes.map((m, i) => {
      cx += m.effMassRatio[0] * 100; cz += m.effMassRatio[2] * 100
      return [String(i + 1), m.period.toFixed(3), m.freq.toFixed(2),
        f1(m.effMassRatio[0] * 100), f1(m.effMassRatio[1] * 100), f1(m.effMassRatio[2] * 100), f1(cx), f1(cz)]
    })
    modalOut = {
      modes: modal.modes.length,
      table: {
        title: 'Modal results — periods and effective modal mass',
        head: ['Mode', 'T (s)', 'f (Hz)', 'UX mass %', 'UY mass %', 'UZ mass %', 'ΣUX %', 'ΣUZ %'],
        right: [1, 2, 3, 4, 5, 6, 7],
        rows,
      },
      totalMass: modal.totalMass,
      coverage: modal.cumRatio,
    }
  }

  // ── Nonlinear time history (shear building / equivalent plane frame) ──
  let nonlinear: ReportNonlinear | undefined
  const nlFrame = nlHinge?.inelastic ?? null
  const nlShear = nl?.inelastic ?? null
  if (nlFrame) {
    const r = nlFrame.response
    nonlinear = {
      source: 'equivalent plane frame · member-end plastic hinges', period: nlFrame.period,
      converged: r.converged, maxIterations: r.maxIterations ?? null, worstResidual: null,
      ductility: null, yieldedHinges: r.yieldedHinges ?? null, totalDissipated: r.totalDissipated ?? null,
      peakBaseShear: r.peakBaseShear ?? null, peakDisp: r.peakDisp ?? null,
    }
  } else if (nlShear) {
    const r = nlShear.response
    const duct = Math.max(...r.ductility)
    nonlinear = {
      source: 'equivalent shear building', period: nlShear.period,
      converged: r.converged, maxIterations: r.maxIterations ?? null,
      worstResidual: r.worstResidual ?? null,
      // per-spring peak ductility — reported only when finite (a mechanism
      // run reports Infinity, which is not a number a table should print)
      ductility: Number.isFinite(duct) ? duct : null,
      yieldedHinges: null,   // the shear building records "any spring yielded", not a count
      totalDissipated: r.totalDissipated ?? null,
      peakBaseShear: r.peakBaseForce ?? null,
      peakDisp: Math.max(...r.peak.map(Math.abs)) ?? null,
    }
  }

  // ── Pushover ──
  let pushover: ReportPushover | undefined
  if (po && po.result.curve.length > 1) {
    const HINGE_CAP = 24
    const hingeRows = po.result.hinges.map((h) => [
      h.member, h.end.toUpperCase(), h.type + (h.axis ? ` (${h.axis})` : ''), String(h.event),
      ...(h.axial !== undefined ? [f1(h.axial)] : []),
    ])
    const hingeHead = ['Member', 'End', 'Mode', 'Event', ...(po.result.hinges.some((h) => h.axial !== undefined) ? ['Axial (kN)'] : [])]
    const hingeRight = hingeHead.length - 1
    pushover = {
      controlNode: po.controlNode,
      totalHeight: po.totalHeight,
      pmInteraction: po.pmInteraction,
      pDelta: po.pDelta,
      events: po.result.curve.length - 1,
      mechanism: po.result.mechanism,
      curve: po.result.curve.map((s) => ({ x: s.roofDisp * 1000, y: s.baseShear })),
      hingeTable: { title: 'Plastic hinges, in formation order', head: hingeHead, right: [hingeRight], rows: hingeRows.slice(0, HINGE_CAP) },
      hingeOverflow: hingeRows.length > HINGE_CAP
        ? { title: 'Plastic hinges (continued)', head: hingeHead, right: [hingeRight], rows: hingeRows.slice(HINGE_CAP) }
        : null,
    }
  }

  // ── Biaxial columns (from the schedule rows — the check that set `util`) ──
  let biaxial: ReportBiaxial | undefined
  if (design.columns.length) {
    const rows = design.columns.map((c) => [
      c.id, f1(c.Pu), f1(c.Mu), f1(c.Muy),
      c.biaxialMethod, f1(c.phiPn), f2(c.util), c.ok ? 'PASS' : 'FAIL', c.gov ?? '',
    ])
    biaxial = {
      table: {
        title: 'Biaxial column check — Pu–Mu–Muy interaction (Bresler / load contour)',
        head: ['Column', 'Pu (kN)', 'Mu (kN·m)', 'Muy (kN·m)', 'Method', 'φPn (kN)', 'Util', 'Status', 'Case'],
        right: [1, 2, 3, 5, 6],
        rows,
      },
      skewPushover: bx ? {
        angleDeg: bx.angleDeg,
        controlDir: bx.controlDir,
        curve: bx.curve.map((p) => ({ x: p.disp * 1000, y: p.shear })),
        peakShear: bx.peakShear,
        yieldedHinges: bx.yieldedHinges,
      } : null,
    }
  }

  // ── Optimization ──
  let optimization: ReportOptimization | undefined
  if (opt) {
    const stepRows = opt.steps.map((s, i) => [
      String(i + 1),
      s.note ?? (s.grown ? `${s.grown} section change${s.grown === 1 ? '' : 's'}` : '—'),
      String(s.fails),
      s.ok ? 'PASS' : 'FAIL',
    ])
    const steps: ReportTable = {
      title: 'Optimization iterations',
      head: ['Step', 'Action', 'Failing checks', 'Status'],
      right: [2, 3],
      rows: stepRows,
    }

    // initial vs final — needs the pre-optimization model (guarded: the diff
    // assumes both models settled with the same section/plate ordering)
    const ivfRows: string[][] = []
    const init = opt.initialModel
    let initialVsFinal: ReportTable
    if (init) {
      init.sections.forEach((s, i) => {
        const t = opt.model.sections[i]
        if (!t || (s.b === t.b && s.h === t.h && s.shape === t.shape)) return
        const from = s.shape ?? `${s.b}×${s.h}`, to = t.shape ?? `${t.b}×${t.h}`
        const change = s.shape || t.shape ? 'catalog step' : `${t.b - s.b >= 0 ? '+' : ''}${t.b - s.b} / ${t.h - s.h >= 0 ? '+' : ''}${t.h - s.h} mm`
        ivfRows.push([t.name || t.id, from, to, change])
      })
      init.plates.forEach((p, i) => {
        const q = opt.model.plates[i]
        if (q && p.thickness !== q.thickness) ivfRows.push([p.id, `${p.thickness} mm`, `${q.thickness} mm`, `${q.thickness - p.thickness} mm`])
      })
      ;(init.walls ?? []).forEach((w, i) => {
        const q = (opt.model.walls ?? [])[i]
        if (q && w.thickness !== q.thickness) ivfRows.push([w.id, `${w.thickness} mm`, `${q.thickness} mm`, `${q.thickness - w.thickness} mm`])
      })
      // final governing utilisation per changed section
      const memberSec = new Map(opt.model.members.map((m) => [m.id, m.section]))
      const secUtil = new Map<string, number>()
      const bump = (id: string, u: number) => {
        const s = memberSec.get(id); if (!s || !Number.isFinite(u)) return
        secUtil.set(s, Math.max(secUtil.get(s) ?? 0, u))
      }
      design.columns.forEach((c) => bump(c.id, c.util))
      design.steelColumns.forEach((c) => bump(c.id, c.ratio))
      design.woodColumns.forEach((c) => bump(c.id, c.ratio))
      design.steelBeams.forEach((b) => bump(b.id, Math.max(b.utilM, b.utilV)))
      design.woodBeams.forEach((b) => bump(b.id, Math.max(b.utilM, b.utilV)))
      design.beams.forEach((b) => b.sections.forEach((s) => {
        if (s.design.phiMnMax > PASS_FLOOR) bump(b.id, Math.abs(s.Mu) / s.design.phiMnMax)
      }))
      const ivf = ivfRows.map((r) => {
        const secId = opt.model.sections.find((s) => (s.name || s.id) === r[0])?.id
          ?? init.sections.find((s) => (s.name || s.id) === r[0])?.id
        const u = secId != null ? secUtil.get(secId) : undefined
        return [...r, u !== undefined ? f2(u) : '—']
      })
      initialVsFinal = {
        title: 'Initial vs final design — elements the optimizer changed',
        head: ['Element', 'Initial', 'Final', 'Change', 'Final governing util'],
        right: [4],
        rows: ivf,
      }
    } else {
      initialVsFinal = {
        title: 'Initial vs final design — elements the optimizer changed',
        head: ['Element', 'Initial', 'Final', 'Change', 'Final governing util'],
        rows: [],
      }
    }

    const totals: ReportOptimization['totals'] = [
      { label: 'Concrete (m³)', before: f2(opt.initialDesign?.totals.concrete ?? 0), after: f2(design.totals.concrete) },
    ]
    if ((opt.initialDesign?.totals.steelKg ?? 0) > 0 || design.totals.steelKg > 0)
      totals.push({ label: 'Structural steel (t)', before: f2((opt.initialDesign?.totals.steelKg ?? 0) / 1000), after: f2(design.totals.steelKg / 1000) })
    if ((opt.initialDesign?.totals.woodVolume ?? 0) > 0 || design.totals.woodVolume > 0)
      totals.push({ label: 'Timber (m³)', before: f2(opt.initialDesign?.totals.woodVolume ?? 0), after: f2(design.totals.woodVolume) })

    const objective = [
      'Feasibility — grow member sections, slab and wall thicknesses until every code check passes; every trial is a full re-design accepted only when the whole structure passes.',
      'Economy — shrink h, then b, then slab thickness, then per-section fine-tune; trims target member utilisation below 0.80 and are kept only when the full design still passes.',
      ...(tryBars ? ['Bar re-detail — per-member bar diameter (and column bar count) re-chosen as the smallest-steel set that keeps every check passing.'] : []),
      'Constraints — all design checks on every trial: RC/steel/timber members, footings, slabs (§408.3.1.2 + §424.2), shear walls, steel joints, SCWB §418.7.3.2, P-Δ convergence.',
    ]

    optimization = { converged: opt.converged, stopReason: opt.stopReason, steps, initialVsFinal, objective, totals }
  }

  // ── Traceability: governing members, analysis → design → schedule ──
  const trace: ReportTrace[] = []
  {
    const beamRatios = design.beams
      .map((b) => ({ b, u: Math.max(...b.sections.map((s) => (s.design.phiMnMax > PASS_FLOOR ? Math.abs(s.Mu) / s.design.phiMnMax : 0))) }))
      .sort((a, z) => z.u - a.u).slice(0, 6)
    for (const { b } of beamRatios) {
      const s = b.sections.reduce((a, z) => (Math.abs(z.Mu) > Math.abs(a.Mu) ? z : a))
      const sec = secOf(b.id)
      trace.push({
        member: b.id, kind: 'beam', loc: memberLoc(b.id), combo: b.gov,
        demand: `Mu ${f1(Math.abs(s.Mu))} kN·m · Vu ${f1(s.Vu)} kN`,
        required: `As ${f0(s.design.As)} mm²`,
        provided: `${s.design.bars}⌀${sec?.barDia ?? '?'}${s.design.layers.length > 1 ? ` (${s.design.layers.join('+')})` : ''} · ${s.design.legs}L-⌀${sec?.tieDia ?? '?'} @ ${Math.round(s.hogging ? s.design.sHinge : s.design.sAdopt)} mm`,
        util: s.design.phiMnMax > PASS_FLOOR ? Math.abs(s.Mu) / s.design.phiMnMax : undefined,
        ok: b.ok,
      })
    }
    const cols = [...design.columns].sort((a, z) => z.util - a.util).slice(0, 6)
    for (const c of cols) {
      const sec = secOf(c.id)
      trace.push({
        member: c.id, kind: 'column', loc: memberLoc(c.id), combo: c.gov,
        demand: `Pu ${f1(c.Pu)} kN · Mu ${f1(c.Mu)} · Muy ${f1(c.Muy)} kN·m`,
        required: `φPn ${f1(c.phiPn)} kN (${c.biaxialMethod})`,
        provided: `${c.bars}⌀${sec?.barDia ?? '?'} · ties ⌀${sec?.tieDia ?? '?'} @ ${Math.round(c.tieSpacingFinal)} mm`,
        util: c.util, ok: c.ok,
      })
    }
  }

  // ── Governing design summary ──
  const govRows: string[][] = []
  {
    const beams = design.beams.flatMap((b) => b.sections.map((s) => ({ b, s })))
    if (beams.length) {
      const f = beams.reduce((a, z) => (Math.abs(z.s.Mu) > Math.abs(a.s.Mu) ? z : a))
      govRows.push(['Beam flexure', f.b.id, `Mu ${f1(Math.abs(f.s.Mu))} kN·m`, f.s.design.phiMnMax > PASS_FLOOR ? f2(Math.abs(f.s.Mu) / f.s.design.phiMnMax) : '—'])
      const sh = beams.reduce((a, z) => (z.s.Vu > a.s.Vu ? z : a))
      govRows.push(['Beam shear', sh.b.id, `Vu ${f1(sh.s.Vu)} kN`, '—'])
    }
    if (design.columns.length) {
      const ax = design.columns.reduce((a, z) => (z.Pu > a.Pu ? z : a))
      govRows.push(['Column axial', ax.id, `Pu ${f1(ax.Pu)} kN`, ax.phiPn > PASS_FLOOR ? f2(ax.Pu / ax.phiPn) : '—'])
      const bx = design.columns.reduce((a, z) => (z.util > a.util ? z : a))
      govRows.push(['Column biaxial interaction', bx.id, `Pu ${f1(bx.Pu)} kN · Mu ${f1(bx.Mu)}`, f2(bx.util)])
    }
    if (design.scwb.length) {
      const w = design.scwb.reduce((a, z) => (z.ratio < a.ratio ? z : a))
      govRows.push(['Strong column / weak beam', w.node, `ΣMnc/ΣMnb ${f2(w.ratio)}`, f2(w.ratio)])
    }
    if (design.slabs.length) {
      const s = design.slabs.reduce((a, z) => (z.design.wu > a.design.wu ? z : a))
      govRows.push(['Slab (DDM)', s.plate, `wu ${f2(s.design.wu)} kPa`, '—'])
    }
    if (design.walls.length) {
      const w = design.walls.reduce((a, z) => (z.Vu / Math.max(z.design.phiVn, PASS_FLOOR) > a.Vu / Math.max(a.design.phiVn, PASS_FLOOR) ? z : a))
      govRows.push(['Shear wall', w.id, `Vu ${f1(w.Vu)} kN`, f2(w.Vu / Math.max(w.design.phiVn, PASS_FLOOR))])
    }
    if (design.footings.length) {
      const f = design.footings.reduce((a, z) => (z.Pu > a.Pu ? z : a))
      govRows.push(['Footing bearing', f.node, `Pu ${f0(f.Pu)} kN`, '—'])
    }
    if (design.steelBeams.length) {
      const b = design.steelBeams.reduce((a, z) => (Math.max(z.utilM, z.utilV) > Math.max(a.utilM, a.utilV) ? z : a))
      govRows.push(['Steel beam', b.id, `Mu ${f1(b.Mu)} · Vu ${f1(b.Vu)}`, f2(Math.max(b.utilM, b.utilV))])
    }
    if (design.steelColumns.length) {
      const c = design.steelColumns.reduce((a, z) => (z.ratio > a.ratio ? z : a))
      govRows.push(['Steel column §H1-1', c.id, `Pu ${f1(c.Pu)} · Mu ${f1(c.Mu)}`, f2(c.ratio)])
    }
  }
  const governingSummary: ReportGoverning | undefined = govRows.length
    ? { table: { title: 'Most critical members by check', head: ['Check', 'Governing member', 'Demand', 'Utilisation'], right: [3], rows: govRows } }
    : undefined

  // ── Engineering status (from actual engine results — never auto-PASS) ──
  const status: ReportStatus[] = []
  const equilOK = linear?.equilibrium
  status.push(equilOK
    ? { check: 'Static equilibrium', status: equilOK.ok ? 'PASS' : 'FAIL', detail: `max residual ${equilOK.residPct.toExponential(1)}% of load (${equilOK.combo})` }
    : { check: 'Static equilibrium', status: 'NOT RUN' })
  if (analysis) {
    const runs = analysis.perCombo
    const anyResult = runs.some((r) => r.result)
    const allResults = runs.every((r) => r.result)
    status.push({
      check: 'Linear analysis (3D FEM)',
      status: !anyResult ? 'FAIL' : allResults && design.pDeltaIssues.length === 0 ? 'PASS' : design.pDeltaIssues.length ? 'FAIL' : 'PARTIAL',
      detail: `${runs.length} case runs · governing ${design.govName}${design.pDeltaIssues.length ? ` · P-Δ failed: ${design.pDeltaIssues.length}` : ''}`,
    })
  } else status.push({ check: 'Linear analysis (3D FEM)', status: 'NOT RUN' })
  if (drift) status.push({ check: 'Storey drift (§208.5.10)', status: drift.every((d) => d.ok) ? 'PASS' : 'FAIL', detail: `${drift.length} storeys` })
  else status.push({ check: 'Storey drift (§208.5.10)', status: 'NOT RUN' })
  if (modal) status.push({ check: 'Modal analysis', status: 'COMPLETE', detail: `${modal.modes.length} modes` })
  else status.push({ check: 'Modal analysis', status: 'NOT RUN' })
  if (nonlinear) status.push({ check: 'Nonlinear time-history', status: nonlinear.converged ? 'PASS' : 'FAIL', detail: nonlinear.source })
  else status.push({ check: 'Nonlinear time-history', status: 'NOT RUN' })
  if (po) status.push({ check: 'Pushover analysis', status: 'COMPLETE', detail: `${po.result.curve.length - 1} events${po.result.mechanism ? ' · mechanism reached' : ''}` })
  else status.push({ check: 'Pushover analysis', status: 'NOT RUN' })
  if (bx) status.push({ check: 'Biaxial pushover', status: 'COMPLETE', detail: `${bx.angleDeg.toFixed(0)}° skew · peak V ${f1(bx.peakShear)} kN` })
  else status.push({ check: 'Biaxial pushover', status: 'NOT RUN' })
  const memberChecks: ReportStatus[] = []
  if (design.beams.length) memberChecks.push({ check: 'Beam design', status: design.beams.every((b) => b.ok) ? 'PASS' : 'FAIL', detail: `${design.beams.length} members` })
  if (design.columns.length) memberChecks.push({ check: 'Column design', status: design.columns.every((c) => c.ok) ? 'PASS' : 'FAIL', detail: `${design.columns.length} members` })
  if (design.steelBeams.length || design.steelColumns.length)
    memberChecks.push({ check: 'Steel design (AISC 360-16)', status: design.steelBeams.every((b) => b.ok) && design.steelColumns.every((c) => c.ok) ? 'PASS' : 'FAIL', detail: `${design.steelBeams.length + design.steelColumns.length} members` })
  if (design.woodBeams.length || design.woodColumns.length)
    memberChecks.push({ check: 'Timber design (NDS §3)', status: design.woodBeams.every((b) => b.ok) && design.woodColumns.every((c) => c.ok) ? 'PASS' : 'FAIL', detail: `${design.woodBeams.length + design.woodColumns.length} members` })
  if (design.slabs.length) memberChecks.push({ check: 'Slab design (DDM)', status: design.slabs.every((s) => s.ok) ? 'PASS' : 'FAIL', detail: `${design.slabs.length} panels` })
  if (design.footings.length || design.combined.length)
    memberChecks.push({ check: 'Footing design', status: design.footings.every((f) => f.ok) && design.combined.every((c) => c.ok) ? 'PASS' : 'FAIL', detail: `${design.footings.length + design.combined.length} footings` })
  if (design.joints.length || design.beamJoints.length)
    memberChecks.push({ check: 'Steel connections', status: design.joints.every((j) => j.ok) && design.beamJoints.every((j) => j.ok) ? 'PASS' : 'FAIL', detail: `${design.joints.length + design.beamJoints.length} joints` })
  if (design.scwb.length) memberChecks.push({ check: 'SCWB (§418.7.3.2)', status: design.scwb.every((j) => j.ok) ? 'PASS' : 'FAIL', detail: `${design.scwb.length} joints` })
  if (design.unchecked.length) memberChecks.push({ check: 'Unchecked members', status: 'FAIL', detail: design.unchecked.map((u) => u.id).join(', ') })
  status.push(...memberChecks)
  if (opt) status.push({
    check: 'Optimization',
    status: opt.converged ? 'COMPLETE' : 'STOPPED',
    detail: opt.converged ? `${opt.steps.length} steps · all checks pass` : (opt.stopReason ?? 'stopped early'),
  })
  else status.push({ check: 'Optimization', status: 'NOT RUN' })
  status.push({ check: 'Final detailing', status: 'PASS', detail: 'schedules, cages and drawings read the same design rows (single source of truth)' })

  // ── Executive summary panels ──
  const exec: ReportExec = {
    analysis: [
      { label: 'Linear static (3D FEM)', ok: analysis ? true : null, note: analysis ? `${analysis.perCombo.length} case runs` : undefined },
      { label: 'Static equilibrium', ok: equilOK ? equilOK.ok : analysis ? false : null, note: equilOK ? `residual ${equilOK.residPct.toExponential(1)}%` : undefined },
      { label: 'Storey drift (§208.5.10)', ok: drift ? drift.every((d) => d.ok) : null, note: drift ? `${drift.length} storeys` : undefined },
      { label: 'Seismic regularity (§208-9/10)', ok: irregular ? irregular.length === 0 : null, note: irregular ? (irregular.length ? `${irregular.length} flag(s)` : 'regular') : undefined },
      { label: 'Modal', ok: modal ? true : null, note: modal ? `${modal.modes.length} modes` : undefined },
      { label: 'Nonlinear time-history', ok: nonlinear ? nonlinear.converged : null, note: nonlinear ? nonlinear.source : undefined },
      { label: 'Pushover', ok: po ? true : null, note: po ? `${po.result.curve.length - 1} events` : undefined },
      { label: 'Biaxial pushover', ok: bx ? true : null, note: bx ? `${bx.angleDeg.toFixed(0)}° skew` : undefined },
    ],
    design: [
      ...(design.beams.length ? [{ label: 'Beams', ok: design.beams.every((b) => b.ok), note: `${design.beams.length} members` }] : []),
      ...(design.columns.length ? [{ label: 'Columns (biaxial)', ok: design.columns.every((c) => c.ok), note: `${design.columns.length} members` }] : []),
      ...(design.slabs.length ? [{ label: 'Slabs', ok: design.slabs.every((s) => s.ok), note: `${design.slabs.length} panels` }] : []),
      ...(design.footings.length + design.combined.length ? [{ label: 'Footings', ok: design.footings.every((f) => f.ok) && design.combined.every((c) => c.ok), note: `${design.footings.length + design.combined.length} footings` }] : []),
      ...(design.steelBeams.length + design.steelColumns.length ? [{ label: 'Steel members', ok: design.steelBeams.every((b) => b.ok) && design.steelColumns.every((c) => c.ok), note: `${design.steelBeams.length + design.steelColumns.length} members` }] : []),
      ...(design.woodBeams.length + design.woodColumns.length ? [{ label: 'Timber members', ok: design.woodBeams.every((b) => b.ok) && design.woodColumns.every((c) => c.ok), note: `${design.woodBeams.length + design.woodColumns.length} members` }] : []),
      ...(design.scwb.length ? [{ label: 'Beam–column joints', ok: design.scwb.every((j) => j.ok), note: `SCWB §418.7.3.2` }] : []),
    ],
    optimization: opt ? { label: 'Optimizer', ok: opt.converged, note: opt.converged ? `${opt.steps.length} steps · SAFE / OPTIMIZED` : (opt.stopReason ?? 'stopped early') } : null,
  }

  // ── Appendices (letters assigned to the datasets that exist, in order) ──
  const appendices: ReportAppendix[] = []
  {
    const push = (title: string, tables: ReportTable[]) => {
      if (!tables.length) return
      appendices.push({ letter: String.fromCharCode(65 + appendices.length), title, tables })
    }
    // A — analytical model
    push('Analytical model', [
      { title: 'Nodes', head: ['Node', 'X (m)', 'Y (m)', 'Z (m)'], right: [1, 2, 3], rows: model.nodes.map((n) => [n.id, f2(n.x), f2(n.y), f2(n.z)]) },
      {
        title: 'Members', head: ['Member', 'i', 'j', 'Section', 'Role'], rows: model.members.map((m) => {
          const s = model.sections.find((x) => x.id === m.section)
          return [m.id, m.i, m.j, s?.name ?? m.section, m.role]
        }),
      },
      { title: 'Supports', head: ['Node', 'Fixity'], rows: model.supports.map((s) => [s.node, s.fixity]) },
      {
        title: 'Section properties', head: ['Section', 'Material', 'Size', 'Bars'], rows: model.sections.map((s) => [
          s.name || s.id, s.material ?? 'concrete',
          s.shape ?? `${s.b}×${s.h}`,
          s.material !== 'steel' ? `${'⌀'}${s.barDia}` : '—',
        ]),
      },
    ])
    // B — loading
    {
      const loadTables: ReportTable[] = [{
        title: 'Load cases run for the envelope',
        head: ['#', 'Case'], rows: design.cases.map((c, i) => [String(i + 1), c]),
      }]
      if (analysis) {
        loadTables.push({
          title: 'NSCP 203 combinations (factors as applied)',
          head: ['Case', 'Factors'], rows: analysis.perCombo.map((r) => [
            r.combo.name,
            Object.entries(r.combo.f).filter(([, v]) => v).map(([k, v]) => `${v}·${k}`).join(' + '),
          ]),
        })
      }
      const byCat = new Map<string, number>()
      for (const ld of model.loads) byCat.set(ld.cat, (byCat.get(ld.cat) ?? 0) + 1)
      if (byCat.size)
        loadTables.push({
          title: 'Applied load assignments by category',
          head: ['Category', 'Assignments'], right: [1],
          rows: [...byCat.entries()].sort().map(([k, v]) => [k, String(v)]),
        })
      push('Loading', loadTables)
    }
    // C — analysis detail
    if (linear) {
      const tables: ReportTable[] = []
      if (linear.reactions) tables.push(linear.reactions)
      if (linear.memberEnvelope) tables.push(linear.memberEnvelope)
      push('Analysis results', tables)
    }
    // D — modal (full mode table when the main body truncated nothing, keep appendix for record)
    if (modalOut && modalOut.modes > 12) push('Modal results', [modalOut.table])
    // E — pushover event table
    if (po) {
      push('Pushover results', [{
        title: 'Capacity curve — event table',
        head: ['Event', 'λ', 'Base shear (kN)', 'Roof disp (mm)', 'New hinge', 'Hinges'],
        right: [1, 2, 3, 5],
        rows: po.result.curve.map((s) => [
          String(s.event), f2(s.lambda), f1(s.baseShear), f1(s.roofDisp * 1000),
          s.newHinge ? `${s.newHinge.member} ${s.newHinge.end.toUpperCase()}` : '—', String(s.numHinges),
        ]),
      }])
    }
    // F — optimization change trail
    if (opt) {
      const changes = opt.steps.flatMap((s) => (s.changes ?? []).map((c) => [String(s.iter), c.kind, c.label, c.from, c.to]))
      if (changes.length)
        push('Optimization history', [{
          title: 'Accepted changes per iteration',
          head: ['Iter', 'Kind', 'Element', 'From', 'To'], rows: changes,
        }])
    }
  }

  if (exec) out.exec = exec
  if (linear) out.linear = linear
  if (modalOut) out.modal = modalOut
  if (nonlinear) out.nonlinear = nonlinear
  if (pushover) out.pushover = pushover
  if (biaxial) out.biaxial = biaxial
  if (optimization) out.optimization = optimization
  if (trace.length) out.trace = trace
  if (governingSummary) out.governingSummary = governingSummary
  out.status = status
  if (appendices.length) out.appendices = appendices
  return out
}
