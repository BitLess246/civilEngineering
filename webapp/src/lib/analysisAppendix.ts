// ─────────────────────────────────────────────────────────────────────────
// THE ANALYSIS APPENDIX — what the engine actually computed, as tables.
//
// The design report answers "what was analysed, what governs, what was
// designed, and is it safe". This is the other half: the exact model, loads,
// combinations, reactions, displacements, member forces, modes, hinges and
// optimizer iterations that produced that design. It is built ONLY from
// results the engine returned — a section whose result was never run is
// carried as `available: false` with the reason, never fabricated, and a
// status is never PASS because its section exists.
//
// Renderer-agnostic, like `modelReport`: tables of strings, a few stats, and
// the capacity curves as `Drawing`s the PDF paints as vectors. Pure and
// synchronous; every number is the engine's own.
//
// Units as the engine reports them: geometry m, forces kN, moments kN·m,
// displacements mm (from the solver's m), rotations mrad.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection, ModelLoad } from '../engine/model'
import type { StructureDesign, LateralCase, OptimizeResult } from '../engine/pipeline'
import { designOK } from '../engine/pipeline'
import { appliedResultant, type F3Analysis, type F3Result } from '../engine/frame3d'
import type { ModalResult } from '../engine/modal'
import type { ResponseSpectrumResult } from '../engine/responseSpectrum'
import type { DriftRow, SeismicResult } from '../engine/seismic'
import type { WindResult } from '../engine/wind'
import type { IrregularityFlag } from '../engine/irregularity'
import type { PushoverModelResult } from '../engine/pushoverModel'
import type { BiaxialPushoverResult } from '../engine/biaxialFrameModel'
import type { NonlinearModelResult } from '../engine/nonlinearModel'
import type { NonlinearFrameModelResult } from '../engine/nonlinearFrameModel'
import type { RebarCage } from '../engine/rebarModel'
import type { Drawing, PlanPrimitive } from '../engine/planRenderer'
import { WOOD_SPECIES } from '../engine/woodDesign'

export type AppendixKey = 'model' | 'loading' | 'analysis' | 'modal' | 'nonlinear' | 'pushover' | 'optimization'

export interface AppendixTable { title: string; head: string[]; rows: string[][]; right?: number[]; note?: string }
export interface AppendixStat { label: string; value: string; unit?: string }
export interface AppendixFigure { caption: string; drawing: Drawing }
export interface AppendixSection {
  key: AppendixKey
  letter: string
  title: string
  /** False when the engine never produced this result; `unavailable` says why. */
  available: boolean
  unavailable?: string
  stats?: AppendixStat[]
  tables: AppendixTable[]
  notes?: string[]
  figures?: AppendixFigure[]
}

export type StatusVerdict = 'PASS' | 'FAIL' | 'COMPLETE' | 'ADVISORY' | 'NOT RUN'
export interface StatusRow { check: string; verdict: StatusVerdict; detail: string }

export interface AnalysisAppendix {
  status: StatusRow[]
  sections: AppendixSection[]
}

export interface AppendixInput {
  model: StructuralModel
  design?: StructureDesign | null
  analysis?: F3Analysis | null
  /** The lateral cases the analysis was given (E and W). */
  lateral?: LateralCase[]
  seismic?: { x: SeismicResult; z: SeismicResult } | null
  wind?: WindResult | null
  modal?: ModalResult | null
  rsa?: ResponseSpectrumResult | null
  drift?: DriftRow[] | null
  irregular?: IrregularityFlag[] | null
  pushover?: PushoverModelResult | null
  biaxial?: BiaxialPushoverResult | null
  nonlinear?: { inelastic: NonlinearModelResult | null; elastic: NonlinearModelResult | null } | null
  nonlinearHinge?: { inelastic: NonlinearFrameModelResult | null; elastic: NonlinearFrameModelResult | null } | null
  /** The optimizer's result, and the sections the model had BEFORE it ran —
   *  kept by the caller, since the result carries only the sections after. */
  optimization?: { result: OptimizeResult; before?: RectSection[] } | null
  /** The placed cages — their notes are what "final detailing" has to say. */
  cages?: RebarCage[] | null
}

const f0 = (v: number) => v.toFixed(0)
const f1 = (v: number) => v.toFixed(1)
const f2 = (v: number) => v.toFixed(2)
const f3 = (v: number) => v.toFixed(3)
const mm = (v: number) => (v * 1000).toFixed(2)
const mrad = (v: number) => (v * 1000).toFixed(3)
const pct = (v: number) => `${(v * 100).toFixed(1)}%`

export const APPENDIX_TITLES: Record<AppendixKey, string> = {
  model: 'Analytical model',
  loading: 'Loading',
  analysis: 'Linear static analysis',
  modal: 'Modal & seismic analysis',
  nonlinear: 'Nonlinear time-history',
  pushover: 'Pushover',
  optimization: 'Design optimization',
}
const LETTERS: Record<AppendixKey, string> = {
  model: 'A', loading: 'B', analysis: 'C', modal: 'D', nonlinear: 'E', pushover: 'F', optimization: 'G',
}

/** Which appendix sections the given inputs can actually populate. */
export function appendixAvailability(i: AppendixInput): Record<AppendixKey, boolean> {
  return {
    model: true,
    loading: true,
    analysis: !!i.analysis,
    modal: !!(i.modal || i.seismic || i.rsa || i.drift || (i.irregular && i.irregular.length)),
    nonlinear: !!(i.nonlinear?.inelastic || i.nonlinearHinge?.inelastic),
    pushover: !!(i.pushover || i.biaxial),
    optimization: !!i.optimization,
  }
}

// ── A · analytical model ─────────────────────────────────────────────────
function materialLabel(s: RectSection): string {
  if (s.material === 'steel') return `Steel ${s.shape ?? ''} · Fy ${s.steelFy ?? 248} · Fu ${s.steelFu ?? 400} MPa`.trim()
  if (s.material === 'wood') return `Timber ${WOOD_SPECIES[s.woodSpecies ?? '']?.label ?? s.woodSpecies ?? ''}`.trim()
  return `Concrete f′c ${s.fc} · fy ${s.fy} MPa`
}

function modelSection(i: AppendixInput): AppendixSection {
  const m = i.model
  const usedSections = new Set(m.members.map((x) => x.section))
  const sections = m.sections.filter((s) => usedSections.has(s.id))
  const materials = [...new Map(sections.map((s) => [materialLabel(s), s])).keys()]
  const cats = [...new Set(m.loads.map((l) => l.cat))]
  const combos = i.analysis ? i.analysis.perCombo.filter((r) => !r.skipped).length : (i.design?.cases.length ?? 0)
  const stats: AppendixStat[] = [
    { label: 'Nodes', value: String(m.nodes.length) },
    { label: 'Members', value: String(m.members.length) },
    { label: 'Plates / slabs', value: String(m.plates.length) },
    { label: 'Supports', value: String(m.supports.length) },
    { label: 'Sections in use', value: String(sections.length) },
    { label: 'Materials', value: String(materials.length) },
    { label: 'Load categories', value: cats.length ? cats.join(', ') : '—' },
    { label: 'Combinations run', value: combos ? String(combos) : '—' },
    { label: 'Modelling', value: [m.diaphragm && 'rigid diaphragm', m.rigidEndZones && 'rigid end zones', m.shellElements && 'shell slabs'].filter(Boolean).join(' · ') || 'bare frame' },
  ]
  const tables: AppendixTable[] = [
    {
      title: 'A.1 Node coordinates (m)',
      head: ['Node', 'X', 'Y', 'Z'], right: [1, 2, 3],
      rows: [...m.nodes].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id)).map((n) => [n.id, f2(n.x), f2(n.y), f2(n.z)]),
    },
    {
      title: 'A.2 Member connectivity',
      head: ['Member', 'Role', 'Node i', 'Node j', 'Section', 'Material'],
      rows: m.members.map((x) => {
        const s = m.sections.find((q) => q.id === x.section)
        return [x.id, x.role, x.i, x.j, s?.name ?? x.section, s ? (s.material ?? 'concrete') : '—']
      }),
    },
  ]
  if (m.plates.length) tables.push({
    title: 'A.3 Plate / slab connectivity',
    head: ['Plate', 'Role', 'Corner nodes', 'Thickness (mm)'], right: [3],
    rows: m.plates.map((p) => [p.id, p.role, p.corners.join(' · '), f0(p.thickness)]),
  })
  tables.push({
    title: 'A.4 Supports',
    head: ['Node', 'Fixity', 'Restraints / springs'],
    rows: m.supports.map((s) => [
      s.node, s.fixity,
      s.fixity === 'spring'
        ? `kx ${f0(s.kx ?? 0)} · ky ${f0(s.ky ?? 0)} · kz ${f0(s.kz ?? 0)} kN/m`
        : s.fixity === 'fixed' ? 'UX UY UZ RX RY RZ' : s.fixity === 'pin' ? 'UX UY UZ' : 'UY',
    ]),
  })
  // Every member owns a clone of its section (`generateGridModel` gives each
  // its own so the optimizer can size them apart), so the list is folded by
  // what a section IS — a 325×400 concrete section is one row however many
  // members carry it — with the count beside it.
  const secKey = (s: RectSection) => [s.name, s.material ?? 'concrete', s.shape ?? '', s.b, s.h, s.fc, s.fy, s.barDia, s.tieDia, s.cover].join('|')
  const distinct = new Map<string, { s: RectSection; n: number }>()
  for (const s of sections) {
    const k = secKey(s)
    const members = m.members.filter((x) => x.section === s.id).length
    const at = distinct.get(k)
    if (at) at.n += members; else distinct.set(k, { s, n: members })
  }
  tables.push({
    title: 'A.5 Section properties',
    head: ['Section', 'Material', 'b (mm)', 'h / d (mm)', 'Main ⌀', 'Tie ⌀', 'Cover (mm)', 'Members'], right: [2, 3, 4, 5, 6, 7],
    rows: [...distinct.values()].map(({ s, n }) => [
      s.name, s.material === 'steel' ? (s.shape ?? 'steel') : (s.material ?? 'concrete'),
      f0(s.b), f0(s.h),
      s.material && s.material !== 'concrete' ? '—' : `⌀${s.barDia}`,
      s.material && s.material !== 'concrete' ? '—' : `⌀${s.tieDia}`,
      s.material && s.material !== 'concrete' ? '—' : f0(s.cover),
      String(n),
    ]),
  })
  tables.push({
    title: 'A.6 Materials',
    head: ['Material', 'Used by'],
    rows: materials.map((lab) => [lab, [...new Set(sections.filter((s) => materialLabel(s) === lab).map((s) => s.name))].join(', ')]),
  })
  return { key: 'model', letter: LETTERS.model, title: APPENDIX_TITLES.model, available: true, stats, tables }
}

// ── B · loading ──────────────────────────────────────────────────────────
function loadRow(l: ModelLoad): string[] {
  switch (l.kind) {
    case 'node': return ['Joint load', l.node, [l.Fx && `Fx ${f1(l.Fx)}`, l.Fy && `Fy ${f1(l.Fy)}`, l.Fz && `Fz ${f1(l.Fz)}`].filter(Boolean).join(' · ') + ' kN', l.cat, '']
    case 'member-point': return ['Point load', l.member, `P ${f1(l.P)} kN at ${f2(l.t)}L`, l.cat, '']
    case 'member-udl': return ['Line load', l.member, `w ${f2(l.w)} kN/m`, l.cat, l.sw ? 'self-weight (generated)' : '']
    case 'area': return ['Area load', l.plate, `q ${f2(l.q)} kPa`, l.cat, '']
    case 'member-thermal': return ['Thermal', l.member, `ΔT ${f1(l.deltaT)} °C · α ${l.alpha.toExponential(1)}`, l.cat, '']
  }
}

/** '1.2D + 1.6L + 0.5Lr' from a combination's factor map. */
export function comboExpression(f: Partial<Record<string, number>>): string {
  const num = (v: number) => {
    const s = (Math.round(Math.abs(v) * 100) / 100).toString()
    return s.includes('.') ? s : `${s}.0`
  }
  return Object.entries(f).filter(([, v]) => v && Math.abs(v) > 1e-9)
    .map(([k, v], i) => `${i === 0 ? (v! < 0 ? '−' : '') : v! < 0 ? '− ' : '+ '}${num(v!)}${k}`)
    .join(' ')
}

function loadingSection(i: AppendixInput): AppendixSection {
  const m = i.model
  const byCat = new Map<string, number>()
  for (const l of m.loads) byCat.set(l.cat, (byCat.get(l.cat) ?? 0) + 1)
  const tables: AppendixTable[] = [{
    title: 'B.1 Load cases',
    head: ['Case', 'Kind', 'Assignments'], right: [2],
    rows: [
      ...[...byCat].map(([c, n]) => [c, c === 'D' ? 'dead' : c === 'L' ? 'live' : c === 'Lr' ? 'roof live' : c === 'W' ? 'wind' : c === 'E' ? 'earthquake' : c === 'T' ? 'self-straining' : c, String(n)]),
      ...(i.lateral ?? []).map((c) => [c.name, c.kind === 'E' ? 'earthquake (directional)' : 'wind (directional)', String(c.loads.length)]),
    ],
  }]
  tables.push({
    title: 'B.2 Load assignments',
    head: ['Kind', 'On', 'Magnitude', 'Case', 'Note'],
    rows: m.loads.map(loadRow),
  })
  if (i.seismic) {
    for (const [dir, s] of [['X', i.seismic.x], ['Z', i.seismic.z]] as const) {
      tables.push({
        title: `B.3 Static seismic — NSCP §208.5, ${dir} direction`,
        head: ['Level (m)', 'hx (m)', 'wx (kN)', 'Fx (kN)', 'Nodes'], right: [0, 1, 2, 3, 4],
        rows: s.storeys.map((r) => [f2(r.elevation), f2(r.hx), f1(r.wx), f1(r.Fx), String(r.nodes)]),
        note: `T = ${f3(s.T)} s (method ${s.Tmethod}; Ta = ${f3(s.Ta)} s) · W = ${f1(s.W)} kN · V = ${f1(s.V)} kN (raw ${f1(s.Vraw)}, min ${f1(s.Vmin)}, max ${f1(s.Vmax)}) · Ft = ${f1(s.Ft)} kN`,
      })
    }
  }
  if (i.wind) {
    const w = i.wind
    tables.push({
      title: 'B.4 Wind — NSCP §207',
      head: ['Level (m)', 'Kz', 'qz (kPa)', 'p windward (kPa)', 'p leeward (kPa)', 'Fx (kN)'], right: [0, 1, 2, 3, 4, 5],
      rows: w.levels.map((l) => [f2(l.elevation), f3(l.Kz), f3(l.qz), f3(l.pWind), f3(l.pLee), f1(l.Fx)]),
      note: `V = ${f0(w.V)} m/s · h = ${f1(w.h)} m · B = ${f1(w.B)} m · L = ${f1(w.L)} m · G = ${f2(w.G)} · qh = ${f3(w.qh)} kPa · base shear ${f1(w.baseShear)} kN`,
    })
  }
  if (i.analysis) {
    tables.push({
      title: 'B.5 Load combinations (NSCP 2015 §203.3.1)',
      head: ['Combination', 'Factors', 'Run'],
      rows: i.analysis.perCombo.map((r) => [r.combo.name, comboExpression(r.combo.f), r.skipped ? 'skipped — no loads' : r.result ? 'yes' : 'failed']),
    })
  } else if (i.design) {
    tables.push({
      title: 'B.5 Load cases run by the design envelope',
      head: ['Case'],
      rows: i.design.cases.map((c) => [c]),
    })
  }
  return { key: 'loading', letter: LETTERS.loading, title: APPENDIX_TITLES.loading, available: true, tables }
}

// ── C · linear static analysis ───────────────────────────────────────────
function memberLengthFn(m: StructuralModel): (id: string) => number {
  const pos = new Map(m.nodes.map((n) => [n.id, n]))
  const len = new Map<string, number>()
  for (const x of m.members) {
    const a = pos.get(x.i), b = pos.get(x.j)
    if (a && b) len.set(x.id, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
  }
  return (id) => len.get(id) ?? 0
}

export interface EquilibriumRow { combo: string; applied: [number, number, number]; reactions: [number, number, number]; residualPct: number; ok: boolean }

/** ΣApplied against ΣReactions, per combination — the statics self-check. */
export function equilibriumRows(model: StructuralModel, analysis: F3Analysis): EquilibriumRow[] {
  const memberLen = memberLengthFn(model)
  const out: EquilibriumRow[] = []
  for (const run of analysis.perCombo) {
    if (!run.result) continue
    const applied = appliedResultant(run.factored, memberLen)
    const rx = run.result.reactions.reduce((a, r) => [a[0] + r.F[0], a[1] + r.F[1], a[2] + r.F[2]] as [number, number, number], [0, 0, 0] as [number, number, number])
    const resid = [applied[0] + rx[0], applied[1] + rx[1], applied[2] + rx[2]]
    const scale = Math.max(...rx.map(Math.abs), Math.abs(applied[1]), 1e-9)
    const residualPct = (Math.max(...resid.map(Math.abs)) / scale) * 100
    out.push({ combo: run.combo.name, applied, reactions: rx, residualPct, ok: residualPct < 1 })
  }
  return out
}

const abs6 = (v: number[]) => v.reduce((a, b) => Math.max(a, Math.abs(b)), 0)

function analysisSection(i: AppendixInput): AppendixSection {
  const a = i.analysis
  if (!a) return { key: 'analysis', letter: LETTERS.analysis, title: APPENDIX_TITLES.analysis, available: false, unavailable: 'The 3D FEM analysis has not been run.', tables: [] }
  const m = i.model
  const gov = a.perCombo[a.govIdx]
  const valid = a.perCombo.filter((r) => !!r.result)
  const eq = equilibriumRows(m, a)
  const stats: AppendixStat[] = [
    { label: 'Combinations solved', value: String(valid.length) },
    { label: 'Governing combination', value: gov?.combo.name ?? '—' },
    { label: 'Max |M|', value: f1(gov?.result?.Mmax ?? 0), unit: 'kN·m' },
    { label: 'Max |V|', value: f1(gov?.result?.Vmax ?? 0), unit: 'kN' },
    { label: 'Max |N|', value: f1(gov?.result?.Nmax ?? 0), unit: 'kN' },
    { label: 'Equilibrium', value: eq.every((r) => r.ok) ? 'satisfied' : 'residual > 1%' },
  ]
  const tables: AppendixTable[] = []
  tables.push({
    title: 'C.1 Static equilibrium check — ΣApplied vs ΣReactions',
    head: ['Combination', 'ΣFx applied', 'ΣFx reactions', 'ΣFy applied', 'ΣFy reactions', 'ΣFz applied', 'ΣFz reactions', 'Residual', 'Status'],
    right: [1, 2, 3, 4, 5, 6, 7],
    rows: eq.map((r) => [r.combo, f1(r.applied[0]), f1(r.reactions[0]), f1(r.applied[1]), f1(r.reactions[1]), f1(r.applied[2]), f1(r.reactions[2]), `${r.residualPct.toExponential(1)}%`, r.ok ? 'PASS' : 'FAIL']),
    note: 'Forces in kN. Member gravity loads act in global −Y; the residual is the largest axis imbalance as a share of the largest resultant.',
  })
  // reactions — governing combo in full, then the envelope per node
  const reactionRows = (res: F3Result, combo: string) =>
    [...res.reactions].sort((p, q) => p.node.localeCompare(q.node))
      .map((r) => [r.node, combo, f1(r.F[0]), f1(r.F[1]), f1(r.F[2]), f2(r.M[0]), f2(r.M[1]), f2(r.M[2])])
  if (gov?.result) tables.push({
    title: `C.2 Support reactions — ${gov.combo.name} (governing)`,
    head: ['Node', 'Combination', 'FX (kN)', 'FY (kN)', 'FZ (kN)', 'MX (kN·m)', 'MY (kN·m)', 'MZ (kN·m)'], right: [2, 3, 4, 5, 6, 7],
    rows: reactionRows(gov.result, gov.combo.name),
  })
  {
    // governing reaction summary: the largest of each component and where
    const comps = ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'] as const
    const rows: string[][] = comps.map((c, k) => {
      let best = { v: 0, node: '—', combo: '—' }
      for (const run of valid) for (const r of run.result!.reactions) {
        const v = k < 3 ? r.F[k] : r.M[k - 3]
        if (Math.abs(v) > Math.abs(best.v)) best = { v, node: r.node, combo: run.combo.name }
      }
      return [c, k < 3 ? f1(best.v) : f2(best.v), best.node, best.combo]
    })
    tables.push({ title: 'C.3 Governing reactions', head: ['Component', 'Max (kN / kN·m)', 'Node', 'Combination'], right: [1], rows })
  }
  // displacements: envelope per node (largest magnitude over combos, signed)
  {
    const pick = (p: number, q: number) => (Math.abs(q) > Math.abs(p) ? q : p)
    const rows = [...m.nodes].map((n, idx) => ({ n, idx })).sort((p, q) => p.n.y - q.n.y || p.n.id.localeCompare(q.n.id)).map(({ n, idx }) => {
      const acc = [0, 0, 0, 0, 0, 0]
      for (const run of valid) for (let k = 0; k < 6; k++) acc[k] = pick(acc[k], run.result!.d[6 * idx + k] ?? 0)
      return [n.id, f2(n.y), mm(acc[0]), mm(acc[1]), mm(acc[2]), mrad(acc[3]), mrad(acc[4]), mrad(acc[5])]
    })
    const gmax = [0, 1, 2, 3, 4, 5].map((k) => rows.reduce((a, r) => Math.max(a, Math.abs(parseFloat(r[2 + k]))), 0))
    tables.push({
      title: 'C.4 Node displacements — envelope over combinations',
      head: ['Node', 'Level (m)', 'UX (mm)', 'UY (mm)', 'UZ (mm)', 'RX (mrad)', 'RY (mrad)', 'RZ (mrad)'], right: [1, 2, 3, 4, 5, 6, 7],
      rows,
      note: `Global maxima: |UX| ${f2(gmax[0])} · |UY| ${f2(gmax[1])} · |UZ| ${f2(gmax[2])} mm · |RX| ${f3(gmax[3])} · |RY| ${f3(gmax[4])} · |RZ| ${f3(gmax[5])} mrad. Signed value with the largest magnitude over every solved combination.`,
    })
  }
  // member forces — governing combo maxima, and the governing table
  if (gov?.result) {
    const sec = (id: string) => m.sections.find((s) => s.id === m.members.find((x) => x.id === id)?.section)?.name ?? ''
    const order = { column: 0, brace: 1, girder: 2, beam: 3 } as Record<string, number>
    const roleOf = (id: string) => m.members.find((x) => x.id === id)?.role ?? ''
    const sorted = [...gov.result.members].sort((p, q) => (order[roleOf(p.id)] ?? 9) - (order[roleOf(q.id)] ?? 9) || p.id.localeCompare(q.id))
    tables.push({
      title: `C.5 Member forces — ${gov.combo.name} (governing), maxima along each member`,
      head: ['Member', 'Role', 'Section', 'N (kN)', 'Vy (kN)', 'Vz (kN)', 'T (kN·m)', 'My (kN·m)', 'Mz (kN·m)'], right: [3, 4, 5, 6, 7, 8],
      rows: sorted.map((r) => [r.id, roleOf(r.id), sec(r.id), f1(r.Nmax), f1(abs6(r.Vy)), f1(abs6(r.Vz)), f1(r.Tmax), f1(abs6(r.My)), f1(abs6(r.Mz))]),
    })
    // governing member forces over ALL combos: which combo, compression, tension, shear, torsion, M+, M−
    const rows: string[][] = sorted.map((r0) => {
      let comp = 0, tens = 0, V = 0, T = 0, Mpos = 0, Mneg = 0, govCombo = '—', govM = -1
      for (const run of valid) {
        const r = run.result!.members.find((x) => x.id === r0.id)
        if (!r) continue
        comp = Math.min(comp, ...r.N); tens = Math.max(tens, ...r.N)
        V = Math.max(V, abs6(r.Vy), abs6(r.Vz)); T = Math.max(T, r.Tmax)
        Mpos = Math.max(Mpos, ...r.Mz); Mneg = Math.min(Mneg, ...r.Mz)
        if (r.Mmax > govM) { govM = r.Mmax; govCombo = run.combo.name }
      }
      return [r0.id, govCombo, f1(-comp), f1(tens), f1(V), f1(T), f1(Mpos), f1(Mneg)]
    })
    tables.push({
      title: 'C.6 Governing member forces — envelope over combinations',
      head: ['Member', 'Governing combo (|M|)', 'Compression (kN)', 'Tension (kN)', 'Shear (kN)', 'Torsion (kN·m)', 'M+ (kN·m)', 'M− (kN·m)'], right: [2, 3, 4, 5, 6, 7],
      rows,
      note: 'The design pipeline reads its demands from this envelope: each section is designed for the combination that governs it, and the schedule names that combination in its Case column.',
    })
  }
  const pd = valid.filter((r) => r.result?.pDelta)
  const notes = pd.length
    ? [`P-Δ: ${pd.filter((r) => r.result!.pDelta!.converged).length} of ${pd.length} combinations converged (max ${Math.max(...pd.map((r) => r.result!.pDelta!.iterations))} iterations).`]
    : undefined
  return { key: 'analysis', letter: LETTERS.analysis, title: APPENDIX_TITLES.analysis, available: true, stats, tables, notes }
}

// ── D · modal & seismic ──────────────────────────────────────────────────
function modalSection(i: AppendixInput): AppendixSection {
  const tables: AppendixTable[] = []
  const stats: AppendixStat[] = []
  const notes: string[] = []
  if (i.modal) {
    const md = i.modal
    let cx = 0, cy = 0, cz = 0
    tables.push({
      title: 'D.1 Modes',
      head: ['Mode', 'Period (s)', 'Frequency (Hz)', 'ω (rad/s)', 'Mass X', 'Mass Y', 'Mass Z', 'Σ X', 'Σ Y', 'Σ Z'], right: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      rows: md.modes.map((mo, k) => {
        cx += mo.effMassRatio[0]; cy += mo.effMassRatio[1]; cz += mo.effMassRatio[2]
        return [String(k + 1), f3(mo.period), f3(mo.freq), f2(mo.omega), pct(mo.effMassRatio[0]), pct(mo.effMassRatio[1]), pct(mo.effMassRatio[2]), pct(cx), pct(cy), pct(cz)]
      }),
      note: `Total lumped mass X ${f1(md.totalMass[0])} · Y ${f1(md.totalMass[1])} · Z ${f1(md.totalMass[2])} t. Effective modal mass as a share of the total; the governing mode in each direction is the one with the largest share.`,
    })
    stats.push(
      { label: 'Modes', value: String(md.modes.length) },
      { label: 'T1', value: md.modes[0] ? f3(md.modes[0].period) : '—', unit: 's' },
      { label: 'Σ mass X / Z', value: `${pct(md.cumRatio[0])} / ${pct(md.cumRatio[2])}` },
    )
    if (md.cumRatio[0] < 0.9 || md.cumRatio[2] < 0.9)
      notes.push(`Cumulative effective mass is below 90% in ${md.cumRatio[0] < 0.9 ? 'X' : ''}${md.cumRatio[0] < 0.9 && md.cumRatio[2] < 0.9 ? ' and ' : ''}${md.cumRatio[2] < 0.9 ? 'Z' : ''} — NSCP §208.5.5 asks for enough modes to reach 90%. Increase the number of modes.`)
  }
  if (i.rsa) {
    const r = i.rsa
    tables.push({
      title: 'D.2 Response spectrum — modal base shears (NSCP §208 elastic spectrum)',
      head: ['Mode', 'Period (s)', 'Sa (m/s²)', 'Sa/g', 'V X (kN)', 'V Y (kN)', 'V Z (kN)'], right: [1, 2, 3, 4, 5, 6],
      rows: r.modalForces.map((mf) => [String(mf.modeIdx + 1), f3(mf.period), f2(mf.Sa), f3(mf.SaG), f1(mf.baseShear[0]), f1(mf.baseShear[1]), f1(mf.baseShear[2])]),
      note: `Ca ${r.params.Ca} · Cv ${r.params.Cv} · I ${r.params.I} · R ${r.params.R} · Ts ${f3(r.params.Ts)} s. SRSS: X ${f1(r.srss[0])} · Z ${f1(r.srss[2])} kN. CQC: X ${f1(r.cqc[0])} · Z ${f1(r.cqc[2])} kN${r.cqcRatio[0] != null ? ` · V_CQC/V_static X ${f2(r.cqcRatio[0])}` : ''}${r.cqcRatio[2] != null ? ` · Z ${f2(r.cqcRatio[2])}` : ''}.`,
    })
  }
  if (i.drift && i.drift.length) {
    tables.push({
      title: 'D.3 Storey drift — NSCP §208.6.5 (ΔM = 0.7·R·Δs)',
      head: ['Level (m)', 'hs (m)', 'Δs (mm)', 'ΔM (mm)', 'Limit (mm)', 'Status'], right: [0, 1, 2, 3, 4],
      rows: i.drift.map((d) => [f2(d.elevation), f2(d.hs), f2(d.ds), f2(d.dM), f2(d.limit), d.ok ? 'PASS' : 'FAIL']),
    })
  }
  if (i.irregular) {
    tables.push({
      title: 'D.4 Structural irregularities — NSCP Tables 208-9 / 208-10',
      head: ['Code', 'Type', 'Where', 'Ratio', 'Limit', 'Verdict'], right: [3, 4],
      rows: i.irregular.length
        ? i.irregular.map((f) => [f.code, f.name, f.elevation != null ? `EL ${f2(f.elevation)} m${f.dir ? ` · ${f.dir.toUpperCase()}` : ''}` : (f.dir?.toUpperCase() ?? '—'), f2(f.ratio), f2(f.limit), f.verdict === 'extreme' ? 'Extreme' : 'Irregular'])
        : [['—', 'Regular', 'torsional, soft-storey, mass and vertical-geometric checks all pass', '—', '—', 'Regular']],
    })
  }
  const available = tables.length > 0
  return {
    key: 'modal', letter: LETTERS.modal, title: APPENDIX_TITLES.modal, available,
    unavailable: available ? undefined : 'No modal, response-spectrum, drift or regularity run.',
    stats: stats.length ? stats : undefined, tables, notes: notes.length ? notes : undefined,
  }
}

// ── E · nonlinear time-history ───────────────────────────────────────────
function nonlinearSection(i: AppendixInput): AppendixSection {
  const tables: AppendixTable[] = []
  const stats: AppendixStat[] = []
  const notes: string[] = []
  const h = i.nonlinearHinge
  if (h?.inelastic) {
    const ie = h.inelastic, el = h.elastic
    const r = ie.response
    stats.push(
      { label: 'Model', value: 'plane frame · member-end hinges' },
      { label: 'Elastic period', value: f3(ie.period), unit: 's' },
      { label: 'Steps', value: String(r.t.length) },
      { label: 'Convergence', value: r.converged ? 'every step' : 'NOT every step' },
      { label: 'Max Newton iterations', value: String(r.maxIterations) },
      { label: 'Yielded hinges', value: String(r.yieldedHinges) },
      { label: 'Peak roof displacement', value: mm(r.peakDisp), unit: 'mm' },
      { label: 'Peak base shear', value: f1(r.peakBaseShear), unit: 'kN' },
      { label: 'Hysteretic energy', value: f2(r.totalDissipated), unit: 'kN·m' },
    )
    if (el?.response) {
      notes.push(`Elastic reference run: peak displacement ${mm(el.response.peakDisp)} mm, peak base shear ${f1(el.response.peakBaseShear)} kN — inelastic/elastic displacement ratio ${f2(r.peakDisp / Math.max(el.response.peakDisp, 1e-9))}, base-shear ratio ${f2(r.peakBaseShear / Math.max(el.response.peakBaseShear, 1e-9))}.`)
    }
    notes.push(`Rayleigh damping C = αM + βK with α ${ie.rayleigh.alpha.toExponential(3)}, β ${ie.rayleigh.beta.toExponential(3)}.`)
    const yielded = r.hinges.filter((x) => x.yielded)
    tables.push({
      title: 'E.1 Plastic hinges — member-end hinge model',
      head: ['Member', 'End', 'Moment (kN·m)', 'Rotation (mrad)', 'Plastic (mrad)', 'Dissipated (kN·m)', 'State'], right: [2, 3, 4, 5],
      rows: (yielded.length ? yielded : r.hinges).map((x) => [x.member, x.end, f1(x.moment), mrad(x.rotation), mrad(x.plastic), f2(x.dissipated), x.yielded ? 'yielded' : 'elastic']),
      note: yielded.length ? `${yielded.length} of ${r.hinges.length} hinges yielded; only those are listed.` : `None of the ${r.hinges.length} hinges yielded under this record.`,
    })
  }
  const n = i.nonlinear
  if (n?.inelastic) {
    const ie = n.inelastic, el = n.elastic
    const r = ie.response
    stats.push(
      { label: 'Model', value: 'equivalent shear building' },
      { label: 'Period', value: f3(ie.period), unit: 's' },
      { label: 'Steps', value: String(r.steps) },
      { label: 'Convergence', value: r.converged ? 'every step' : 'NOT every step' },
      { label: 'Max Newton iterations', value: String(r.maxIterations) },
      { label: 'Worst residual', value: r.worstResidual.toExponential(2) },
      { label: 'Peak base force', value: f1(r.peakBaseForce), unit: 'kN' },
      { label: 'Yielded', value: r.yielded ? 'yes' : 'no' },
    )
    tables.push({
      title: 'E.2 Storey response — shear-building model',
      head: ['Storey', 'Top level (m)', 'h (m)', 'Mass (t)', 'Peak disp (mm)', 'Ductility μ', 'Dissipated (kN·m)'], right: [1, 2, 3, 4, 5, 6],
      rows: ie.storeys.map((s, k) => [String(s.storey), f2(s.elevation), f2(s.h), f2(s.mass), mm(r.peak[k] ?? 0), f2(r.ductility[k] ?? 0), f2(r.dissipated[k] ?? 0)]),
      note: el?.response ? `Elastic reference: peak base force ${f1(el.response.peakBaseForce)} kN.` : undefined,
    })
  }
  const available = stats.length > 0
  return {
    key: 'nonlinear', letter: LETTERS.nonlinear, title: APPENDIX_TITLES.nonlinear, available,
    unavailable: available ? undefined : 'No nonlinear time-history has been run.',
    stats: available ? stats : undefined, tables, notes: notes.length ? notes : undefined,
  }
}

// ── F · pushover ─────────────────────────────────────────────────────────
/**
 * A capacity curve as a `Drawing` — axes, the polyline, and a dot at each
 * event — so the PDF paints it as vectors through the same painter as every
 * other figure. Drawn in its own unit box (100 × 60) with Y down the page,
 * as `planToSvg` reads it.
 */
export function capacityCurveDrawing(
  pts: { x: number; y: number; mark?: boolean }[], o: { title: string; xLabel: string; yLabel: string },
): Drawing {
  const W = 100, H = 60, L = 14, R = 3, T = 8, B = 12
  const xMax = Math.max(1e-9, ...pts.map((p) => p.x)), yMax = Math.max(1e-9, ...pts.map((p) => p.y))
  const X = (v: number) => L + ((W - L - R) * v) / xMax
  const Y = (v: number) => H - B - ((H - B - T) * v) / yMax
  const P: PlanPrimitive[] = []
  const INK = '#1e293b', GRID = '#cbd5e1', LINE = '#0f4c92', DOT = '#dc2626'
  P.push({ kind: 'text', x: L, y: T - 4, text: o.title, size: 3.2, anchor: 'start', color: INK, weight: 700 })
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    P.push({ kind: 'line', x1: L, y1: Y(yMax * f), x2: W - R, y2: Y(yMax * f), stroke: GRID, width: 0.5 })
    P.push({ kind: 'text', x: L - 1.2, y: Y(yMax * f), text: f1(yMax * f), size: 2.2, anchor: 'end', color: INK })
    P.push({ kind: 'text', x: X(xMax * f), y: H - B + 3, text: f1(xMax * f), size: 2.2, anchor: 'middle', color: INK })
  }
  P.push({ kind: 'line', x1: L, y1: Y(0), x2: W - R, y2: Y(0), stroke: INK, width: 1 })
  P.push({ kind: 'line', x1: L, y1: Y(0), x2: L, y2: T, stroke: INK, width: 1 })
  if (pts.length > 1) P.push({
    kind: 'path', stroke: LINE, width: 1.6, fill: 'none', join: 'round', cap: 'round',
    cmds: pts.map((p, k) => ({ c: k === 0 ? 'M' as const : 'L' as const, x: X(p.x), y: Y(p.y) })),
  })
  for (const p of pts) P.push({ kind: 'circle', cx: X(p.x), cy: Y(p.y), r: p.mark ? 0.9 : 0.6, fill: p.mark ? DOT : LINE, stroke: 'none' })
  P.push({ kind: 'text', x: (L + W - R) / 2, y: H - 1.5, text: o.xLabel, size: 2.6, anchor: 'middle', color: INK, weight: 600 })
  P.push({ kind: 'text', x: 3, y: (T + H - B) / 2, text: o.yLabel, size: 2.6, anchor: 'middle', color: INK, weight: 600, rotate: -90 })
  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: W, maxY: H } }
}

function pushoverSection(i: AppendixInput): AppendixSection {
  const tables: AppendixTable[] = []
  const stats: AppendixStat[] = []
  const figures: AppendixFigure[] = []
  const notes: string[] = []
  const po = i.pushover
  if (po) {
    const curve = po.result.curve
    const peakV = Math.max(0, ...curve.map((p) => Math.abs(p.baseShear)))
    const peakD = Math.max(0, ...curve.map((p) => Math.abs(p.roofDisp)))
    stats.push(
      { label: 'Control node', value: po.controlNode },
      { label: 'Hingeable members', value: String(po.nHingeable) },
      { label: 'Events', value: String(Math.max(0, curve.length - 1)) },
      { label: 'Peak base shear', value: f1(peakV), unit: 'kN' },
      { label: 'Peak roof displacement', value: mm(peakD), unit: 'mm' },
      { label: 'Roof drift', value: po.totalHeight > 0 ? pct(peakD / po.totalHeight) : '—', unit: 'of H' },
      { label: 'Outcome', value: po.result.mechanism ? 'collapse mechanism' : 'stable to target' },
      { label: 'P–M interaction', value: po.pmInteraction ? 'on' : 'off' },
      { label: 'P-Δ', value: po.pDelta ? 'on' : 'off' },
    )
    figures.push({
      caption: 'F.1 Capacity curve — base shear against control-node displacement; a red event is a new hinge',
      drawing: capacityCurveDrawing(
        curve.map((p) => ({ x: Math.abs(p.roofDisp) * 1000, y: Math.abs(p.baseShear), mark: !!p.newHinge })),
        { title: `PUSHOVER — ${po.controlNode}`, xLabel: 'control-node displacement (mm)', yLabel: 'base shear (kN)' },
      ),
    })
    const byEvent = new Map(po.result.hinges.map((h) => [h.event, h]))
    tables.push({
      title: 'F.2 Hinge formation — event-to-event',
      head: ['Event', 'λ', 'Base shear (kN)', 'Roof disp (mm)', 'Hinge formed', 'Type', 'Hinges'], right: [1, 2, 3, 6],
      rows: curve.filter((p) => p.event > 0).map((p) => {
        const h = byEvent.get(p.event)
        return [String(p.event), f3(p.lambda), f1(p.baseShear), mm(p.roofDisp),
          p.newHinge ? `${p.newHinge.member} @${p.newHinge.end}` : '—',
          p.newHinge ? (p.newHinge.type === 'moment' ? `M${p.newHinge.axis ?? ''}` : p.newHinge.type === 'shear' ? `V${p.newHinge.axis ?? ''}` : 'axial') + (h?.Mpc != null ? ` (Mpc ${f1(h.Mpc)})` : '') : '—',
          String(p.numHinges)]
      }),
    })
    notes.push('Event-to-event plastic-hinge method: the lateral pattern is normalised to Σ = 1, so the load factor λ is the base shear. No target displacement or performance point is computed — the curve is reported to the last event or the collapse mechanism, whichever came first.')
  }
  const bx = i.biaxial
  if (bx) {
    stats.push(
      { label: 'Biaxial push angle', value: f0(bx.angleDeg), unit: '°' },
      { label: 'Biaxial peak shear', value: f1(bx.peakShear), unit: 'kN' },
      { label: 'Biaxial yielded hinges', value: String(bx.yieldedHinges) },
      { label: 'Biaxial outcome', value: bx.result.mechanism ? 'collapse mechanism' : bx.result.converged ? 'converged' : 'did not converge' },
    )
    figures.push({
      caption: `F.3 Biaxial pushover at ${f0(bx.angleDeg)}° — full 3-D model with P–My–Mz hinges, measured along ${bx.controlDir.toUpperCase()}`,
      drawing: capacityCurveDrawing(
        bx.curve.map((p) => ({ x: Math.abs(p.disp) * 1000, y: Math.abs(p.shear) })),
        { title: `BIAXIAL PUSHOVER — ${f0(bx.angleDeg)}°`, xLabel: `control-node displacement along ${bx.controlDir.toUpperCase()} (mm)`, yLabel: 'base shear (kN)' },
      ),
    })
    const yielded = bx.result.hinges.filter((h) => h.utilisation >= 0.999)
    if (yielded.length) tables.push({
      title: 'F.4 Biaxial hinges at yield — end of push',
      head: ['Member', 'End', 'My (kN·m)', 'Mz (kN·m)', 'Plastic θy (mrad)', 'Plastic θz (mrad)', 'D/C'], right: [2, 3, 4, 5, 6],
      rows: yielded.map((h) => [h.member, h.end, f1(h.My), f1(h.Mz), mrad(h.plasticY), mrad(h.plasticZ), f2(h.utilisation)]),
    })
  }
  const available = stats.length > 0
  return {
    key: 'pushover', letter: LETTERS.pushover, title: APPENDIX_TITLES.pushover, available,
    unavailable: available ? undefined : 'No pushover has been run.',
    stats: available ? stats : undefined, tables, figures: figures.length ? figures : undefined, notes: notes.length ? notes : undefined,
  }
}

// ── G · optimization ─────────────────────────────────────────────────────
export const OPTIMIZER_OBJECTIVE =
  'The optimizer changes member sizes, slab thicknesses and wall thicknesses, and (when bar search is on) the bar diameter and count of every RC member. '
  + 'It first GROWS whatever fails until every NSCP/ACI check passes, then SHRINKS what is comfortably under capacity — depth, then width, then slab thickness — '
  + 'keeping each trial only while every check still passes, so the result is the smallest set of sections found that is fully compliant. '
  + 'Reinforcement is chosen per member by ranking every feasible layout on compliance (a hard gate), then crack control, constructability and economy — not on least steel alone. '
  + 'Safety is the pipeline\'s own checks on the re-analysed structure at every iteration; efficiency is the size and steel that survive the shrink phase.'

function optimizationSection(i: AppendixInput): AppendixSection {
  const o = i.optimization
  if (!o) return { key: 'optimization', letter: LETTERS.optimization, title: APPENDIX_TITLES.optimization, available: false, unavailable: 'The optimizer has not been run; the design is as modelled.', tables: [] }
  const r = o.result
  const stats: AppendixStat[] = [
    { label: 'Outcome', value: r.converged ? 'converged — all checks pass' : 'stopped short' },
    { label: 'Iterations', value: String(r.steps.length) },
    { label: 'Sections grown', value: String(r.steps.reduce((s, x) => s + x.grown, 0)) },
    { label: 'Failing at start', value: String(r.steps[0]?.fails ?? 0) },
    { label: 'Failing at end', value: String(r.steps[r.steps.length - 1]?.fails ?? 0) },
    { label: 'Final design', value: designOK(r.design) ? 'SAFE' : 'CHECK FAILED' },
  ]
  const tables: AppendixTable[] = [{
    title: 'G.1 Iteration history',
    head: ['Iteration', 'Sections changed', 'Failing checks', 'Status'], right: [1, 2],
    rows: r.steps.map((s, k) => [k === 0 ? '0 (initial)' : String(s.iter), s.grown ? String(s.grown) : '—', String(s.fails), s.ok ? 'PASS' : 'grow failing']),
    note: r.stopReason,
  }]
  if (o.before) {
    const beforeById = new Map(o.before.map((s) => [s.id, s]))
    const changed = r.model.sections.filter((s) => {
      const b = beforeById.get(s.id)
      return b && (b.b !== s.b || b.h !== s.h || b.shape !== s.shape || b.barDia !== s.barDia || b.barCount !== s.barCount)
    })
    const util = (id: string): string => {
      const c = r.design.columns.find((x) => r.model.members.find((m) => m.id === x.id)?.section === id)
      if (c) return f2(c.util)
      const sb = r.design.steelBeams.find((x) => r.model.members.find((m) => m.id === x.id)?.section === id)
      if (sb) return f2(Math.max(sb.utilM, sb.utilV))
      const sc = r.design.steelColumns.find((x) => r.model.members.find((m) => m.id === x.id)?.section === id)
      if (sc) return f2(sc.ratio)
      return '—'
    }
    const desc = (s: RectSection) => s.material === 'steel' ? (s.shape ?? s.name) : `${s.b}×${s.h}${s.material === 'wood' ? '' : ` · ⌀${s.barDia}${s.barCount ? ` × ${s.barCount}` : ''}`}`
    tables.push({
      title: 'G.2 Initial vs final design',
      head: ['Section', 'Initial', 'Final', 'Change', 'Final utilisation'], right: [4],
      rows: changed.length
        ? changed.map((s) => {
          const b = beforeById.get(s.id)!
          const dv = s.material === 'steel' ? '' : `${s.b * s.h > b.b * b.h ? '+' : ''}${(((s.b * s.h) / (b.b * b.h) - 1) * 100).toFixed(0)}% area`
          return [s.name, desc(b), desc(s), dv || 'shape', util(s.id)]
        })
        : [['—', '—', '—', 'no section changed', '—']],
      note: 'Utilisation is the final design\'s own: the biaxial ratio for an RC column, the strength ratio for a steel member. RC beams are sized per section and carry no single ratio.',
    })
  }
  return {
    key: 'optimization', letter: LETTERS.optimization, title: APPENDIX_TITLES.optimization, available: true,
    stats, tables, notes: [OPTIMIZER_OBJECTIVE],
  }
}

// ── the status table — actual results only ───────────────────────────────
export function analysisStatus(i: AppendixInput): StatusRow[] {
  const rows: StatusRow[] = []
  const notRun = (check: string, what: string) => rows.push({ check, verdict: 'NOT RUN', detail: what })
  if (i.analysis) {
    const eq = equilibriumRows(i.model, i.analysis)
    const worst = Math.max(0, ...eq.map((r) => r.residualPct))
    rows.push({ check: 'Static equilibrium', verdict: eq.every((r) => r.ok) ? 'PASS' : 'FAIL', detail: `${eq.length} combinations · worst residual ${worst.toExponential(1)}%` })
    const pd = i.analysis.perCombo.filter((r) => r.result?.pDelta)
    const pdBad = pd.filter((r) => !r.result!.pDelta!.converged || r.result!.pDelta!.singular)
    rows.push({
      check: 'Linear analysis', verdict: pdBad.length ? 'FAIL' : 'PASS',
      detail: `${eq.length} combinations solved · governing ${i.analysis.perCombo[i.analysis.govIdx]?.combo.name ?? '—'}${pd.length ? ` · P-Δ ${pd.length - pdBad.length}/${pd.length} converged` : ''}`,
    })
  } else { notRun('Static equilibrium', 'run the 3D FEM analysis'); notRun('Linear analysis', 'run the 3D FEM analysis') }
  if (i.modal) {
    const ok = i.modal.cumRatio[0] >= 0.9 && i.modal.cumRatio[2] >= 0.9
    rows.push({ check: 'Modal analysis', verdict: ok ? 'PASS' : 'ADVISORY', detail: `${i.modal.modes.length} modes · Σ mass X ${pct(i.modal.cumRatio[0])} · Z ${pct(i.modal.cumRatio[2])}${ok ? '' : ' (< 90%, §208.5.5)'}` })
  } else notRun('Modal analysis', 'run the modal analysis')
  if (i.drift && i.drift.length) rows.push({ check: 'Storey drift (§208.6.5)', verdict: i.drift.every((d) => d.ok) ? 'PASS' : 'FAIL', detail: `${i.drift.filter((d) => !d.ok).length} of ${i.drift.length} storeys over the limit` })
  const nlh = i.nonlinearHinge?.inelastic, nls = i.nonlinear?.inelastic
  if (nlh || nls) {
    const conv = (nlh ? nlh.response.converged : true) && (nls ? nls.response.converged : true)
    rows.push({ check: 'Nonlinear analysis', verdict: conv ? 'PASS' : 'FAIL', detail: `${nlh ? `hinge model: ${nlh.response.yieldedHinges} hinges yielded, ${nlh.response.maxIterations} max iterations` : ''}${nlh && nls ? ' · ' : ''}${nls ? `shear building: ${nls.response.steps} steps${nls.response.yielded ? ', yielded' : ''}` : ''}` })
  } else notRun('Nonlinear analysis', 'run a nonlinear time-history')
  if (i.pushover || i.biaxial) {
    const mech = !!i.pushover?.result.mechanism || !!i.biaxial?.result.mechanism
    rows.push({ check: 'Pushover analysis', verdict: 'COMPLETE', detail: `${i.pushover ? `${Math.max(0, i.pushover.result.curve.length - 1)} events, ${i.pushover.result.hinges.length} hinges` : ''}${i.pushover && i.biaxial ? ' · ' : ''}${i.biaxial ? `biaxial ${f0(i.biaxial.angleDeg)}°: ${i.biaxial.yieldedHinges} yielded` : ''}${mech ? ' · collapse mechanism formed' : ''}` })
  } else notRun('Pushover analysis', 'run a pushover')
  const d = i.design
  if (d) {
    const grp = (check: string, rowsOf: { ok: boolean }[], what: string) => {
      if (!rowsOf.length) return
      const bad = rowsOf.filter((r) => !r.ok).length
      rows.push({ check, verdict: bad ? 'FAIL' : 'PASS', detail: `${rowsOf.length} ${what}${bad ? ` · ${bad} failing` : ''}` })
    }
    grp('Beam design', [...d.beams, ...d.steelBeams, ...d.woodBeams], 'members')
    grp('Column design', [...d.columns, ...d.steelColumns, ...d.woodColumns], 'members')
    if (d.columns.length) {
      const bad = d.columns.filter((c) => !c.ok).length
      const w = d.columns.reduce((a, c) => (c.util > a.util ? c : a))
      rows.push({ check: 'Biaxial column check', verdict: bad ? 'FAIL' : 'PASS', detail: `${d.columns.length} columns · governing ${w.id} at ${f2(w.util)} (${w.biaxialMethod})` })
    }
    if (d.scwb.length) grp('Beam–column joints (SCWB §418.7.3.2)', d.scwb, 'joints')
    grp('Slab design', [...d.slabs, ...d.woodSlabs], 'panels')
    grp('Footing design', [...d.footings, ...d.combined], 'footings')
    if (d.walls.length) grp('Shear walls', d.walls, 'walls')
    if (d.joints.length || d.beamJoints.length) grp('Steel connections', [...d.joints, ...d.beamJoints], 'joints')
  } else {
    for (const c of ['Beam design', 'Column design', 'Slab design', 'Footing design']) notRun(c, 'run the design')
  }
  if (i.optimization) {
    const r = i.optimization.result
    rows.push({ check: 'Optimization', verdict: r.converged ? 'COMPLETE' : 'FAIL', detail: r.converged ? `${r.steps.length} iterations · all checks pass` : (r.stopReason ?? 'stopped short') })
  } else notRun('Optimization', 'the design is as modelled')
  if (i.cages) {
    const notes = i.cages.flatMap((c) => c.notes ?? [])
    rows.push({ check: 'Final detailing', verdict: notes.length ? 'ADVISORY' : 'PASS', detail: notes.length ? `${i.cages.length} cages placed · ${notes.length} detailing note${notes.length === 1 ? '' : 's'} (see the drawings)` : `${i.cages.length} cages placed · no detailing notes` })
  } else if (d) notRun('Final detailing', 'cages not built')
  return rows
}

/** The whole appendix. Sections the inputs cannot fill are carried as unavailable. */
export function buildAnalysisAppendix(i: AppendixInput): AnalysisAppendix {
  return {
    status: analysisStatus(i),
    sections: [
      modelSection(i), loadingSection(i), analysisSection(i), modalSection(i),
      nonlinearSection(i), pushoverSection(i), optimizationSection(i),
    ],
  }
}
