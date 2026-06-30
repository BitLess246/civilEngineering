// ─────────────────────────────────────────────────────────────────────────
// Strong-column / weak-beam (SCWB) check — NSCP 2015 §418.7.3.2.
//
// At each beam-column joint of a Special Moment Frame the columns must be
// stronger in flexure than the beams, so plastic hinges form in the beams (a
// ductile mechanism) rather than the columns (a soft storey):
//
//   ΣMnc ≥ (6/5)·ΣMnb                                        (418.7.3.2-1)
//
//   ΣMnc — sum of the nominal flexural strengths of the columns framing into
//          the joint, evaluated at the factored axial force giving the LOWEST
//          flexural strength (taken here at the column's design axial Pu).
//   ΣMnb — sum of the nominal flexural strengths of the beams framing in.
//
// Beam Mn — singly-reinforced rectangular section, Mn = As·fy·(d − a/2).
// Column Mn — rectangular tied section with symmetric reinforcement, recovered
// by a neutral-axis (strain-compatibility) solve at the given axial: the
// rectangular stress block (εcu = 0.003, β1 per f′c) plus two steel layers.
// Units: geometry mm; fc/fy MPa; As mm²; axial kN; moments kN·m.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import { beta1 } from './loads'
import type { StructureDesign } from './pipeline'

/** SCWB strength ratio required by NSCP §418.7.3.2 (= ACI 318-14 §18.7.3.2). */
export const SCWB_FACTOR = 6 / 5

const ES = 200000   // steel modulus, MPa
const ECU = 0.003   // ultimate concrete strain

/** Nominal flexural strength of a singly-reinforced rectangular beam, kN·m. */
export function concreteBeamMn(b: number, d: number, As: number, fc: number, fy: number): number {
  if (As <= 0 || b <= 0 || d <= 0) return 0
  const a = (As * fy) / (0.85 * fc * b)
  return (As * fy * (d - a / 2)) / 1e6
}

/**
 * Nominal flexural strength of a rectangular tied column at a given axial load,
 * kN·m, by a strain-compatibility neutral-axis solve. Reinforcement is taken
 * symmetric: Ast/2 at each face (centroid `cover + barDia/2` from the face).
 * Compression is positive; the moment is taken about the geometric centroid.
 */
export function concreteColumnMn(
  b: number, h: number, Ast: number, fc: number, fy: number, P: number,
  cover: number, barDia: number,
): number {
  if (b <= 0 || h <= 0) return 0
  const b1 = beta1(fc)
  const dp = cover + barDia / 2     // compression-layer depth from compression face
  const d = h - dp                  // tension-layer depth
  const Asf = Math.max(Ast, 0) / 2
  const Pn = P * 1e3                 // kN → N
  const fsAt = (c: number, di: number) => Math.max(-fy, Math.min(fy, (ES * ECU * (c - di)) / c))
  const axialAt = (c: number) => {
    const a = Math.min(b1 * c, h)
    return 0.85 * fc * b * a + Asf * fsAt(c, dp) + Asf * fsAt(c, d)   // N (compression +)
  }
  // axialAt is monotonic increasing in c; bisect for the c giving the target Pn.
  let lo = 1e-3 * h, hi = 5 * h
  if (Pn >= axialAt(hi)) { /* over-squashed: use the capped section */ }
  else for (let i = 0; i < 80; i++) {
    const c = (lo + hi) / 2
    if (axialAt(c) < Pn) lo = c; else hi = c
  }
  const c = (lo + hi) / 2
  const a = Math.min(b1 * c, h)
  const Cc = 0.85 * fc * b * a
  const Fs1 = Asf * fsAt(c, dp), Fs2 = Asf * fsAt(c, d)
  // moment of the internal forces about the section centroid (N·mm)
  const Mn = Cc * (h / 2 - a / 2) + Fs1 * (h / 2 - dp) + Fs2 * (h / 2 - d)
  return Math.abs(Mn) / 1e6
}

/** SCWB ratio ΣMnc/ΣMnb and its pass/fail against the 6/5 requirement. */
export function scwbRatio(sumMnc: number, sumMnb: number): { ratio: number; ok: boolean } {
  const ratio = sumMnb > 1e-9 ? sumMnc / sumMnb : Infinity
  return { ratio, ok: ratio >= SCWB_FACTOR - 1e-9 }
}

export interface SCWBJointRow {
  node: string
  sumMnc: number; sumMnb: number     // kN·m
  ratio: number
  ok: boolean
  nCols: number; nBeams: number
}

/** Bar area for a single ⌀db bar, mm². */
const barArea = (db: number) => (Math.PI / 4) * db * db

/**
 * Strong-column/weak-beam check at every beam-column joint of a concrete frame,
 * from a completed design. Concrete columns use their designed bar count and
 * design axial Pu; concrete beams use the heaviest designed tension steel of the
 * member (the support/negative-moment section governs the hinge). Steel members
 * are skipped (steel SCWB uses different probable-strength provisions). Returns
 * one row per joint that has at least one column and one beam.
 */
export function checkModelSCWB(model: StructuralModel, design: StructureDesign): SCWBJointRow[] {
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const colRow = new Map(design.columns.map((c) => [c.id, c]))
  const beamRow = new Map(design.beams.map((b) => [b.id, b]))
  const isConcrete = (s: RectSection | undefined) => !!s && s.material !== 'steel'

  // column nominal moment at its design axial
  const columnMn = (memberId: string): number | null => {
    const row = colRow.get(memberId); if (!row) return null
    const m = model.members.find((x) => x.id === memberId); if (!m) return null
    const s = secById.get(m.section); if (!isConcrete(s)) return null
    const Ast = row.bars * barArea(s!.barDia)
    return concreteColumnMn(s!.b, s!.h, Ast, s!.fc, s!.fy, row.Pu, s!.cover, s!.barDia)
  }
  // beam nominal moment from the heaviest designed section
  const beamMn = (memberId: string): number | null => {
    const row = beamRow.get(memberId); if (!row || row.sections.length === 0) return null
    const m = model.members.find((x) => x.id === memberId); if (!m) return null
    const s = secById.get(m.section); if (!isConcrete(s)) return null
    const gov = row.sections.reduce((a, b) => (b.design.As > a.design.As ? b : a))
    return concreteBeamMn(s!.b, gov.design.d, gov.design.As, s!.fc, s!.fy)
  }

  const rows: SCWBJointRow[] = []
  for (const node of model.nodes) {
    const incident = model.members.filter((m) => m.i === node.id || m.j === node.id)
    let sumMnc = 0, nCols = 0, sumMnb = 0, nBeams = 0
    for (const m of incident) {
      if (m.role === 'column') {
        const mn = columnMn(m.id); if (mn === null) continue
        sumMnc += mn; nCols++
      } else if (m.role === 'beam' || m.role === 'girder') {
        const mn = beamMn(m.id); if (mn === null) continue
        sumMnb += mn; nBeams++
      }
    }
    if (nCols === 0 || nBeams === 0) continue
    const { ratio, ok } = scwbRatio(sumMnc, sumMnb)
    rows.push({ node: node.id, sumMnc, sumMnb, ratio, ok, nCols, nBeams })
  }
  return rows
}
