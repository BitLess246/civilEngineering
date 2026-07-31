import { describe, it, expect } from 'vitest'
import { placeHoles, matchLayer, buildSection, sectionDrawing } from './section'
import { planToSvg } from '../planRenderer'
import type { PlanPrimitive } from '../planRenderer'
import type { Borehole, SoilLayer } from './model'

const layer = (id: string, top: number, bot: number, name: string, symbol?: string): SoilLayer =>
  ({ id, depthTop: top, depthBottom: bot, name, symbol })

const hole = (
  name: string, layers: SoilLayer[],
  over: Partial<Borehole> = {},
): Borehole => ({
  id: name, name, kind: 'borehole', actualDepth: 15,
  layers, samples: [], spt: [], ...over,
})

const texts = (d: { primitives: PlanPrimitive[] }) =>
  d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text').map((p) => p.text)

describe('placing holes along the line', () => {
  it('projects lat/long to metres about the first hole', () => {
    // 0.001° of latitude ≈ 111.3 m.
    const a = hole('BH-01', [], { latitude: 16.4, longitude: 120.6, groundElevation: 100 })
    const b = hole('BH-02', [], { latitude: 16.401, longitude: 120.6, groundElevation: 98 })
    const { holes, scaled } = placeHoles([a, b])
    expect(scaled).toBe(true)
    expect(holes[1].chainage).toBeCloseTo(111.32, 1)
  })

  it('falls back to EVEN SPACING and says the distances mean nothing', () => {
    // A section drawn to a made-up scale is worse than one drawn to none.
    const { holes, scaled, notes } = placeHoles([hole('BH-01', []), hole('BH-02', [])], 30)
    expect(scaled).toBe(false)
    expect(holes.map((h) => h.chainage)).toEqual([0, 30])
    expect(notes.join(' ')).toMatch(/Horizontal distances on it mean nothing/)
  })

  it('flags a missing ground elevation instead of drawing a false surface', () => {
    const { notes } = placeHoles([hole('BH-01', [], { groundElevation: 100 }), hole('BH-02', [])])
    expect(notes.join(' ')).toMatch(/not a real profile/)
  })

  it('orders by chainage so the section cannot fold back on itself', () => {
    const far = hole('FAR', [], { latitude: 16.41, longitude: 120.6 })
    const near = hole('NEAR', [], { latitude: 16.4, longitude: 120.6 })
    const { holes } = placeHoles([far, near])
    expect(holes.map((h) => h.borehole.name)).toEqual(['FAR', 'NEAR'])
    expect(holes[0].chainage).toBeLessThan(holes[1].chainage)
  })
})

describe('correlation is by identity, never by position', () => {
  const candidates = [
    layer('r1', 0, 2, 'Fill', 'FL'),
    layer('r2', 2, 7, 'Lean Clay', 'CL'),
    layer('r3', 7, 15, 'Poorly Graded Sand', 'SP'),
  ]

  it('matches on USCS symbol first', () => {
    const m = matchLayer(layer('l1', 0, 5, 'Something Else', 'CL'), candidates)
    expect(m.by).toBe('symbol')
    expect(m.layer!.id).toBe('r2')
  })

  it('falls back to the layer name', () => {
    const m = matchLayer(layer('l1', 0, 5, 'lean clay'), candidates)
    expect(m.by).toBe('name')
    expect(m.layer!.id).toBe('r2')
  })

  it('does NOT match the nth layer to the nth layer', () => {
    // Two holes with three layers each do not necessarily share three strata,
    // and joining them by position is how a section invents ground.
    const m = matchLayer(layer('l1', 0, 3, 'Silty Gravel', 'GM'), candidates)
    expect(m.by).toBe('none')
    expect(m.layer).toBeUndefined()
  })
})

describe('building the section', () => {
  const left = hole('BH-01', [
    layer('a1', 0, 2, 'Fill', 'FL'),
    layer('a2', 2, 8, 'Lean Clay', 'CL'),
    layer('a3', 8, 15, 'Poorly Graded Sand', 'SP'),
  ], { groundElevation: 100, latitude: 16.4, longitude: 120.6, groundwaterDepth: 3 })

  const right = hole('BH-02', [
    layer('b1', 0, 3, 'Fill', 'FL'),
    layer('b2', 3, 12, 'Lean Clay', 'CL'),
    layer('b3', 12, 15, 'Poorly Graded Sand', 'SP'),
  ], { groundElevation: 98, latitude: 16.401, longitude: 120.6 })

  it('joins every matched layer between the two holes', () => {
    const s = buildSection([left, right])
    expect(s.bands).toHaveLength(3)
    expect(s.bands.every((b) => b.correlation === 'symbol')).toBe(true)
    expect(s.bands.every((b) => !b.pinchesOut)).toBe(true)
  })

  it('carries the ELEVATIONS through, so a dipping stratum dips', () => {
    const s = buildSection([left, right])
    const clay = s.bands.find((b) => b.layer.symbol === 'CL')!
    expect(clay.topLeft).toBeCloseTo(98, 6)     // 100 − 2
    expect(clay.topRight).toBeCloseTo(95, 6)    // 98 − 3
    expect(clay.baseLeft).toBeCloseTo(92, 6)    // 100 − 8
    expect(clay.baseRight).toBeCloseTo(86, 6)   // 98 − 12
    expect(clay.topRight).toBeLessThan(clay.topLeft)
  })

  it('PINCHES OUT a layer the next hole does not have, and says the midpoint is a convention', () => {
    // "The peat continues" and "no peat was found in BH-02" are different
    // statements, and only one of them is supported.
    const withPeat = hole('BH-01', [
      layer('a1', 0, 2, 'Fill', 'FL'),
      layer('a2', 2, 4, 'Peat', 'PT'),
    ], { groundElevation: 100 })
    const s = buildSection([withPeat, hole('BH-02', [layer('b1', 0, 2, 'Fill', 'FL')], { groundElevation: 100 })])
    const peat = s.bands.find((b) => b.layer.symbol === 'PT')!
    expect(peat.pinchesOut).toBe(true)
    expect(peat.toChainage).toBeLessThan(s.holes[1].chainage)
    expect(peat.topRight).toBeCloseTo(peat.baseRight, 9)   // closes to a point
    expect(s.notes.join(' ')).toMatch(/wedging to a point at the midpoint/)
    expect(s.notes.join(' ')).toMatch(/a drafting convention, not a finding/)
  })

  it('WEDGES IN a layer only the right-hand hole has', () => {
    // The mirror of pinching out. Without it the section leaves a white void
    // where a stratum first appears, which reads as "nothing here" rather than
    // "this is where it comes in" — found by rendering a real section.
    const a = hole('BH-01', [layer('a1', 0, 10, 'Lean Clay', 'CL')], { groundElevation: 100 })
    const b = hole('BH-02', [
      layer('b1', 0, 4, 'Lean Clay', 'CL'),
      layer('b2', 4, 6, 'Peat', 'PT'),
      layer('b3', 6, 10, 'Lean Clay 2', 'CL2'),
    ], { groundElevation: 100 })
    const s = buildSection([a, b])
    const peat = s.bands.find((x) => x.layer.symbol === 'PT')!
    expect(peat).toBeDefined()
    expect(peat.pinchesOut).toBe(true)
    expect(peat.fromChainage).toBeGreaterThan(s.holes[0].chainage)   // starts mid-span
    expect(peat.toChainage).toBe(s.holes[1].chainage)
    expect(peat.topLeft).toBeCloseTo(peat.baseLeft, 9)               // closed at the left
    expect(peat.topRight).not.toBeCloseTo(peat.baseRight, 6)         // open at the hole
  })

  it('warns when a correlation rests on a NAME rather than a symbol', () => {
    const a = hole('BH-01', [layer('a1', 0, 5, 'Lean Clay')], { groundElevation: 100 })
    const b = hole('BH-02', [layer('b1', 0, 6, 'lean clay')], { groundElevation: 100 })
    const s = buildSection([a, b])
    expect(s.bands[0].correlation).toBe('name')
    expect(s.notes.join(' ')).toMatch(/on layer NAME rather than USCS symbol/)
  })

  it('says a single hole has nothing to correlate', () => {
    const s = buildSection([left])
    expect(s.bands).toEqual([])
    expect(s.notes.join(' ')).toMatch(/needs at least two holes/)
  })

  it('survives an empty set', () => {
    const s = buildSection([])
    expect(s.holes).toEqual([])
    expect(s.bands).toEqual([])
  })
})

describe('the drawing separates measured from inferred', () => {
  const left = hole('BH-01', [
    layer('a1', 0, 2, 'Fill', 'FL'),
    layer('a2', 2, 8, 'Lean Clay', 'CL'),
  ], { groundElevation: 100, latitude: 16.4, longitude: 120.6, groundwaterDepth: 3 })
  const right = hole('BH-02', [
    layer('b1', 0, 3, 'Fill', 'FL'),
    layer('b2', 3, 12, 'Lean Clay', 'CL'),
  ], { groundElevation: 98, latitude: 16.401, longitude: 120.6 })
  const d = sectionDrawing(buildSection([left, right]))

  it('draws every INTERPOLATED boundary dashed', () => {
    // The distinction the drawing exists to make: solid where a hole proves a
    // boundary, dashed everywhere the section is guessing.
    const inferred = d.primitives.filter(
      (p) => p.kind === 'line' && p.dash != null && (p.stroke === '#64748b' || p.stroke === '#b45309'),
    )
    expect(inferred.length).toBe(4)     // two boundaries × two layers
  })

  it('draws the hole traces SOLID, as the only hard data on the sheet', () => {
    const traces = d.primitives.filter(
      (p) => p.kind === 'line' && p.dash == null && p.stroke === '#0f172a' && p.width === 0.9,
    )
    expect(traces).toHaveLength(2)
  })

  it('says on the drawing itself what solid and dashed mean', () => {
    expect(texts(d).join(' ')).toMatch(/solid = logged in a hole · dashed = inferred between holes/)
  })

  it('labels the holes and their chainages', () => {
    const t = texts(d)
    expect(t).toContain('BH-01')
    expect(t).toContain('BH-02')
    expect(t.some((x) => /\d+ m/.test(x))).toBe(true)
  })

  it('marks the water table where a hole recorded one', () => {
    const wt = d.primitives.filter((p) => p.kind === 'line' && p.stroke === '#0ea5e9')
    expect(wt).toHaveLength(1)          // only BH-01 has a level
  })

  it('SHOUTS when the holes are at even spacing rather than to scale', () => {
    const unscaled = sectionDrawing(buildSection([
      hole('BH-01', [layer('a', 0, 5, 'Fill', 'FL')], { groundElevation: 100 }),
      hole('BH-02', [layer('b', 0, 5, 'Fill', 'FL')], { groundElevation: 100 }),
    ]))
    expect(texts(unscaled).join(' ')).toMatch(/EVEN SPACING — not to scale/)
  })

  it('serialises cleanly', () => {
    const svg = planToSvg(d)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('survives a section with no holes at all', () => {
    expect(planToSvg(sectionDrawing(buildSection([])))).not.toMatch(/NaN/)
  })
})
