import { describe, it, expect } from 'vitest'
import { solveWeldedConnection, type WeldSegment } from './weldedConnection'

describe('solveWeldedConnection — elastic weld-line method', () => {
  it('single vertical weld, eccentric vertical load (hand check)', () => {
    // Weld (0,0)→(0,300); P = 100 kN vertical applied 100 mm to the side.
    const segs: WeldSegment[] = [{ id: 'w', x1: 0, y1: 0, x2: 0, y2: 300 }]
    const r = solveWeldedConnection({
      segments: segs, size: 6,
      load: { P: 100, angleDeg: 90, px: 100, py: 150 },
    })
    expect(r.Lw).toBe(300)
    expect(r.Cx).toBeCloseTo(0, 6)
    expect(r.Cy).toBeCloseTo(150, 6)
    expect(r.Jt).toBeCloseTo(2.25e6, 0)          // 300³/12
    expect(r.T).toBeCloseTo(10000, 6)            // Py·ex = 100·100 kN·mm
    // direct fdy = 333.33, torsional ftx = 666.67 ⇒ fr = 745.36 N/mm
    expect(r.fMax).toBeCloseTo(745.36, 1)
  })

  it('required weld size scales with the resultant and the throat', () => {
    const segs: WeldSegment[] = [{ id: 'w', x1: 0, y1: 0, x2: 0, y2: 300 }]
    const r = solveWeldedConnection({
      segments: segs, size: 6, FEXX: 480, phi: 0.75,
      load: { P: 100, angleDeg: 90, px: 100, py: 150 },
    })
    // capacity/len = 0.75·0.6·480·(0.707·6) = 916.6 N/mm
    expect(r.capacityPerLen).toBeCloseTo(0.75 * 0.6 * 480 * 0.707 * 6, 3)
    // reqSize = size·fMax/capacity  and  maxP = P·capacity/fMax are consistent
    expect(r.reqSize).toBeCloseTo((6 * r.fMax) / r.capacityPerLen, 6)
    expect(r.maxP).toBeCloseTo((100 * r.capacityPerLen) / r.fMax, 6)
  })

  it('concentric load produces pure direct shear (no torsion)', () => {
    // Symmetric two-line group; load through the centroid ⇒ T = 0.
    const segs: WeldSegment[] = [
      { id: 'l', x1: 0, y1: 0, x2: 0, y2: 200 },
      { id: 'r', x1: 100, y1: 0, x2: 100, y2: 200 },
    ]
    const r = solveWeldedConnection({
      segments: segs, size: 6,
      load: { P: 80, angleDeg: 90, px: 50, py: 100 },   // through centroid (50,100)
    })
    expect(r.Cx).toBeCloseTo(50, 6)
    expect(r.Cy).toBeCloseTo(100, 6)
    expect(r.T).toBeCloseTo(0, 6)
    // pure direct: fdy = 80·1000 / 400 = 200 N/mm at every point
    expect(r.fMax).toBeCloseTo(200, 6)
  })

  it('horizontal top-and-bottom fillet lines: J/t uses each line’s own L³/12', () => {
    // Two horizontal welds 300 long, 200 apart — bracket connection.
    const segs: WeldSegment[] = [
      { id: 't', x1: 0, y1: 200, x2: 300, y2: 200 },
      { id: 'b', x1: 0, y1: 0, x2: 300, y2: 0 },
    ]
    const r = solveWeldedConnection({
      segments: segs, size: 8,
      load: { P: 120, angleDeg: 90, px: 150 + 250, py: 100 },  // 250 mm eccentric
    })
    // centroid at (150,100); J/t = 2·[300³/12 + 300·100²] = 2·[2.25e6 + 3.0e6] = 1.05e7
    expect(r.Cx).toBeCloseTo(150, 6)
    expect(r.Cy).toBeCloseTo(100, 6)
    expect(r.Jt).toBeCloseTo(1.05e7, 0)
    expect(r.fMax).toBeGreaterThan(0)
  })

  it('flags overstress when the weld is too small', () => {
    const segs: WeldSegment[] = [{ id: 'w', x1: 0, y1: 0, x2: 0, y2: 150 }]
    const big = solveWeldedConnection({
      segments: segs, size: 3,
      load: { P: 200, angleDeg: 90, px: 200, py: 75 },
    })
    expect(big.ok).toBe(false)
    expect(big.reqSize).toBeGreaterThan(3)
  })
})
