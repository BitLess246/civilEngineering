// What the assistant "sees" of Model Space.
//
// The workspace is a 3D canvas: nothing a reader of the DOM could quote says
// how many storeys the frame has, which members fail or why. So the page
// publishes this summary instead — the frame, its loads, whether it has been
// analysed and designed, the failing and most-utilised members, and the
// member the user has selected — the facts "why is my column failing?" needs.
//
// Pure: model + design in, `PageSnapshot` out. Units as the model: geometry m,
// sections mm, forces kN, stress MPa, area loads kPa.
import type { StructuralModel, RectSection } from '../../engine/model'
import { designOK, peakUtilisation, failingChecks, type StructureDesign } from '../../engine/pipeline'
import type { PageSnapshot, PageSnapshotField } from './pageContext'

/** The analysis facts the summary needs, so it does not depend on solver types. */
export interface ModelAnalysisSummary { combos: number; governing: string | null }

/** Most failing / most-utilised members listed — context, not a schedule. */
export const MAX_LISTED = 8

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '∞')

function sectionLabel(s: RectSection | undefined): string {
  if (!s) return '?'
  if (s.shape) return s.shape
  return `${s.material === 'wood' ? 'timber ' : 'RC '}${Math.round(s.b)}×${Math.round(s.h)}`
}

const countBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return m
}
const listCounts = (m: Map<string, number>) => [...m].map(([k, n]) => `${n} ${k}`).join(', ')

/** Why an RC beam fails, from the same flags the pipeline's `beamOK` reads. */
export function rcBeamFailures(b: StructureDesign['beams'][number]): string[] {
  const why = new Set<string>()
  for (const s of b.sections) {
    const d = s.design, at = `${s.label}${s.hogging ? ' (hogging)' : ''}`
    if (!d.flexOK) why.add(`flexure at ${at}: bars do not fit / reach Mu`)
    if (!d.comprEffective || !d.comprNAOK) why.add(`compression steel ineffective at ${at}`)
    if (!d.jointFit) why.add(`bars do not fit the joint at ${at}`)
    if (d.region === 'inadequate') why.add(`shear at ${at}: Vu above the §422.5.1.2 ceiling, enlarge section`)
  }
  if (!b.thickOK) why.add(`h below Table 409.3.1.1 minimum ${Math.round(b.hMin)} mm`)
  return why.size ? [...why] : ['a check fails']
}

/** One member's design line: what it is checked as, its governing ratio, pass/fail. */
interface MemberLine { id: string; kind: string; ratio: number | null; ok: boolean; text: string }

/**
 * Every designed member as a line, ratio where the check has one. An RC beam's
 * flexure has no scalar D/C (`peakUtilisation`'s note), so it is rated on the
 * §422.5.1.2 shear ceiling like the report, and its failure stated as such.
 */
function memberLines(d: StructureDesign): MemberLine[] {
  const out: MemberLine[] = []
  for (const b of d.beams) {
    let worst = 0
    for (const s of b.sections) {
      const cap = s.design.phiVc + 0.75 * s.design.VsMax
      worst = Math.max(worst, cap > 1e-9 ? Math.abs(s.Vu) / cap : 0)
    }
    out.push({ id: b.id, kind: `RC ${b.role}`, ratio: worst, ok: b.ok, text: `L=${f1(b.L)} m, Vu/φVmax=${f2(worst)}${b.ok ? '' : ` — ${rcBeamFailures(b).join(', ')}`}` })
  }
  for (const c of d.columns)
    out.push({ id: c.id, kind: 'RC column', ratio: c.util, ok: c.ok, text: `Pu=${f1(c.Pu)} kN, Mu=${f1(c.Mu)}/${f1(c.Muy)} kN·m, ${c.bars} bars, P-M util=${f2(c.util)}` })
  for (const b of d.steelBeams) {
    const r = Math.max(b.utilM, b.utilV, b.deflLim > 0 ? b.defl / b.deflLim : 0)
    out.push({ id: b.id, kind: `steel ${b.role}`, ratio: r, ok: b.ok, text: `${b.shape}, Mu/φMn=${f2(b.utilM)}, Vu/φVn=${f2(b.utilV)}, δ/limit=${f2(b.defl / Math.max(b.deflLim, 1e-9))} (${b.governing})` })
  }
  for (const c of d.steelColumns)
    out.push({ id: c.id, kind: 'steel column', ratio: c.ratio, ok: c.ok, text: `${c.shape}, Pu=${f1(c.Pu)} kN, §H1-1 ${c.equation}=${f2(c.ratio)}` })
  for (const b of d.woodBeams)
    out.push({ id: b.id, kind: `timber ${b.role}`, ratio: Math.max(b.utilM, b.utilV), ok: b.ok, text: `${b.species} ${Math.round(b.b)}×${Math.round(b.d)}, fb/F'b=${f2(b.utilM)}, fv/F'v=${f2(b.utilV)}${b.stockLengthOK ? '' : ', longer than stock'}` })
  for (const c of d.woodColumns)
    out.push({ id: c.id, kind: 'timber column', ratio: c.ratio, ok: c.ok, text: `${c.species} ${Math.round(c.b)}×${Math.round(c.d)}, ratio=${f2(c.ratio)}` })
  return out
}

/** Pass/fail counts for the families a member list does not cover. */
function otherCounts(d: StructureDesign): string[] {
  const fam: [string, { ok: boolean }[]][] = [
    ['footings', [...d.footings, ...d.combined]], ['slabs', [...d.slabs, ...d.woodSlabs]], ['walls', d.walls],
    ['base plates', d.basePlates], ['pedestals', d.pedestals ?? []], ['stairs', d.stairs], ['SCWB joints', d.scwb],
  ]
  return fam.filter(([, xs]) => xs.length).map(([k, xs]) => `${k}: ${xs.length} (${xs.filter((x) => !x.ok).length} fail)`)
}

/**
 * Model Space as a page snapshot.
 *
 * `selected` is the member (or node) id the user has picked in the viewport;
 * its own lines come first in the results so a question about "this member"
 * finds it even when the snapshot is cut.
 */
export function modelPageSnapshot(
  model: StructuralModel | null, analysis: ModelAnalysisSummary | null,
  design: StructureDesign | null, selected: string | null = null,
): PageSnapshot {
  const snap: PageSnapshot = { route: '/model', tool: 'Model Space (3D frame)', inputs: [], results: [], notes: [] }
  if (!model || !model.nodes.length) {
    snap.notes.push('no model yet — the user has not generated or drawn a frame')
    return snap
  }
  const sec = new Map(model.sections.map((s) => [s.id, s]))
  const xs = model.nodes.map((n) => n.x), ys = model.nodes.map((n) => n.y), zs = model.nodes.map((n) => n.z)
  const span = (v: number[]) => Math.max(...v) - Math.min(...v)
  const inputs: PageSnapshotField[] = snap.inputs
  inputs.push({ label: 'model', value: model.name || 'untitled' })
  inputs.push({ label: 'frame', value: `${model.nodes.length} nodes; ${listCounts(countBy(model.members, (m) => `${m.role}s`))}${model.plates.length ? `; ${model.plates.length} slab panels` : ''}${model.walls?.length ? `; ${model.walls.length} walls` : ''}${model.stairs?.length ? `; ${model.stairs.length} stairs` : ''}` })
  inputs.push({ label: 'plan × height', value: `${f1(span(xs))} × ${f1(span(zs))} m, ${f1(span(ys))} m tall` })
  if (model.storeys.length)
    inputs.push({ label: 'storeys', value: [...model.storeys].sort((a, b) => a.elevation - b.elevation).map((s) => `${s.name} @ +${f1(s.elevation)} m`).join(', ') })
  const used = countBy(model.members, (m) => `${m.role} ${sectionLabel(sec.get(m.section))}`)
  inputs.push({ label: 'sections', value: [...used].slice(0, 16).map(([k, n]) => `${k} ×${n}`).join(', ') })
  const grades = new Set(model.sections.map((s) => (s.shape ? `Fy ${s.steelFy ?? 248} MPa` : s.material === 'wood' ? 'timber' : `f'c ${s.fc} / fy ${s.fy} MPa`)))
  inputs.push({ label: 'materials', value: [...grades].join(', ') })
  inputs.push({ label: 'supports', value: listCounts(countBy(model.supports, (s) => s.fixity)) || 'none' })
  const byCat = new Map<string, string[]>()
  for (const l of model.loads) {
    const k = l.cat
    const what = l.kind === 'area' ? `${l.q} kPa area` : l.kind === 'member-udl' ? (l.sw ? 'self-weight' : `${l.w} kN/m line`) : l.kind === 'node' ? 'nodal' : l.kind === 'member-point' ? `${l.P} kN point` : 'thermal'
    const arr = byCat.get(k) ?? []
    arr.push(what); byCat.set(k, arr)
  }
  inputs.push({ label: 'loads', value: [...byCat].map(([k, ws]) => `${k}: ${[...countBy(ws, (w) => w)].map(([w, n]) => `${w} ×${n}`).join(', ')}`).join('; ') || 'none' })
  const opts = [model.diaphragm && 'rigid diaphragm', model.rigidEndZones && 'rigid end zones', model.shellElements && `shell slabs (mesh ${model.shellSubdiv ?? 1}×${model.shellSubdiv ?? 1})`].filter(Boolean)
  if (opts.length) inputs.push({ label: 'modelling', value: opts.join(', ') })

  const res = snap.results
  res.push({ label: 'analysis', value: analysis ? `run — ${analysis.combos} load combinations${analysis.governing ? `, governing ${analysis.governing}` : ''}` : 'not run yet' })
  if (!design) {
    res.push({ label: 'design', value: 'not run yet' })
  } else {
    const lines = memberLines(design)
    const pick = selected ? lines.find((l) => l.id === selected) : undefined
    if (selected) {
      const m = model.members.find((x) => x.id === selected)
      res.unshift({ label: 'selected', value: m ? `${m.id} (${m.role}, ${sectionLabel(sec.get(m.section))})${pick ? ` — ${pick.ok ? 'OK' : 'FAILS'}: ${pick.text}` : ' — no design row'}` : selected })
    }
    const fails = failingChecks(design)
    res.push({ label: 'design', value: `${designOK(design) ? 'ALL CHECKS PASS' : `${fails} failing check${fails === 1 ? '' : 's'}`}; peak utilisation ${f2(peakUtilisation(design))}; governing case ${design.govName}; system ${design.system.toUpperCase()}` })
    const failing = lines.filter((l) => !l.ok)
    if (failing.length)
      res.push({ label: `failing members (${failing.length})`, value: failing.slice(0, MAX_LISTED).map((l) => `${l.id} ${l.kind}: ${l.text}`).join(' | ') + (failing.length > MAX_LISTED ? ' | …' : '') })
    const top = lines.filter((l) => l.ok && l.ratio !== null).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)).slice(0, 5)
    if (top.length) res.push({ label: 'most utilised (passing)', value: top.map((l) => `${l.id} ${l.kind}: ${l.text}`).join(' | ') })
    const other = otherCounts(design)
    if (other.length) res.push({ label: 'other checks', value: other.join('; ') })
    const badSlabs = design.slabs.filter((x) => !x.ok)
    if (badSlabs.length)
      res.push({ label: 'failing slabs', value: badSlabs.slice(0, MAX_LISTED).map((x) => `${x.plate} ${f1(x.lx)}×${f1(x.ly)} m${x.minThickness ? ` — no bar mat complies; needs h ≥ ${Math.round(x.minThickness)} mm` : ''}`).join(' | ') })
    const badFootings = design.footings.filter((x) => !x.ok)
    if (badFootings.length)
      res.push({ label: 'failing footings', value: badFootings.slice(0, MAX_LISTED).map((x) => `node ${x.node}: Pu=${f1(x.Pu)} kN`).join(' | ') })
    if (design.unchecked.length) snap.notes.push(`${design.unchecked.length} member(s) could not be checked: ${design.unchecked.slice(0, 4).map((u) => `${u.id} (${u.reason})`).join('; ')}`)
    if (design.pDeltaIssues.length) snap.notes.push(`P-Δ did not converge in: ${design.pDeltaIssues.slice(0, 4).join(', ')}`)
  }
  if (!design && selected) {
    const m = model.members.find((x) => x.id === selected)
    if (m) res.unshift({ label: 'selected', value: `${m.id} (${m.role}, ${sectionLabel(sec.get(m.section))})` })
  }
  snap.notes.push('the user may refer to members by their id')
  return snap
}
