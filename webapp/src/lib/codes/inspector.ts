// The Code Compliance Inspector — Model Space's design results read as code
// checks: per member, which provisions were checked, at what utilisation, and
// where the Code Library explains it.
//
// It RE-READS the design, it never re-designs. Every verdict is the pipeline's
// own (`row.ok` and the BeamDesignResult flags behind it), so the inspector
// cannot disagree with the schedule it sits beside. Ratios: an RC beam is
// rated against its PROVIDED bars and stirrups — `beamProvidedCapacities`, the
// number the member's worked solution prints in "Provided capacities" and
// Beam Design's check cards show — not against φMn,max, which is the most the
// section could take with the most steel allowed and so reads a 90 %-worked
// beam as a third of that. Every other kind keeps the ratio the schedules
// print (`memberRows`). What the inspector adds is the clause, the state, the
// order (worst first) and the link.
//
// States: FAIL when the engine's verdict fails; NEAR when it passes at ≥ 90 %;
// PASS otherwise; UNRATED when the row has neither a verdict nor a ratio.
import type { StructuralModel } from '../../engine/model'
import type { StructureDesign } from '../../engine/pipeline'
import { memberRows, memberSection, type MemberKind } from '../modelMemberResults'
import { beamProvidedCapacities } from '../beamSolution'
import { shapeByName } from '../../engine/aiscSections'
import { codeLink } from './links'
import { punchingExample } from './punching'

export type InspectState = 'pass' | 'near' | 'fail' | 'unrated'

/** Passing at or above this utilisation is flagged as near the limit. */
export const NEAR_LIMIT = 0.9

export interface InspectedCheck {
  name: string
  /** Clause the check applies, with its edition. */
  clause: string
  util: number | null
  state: InspectState
  /** The Code Library page for it, opened with this member — absent until the library covers it. */
  explain?: string
}

export interface InspectedMember {
  id: string
  kind: MemberKind
  kindLabel: string
  section: string
  detail: string
  /** Governing utilisation as the schedule reports it. */
  util: number | null
  state: InspectState
  checks: InspectedCheck[]
}

const KIND_LABEL: Record<MemberKind, string> = {
  beam: 'RC beam', column: 'RC column', slab: 'Slab panel', steelBeam: 'Steel beam',
  steelColumn: 'Steel column', footing: 'Footing', combined: 'Combined footing',
}

/** The clauses each kind's design checks, for kinds whose sub-checks the row does not itemise. */
const KIND_CLAUSE: Record<Exclude<MemberKind, 'beam'>, { name: string; clause: string }> = {
  column: { name: 'Axial + biaxial bending (P–M)', clause: 'NSCP 2015 §422.4, §410.5.1.1 (Bresler)' },
  slab: { name: 'Two-way slab, direct design', clause: 'NSCP 2015 §408.10' },
  steelBeam: { name: 'Flexure and shear', clause: 'AISC 360-16 §F2, §G2.1' },
  steelColumn: { name: 'Compression and combined forces', clause: 'AISC 360-16 §E3, §H1-1' },
  footing: { name: 'Bearing, one- and two-way shear, flexure', clause: 'NSCP 2015 §413, §422.6' },
  combined: { name: 'Bearing, shear and flexure', clause: 'NSCP 2015 §413' },
}

export function stateOf(ok: boolean | null, util: number | null): InspectState {
  if (ok === false) return 'fail'
  if (ok === null && util === null) return 'unrated'
  if (ok === null && util !== null && util > 1 + 1e-9) return 'fail'
  return util !== null && util >= NEAR_LIMIT ? 'near' : 'pass'
}

const RANK: Record<InspectState, number> = { fail: 0, near: 1, pass: 2, unrated: 3 }
const pass = (ok: boolean): InspectState => (ok ? 'pass' : 'fail')

/**
 * RC beams itemise their checks from the design flags of every critical
 * section, and are rated against the section as built. The rectangle is the
 * web, tension steel only — conservative where a flange or compression steel
 * acts, exactly as the worked solution states it.
 */
function beamChecks(model: StructuralModel, d: StructureDesign, id: string): { checks: InspectedCheck[]; util: number | null } {
  const row = d.beams.find((b) => b.id === id)
  const sec = memberSection(model, id)
  if (!row || !row.sections.length || !sec) return { checks: [], util: null }
  const rated = row.sections.map((s) => {
    const cap = beamProvidedCapacities({
      b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, comprBarDia: 16, stirrupDia: sec.tieDia,
      fc: sec.fc, fy: sec.fy, fyt: sec.fy, legs: s.design.legs, Mu: Math.abs(s.Mu), Vu: Math.abs(s.Vu),
    }, s.design)
    return { s, uM: cap.phiMn > 1e-9 ? Math.abs(s.Mu) / cap.phiMn : null, uV: cap.phiVn > 1e-9 ? Math.abs(s.Vu) / cap.phiVn : null }
  })
  const gov = (k: 'uM' | 'uV') => rated.reduce((a, r) => ((r[k] ?? -1) > (a[k] ?? -1) ? r : a))
  const fl = gov('uM'), sh = gov('uV')
  const link = (pid: string, s: (typeof rated)[number]['s']) => codeLink(pid, {
    b: sec.b, h: sec.h, cover: sec.cover, stirrupDia: sec.tieDia, nBars: s.design.bars, barDia: sec.barDia,
    fc: sec.fc, fy: sec.fy, fyt: sec.fy, Mu: Math.abs(s.Mu), Vu: Math.abs(s.Vu), legs: s.design.legs,
    ...(s.design.sAdopt > 0 ? { s: s.design.sAdopt } : {}),
  }, { route: '/model', label: `Model Space · ${id}`, layers: s.design.layers.length })
  const all = row.sections.map((s) => s.design)
  const flexOK = all.every((x) => x.flexOK), shearOK = all.every((x) => x.region !== 'inadequate')
  const flanged = !!fl.s.bf
  const checks: InspectedCheck[] = [
    { name: `Flexure at ${fl.s.label}${flanged ? ' (web only — the flange adds to this)' : ''}`, clause: 'NSCP 2015 §409.5.1.1, §422.2',
      util: fl.uM, state: flexOK ? stateOf(true, fl.uM) : 'fail', explain: link('rc-beam-flexure', fl.s) },
    { name: `Shear at ${sh.s.label}`, clause: 'NSCP 2015 §422.5, §409.7.6.2.2',
      util: sh.uV, state: shearOK ? stateOf(true, sh.uV) : 'fail', explain: link('rc-beam-shear', sh.s) },
    { name: 'Bars fit the section and the joint', clause: 'NSCP 2015 §425.2.1', util: null, state: pass(all.every((x) => x.jointFit)) },
    { name: 'Compression steel effective', clause: 'NSCP 2015 §409.5.1.1 (doubly reinforced)', util: null,
      state: pass(all.every((x) => x.comprEffective && x.comprNAOK)) },
    // §409.3.1.1: the table depth OR the computed deflection — the same either/or the design accepts
    { name: 'Serviceability: minimum depth or computed deflection', clause: 'NSCP 2015 Table 409.3.1.1, §424.2', util: null,
      state: pass(row.thickOK || (!!row.deflection && row.deflection.liveOK && row.deflection.totalOK)) },
  ]
  const us = [fl.uM, sh.uV].filter((u): u is number => u !== null)
  return { checks, util: us.length ? Math.max(...us) : null }
}

/** Steel beams and columns itemise their checks; W-shapes link to the §F/§G/§E provisions. */
function steelChecks(model: StructuralModel, d: StructureDesign, kind: 'steelBeam' | 'steelColumn', id: string): InspectedCheck[] {
  const sec = memberSection(model, id)
  const Fy = sec?.steelFy ?? 248                     // the pipeline's own default
  const isW = (shape: string) => shapeByName(shape)?.family === 'W'
  const from = { route: '/model', label: `Model Space · ${id}` }
  if (kind === 'steelBeam') {
    const r = d.steelBeams.find((b) => b.id === id)
    if (!r) return []
    // the pipeline checks a steel beam over its full length at Cb = 1 (Lb in mm on the row)
    const ex = isW(r.shape) ? { shape: r.shape, Fy, Lb: r.Lb / 1000, Cb: 1, Mu: Math.abs(r.Mu), Vu: Math.abs(r.Vu) } : undefined
    return [
      { name: `Flexure, §${r.clause}`, clause: `NSCP 2015 §506 · AISC 360-16 §${r.clause}`, util: r.utilM, state: stateOf(r.utilM <= 1 + 1e-9, r.utilM),
        ...(ex ? { explain: codeLink('steel-beam-flexure', ex, from) } : {}) },
      { name: `Shear, §${r.shearClause ?? 'G2.1'}`, clause: `NSCP 2015 §507 · AISC 360-16 §${r.shearClause ?? 'G2.1'}`, util: r.utilV, state: stateOf(r.utilV <= 1 + 1e-9, r.utilV),
        ...(ex && (r.shearClause ?? 'G2.1') === 'G2.1' ? { explain: codeLink('steel-beam-shear', ex, from) } : {}) },
      { name: 'Deflection, L/240 (simply supported bound)', clause: 'NSCP 2015 §424 serviceability', util: r.deflLim > 0 ? r.defl / r.deflLim : null, state: pass(r.deflOK) },
    ]
  }
  const r = d.steelColumns.find((c) => c.id === id)
  if (!r) return []
  const uP = r.phiPn > 1e-9 ? Math.abs(r.Pu) / r.phiPn : null
  return [
    { name: 'Compression, φcPn', clause: 'NSCP 2015 §505 · AISC 360-16 §E3', util: uP, state: stateOf(uP === null ? null : uP <= 1 + 1e-9, uP),
      ...(isW(r.shape) ? { explain: codeLink('steel-column-compression', { shape: r.shape, Fy, L: r.L, Kx: r.Kx, Ky: r.Ky, Pu: Math.abs(r.Pu) }, from) } : {}) },
    { name: `Axial + bending, §H1-1 (${r.equation})`, clause: 'NSCP 2015 §508 · AISC 360-16 §H1-1', util: r.ratio, state: stateOf(r.ok, r.ratio) },
  ]
}

/**
 * An isolated footing's punching check, itemised and linked, read back off
 * the pad the pipeline designed: the column (or pedestal) width it was sized
 * around — `padColumnWidth`, square — the built d (Dc − cover − db), its
 * factored pressure qu and the governing Pu. The ratio is that example's own
 * Vu/φVc, so the row and the page it opens agree. The remaining checks
 * (bearing, one-way shear, flexure) stay one row at the schedule's ratio.
 */
function footingChecks(model: StructuralModel, d: StructureDesign, id: string, util: number | null, state: InspectState): InspectedCheck[] {
  const rest: InspectedCheck = { name: 'Bearing, one-way shear, flexure', clause: 'NSCP 2015 §413, §422.5', util, state }
  const row = d.footings.find((f) => f.node === id)
  const col = model.members.find((m) => m.role === 'column' && (m.i === id || m.j === id))
  const sec = col ? memberSection(model, col.id) : undefined
  const ped = (d.pedestals ?? []).find((p) => p.node === id)
  const c = ped?.design.side || (sec ? Math.min(sec.b, sec.h) : 0)
  const fc = sec?.fc
  if (!row || !(c > 0) || !(fc != null && fc > 0)) return [{ ...KIND_CLAUSE.footing, util, state }]
  const ex = {
    c1: c, c2: c, h: row.design.Dc, d: row.design.dProvided, fc, lambda: 1, position: 'interior' as const,
    Pu: row.Pu, qu: row.design.qu,
  }
  const r = punchingExample(ex)
  if (!r) return [{ ...KIND_CLAUSE.footing, util, state }]
  const u = r.phiVc > 0 ? r.Vu / r.phiVc : null
  return [
    { name: 'Two-way (punching) shear', clause: 'NSCP 2015 §422.6', util: u, state: stateOf(row.design.punchOK, u),
      explain: codeLink('two-way-punching-shear', ex, { route: '/model', label: `Model Space · footing ${id}` }) },
    rest,
  ]
}

const KINDS: MemberKind[] = ['beam', 'column', 'steelBeam', 'steelColumn', 'slab', 'footing', 'combined']

/** Every designed member as code checks, worst first (fail → near → pass → unrated, then by utilisation). */
export function inspectDesign(model: StructuralModel, d: StructureDesign): InspectedMember[] {
  const out: InspectedMember[] = []
  for (const kind of KINDS) {
    for (const r of memberRows(model, d, kind)) {
      if (kind === 'beam') {
        const { checks, util } = beamChecks(model, d, r.id)
        // the engine's verdict decides failure; the provided-capacity ratio decides "near"
        const state = r.ok === false ? 'fail' : stateOf(true, util)
        out.push({ id: r.id, kind, kindLabel: KIND_LABEL[kind], section: r.section, detail: r.detail, util, state, checks })
        continue
      }
      const state = stateOf(r.ok, r.util)
      const checks = kind === 'steelBeam' || kind === 'steelColumn'
        ? steelChecks(model, d, kind, r.id)
        : kind === 'footing' ? footingChecks(model, d, r.id, r.util, state)
          : [{ ...KIND_CLAUSE[kind], util: r.util, state }]
      out.push({ id: r.id, kind, kindLabel: KIND_LABEL[kind], section: r.section, detail: r.detail, util: r.util, state, checks })
    }
  }
  return out.sort((a, b) => RANK[a.state] - RANK[b.state] || (b.util ?? -1) - (a.util ?? -1))
}

export function summarize(items: InspectedMember[]): Record<InspectState, number> {
  const s: Record<InspectState, number> = { pass: 0, near: 0, fail: 0, unrated: 0 }
  for (const i of items) s[i.state]++
  return s
}

/**
 * The key the 3D scene draws an inspected item under: a member or slab panel
 * by its own id, an isolated pad as `ft-<node>`, a combined pad as
 * `cf-<n1>-<n2>` — the keys `footingLayout` gives the footings it lays out.
 */
export function sceneKeyOf(it: Pick<InspectedMember, 'kind' | 'id'>): string {
  if (it.kind === 'footing') return `ft-${it.id}`
  if (it.kind === 'combined') return `cf-${it.id.split(' + ').join('-')}`
  return it.id
}
