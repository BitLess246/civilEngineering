// ─────────────────────────────────────────────────────────────────────────
// Structure design pipeline — Phase 6 of the 3D roadmap. For the governing
// NSCP combination, design DOWN the load path:
//   slabs (already distributed by the bridge) → every beam/girder
//   (critical sections → SRRB/DRRB via designBeam) → every column
//   (axial + P–M via columnDesign) → every base support (service +
//   factored reactions → isolated footing) → concrete totals.
// Every stage reuses the existing engines unchanged.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection, ModelLoad } from './model'
import { enforceSectionHierarchy, refreshSelfWeight } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D, applyF3Combo, type F3Result, type F3MemberResult, type F3Load } from './frame3d'
import { nscpCombos, type Combo } from './beamAnalysis'
import type { ProgressFn } from './progress'
import { designBeam, type BeamDesignResult } from './beamDesign'
import { designAxialColumn, capacityAtEccentricity, interaction } from './columnDesign'
import { designSquareFooting, type SquareFootingResult } from './isolatedFooting'
import { designCombinedFooting, type CombinedFootingResult } from './combinedFooting'
import { designSlabDDM, type SlabDesignResult } from './slabDDM'
import { designShearWall, type ShearWallResult } from './shearWallDesign'
import { shapeByName, nextHeavierW, nextLighterW, type AiscShape } from './aiscSections'
import { deriveWSection, beamFlexure, beamShear, columnAxial, combinedLoading } from './steelDesign'
import { designBasePlate, adoptPlateThickness, type BasePlateResult } from './baseplate'
import { designSteelJoints, type SteelJoint } from './steelConnections'

export interface SoilOptions {
  qAllow: number; gammaSoil: number; gammaConc: number; H: number
}

/** A directional lateral load case (one of +X/−X/+Z/−Z for E or W): a set of
 *  category-E or category-W node loads applied as one primary case. */
export interface LateralCase { name: string; kind: 'E' | 'W'; loads: ModelLoad[] }

/** Analysis options threaded into the frame solve. */
export interface AnalyzeOptions {
  /** NSCP §203.3.1 live-load factor f₁ (1.0 / 0.5). */
  f1?: number
  /** Run the second-order P-Δ iteration. */
  pDelta?: boolean
  /** Directional lateral cases (E/W in ±X/±Z). When given, every combination
   *  with an E (or W) factor is run once per E (or W) case and the design is
   *  enveloped per member — STAAD-style. */
  lateral?: LateralCase[]
}

export interface BeamSectionDesign {
  label: string; x: number; Mu: number; Vu: number; hogging: boolean
  design: BeamDesignResult
}
export interface BeamScheduleRow {
  id: string; role: string; L: number
  sections: BeamSectionDesign[]
  ok: boolean
  gov?: string   // governing load case (envelope)
  /** Governing-case force diagrams along the member (for the worked solution). */
  diag?: { xs: number[]; Vy: number[]; Mz: number[] }
}
export interface ColumnScheduleRow {
  id: string; L: number
  Pu: number; Mu: number; e: number
  bars: number; phiPn: number; util: number
  tieSpacing: number
  ok: boolean
  gov?: string
}
export interface FootingScheduleRow {
  node: string; P: number; Pu: number
  design: SquareFootingResult
  ok: boolean
  gov?: string
}
export interface CombinedScheduleRow {
  nodes: [string, string]
  spacing: number
  dl1: number; ll1: number; dl2: number; ll2: number
  design: CombinedFootingResult
  ok: boolean
}
export interface SlabScheduleRow {
  plate: string
  lx: number; ly: number
  design: SlabDesignResult
  ok: boolean
}
export interface WallScheduleRow {
  id: string
  member: string
  lw: number; hw: number; thickness: number
  Vu: number
  design: ShearWallResult
  ok: boolean
  gov?: string
}
/** Per-support footing choice: isolated (default) or combined with another node. */
export type FootingPlan = Record<string, { type: 'isolated' } | { type: 'combined'; with: string }>

// ── Steel schedule rows (AISC 360-16 LRFD) ──────────────────────────────────
export interface SteelBeamScheduleRow {
  id: string; role: string; L: number; shape: string
  Mu: number; Vu: number          // kN·m, kN
  phiMn: number; phiVn: number     // kN·m, kN
  ltbZone: string
  utilM: number; utilV: number
  ok: boolean
  gov?: string
  // solution detail (section props + AISC check steps)
  d: number; bf: number; tf: number; tw: number
  Ix: number; Sx: number; Zx: number; Iy: number; ry: number
  Mp: number; Lp: number; Lr: number; Lb: number; Mn: number
  compact: boolean; compactFlange: boolean; compactWeb: boolean
  lambdaF: number; lambdaPF: number; lambdaW: number; lambdaPW: number
  Aw: number; Cv1: number; phiV: number; hwTw: number
}
export interface SteelColumnScheduleRow {
  id: string; L: number; shape: string
  Pu: number; Mu: number
  phiPn: number; phiMn: number
  slenderness: number
  ratio: number; equation: string  // §H1-1
  ok: boolean
  gov?: string
  // solution detail
  d: number; bf: number; tf: number; tw: number; A: number; rx: number; ry: number
  Fcr: number; Fe: number
  slendernessX: number; slendernessY: number
}
export interface BasePlateScheduleRow {
  node: string; shape: string
  Pu: number; Tu: number
  design: BasePlateResult
  tAdopt: number                   // adopted plate thickness, mm
  ok: boolean
}

export interface StructureDesign {
  govName: string
  cases: string[]   // every load case (combo × direction) run for the envelope
  beams: BeamScheduleRow[]
  columns: ColumnScheduleRow[]
  steelBeams: SteelBeamScheduleRow[]
  steelColumns: SteelColumnScheduleRow[]
  basePlates: BasePlateScheduleRow[]
  joints: SteelJoint[]               // beam-to-column connections (steel frames only)
  slabs: SlabScheduleRow[]
  walls: WallScheduleRow[]
  footings: FootingScheduleRow[]
  combined: CombinedScheduleRow[]
  totals: { concreteMembers: number; concreteSlabs: number; concrete: number; steelKg: number }
  orphanEdges: number
}

export function designOK(d: StructureDesign): boolean {
  return d.beams.every((b) => b.ok) && d.columns.every((c) => c.ok)
    && d.steelBeams.every((b) => b.ok) && d.steelColumns.every((c) => c.ok)
    && d.basePlates.every((p) => p.ok)
    && d.footings.every((f) => f.ok) && d.combined.every((c) => c.ok)
}

// ── Steel member design (reuses steelDesign engine) ──────────────────────────
/** Design a steel beam/girder from a member result. Lb = full length
 *  (conservative; the slab braces the top flange for sagging but support
 *  hogging puts the bottom flange in compression). */
function designSteelBeamRow(mr: F3MemberResult, role: string, sec: RectSection): SteelBeamScheduleRow | null {
  const shape = sec.shape ? shapeByName(sec.shape) : undefined
  if (!shape || (shape.family !== 'W' && shape.family !== 'WT')) return null
  const Fy = sec.steelFy ?? 248
  const p = deriveWSection(shape)
  const Lb = mr.L * 1000
  const flex = beamFlexure(shape, p, Fy, Lb, 1.0)
  const shear = beamShear(shape, p, Fy)
  const Mu = mr.Mmax, Vu = mr.Vmax
  const utilM = flex.phiMn > 1e-9 ? Mu / flex.phiMn : Infinity
  const utilV = shear.phiVn > 1e-9 ? Vu / shear.phiVn : Infinity
  const { d = 0, bf = 0, tf = 0, tw = 0, ry } = shape
  return {
    id: mr.id, role, L: mr.L, shape: shape.name, Mu, Vu,
    phiMn: flex.phiMn, phiVn: shear.phiVn, ltbZone: flex.ltbZone,
    utilM, utilV, ok: utilM <= 1 + 1e-9 && utilV <= 1 + 1e-9,
    d, bf: bf ?? 0, tf: tf ?? 0, tw: tw ?? 0,
    Ix: p.Ix, Sx: p.Sx, Zx: p.Zx, Iy: p.Iy, ry,
    Mp: flex.Mp, Lp: flex.Lp, Lr: flex.Lr, Lb, Mn: flex.Mn,
    compact: flex.compact, compactFlange: flex.compactFlange, compactWeb: flex.compactWeb,
    lambdaF: flex.lambdaF, lambdaPF: flex.lambdaPF, lambdaW: flex.lambdaW, lambdaPW: flex.lambdaPW,
    Aw: shear.Aw, Cv1: shear.Cv1, phiV: shear.phiV, hwTw: shear.hwTw,
  }
}

/** Design a steel column from a member result (§E3 axial + §H1-1 combined). */
function designSteelColumnRow(mr: F3MemberResult, sec: RectSection): SteelColumnScheduleRow | null {
  const shape = sec.shape ? shapeByName(sec.shape) : undefined
  if (!shape) return null
  const Fy = sec.steelFy ?? 248
  const Pu = Math.max(0, -Math.min(...mr.N))   // compression (N < 0)
  const Mu = mr.Mmax
  const axial = columnAxial(shape, Fy, mr.L, 1.0, 1.0)
  let phiMn = Infinity
  if (shape.family === 'W' || shape.family === 'WT') {
    phiMn = beamFlexure(shape, deriveWSection(shape), Fy, mr.L * 1000, 1.0).phiMn
  }
  const comb = combinedLoading(Pu, axial.phiPn, Mu, phiMn)
  const E_STEEL = 200000
  const Fe = axial.slenderness > 0 ? (Math.PI ** 2 * E_STEEL) / axial.slenderness ** 2 : Infinity
  const { d = 0, bf = 0, tf = 0, tw = 0, A, rx, ry } = shape
  return {
    id: mr.id, L: mr.L, shape: shape.name, Pu, Mu,
    phiPn: axial.phiPn, phiMn: Number.isFinite(phiMn) ? phiMn : 0,
    slenderness: axial.slenderness, ratio: comb.ratio, equation: comb.equation,
    ok: comb.ok && axial.slenderOK,
    d, bf: bf ?? 0, tf: tf ?? 0, tw: tw ?? 0, A, rx, ry,
    Fcr: axial.Fcr, Fe,
    slendernessX: axial.slendernessX, slendernessY: axial.slendernessY,
  }
}

const beamOK = (d: BeamDesignResult) =>
  d.flexOK && d.comprEffective && d.comprNAOK && d.region !== 'inadequate'

/** Critical sections of a frame member: the two ends (which carry the hogging
 *  moments, top steel) plus the interior SAGGING peak — the most positive Mz
 *  strictly inside (bottom steel). Using the signed peak rather than |Mz| keeps
 *  the midspan section from latching onto a near-support hogging point. */
function memberSections(mr: F3MemberResult): { label: string; x: number; Mu: number; Vu: number }[] {
  const out: { label: string; x: number; Mu: number; Vu: number }[] = []
  const n = mr.xs.length - 1
  out.push({ label: 'End i', x: 0, Mu: mr.Mz[0], Vu: Math.abs(mr.Vy[0]) })
  out.push({ label: 'End j', x: mr.L, Mu: mr.Mz[n], Vu: Math.abs(mr.Vy[n]) })
  // interior sagging peak: most positive Mz strictly inside the span
  let best = -1, bestM = -Infinity
  for (let k = 1; k < n; k++) {
    if (mr.Mz[k] > bestM) { bestM = mr.Mz[k]; best = k }
  }
  if (best > 0 && mr.xs[best] > 0.02 * mr.L && mr.xs[best] < 0.98 * mr.L) {
    out.push({ label: `Interior (x = ${mr.xs[best].toFixed(2)} m)`, x: mr.xs[best], Mu: bestM, Vu: Math.abs(mr.Vy[best]) })
  }
  return out
}

/** Design one beam/girder member from a single run's member result. */
function designBeamRow(mr: F3MemberResult, role: string, sec: RectSection): BeamScheduleRow {
  const sections: BeamSectionDesign[] = memberSections(mr)
    .filter((s) => Math.abs(s.Mu) > 1e-6 || s.Vu > 1e-6)
    .map((s) => ({
      label: s.label, x: s.x, Mu: s.Mu, Vu: s.Vu, hogging: s.Mu < 0,
      design: designBeam({
        b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia,
        comprBarDia: 16, stirrupDia: sec.tieDia,
        fc: sec.fc, fy: sec.fy, Mu: Math.abs(s.Mu), Vu: s.Vu,
      }),
    }))
  return {
    id: mr.id, role, L: mr.L, sections, ok: sections.every((s) => beamOK(s.design)),
    diag: { xs: mr.xs, Vy: mr.Vy, Mz: mr.Mz },
  }
}

/** Column capacity for a given section and a known factored P/M demand (no frame
 *  solve — bar diameter does not change demands, so this is reused for bar trials). */
function designColumnFromPM(sec: RectSection, Pu: number, Mu: number) {
  const ax = designAxialColumn({
    shape: 'tied', b: sec.b, h: sec.h, cover: sec.cover,
    barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, Pu,
  })
  let phiPn = ax.phiPnMax
  const e = Pu > 1e-9 ? Mu / Pu : 0
  if (e > 1e-4) {
    const cap = capacityAtEccentricity(
      { b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, numBars: ax.bars },
      e,
    )
    const inter = interaction({ b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, numBars: ax.bars })
    phiPn = Math.min(cap.phi * cap.Pn, 0.65 * inter.PnMax)
  }
  const util = phiPn > 1e-9 ? Pu / phiPn : Infinity
  return { e, bars: ax.bars, Ast: ax.Ast, phiPn, util, tieSpacing: ax.tieSpacing, ok: util <= 1 + 1e-9 && ax.rhoOK }
}

/** Design one column from a single run's member result. */
function designColumnRow(mr: F3MemberResult, sec: RectSection): ColumnScheduleRow {
  const Pu = Math.max(0, -Math.min(...mr.N))           // compression (N < 0)
  const Mu = mr.Mmax
  const r = designColumnFromPM(sec, Pu, Mu)
  return {
    id: mr.id, L: mr.L, Pu, Mu, e: r.e, bars: r.bars, phiPn: r.phiPn, util: r.util,
    tieSpacing: r.tieSpacing, ok: r.ok,
  }
}

const beamSeverity = (r: BeamScheduleRow) =>
  (r.ok ? 0 : 1e9) + Math.max(0, ...r.sections.map((s) => Math.abs(s.Mu)))

interface FrameRun { name: string; result: F3Result }

/** Build the load cases to envelope: every NSCP combination, expanded once per
 *  directional lateral case (E/W) when the combination carries that factor. */
function buildRuns(model: StructuralModel, opts: AnalyzeOptions, onProgress?: ProgressFn) {
  // gravity (everything except lateral E/W) is bridged once — includes the
  // slab tributary line loads and member self-weight; lateral cases are pure
  // node loads applied on top per direction.
  const gravityModel = { ...model, loads: model.loads.filter((l) => l.cat !== 'E' && l.cat !== 'W') }
  const br = modelToFrame3D(gravityModel)

  let lateral = opts.lateral ?? []
  if (lateral.length === 0) {
    const eL = model.loads.filter((l) => l.kind === 'node' && l.cat === 'E')
    const wL = model.loads.filter((l) => l.kind === 'node' && l.cat === 'W')
    if (eL.length) lateral = [...lateral, { name: 'E', kind: 'E', loads: eL }]
    if (wL.length) lateral = [...lateral, { name: 'W', kind: 'W', loads: wL }]
  }
  const toF3 = (l: ModelLoad): F3Load =>
    ({ kind: 'node', node: (l as { node: string }).node, Fx: (l as { Fx?: number }).Fx, Fy: (l as { Fy?: number }).Fy, Fz: (l as { Fz?: number }).Fz, cat: l.cat })
  const eCases = lateral.filter((c) => c.kind === 'E')
  const wCases = lateral.filter((c) => c.kind === 'W')

  // expand every combo into its directional variants up front so progress has a total
  const tasks: { name: string; combo: Combo; lat: F3Load[] }[] = []
  for (const combo of nscpCombos(opts.f1 ?? 1.0)) {
    const hasE = (combo.f.E ?? 0) !== 0
    const hasW = (combo.f.W ?? 0) !== 0
    const variants: { tag: string; lat: F3Load[] }[] =
      hasE && eCases.length ? eCases.map((c) => ({ tag: c.name, lat: c.loads.map(toF3) }))
        : hasW && wCases.length ? wCases.map((c) => ({ tag: c.name, lat: c.loads.map(toF3) }))
          : [{ tag: '', lat: [] }]
    for (const v of variants) tasks.push({ name: combo.name + (v.tag ? ` · ${v.tag}` : ''), combo, lat: v.lat })
  }

  const runs: FrameRun[] = []
  tasks.forEach((t, i) => {
    onProgress?.({ phase: 'Solving load cases', current: i + 1, total: tasks.length, detail: t.name })
    const factored = applyF3Combo([...br.loads, ...t.lat], t.combo.f)
    if (!factored.length) return
    const result = solveFrame3D(br.nodes, br.members, br.supports, factored, opts)
    if (result) runs.push({ name: t.name, result })
  })
  return { br, runs }
}

export function designStructure(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, opts: AnalyzeOptions = {},
  onProgress?: ProgressFn,
): StructureDesign | null {
  if (model.members.length === 0) return null
  // each member designs with its OWN section; footings use the section of the
  // column that lands on the support node.
  const fallbackSec: RectSection = model.sections[0]
    ?? { id: '', name: '', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memSec = new Map(model.members.map((m) => [m.id, secById.get(m.section) ?? fallbackSec]))
  const secOf = (id: string) => memSec.get(id) ?? fallbackSec
  const colAtNode = (node: string) => model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
  const footSec = (node: string) => { const c = colAtNode(node); return c ? secOf(c.id) : fallbackSec }

  const { br, runs } = buildRuns(model, opts, onProgress)
  if (runs.length === 0) return null
  // headline governing run = largest overall bending response
  let govIdx = 0
  runs.forEach((r, i) => { if (r.result.Mmax > runs[govIdx].result.Mmax) govIdx = i })

  // Service (unfactored gravity) + D-only / L-only solves for the footing
  // bearing check and the combined-footing dl/ll split (direction-independent).
  const serviceLoads = applyF3Combo(br.loads, { D: 1, L: 1, Lr: 1, S: 1, R: 1 })
  const serviceRes: F3Result | null = serviceLoads.length
    ? solveFrame3D(br.nodes, br.members, br.supports, serviceLoads, opts) : null
  const dLoads = applyF3Combo(br.loads, { D: 1 })
  const lLoads = applyF3Combo(br.loads, { L: 1 })
  const dRes = dLoads.length ? solveFrame3D(br.nodes, br.members, br.supports, dLoads, opts) : null
  const lRes = lLoads.length ? solveFrame3D(br.nodes, br.members, br.supports, lLoads, opts) : null
  const serviceAt = (node: string) => {
    const i = serviceRes?.reactions.findIndex((r) => r.node === node) ?? -1
    return i >= 0 ? Math.max(0, serviceRes!.reactions[i].F[1]) : 0
  }
  const reactAt = (res: F3Result | null, node: string) => {
    const i = res?.reactions.findIndex((r) => r.node === node) ?? -1
    return i >= 0 ? Math.max(0, res!.reactions[i].F[1]) : 0
  }
  const dAt = new Map<string, number>()
  const lAt = new Map<string, number>()
  for (const r of runs[govIdx].result.reactions) {
    dAt.set(r.node, reactAt(dRes, r.node))
    lAt.set(r.node, reactAt(lRes, r.node))
  }

  const roleOf = new Map(model.members.map((m) => [m.id, m.role]))
  const memberOf = (run: FrameRun, id: string) => run.result.members.find((m) => m.id === id)

  // ── Beams & girders — per-member worst case across all runs ──
  onProgress?.({ phase: 'Designing beams & columns', detail: `${model.members.length} members` })
  const beams: BeamScheduleRow[] = []
  const columns: ColumnScheduleRow[] = []
  const steelBeams: SteelBeamScheduleRow[] = []
  const steelColumns: SteelColumnScheduleRow[] = []
  for (const m of model.members) {
    const role = roleOf.get(m.id)
    const sec = secOf(m.id)
    const isSteel = sec.material === 'steel'
    if (role === 'beam' || role === 'girder') {
      if (isSteel) {
        let best: SteelBeamScheduleRow | null = null, bestSev = -1, gov = ''
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designSteelBeamRow(mr, role, sec); if (!row) continue
          const sev = (row.ok ? 0 : 1e9) + row.Mu
          if (sev > bestSev) { bestSev = sev; best = row; gov = run.name }
        }
        if (best) steelBeams.push({ ...best, gov })
      } else {
        let best: BeamScheduleRow | null = null, bestSev = -1, gov = ''
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designBeamRow(mr, role, sec)
          if (row.sections.length === 0) continue
          const sev = beamSeverity(row)
          if (sev > bestSev) { bestSev = sev; best = row; gov = run.name }
        }
        if (best) beams.push({ ...best, gov })
      }
    } else if (role === 'column') {
      if (isSteel) {
        let best: SteelColumnScheduleRow | null = null, bestRatio = -1, gov = ''
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designSteelColumnRow(mr, sec); if (!row) continue
          if (row.ratio > bestRatio) { bestRatio = row.ratio; best = row; gov = run.name }
        }
        if (best) steelColumns.push({ ...best, gov })
      } else {
        let best: ColumnScheduleRow | null = null, bestUtil = -1, gov = ''
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designColumnRow(mr, sec)
          if (row.util > bestUtil) { bestUtil = row.util; best = row; gov = run.name }
        }
        if (best) columns.push({ ...best, gov })
      }
    }
  }

  // ── Footings (base supports) — isolated by default, combined per plan ──
  onProgress?.({ phase: 'Designing footings & slabs' })
  const nodeXYZ = new Map(model.nodes.map((n) => [n.id, n]))
  const paired = new Set<string>()
  const combined: CombinedScheduleRow[] = []
  for (const [nodeA, choice] of Object.entries(plan)) {
    if (choice.type !== 'combined' || paired.has(nodeA) || paired.has(choice.with)) continue
    const nodeB = choice.with
    const a = nodeXYZ.get(nodeA), b2 = nodeXYZ.get(nodeB)
    if (!a || !b2) continue
    const spacing = Math.hypot(b2.x - a.x, b2.z - a.z)
    if (spacing < 1e-6) continue
    const fsA = footSec(nodeA), fsB = footSec(nodeB)
    const row: CombinedScheduleRow = {
      nodes: [nodeA, nodeB], spacing,
      dl1: dAt.get(nodeA) ?? 0, ll1: lAt.get(nodeA) ?? 0,
      dl2: dAt.get(nodeB) ?? 0, ll2: lAt.get(nodeB) ?? 0,
      design: designCombinedFooting({
        col1Width: Math.min(fsA.b, fsA.h), col2Width: Math.min(fsB.b, fsB.h), spacing,
        dl1: dAt.get(nodeA) ?? 0, ll1: lAt.get(nodeA) ?? 0,
        dl2: dAt.get(nodeB) ?? 0, ll2: lAt.get(nodeB) ?? 0,
        leftRestrict: false, rightRestrict: false, leftOverhang: 0, rightOverhang: 0,
        fc: fsA.fc, fy: fsA.fy, qAllow: soil.qAllow,
        gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc, surcharge: 0,
        H: soil.H, barDia: fsA.barDia, cover: 75,
      }),
      ok: false,
    }
    row.ok = row.design.qNet > 0 && row.design.Dc > 0
    combined.push(row)
    paired.add(nodeA); paired.add(nodeB)
  }

  const footings: FootingScheduleRow[] = []
  for (const ru of runs[govIdx].result.reactions) {
    if (paired.has(ru.node)) continue
    // envelope the factored axial reaction across all runs (a lateral combo may
    // load a base more than gravity); service load from the gravity solve.
    let Pu = 0, gov = ''
    for (const run of runs) {
      const p = reactAt(run.result, ru.node)
      if (p > Pu) { Pu = p; gov = run.name }
    }
    if (Pu < 1e-6) continue
    const P = Math.max(serviceAt(ru.node), Pu / 1.4)
    const fs = footSec(ru.node)
    const d = designSquareFooting({
      serviceLoad: P, ultimateLoad: Pu, columnWidth: Math.min(fs.b, fs.h),
      fc: fs.fc, fy: fs.fy, qAllow: soil.qAllow,
      gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc, H: soil.H,
      barDia: fs.barDia, cover: 75,
    })
    footings.push({ node: ru.node, P, Pu, design: d, ok: d.qNet > 0 && d.punchOK && d.beamOK, gov })
  }

  // ── Base plates (steel columns landing on a base support) ──
  const basePlates: BasePlateScheduleRow[] = []
  for (const ru of runs[govIdx].result.reactions) {
    const col = colAtNode(ru.node)
    const fs = col ? secOf(col.id) : undefined
    if (!col || !fs || fs.material !== 'steel') continue
    const shape = fs.shape ? shapeByName(fs.shape) : undefined
    if (!shape) continue
    // envelope factored compression (max) and net uplift (most tension) across runs
    let Pu = 0, Tu = 0
    for (const run of runs) {
      const i = run.result.reactions.findIndex((r) => r.node === ru.node)
      if (i < 0) continue
      const Fy = run.result.reactions[i].F[1]
      if (Fy > Pu) Pu = Fy
      if (-Fy > Tu) Tu = -Fy
    }
    if (Pu < 1e-6 && Tu < 1e-6) continue
    const design = designBasePlate({
      Pu, Tu, d: shape.d ?? Math.max(fs.b, fs.h), bf: shape.bf ?? Math.min(fs.b, fs.h),
      fc: fs.fc, Fy: fs.steelFy ?? 248,
    })
    const tAdopt = adoptPlateThickness(design.tReq)
    basePlates.push({ node: ru.node, shape: shape.name, Pu, Tu, design, tAdopt, ok: design.bearingOK && design.anchorOK })
  }

  // ── Concrete & steel totals ──
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  let concreteMembers = 0, steelKg = 0
  for (const m of model.members) {
    const a = nm.get(m.i), b2 = nm.get(m.j)
    if (!a || !b2) continue
    const L = Math.hypot(b2.x - a.x, b2.y - a.y, b2.z - a.z)
    const s = secOf(m.id)
    if (s.material === 'steel') {
      const shape = s.shape ? shapeByName(s.shape) : undefined
      if (shape) steelKg += (shape.A / 1e6) * L * 7850   // A m² × L × ρ
    } else {
      concreteMembers += (s.b / 1000) * (s.h / 1000) * L
    }
  }
  let concreteSlabs = 0
  for (const p of model.plates) {
    const c = p.corners.map((id) => nm.get(id))
    if (c.some((q) => !q)) continue
    const [c0, c1, , c3] = c as { x: number; y: number; z: number }[]
    const lx = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z)
    const lz = Math.hypot(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z)
    concreteSlabs += lx * lz * (p.thickness / 1000)
  }

  // ── Slabs — two-way Direct Design Method ──
  const xMin = Math.min(...model.nodes.map((n) => n.x)), xMax = Math.max(...model.nodes.map((n) => n.x))
  const zMin = Math.min(...model.nodes.map((n) => n.z)), zMax = Math.max(...model.nodes.map((n) => n.z))
  const slabs: SlabScheduleRow[] = []
  for (const p of model.plates) {
    if (p.role === 'wall') continue
    const c = p.corners.map((id) => nm.get(id)); if (c.some((q) => !q)) continue
    const cc = c as { x: number; y: number; z: number }[]
    const lx = Math.hypot(cc[1].x - cc[0].x, cc[1].z - cc[0].z)
    const lz = Math.hypot(cc[3].x - cc[0].x, cc[3].z - cc[0].z)
    if (!(lx > 0 && lz > 0)) continue
    const areaD = model.loads.filter((l) => l.kind === 'area' && l.plate === p.id && l.cat === 'D').reduce((s, l) => s + (l as { q: number }).q, 0)
    const areaL = model.loads.filter((l) => l.kind === 'area' && l.plate === p.id && l.cat === 'L').reduce((s, l) => s + (l as { q: number }).q, 0)
    if (areaD + areaL < 1e-9) continue
    const cs = footSec(p.corners[0])
    const extX = cc.some((q) => Math.abs(q.x - xMin) < 1e-4) || cc.some((q) => Math.abs(q.x - xMax) < 1e-4)
    const extZ = cc.some((q) => Math.abs(q.z - zMin) < 1e-4) || cc.some((q) => Math.abs(q.z - zMax) < 1e-4)
    const design = designSlabDDM({
      lx, ly: lz, colWidth: Math.min(cs.b, cs.h), D: areaD, L: areaL,
      fc: cs.fc, fy: cs.fy, h: p.thickness, cover: 20, barDia: 12,
      exterior: { x: extX, y: extZ }, withBeams: true,
    })
    slabs.push({ plate: p.id, lx, ly: lz, design, ok: design.applicable })
  }

  // ── Shear walls — in-plane reinforcement ──
  // The bridge models each shear wall as an X of two diagonal struts
  // (wallstrut_<id>_1/2). The panel's in-plane shear is the horizontal
  // projection of the two strut axial forces, enveloped across all runs.
  const walls: WallScheduleRow[] = []
  for (const w of (model.walls ?? []).filter((x) => x.shearWall)) {
    const m = model.members.find((mm) => mm.id === w.member); if (!m) continue
    const a = nm.get(m.i), b2 = nm.get(m.j); if (!a || !b2) continue
    const lw = Math.hypot(b2.x - a.x, b2.z - a.z)         // horizontal length, m
    const hw = w.height
    if (!(lw > 0 && hw > 0)) continue
    // in-plane shear = horizontal projection of the strut axials, taken from
    // each strut's ACTUAL geometry (cos = lw / strut length) so it stays
    // consistent with the bridge whatever the wall's nominal height.
    const strutShear = (run: FrameRun, id: string) => {
      const mr = run.result.members.find((x) => x.id === id)
      if (!mr || mr.L <= 0) return 0
      return Math.max(...mr.N.map(Math.abs)) * (lw / mr.L)
    }
    let Vu = 0, gov = ''
    for (const run of runs) {
      const v = strutShear(run, `wallstrut_${w.id}_1`) + strutShear(run, `wallstrut_${w.id}_2`)
      if (v > Vu) { Vu = v; gov = run.name }
    }
    const sec = secOf(m.id)
    const design = designShearWall({
      lw, hw, thickness: w.thickness, fc: sec.fc, fy: sec.fy, Vu, barDia: 12,
    })
    walls.push({ id: w.id, member: w.member, lw, hw, thickness: w.thickness, Vu, design, ok: design.shearOK, gov })
  }

  const partialDesign = {
    govName: runs[govIdx].name,
    cases: runs.map((r) => r.name),
    beams, columns, steelBeams, steelColumns, basePlates,
    joints: [] as SteelJoint[],
    slabs, walls, footings, combined,
    totals: { concreteMembers, concreteSlabs, concrete: concreteMembers + concreteSlabs, steelKg },
    orphanEdges: br.orphanEdges.length,
  }
  partialDesign.joints = designSteelJoints(model, partialDesign)
  return partialDesign
}

// ── Bar-diameter selection ────────────────────────────────────────────────
// Standard NSCP bar sizes the design/optimise engines may try. Bar diameter
// changes neither stiffness nor self-weight (both gross-concrete), so it never
// alters the frame demands — selection is a pure per-member detailing pass that
// rewrites each member's section.barDia, keeping every schedule/drawing/solution
// (which all read sec.barDia) consistent for free.
export const BAR_LADDER_BEAM = [16, 20, 25, 28, 32]
export const BAR_LADDER_COLUMN = [20, 25, 28, 32]

/** §425.2.1 — do `bars` of Ø `db` fit one face of the column at the minimum
 *  clear spacing max(1.5db, 40 mm)? Bars split evenly over the two faces ⟂ to h
 *  (the interaction model's layout), spread across width b. */
function columnBarsFit(sec: RectSection, db: number, bars: number): boolean {
  const perFace = Math.ceil(bars / 2)
  if (perFace <= 1) return true
  const clearWidth = sec.b - 2 * (sec.cover + sec.tieDia) - perFace * db
  const sClear = clearWidth / (perFace - 1)
  return sClear >= Math.max(1.5 * db, 40) - 1e-6
}

/**
 * Pick the most economical bar diameter for every beam/girder and column from a
 * candidate ladder: the smallest-steel size that still passes, falling back to
 * the section's current bar when none of the candidates work (so the section can
 * grow instead). Returns a new model with the chosen per-member section.barDia.
 * Pass `base` (an already-computed design of `model`) to skip the internal solve.
 */
export function selectBarDiameters(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, opts: AnalyzeOptions = {},
  base?: StructureDesign | null,
): StructuralModel {
  const design = base ?? designStructure(model, soil, plan, opts)
  if (!design) return model
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memSecId = new Map(model.members.map((m) => [m.id, m.section]))
  const chosen = new Map<string, number>()
  // candidate sizes, SMALLEST first — we adopt the first one that passes.
  const ladder = (cands: number[], current: number) => [...new Set([current, ...cands])].sort((a, b) => a - b)

  // beams/girders: smallest bar Ø whose every section passes capacity AND the
  // §407.7.1 clear-spacing / layer-fit check (both folded into beamOK).
  for (const row of design.beams) {
    const sec = secById.get(memSecId.get(row.id) ?? ''); if (!sec) continue
    for (const db of ladder(BAR_LADDER_BEAM, sec.barDia)) {
      const allOK = row.sections.every((s) => beamOK(designBeam({
        b: sec.b, h: sec.h, cover: sec.cover, barDia: db, comprBarDia: 16,
        stirrupDia: sec.tieDia, fc: sec.fc, fy: sec.fy, Mu: Math.abs(s.Mu), Vu: s.Vu,
      })))
      if (allOK) { if (db !== sec.barDia) chosen.set(sec.id, db); break }
    }
  }

  // columns: smallest bar Ø that passes P–M + ρ AND fits the §425.2.1 minimum
  // clear bar spacing across the section face (≥ max(1.5db, 40 mm)).
  for (const row of design.columns) {
    const sec = secById.get(memSecId.get(row.id) ?? ''); if (!sec) continue
    for (const db of ladder(BAR_LADDER_COLUMN, sec.barDia)) {
      const r = designColumnFromPM({ ...sec, barDia: db }, row.Pu, row.Mu)
      if (r.ok && columnBarsFit(sec, db, r.bars)) { if (db !== sec.barDia) chosen.set(sec.id, db); break }
    }
  }

  if (chosen.size === 0) return model
  return {
    ...model,
    sections: model.sections.map((s) => (chosen.has(s.id) ? { ...s, barDia: chosen.get(s.id)! } : s)),
  }
}

// ── Optimisation loop ─────────────────────────────────────────────────────
export interface OptimizeStep { iter: number; grown: number; fails: number; ok: boolean }
export interface OptimizeResult {
  design: StructureDesign
  model: StructuralModel   // model carrying the optimised per-member sections
  steps: OptimizeStep[]
  converged: boolean
}

const countFails = (d: StructureDesign): number =>
  d.beams.filter((x) => !x.ok).length + d.columns.filter((x) => !x.ok).length
  + d.steelBeams.filter((x) => !x.ok).length + d.steelColumns.filter((x) => !x.ok).length
  + d.basePlates.filter((x) => !x.ok).length
  + d.footings.filter((x) => !x.ok).length + d.combined.filter((x) => !x.ok).length

const withSizes = (model: StructuralModel, sizes: Map<string, RectSection>): StructuralModel =>
  ({ ...model, sections: model.sections.map((s) => sizes.get(s.id) ?? s) })

/** Copy shape geometry into the section's bounding-box fields so metadata stays consistent. */
const applyShape = (s: RectSection, sh: AiscShape): RectSection =>
  ({ ...s, shape: sh.name, name: sh.name, b: sh.bf ?? s.b, h: sh.d ?? s.h })

/** Demand/capacity utilisation per section-id; only failing members are included. */
function buildUtilMap(
  design: StructureDesign,
  memSecId: Map<string, string>,
): Map<string, number> {
  const out = new Map<string, number>()
  const bump = (sid: string | undefined, u: number) => {
    if (sid) out.set(sid, Math.max(out.get(sid) ?? 0, u))
  }
  for (const b of design.beams) {
    if (!b.ok) {
      const sid = memSecId.get(b.id)
      const u = b.sections.reduce((mx, sec) => {
        const mn = sec.design.phiMnMax
        return Math.max(mx, mn > 1e-9 ? Math.abs(sec.Mu) / mn : 4)
      }, 2)
      bump(sid, u)
    }
  }
  for (const c of design.columns)      if (!c.ok) bump(memSecId.get(c.id), Math.max(2, c.util))
  for (const b of design.steelBeams)   if (!b.ok) bump(memSecId.get(b.id), Math.max(2, b.utilM, b.utilV))
  for (const c of design.steelColumns) if (!c.ok) bump(memSecId.get(c.id), Math.max(2, c.ratio))
  return out
}

/**
 * Grow a section by the estimated number of steps to satisfy a given demand/capacity
 * ratio (util = Mu/φMn ≥ 1).
 *   RC capacity ≈ h²  → target h = h·√util → steps = ⌈(√util − 1)·h/50⌉, cap 10
 *   Steel: jump ⌈√util − 0.5⌉ catalog positions, cap 8
 *   Square RC columns (b/h ∈ [0.75, 1.33]) grow both b and h together to preserve
 *   aspect ratio; all others switch to width growth at h ≥ 2.5b.
 */
function jumpSection(s: RectSection, util: number, role: string): RectSection {
  if (util <= 1 + 1e-9) return s
  if (s.material === 'steel' && s.shape) {
    const n = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(util) - 0.5)))
    let cur = s
    for (let i = 0; i < n; i++) {
      const next = nextHeavierW(cur.shape!)
      if (!next) break
      cur = applyShape(cur, next)
    }
    return cur
  }
  const nSteps = Math.max(1, Math.min(10, Math.ceil((Math.sqrt(util) - 1) * s.h / 50)))
  const ratio = s.b / s.h
  const isSquareCol = role === 'column' && ratio > 0.75 && ratio < 1.33
  let sec = s
  for (let i = 0; i < nSteps; i++) {
    if (isSquareCol) {
      sec = { ...sec, b: sec.b + 50, h: sec.h + 50, name: `${sec.b + 50}×${sec.h + 50}` }
    } else if (sec.h >= 2.5 * sec.b) {
      sec = { ...sec, b: sec.b + 50, name: `${sec.b + 50}×${sec.h}` }
    } else {
      sec = { ...sec, h: sec.h + 50, name: `${sec.b}×${sec.h + 50}` }
    }
  }
  return sec
}

/**
 * Per-member sizing search. Each beam/girder/column carries its own section, so
 * only the FAILING members grow (h in 50-mm steps; b joins once h ≥ 3b) — one
 * at a time — until nothing fails, with the strong-column/weak-beam width
 * hierarchy re-enforced after every growth. Then each member's h is trimmed in
 * 25-mm steps while the whole structure still passes. The frame is re-analysed
 * on every step (stiffness changes feed back into the demands).
 */
export function optimizeStructure(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, maxIter = 30,
  opts: AnalyzeOptions = {}, tryBars = false, onProgress?: ProgressFn,
): OptimizeResult | null {
  if (model.members.length === 0) return null
  const memSecId = new Map(model.members.map((m) => [m.id, m.section]))
  // sectionId → member role (valid after splitSharedSections: 1-to-1 mapping)
  const secRole = new Map<string, string>(model.members.map((m) => [m.section, m.role]))
  // sizes & self-weight kept consistent at every step (self-weight uses the
  // footing concrete unit weight so a custom γc feeds the gravity demands).
  const settle = (m: StructuralModel) => refreshSelfWeight(enforceSectionHierarchy(m), soil.gammaConc)
  // wrap the per-solve progress with the current optimise phase so the bar shows
  // the load-case sweep happening inside each iteration.
  const sub = (label: string): ProgressFn | undefined =>
    onProgress && ((p) => onProgress({ ...p, phase: `${label} · ${p.phase}` }))
  // re-detail the bars (cheapest design variable) before measuring fails, so a
  // member that only needs a bigger bar is not grown unnecessarily.
  const detail = (m: StructuralModel, d: StructureDesign, label: string): { m: StructuralModel; d: StructureDesign } => {
    if (!tryBars) return { m, d }
    const m2 = selectBarDiameters(m, soil, plan, opts, d)
    return m2 === m ? { m, d } : { m: m2, d: designStructure(m2, soil, plan, opts, sub(label)) ?? d }
  }
  let work = settle(model)                            // start width-consistent
  const steps: OptimizeStep[] = []

  let design = designStructure(work, soil, plan, opts, sub('Optimize · initial'))
  if (!design) return null
  ;({ m: work, d: design } = detail(work, design, 'Optimize · initial'))
  steps.push({ iter: 0, grown: 0, fails: countFails(design), ok: designOK(design) })

  // GROW: jump each failing section by the estimated steps needed to satisfy
  // demand/capacity, re-enforce the hierarchy and refresh self-weight so the
  // heavier sections feed back into the demands on the next iteration.
  let iter = 0
  while (!designOK(design) && iter++ < maxIter) {
    const utils = buildUtilMap(design, memSecId)
    if (utils.size === 0) break                      // only footings fail — not a section problem
    onProgress?.({ phase: 'Optimizing — growing sections', current: iter, total: maxIter, detail: `iteration ${iter}: ${utils.size} member(s) grown, ${countFails(design)} failing` })
    const sizes = new Map(work.sections.map((s) => {
      const u = utils.get(s.id)
      return [s.id, u !== undefined ? jumpSection(s, u, secRole.get(s.id) ?? '') : s]
    }))
    work = settle(withSizes(work, sizes))
    const d = designStructure(work, soil, plan, opts, sub(`Optimize iter ${iter}`))
    if (!d) break
    ;({ m: work, d: design } = detail(work, d, `Optimize iter ${iter}`))
    steps.push({ iter, grown: utils.size, fails: countFails(design), ok: designOK(design) })
  }
  const converged = designOK(design)

  // SHRINK: first try trimming all sections simultaneously (batch pass) — much
  // faster for large models when most sections are over-sized by several steps.
  // Then fall back to individual 25-mm fine-tune for sections that couldn't be
  // batch-trimmed (typically the critical ones controlling the design).
  if (converged) {
    onProgress?.({ phase: 'Optimizing — trimming sections', detail: 'batch-shrinking all sections' })

    let batchOk = true
    while (batchOk) {
      const batchSizes = new Map<string, RectSection>()
      for (const s0 of work.sections) {
        if (s0.material === 'steel' && s0.shape) {
          const lighter = nextLighterW(s0.shape)
          if (lighter) batchSizes.set(s0.id, applyShape(s0, lighter))
        } else if (s0.h - 25 >= 300) {
          batchSizes.set(s0.id, { ...s0, h: s0.h - 25, name: `${s0.b}×${s0.h - 25}` })
        }
      }
      if (batchSizes.size === 0) break
      const trial = settle(withSizes(work, batchSizes))
      const d = designStructure(trial, soil, plan, opts)
      if (d && designOK(d)) { work = trial; design = d } else { batchOk = false }
    }

    // Individual fine-tune: catch sections the batch couldn't trim
    let improved = true, guard = 0
    while (improved && guard++ < 4) {
      improved = false
      for (const s0 of work.sections) {
        let trialSec: RectSection | null = null
        if (s0.material === 'steel' && s0.shape) {
          const lighter = nextLighterW(s0.shape)
          if (lighter) trialSec = applyShape(s0, lighter)
        } else {
          if (s0.h - 25 < 300) continue
          trialSec = { ...s0, h: s0.h - 25, name: `${s0.b}×${s0.h - 25}` }
        }
        if (!trialSec) continue
        const trial = settle(withSizes(work, new Map([[s0.id, trialSec]])))
        const d = designStructure(trial, soil, plan, opts)
        if (d && designOK(d)) { work = trial; design = d; improved = true }
      }
    }
    // final bar re-detail at the trimmed sizes for the most economical layout
    if (tryBars) {
      const m2 = selectBarDiameters(work, soil, plan, opts, design)
      if (m2 !== work) { const d = designStructure(m2, soil, plan, opts); if (d) { work = m2; design = d } }
    }
    steps.push({ iter: iter + 1, grown: 0, fails: 0, ok: true })
  }

  return { design, model: work, steps, converged }
}
