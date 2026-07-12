import { describe, it, expect } from 'vitest'
import { AISC_SHAPES, shapesOf, shapeByName, effectiveSection, doubleAngle, W_SORTED, nextHeavierW, nextLighterW, sectionBoundingBox, FAMILIES, torsionJ } from './aiscSections'

describe('torsionJ — St-Venant constant per family', () => {
  it('channel: thin-wall Σbt³/3, orders below the polar moment', () => {
    // C200x17.1 (d 203, bf 57.4, tf 9.9, tw 5.6):
    // J = (2·57.4·9.9³ + (203 − 19.8)·5.6³)/3 = 47 854 mm⁴ (hand calc)
    const c = shapeByName('C200x17.1')!
    expect(torsionJ(c)).toBeCloseTo(47854.4, 0)
    // the old polar approximation A(rx²+ry²) ≈ 15.3e6 mm⁴ — ~320× too stiff
    expect(c.A * (c.rx ** 2 + c.ry ** 2) / torsionJ(c)!).toBeGreaterThan(100)
  })

  it('angle: Σbt³/3 over the two legs', () => {
    // L51x51x6.4: J = (51·6.4³ + (51 − 6.4)·6.4³)/3 = 8 353.7 mm⁴ (hand calc)
    expect(torsionJ(shapeByName('L51x51x6.4')!)).toBeCloseTo(8353.66, 1)
  })

  it('rect HSS: Bredt J = 4A₀²t/p on the midline', () => {
    // HSS64x64x4.8: bm = hm = 59.2 → J = 4·(59.2²)²·4.8/(4·59.2) = 995 878 mm⁴
    expect(torsionJ(shapeByName('HSS64x64x4.8')!)).toBeCloseTo(995878.5, 0)
  })

  it('round pipe: exact polar (π/32)(D⁴ − Di⁴)', () => {
    const p = shapesOf('PIPE')[0]
    const Di = p.D! - 2 * p.t!
    expect(torsionJ(p)).toBeCloseTo((Math.PI / 32) * (p.D! ** 4 - Di ** 4), 3)
  })

  it('W/WT return undefined (deriveWSection owns their J)', () => {
    expect(torsionJ(shapeByName('W310x79')!)).toBeUndefined()
  })
})

describe('AISC section library', () => {
  it('every shape has area + radii and a unique name', () => {
    const names = new Set<string>()
    for (const s of AISC_SHAPES) {
      expect(s.A).toBeGreaterThan(0)
      expect(s.rx).toBeGreaterThan(0)
      expect(s.ry).toBeGreaterThan(0)
      expect(names.has(s.name)).toBe(false)
      names.add(s.name)
    }
    expect(shapesOf('L').length).toBeGreaterThan(0)
    expect(shapesOf('HSS').every((s) => s.family === 'HSS')).toBe(true)
  })

  it('single section r_min governs (angle uses rz; tube uses min rx/ry)', () => {
    const ang = effectiveSection(shapeByName('L102x102x9.5')!, false)
    expect(ang.A).toBe(1850)
    expect(ang.rmin).toBeCloseTo(20.1, 3)            // rz of the single angle
    const hss = effectiveSection(shapeByName('HSS152x102x6.4')!)
    expect(hss.rmin).toBeCloseTo(38.0, 3)            // min(rx 53, ry 38)
  })

  it('double angle doubles the area and increases ry across the gap', () => {
    const L = shapeByName('L102x102x9.5')!
    const d = doubleAngle(L, 10)
    expect(d.double).toBe(true)
    expect(d.A).toBeCloseTo(2 * L.A, 6)
    expect(d.rx).toBeCloseTo(L.rx, 6)                // unchanged about the geometric x
    expect(d.ry).toBeGreaterThan(L.ry)              // parallel-axis shift across the gap
    expect(d.rmin).toBeCloseTo(Math.min(d.rx, d.ry), 6)
    // wider gap → larger ry
    expect(doubleAngle(L, 20).ry).toBeGreaterThan(d.ry)
  })

  it('effectiveSection only doubles angle families', () => {
    const w = effectiveSection(shapeByName('W250x32.7')!, true)   // double flag ignored for W
    expect(w.double).toBe(false)
    expect(w.A).toBe(4190)
  })

  it('computed nominal tubes match the sharp-corner geometry formulas', () => {
    // square HSS127x127x9.5: A = b² − (b−2t)²
    const sq = shapeByName('HSS127x127x9.5')!
    const bi = 127 - 2 * 9.5
    expect(sq.A).toBe(Math.round(127 * 127 - bi * bi))
    expect(sq.rx).toBeCloseTo(sq.ry!, 6)                 // square → rx = ry
    // rectangular HSS254x152x9.5: deeper section is stiffer about x (rx > ry)
    const rect = shapeByName('HSS254x152x9.5')!
    expect(rect.h).toBe(254); expect(rect.b).toBe(152)
    expect(rect.rx).toBeGreaterThan(rect.ry!)
    // round pipe: A = π/4·(D² − (D−2t)²)
    const p = shapeByName('PIPE 8 STD')!
    const Di = 219.1 - 2 * 8.2
    expect(p.A).toBe(Math.round((Math.PI / 4) * (219.1 ** 2 - Di ** 2)))
    expect(p.rx).toBeCloseTo(Math.sqrt(219.1 ** 2 + Di ** 2) / 4, 1)
  })
})

describe('W-shape optimizer helpers', () => {
  it('W_SORTED covers all W-shapes, sorted ascending by area', () => {
    expect(W_SORTED.length).toBe(shapesOf('W').length)
    expect(W_SORTED.every((s) => s.family === 'W')).toBe(true)
    for (let i = 1; i < W_SORTED.length; i++) expect(W_SORTED[i].A).toBeGreaterThanOrEqual(W_SORTED[i - 1].A)
  })

  it('nextHeavierW returns a shape with strictly larger area', () => {
    const s = shapeByName('W310x79')!
    const next = nextHeavierW('W310x79')!
    expect(next).toBeDefined()
    expect(next.A).toBeGreaterThan(s.A)
  })

  it('nextLighterW returns a shape with strictly smaller area', () => {
    const s = shapeByName('W310x79')!
    const prev = nextLighterW('W310x79')!
    expect(prev).toBeDefined()
    expect(prev.A).toBeLessThan(s.A)
  })

  it('nextHeavierW on the heaviest shape returns undefined', () => {
    const heaviest = W_SORTED[W_SORTED.length - 1]
    expect(nextHeavierW(heaviest.name)).toBeUndefined()
  })

  it('nextLighterW on the lightest shape returns undefined', () => {
    const lightest = W_SORTED[0]
    expect(nextLighterW(lightest.name)).toBeUndefined()
  })

  it('round-trip: nextLighterW(nextHeavierW(name)) = original shape', () => {
    const name = 'W250x67'
    const heavier = nextHeavierW(name)!
    const back = nextLighterW(heavier.name)!
    expect(back.name).toBe(name)
  })

  describe('sectionBoundingBox — positive box for every family', () => {
    it('returns a finite positive b×h for one shape of every family', () => {
      for (const { id } of FAMILIES) {
        const s = shapesOf(id)[0]
        expect(s, `no shapes for family ${id}`).toBeTruthy()
        const box = sectionBoundingBox(s)
        expect(box.b).toBeGreaterThan(0)
        expect(box.h).toBeGreaterThan(0)
        expect(Number.isFinite(box.b) && Number.isFinite(box.h)).toBe(true)
      }
    })

    it('uses bf×d for W, b×h for HSS, D×D for pipe, legs for angles', () => {
      const w = shapeByName('W310x79')!
      expect(sectionBoundingBox(w)).toEqual({ b: w.bf!, h: w.d! })
      const hss = shapesOf('HSS')[0]
      expect(sectionBoundingBox(hss)).toEqual({ b: hss.b!, h: hss.h! })
      const pipe = shapesOf('PIPE')[0]
      expect(sectionBoundingBox(pipe)).toEqual({ b: pipe.D!, h: pipe.D! })
      const ang = shapesOf('L')[0]
      const box = sectionBoundingBox(ang)
      expect(box.h).toBeGreaterThanOrEqual(box.b)   // longer leg is the depth
    })
  })
})
