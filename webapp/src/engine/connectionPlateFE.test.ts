import { describe, it, expect } from 'vitest'
import { tabPlateFE, gussetPlateFE } from './connectionPlateFE'
import { designBraceEnd } from './braceConnection'
import { shapeByName } from './aiscSections'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import type { RectSection } from './model'

describe('the designed plates as FE models', () => {
  it('a gusset: the brace force goes out through its welded edges, and the field is finite', () => {
    const frame = { kind: 'corner' as const, eb: 155, ec: 153.5, theta: Math.PI / 4, upper: true }
    const e = designBraceEnd(shapeByName('HSS127x127x6.4')!, 400, 300, frame, 450)!
    const g = gussetPlateFE(e, frame)!
    const P = e.P * 1000
    expect(g.fe.applied[0]).toBeCloseTo(P * Math.SQRT1_2, 3)
    expect(g.fe.applied[0] + g.fe.reaction[0]).toBeCloseTo(0, 3)
    expect(g.fe.applied[1] + g.fe.reaction[1]).toBeCloseTo(0, 3)
    expect(g.welds).toHaveLength(2)
    expect(Math.abs(g.fe.area - g.fe.areaExact) / g.fe.areaExact).toBeLessThan(0.01)
    // the force enters over the Whitmore section: its mean stress there is
    // P/(Lw·tg) — the field's mean can't sit below a fraction of it, nor its peak below it
    expect(g.fe.maxVm).toBeGreaterThan(P / (e.whitmore.Lw0 * e.tg))
  })
})

describe('a designed shear tab, from the design pipeline', () => {
  it('loads each hole with its bolt force, balances at the weld, and peaks at a hole', () => {
    const steel: RectSection = { id: 'S1', name: 'W310x79', b: 306, h: 310, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448 }
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: steel })
    m.loads = buildGravityLoads(m, 4.8, 2.4)
    const d = designStructure(m, { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 })!
    const c = d.joints.flatMap((j) => j.connections)[0]
    expect(c).toBeTruthy()
    const t0 = Date.now()
    const tab = tabPlateFE(c)!
    const ms = Date.now() - t0
    expect(tab.holes).toHaveLength(c.bolts.n)
    // Σ bolt forces = the reaction Vu, downward on the tab
    expect(tab.fe.applied[1]).toBeCloseTo(-c.Vu * 1000, 3)
    expect(tab.fe.applied[1] + tab.fe.reaction[1]).toBeCloseTo(0, 3)
    expect(tab.fe.applied[0] + tab.fe.reaction[0]).toBeCloseTo(0, 3)
    // the tab cantilevers from its weld: the weld holds Vu·a, a = the bolt line
    // (moments about the weld line's foot: the bolts' Vu at a, the weld's reaction)
    const a = c.bolts.locations[0].x
    expect(tab.fe.appliedM).toBeCloseTo(-c.Vu * 1000 * a, 3)
    expect(tab.fe.reactionM / (c.Vu * 1000 * a)).toBeCloseTo(1, 9)
    // the peak is on a hole edge, where the bolts bear; clear of the holes the
    // plate works as a section and the field there is reported on its own
    const onHole = tab.holes.some((h) => Math.abs(Math.hypot(tab.fe.maxAt[0] - h.x, tab.fe.maxAt[1] - h.y) - h.d / 2) < 0.5)
    expect(onHole).toBe(true)
    expect(tab.peakAtHole).toBe(true)
    expect(tab.peakAway).toBeLessThan(tab.fe.maxVm)
    expect(ms).toBeLessThan(3000)
    console.log('tab solve', ms, 'ms', tab.fe.elems.length, 'elems; peak', tab.fe.maxVm.toFixed(0))
  })
})
