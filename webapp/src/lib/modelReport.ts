// Assembles the Model Space design results into a renderer-agnostic report
// payload for the direct-PDF export (lib/modelPdf.ts): overall verdict, design
// summary checks, schedule tables and EVERY member's worked solution, reusing
// the same step builders the on-screen schedules use. Presentation only — all
// numbers come from the pipeline's StructureDesign rows.
import type { StructuralModel, RectSection, Node } from '../engine/model'
import type {
  StructureDesign, SoilOptions,
  SteelBeamScheduleRow, SteelColumnScheduleRow,
  WoodBeamScheduleRow, WoodColumnScheduleRow, WoodSlabScheduleRow,
} from '../engine/pipeline'
import { designOK } from '../engine/pipeline'
import { beamSectionSolution, columnRowSolution, footingRowSolution, combinedRowSolution } from './modelSpaceSolutions'
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
  fourFace?: boolean        // column: bars distributed on all four faces
  legs?: number             // stirrup legs: 2 perimeter + interior crossties
}
export interface ReportSolution {
  title: string; sub?: string; steps: SolutionStep[]; section?: ReportSection
  details?: string          // demand summary (Mu/Vu for beams, Pu/Mu for columns)
  loc?: string              // plan grid line + floor the member sits on
}
export interface ReportGroup { title: string; items: ReportSolution[] }
export interface ModelReport {
  ok: boolean
  governing: string
  stats: ReportStat[]
  checks: ReportCheck[]
  props: [string, string][]
  tables: ReportTable[]
  groups: ReportGroup[]
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
      txt(`Compactness: flange λ = ${f1(r.lambdaF)} vs λp = ${f1(r.lambdaPF)}, web λ = ${f1(r.lambdaW)} vs λp = ${f1(r.lambdaPW)} → ${r.compact ? 'compact' : 'non-compact'}`),
    ] },
    { title: 'Flexure — lateral-torsional buckling zone', clause: 'AISC 360-16 §F2', pass: r.utilM <= 1, lines: [
      txt(`Mp = ${f1(r.Mp)} kN·m · Lp = ${f2(r.Lp)} m · Lr = ${f2(r.Lr)} m · Lb = ${f2(r.Lb)} m → ${r.ltbZone}`),
      txt(`Mn = ${f1(r.Mn)} kN·m → φMn = 0.90·Mn = ${f1(r.phiMn)} kN·m`),
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

// ── Timber worked "solutions" from the stored row detail (NDS §3 / NSCP §6) ───
// The wood schedule rows carry the LRFD-adjusted stresses and stability factors;
// these steps narrate them (no re-calculation), mirroring the steel builders.
export function woodBeamRowSolution(r: WoodBeamScheduleRow): SolutionStep[] {
  return [
    { title: `Section ${f0(r.b)}×${f0(r.d)} mm — ${r.species || 'timber'} (${r.kind})`, clause: 'NDS 2018 §3 / NSCP §6', lines: [
      txt(`b = ${f0(r.b)} mm · d = ${f0(r.d)} mm · L = ${f2(r.L)} m · role ${r.role}`),
    ] },
    { title: 'Flexure — bending with beam stability', clause: 'NDS §3.3', pass: r.utilM <= 1, lines: [
      txt(`f_b = M/S = ${f2(r.fb)} MPa · C_L = ${f2(r.CL)} → F′b = ${f2(r.FbPrime)} MPa`),
      txt(`Mu = ${f1(r.Mu)} kN·m → util f_b/F′b = ${f2(r.utilM)} ${r.utilM <= 1 ? '✓' : '✗'}`),
    ] },
    { title: 'Horizontal shear', clause: 'NDS §3.4', pass: r.utilV <= 1, lines: [
      txt(`f_v = 1.5V/A = ${f2(r.fv)} MPa ≤ F′v = ${f2(r.FvPrime)} MPa`),
      txt(`Vu = ${f1(r.Vu)} kN → util f_v/F′v = ${f2(r.utilV)} ${r.utilV <= 1 ? '✓' : '✗'}`),
    ] },
  ]
}

export function woodColumnRowSolution(r: WoodColumnScheduleRow): SolutionStep[] {
  return [
    { title: `Section ${f0(r.b)}×${f0(r.d)} mm — ${r.species || 'timber'} (${r.kind})`, clause: 'NDS 2018 §3 / NSCP §6', lines: [
      txt(`b = ${f0(r.b)} mm · d = ${f0(r.d)} mm · L = ${f2(r.L)} m`),
    ] },
    { title: 'Axial compression with column stability', clause: 'NDS §3.7', pass: r.fc <= r.FcPrime, lines: [
      txt(`slenderness le/d = ${f1(r.slenderness)} → C_P = ${f2(r.CP)} · F′c = ${f2(r.FcPrime)} MPa`),
      txt(`f_c = P/A = ${f2(r.fc)} MPa · Pu = ${f1(r.Pu)} kN ${r.fc <= r.FcPrime ? '✓' : '✗'}`),
    ] },
    { title: 'Combined axial + flexure', clause: 'NDS §3.9.2', pass: r.ok, lines: [
      txt(`Mu = ${f1(r.Mu)} kN·m → governing ratio = ${f2(r.ratio)} ≤ 1.00 ${r.ok ? '✓' : '✗'}`),
    ] },
  ]
}

// ── Timber deck (wood slab) worked solution from the stored row detail ────────
export function woodSlabRowSolution(r: WoodSlabScheduleRow): SolutionStep[] {
  const d = r.design, tk = d.takeoff
  const chk = (label: string, c: typeof d.joist): SolutionStep => ({
    title: label, clause: 'NDS §3.3–§3.4 / NSCP §6', pass: c.ok, lines: [
      txt(`${f0(c.b)}×${f0(c.d)} mm · span ${f2(c.span)} m · w = ${f2(c.w)} kN/m → M = ${f2(c.M)} kN·m, V = ${f2(c.V)} kN`),
      txt(`bending f_b/F′b = ${f2(c.fb)}/${f2(c.FbPrime)} (util ${f2(c.bendingRatio)}) · shear f_v/F′v = ${f2(c.fv)}/${f2(c.FvPrime)} (util ${f2(c.shearRatio)})`),
      txt(`Δ live ${f2(c.deflLive)}/${f2(c.deflLiveAllow)} mm · Δ total ${f2(c.deflTotal)}/${f2(c.deflTotalAllow)} mm ${c.ok ? '✓' : '✗'}`),
    ],
  })
  return [
    { title: 'Loads', clause: 'NSCP §203', lines: [
      txt(`superimposed dead ${f2(d.loads.deadKpa)} kPa · live ${f2(d.loads.liveKpa)} kPa · deck self ${f2(d.loads.deckSelfKpa)} · joist self ${f2(d.loads.joistSelfKpa)} → total ${f2(d.loads.totalKpa)} kPa`),
    ] },
    chk('Decking', d.deck),
    chk('Joist', d.joist),
    { title: 'Take-off (board feet)', clause: 'BOM', lines: [
      txt(`${f0(tk.joistCount)} joists · ${f2(tk.joistLengthM)} m · ${f0(tk.joistBoardFeet)} bd·ft · deck ${f2(tk.deckAreaM2)} m² · ${f0(tk.deckBoardFeet)} bd·ft${tk.bambooSlatCount != null ? ` · ${f0(tk.bambooSlatCount)} bamboo slats` : ''}`),
    ] },
  ]
}

// ── Payload assembly ──────────────────────────────────────────────────────────
export function buildModelReport(
  model: StructuralModel, design: StructureDesign, props: [string, string][], soil: SoilOptions,
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
  if (design.columns.length) {
    const w = worst(design.columns, (c) => c.util)!
    checks.push({ name: 'RC columns', detail: `${design.columns.length} members · governing ${w.row.id}`, ratio: w.r, ok: design.columns.every((c) => c.ok) })
  }
  if (design.scwb.length) {
    const w = design.scwb.reduce((a, b) => (b.ratio < a.ratio ? b : a))
    checks.push({ name: 'Strong column / weak beam', detail: `${design.scwb.length} joints · min ΣMnc/ΣMnb = ${f2(w.ratio)} at ${w.node} (≥ 1.20)`, ratio: null, ok: design.scwb.every((j) => j.ok) })
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
          `${s.label}${s.hogging ? ' (hog)' : s.bf ? ` · T bf=${Math.round(s.bf)}` : ''}`,
          f1(Math.abs(s.Mu)), f1(s.Vu), d.mode,
          `${d.bars}⌀${sec?.barDia}${d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}${s.hogging ? ' top' : ''}`,
          d.sAdopt > 0 ? `${d.legs}L-⌀${sec?.tieDia}@${Math.round(d.sAdopt)}` : d.region === 'none' ? 'none' : '⚠',
          k === 0 ? (bm.gov ?? '') : '',
        ]
      })
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
      const cs = colSectionAt(f.node)
      return [f.node, f0(f.P), f0(f.Pu), f2(f.design.B), f0(f.design.Dc),
        `${f.design.bars}⌀${cs?.barDia ?? fallbackSec.barDia}@${Math.round(f.design.barSpacing)} e.w.`, f.ok ? 'PASS' : 'FAIL']
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
          hogging: s.hogging, bf: s.bf, hf: s.hf, legs: s.design.legs,
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

  return { ok, governing, stats, checks, props, tables, groups }
}
