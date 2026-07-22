// ─────────────────────────────────────────────────────────────────────────
// Automatic construction schedule (CPM + PERT) from the 3D model.
//
// Turns the designed structure into a REALISTIC, non-linear activity network and
// solves it with the existing CPM/PERT engine.  Each storey is split into its
// trades (formwork → rebar → pour → cure, or erect → deck → pour by material),
// and the trades overlap and branch:
//   · rebar/deck START-TO-START a lag after formwork/erection begins (overlap);
//   · the next lift starts finish-to-start after the floor below is cast;
//   · backfill runs in PARALLEL with the ground-floor columns;
//   · trailing finishes/MEP run in PARALLEL with the structure going up above.
// so the critical path threads the governing trades while the rest carry float.
//
// Work quantities come from the model geometry + design; durations from documented
// crew-productivity rates.  Durations are working days.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import type { StructureDesign } from './pipeline'
import { computePert, type PertResult } from './schedule/pert'
import type { RelationType } from './schedule/model'
import { shapeByName } from './aiscSections'

/** Crew-productivity rates (working days from a work quantity). */
export const SCHEDULE_RATES = {
  excavationM3PerDay: 40,
  backfillM3PerDay: 50,
  formworkM2PerDay: 25,
  rebarTonPerDay: 1.5,
  rebarRatioTPerM3: 0.10,     // ~100 kg reinforcing per m³ of RC
  concretePourM3PerDay: 20,
  cureDays: 5,                // strip/cure before the next lift is loaded
  steelErectTonPerDay: 5,
  deckM2PerDay: 60,           // metal deck + shear studs / timber sheathing
  timberFrameM3PerDay: 8,
  finishesM2PerDay: 30,       // trailing MEP rough-in + partitions
  overlapLag: 1,              // SS lag between overlapping trades (days)
  minDays: 1,
}

export type Trade = 'sitework' | 'foundation' | 'columns' | 'floor' | 'finishes'
export type FrameMaterial = 'concrete' | 'steel' | 'wood' | 'mixed'

export interface ActivityLink { id: string; type: RelationType; lag: number }

export interface ModelActivity {
  id: string
  name: string
  trade: Trade
  storey?: number
  quantity: number
  unit: string
  duration: number        // most-likely working days
  o: number; m: number; p: number   // PERT three-point (days)
  predecessors: ActivityLink[]
}

export interface ModelSchedule {
  activities: ModelActivity[]
  pert: PertResult                    // .cpm carries ES/EF/LS/LF/float/critical
  projectDays: number
  projectSd: number
  criticalPath: string[]
  frame: FrameMaterial
}

const uniqSorted = (v: number[]): number[] => {
  const out: number[] = []
  for (const x of [...v].sort((a, b) => a - b)) if (!out.length || Math.abs(x - out[out.length - 1]) > 0.05) out.push(x)
  return out
}
const dur = (q: number, rate: number): number => Math.max(SCHEDULE_RATES.minDays, Math.ceil(Math.max(0, q) / rate))
const round1 = (v: number) => Math.round(v * 10) / 10
const FS = (id: string, lag = 0): ActivityLink => ({ id, type: 'FS', lag })
const SS = (id: string, lag = 0): ActivityLink => ({ id, type: 'SS', lag })

/** Recompute the duration-derived PERT three-point (O/M/P) for an activity — used
 *  when the user edits a duration in the schedule views. */
export function withDuration(a: ModelActivity, duration: number): ModelActivity {
  const d = Math.max(SCHEDULE_RATES.minDays, Math.round(duration))
  return { ...a, duration: d, o: Math.max(1, Math.round(d * 0.8)), m: d, p: Math.max(1, Math.round(d * 1.5)) }
}

/** Solve CPM + PERT for a set of activities (base or user-edited). */
export function solveModelSchedule(activities: ModelActivity[]): Omit<ModelSchedule, 'activities' | 'frame'> {
  const pert = computePert(activities.map((a) => ({
    id: a.id, optimistic: a.o, mostLikely: a.m, pessimistic: a.p,
    predecessors: a.predecessors.map((l) => ({ predecessor: l.id, type: l.type, lag: l.lag })),
  })))
  return { pert, projectDays: pert.projectTe, projectSd: pert.projectSd, criticalPath: pert.cpm.criticalPath }
}

/** Derive the construction activities (split trades, overlaps, parallel branches)
 *  from the model + design — before CPM/PERT is solved, so callers can edit the
 *  activities and re-solve. */
export function buildModelActivities(model: StructuralModel, design: StructureDesign): { activities: ModelActivity[]; frame: FrameMaterial } | null {
  if (!model.nodes.length || !model.members.length) return null
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const secOf = (memberId: string): RectSection | undefined => {
    const mem = model.members.find((x) => x.id === memberId)
    return mem ? secById.get(mem.section) : undefined
  }
  const levels = uniqSorted(model.nodes.map((n) => n.y))
  const nStoreys = Math.max(1, levels.length - 1)
  const levelIndex = (y: number): number => {
    let bi = 0, bd = Infinity
    levels.forEach((lv, i) => { const d = Math.abs(lv - y); if (d < bd) { bd = d; bi = i } })
    return bi
  }
  const zero = () => Array(nStoreys).fill(0)
  // per-storey work quantities
  const colConc = zero(), colForm = zero(), colTon = zero(), colWood = zero()
  const flrConc = zero(), flrForm = zero(), flrTon = zero(), flrWood = zero()
  const slabConc = zero(), slabArea = zero()
  let hasConc = false, hasSteel = false, hasWood = false

  const formworkArea = (sec: RectSection, L: number, isColumn: boolean): number => {
    const b = sec.b / 1000, h = sec.h / 1000
    return isColumn ? 2 * (b + h) * L : (b + 2 * h) * L   // column perimeter · L ; beam bottom + 2 sides
  }
  for (const mem of model.members) {
    const a = nm.get(mem.i), b = nm.get(mem.j); if (!a || !b) continue
    const sec = secOf(mem.id); if (!sec) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const isCol = mem.role === 'column'
    const si = (isCol ? levelIndex(Math.max(a.y, b.y)) : levelIndex((a.y + b.y) / 2)) - 1
    if (si < 0 || si >= nStoreys) continue
    if (sec.material === 'steel') { const sh = sec.shape ? shapeByName(sec.shape) : undefined; if (sh) { (isCol ? colTon : flrTon)[si] += (sh.A / 1e6) * L * 7.85; hasSteel = true } }
    else if (sec.material === 'wood') { (isCol ? colWood : flrWood)[si] += (sec.b / 1000) * (sec.h / 1000) * L; hasWood = true }
    else { (isCol ? colConc : flrConc)[si] += (sec.b / 1000) * (sec.h / 1000) * L; (isCol ? colForm : flrForm)[si] += formworkArea(sec, L, isCol); hasConc = true }
  }
  const woodSlabByPlate = new Map(design.woodSlabs.map((s) => [s.plate, s]))
  for (const p of model.plates) {
    if (p.role === 'wall') continue
    const c = p.corners.map((id) => nm.get(id)); if (c.some((q) => !q)) continue
    const cc = c as { x: number; y: number; z: number }[]
    const si = levelIndex((cc[0].y + cc[2].y) / 2) - 1
    if (si < 0 || si >= nStoreys) continue
    const area = Math.hypot(cc[1].x - cc[0].x, cc[1].z - cc[0].z) * Math.hypot(cc[3].x - cc[0].x, cc[3].z - cc[0].z)
    slabArea[si] += area
    const ws = woodSlabByPlate.get(p.id)
    if (ws) { flrWood[si] += ws.design.takeoff.joistM3 + ws.design.takeoff.deckM3; hasWood = true }
    else { slabConc[si] += area * (p.thickness / 1000); hasConc = true }
  }

  // foundation quantities
  let footConc = 0, excav = 0
  for (const f of design.footings) { const B = f.design.B; footConc += B * B * (f.design.Dc / 1000); excav += B * B * 1.5 }
  for (const cf of design.combined) { footConc += cf.design.Bx * cf.design.By * (cf.design.Dc / 1000); excav += cf.design.Bx * cf.design.By * 1.5 }
  if (excav === 0) excav = model.members.filter((m) => m.role === 'column').length * 3

  const acts: ModelActivity[] = []
  const push = (id: string, name: string, trade: Trade, quantity: number, unit: string, duration: number, predecessors: ActivityLink[], storey?: number) => {
    const d = Math.max(SCHEDULE_RATES.minDays, Math.round(duration))
    acts.push({ id, name, trade, storey, quantity: round1(quantity), unit, duration: d, o: Math.max(1, Math.round(d * 0.8)), m: d, p: Math.max(1, Math.round(d * 1.5)), predecessors })
  }

  // ── Foundation (excavation → footing form+rebar (overlapped) → pour → backfill ∥) ──
  push('EXCAV', 'Excavation & site preparation', 'sitework', excav, 'm³ soil', dur(excav, SCHEDULE_RATES.excavationM3PerDay), [])
  push('FTGF', 'Footings — formwork & rebar', 'foundation', footConc, 'm³ (RC)', dur(footConc * 3, SCHEDULE_RATES.formworkM2PerDay) + dur(footConc * SCHEDULE_RATES.rebarRatioTPerM3, SCHEDULE_RATES.rebarTonPerDay), [SS('EXCAV', SCHEDULE_RATES.overlapLag)])
  push('FTGP', 'Footings — concrete pour', 'foundation', footConc, 'm³ concrete', dur(footConc, SCHEDULE_RATES.concretePourM3PerDay), [FS('FTGF')])
  push('BACK', 'Backfill & compaction', 'foundation', excav * 0.6, 'm³ fill', dur(excav * 0.6, SCHEDULE_RATES.backfillM3PerDay), [FS('FTGP')])   // parallel branch (has float)

  let prevExit = 'FTGP'
  for (let s = 0; s < nStoreys; s++) {
    const lvl = s + 1
    const mat: FrameMaterial = colTon[s] > 0 ? 'steel' : colWood[s] > 0 ? 'wood' : 'concrete'
    const lag = SCHEDULE_RATES.overlapLag
    let exit: string

    if (mat === 'steel') {
      const ce = `CE${lvl}`, be = `BE${lvl}`, dk = `DK${lvl}`, sp = `SP${lvl}`
      push(ce, `Columns L${lvl} — steel erection`, 'columns', colTon[s], 't steel', dur(colTon[s], SCHEDULE_RATES.steelErectTonPerDay), [FS(prevExit)], lvl)
      push(be, `Floor ${lvl} — beam/girder erection`, 'floor', flrTon[s], 't steel', dur(flrTon[s], SCHEDULE_RATES.steelErectTonPerDay), [FS(ce)], lvl)
      push(dk, `Floor ${lvl} — metal deck & shear studs`, 'floor', slabArea[s], 'm²', dur(slabArea[s], SCHEDULE_RATES.deckM2PerDay), [SS(be, lag)], lvl)
      push(sp, `Floor ${lvl} — slab pour & cure`, 'floor', slabConc[s], 'm³ concrete', dur(slabConc[s], SCHEDULE_RATES.concretePourM3PerDay) + SCHEDULE_RATES.cureDays, [FS(dk)], lvl)
      exit = sp
    } else if (mat === 'wood') {
      const pf = `PF${lvl}`, jf = `JF${lvl}`, sh = `SH${lvl}`, fa = `FA${lvl}`
      push(pf, `Level ${lvl} — post/column framing`, 'columns', colWood[s], 'm³ timber', dur(colWood[s], SCHEDULE_RATES.timberFrameM3PerDay), [FS(prevExit)], lvl)
      push(jf, `Floor ${lvl} — joist & beam framing`, 'floor', flrWood[s], 'm³ timber', dur(flrWood[s], SCHEDULE_RATES.timberFrameM3PerDay), [FS(pf)], lvl)
      push(sh, `Floor ${lvl} — deck sheathing`, 'floor', slabArea[s], 'm²', dur(slabArea[s], SCHEDULE_RATES.deckM2PerDay), [SS(jf, lag)], lvl)
      push(fa, `Floor ${lvl} — fastening & blocking`, 'floor', slabArea[s], 'm²', dur(slabArea[s], SCHEDULE_RATES.finishesM2PerDay), [FS(sh)], lvl)
      exit = fa
    } else {
      const cf = `CF${lvl}`, cp = `CP${lvl}`, ff = `FF${lvl}`, fr = `FR${lvl}`, fp = `FP${lvl}`
      const floorConc = flrConc[s] + slabConc[s]
      const floorForm = flrForm[s] + slabArea[s]
      push(cf, `Columns L${lvl} — formwork & rebar`, 'columns', colForm[s], 'm² form', dur(colForm[s], SCHEDULE_RATES.formworkM2PerDay) + dur(colConc[s] * SCHEDULE_RATES.rebarRatioTPerM3, SCHEDULE_RATES.rebarTonPerDay), [FS(prevExit)], lvl)
      push(cp, `Columns L${lvl} — concrete pour`, 'columns', colConc[s], 'm³ concrete', dur(colConc[s], SCHEDULE_RATES.concretePourM3PerDay), [FS(cf)], lvl)
      push(ff, `Floor ${lvl} — formwork & shoring`, 'floor', floorForm, 'm² form', dur(floorForm, SCHEDULE_RATES.formworkM2PerDay), [FS(cp)], lvl)
      push(fr, `Floor ${lvl} — rebar & MEP rough-in`, 'floor', floorConc * SCHEDULE_RATES.rebarRatioTPerM3, 't rebar', dur(floorConc * SCHEDULE_RATES.rebarRatioTPerM3, SCHEDULE_RATES.rebarTonPerDay), [SS(ff, lag)], lvl)
      push(fp, `Floor ${lvl} — concrete pour & cure`, 'floor', floorConc, 'm³ concrete', dur(floorConc, SCHEDULE_RATES.concretePourM3PerDay) + SCHEDULE_RATES.cureDays, [FS(fr), FS(cp)], lvl)
      exit = fp
    }

    // trailing finishes / MEP for this floor — starts after the pour, runs in
    // PARALLEL with the storey above (carries float, off the critical path).
    push(`FIN${lvl}`, `Floor ${lvl} — finishes & MEP`, 'finishes', slabArea[s], 'm²', dur(slabArea[s], SCHEDULE_RATES.finishesM2PerDay), [SS(exit, SCHEDULE_RATES.cureDays)], lvl)
    prevExit = exit
  }

  const frame: FrameMaterial = [hasConc, hasSteel, hasWood].filter(Boolean).length > 1 ? 'mixed'
    : hasSteel ? 'steel' : hasWood ? 'wood' : 'concrete'
  return { activities: acts, frame }
}

/** Build the model's construction schedule and solve CPM + PERT (convenience). */
export function buildModelSchedule(model: StructuralModel, design: StructureDesign): ModelSchedule | null {
  const b = buildModelActivities(model, design)
  if (!b) return null
  return { activities: b.activities, frame: b.frame, ...solveModelSchedule(b.activities) }
}
