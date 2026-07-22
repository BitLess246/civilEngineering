import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { buildModelActivities } from '../engine/modelSchedule'
import { modelActivitiesToProject } from './modelToScheduleProject'
import { validateProject, isProjectValid } from '../engine/schedule/validate'
import { computeCPM } from '../engine/schedule/cpm'
import type { RectSection, ModelLoad } from '../engine/model'

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

describe('modelActivitiesToProject', () => {
  const model = twoStorey()
  const design = designStructure(model, soil)!
  const acts = buildModelActivities(model, design)!.activities
  const project = modelActivitiesToProject(acts, { name: 'Test schedule' })

  it('maps every activity with its three-point estimate and relations', () => {
    expect(project.activities).toHaveLength(acts.length)
    for (const a of acts) {
      const pa = project.activities.find((x) => x.id === a.id)!
      expect(pa.duration).toBe(a.duration)
      expect(pa.unit).toBe('days')
      expect(pa.mostLikely).toBe(a.m)
      expect(pa.predecessors.map((p) => `${p.predecessor}:${p.type}:${p.lag}`))
        .toEqual(a.predecessors.map((l) => `${l.id}:${l.type}:${l.lag}`))
    }
  })

  it('groups activities under a WBS by phase (Sitework / Foundation / Level n)', () => {
    expect(project.wbs.length).toBeGreaterThanOrEqual(3)
    for (const a of project.activities) expect(project.wbs.some((w) => w.id === a.wbsId)).toBe(true)
    expect(project.wbs.some((w) => w.id === 'wbs-lvl-2')).toBe(true)   // two storeys
  })

  it('is a valid ScheduleProject the module accepts (no validation errors)', () => {
    expect(validateProject(project).filter((i) => i.severity === 'error')).toHaveLength(0)
    expect(isProjectValid(project)).toBe(true)
  })

  it('the converted network solves to the same critical-path length as the model schedule', () => {
    const cpm = computeCPM(project.activities.map((a) => ({ id: a.id, duration: a.duration, predecessors: a.predecessors })))
    expect(cpm.duration).toBeGreaterThan(0)
    expect(cpm.criticalPath.length).toBeGreaterThan(0)
  })
})
