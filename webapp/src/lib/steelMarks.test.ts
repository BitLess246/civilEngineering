import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { connectionMarks, markAt, signature } from './steelMarks'
import type { RectSection } from '../engine/model'

const steel: RectSection = { id: 'S', name: 'W310x79', b: 254, h: 307, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: steel, slabThickness: 150 })
m.loads = buildGravityLoads(m, 1.0, 1.9)
const d = designStructure(m, soil)!
const ends = [
  ...d.joints.flatMap((j) => j.connections.map((c) => ({ node: j.nodeId, c, bb: false }))),
  ...d.beamJoints.flatMap((j) => j.connections.map((c) => ({ node: j.nodeId, c, bb: true }))),
]

describe('connectionMarks — every designed beam end scheduled to one typical detail', () => {
  const marks = connectionMarks(d)

  it('marks every designed end, and each end belongs to exactly one type', () => {
    expect(ends.length).toBeGreaterThan(0)
    expect(marks.byEnd.size).toBe(ends.length)
    const listed = marks.types.flatMap((t) => t.ends)
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed.length).toBe(ends.length)
  })

  it('one mark per fabricated detail: same bolts/plate/weld share it, and the prefix says the kind', () => {
    for (const t of marks.types) {
      const pre = { 'shear-tab': 'SC', 'moment-flange-weld': 'MF', 'moment-web-plate': 'MP', 'fin-plate': 'FP' }[t.kind]
      expect(t.mark.startsWith(pre)).toBe(true)
      for (const e of t.ends) {
        const [beamId, node] = e.split('@') as [string, string]
        const c = ends.find((x) => x.c.beamId === beamId && x.node === node)!.c
        expect([c.bolts.n, c.bolts.dia, c.tab.t, c.tab.weldSizeMm]).toEqual([t.sample.bolts.n, t.sample.bolts.dia, t.sample.tab.t, t.sample.tab.weldSizeMm])
      }
    }
    // numbered 1, 2, … within each prefix, in design order
    const byPre = new Map<string, number[]>()
    for (const t of marks.types) { const p = t.mark.slice(0, 2); byPre.set(p, [...(byPre.get(p) ?? []), Number(t.mark.slice(2))]) }
    for (const ns of byPre.values()) expect(ns).toEqual(ns.map((_, i) => i + 1))
  })

  it('no two marks describe the same fabricated detail (demand never splits a type)', () => {
    const sigs = marks.types.map((t) => signature(t.sample, t.kind === 'fin-plate'))
    expect(new Set(sigs).size).toBe(sigs.length)
    // this frame's ends differ only in demand along each line, so it needs few types
    expect(marks.types.length).toBeLessThan(ends.length / 2)
  })

  it('carries the worst demand among the ends it serves', () => {
    for (const t of marks.types) {
      const cs = t.ends.map((e) => ends.find((x) => `${x.c.beamId}@${x.node}` === e)!.c)
      expect(t.Vu).toBeCloseTo(Math.max(...cs.map((c) => c.Vu)), 9)
      expect(t.ok).toBe(cs.every((c) => c.ok))
    }
  })

  it('reads — where no connection was designed', () => {
    expect(markAt(marks, 'no-such-beam', 'n0')).toBe('—')
  })
})
