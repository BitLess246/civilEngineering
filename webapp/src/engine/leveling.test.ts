import { describe, expect, it } from 'vitest'
import { reduceLeveling, accuracyClass, type LevelInput } from './leveling'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// Hand-worked book (Besavilla-style):
//   BM1  BS 1.50  elev 100.000 → HI 101.500
//   TP1  FS 0.90 → 100.600 (rise 0.60), BS 1.20 → HI 101.800
//   S1   IFS 2.30 → 99.500 (profile point, off HI 101.800)
//   BM2  FS 2.05 →  99.750 (fall 0.85)
// ΣBS = 2.70, ΣFS = 2.95, ΣBS−ΣFS = −0.25 = Σrise−Σfall = Δelev ✓
const BOOK: LevelInput = {
  startElev: 100,
  rows: [
    { sta: 'BM1', bs: 1.5 },
    { sta: 'TP1', bs: 1.2, fs: 0.9 },
    { sta: 'S1', ifs: [2.3] },
    { sta: 'BM2', fs: 2.05 },
  ],
}

describe('reduceLeveling — HI and rise&fall agree', () => {
  const res = reduceLeveling(BOOK)

  it('elevations follow the HI method', () => {
    const [bm1, tp1, s1, bm2] = res.points
    near(bm1.hi!, 101.5)
    near(tp1.elev, 100.6)
    near(tp1.hi!, 101.8)
    near(s1.elev, 99.5)
    near(bm2.elev, 99.75)
  })

  it('rises and falls match BS−FS per setup', () => {
    near(res.points[1].riseFall!, 0.6)
    near(res.points[3].riseFall!, -0.85)
    near(res.sumRise, 0.6)
    near(res.sumFall, 0.85)
  })

  it('page check closes: ΣBS−ΣFS = Σrise−Σfall = Δelev = −0.25', () => {
    near(res.sumBS, 2.7)
    near(res.sumFS, 2.95)
    near(res.pageCheck.bsFs, -0.25)
    near(res.pageCheck.riseFall, -0.25)
    near(res.pageCheck.delta, -0.25)
    near(res.measured, -0.25)
  })

  it('intermediate sight elevates off the running HI, not a new setup', () => {
    near(res.points[2].ifs[0], 101.8 - 2.3)
    expect(res.points[2].riseFall).toBeNull()
  })
})

describe('reduceLeveling — misclosure and adjustment', () => {
  it('distributes the error in proportion to setups elapsed', () => {
    // The hand book measures 99.750; suppose the true BM2 is 99.780 → ε = −0.030
    // over 2 setups → +0.015 per setup:
    //   TP1 (1 setup): 100.615 · S1 (1 setup): 99.515 · BM2 (2 setups): 99.780
    const res = reduceLeveling({ ...BOOK, endElev: 99.78 })
    near(res.misclosure!, -0.03)
    near(res.perSetup!, 0.015)
    near(res.points[1].adj, 100.615)
    near(res.points[2].adj, 99.515)
    near(res.points[3].adj, 99.78)
    // the starting BM never moves
    near(res.points[0].adj, 100)
  })

  it('a perfectly closed run leaves every elevation untouched', () => {
    const res = reduceLeveling({ ...BOOK, endElev: 99.75 })
    near(res.misclosure!, 0)
    for (const p of res.points) near(p.adj, p.elev)
  })

  it('rates the order of accuracy against c·√K', () => {
    // ε = 30 mm, K = 2 km → limits 5.66 / 11.31 / 16.97 mm → below third order.
    const bad = reduceLeveling({ ...BOOK, endElev: 99.78, distanceKm: 2 })
    expect(accuracyClass(bad)).toContain('below third-order')
    // ε = 3 mm, K = 2 km → 3 ≤ 5.66 → first order.
    const good = reduceLeveling({
      ...BOOK,
      rows: [
        { sta: 'BM1', bs: 1.5 },
        { sta: 'TP1', bs: 1.2, fs: 0.9 },
        { sta: 'BM2', fs: 2.053 },
      ],
      endElev: 99.747, distanceKm: 2,
    })
    expect(accuracyClass(good)).toContain('first order')
  })
})

describe('reduceLeveling — profile book with IFS-only stations', () => {
  it('carries one setup across several intermediate stations', () => {
    const res = reduceLeveling({
      startElev: 50,
      rows: [
        { sta: 'BM', bs: 2.0 },
        { sta: '0+000', ifs: [1.0] },
        { sta: '0+020', ifs: [1.5] },
        { sta: 'TP', fs: 3.0, bs: 1.0 },
        { sta: 'BM2', fs: 1.0 },
      ],
    })
    near(res.points[0].hi!, 52)
    near(res.points[1].ifs[0], 51)
    near(res.points[2].ifs[0], 50.5)
    near(res.points[3].elev, 49) // 52 − 3
    near(res.points[3].hi!, 50) // 49 + 1
    near(res.points[4].elev, 49) // 50 − 1
    expect(res.setups).toBe(2)
    near(res.sumBS, 3)
    near(res.sumFS, 4)
    near(res.measured, -1)
  })

  it('refuses a structurally broken book', () => {
    // foresight with no backsight in progress
    expect(() => reduceLeveling({ startElev: 100, rows: [{ sta: 'A' }, { sta: 'B', fs: 1 }] })).toThrow(/backsight/)
    // last row closed with a backsight
    expect(() => reduceLeveling({ startElev: 100, rows: [{ sta: 'A', bs: 1 }, { sta: 'B', bs: 2 }] })).toThrow(/foresight/)
    // single-row book
    expect(() => reduceLeveling({ startElev: 100, rows: [{ sta: 'A', bs: 1 }] })).toThrow(/two rows/)
  })
})
