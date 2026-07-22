import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { designStructure } from './pipeline'
import { buildModelSchedule } from './modelSchedule'
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

describe('buildModelSchedule — auto CPM/PERT from the model', () => {
  const model = twoStorey()
  const design = designStructure(model, soil)!
  const sch = buildModelSchedule(model, design)!

  it('derives the excavation → footings → per-storey columns/floors sequence', () => {
    const ids = sch.activities.map((a) => a.id)
    expect(ids.slice(0, 2)).toEqual(['EXCAV', 'FOUND'])
    // two storeys → COL1, FLR1, COL2, FLR2
    expect(ids).toEqual(['EXCAV', 'FOUND', 'COL1', 'FLR1', 'COL2', 'FLR2'])
  })

  it('chains finish-to-start: each lift waits on the floor below', () => {
    const by = new Map(sch.activities.map((a) => [a.id, a]))
    expect(by.get('FOUND')!.predecessors).toEqual(['EXCAV'])
    expect(by.get('COL1')!.predecessors).toEqual(['FOUND'])
    expect(by.get('FLR1')!.predecessors).toEqual(['COL1'])
    expect(by.get('COL2')!.predecessors).toEqual(['FLR1'])
  })

  it('every activity carries a positive duration and a three-point estimate O ≤ M ≤ P', () => {
    for (const a of sch.activities) {
      expect(a.duration).toBeGreaterThan(0)
      expect(a.o).toBeLessThanOrEqual(a.m)
      expect(a.m).toBeLessThanOrEqual(a.p)
      expect(a.quantity).toBeGreaterThanOrEqual(0)
    }
  })

  it('solves the CPM: a linear chain makes every activity critical', () => {
    expect(sch.projectDays).toBeGreaterThan(0)
    // pure FS chain (no parallelism) → the whole sequence is the critical path
    expect(sch.criticalPath).toEqual(['EXCAV', 'FOUND', 'COL1', 'FLR1', 'COL2', 'FLR2'])
    // project duration = Σ expected times
    const sumTe = sch.activities.reduce((s, a) => s + (a.o + 4 * a.m + a.p) / 6, 0)
    expect(sch.projectDays).toBeCloseTo(sumTe, 6)
    expect(sch.projectSd).toBeGreaterThan(0)
  })

  it('reports the frame material and reflects it in the activity units', () => {
    expect(sch.frame).toBe('concrete')
    expect(sch.activities.find((a) => a.id === 'COL1')!.unit).toContain('concrete')
  })

  it('a steel frame schedules by tonnage', () => {
    const steelSec: RectSection = { ...section, material: 'steel', shape: 'W310x79', name: 'W310x79', steelFy: 345, steelFu: 448 }
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: steelSec, slabThickness: 150 })
    m.loads = m.plates.flatMap((p): ModelLoad[] => [{ kind: 'area', plate: p.id, q: 4.0, cat: 'D' }, { kind: 'area', plate: p.id, q: 2.4, cat: 'L' }])
    const d = designStructure(m, soil)!
    const s = buildModelSchedule(m, d)!
    expect(s.frame === 'steel' || s.frame === 'mixed').toBe(true)
    expect(s.activities.find((a) => a.id === 'COL1')!.unit).toContain('steel')
  })
})
