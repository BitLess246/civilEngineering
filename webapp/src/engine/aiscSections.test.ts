import { describe, it, expect } from 'vitest'
import { deriveWSection } from './steelDesign'
import { AISC_SHAPES, shapesOf, shapeByName, canonicalShapeName, LEGACY_SHAPE_NAMES, effectiveSection, doubleAngle, W_SORTED, nextHeavierW, nextLighterW, sectionBoundingBox, FAMILIES, torsionJ } from './aiscSections'

describe('torsionJ — St-Venant constant per family', () => {
  it('channel: thin-wall Σbt³/3, orders below the polar moment', () => {
    // C200x17.1 (d 203, bf 57.4, tf 9.91, tw 5.59):
    // J = (2·57.4·9.91³ + (203 − 19.82)·5.59³)/3 = 47 909 mm⁴ (hand calc;
    // AISC tabulates 54 100 — the fillets and flange taper the thin-wall
    // idealisation leaves out, so it errs soft in torsion)
    const c = shapeByName('C200x17.1')!
    expect(torsionJ(c)).toBeCloseTo(47908.5, 0)
    // the old polar approximation A(rx²+ry²) ≈ 15.3e6 mm⁴ — ~320× too stiff
    expect(c.A * (c.rx ** 2 + c.ry ** 2) / torsionJ(c)!).toBeGreaterThan(100)
  })

  it('angle: Σbt³/3 over the two legs', () => {
    // L51x51x6.4 (50.8, t 6.35): J = (50.8·6.35³ + (50.8 − 6.35)·6.35³)/3
    //   = 8 129.5 mm⁴ (hand calc; AISC tabulates 8 700)
    expect(torsionJ(shapeByName('L51x51x6.4')!)).toBeCloseTo(8129.52, 1)
  })

  it('rect HSS: Bredt J = 4A₀²t/p on the midline', () => {
    // HSS64x64x4.8 (63.5, design t 4.42): bm = hm = 59.08 →
    //   J = 4·(59.08²)²·4.42/(4·59.08) = 911 473 mm⁴ (AISC tabulates 937 000)
    expect(torsionJ(shapeByName('HSS64x64x4.8')!)).toBeCloseTo(911472.8, 0)
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
    expect(ang.rmin).toBeCloseTo(19.8, 3)            // rz of the single angle
    const hss = effectiveSection(shapeByName('HSS152x102x6.4')!)
    expect(hss.rmin).toBeCloseTo(40.9, 3)            // min(rx 55.9, ry 40.9)
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

  it('legacy names resolve to the shape they always meant', () => {
    // W150x22 was always W150X22.5 rounded the wrong way; W250x192 is not a
    // rolled shape at all, so the nearest real one stands in.
    expect(shapeByName('W150x22')!.name).toBe('W150x22.5')
    expect(shapeByName('W250x192')!.name).toBe('W250x167')
    expect(canonicalShapeName('W310x79')).toBe('W310x79')
    expect(canonicalShapeName('NOT-A-SHAPE')).toBe('NOT-A-SHAPE')
    for (const [old, now] of Object.entries(LEGACY_SHAPE_NAMES)) {
      expect(shapeByName(now), `${old} → ${now}`).toBeDefined()
      expect(shapesOf(shapeByName(old)!.family).some((s) => s.name === old)).toBe(false)
    }
  })
})

// The catalogue once carried W geometry from the wrong shapes — W150x13 with
// W150x18's flanges, W690x217 from a 258-wide series that is 356 wide —
// so the drawn profile held 29 % more steel than the tabulated area, and
// deriveWSection's Ix/Zx/J (computed from that geometry) overstated strength.
// These pin every row's dimensions to its own tabulated area and radii.
describe('catalogue geometry agrees with its own tabulated properties', () => {
  // Bounds measured over the whole AISC v15 transcription; fillets and the
  // channel flange taper are what separate the idealised area from A.
  const within = (r: number, lo: number, hi: number, name: string) => {
    expect(r, name).toBeGreaterThanOrEqual(lo)
    expect(r, name).toBeLessThanOrEqual(hi)
  }

  it('W: 2·bf·tf + (d − 2tf)·tw is A less the fillets', () => {
    for (const s of shapesOf('W'))
      within((2 * s.bf! * s.tf! + (s.d! - 2 * s.tf!) * s.tw!) / s.A, 0.95, 1.01, s.name)
  })

  it('WT and C: the same idealisation for the tee and the channel', () => {
    for (const s of shapesOf('WT')) within((s.bf! * s.tf! + (s.d! - s.tf!) * s.tw!) / s.A, 0.95, 1.01, s.name)
    for (const s of shapesOf('C')) within((2 * s.bf! * s.tf! + (s.d! - 2 * s.tf!) * s.tw!) / s.A, 0.95, 1.01, s.name)
  })

  it('L: (leg1 + leg2 − t)·t, leg1 the long leg', () => {
    for (const s of shapesOf('L')) {
      within(((s.leg1! + s.leg2! - s.t!) * s.t!) / s.A, 0.97, 1.02, s.name)
      expect(s.leg1!).toBeGreaterThanOrEqual(s.leg2!)
    }
  })

  it('HSS: t is the design wall 0.93·tnom (AISC 360-16 §B4.2), and corner radii take area off the sharp box', () => {
    for (const s of shapesOf('HSS')) {
      const tnom = Number(s.name.split('x').pop())
      within(s.t! / tnom, 0.91, 0.95, s.name)
      within((s.b! * s.h! - (s.b! - 2 * s.t!) * (s.h! - 2 * s.t!)) / s.A, 1.0, 1.08, s.name)
    }
    for (const s of shapesOf('PIPE'))
      within(((Math.PI / 4) * (s.D! ** 2 - (s.D! - 2 * s.t!) ** 2)) / s.A, 0.95, 1.01, s.name)
  })

  it('rx and ry follow from the drawn W profile', () => {
    for (const s of shapesOf('W')) {
      const p = deriveWSection(s)
      within(Math.sqrt(p.Ix / s.A) / s.rx, 0.97, 1.03, s.name)
    }
  })

  it('deriveWSection against the Manual (fillet-free, so a few % under and never over)', () => {
    // AISC Shapes Database v15.0, metric: Ix 10⁶ mm⁴, Zx 10³ mm³
    const table: [string, number, number][] = [
      ['W150x13', 6.2, 93.9], ['W310x79', 177, 1280], ['W360x51', 142, 895],
      ['W610x125', 986, 3670], ['W920x420', 8160, 19500], ['W360x990', 5160, 24300],
    ]
    for (const [name, Ix, Zx] of table) {
      const p = deriveWSection(shapeByName(name)!)
      within(p.Ix / (Ix * 1e6), 0.95, 1.01, name)
      within(p.Zx / (Zx * 1e3), 0.93, 1.01, name)
    }
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

  it('round-trip: nextLighterW(nextHeavierW(name)) returns to the same weight class', () => {
    // W250x67 and W410x67 tabulate the same area, so the step back lands on
    // the class, not necessarily the name
    const name = 'W250x67'
    const heavier = nextHeavierW(name)!
    const back = nextLighterW(heavier.name)!
    expect(back.A).toBe(shapeByName(name)!.A)
  })

  it('steps past shapes of equal area (W310x79 and W360x79 both 10 100 mm²)', () => {
    expect(nextHeavierW('W310x79')!.A).toBeGreaterThan(10100)
    expect(nextLighterW('W360x79')!.A).toBeLessThan(10100)
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
