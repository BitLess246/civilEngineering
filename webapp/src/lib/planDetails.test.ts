import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { footingsForPlan, footingDetailBundles, recoverBarDia } from './planDetails'
import type { RectSection, ModelLoad } from '../engine/model'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function designed() {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  m.loads = m.plates.flatMap((p): ModelLoad[] => [
    { kind: 'area', plate: p.id, q: 4.0, cat: 'D' },
    { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
  ])
  return { model: m, design: designStructure(m, soil)! }
}

describe('planDetails — design → plan/detail inputs', () => {
  const { model, design } = designed()

  it('recoverBarDia snaps a steel area + count back to a standard bar', () => {
    const As = 4 * (Math.PI / 4) * 20 * 20   // 4 × ⌀20
    expect(recoverBarDia(As, 4)).toBe(20)
    expect(recoverBarDia(0, 0)).toBe(16)      // safe fallback
  })

  it('maps every designed footing to a PlanFooting with a recovered bar Ø', () => {
    const fs = footingsForPlan(design)
    expect(fs).toHaveLength(design.footings.length)
    for (const f of fs) {
      expect(f.B).toBeGreaterThan(0)
      expect(f.barDia).toBeGreaterThan(0)
      expect(f.node).toBeTruthy()
    }
  })

  it('bundles one detail per distinct footing type, marked WF-n', () => {
    const b = footingDetailBundles(model, design, soil)
    const distinct = new Set(design.footings.map((r) => `${Math.round(r.design.B * 1000)}x${Math.round(r.design.Dc)}`))
    expect(b).toHaveLength(distinct.size)
    expect(b.map((x) => x.mark)).toEqual(b.map((_, i) => `WF-${i + 1}`))
  })

  it('each bundle carries a valid footing detail + a tied-column section from the model', () => {
    const [b0] = footingDetailBundles(model, design, soil)
    expect(b0.detail.B).toBeGreaterThan(0)
    expect(b0.detail.H).toBeGreaterThan(0)
    expect(b0.detail.foundingElev).toBe(-1.5)             // top of footing at embedment depth
    expect(b0.detail.colB).toBe(section.b)                // column size from the model section
    expect(b0.column.shape).toBe('tied')
    expect(b0.column.b).toBe(section.b)
    expect(b0.column.bars).toBeGreaterThanOrEqual(4)
  })
})
