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
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D, applyF3Combo, type F3Result, type F3MemberResult, type F3Load } from './frame3d'
import { nscpCombos } from './beamAnalysis'
import { designBeam, type BeamDesignResult } from './beamDesign'
import { designAxialColumn, capacityAtEccentricity, interaction } from './columnDesign'
import { designSquareFooting, type SquareFootingResult } from './isolatedFooting'
import { designCombinedFooting, type CombinedFootingResult } from './combinedFooting'

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
  label: string; Mu: number; Vu: number; hogging: boolean
  design: BeamDesignResult
}
export interface BeamScheduleRow {
  id: string; role: string; L: number
  sections: BeamSectionDesign[]
  ok: boolean
  gov?: string   // governing load case (envelope)
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
/** Per-support footing choice: isolated (default) or combined with another node. */
export type FootingPlan = Record<string, { type: 'isolated' } | { type: 'combined'; with: string }>

export interface StructureDesign {
  govName: string
  cases: string[]   // every load case (combo × direction) run for the envelope
  beams: BeamScheduleRow[]
  columns: ColumnScheduleRow[]
  footings: FootingScheduleRow[]
  combined: CombinedScheduleRow[]
  totals: { concreteMembers: number; concreteSlabs: number; concrete: number }
  orphanEdges: number
}

export function designOK(d: StructureDesign): boolean {
  return d.beams.every((b) => b.ok) && d.columns.every((c) => c.ok)
    && d.footings.every((f) => f.ok) && d.combined.every((c) => c.ok)
}

const beamOK = (d: BeamDesignResult) =>
  d.flexOK && d.comprEffective && d.comprNAOK && d.region !== 'inadequate'

/** Critical sections of a frame member: both ends + the interior |M| peak
 *  between V-zero crossings (signed Mz; negative = hogging → top steel). */
function memberSections(mr: F3MemberResult): { label: string; x: number; Mu: number; Vu: number }[] {
  const out: { label: string; x: number; Mu: number; Vu: number }[] = []
  const n = mr.xs.length - 1
  out.push({ label: 'End i', x: 0, Mu: mr.Mz[0], Vu: Math.abs(mr.Vy[0]) })
  out.push({ label: 'End j', x: mr.L, Mu: mr.Mz[n], Vu: Math.abs(mr.Vy[n]) })
  // interior extremum: largest |Mz| strictly inside
  let best = -1, bestM = 0
  for (let k = 1; k < n; k++) {
    if (Math.abs(mr.Mz[k]) > Math.abs(bestM)) { bestM = mr.Mz[k]; best = k }
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
      label: s.label, Mu: s.Mu, Vu: s.Vu, hogging: s.Mu < 0,
      design: designBeam({
        b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia,
        comprBarDia: 16, stirrupDia: sec.tieDia,
        fc: sec.fc, fy: sec.fy, Mu: Math.abs(s.Mu), Vu: s.Vu,
      }),
    }))
  return { id: mr.id, role, L: mr.L, sections, ok: sections.every((s) => beamOK(s.design)) }
}

/** Design one column from a single run's member result. */
function designColumnRow(mr: F3MemberResult, sec: RectSection): ColumnScheduleRow {
  const Pu = Math.max(0, -Math.min(...mr.N))           // compression (N < 0)
  const Mu = mr.Mmax
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
  return {
    id: mr.id, L: mr.L, Pu, Mu, e, bars: ax.bars, phiPn, util,
    tieSpacing: ax.tieSpacing, ok: util <= 1 + 1e-9 && ax.rhoOK,
  }
}

const beamSeverity = (r: BeamScheduleRow) =>
  (r.ok ? 0 : 1e9) + Math.max(0, ...r.sections.map((s) => Math.abs(s.Mu)))

interface FrameRun { name: string; result: F3Result }

/** Build the load cases to envelope: every NSCP combination, expanded once per
 *  directional lateral case (E/W) when the combination carries that factor. */
function buildRuns(model: StructuralModel, opts: AnalyzeOptions) {
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

  const runs: FrameRun[] = []
  for (const combo of nscpCombos(opts.f1 ?? 1.0)) {
    const hasE = (combo.f.E ?? 0) !== 0
    const hasW = (combo.f.W ?? 0) !== 0
    const variants: { tag: string; lat: F3Load[] }[] =
      hasE && eCases.length ? eCases.map((c) => ({ tag: c.name, lat: c.loads.map(toF3) }))
        : hasW && wCases.length ? wCases.map((c) => ({ tag: c.name, lat: c.loads.map(toF3) }))
          : [{ tag: '', lat: [] }]
    for (const v of variants) {
      const factored = applyF3Combo([...br.loads, ...v.lat], combo.f)
      if (!factored.length) continue
      const result = solveFrame3D(br.nodes, br.members, br.supports, factored, opts)
      if (result) runs.push({ name: combo.name + (v.tag ? ` · ${v.tag}` : ''), result })
    }
  }
  return { br, runs }
}

export function designStructure(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, opts: AnalyzeOptions = {},
): StructureDesign | null {
  const sec: RectSection | undefined = model.sections[0]
  if (!sec) return null

  const { br, runs } = buildRuns(model, opts)
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
  const beams: BeamScheduleRow[] = []
  const columns: ColumnScheduleRow[] = []
  for (const m of model.members) {
    const role = roleOf.get(m.id)
    if (role === 'beam' || role === 'girder') {
      let best: BeamScheduleRow | null = null, bestSev = -1, gov = ''
      for (const run of runs) {
        const mr = memberOf(run, m.id); if (!mr) continue
        const row = designBeamRow(mr, role, sec)
        if (row.sections.length === 0) continue
        const sev = beamSeverity(row)
        if (sev > bestSev) { bestSev = sev; best = row; gov = run.name }
      }
      if (best) beams.push({ ...best, gov })
    } else if (role === 'column') {
      let best: ColumnScheduleRow | null = null, bestUtil = -1, gov = ''
      for (const run of runs) {
        const mr = memberOf(run, m.id); if (!mr) continue
        const row = designColumnRow(mr, sec)
        if (row.util > bestUtil) { bestUtil = row.util; best = row; gov = run.name }
      }
      if (best) columns.push({ ...best, gov })
    }
  }

  // ── Footings (base supports) — isolated by default, combined per plan ──
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
    const row: CombinedScheduleRow = {
      nodes: [nodeA, nodeB], spacing,
      dl1: dAt.get(nodeA) ?? 0, ll1: lAt.get(nodeA) ?? 0,
      dl2: dAt.get(nodeB) ?? 0, ll2: lAt.get(nodeB) ?? 0,
      design: designCombinedFooting({
        col1Width: Math.min(sec.b, sec.h), col2Width: Math.min(sec.b, sec.h), spacing,
        dl1: dAt.get(nodeA) ?? 0, ll1: lAt.get(nodeA) ?? 0,
        dl2: dAt.get(nodeB) ?? 0, ll2: lAt.get(nodeB) ?? 0,
        leftRestrict: false, rightRestrict: false, leftOverhang: 0, rightOverhang: 0,
        fc: sec.fc, fy: sec.fy, qAllow: soil.qAllow,
        gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc, surcharge: 0,
        H: soil.H, barDia: sec.barDia, cover: 75,
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
    const d = designSquareFooting({
      serviceLoad: P, ultimateLoad: Pu, columnWidth: Math.min(sec.b, sec.h),
      fc: sec.fc, fy: sec.fy, qAllow: soil.qAllow,
      gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc, H: soil.H,
      barDia: sec.barDia, cover: 75,
    })
    footings.push({ node: ru.node, P, Pu, design: d, ok: d.qNet > 0 && d.punchOK && d.beamOK, gov })
  }

  // ── Concrete totals ──
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  let concreteMembers = 0
  for (const m of model.members) {
    const a = nm.get(m.i), b2 = nm.get(m.j)
    if (!a || !b2) continue
    const L = Math.hypot(b2.x - a.x, b2.y - a.y, b2.z - a.z)
    concreteMembers += (sec.b / 1000) * (sec.h / 1000) * L
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

  return {
    govName: runs[govIdx].name,
    cases: runs.map((r) => r.name),
    beams, columns, footings, combined,
    totals: { concreteMembers, concreteSlabs, concrete: concreteMembers + concreteSlabs },
    orphanEdges: br.orphanEdges.length,
  }
}

// ── Optimisation loop ─────────────────────────────────────────────────────
export interface OptimizeStep { b: number; h: number; fails: number; ok: boolean }
export interface OptimizeResult {
  design: StructureDesign
  section: RectSection
  steps: OptimizeStep[]
  converged: boolean
}

const countFails = (d: StructureDesign): number =>
  d.beams.filter((x) => !x.ok).length + d.columns.filter((x) => !x.ok).length
  + d.footings.filter((x) => !x.ok).length + d.combined.filter((x) => !x.ok).length

const withSection = (model: StructuralModel, sec: RectSection): StructuralModel =>
  ({ ...model, sections: [sec] })

/**
 * Iterate the design until no section fails, then trim back: GROW the shared
 * b×h (h in 50-mm steps; b joins once h reaches 3b) while anything fails,
 * then SHRINK h in 25-mm steps as long as everything still passes — the
 * smallest passing section the search visits. Stiffness changes re-analyze
 * the frame on every step (designStructure runs the full pipeline).
 */
export function optimizeStructure(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, maxIter = 24,
  opts: AnalyzeOptions = {},
): OptimizeResult | null {
  if (!model.sections[0]) return null
  let sec: RectSection = { ...model.sections[0] }
  const steps: OptimizeStep[] = []

  let design = designStructure(withSection(model, sec), soil, plan, opts)
  if (!design) return null
  steps.push({ b: sec.b, h: sec.h, fails: countFails(design), ok: designOK(design) })

  // grow until clean
  let iter = 0
  while (!designOK(design) && iter++ < maxIter) {
    if (sec.h >= 3 * sec.b) sec = { ...sec, b: sec.b + 50, name: '' }
    else sec = { ...sec, h: sec.h + 50, name: '' }
    sec.name = `${sec.b}×${sec.h}`
    const d = designStructure(withSection(model, sec), soil, plan, opts)
    if (!d) break
    design = d
    steps.push({ b: sec.b, h: sec.h, fails: countFails(design), ok: designOK(design) })
  }
  const converged = designOK(design)

  // shrink back while still passing (find the lean edge)
  while (converged && sec.h - 25 >= 300) {
    const trial: RectSection = { ...sec, h: sec.h - 25, name: `${sec.b}×${sec.h - 25}` }
    const d = designStructure(withSection(model, trial), soil, plan, opts)
    if (!d || !designOK(d)) break
    sec = trial
    design = d
    steps.push({ b: sec.b, h: sec.h, fails: 0, ok: true })
  }

  return { design, section: sec, steps, converged }
}
