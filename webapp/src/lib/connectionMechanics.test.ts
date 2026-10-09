import { describe, it, expect } from 'vitest'
import { blockShearPath, clearDistance, defaultBeamFor, defaultColumn, holeDia, maxFilletAlongEdge, minFilletSize, flangeTipSpan, columnForFlange } from './connectionMechanics'
import { boltGroupGeom, shearTabBlockShear } from '../engine/steelDesign'

// the page's default tab: 3 rows @ 70, ey 40, ex 35, ⌀20, t 10
const geom = boltGroupGeom(3, 1, 70, 70, 35, 40)
const abs = geom.bolts.map((b) => ({ x: b.x + geom.Cx, y: b.y + geom.Cy }))
const W = geom.plateW, H = geom.plateH

describe('block shear path — the areas the engine reports, as a shape', () => {
  const cases = shearTabBlockShear(3, 70, 40, 40, 35, 20, 10, 248, 400)
  for (const [k, which] of (['A', 'B'] as const).entries()) {
    it(`case ${which}: t·Lv = Agv and t·Lt = Agt, holes on the shear line`, () => {
      const p = blockShearPath(abs, W, H, which)
      expect(10 * p.Lv).toBeCloseTo(cases[k].Agv, 9)
      expect(10 * p.Lt).toBeCloseTo(cases[k].Agt, 9)
      // net: (n − ½) holes off the shear plane, ½ hole off the tension plane
      expect(cases[k].Agv - cases[k].Anv).toBeCloseTo((p.holes.length - 0.5) * holeDia(20) * 10, 9)
      expect(p.holes).toHaveLength(3)
      // the shear plane runs from the plate edge; the tension plane to the free edge
      expect(Math.min(p.shear[0].y, p.shear[1].y) === 0 || Math.max(p.shear[0].y, p.shear[1].y) === H).toBe(true)
      expect(p.tension[1].x).toBe(W)
    })
  }
})

describe('clear distance lc along the bolt force (§J3.10)', () => {
  const dh = holeDia(20)
  const down = { x: 0, y: -1 }
  it('bottom bolt bearing down: lc = ey − dh/2 to the bottom edge', () => {
    const bot = abs.find((b) => b.y === 40)!
    expect(clearDistance(bot, down, abs, W, H, dh)!.lc).toBeCloseTo(40 - dh / 2, 9)
  })
  it('a bolt above another: lc = s − dh to the next hole', () => {
    const mid = abs.find((b) => b.y === 110)!
    const r = clearDistance(mid, down, abs, W, H, dh)!
    expect(r.lc).toBeCloseTo(70 - dh, 9)
    expect(r.to.y).toBeCloseTo(40 + dh / 2, 9)
  })
  it('bearing toward the welded face is not a free edge', () => {
    const b = abs[0]
    expect(clearDistance(b, { x: -1, y: 0 }, abs, W, H, dh)).toBeNull()
    expect(clearDistance(b, { x: 1, y: 0 }, abs, W, H, dh)!.lc).toBeCloseTo(W - b.x - dh / 2, 9)
    expect(clearDistance(b, { x: 0, y: 0 }, abs, W, H, dh)).toBeNull()
  })
})

describe('drawing shapes', () => {
  it('the beam drawn takes the tab in its clear web; the column is W250-class', () => {
    const b = defaultBeamFor(H)!
    expect((b.d ?? 0) - 2 * (b.tf ?? 0) - 40).toBeGreaterThanOrEqual(H + 20)
    const c = defaultColumn()!
    expect(c.family).toBe('W')
    expect(c.bf!).toBeGreaterThanOrEqual(250)
  })
})

describe('§J2.2b fillet size along an edge', () => {
  it('is t below 6 mm and t − 2 from 6 mm up', () => {
    expect(maxFilletAlongEdge(5)).toBe(5)
    expect(maxFilletAlongEdge(6)).toBe(4)
    expect(maxFilletAlongEdge(12)).toBe(10)
  })
})

describe('Table J2.4 minimum fillet', () => {
  it('steps at 6, 13 and 19 mm of the thinner part', () => {
    expect([5, 6, 6.5, 10, 13, 14, 19, 20, 32].map(minFilletSize)).toEqual([3, 3, 5, 5, 5, 6, 6, 8, 8])
  })
})

describe('bracket welds on the flange tips', () => {
  const v = (x: number) => ({ x1: x, y1: 0, x2: x, y2: 250 })
  it('two vertical lines on two x positions imply a flange that wide', () => {
    expect(flangeTipSpan([v(0), v(200)])).toBe(200)
    expect(flangeTipSpan([v(0), v(200), { x1: 0, y1: 300, x2: 0, y2: 400 }])).toBe(200)
    expect(flangeTipSpan([v(0)])).toBeNull()
    expect(flangeTipSpan([v(0), { x1: 0, y1: 0, x2: 200, y2: 0 }])).toBeNull()
    expect(flangeTipSpan([v(0), v(100), v(200)])).toBeNull()
  })
  it('picks the W whose flange is nearest that width', () => {
    const w = columnForFlange(200)!
    expect(Math.abs(w.bf! - 200)).toBeLessThan(10)
  })
})
