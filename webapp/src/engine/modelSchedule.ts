// ─────────────────────────────────────────────────────────────────────────
// Automatic construction schedule (CPM + PERT) from the 3D model.
//
// Turns the designed structure into a buildable activity network — excavation →
// footings → then, storey by storey, columns → floor (beams/girders + slab) —
// deriving each activity's WORK QUANTITY from the model geometry + design and its
// DURATION from crew-productivity rates.  Activities chain finish-to-start (a lift
// can't start until the floor below is cast); the network is solved with the
// existing CPM/PERT engine so the critical path and expected duration fall out.
//
// Durations are working days.  Rates are typical mid-rise building crew outputs
// and are documented constants — adjust for a specific project.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import type { StructureDesign } from './pipeline'
import { computePert, type PertResult } from './schedule/pert'
import { shapeByName } from './aiscSections'

/** Crew-productivity rates (working days from a work quantity). */
export const SCHEDULE_RATES = {
  excavationM3PerDay: 40,      // machine excavation
  concretePourM3PerDay: 15,    // form + rebar + pour crew throughput
  formworkRebarDays: 3,        // fixed prep before a concrete pour
  slabCureDays: 4,             // stripping/cure before the next lift
  steelErectTonPerDay: 5,      // bolt-up erection
  timberM3PerDay: 8,           // framing
  minDays: 2,
}

export type Trade = 'sitework' | 'foundation' | 'columns' | 'floor'
export type FrameMaterial = 'concrete' | 'steel' | 'wood' | 'mixed'

export interface ModelActivity {
  id: string
  name: string
  trade: Trade
  storey?: number
  quantity: number
  unit: string
  duration: number        // most-likely working days
  o: number; m: number; p: number   // PERT three-point (days)
  predecessors: string[]  // finish-to-start
}

export interface ModelSchedule {
  activities: ModelActivity[]
  pert: PertResult                    // .cpm carries ES/EF/LS/LF/float/critical
  projectDays: number                 // expected duration (Σ TE on the critical path)
  projectSd: number                   // std-dev of the project duration
  criticalPath: string[]
  frame: FrameMaterial
}

const uniqSorted = (v: number[]): number[] => {
  const out: number[] = []
  for (const x of [...v].sort((a, b) => a - b)) if (!out.length || Math.abs(x - out[out.length - 1]) > 0.05) out.push(x)
  return out
}

const durConcrete = (m3: number, cure = 0): number =>
  m3 > 0 ? Math.max(SCHEDULE_RATES.minDays, Math.ceil(m3 / SCHEDULE_RATES.concretePourM3PerDay) + SCHEDULE_RATES.formworkRebarDays + cure) : 0
const durSteel = (ton: number): number =>
  ton > 0 ? Math.max(SCHEDULE_RATES.minDays, Math.ceil(ton / SCHEDULE_RATES.steelErectTonPerDay)) : 0
const durWood = (m3: number): number =>
  m3 > 0 ? Math.max(SCHEDULE_RATES.minDays, Math.ceil(m3 / SCHEDULE_RATES.timberM3PerDay)) : 0

const round1 = (v: number) => Math.round(v * 10) / 10

/** Build the model's construction schedule and solve CPM + PERT. */
export function buildModelSchedule(model: StructuralModel, design: StructureDesign): ModelSchedule | null {
  if (!model.nodes.length || !model.members.length) return null
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const secOf = (memberId: string): RectSection | undefined => {
    const mem = model.members.find((x) => x.id === memberId)
    return mem ? secById.get(mem.section) : undefined
  }
  const levels = uniqSorted(model.nodes.map((n) => n.y))        // [base, L1, L2, …]
  const nStoreys = Math.max(1, levels.length - 1)
  const levelIndex = (y: number): number => {
    let bi = 0, bd = Infinity
    levels.forEach((lv, i) => { const d = Math.abs(lv - y); if (d < bd) { bd = d; bi = i } })
    return bi
  }

  // per-storey work quantities: columns[s] and floor[s] (beams/girders + slab)
  const colConc = Array(nStoreys).fill(0), colSteel = Array(nStoreys).fill(0), colWood = Array(nStoreys).fill(0)
  const flrConc = Array(nStoreys).fill(0), flrSteel = Array(nStoreys).fill(0), flrWood = Array(nStoreys).fill(0)
  let hasConc = false, hasSteel = false, hasWood = false
  const add = (cArr: number[], sArr: number[], wArr: number[], idx: number, sec: RectSection, L: number) => {
    if (idx < 0 || idx >= nStoreys) return
    if (sec.material === 'steel') { const sh = sec.shape ? shapeByName(sec.shape) : undefined; if (sh) { sArr[idx] += (sh.A / 1e6) * L * 7.85; hasSteel = true } }
    else if (sec.material === 'wood') { wArr[idx] += (sec.b / 1000) * (sec.h / 1000) * L; hasWood = true }
    else { cArr[idx] += (sec.b / 1000) * (sec.h / 1000) * L; hasConc = true }
  }
  for (const mem of model.members) {
    const a = nm.get(mem.i), b = nm.get(mem.j); if (!a || !b) continue
    const sec = secOf(mem.id); if (!sec) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    if (mem.role === 'column') add(colConc, colSteel, colWood, levelIndex(Math.max(a.y, b.y)) - 1, sec, L)
    else add(flrConc, flrSteel, flrWood, levelIndex((a.y + b.y) / 2) - 1, sec, L)   // beams/girders sit at a level
  }
  // slabs / timber decks → the floor of their level
  const woodSlabByPlate = new Map(design.woodSlabs.map((s) => [s.plate, s]))
  for (const p of model.plates) {
    if (p.role === 'wall') continue
    const c = p.corners.map((id) => nm.get(id)); if (c.some((q) => !q)) continue
    const cc = c as { x: number; y: number; z: number }[]
    const si = levelIndex((cc[0].y + cc[2].y) / 2) - 1
    if (si < 0 || si >= nStoreys) continue
    const ws = woodSlabByPlate.get(p.id)
    if (ws) { flrWood[si] += ws.design.takeoff.joistM3 + ws.design.takeoff.deckM3; hasWood = true }
    else {
      const lx = Math.hypot(cc[1].x - cc[0].x, cc[1].z - cc[0].z), lz = Math.hypot(cc[3].x - cc[0].x, cc[3].z - cc[0].z)
      flrConc[si] += lx * lz * (p.thickness / 1000); hasConc = true
    }
  }

  // foundation: footing concrete + excavation from the designed footing sizes
  let footConc = 0, excav = 0
  for (const f of design.footings) { const B = f.design.B; footConc += B * B * (f.design.Dc / 1000); excav += B * B * 1.5 }
  for (const cf of design.combined) { footConc += cf.design.Bx * cf.design.By * (cf.design.Dc / 1000); excav += cf.design.Bx * cf.design.By * 1.5 }
  if (excav === 0) excav = model.members.filter((m) => m.role === 'column').length * 3   // no footings designed yet

  const dominant = (conc: number, steel: number, wood: number): { quantity: number; unit: string } =>
    steel > 0 ? { quantity: round1(steel), unit: 't steel' }
      : wood > 0 ? { quantity: round1(wood), unit: 'm³ timber' }
        : { quantity: round1(conc), unit: 'm³ concrete' }

  const acts: ModelActivity[] = []
  const push = (id: string, name: string, trade: Trade, q: { quantity: number; unit: string }, duration: number, predecessors: string[], storey?: number) => {
    acts.push({ id, name, trade, storey, quantity: q.quantity, unit: q.unit, duration, o: Math.max(1, Math.round(duration * 0.8)), m: Math.max(1, Math.round(duration)), p: Math.max(1, Math.round(duration * 1.5)), predecessors })
  }

  push('EXCAV', 'Excavation & site preparation', 'sitework', { quantity: round1(excav), unit: 'm³ soil' }, Math.max(SCHEDULE_RATES.minDays, Math.ceil(excav / SCHEDULE_RATES.excavationM3PerDay)), [])
  push('FOUND', 'Footings — rebar, formwork & pour', 'foundation', { quantity: round1(footConc), unit: 'm³ concrete' }, durConcrete(footConc) || SCHEDULE_RATES.minDays, ['EXCAV'])

  let prev = 'FOUND'
  for (let s = 0; s < nStoreys; s++) {
    const colDur = durConcrete(colConc[s]) + durSteel(colSteel[s]) + durWood(colWood[s]) || SCHEDULE_RATES.minDays
    const colId = `COL${s + 1}`
    push(colId, `Columns — level ${s + 1}`, 'columns', dominant(colConc[s], colSteel[s], colWood[s]), colDur, [prev], s + 1)
    const flrDur = durConcrete(flrConc[s], SCHEDULE_RATES.slabCureDays) + durSteel(flrSteel[s]) + durWood(flrWood[s]) || SCHEDULE_RATES.minDays
    const flrId = `FLR${s + 1}`
    push(flrId, `Floor ${s + 1} — beams, girders & slab`, 'floor', dominant(flrConc[s], flrSteel[s], flrWood[s]), flrDur, [colId], s + 1)
    prev = flrId
  }

  const pert = computePert(acts.map((a) => ({
    id: a.id, optimistic: a.o, mostLikely: a.m, pessimistic: a.p,
    predecessors: a.predecessors.map((pr) => ({ predecessor: pr, type: 'FS' as const, lag: 0 })),
  })))

  const frame: FrameMaterial = [hasConc, hasSteel, hasWood].filter(Boolean).length > 1 ? 'mixed'
    : hasSteel ? 'steel' : hasWood ? 'wood' : 'concrete'

  return { activities: acts, pert, projectDays: pert.projectTe, projectSd: pert.projectSd, criticalPath: pert.cpm.criticalPath, frame }
}
