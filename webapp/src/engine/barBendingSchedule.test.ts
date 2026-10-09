import { describe, it, expect } from 'vitest'
import { bbsShape, bendingSchedule, scheduleTypes, scheduleWeight, shapeKey, typeLabel } from './barBendingSchedule'
import { buildBeamCage, type BeamCageInput } from './beamCage'
import { cutLength, kgPerM, runWeight, type RebarRun, type Vec3 } from './rebarModel'

const run = (path: Vec3[], o: Partial<RebarRun> = {}): RebarRun => ({
  mark: 'X1', dia: 16, role: 'top', member: 'B1', path, count: 3,
  bendDia: path.length > 2 ? Array(path.length - 2).fill(96) : [], ...o,
})

describe('bbsShape — a run laid flat and classified', () => {
  it('a straight bar is type A, one leg, its own length', () => {
    const s = bbsShape(run([[0, 3, 0], [6, 3, 0]]))
    expect(s.code).toBe('A')
    expect(s.legs).toHaveLength(1)
    expect(s.legs[0]).toBeCloseTo(6000, 9)
    expect(s.pts[1][0]).toBeCloseTo(6000, 9)
  })

  it('a bar hooked at one end is an L (B): 300 + 5000', () => {
    const s = bbsShape(run([[0, 2.7, 0], [0, 3, 0], [5, 3, 0]]))
    expect(s.code).toBe('B')
    expect(s.legs.map(Math.round)).toEqual([300, 5000])
    expect(s.turns).toHaveLength(1)
    expect(s.turns[0]).toBeCloseTo(90, 9)
  })

  it('lays the LONGEST leg along x, so a hooked bar reads main leg across, hook up or down', () => {
    const s = bbsShape(run([[0, 2.7, 0], [0, 3, 0], [5, 3, 0]]))      // modelled hook-first
    const [a, b] = [s.pts[1], s.pts[2]]
    expect(Math.abs(b[1] - a[1])).toBeLessThan(1e-9)                    // main leg horizontal
    expect(Math.abs(b[0] - a[0])).toBeCloseTo(5000, 9)
    expect(Math.abs(s.pts[1][0] - s.pts[0][0])).toBeLessThan(1e-9)      // the hook vertical
  })

  it('hooked at both ends the SAME way is a U (C); opposite ways is a crank (D)', () => {
    const u = bbsShape(run([[0, 2.7, 0], [0, 3, 0], [6, 3, 0], [6, 2.7, 0]]))
    expect(u.code).toBe('C')
    const z = bbsShape(run([[0, 2.7, 0], [0, 3, 0], [6, 3, 0], [6, 3.3, 0]]))
    expect(z.code).toBe('D')
  })

  it('a stirrup is closed (E), four legs round its perimeter', () => {
    const s = bbsShape(run([[0, 0, 0], [0, 0.45, 0], [0, 0.45, 0.2], [0, 0, 0.2]], { closed: true, bendDia: [48, 48, 48, 48], role: 'stirrup' }))
    expect(s.code).toBe('E')
    expect(s.legs.map(Math.round)).toEqual([450, 200, 450, 200])
  })

  it('lays a bar in an arbitrary plane flat — the legs do not depend on where it sits', () => {
    const a = bbsShape(run([[0, 2.7, 0], [0, 3, 0], [5, 3, 0]]))
    // the same L along z at another level
    const b = bbsShape(run([[4, 9.7, 1], [4, 10, 1], [4, 10, 6]]))
    expect(b.legs.map(Math.round)).toEqual(a.legs.map(Math.round))
    expect(b.code).toBe('B')
  })
})

describe('the schedule reads the cage — nothing recomputed', () => {
  const beam: BeamCageInput = {
    mark: 'B1', L: 6, colBLeft: 400, colBRight: 400,
    b: 300, h: 550, cover: 40, barDia: 20, stirrupDia: 12,
    topBars: 6, botBars: 6, sEnd: 100, sMid: 200,
    continuousLeft: false, continuousRight: false,
    axis: { x0: 0, z0: 0, x1: 6, z1: 0 }, ySoffit: 3,
  }
  const cage = buildBeamCage(beam)
  const rows = bendingSchedule([cage])

  it('one row per run, cut length = cutLength, weight = runWeight', () => {
    expect(rows).toHaveLength(cage.runs.length)
    for (const [i, r] of cage.runs.entries()) {
      expect(rows[i].cutMm).toBeCloseTo(cutLength(r), 9)
      expect(rows[i].kg).toBeCloseTo(runWeight(r), 9)
      expect(rows[i].kgPerM).toBeCloseTo(kgPerM(r.dia), 12)
    }
    // ⌀20: π/4·0.02²·7850 = 2.466 kg/m — the BBS unit weight
    expect(kgPerM(20)).toBeCloseTo(2.466, 3)
  })

  it('the schedule total is the cage total — types merge, weight is conserved', () => {
    const types = scheduleTypes(rows)
    const cageKg = cage.runs.reduce((s, r) => s + runWeight(r), 0)
    expect(scheduleWeight(rows)).toBeCloseTo(cageKg, 6)
    expect(scheduleWeight(types)).toBeCloseTo(cageKg, 6)
    expect(types.reduce((s, t) => s + t.count, 0)).toBe(rows.reduce((s, r) => s + r.count, 0))
    expect(types.length).toBeLessThanOrEqual(rows.length)
  })

  it('end-support through bars are hooked (not straight) and stirrups are closed', () => {
    const t1 = rows.find((r) => r.mark === 'B1-T1')!
    expect(['C', 'D']).toContain(t1.shape.code)
    expect(rows.filter((r) => r.role === 'stirrup').every((r) => r.shape.code === 'E')).toBe(true)
  })
})

describe('schedule types', () => {
  it('merge identical bars across members, read from either end', () => {
    const a = run([[0, 2.7, 0], [0, 3, 0], [5, 3, 0]], { member: 'B1', mark: 'B1-T1', count: 2 })
    const b = run([[5, 3, 0], [0, 3, 0], [0, 2.7, 0]], { member: 'B2', mark: 'B2-T1', count: 4 })
    const types = scheduleTypes(bendingSchedule([{ member: 'B1', runs: [a] }, { member: 'B2', runs: [b] }]))
    expect(types).toHaveLength(1)
    expect(types[0].count).toBe(6)
    expect(types[0].members).toEqual(['B1', 'B2'])
    expect(shapeKey({ dia: 16, role: 'top', shape: bbsShape(a) })).toBe(shapeKey({ dia: 16, role: 'top', shape: bbsShape(b) }))
  })

  it('order heavy stock first, longest first, and label A…Z, AA…', () => {
    const rows = bendingSchedule([{ member: 'M', runs: [
      run([[0, 0, 0], [3, 0, 0]], { dia: 12, mark: 'a' }),
      run([[0, 0, 0], [5, 0, 0]], { dia: 20, mark: 'b' }),
      run([[0, 0, 0], [6, 0, 0]], { dia: 20, mark: 'c' }),
    ] }])
    const t = scheduleTypes(rows)
    expect(t.map((x) => x.marks[0])).toEqual(['c', 'b', 'a'])
    expect(t.map((x) => x.type)).toEqual(['A', 'B', 'C'])
    expect(typeLabel(25)).toBe('Z')
    expect(typeLabel(26)).toBe('AA')
    expect(typeLabel(27)).toBe('AB')
  })
})
