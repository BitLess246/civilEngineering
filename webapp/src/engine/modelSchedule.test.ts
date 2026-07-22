import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { designStructure } from './pipeline'
import { buildModelSchedule, buildModelActivities, solveModelSchedule, withDuration } from './modelSchedule'
import type { RectSection, ModelLoad } from './model'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function twoStorey() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 150 })
  m.loads = m.plates.flatMap((p): ModelLoad[] => [
    { kind: 'area', plate: p.id, q: 4.0, cat: 'D' },
    { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
  ])
  return m
}

describe('buildModelSchedule — non-linear CPM/PERT from the model', () => {
  const model = twoStorey()
  const design = designStructure(model, soil)!
  const sch = buildModelSchedule(model, design)!
  const by = new Map(sch.activities.map((a) => [a.id, a]))

  it('splits each concrete phase into its trades (form/rebar/pour)', () => {
    // foundation split + per-storey column and floor sub-trades
    for (const id of ['EXCAV', 'FTGF', 'FTGP', 'BACK', 'CF1', 'CP1', 'FF1', 'FR1', 'FP1', 'CF2', 'FP2', 'FIN1']) {
      expect(by.has(id)).toBe(true)
    }
    expect(sch.activities.length).toBeGreaterThanOrEqual(15)   // far more than the old 2-per-storey
  })

  it('uses overlapping (SS) and finish-to-start (FS) relations with lag', () => {
    // rebar starts a lag after formwork begins (overlap), not after it finishes
    const fr1 = by.get('FR1')!.predecessors.find((p) => p.id === 'FF1')!
    expect(fr1.type).toBe('SS')
    expect(fr1.lag).toBeGreaterThan(0)
    // the pour waits for rebar to finish
    expect(by.get('FP1')!.predecessors.some((p) => p.id === 'FR1' && p.type === 'FS')).toBe(true)
  })

  it('has parallel branches — backfill and finishes run off the critical path', () => {
    const cpm = sch.pert.cpm.activities
    // BACK and CF1 both depend on FTGP → they overlap in time
    expect(by.get('BACK')!.predecessors[0].id).toBe('FTGP')
    expect(by.get('CF1')!.predecessors[0].id).toBe('FTGP')
    expect(cpm.get('BACK')!.totalFloat).toBeGreaterThan(0)     // parallel, not critical
    expect(cpm.get('FIN1')!.totalFloat).toBeGreaterThan(0)
    // FR1 overlaps FF1 on the timeline (starts before FF1 finishes)
    expect(cpm.get('FR1')!.es).toBeLessThan(cpm.get('FF1')!.ef)
  })

  it('durations vary across activities and every activity has a positive TE', () => {
    const durs = new Set(sch.activities.map((a) => a.duration))
    expect(durs.size).toBeGreaterThan(1)                       // not one uniform duration
    for (const a of sch.activities) {
      expect(a.duration).toBeGreaterThan(0)
      expect(a.o).toBeLessThanOrEqual(a.m)
      expect(a.m).toBeLessThanOrEqual(a.p)
    }
  })

  it('solves the CPM: critical path is a subset shorter than the full activity list', () => {
    expect(sch.projectDays).toBeGreaterThan(0)
    expect(sch.projectSd).toBeGreaterThan(0)
    expect(sch.criticalPath.length).toBeGreaterThan(0)
    expect(sch.criticalPath.length).toBeLessThan(sch.activities.length)   // parallelism ⇒ not everything is critical
  })

  it('editing a critical activity re-solves the network (longer critical duration → longer project)', () => {
    const b = buildModelActivities(model, design)!
    const s0 = solveModelSchedule(b.activities)
    const critId = s0.criticalPath[s0.criticalPath.length - 1]   // last critical activity → its finish is the project end
    const before = b.activities.find((a) => a.id === critId)!.duration
    const edited = b.activities.map((a) => (a.id === critId ? withDuration(a, before + 10) : a))
    const s1 = solveModelSchedule(edited)
    expect(s1.projectDays).toBeGreaterThan(s0.projectDays)
    // a non-critical (parallel) activity has slack, so bumping it a little keeps the project length
    const slackId = [...s0.pert.cpm.activities.values()].find((c) => c.totalFloat > 2)!.id
    const edited2 = b.activities.map((a) => (a.id === slackId ? withDuration(a, a.duration + 1) : a))
    expect(solveModelSchedule(edited2).projectDays).toBeCloseTo(s0.projectDays, 6)
  })

  it('a steel frame schedules by erection tonnage & deck area', () => {
    const steelSec: RectSection = { ...section, material: 'steel', shape: 'W310x79', name: 'W310x79', steelFy: 345, steelFu: 448 }
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: steelSec, slabThickness: 150 })
    m.loads = m.plates.flatMap((p): ModelLoad[] => [{ kind: 'area', plate: p.id, q: 4.0, cat: 'D' }, { kind: 'area', plate: p.id, q: 2.4, cat: 'L' }])
    const d = designStructure(m, soil)!
    const s = buildModelSchedule(m, d)!
    expect(s.activities.some((a) => a.id === 'CE1' && a.unit.includes('steel'))).toBe(true)
    expect(s.activities.some((a) => a.id === 'DK1')).toBe(true)
  })
})
