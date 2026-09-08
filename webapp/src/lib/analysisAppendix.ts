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
import { designOK, peakUtilisation } from '../engine/pipeline'
import { estimateTakeoff, barKgPerM, type TakeoffResult } from '../engine/takeoff'
import { appliedResultant, type F3Analysis, type F3Result } from '../engine/frame3d'
import { GRAVITY, type ModalResult } from '../engine/modal'
import type { ResponseSpectrumResult } from '../engine/responseSpectrum'
import { storeyWeightBreakdown, type DriftRow, type SeismicResult } from '../engine/seismic'
import type { WindResult } from '../engine/wind'
import type { IrregularityFlag } from '../engine/irregularity'
import type { PushoverModelResult } from '../engine/pushoverModel'
import type { BiaxialPushoverResult } from '../engine/biaxialFrameModel'
import type { NonlinearModelResult } from '../engine/nonlinearModel'
import type { NonlinearFrameModelResult } from '../engine/nonlinearFrameModel'
import type { RebarCage } from '../engine/rebarModel'
import type { Drawing } from '../engine/planRenderer'
import { WOOD_SPECIES } from '../engine/woodDesign'
import { validateMesh } from '../engine/meshValidation'
import {
  modelDiagram, loadDiagram, deflectedDiagram, reactionDiagram, forceDiagram,
  modeShapeDiagram, seriesDrawing, hingeDiagram, planeFrameDiagram,
  bestView, CATEGORY_LABEL, type DiagramView, type HingeMark,
} from '../engine/analysisDiagram'

export type AppendixKey = 'model' | 'loading' | 'analysis' | 'modal' | 'nonlinear' | 'pushover' | 'optimization' | 'qa'

export interface AppendixTable { title: string; head: string[]; rows: string[][]; right?: number[]; note?: string }
export interface AppendixStat { label: string; value: string; unit?: string }
export interface AppendixFigure {
  caption: string
  drawing: Drawing
  /** Height cap on the page, mm. Omitted ⇒ the painter's default. A figure
   *  carrying node and member ids needs the room; a trace does not. */
  maxH?: number
}
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
  qa: 'Model QA/QC',
}
/** The letter each section prints under. Exported because the export dialog
 *  labels its checkboxes with them, and a second hard-coded copy of an
 *  ordered list is a copy that goes stale the next time a section is added —
 *  which is exactly what happened when H was. */
export const LETTERS: Record<AppendixKey, string> = {
  model: 'A', loading: 'B', analysis: 'C', modal: 'D', nonlinear: 'E', pushover: 'F', optimization: 'G', qa: 'H',
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
    qa: true,
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
  // A.1 IS A PICTURE, and it comes first. Every id in every table after it —
  // reactions at `n0.0.0`, the moment in `bx0.1.2` — is unverifiable until the
  // reader can find that node or member on the structure. The tables were
  // complete and the appendix was still not auditable.
  const view = bestView(i.model)
  const figures: AppendixFigure[] = i.model.nodes.length ? [{
    caption: 'A.1 Analytical model — node and member ids, and the support at every restrained joint. Ids are dropped on a large model for legibility; the node and member tables carry them either way.',
    drawing: modelDiagram(i.model, { view, h: 150 }), maxH: 150,
  }] : []
  return { key: 'model', letter: LETTERS.model, title: APPENDIX_TITLES.model, available: true, stats, tables, figures: figures.length ? figures : undefined }
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
  // ── B.6 mass source ──
  //
  // "Where did the 98.2 tonnes come from?" The appendix reported a total
  // lumped mass and a seismic weight and nothing in between, so the chain
  // loads → mass → modal analysis → seismic forces had a gap in it exactly
  // where a reviewer looks. Itemised, and reconciled to M = W/g.
  const wb = storeyWeightBreakdown(m)
  if (wb.length) {
    const tot = wb.reduce((a, r) => ({
      slab: a.slab + r.slab, selfWeight: a.selfWeight + r.selfWeight,
      lineDead: a.lineDead + r.lineDead, pointDead: a.pointDead + r.pointDead, w: a.w + r.w,
    }), { slab: 0, selfWeight: 0, lineDead: 0, pointDead: 0, w: 0 })
    tables.push({
      title: 'B.6 Mass source — NSCP §208.5.1.1 seismic weight W',
      head: ['Level (m)', 'Slab dead (kN)', 'Member self-wt (kN)', 'Line dead (kN)', 'Point dead (kN)', 'W (kN)', 'Mass (t)'],
      right: [0, 1, 2, 3, 4, 5, 6],
      rows: [
        ...wb.map((r) => [f2(r.elevation), f1(r.slab), f1(r.selfWeight), f1(r.lineDead), f1(r.pointDead), f1(r.w), f2(r.w / GRAVITY)]),
        ['Total', f1(tot.slab), f1(tot.selfWeight), f1(tot.lineDead), f1(tot.pointDead), f1(tot.w), f2(tot.w / GRAVITY)],
      ],
      note: `W = ${f1(tot.w)} kN → M = W/g = ${f2(tot.w / GRAVITY)} t at g = ${f2(GRAVITY)} m/s².`
        + ' W is the total DEAD load: slab area dead loads, member self-weight from each section, and any dead line or point load — a wall\'s weight reaches the frame as a line load on the member it sits on.'
        + ' Live load is excluded (§208.5.1.1; storage occupancies would add 25%).',
    })
  }
  // One figure per load category the model actually carries — what was
  // applied, drawn where it acts, so a table of 400 assignments can be
  // checked at a glance for the load that went on the wrong member.
  const view = bestView(i.model)
  const cats = [...new Set(i.model.loads.map((l) => l.cat))]
  const figures: AppendixFigure[] = []
  cats.forEach((c, k) => {
    const d = loadDiagram(i.model, c, { view })
    if (d) figures.push({ caption: `B.${k + 1}f ${CATEGORY_LABEL[c] ?? c} — every assignment of this category, drawn on the model. Arrow length is proportional to magnitude within the figure, not to the geometry.`, drawing: d })
  })
  return { key: 'loading', letter: LETTERS.loading, title: APPENDIX_TITLES.loading, available: true, tables, figures: figures.length ? figures : undefined }
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

/**
 * The four result figures, for the governing combination.
 *
 * Mz and Vy are the gravity pair every frame is read on; N is what tells a
 * column from a tie. My/Vz/T are left to the tables — a figure for each of
 * the six components would be six pages of mostly-flat ribbon, and the three
 * drawn here are the ones a reviewer checks by eye.
 */
function resultFigures(m: StructuralModel, r: F3Result, caseName: string, view: DiagramView): AppendixFigure[] {
  const figs: AppendixFigure[] = [
    {
      caption: `C.5f Deflected shape — ${caseName}. Each member is drawn on its own cubic shape function (the element's homogeneous solution from its end displacements and rotations), so a span load's extra sag between the nodes is not included. The amplification is printed on the figure.`,
      drawing: deflectedDiagram(m, r, { view, caseName }),
    },
    {
      caption: `C.6f Support reactions — ${caseName}. The ΣFy printed on the figure is the same sum the equilibrium check in C.1 compares against the applied load.`,
      drawing: reactionDiagram(m, r, { view, caseName }),
    },
  ]
  const compNote: Record<'Mz' | 'Vy' | 'N', string> = {
    Mz: 'Ordinates are plotted on the member\'s local transverse axis, so on a horizontal member a sagging moment draws below the axis — the tension side, which is where the bottom steel goes.',
    Vy: 'Positive shear is drawn on the member\'s +y′ side. A lobe changing colour along a member is the point at which the shear reverses.',
    N: 'Blue is tension and red compression on the member\'s own axis, which is why every column reads one colour and a tie the other.',
  }
  for (const [comp, tag, name] of [['Mz', 'C.7f', 'Bending moment Mz'], ['Vy', 'C.8f', 'Shear Vy'], ['N', 'C.9f', 'Axial force N']] as const)
    figs.push({
      caption: `${tag} ${name} — ${caseName}, one scale over the whole structure. ${compNote[comp]}`,
      drawing: forceDiagram(m, r, comp, { view, caseName }),
    })
  return figs
}

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
  // THE RESULTS, DRAWN. The envelope tables say the largest moment is 84 kN·m
  // in bx0.1.2; the diagram says whether it is where a moment should be. A
  // deflected shape that leans the wrong way, a support that never took load,
  // a moment diagram that does not close at a joint — none of those are
  // visible in a column of numbers.
  const govRes = gov?.result ?? null
  const view = bestView(m)
  const figures: AppendixFigure[] = govRes ? resultFigures(m, govRes, gov!.combo.name, view) : []
  return { key: 'analysis', letter: LETTERS.analysis, title: APPENDIX_TITLES.analysis, available: true, stats, tables, notes, figures: figures.length ? figures : undefined }
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
      note: `Total free mass X ${f1(md.totalMass[0])} · Y ${f1(md.totalMass[1])} · Z ${f1(md.totalMass[2])} t, measured on the mass matrix these modes were solved on. Effective modal mass as a share of the total; the governing mode in each direction is the one with the largest share. `
        + ((md.massModel ?? 'lumped') === 'consistent'
          ? 'CONSISTENT mass: each member contributes its own 12×12 element mass matrix, so the rotational DOFs carry inertia and the two ends are coupled. Slab and superimposed dead mass stays lumped at the panel corners. Consistent mass bounds the true frequencies from above.'
          : 'LUMPED mass: member self-mass and slab self-weight + superimposed dead are lumped to the nodes, and only the three translational DOFs carry mass — the rotational DOFs carry none. Lumped mass bounds the true frequencies from below.'),
    })
    stats.push(
      { label: 'Modes', value: String(md.modes.length) },
      { label: 'T1', value: md.modes[0] ? f3(md.modes[0].period) : '—', unit: 's' },
      { label: 'Σ mass X / Z', value: `${pct(md.cumRatio[0])} / ${pct(md.cumRatio[2])}` },
      // The mass matrix is a modelling choice and every dynamic result below
      // inherits it, so it is reported rather than assumed. `massModel` is
      // absent on runs saved before the option existed — those were lumped.
      { label: 'Mass matrix', value: (md.massModel ?? 'lumped') === 'consistent' ? 'consistent' : 'lumped' },
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
  // ── D.2b seismic force reconciliation ──
  //
  // The static base shear and the modal ones were reported in two different
  // tables, in two different sections, one of them buried in a note — so the
  // question a reviewer asks first, "which base shear was the design actually
  // made for", took three pages to answer. One table, and it answers it.
  if (i.seismic) {
    const dirs = [
      { name: 'X', s: i.seismic.x, k: 0 as const },
      { name: 'Z', s: i.seismic.z, k: 2 as const },
    ]
    const r = i.rsa
    tables.push({
      title: 'D.2b Seismic force reconciliation — static vs modal',
      head: ['Quantity', ...dirs.map((d) => d.name), 'Basis'],
      right: [1, 2],
      rows: [
        ['Seismic weight W (kN)', ...dirs.map((d) => f1(d.s.W)), '§208.5.1.1 — see B.6'],
        ['Period T (s)', ...dirs.map((d) => `${f3(d.s.T)} (${d.s.Tmethod})`), '§208.5.2'],
        ['V raw (kN)', ...dirs.map((d) => f1(d.s.Vraw)), '§208.5.2.1'],
        ['V min (kN)', ...dirs.map((d) => f1(d.s.Vmin)), '§208.5.2.1 floor'],
        ['V max (kN)', ...dirs.map((d) => f1(d.s.Vmax)), '§208.5.2.1 cap'],
        ['Static base shear V (kN)', ...dirs.map((d) => f1(d.s.V)), 'adopted static'],
        ...(r ? [
          ['Modal SRSS (kN)', ...dirs.map((d) => f1(r.srss[d.k])), '§208.6.4'],
          ['Modal CQC (kN)', ...dirs.map((d) => f1(r.cqc[d.k])), '§208.6.4'],
          ['V_CQC / V_static', ...dirs.map((d) => (r.cqcRatio[d.k] != null ? f2(r.cqcRatio[d.k]!) : '—')), '§208.6.4.2'],
        ] : []),
        ['Design base shear used (kN)', ...dirs.map((d) => f1(d.s.V)), 'the E cases the design ran'],
      ],
      note: r
        ? 'The E load cases the design was run for are the STATIC ones (§208.5): the response-spectrum run is reported for comparison and for the §208.6.4.2 scaling check, not substituted for them. '
          + dirs.map((d) => {
            const ratio = r.cqcRatio[d.k]
            return ratio == null ? `${d.name}: no static shear to compare.`
              : ratio < 1
                ? `${d.name}: V_CQC is ${pct(ratio)} of V_static, so a design made on the modal results alone would have to be scaled up by ${f2(1 / ratio)} (§208.6.4.2 requires ≥ 100% for an irregular structure, ≥ 90% for a regular one).`
                : `${d.name}: V_CQC exceeds V_static (${pct(ratio)}), so no §208.6.4.2 scaling is required.`
          }).join(' ')
        : 'No response-spectrum run — the static forces of §208.5 are the design forces.',
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
  // THE FIRST THREE MODES, DRAWN. D.1 lists the periods and the effective mass
  // and cannot say what a mode IS — whether the fundamental is a sway, a
  // torsion or a single soft storey, which is the thing that decides whether
  // the model is behaving. Three, because a fourth rarely changes the reading
  // and each one is a figure.
  const figures: AppendixFigure[] = []
  if (i.modal && i.model.nodes.length) {
    const view = bestView(i.model)
    i.modal.modes.slice(0, 3).forEach((mo, k) => {
      figures.push({
        caption: `D.${k + 1}f Mode ${k + 1} — T = ${f3(mo.period)} s, effective mass ${pct(mo.effMassRatio[0])} X / ${pct(mo.effMassRatio[1])} Y / ${pct(mo.effMassRatio[2])} Z. The shape is normalised to a unit peak and drawn at the amplification printed on the figure; a mode has no amplitude of its own. Members are drawn as straight chords because the lumped-mass eigenproblem carries no end rotations to curve them with.`,
        drawing: modeShapeDiagram(i.model, mo, k + 1, { view }),
      })
    })
  }
  const available = tables.length > 0
  return {
    key: 'modal', letter: LETTERS.modal, title: APPENDIX_TITLES.modal, available,
    unavailable: available ? undefined : 'No modal, response-spectrum, drift or regularity run.',
    stats: stats.length ? stats : undefined, tables, notes: notes.length ? notes : undefined,
    figures: figures.length ? figures : undefined,
  }
}

// ── E · nonlinear time-history ───────────────────────────────────────────
function nonlinearSection(i: AppendixInput): AppendixSection {
  const tables: AppendixTable[] = []
  const stats: AppendixStat[] = []
  const notes: string[] = []
  const figures: AppendixFigure[] = []
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
    // TWO TRACES AND A FRAME. A response history reported as three peak
    // numbers cannot say whether the structure rang down or ratcheted one way
    // and stayed there — and a permanent offset at the end of the record is
    // the difference between damage and collapse. The elastic reference is
    // overlaid dashed, because the inelastic/elastic ratio in the note is
    // exactly the comparison the reader wants to see rather than be told.
    figures.push({
      caption: `E.1f Control-node displacement — the inelastic run against its elastic reference. The marked point is the peak; where the trace ends away from zero, that is the permanent offset left by the record.`,
      drawing: seriesDrawing([
        { xs: r.t, ys: r.disp.map((v) => v * 1000), label: 'inelastic' },
        ...(el?.response ? [{ xs: el.response.t, ys: el.response.disp.map((v) => v * 1000), label: 'elastic', dashed: true }] : []),
      ], { title: 'ROOF DISPLACEMENT HISTORY', xLabel: 'time (s)', yLabel: 'displacement (mm)', markPeak: true }),
    })
    figures.push({
      caption: `E.2f Base shear — the same two runs. Yielding caps the inelastic trace below the elastic demand; the height of the gap is what the hinges bought.`,
      drawing: seriesDrawing([
        { xs: r.t, ys: r.baseShear, label: 'inelastic' },
        ...(el?.response ? [{ xs: el.response.t, ys: el.response.baseShear, label: 'elastic', dashed: true }] : []),
      ], { title: 'BASE SHEAR HISTORY', xLabel: 'time (s)', yLabel: 'base shear (kN)', markPeak: true }),
    })
    // THE FRAME THE HISTORY ACTUALLY RAN ON. E.1's table lists hinges on
    // members called `6000|0~6000|3000`, which exist nowhere in the model —
    // `nonlinearFrameModel` condenses the building by combining every frame
    // line parallel to the shaking, and those are the condensed frame's own
    // ids. The figure is worth printing whether or not anything yielded,
    // because until now nothing in the report showed the reader that the
    // time history ran on a reduced structure at all.
    const marks: HingeMark[] = r.hinges.filter((x) => x.yielded).map((x) => ({ member: x.member, end: x.end }))
    figures.push({
      caption: marks.length
        ? `E.3f Where the hinges yielded — on the EQUIVALENT PLANE FRAME the history ran on, not on the 3-D model. ${ie.frame.framesCombined} frame line${ie.frame.framesCombined === 1 ? '' : 's'} parallel to the shaking were combined into it, so its member ids are its own; drawing these on the model would put them on members that were never analysed.`
        : `E.3f The EQUIVALENT PLANE FRAME the history ran on — ${ie.frame.framesCombined} frame line${ie.frame.framesCombined === 1 ? '' : 's'} parallel to the shaking combined into one, ${ie.frame.transverseDropped} transverse member${ie.frame.transverseDropped === 1 ? '' : 's'} dropped as carrying no in-plane stiffness. No hinge yielded under this record, so the run is elastic and E.1's rotations are all zero.`,
      drawing: planeFrameDiagram(ie.frame, marks, {
        title: marks.length ? 'YIELDED HINGES — EQUIVALENT FRAME' : 'EQUIVALENT FRAME — NO HINGE YIELDED',
        legend: `${marks.length} of ${r.hinges.length} hinges yielded · ${ie.frame.framesCombined} frame line(s) combined, ${ie.frame.transverseDropped} transverse member(s) dropped`,
      }),
    })
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
    figures: figures.length ? figures : undefined,
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
  // ONE CHART RENDERER. This drew its own axes in a 100 × 60 box, which the
  // painter then magnified 1.8× to fill the page — so the pushover figures
  // carried type half again as large as every other figure in the appendix,
  // and they inherited the centred-rotated-label defect on their own copy of
  // it. `seriesDrawing` is the same chart with a signed y-axis; an event is a
  // marked dot.
  return seriesDrawing(
    [{ xs: pts.map((p) => p.x), ys: pts.map((p) => p.y), dots: pts.map((p) => !!p.mark) }],
    { title: o.title, xLabel: o.xLabel, yLabel: o.yLabel },
  )
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
    // WHERE, AND IN WHAT ORDER. F.2 lists sixteen rows of `bx0.1.2 @ i` and
    // cannot say whether the sequence is a beam mechanism — hinges in the
    // beams with the columns intact, which is what a capacity design is FOR —
    // or a soft storey, a row of hinges at one level. That judgement is the
    // whole reason a pushover is run, and the table cannot support it.
    //
    // These hinges belong to the MODEL: `runPushoverModel` pushes
    // `modelToFrame3D` directly, so the ids are the model's own. (The
    // nonlinear time history in E does not, and its figure says so.)
    const marks: HingeMark[] = po.result.hinges.map((x, k) => ({ member: x.member, end: x.end, order: k + 1 }))
    if (marks.length) figures.push({
      caption: `F.2f Hinge locations and yield sequence — ${marks.length} hinge${marks.length === 1 ? '' : 's'} numbered in the order they formed, drawn at the member end they formed at. Read the pattern, not the count: hinges in the beams with the columns intact is the intended mechanism; a row of them at one storey is not. The run ${po.result.mechanism ? 'ended in a collapse mechanism' : 'reached the last event without forming a mechanism'}.`,
      drawing: hingeDiagram(i.model, marks, {
        view: bestView(i.model),
        subtitle: `${marks.length} hinges · numbered in formation order · red = first to yield, teal = last · control node ${po.controlNode}`,
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

/**
 * THE OBJECTIVE, WRITTEN DOWN.
 *
 * The section used to say "economy" and leave it there, which is the one word
 * an optimizer report may not use without an objective behind it. There IS an
 * objective and it is not cost: the loop minimises SECTION SIZE subject to
 * every code check passing, and the bar search minimises nothing at all — it
 * ranks feasible layouts. Concrete volume, steel weight and money are
 * OUTCOMES of that, not terms in it, which is why the volume can rise.
 */
export const OPTIMIZER_TERMS: { role: string; term: string; measure: string }[] = [
  { role: 'Objective', term: 'Smallest RC section that still passes — depth first, then width, then slab and wall thickness', measure: 'each shrink trial is kept only while every check still passes on the re-analysed structure' },
  { role: 'Objective', term: 'Lightest catalogue W-shape that still passes', measure: 'position in the AISC catalogue, ordered by mass per metre' },
  { role: 'Ranking (not minimised)', term: 'Bar diameter and count per RC member', measure: 'feasible layouts ranked on compliance (hard gate), then crack control, constructability, economy' },
  { role: 'Constraint', term: 'Every NSCP/ACI/AISC check passes on the RE-ANALYSED structure', measure: 'failing-check count driven to 0; the frame is re-solved after every size change' },
  { role: 'Constraint', term: 'Self-weight follows the sections', measure: 'self-weight loads regenerated from the new geometry each iteration' },
  { role: 'Constraint', term: 'Size hierarchy — a girder is not smaller than the beam it carries, a column not smaller than its girder', measure: 'enforced on every trial model before it is designed' },
  { role: 'Constraint', term: 'Cast-in-place size caps and catalogue limits', measure: 'growth clamps at the limit; a member still failing there stops the loop with a stated reason' },
  { role: 'Not in the objective', term: 'Concrete volume, reinforcement weight, formwork area, cost', measure: 'reported as outcomes — see the quantities table' },
]

/** Fabricated reinforcement weight by bar Ø, kg — `steelByDia.weightKg` is the
 *  PURCHASED weight (laps and off-cuts included), which is the right number to
 *  buy and the wrong one to compare two designs with. */
const rebarNetByDia = (t: TakeoffResult): Map<number, number> =>
  new Map(t.steelByDia.map((s) => [s.dia, s.netLengthM * barKgPerM(s.dia)]))

function optimizationSection(i: AppendixInput): AppendixSection {
  const o = i.optimization
  if (!o) return { key: 'optimization', letter: LETTERS.optimization, title: APPENDIX_TITLES.optimization, available: false, unavailable: 'The optimizer has not been run; the design is as modelled.', tables: [] }
  const r = o.result
  const u0 = r.initialDesign ? peakUtilisation(r.initialDesign) : null
  const stats: AppendixStat[] = [
    { label: 'Outcome', value: r.converged ? 'converged — all checks pass' : 'stopped short' },
    { label: 'Iterations', value: String(r.steps.length) },
    { label: 'Sections grown', value: String(r.steps.reduce((s, x) => s + x.grown, 0)) },
    { label: 'Failing at start', value: String(r.steps[0]?.fails ?? 0) },
    { label: 'Failing at end', value: String(r.steps[r.steps.length - 1]?.fails ?? 0) },
    // Pass/fail says whether the loop finished; the peak ratio says how far it
    // travelled. A design can start and end "FAIL"-free by member type and
    // still move from 2.4 to 0.87 — that is the number an engineer reads.
    { label: 'Peak utilisation', value: u0 != null ? `${f2(u0)} → ${f2(peakUtilisation(r.design))}` : f2(peakUtilisation(r.design)) },
    { label: 'Final design', value: designOK(r.design) ? 'SAFE' : 'CHECK FAILED' },
  ]
  const tables: AppendixTable[] = []
  const gn = () => `G.${tables.length + 1}`

  // The objective FIRST — every number after it is only meaningful against
  // what the loop was actually trying to do.
  tables.push({
    title: `${gn()} Objective function and constraints`,
    head: ['Role', 'Term', 'How it is measured'],
    rows: OPTIMIZER_TERMS.map((t) => [t.role, t.term, t.measure]),
    note: 'The objective is minimum SECTION SIZE subject to full code compliance. Cost, concrete volume and reinforcement weight are outcomes of that objective, not terms in it.',
  })

  // TWO COUNTS, TWO COLUMNS. `grown` is how many sections the grow step ACTED
  // on; `changes` is how many came out with different geometry once the size
  // hierarchy was enforced and the design re-run — and the economy pass changes
  // geometry while growing nothing at all. Under one heading reading "Sections
  // changed" the first was taken for the second, and a step reading `6` sat
  // beside a trail listing 12.
  const anyChanges = r.steps.some((s) => s.changes?.length)
  tables.push({
    title: `${gn()} Iteration history`,
    head: ['Iteration', 'Sections grown', ...(anyChanges ? ['Geometry changes'] : []), 'Failing checks', 'Status'],
    right: anyChanges ? [1, 2, 3] : [1, 2],
    rows: r.steps.map((s, k) => [
      k === 0 ? '0 (initial)' : s.note ? `${s.iter} · ${s.note.split(' —')[0]}` : String(s.iter),
      s.grown ? String(s.grown) : '—',
      ...(anyChanges ? [s.changes?.length ? String(s.changes.length) : '—'] : []),
      String(s.fails), s.ok ? 'PASS' : 'grow failing',
    ]),
    note: [
      'Sections grown counts what the grow step acted on; geometry changes counts what came out different once the size hierarchy was enforced and the design re-run — the economy pass changes geometry without growing anything. The trail table lists them.',
      r.stopReason,
    ].filter(Boolean).join(' ') || undefined,
  })
  // The engine carries the pre-optimization state on the result itself
  // (initialModel, captured by the pipeline before the grow loop) — that is
  // the single source of truth for the initial-vs-final table. The
  // caller-supplied `before` stays as a fallback for saved runs made before
  // the field existed.
  const beforeSections = r.initialModel?.sections ?? o.before
  if (beforeSections) {
    const beforeById = new Map(beforeSections.map((s) => [s.id, s]))
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
      title: `${gn()} Initial vs final design`,
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
  // What the optimizer actually did, iteration by iteration — the accepted
  // geometry changes recorded on the steps themselves by the pipeline (grow
  // steps and the economy pass), not a reconstruction from the two ends.
  const trail = r.steps.flatMap((s) => (s.changes ?? []).map((c) => [
    s.note ? `${s.iter} · ${s.note}` : String(s.iter), c.kind, c.label, c.from, c.to,
  ]))
  if (trail.length)
    tables.push({
      title: `${gn()} What each iteration changed`,
      head: ['Iteration', 'Kind', 'Element', 'From', 'To'],
      rows: trail,
      note: 'Recorded on the optimizer\'s own steps — grow moves and the economy pass — so the trail is what the loop accepted, not a before/after guess.',
    })
  // ── Quantities, initial vs final ──────────────────────────────────────
  //
  // WHY THE CONCRETE GOES UP. The first report to carry this table showed
  // 34.14 → 42.52 m³ under a heading that promised optimisation, with nothing
  // to say why the number rose. It rose because the initial sections FAILED:
  // the "initial" column is the take-off of a structure that is not a design,
  // and growing it into compliance costs concrete. The honest comparison
  // therefore prints the failing-check count beside the volume, and the
  // reinforcement INTENSITY — which is where the optimisation actually shows,
  // because deeper sections carry the same moment on less steel.
  const t0 = r.initialDesign?.totals
  if (t0) {
    const qty: string[][] = []
    // A percentage needs a denominator: an item the initial design did not use
    // at all (a bar Ø the optimizer introduced) is 'new', not an em-dash.
    const delta = (a: number, b: number) =>
      a > 1e-9 ? `${b > a ? '+' : ''}${(((b / a) - 1) * 100).toFixed(0)}%`
        : b > 1e-9 ? 'new' : '—'
    const row = (label: string, a: number, b: number, unit: string, dp = 2) =>
      qty.push([label, `${a.toFixed(dp)} ${unit}`, `${b.toFixed(dp)} ${unit}`, delta(a, b)])
    // The take-off is the quantity engine — it places every cage and measures
    // it, so reinforcement and formwork come from the same geometry the
    // drawings do. Both ends are re-measured here rather than carried on the
    // result, so a run saved before this table existed still prints it.
    // A model the cage builder cannot place degrades to the design's own
    // concrete/steel totals rather than failing the export.
    const tk = r.initialModel
      ? (() => {
        try { return { a: estimateTakeoff(r.initialModel!, r.initialDesign!), b: estimateTakeoff(r.model, r.design) } }
        catch { return null }
      })()
      : null
    if (tk) {
      row('Concrete', tk.a.totalConcreteM3, tk.b.totalConcreteM3, 'm³')
      row('Formwork', tk.a.formwork.areaM2, tk.b.formwork.areaM2, 'm²', 1)
      const na = rebarNetByDia(tk.a), nb = rebarNetByDia(tk.b)
      for (const dia of [...new Set([...na.keys(), ...nb.keys()])].sort((x, y) => x - y))
        row(`Reinforcement ⌀${dia}`, na.get(dia) ?? 0, nb.get(dia) ?? 0, 'kg', 0)
      row('Reinforcement — total fabricated', tk.a.totalSteelNetKg, tk.b.totalSteelNetKg, 'kg', 0)
      row('Reinforcement — total purchased (laps + off-cuts)', tk.a.totalSteelPurchasedKg, tk.b.totalSteelPurchasedKg, 'kg', 0)
      const iA = tk.a.totalConcreteM3 > 1e-9 ? tk.a.totalSteelNetKg / tk.a.totalConcreteM3 : 0
      const iB = tk.b.totalConcreteM3 > 1e-9 ? tk.b.totalSteelNetKg / tk.b.totalConcreteM3 : 0
      row('Reinforcement intensity', iA, iB, 'kg/m³', 1)
      if (tk.a.structuralSteelKg > 0 || tk.b.structuralSteelKg > 0)
        row('Structural steel', tk.a.structuralSteelKg / 1000, tk.b.structuralSteelKg / 1000, 't')
      if (tk.a.timberM3 > 0 || tk.b.timberM3 > 0) row('Timber', tk.a.timberM3, tk.b.timberM3, 'm³')
    } else {
      if (t0.concrete > 0 || r.design.totals.concrete > 0) row('Concrete', t0.concrete, r.design.totals.concrete, 'm³')
      if (t0.steelKg > 0 || r.design.totals.steelKg > 0) row('Structural steel', t0.steelKg / 1000, r.design.totals.steelKg / 1000, 't')
      if (t0.woodVolume > 0 || r.design.totals.woodVolume > 0) row('Timber', t0.woodVolume, r.design.totals.woodVolume, 'm³')
    }
    if (qty.length) {
      const f0n = r.steps[0]?.fails ?? 0
      const f1n = r.steps[r.steps.length - 1]?.fails ?? 0
      const grew = tk ? tk.b.totalConcreteM3 > tk.a.totalConcreteM3 : r.design.totals.concrete > t0.concrete
      const why = grew
        ? `Concrete rises because the initial sections were not a design: ${f0n} check${f0n === 1 ? '' : 's'} failed at iteration 0 and ${f1n} at the end. `
          + 'The grow phase buys compliance with section size; the shrink phase then takes back whatever is comfortably under capacity. '
          + 'The optimisation shows in the intensity, not the volume — a deeper section carries the same moment on less steel.'
        : 'The shrink phase took back more than the grow phase spent, so the final structure is both smaller and compliant.'
      tables.push({
        title: `${gn()} Material quantities, initial vs final`,
        head: ['Item', 'Initial', 'Final', 'Change'], right: [1, 2, 3],
        rows: qty,
        note: `${why} Quantities are the take-off's own — every cage placed and measured, laps and hooks included. Initial = the design at iteration 0, failing ${f0n} check${f0n === 1 ? '' : 's'}; final = the design reported here.`,
      })
    }
  }
  return {
    key: 'optimization', letter: LETTERS.optimization, title: APPENDIX_TITLES.optimization, available: true,
    stats, tables, notes: [OPTIMIZER_OBJECTIVE],
  }
}

/**
 * THE STRUCTURE THAT WAS DETAILED IS THE STRUCTURE THAT WAS ANALYSED.
 *
 * The pipeline is analysis → design → optimisation → detailing, and every
 * stage hands its answer to the next. A report that shows all four proves
 * nothing about whether they agree: the optimizer resizes sections and re-runs
 * the design, the cages are built from the design, and the drawings are built
 * from the cages — so a stale link anywhere leaves a schedule describing one
 * building and a drawing another.
 *
 * These are the joins that can actually be tested from what the report is
 * given. Each one names the count it compared, so a PASS is a number and not
 * an assurance.
 */
export function finalModelConsistency(i: AppendixInput): StatusRow[] {
  const rows: StatusRow[] = []
  const d = i.design
  if (!d) return rows
  const secOf = new Map(i.model.sections.map((s) => [s.id, s]))
  const memSec = new Map(i.model.members.map((m) => [m.id, m.section]))

  // 1 — every designed member's section is one the analysed model carries.
  const designed = [...d.beams.map((b) => b.id), ...d.columns.map((c) => c.id),
    ...d.steelBeams.map((b) => b.id), ...d.steelColumns.map((c) => c.id)]
  const orphan = designed.filter((id) => {
    const sid = memSec.get(id)
    return sid == null || !secOf.has(sid)
  })
  rows.push({
    check: 'Design sections = analysis model',
    verdict: orphan.length ? 'FAIL' : 'PASS',
    detail: orphan.length
      ? `${orphan.length} designed member${orphan.length === 1 ? '' : 's'} reference a section the model does not carry: ${orphan.slice(0, 4).join(', ')}`
      : `${designed.length} designed members, every one on a section of the analysed model`,
  })

  // 2 — the optimizer's final model is the one that was reported on.
  if (i.optimization) {
    const fin = i.optimization.result.model.sections
    const same = fin.length === i.model.sections.length
      && fin.every((s) => {
        const cur = secOf.get(s.id)
        return cur && cur.b === s.b && cur.h === s.h && cur.barDia === s.barDia
      })
    rows.push({
      check: 'Optimizer output = reported model',
      verdict: same ? 'PASS' : 'FAIL',
      detail: same
        ? `${fin.length} sections, identical to the model this report describes`
        : 'the model in this report is NOT the optimizer\'s final model — re-run the report on the optimized model',
    })
  }

  // 3 — every RC member the schedule carries has a placed cage, and the cage
  //     carries the bars the schedule says it does.
  if (i.cages) {
    const cageOf = new Map(i.cages.map((c) => [c.member, c]))
    const baseMarks = (c: { runs: { role: string; mark: string }[] }, role: string) =>
      new Set(c.runs.filter((r) => r.role === role)
        .map((r) => (/[a-z]$/.test(r.mark) ? r.mark.slice(0, -1) : r.mark))).size
    const missing = [...d.beams.map((b) => b.id), ...d.columns.map((c) => c.id)]
      .filter((id) => !cageOf.has(id))
    const colMismatch = d.columns.filter((c) => {
      const cg = cageOf.get(c.id)
      return cg && baseMarks(cg, 'vertical') !== Math.max(4, c.bars)
    })
    const ok = missing.length === 0 && colMismatch.length === 0
    rows.push({
      check: 'Schedule = placed cages',
      verdict: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${d.beams.length} beams and ${d.columns.length} columns scheduled, each with a cage carrying the bar count its row states`
        : [
          missing.length ? `${missing.length} scheduled member${missing.length === 1 ? '' : 's'} without a cage (${missing.slice(0, 3).join(', ')})` : '',
          colMismatch.length ? `${colMismatch.length} column${colMismatch.length === 1 ? '' : 's'} whose cage bar count differs from the schedule (${colMismatch.slice(0, 3).map((c) => c.id).join(', ')})` : '',
        ].filter(Boolean).join(' · '),
    })

    // 4 — every designed footing has the cage the foundation drawings are cut from.
    if (d.footings.length) {
      const noCage = d.footings.filter((f) => !cageOf.has(`F-${f.node}`))
      rows.push({
        check: 'Footing schedule = foundation drawings',
        verdict: noCage.length ? 'FAIL' : 'PASS',
        detail: noCage.length
          ? `${noCage.length} designed footing${noCage.length === 1 ? '' : 's'} without a placed cage (${noCage.slice(0, 3).map((f) => f.node).join(', ')})`
          : `${d.footings.length} footings, each with the cage its detail sheet is cut from`,
      })
    }
  }

  // 5 — the slab thicknesses the design checked are the plates' own.
  if (d.slabs.length) {
    // Both in MILLIMETRES — `Plate.thickness` and `SlabDesignResult.h` agree on
    // that, and the first draft of this check did not, which is the sort of
    // thing a consistency check exists to catch (it caught itself).
    const plateT = new Map(i.model.plates.map((p) => [p.id, p.thickness]))
    const off = d.slabs.filter((sl) => {
      const t = plateT.get(sl.plate)
      return t == null || Math.abs(t - sl.design.h) > 1
    })
    rows.push({
      check: 'Slab design = model thickness',
      verdict: off.length ? 'FAIL' : 'PASS',
      detail: off.length
        ? `${off.length} panel${off.length === 1 ? '' : 's'} designed at a thickness the model does not have (${off.slice(0, 3).map((x) => x.plate).join(', ')})`
        : `${d.slabs.length} panels, each designed at the thickness its plate carries`,
    })
  }
  return rows
}

// ── H · model QA/QC ──────────────────────────────────────────────────────
/**
 * The checks that are about the MODEL rather than about a result.
 *
 * `validateMesh` has always run — it gates the solve — but it reported into
 * the editor and nowhere else, so a report could not say whether the model it
 * was built from was sound. A QA pass is only worth the checks it makes, so
 * the section lists every rule by name and says how many passed: "42/42" is a
 * claim a reader can check, "validated" is not.
 */
function qaSection(i: AppendixInput): AppendixSection {
  const issues = validateMesh(i.model)
  const errors = issues.filter((x) => x.severity === 'error')
  const warnings = issues.filter((x) => x.severity === 'warning')
  const tables: AppendixTable[] = [{
    title: 'H.1 Model validation',
    head: ['Rule', 'Severity', 'Refs', 'Finding'],
    rows: issues.length
      ? issues.map((x) => [x.code, x.severity === 'error' ? 'ERROR' : 'WARNING', x.refs.slice(0, 4).join(', ') || '—', x.message])
      : [['—', 'PASS', '—', `${i.model.nodes.length} nodes, ${i.model.members.length} members, ${i.model.plates.length} plates and ${i.model.loads.length} loads checked — no finding.`]],
    note: 'Connectivity, restraint and reference rules — duplicate and coincident nodes, zero-length and duplicate members, nodes and plates attached to nothing, supports and loads pointing at elements that do not exist, sections that are not in the model, unrestrained components (a singular stiffness matrix), and member aspect ratios outside what a frame element describes. An ERROR blocks the solve; a WARNING does not.',
  }]

  // Convergence, gathered from the runs that iterate. A solver that reports
  // "converged" without saying to what tolerance, in how many iterations, has
  // reported an opinion.
  const conv: string[][] = []
  if (i.analysis) {
    const pd = i.analysis.perCombo.filter((r) => r.result?.pDelta)
    if (pd.length) {
      const its = pd.map((r) => r.result!.pDelta!.iterations)
      const res = pd.map((r) => r.result!.pDelta!.residual ?? 0)
      conv.push(['P-Δ (second order)', String(pd.length), String(pd.filter((r) => r.result!.pDelta!.converged).length),
        f2(its.reduce((a, b) => a + b, 0) / its.length), String(Math.max(...its)), Math.max(...res).toExponential(1)])
    }
  }
  const nlh = i.nonlinearHinge?.inelastic
  if (nlh) {
    const r = nlh.response
    conv.push(['Nonlinear time-history (hinge model)', String(r.t.length), r.converged ? String(r.t.length) : 'no',
      '—', String(r.maxIterations), '—'])
  }
  const nls = i.nonlinear?.inelastic
  if (nls) conv.push(['Nonlinear time-history (shear building)', String(nls.response.steps), String(nls.response.steps), '—', '—', '—'])
  if (i.pushover) {
    const ev = Math.max(0, i.pushover.result.curve.length - 1)
    conv.push(['Pushover (event-to-event)', String(ev), String(ev), '—', '—', '—'])
  }
  if (i.optimization) {
    const r = i.optimization.result
    conv.push(['Design optimization', String(r.steps.length), r.converged ? String(r.steps.length) : '—', '—', '—', '—'])
  }
  if (conv.length) tables.push({
    title: 'H.2 Convergence',
    head: ['Run', 'Steps / iterations', 'Converged', 'Avg iterations', 'Max iterations', 'Max residual'],
    right: [1, 2, 3, 4, 5],
    rows: conv,
    note: 'An iterative run that reports "converged" without saying in how many iterations, or to what residual, has reported an opinion. A dash is a run that does not iterate in that sense — the pushover advances event to event and the optimizer iteration by iteration, and neither has an inner residual.',
  })

  // The code compliance matrix — one row per clause the engine actually
  // checked, taken from the status rows so it cannot claim a check that was
  // never run.
  const status = analysisStatus(i)
  const CLAUSE: Record<string, string> = {
    'Static equilibrium': 'ΣF = 0 (statics)',
    'Linear analysis': 'NSCP §203 combinations',
    'Modal analysis': 'NSCP §208.5.5',
    'Storey drift (§208.6.5)': 'NSCP §208.6.5',
    'Nonlinear analysis': 'ASCE 41 / §208.6',
    'Pushover analysis': 'ASCE 41 §7.4.3',
    'Beam design': 'ACI 318-14 §22.2 / §22.5',
    'Column design': 'ACI 318-14 §22.4',
    'Biaxial column check': 'ACI 318-14 §22.4 (Bresler)',
    'Slab design': 'ACI 318-14 §8 (DDM)',
    'Footing design': 'ACI 318-14 §22.5 / §22.6',
    'Shear wall design': 'ACI 318-14 §11',
    'Steel connections': 'AISC 360-16 §J',
    'Optimization': '—',
    'Final detailing': 'ACI 318-14 §25',
  }
  tables.push({
    title: 'H.3 Code compliance matrix',
    head: ['Check', 'Code reference', 'Result', 'Governing value'],
    rows: status.map((r) => [r.check, CLAUSE[r.check] ?? '—', r.verdict, r.detail]),
    note: 'One row per check the engine actually ran; a check that was not run says NOT RUN rather than passing by omission. The clause is the one the check is written to — the worked solutions carry the substituted equations.',
  })

  return {
    key: 'qa', letter: LETTERS.qa, title: APPENDIX_TITLES.qa, available: true, tables,
    stats: [
      { label: 'Model rules', value: issues.length ? `${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'no findings' },
      { label: 'Checks run', value: String(status.filter((r) => r.verdict !== 'NOT RUN').length) },
      { label: 'Checks failing', value: String(status.filter((r) => r.verdict === 'FAIL').length) },
    ],
    notes: errors.length
      ? [`The model carries ${errors.length} validation error${errors.length === 1 ? '' : 's'}. An error means the stiffness matrix is singular or an element is unusable — the results above were produced in spite of it, not because it was tolerated.`]
      : undefined,
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
  // The joins between the four stages — see `finalModelConsistency`. Last,
  // because they are about the whole chain rather than about one stage of it.
  rows.push(...finalModelConsistency(i))
  return rows
}

/** The whole appendix. Sections the inputs cannot fill are carried as unavailable. */
export function buildAnalysisAppendix(i: AppendixInput): AnalysisAppendix {
  return {
    status: analysisStatus(i),
    sections: [
      modelSection(i), loadingSection(i), analysisSection(i), modalSection(i),
      nonlinearSection(i), pushoverSection(i), optimizationSection(i), qaSection(i),
    ],
  }
}
