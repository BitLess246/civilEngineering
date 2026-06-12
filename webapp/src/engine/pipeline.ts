// ─────────────────────────────────────────────────────────────────────────
// Structure design pipeline — Phase 6 of the 3D roadmap. For the governing
// NSCP combination, design DOWN the load path:
//   slabs (already distributed by the bridge) → every beam/girder
//   (critical sections → SRRB/DRRB via designBeam) → every column
//   (axial + P–M via columnDesign) → every base support (service +
//   factored reactions → isolated footing) → concrete totals.
// Every stage reuses the existing engines unchanged.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import { modelToFrame3D } from './modelBridge'
import { analyzeFrame3D, solveFrame3D, applyF3Combo, type F3Result, type F3MemberResult } from './frame3d'
import { designBeam, type BeamDesignResult } from './beamDesign'
import { designAxialColumn, capacityAtEccentricity, interaction } from './columnDesign'
import { designSquareFooting, type SquareFootingResult } from './isolatedFooting'

export interface SoilOptions {
  qAllow: number; gammaSoil: number; gammaConc: number; H: number
}

export interface BeamSectionDesign {
  label: string; Mu: number; Vu: number; hogging: boolean
  design: BeamDesignResult
}
export interface BeamScheduleRow {
  id: string; role: string; L: number
  sections: BeamSectionDesign[]
  ok: boolean
}
export interface ColumnScheduleRow {
  id: string; L: number
  Pu: number; Mu: number; e: number
  bars: number; phiPn: number; util: number
  tieSpacing: number
  ok: boolean
}
export interface FootingScheduleRow {
  node: string; P: number; Pu: number
  design: SquareFootingResult
  ok: boolean
}
export interface StructureDesign {
  govName: string
  beams: BeamScheduleRow[]
  columns: ColumnScheduleRow[]
  footings: FootingScheduleRow[]
  totals: { concreteMembers: number; concreteSlabs: number; concrete: number }
  orphanEdges: number
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

export function designStructure(model: StructuralModel, soil: SoilOptions): StructureDesign | null {
  const sec: RectSection | undefined = model.sections[0]
  if (!sec) return null

  const br = modelToFrame3D(model)
  const analysis = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads)
  if (!analysis) return null
  const gov = analysis.perCombo[analysis.govIdx]
  const govRes = gov.result
  if (!govRes) return null

  // Service (unfactored gravity) solve for the footing bearing check.
  const serviceLoads = applyF3Combo(br.loads, { D: 1, L: 1, Lr: 1, S: 1, R: 1 })
  const serviceRes: F3Result | null = serviceLoads.length
    ? solveFrame3D(br.nodes, br.members, br.supports, serviceLoads)
    : null

  const roleOf = new Map(model.members.map((m) => [m.id, m.role]))

  // ── Beams & girders ──
  const beams: BeamScheduleRow[] = []
  for (const mr of govRes.members) {
    const role = roleOf.get(mr.id)
    if (role !== 'beam' && role !== 'girder') continue
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
    beams.push({ id: mr.id, role, L: mr.L, sections, ok: sections.every((s) => beamOK(s.design)) })
  }

  // ── Columns ──
  const columns: ColumnScheduleRow[] = []
  for (const mr of govRes.members) {
    if (roleOf.get(mr.id) !== 'column') continue
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
      // axial cap still applies near pure compression
      const inter = interaction({ b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, numBars: ax.bars })
      phiPn = Math.min(cap.phi * cap.Pn, 0.65 * inter.PnMax)
    }
    const util = phiPn > 1e-9 ? Pu / phiPn : Infinity
    columns.push({
      id: mr.id, L: mr.L, Pu, Mu, e, bars: ax.bars, phiPn, util,
      tieSpacing: ax.tieSpacing, ok: util <= 1 + 1e-9 && ax.rhoOK,
    })
  }

  // ── Footings (base supports) ──
  const footings: FootingScheduleRow[] = []
  for (let i = 0; i < govRes.reactions.length; i++) {
    const ru = govRes.reactions[i]
    const rs = serviceRes?.reactions[i]
    const Pu = Math.max(0, ru.F[1])
    const P = Math.max(0, rs?.F[1] ?? Pu / 1.4)
    if (Pu < 1e-6) continue
    const d = designSquareFooting({
      serviceLoad: P, ultimateLoad: Pu, columnWidth: Math.min(sec.b, sec.h),
      fc: sec.fc, fy: sec.fy, qAllow: soil.qAllow,
      gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc, H: soil.H,
      barDia: sec.barDia, cover: 75,
    })
    footings.push({ node: ru.node, P, Pu, design: d, ok: d.qNet > 0 && d.punchOK && d.beamOK })
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
    govName: gov.combo.name,
    beams, columns, footings,
    totals: { concreteMembers, concreteSlabs, concrete: concreteMembers + concreteSlabs },
    orphanEdges: br.orphanEdges.length,
  }
}
