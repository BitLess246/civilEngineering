// ─────────────────────────────────────────────────────────────────────────
// MODEL SPACE → TABLES — every result the page holds, as rows a spreadsheet
// can take. Pure: no React, no ExcelJS. `modelWorkbook.ts` writes these.
//
// The shape is `ScheduleReport` (title, meta, sections of columns × rows),
// the same payload the schedule module's CSV/PDF/Excel exporters render, so
// there is one Excel writer in the app rather than two.
//
// Units, stated in every header that has one: geometry m, displacement mm,
// rotation rad, sections mm, force kN, moment kN·m, pressure kPa.
//
// FEM results are laid out explicitly (one row per node/member × combination).
// The DESIGN schedules are flattened generically — every scalar field, nested
// objects one level deep as `parent.child`, arrays of objects as a child sheet
// keyed by the parent row's id — so a field added to a schedule reaches the
// workbook without anyone remembering to add it here.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from '../engine/model'
import type { F3Analysis } from '../engine/frame3d'
import type { StructureDesign } from '../engine/pipeline'
import type { SeismicResult, DriftRow } from '../engine/seismic'
import type { ReportSection, ScheduleReport } from './scheduleReport'
import type { ModalResult } from '../engine/modal'
import type { ResponseSpectrumResult } from '../engine/responseSpectrum'
import type { PushoverModelResult } from '../engine/pushoverModel'
import type { BiaxialPushoverResult } from '../engine/biaxialFrameModel'
import type { TimeHistoryModelResult } from '../engine/timeHistoryModel'
import type { NonlinearModelResult } from '../engine/nonlinearModel'
import type { NonlinearFrameModelResult } from '../engine/nonlinearFrameModel'

export type Cell = string | number
export type { ReportSection }

/** Six significant figures: enough for any engineering quantity, without
 *  the float noise (0.30000000000000004) a raw dump carries into a cell. */
export const num = (v: number): number | string => (Number.isFinite(v) ? Number(v.toPrecision(6)) : '—')

// ── generic flattening ────────────────────────────────────────────────────

/** Header text for the keys the schedules share. Anything else shows its key. */
const HEADERS: Record<string, string> = {
  id: 'Member', node: 'Node', role: 'Role', L: 'L (m)', ok: 'OK', gov: 'Governing case', util: 'Utilisation',
  Pu: 'Pu (kN)', Mu: 'Mu (kN·m)', Muy: 'Muy (kN·m)', Vu: 'Vu (kN)', e: 'e (mm)', bars: 'Bars', phiPn: 'φPn (kN)',
  tieSpacing: 'Tie s (mm)', tieSpacingFinal: 'Tie s final (mm)', tieSpacingLabel: 'Ties', hMin: 'h min (mm)',
  thickOK: 'h ≥ h min', x: 'x (m)', label: 'Section', hogging: 'Hogging', shape: 'Shape',
  phiMn: 'φMn (kN·m)', phiVn: 'φVn (kN)', As: 'As (mm²)', b: 'b (mm)', h: 'h (mm)', d: 'd (mm)',
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const scalar = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
const cell = (v: unknown): Cell => (typeof v === 'number' ? num(v) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v))

/**
 * Rows of objects → one table, plus a child table per array-of-objects field.
 * Columns are the union of keys, in first-seen order; short numeric arrays
 * (≤ 6) are joined into one cell, longer ones (diagram ordinates) are left
 * out — they are curves, not values, and the FEM sheets carry them properly.
 */
export function flattenRows(title: string, rows: readonly object[], parentKey = 'id'): ReportSection[] {
  const cols: string[] = []
  const seen = new Set<string>()
  const add = (k: string) => { if (!seen.has(k)) { seen.add(k); cols.push(k) } }
  const children = new Map<string, { parent: Cell; row: object }[]>()
  const flat = rows.map((r) => {
    const out = new Map<string, Cell>()
    for (const [k, v] of Object.entries(r)) {
      if (v === undefined || v === null || typeof v === 'function') continue
      if (scalar(v)) { add(k); out.set(k, cell(v)); continue }
      if (Array.isArray(v)) {
        if (v.every((x) => typeof x === 'number') && v.length <= 6) { add(k); out.set(k, v.map((x) => num(x as number)).join(', ')); continue }
        if (v.length && v.every(isPlain)) {
          const list = children.get(k) ?? []
          for (const row of v) list.push({ parent: cell((r as Record<string, unknown>)[parentKey] ?? ''), row: row as object })
          children.set(k, list)
        }
        continue
      }
      if (isPlain(v)) {
        for (const [sk, sv] of Object.entries(v)) {
          if (!scalar(sv)) continue
          const key = `${k}.${sk}`
          add(key); out.set(key, cell(sv))
        }
      }
    }
    return out
  })
  const sections: ReportSection[] = [{
    title,
    columns: cols.map((c) => HEADERS[c] ?? c),
    rows: flat.map((m) => cols.map((c) => m.get(c) ?? '')),
  }]
  for (const [k, list] of children) {
    const [child] = flattenRows(`${title} — ${k}`, list.map((x) => x.row))
    sections.push({
      title: child.title,
      columns: [HEADERS[parentKey] ?? parentKey, ...child.columns],
      rows: child.rows.map((row, i) => [list[i].parent, ...row]),
    })
  }
  return sections
}

// ── the model itself ─────────────────────────────────────────────────────

export function modelSections(model: StructuralModel): ReportSection[] {
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const sup = new Map(model.supports.map((s) => [s.node, s]))
  const secOf = new Map(model.sections.map((s) => [s.id, s]))
  const len = (i: string, j: string) => {
    const a = nm.get(i), b = nm.get(j)
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : NaN
  }
  return [
    {
      title: 'Nodes',
      columns: ['Node', 'x (m)', 'y (m)', 'z (m)', 'Support', 'kx (kN/m)', 'ky (kN/m)', 'kz (kN/m)'],
      rows: model.nodes.map((n) => {
        const s = sup.get(n.id)
        return [n.id, num(n.x), num(n.y), num(n.z), s?.fixity ?? '', s?.kx != null ? num(s.kx) : '', s?.ky != null ? num(s.ky) : '', s?.kz != null ? num(s.kz) : '']
      }),
    },
    {
      title: 'Members',
      columns: ['Member', 'Role', 'Node i', 'Node j', 'L (m)', 'Section', 'Material', 'b (mm)', 'h (mm)', 'Shape', 'Axis rotation (°)', 'Releases', 'Axial'],
      rows: model.members.map((m) => {
        const s = secOf.get(m.section)
        const rel = (['iEnd', 'jEnd'] as const).flatMap((e) => {
          const f = { ...(m.releases?.[e] ?? {}) }
          if (m.connections?.[e] === 'simple') { f.My = true; f.Mz = true }
          const on = Object.entries(f).filter(([, v]) => v).map(([k]) => k)
          return on.length ? [`${e === 'iEnd' ? 'i' : 'j'}: ${on.join(' ')}`] : []
        }).join('; ')
        return [m.id, m.role, m.i, m.j, num(len(m.i, m.j)), s?.name ?? m.section, s?.material ?? 'concrete',
          s ? num(s.b) : '', s ? num(s.h) : '', s?.shape ?? '', m.axisRotation != null ? num(m.axisRotation) : '', rel, m.axialMode ?? '']
      }),
    },
    ...flattenRows('Sections', model.sections).map((t) => ({ ...t, columns: t.columns.map((c) => (c === 'Member' ? 'Section' : c)) })),
    ...(model.plates.length ? [{
      title: 'Plates',
      columns: ['Plate', 'Role', 'Corners', 'Thickness (mm)', 'Openings'],
      rows: model.plates.map((p) => [p.id, p.role, p.corners.join(' '), num(p.thickness), p.openings?.length ?? 0] as Cell[]),
    }] : []),
    {
      title: 'Loads',
      columns: ['Category', 'Kind', 'On', 'Fx (kN)', 'Fy (kN)', 'Fz (kN)', 'w (kN/m, down)', 'P (kN, down)', 'at t (0–1)', 'q (kPa, down)', 'ΔT (°C)', 'α (/°C)', 'Self weight'],
      rows: model.loads.map((l): Cell[] => {
        const b: Cell[] = [l.cat, l.kind]
        switch (l.kind) {
          case 'node': return [...b, l.node, num(l.Fx ?? 0), num(l.Fy ?? 0), num(l.Fz ?? 0), '', '', '', '', '', '', '']
          case 'member-udl': return [...b, l.member, '', '', '', num(l.w), '', '', '', '', '', l.sw ? 'yes' : '']
          case 'member-point': return [...b, l.member, '', '', '', '', num(l.P), num(l.t), '', '', '', '']
          case 'area': return [...b, l.plate, '', '', '', '', '', '', num(l.q), '', '', '']
          case 'member-thermal': return [...b, l.member, '', '', '', '', '', '', '', num(l.deltaT), num(l.alpha), '']
        }
      }),
    },
  ]
}

// ── linear FEM results ───────────────────────────────────────────────────

/**
 * The analysis, per combination. `nodeOrder` is the bridge's node order
 * (`modelToFrame3D(model).nodes`), which the displacement vector `d` is
 * index-aligned with — six DOF per node, m and rad.
 */
export function analysisSections(analysis: F3Analysis, nodeOrder: readonly string[], modelNodes?: ReadonlySet<string>): ReportSection[] {
  const runs = analysis.perCombo.filter((r) => r.result && !r.skipped)
  const keep = (id: string) => !modelNodes || modelNodes.has(id)
  const gov = analysis.perCombo[analysis.govIdx]
  const combos = new Set<string>()
  const factorCols = ['D', 'L', 'Lr', 'S', 'R', 'W', 'E', 'T'] as const
  const out: ReportSection[] = [{
    title: 'Load combinations',
    columns: ['Combination', ...factorCols.map((c) => `${c} factor`), 'Solved', 'Governing'],
    rows: analysis.perCombo.map((r) => {
      combos.add(r.combo.name)
      return [r.combo.name, ...factorCols.map((c) => num(r.combo.f[c] ?? 0)), r.result && !r.skipped ? 'yes' : 'skipped', r === gov ? 'yes' : '']
    }),
  }]
  out.push({
    title: 'Node displacements',
    columns: ['Combination', 'Node', 'Ux (mm)', 'Uy (mm)', 'Uz (mm)', 'Rx (rad)', 'Ry (rad)', 'Rz (rad)'],
    rows: runs.flatMap((r) => nodeOrder.flatMap((id, k): Cell[][] => {
      if (!keep(id)) return []
      const d = r.result!.d
      return [[r.combo.name, id, num(d[6 * k] * 1000), num(d[6 * k + 1] * 1000), num(d[6 * k + 2] * 1000), num(d[6 * k + 3]), num(d[6 * k + 4]), num(d[6 * k + 5])]]
    })),
  })
  out.push({
    title: 'Support reactions',
    columns: ['Combination', 'Node', 'Fixity', 'Fx (kN)', 'Fy (kN)', 'Fz (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Mz (kN·m)'],
    rows: runs.flatMap((r) => r.result!.reactions.map((x) => [r.combo.name, x.node, x.fixity, ...x.F.map(num), ...x.M.map(num)])),
  })
  out.push({
    title: 'Member end forces',
    columns: ['Combination', 'Member', 'End', 'N (kN)', 'Vy (kN)', 'Vz (kN)', 'T (kN·m)', 'My (kN·m)', 'Mz (kN·m)'],
    rows: runs.flatMap((r) => r.result!.members.flatMap((m) => [
      [r.combo.name, m.id, 'i', ...m.f.slice(0, 6).map(num)],
      [r.combo.name, m.id, 'j', ...m.f.slice(6, 12).map(num)],
    ])),
  })
  // envelope: each member's largest |value| over every combination, and where
  const env = new Map<string, { L: number; v: Record<'Nmax' | 'Vmax' | 'Mmax' | 'Tmax', [number, string]> }>()
  for (const r of runs) for (const m of r.result!.members) {
    const e = env.get(m.id) ?? { L: m.L, v: { Nmax: [0, ''], Vmax: [0, ''], Mmax: [0, ''], Tmax: [0, ''] } }
    for (const k of ['Nmax', 'Vmax', 'Mmax', 'Tmax'] as const) if (Math.abs(m[k]) > Math.abs(e.v[k][0])) e.v[k] = [m[k], r.combo.name]
    env.set(m.id, e)
  }
  out.push({
    title: 'Member envelope',
    columns: ['Member', 'L (m)', '|N| max (kN)', 'at', '|V| max (kN)', 'at', '|M| max (kN·m)', 'at', '|T| max (kN·m)', 'at'],
    rows: [...env].map(([id, e]) => [id, num(e.L), ...(['Nmax', 'Vmax', 'Mmax', 'Tmax'] as const).flatMap((k) => [num(e.v[k][0]), e.v[k][1]])]),
  })
  if (gov?.result) out.push({
    title: 'Member diagrams (governing)',
    columns: ['Combination', 'Member', 'x (m)', 'N (kN)', 'Vy (kN)', 'Vz (kN)', 'T (kN·m)', 'My (kN·m)', 'Mz (kN·m)'],
    rows: gov.result.members.flatMap((m) => m.xs.map((x, k) => [gov.combo.name, m.id, num(x), num(m.N[k]), num(m.Vy[k]), num(m.Vz[k]), num(m.T[k]), num(m.My[k]), num(m.Mz[k])])),
  })
  return out
}

// ── seismic and drift ────────────────────────────────────────────────────

export function seismicSections(seis: { x: SeismicResult; z: SeismicResult } | null | undefined, drift?: readonly DriftRow[] | null): ReportSection[] {
  const out: ReportSection[] = []
  if (seis) {
    out.push({
      title: 'Seismic base shear',
      columns: ['Direction', 'hn (m)', 'Ta (s)', 'T (s)', 'Method', 'W (kN)', 'V raw (kN)', 'V max (kN)', 'V min (kN)', 'V (kN)', 'Ft (kN)'],
      rows: (['x', 'z'] as const).map((k) => {
        const s = seis[k]
        return [k.toUpperCase(), num(s.hn), num(s.Ta), num(s.T), s.Tmethod, num(s.W), num(s.Vraw), num(s.Vmax), num(s.Vmin), num(s.V), num(s.Ft)]
      }),
    })
    out.push({
      title: 'Seismic storey forces',
      columns: ['Direction', 'Elevation (m)', 'hx (m)', 'wx (kN)', 'Fx (kN)', 'Nodes'],
      rows: (['x', 'z'] as const).flatMap((k) => seis[k].storeys.map((s) => [k.toUpperCase(), num(s.elevation), num(s.hx), num(s.wx), num(s.Fx), s.nodes])),
    })
  }
  if (drift?.length) out.push({
    title: 'Storey drift',
    columns: ['Elevation (m)', 'hs (m)', 'Δs (mm)', 'ΔM = 0.7RΔs (mm)', 'Limit (mm)', 'OK'],
    rows: drift.map((d) => [num(d.elevation), num(d.hs), num(d.ds), num(d.dM), num(d.limit), d.ok ? 'yes' : 'NO']),
  })
  return out
}

// ── dynamics, pushover, nonlinear ────────────────────────────────────────

const XYZ = ['X', 'Y', 'Z'] as const

export function modalSections(modal: ModalResult): ReportSection[] {
  const cum = [0, 0, 0]
  return [
    {
      title: 'Modal periods',
      columns: ['Mode', 'T (s)', 'f (Hz)', 'ω (rad/s)',
        ...XYZ.map((d) => `Meff ${d} (t)`), ...XYZ.map((d) => `Meff/M ${d}`), ...XYZ.map((d) => `ΣMeff/M ${d}`)],
      rows: modal.modes.map((m, k) => {
        m.effMassRatio.forEach((r, q) => { cum[q] += r })
        return [k + 1, num(m.period), num(m.freq), num(m.omega), ...m.effMass.map(num), ...m.effMassRatio.map(num), ...cum.map(num)]
      }),
    },
    {
      title: 'Mode shapes',
      columns: ['Mode', 'Node', 'ux', 'uy', 'uz'],
      rows: modal.modes.flatMap((m, k) => Object.entries(m.shape).map(([node, u]) => [k + 1, node, ...u.map(num)])),
    },
  ]
}

export function spectrumSections(rsa: ResponseSpectrumResult): ReportSection[] {
  return [{
    title: 'Response spectrum',
    columns: ['Mode', 'T (s)', 'Sa (m/s²)', 'Sa/g', ...XYZ.map((d) => `V ${d} (kN)`)],
    rows: [
      ...rsa.modalForces.map((f) => [f.modeIdx + 1, num(f.period), num(f.Sa), num(f.SaG), ...f.baseShear.map(num)] as Cell[]),
      ['SRSS', '', '', '', ...rsa.srss.map(num)],
      ['CQC', '', '', '', ...rsa.cqc.map(num)],
      ['CQC / static', '', '', '', ...rsa.cqcRatio.map((r) => (r == null ? '—' : num(r)))],
    ],
  }]
}

export function timeHistorySections(th: TimeHistoryModelResult): ReportSection[] {
  const r = th.result, hist = r.nodeHistory
  return [
    {
      title: 'Time history',
      columns: ['t (s)', `Base shear ${XYZ[r.dir]} (kN)`, ...(hist ? XYZ.map((d) => `${hist.node} u${d.toLowerCase()} (mm)`) : [])],
      rows: r.t.map((t, k) => [num(t), num(r.baseShear[k]), ...(hist?.u[k] ? hist.u[k].map((v) => num(v * 1000)) : [])]),
    },
    {
      title: 'Time history modes',
      columns: ['Mode', 'T (s)', 'Γ', 'peak |D| (mm)', 'peak ω²D (m/s²)'],
      rows: r.modal.map((m, k) => [k + 1, num(m.period), num(m.gamma), num(m.peakD * 1000), num(m.peakA)]),
    },
    {
      title: 'Time history peaks',
      columns: ['Node', ...XYZ.map((d) => `peak |u${d.toLowerCase()}| (mm)`)],
      rows: Object.entries(r.peakDisp).map(([node, u]) => [node, ...u.map((v) => num(v * 1000))]),
    },
  ]
}

export function pushoverSections(po: PushoverModelResult): ReportSection[] {
  return [
    {
      title: 'Pushover curve',
      columns: ['Event', 'λ', 'Base shear (kN)', `Roof disp ${po.controlNode} (mm)`, 'Hinge formed', 'Hinges'],
      rows: po.result.curve.map((c) => [c.event, num(c.lambda), num(c.baseShear), num(c.roofDisp * 1000),
        c.newHinge ? `${c.newHinge.member}/${c.newHinge.end} ${c.newHinge.type}${c.newHinge.axis ? ` ${c.newHinge.axis}` : ''}` : '', c.numHinges]),
    },
    ...flattenRows('Pushover hinges', po.result.hinges, 'member'),
  ]
}

export function biaxialSections(bx: BiaxialPushoverResult): ReportSection[] {
  return [{
    title: 'Biaxial pushover',
    columns: [`Disp ${bx.controlNode} ${bx.controlDir} (mm)`, 'Base shear (kN)', 'Hinges yielded'],
    rows: bx.curve.map((c) => [num(c.disp * 1000), num(c.shear), c.hinges]),
  }]
}

/** The shear-building nonlinear time history (storey springs). */
export function nonlinearStoreySections(nl: { inelastic: NonlinearModelResult | null; elastic: NonlinearModelResult | null }): ReportSection[] {
  const out: ReportSection[] = []
  for (const [tag, r] of [['inelastic', nl.inelastic], ['elastic', nl.elastic]] as const) {
    if (!r) continue
    const T = tag === 'inelastic' ? 'NLTH' : 'NLTH elastic'
    out.push(...flattenRows(`${T} storeys`, r.storeys, 'storey').map((x) => ({
      ...x,
      rows: x.rows.map((row, k) => [...row, ...(tag === 'inelastic' ? [num(r.response.ductility[k] ?? NaN), num(r.response.dissipated[k] ?? NaN)] : [])]),
      columns: [...x.columns, ...(tag === 'inelastic' ? ['Ductility demand', 'Dissipated (kN·m)'] : [])],
    })))
    out.push({
      title: `${T} history`,
      columns: ['Step', 'Base force (kN)', ...r.storeys.map((s) => `Storey ${s.storey} u (mm)`)],
      rows: r.response.u.map((u, k) => [k, num(r.response.baseForce[k] ?? NaN), ...u.slice(0, r.storeys.length).map((v) => num(v * 1000))]),
    })
  }
  return out
}

/** The hinge-frame nonlinear time history. */
export function nonlinearFrameSections(nl: { inelastic: NonlinearFrameModelResult | null; elastic: NonlinearFrameModelResult | null }): ReportSection[] {
  const out: ReportSection[] = []
  for (const [tag, r] of [['inelastic', nl.inelastic], ['elastic', nl.elastic]] as const) {
    if (!r) continue
    const T = tag === 'inelastic' ? 'NL frame' : 'NL frame elastic'
    out.push({
      title: `${T} history`,
      columns: ['t (s)', 'Control disp (mm)', 'Base shear (kN)'],
      rows: r.response.t.map((t, k) => [num(t), num(r.response.disp[k] * 1000), num(r.response.baseShear[k])]),
    })
    if (tag === 'inelastic') out.push(...flattenRows(`${T} hinges`, r.response.hinges, 'member'))
  }
  return out
}

// ── design schedules ─────────────────────────────────────────────────────

const SCHEDULE_TITLES: Partial<Record<keyof StructureDesign, string>> = {
  beams: 'RC beams', prestressed: 'Prestressed beams', columns: 'RC columns',
  steelBeams: 'Steel beams', steelColumns: 'Steel columns', woodBeams: 'Timber beams', woodColumns: 'Timber columns',
  basePlates: 'Base plates', steelBraces: 'Steel braces', pedestals: 'Pedestals', postBases: 'Post bases',
  joints: 'Steel joints', beamJoints: 'Beam-beam joints', slabs: 'Slabs', woodSlabs: 'Timber floors',
  walls: 'Walls', stairs: 'Stairs', footings: 'Footings', combined: 'Combined footings', scwb: 'SCWB checks',
}

export function designSections(design: StructureDesign): ReportSection[] {
  const out: ReportSection[] = []
  for (const [k, title] of Object.entries(SCHEDULE_TITLES) as [keyof StructureDesign, string][]) {
    const rows = design[k]
    if (!Array.isArray(rows) || !rows.length || !rows.every(isPlain)) continue
    const key = 'id' in (rows[0] as object) ? 'id' : 'node' in (rows[0] as object) ? 'node' : 'id'
    out.push(...flattenRows(title, rows as object[], key))
  }
  return out
}

// ── the whole workbook ───────────────────────────────────────────────────

export interface ModelTablesInput {
  model: StructuralModel
  analysis?: F3Analysis | null
  /** Bridge node order — required with `analysis` (see `analysisSections`). */
  nodeOrder?: readonly string[]
  design?: StructureDesign | null
  seismic?: { x: SeismicResult; z: SeismicResult } | null
  drift?: readonly DriftRow[] | null
  modal?: ModalResult | null
  rsa?: ResponseSpectrumResult | null
  timeHistory?: TimeHistoryModelResult | null
  pushover?: PushoverModelResult | null
  biaxial?: BiaxialPushoverResult | null
  nonlinear?: { inelastic: NonlinearModelResult | null; elastic: NonlinearModelResult | null } | null
  nonlinearFrame?: { inelastic: NonlinearFrameModelResult | null; elastic: NonlinearFrameModelResult | null } | null
}

/**
 * Everything the page has, as one report. A result that has not been run is
 * simply absent, and the Summary says which were included, so an empty sheet
 * never stands in for "not run".
 */
export function modelResultTables(i: ModelTablesInput): ScheduleReport {
  const included: string[] = ['Model']
  const sections: ReportSection[] = [...modelSections(i.model)]
  if (i.analysis && i.nodeOrder) {
    sections.push(...analysisSections(i.analysis, i.nodeOrder, new Set(i.model.nodes.map((n) => n.id))))
    included.push('Linear analysis')
  }
  const seis = seismicSections(i.seismic, i.drift)
  if (seis.length) { sections.push(...seis); included.push('Seismic') }
  const add = (label: string, part: ReportSection[]) => { if (part.length) { sections.push(...part); included.push(label) } }
  if (i.modal) add('Modal', modalSections(i.modal))
  if (i.rsa) add('Response spectrum', spectrumSections(i.rsa))
  if (i.timeHistory) add('Time history', timeHistorySections(i.timeHistory))
  if (i.pushover) add('Pushover', pushoverSections(i.pushover))
  if (i.biaxial) add('Biaxial pushover', biaxialSections(i.biaxial))
  if (i.nonlinear) add('Nonlinear time history', nonlinearStoreySections(i.nonlinear))
  if (i.nonlinearFrame) add('Nonlinear frame time history', nonlinearFrameSections(i.nonlinearFrame))
  if (i.design) { sections.push(...designSections(i.design)); included.push('Design schedules') }
  const meta: [string, string][] = [
    ['Model', i.model.name || 'Untitled'],
    ['Nodes / members / plates', `${i.model.nodes.length} / ${i.model.members.length} / ${i.model.plates.length}`],
    ['Included', included.join(', ')],
    ['Units', 'geometry m · displacement mm · rotation rad · sections mm · force kN · moment kN·m · pressure kPa'],
    ['Sign convention', 'Member end forces are local forces ON the member (x′ along i→j, y′ section depth, z′ width)'],
  ]
  if (i.modal) meta.push(['Mass model', i.modal.massModel], ['Total mass X/Y/Z (t)', i.modal.totalMass.map((v) => String(num(v))).join(' / ')])
  if (i.design) {
    meta.push(['Governing combination', i.design.govName])
    const t = i.design.totals
    meta.push(['Concrete (m³)', String(num(t.concrete))], ['Steel (kg)', String(num(t.steelKg))])
  }
  return { title: `${i.model.name || 'Model'} — results`, meta, sections: uniqueTitles(sections) }
}

/** Excel sheet names are ≤ 31 characters and unique (case-insensitively). */
function uniqueTitles(sections: ReportSection[]): ReportSection[] {
  const used = new Set<string>()
  return sections.map((s) => {
    const base = s.title.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
    let t = base, k = 2
    while (used.has(t.toLowerCase())) { const suf = ` (${k++})`; t = base.slice(0, 31 - suf.length) + suf }
    used.add(t.toLowerCase())
    return { ...s, title: t }
  })
}
