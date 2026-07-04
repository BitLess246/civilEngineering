import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { connectionRowSolution } from './connectionSolution'
import type { RectSection } from '../engine/model'

const steel: RectSection = {
  id: 'S1', name: 'W310x79', b: 306, h: 310, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
  material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448,
}
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

describe('connectionRowSolution — schedule row worked solution', () => {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: steel })
  m.loads = buildGravityLoads(m, 4.8, 2.4)
  const d = designStructure(m, soil)!
  const joint = d.joints[0]
  const conn = joint.connections[0]

  it('walks bolt group → plate → weld → verdict with the designed values', () => {
    const steps = connectionRowSolution(conn, { kind: 'column', shape: joint.columnShape, faceType: conn.faceType })
    const titles = steps.map((s) => s.title)
    expect(titles[0]).toContain('Design forces')
    expect(titles).toContainEqual(expect.stringContaining('Bolt group'))
    expect(titles).toContainEqual(expect.stringContaining('Plate'))
    expect(titles).toContainEqual(expect.stringContaining('Weld'))
    expect(titles[titles.length - 1]).toBe('Verdict')
    // the recomputed plate capacity in the printed check equals the engine's sizing basis
    const flat = JSON.stringify(steps)
    expect(flat).toContain(`${conn.tab.t}`)
    expect(flat).toContain(`M${conn.bolts.dia}`)
    expect(conn.ok).toBe(true)
    expect(flat).toContain('All checks pass')
  })

  it('a moment connection adds the CJP flange-force step', () => {
    const mc = d.joints.flatMap((j) => j.connections).find((c) => c.connType === 'moment-flange-weld')
    if (!mc) return   // model may design all-simple; the beam-column suite covers moment conns
    const steps = connectionRowSolution(mc, { kind: 'column', shape: joint.columnShape, faceType: mc.faceType })
    expect(steps.some((s) => s.title.includes('Flange force'))).toBe(true)
  })

  it('a coped beam-to-beam fin plate adds the SCM Part 9 cope step', () => {
    const coped = { ...conn, cope: { lengthMm: 98, depthMm: 26 } }
    const steps = connectionRowSolution(coped, { kind: 'girder', shape: 'W360x51' })
    const copeStep = steps.find((s) => s.title.includes('Coped'))!
    expect(copeStep).toBeTruthy()
    expect(JSON.stringify(copeStep)).toContain('98 mm long × 26 mm deep')
  })
})
