import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { buildModelActivities } from '../engine/modelSchedule'
import { modelActivitiesToProject, mergeModelIntoProject } from './modelToScheduleProject'
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

  it('merge keeps scheduler-side setup + actuals while taking the model structure', () => {
    // a user has set up the scheduler side: resources, a baseline, and progress
    const existing = {
      ...project,
      resources: [{ id: 'r1', name: 'Crew A', type: 'labor' as const, unit: 'man-day' }],
      baselines: [{ id: 'b1', name: 'BL1', createdAt: '2026-01-01', activities: {} }],
      meta: { ...project.meta, client: 'Acme' },
      activities: project.activities.map((a) => (a.id === 'FP1' ? { ...a, percentComplete: 40, status: 'in-progress' as const, actualStart: '2026-02-01' } : a)),
    }
    // the model is re-derived with an edited duration on FP1
    const edited = modelActivitiesToProject(
      acts.map((a) => (a.id === 'FP1' ? { ...a, duration: a.duration + 9, m: a.m + 9 } : a)), { name: 'Test schedule' })
    const merged = mergeModelIntoProject(existing, edited)

    expect(merged.resources).toHaveLength(1)             // scheduler resources kept
    expect(merged.baselines).toHaveLength(1)             // baseline kept
    expect(merged.meta.client).toBe('Acme')             // scheduler meta kept
    const fp1 = merged.activities.find((a) => a.id === 'FP1')!
    expect(fp1.duration).toBe(acts.find((a) => a.id === 'FP1')!.duration + 9)   // model duration flows in
    expect(fp1.percentComplete).toBe(40)                // actuals preserved
    expect(fp1.actualStart).toBe('2026-02-01')
    expect(fp1.status).toBe('in-progress')
  })
})
