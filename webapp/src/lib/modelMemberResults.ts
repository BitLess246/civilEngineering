// ─────────────────────────────────────────────────────────────────────────
// Saved-project member results, as the standalone calculators read them.
//
// A saved project (schema 2) can carry the design its last Model Space run
// produced. These helpers turn that `StructureDesign` into the per-member
// views a calculator shows: one summary row per member, and the SAME worked
// solution the Model Space schedule expands — `modelSpaceSolutions` for the
// RC members, the report's steel narrators for the steel ones — so the
// calculator cannot disagree with the schedule or the PDF about a number.
//
// The rows never recompute anything. If the project has no design, there is
// nothing to show, and every caller says so rather than inventing a check.
// ─────────────────────────────────────────────────────────────────────────

import type { StructureDesign, SoilOptions } from '../engine/pipeline'
import type { StructuralModel, RectSection } from '../engine/model'
import type { SolutionStep } from './solution'

/** Everything a calculator needs to load one saved member into its own
 *  fields. The card assembles it; the page's loader maps it onto its form. */
export interface MemberLoadRequest {
  model: StructuralModel
  design: StructureDesign
  kind: MemberKind
  /** The selected row's id — member id, node id, or the joined node pair of
   *  a combined pad, exactly as `memberRows` produced it. */
  id: string
  /** The member's section (or, for footings, the supporting column's) read
   *  from the project's model — the cage the schedule actually details. */
  section?: RectSection
  /** Second column of a combined pad (kind `combined` only). */
  section2?: RectSection
  /** Soil rebuilt from the project's inputs (footing kinds use it). */
  soil: SoilOptions
}

/** The section a member carries in the model — the adopted one, because the
 *  bar-selection pass rewrites sections before the model is saved. */
export function memberSection(model: StructuralModel, memberId: string): RectSection | undefined {
  const m = model.members.find((x) => x.id === memberId)
  return m ? model.sections.find((x) => x.id === m.section) : undefined
}

/** The column section standing on a base node — how footings name their
 *  supporting member (`role === 'column'` ending at or starting from it). */
export function columnSectionAtNode(model: StructuralModel, node: string): RectSection | undefined {
  const m = model.members.find((x) => x.role === 'column' && (x.i === node || x.j === node))
  return m ? model.sections.find((x) => x.id === m.section) : undefined
}

/** Service dead/live loads back-solved from a factored total, keeping the
 *  page's default dead:live split.
 *
 *  The model's schedule stores the FACTORED demand, but the standalone pages
 *  input service D and L and factor them themselves (wu = 1.2D + 1.6L). With
 *  the live share fixed at `liveRatio` of the dead load the solve is exact
 *  for that combination — and the values land in visible fields the engineer
 *  can adjust, not in a hidden override. The default ratios are each page's
 *  own defaults: 0.4 for the slab (5:2 kPa), 5/3 for the steel beam (15:25
 *  kN/m). The 1.4D branch can never govern a back-solved pair, because
 *  1.2 + 1.6r > 1.4 for every r > 1/8. */
export function backSolvedServiceLoads(
  factored: number, liveRatio: number,
): { dead: number; live: number } {
  if (!(factored > 0) || !(liveRatio >= 0)) return { dead: 0, live: 0 }
  const dead = factored / (1.2 + 1.6 * liveRatio)
  return { dead, live: dead * liveRatio }
}
import {
  beamSectionSolution, columnRowSolution, footingRowSolution, combinedRowSolution,
} from './modelSpaceSolutions'
import { steelBeamRowSolution, steelColumnRowSolution } from './modelReport'

/** Which slice of the design a calculator shows. One kind per page. */
export type MemberKind = 'beam' | 'column' | 'slab' | 'steelBeam' | 'steelColumn' | 'footing' | 'combined'

/** One member, summarised for the picker and the verdict strip. */
export interface MemberRowView {
  id: string
  /** Section name / steel shape, as the schedule prints it. */
  section: string
  /** The governing demand, as the design row carries it. */
  detail: string
  /** Governing utilisation, 0…∞. Null when the row has no single ratio. */
  util: number | null
  /** The row's own pass/fail. Null when the kind has no row-level verdict. */
  ok: boolean | null
}

const f1 = (v: number) => v.toFixed(1)
const PASS_FLOOR = 1e-9

/** `SoilOptions` rebuilt from the project's opaque inputs bag — the same keys
 *  Model Space writes (`qa`, `Hf`, `gammaSoil`, `gammaC`) with the page's own
 *  defaults when a field is missing. Only the footing solutions need it. */
export function soilFromInputs(inputs: Record<string, unknown>): SoilOptions {
  const num = (k: string, d: number): number => {
    const v = inputs[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : d
  }
  return { qAllow: num('qa', 200), gammaSoil: num('gammaSoil', 18), gammaConc: num('gammaC', 24), H: num('Hf', 1.5) }
}

const sectionNameOf = (model: StructuralModel, memberId: string): string => {
  const s = memberSection(model, memberId)
  return s ? (s.name || `${s.b}×${s.h}`) : '—'
}

/** Summary rows for one kind, in the order the design produced them. */
export function memberRows(model: StructuralModel, d: StructureDesign, kind: MemberKind): MemberRowView[] {
  switch (kind) {
    case 'beam':
      return d.beams.map((b) => {
        const worst = b.sections.reduce((a, s) => (Math.abs(s.Mu) > Math.abs(a.Mu) ? s : a))
        const u = worst.design.phiMnMax > PASS_FLOOR ? Math.abs(worst.Mu) / worst.design.phiMnMax : null
        return {
          id: b.id, section: sectionNameOf(model, b.id),
          detail: `Mu ${f1(Math.abs(worst.Mu))} · Vu ${f1(worst.Vu)} kN`,
          util: u, ok: b.ok,
        }
      })
    case 'column':
      return d.columns.map((c) => ({
        id: c.id, section: sectionNameOf(model, c.id),
        detail: `Pu ${f1(c.Pu)} · Mu ${f1(c.Mu)} · Muy ${f1(c.Muy)} kN·m`,
        util: c.util, ok: c.ok,
      }))
    case 'slab':
      return d.slabs.map((s) => ({
        id: s.plate, section: `${Math.round(s.lx * 1000)}×${Math.round(s.ly * 1000)}`,
        detail: `wu ${f1(s.design.wu)} kPa`,
        util: null, ok: s.ok,
      }))
    case 'steelBeam':
      return d.steelBeams.map((b) => ({
        id: b.id, section: b.shape,
        detail: `Mu ${f1(b.Mu)} · Vu ${f1(b.Vu)} kN`,
        util: Math.max(b.utilM, b.utilV), ok: b.ok,
      }))
    case 'steelColumn':
      return d.steelColumns.map((c) => ({
        id: c.id, section: c.shape,
        detail: `Pu ${f1(c.Pu)} · Mu ${f1(c.Mu)} · Muy ${f1(c.Muy)} kN·m`,
        util: c.ratio, ok: c.ok,
      }))
    case 'footing':
      return d.footings.map((f) => ({
        id: f.node, section: `${f1(f.design.B)} m sq`,
        detail: `Pu ${f1(f.Pu)} kN · qnet ${f1(f.design.qNet)} kPa`,
        util: null, ok: f.ok,
      }))
    case 'combined':
      return d.combined.map((c) => ({
        id: c.nodes.join(' + '), section: `${f1(c.design.Bx)}×${f1(c.design.By)} m`,
        detail: `Pu ${f1(Math.max(c.design.Pu1, c.design.Pu2))} kN (col 1+2)`,
        util: null, ok: c.ok,
      }))
  }
}

/** The member's worked solution — the same steps the Model Space schedule
 *  expands, from the SAME row objects. Empty for kinds without a step
 *  builder (slabs show their summary table only) or when the member is gone. */
export function memberSolution(
  model: StructuralModel, d: StructureDesign, kind: MemberKind, id: string, soil: SoilOptions,
): SolutionStep[] {
  const sectionOf = (memberId: string): RectSection | undefined => {
    const m = model.members.find((x) => x.id === memberId)
    return m ? model.sections.find((x) => x.id === m.section) : undefined
  }
  switch (kind) {
    case 'beam': {
      const b = d.beams.find((x) => x.id === id)
      if (!b || !b.sections.length) return []
      const s = b.sections.reduce((a, z) => (Math.abs(z.Mu) > Math.abs(a.Mu) ? z : a))
      const sec = sectionOf(b.id)
      return sec ? beamSectionSolution(sec, s) : []
    }
    case 'column': {
      const c = d.columns.find((x) => x.id === id)
      const sec = c ? sectionOf(c.id) : undefined
      return c && sec ? columnRowSolution(sec, c) : []
    }
    case 'footing': {
      const f = d.footings.find((x) => x.node === id)
      const colAt = (node: string): RectSection | undefined => {
        const m = model.members.find((x) => x.role === 'column' && (x.i === node || x.j === node))
        return m ? model.sections.find((x) => x.id === m.section) : undefined
      }
      const sec = f ? colAt(f.node) : undefined
      return f && sec ? footingRowSolution(sec, soil, f) : []
    }
    case 'combined': {
      const c = d.combined.find((x) => x.nodes.join(' + ') === id)
      const colAt = (node: string): RectSection | undefined => {
        const m = model.members.find((x) => x.role === 'column' && (x.i === node || x.j === node))
        return m ? model.sections.find((x) => x.id === m.section) : undefined
      }
      if (!c) return []
      const a = colAt(c.nodes[0]), b = colAt(c.nodes[1])
      return a && b ? combinedRowSolution(a, b, soil, c) : []
    }
    case 'steelBeam':
      return d.steelBeams.filter((x) => x.id === id).flatMap((x) => steelBeamRowSolution(x))
    case 'steelColumn':
      return d.steelColumns.filter((x) => x.id === id).flatMap((x) => steelColumnRowSolution(x))
    case 'slab':
      return []
  }
}
