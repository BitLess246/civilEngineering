import { describe, it, expect } from 'vitest'
import {
  buildBoreholeLog, hatchFor, hatchLines, wrapText, yOf, thinnestLayer,
  layerAtLogDepth, logHeight, DEFAULT_LAYOUT,
} from './logRenderer'
import { planToSvg } from '../planRenderer'
import { sampleInvestigation } from './sample'
import type { Borehole } from './model'

const bh = (): Borehole => structuredClone(sampleInvestigation()).boreholes[0]

const texts = (d: { primitives: { kind: string }[] }) =>
  d.primitives.filter((p): p is { kind: 'text'; text: string } & typeof p => p.kind === 'text')
    .map((p) => (p as unknown as { text: string }).text)

describe('depth scale', () => {
  it('maps ground depth to paper millimetres linearly below the header', () => {
    const L = DEFAULT_LAYOUT
    expect(yOf(0, L)).toBe(L.headerH)
    expect(yOf(1, L)).toBe(L.headerH + L.mmPerMetre)
    expect(yOf(10, L) - yOf(5, L)).toBeCloseTo(5 * L.mmPerMetre, 10)
  })

  it('honours an overridden scale', () => {
    const d = buildBoreholeLog(bh(), { layout: { mmPerMetre: 20 } })
    const shallow = buildBoreholeLog(bh(), { layout: { mmPerMetre: 8 } })
    expect(logHeight(d)).toBeGreaterThan(logHeight(shallow))
  })
})

describe('hatch selection', () => {
  it('reads the USCS family from the group symbol', () => {
    expect(hatchFor('GW', 'anything')).toBe('gravel')
    expect(hatchFor('SP-SM', 'anything')).toBe('sand')
    expect(hatchFor('CL', 'anything')).toBe('clay')
    expect(hatchFor('MH', 'anything')).toBe('silt')
    expect(hatchFor('OH', 'anything')).toBe('organic')
  })

  it('falls back to the description, where the NOUN governs', () => {
    // Found by looking at a rendered log, not by reading the code: my first
    // version scanned for the first matching word, so "Silty Sand" drew as
    // silt. A soil name puts the adjective first and the noun last — "Silty
    // Sand" is a sand (SM), "Sandy Clay" is a clay.
    expect(hatchFor(undefined, 'Silty Sand')).toBe('sand')
    expect(hatchFor(undefined, 'Clayey Sand')).toBe('sand')
    expect(hatchFor(undefined, 'Sandy Clay')).toBe('clay')
    expect(hatchFor(undefined, 'Gravelly Silt')).toBe('silt')
    expect(hatchFor(undefined, 'Lean Clay')).toBe('clay')
    expect(hatchFor(undefined, 'Poorly Graded Sand')).toBe('sand')
    expect(hatchFor(undefined, 'Something else')).toBe('unknown')
  })

  it('still prefers the group symbol over the description', () => {
    // The symbol is a classification; the name is prose. SM is a sand even if
    // somebody typed "clay" in the description field.
    expect(hatchFor('SM', 'Silty Sand')).toBe('sand')
    expect(hatchFor('CL', 'Sandy Clay')).toBe('clay')
  })

  it('recognises fill and rock ahead of the symbol', () => {
    // A fill logged as SM is still drawn as fill — it is a construction
    // history, not a soil type, and the log column should say so.
    expect(hatchFor('SM', 'Sand Fill')).toBe('fill')
    expect(hatchFor('GW', 'Weathered bedrock')).toBe('rock')
  })

  it('emits strokes for every hatched family and none for unknown', () => {
    for (const k of ['clay', 'silt', 'sand', 'gravel', 'organic', 'fill', 'rock'] as const) {
      expect(hatchLines(k, 0, 0, 26, 40).length, k).toBeGreaterThan(0)
    }
    expect(hatchLines('unknown', 0, 0, 26, 40)).toEqual([])
  })

  it('keeps hatching inside the band it was given', () => {
    const h = hatchLines('clay', 10, 20, 26, 30)
    for (const p of h) {
      if (p.kind === 'line') {
        expect(p.y1).toBeGreaterThanOrEqual(20)
        expect(p.y1).toBeLessThanOrEqual(50)
        expect(p.x1).toBeGreaterThanOrEqual(10)
        expect(p.x2).toBeLessThanOrEqual(36)
      }
    }
  })

  it('scales the number of strokes with the band height', () => {
    expect(hatchLines('clay', 0, 0, 26, 60).length)
      .toBeGreaterThan(hatchLines('clay', 0, 0, 26, 20).length)
  })

  it('terminates on a zero-height band instead of looping forever', () => {
    for (const k of ['clay', 'silt', 'sand', 'gravel', 'organic', 'fill', 'rock'] as const) {
      expect(hatchLines(k, 0, 0, 26, 0).length, k).toBe(0)
    }
  })
})

describe('wrapText', () => {
  it('breaks on word boundaries', () => {
    expect(wrapText('Medium dense silty fine to medium SAND', 20))
      .toEqual(['Medium dense silty', 'fine to medium SAND'])
  })

  it('leaves a word longer than the limit intact', () => {
    // Cutting "poorly-graded" mid-word makes a log harder to read, not easier.
    expect(wrapText('overconsolidated clay', 8)).toEqual(['overconsolidated', 'clay'])
  })

  it('handles empty and whitespace-only input', () => {
    expect(wrapText('', 20)).toEqual([])
    expect(wrapText('   ', 20)).toEqual([])
  })
})

describe('a real borehole log', () => {
  const d = buildBoreholeLog(bh())

  it('titles itself and reports the drawn depth', () => {
    expect(d.title).toBe('BH-01 — borehole log')
    expect(d.maxDepth).toBe(20)
  })

  it('draws one strata rectangle per layer', () => {
    const rects = d.primitives.filter((p) => p.kind === 'rect')
    expect(rects).toHaveLength(4)
  })

  it('prints every layer-top depth', () => {
    const t = texts(d)
    for (const depth of ['0.00', '1.50', '4.20', '8.50']) expect(t).toContain(depth)
    expect(t).toContain('20.00')   // base of the profile
  })

  it('prints the hole header — elevation, depth and groundwater', () => {
    const header = texts(d).find((x) => x.includes('EL'))!
    expect(header).toMatch(/EL 1450\.35 m/)
    expect(header).toMatch(/depth 20\.00 m/)
    expect(header).toMatch(/GWT 7\.80 m/)
  })

  it('draws the water table at the right depth, with its triangle', () => {
    const L = DEFAULT_LAYOUT
    const y = yOf(7.8, L)
    const line = d.primitives.find((p) => p.kind === 'line' && Math.abs((p as { y1: number }).y1 - y) < 1e-9 && (p as { stroke?: string }).stroke === '#0284c7')
    expect(line).toBeDefined()
    expect(d.primitives.some((p) => p.kind === 'path')).toBe(true)
  })

  it('says so when there is no water table rather than drawing one', () => {
    const dry = bh()
    dry.groundwaterDepth = undefined
    const dd = buildBoreholeLog(dry)
    expect(texts(dd).find((x) => x.includes('GWT'))).toMatch(/not encountered/)
    expect(dd.primitives.some((p) => p.kind === 'path')).toBe(false)
  })

  it('prints the SPT N values', () => {
    const t = texts(d)
    expect(t).toContain('8')    // 4/4 at 1.5 m
    expect(t).toContain('35')   // 16/19 at 9 m
  })

  it('marks a refusal so it cannot be read as a measurement', () => {
    const refused = bh()
    refused.spt[7].penetration = [150, 150, 60]
    const dd = buildBoreholeLog(refused)
    const t = texts(dd)
    expect(t).toContain('62*')
    expect(t.join(' ')).toMatch(/refusal — N is a lower bound/)
  })

  it('omits the SPT column for a hole with no tests', () => {
    const noSpt = bh()
    noSpt.spt = []
    const dd = buildBoreholeLog(noSpt)
    expect(texts(dd)).not.toContain('SPT N')
    expect(dd.bounds.maxX).toBeLessThan(buildBoreholeLog(bh()).bounds.maxX)
  })

  it('anchors description text inside its own layer band', () => {
    // Centring would let a thin layer's label drift into the next one.
    const L = DEFAULT_LAYOUT
    // Below the header rule — the "DESCRIPTION" column label sits above it.
    const descTexts = d.primitives.filter(
      (p) => p.kind === 'text'
        && (p as unknown as { x: number }).x === L.descX
        && (p as unknown as { y: number }).y > L.headerH,
    ) as unknown as { y: number }[]
    expect(descTexts.length).toBeGreaterThan(3)
    for (const t of descTexts) {
      const layer = bh().layers.find((l) => t.y >= yOf(l.depthTop, L) && t.y <= yOf(l.depthBottom, L) + 3.2)
      expect(layer, `text at y=${t.y} is outside every layer band`).toBeDefined()
    }
  })

  it('bounds enclose everything drawn', () => {
    const xs: number[] = []
    const ys: number[] = []
    for (const p of d.primitives) {
      if (p.kind === 'line') { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2) }
      else if (p.kind === 'rect') { xs.push(p.x, p.x + p.w); ys.push(p.y, p.y + p.h) }
      else if (p.kind === 'circle') { xs.push(p.cx); ys.push(p.cy) }
      else if (p.kind === 'text') { xs.push(p.x); ys.push(p.y) }
    }
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(d.bounds.minX)
    expect(Math.max(...ys)).toBeLessThanOrEqual(d.bounds.maxY)
  })
})

describe('it serialises through the existing plan serialiser', () => {
  it('produces valid SVG with no new painting code', () => {
    // The point of emitting PlanPrimitive: planToSvg already knows how to
    // paint every one of these.
    const svg = planToSvg(buildBoreholeLog(bh()))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('</svg>')
    expect(svg).toContain('BH-01')
    expect(svg).not.toMatch(/NaN|undefined/)
  })
})

describe('degenerate holes', () => {
  it('draws a hole with no layers without throwing', () => {
    const empty = bh()
    empty.layers = []
    empty.spt = []
    const d = buildBoreholeLog(empty)
    expect(d.primitives.length).toBeGreaterThan(0)
    expect(planToSvg(d)).not.toMatch(/NaN/)
  })

  it('reports the thinnest layer, so a caller can pick a scale that shows it', () => {
    expect(thinnestLayer(bh())).toBeCloseTo(1.5, 10)
    const none = bh(); none.layers = []
    expect(thinnestLayer(none)).toBeUndefined()
  })

  it('finds the layer at a depth, with the contact belonging to the lower layer', () => {
    expect(layerAtLogDepth(bh(), 0)!.name).toBe('Fill')
    expect(layerAtLogDepth(bh(), 1.5)!.name).toBe('Silty Sand')
    expect(layerAtLogDepth(bh(), 100)).toBeUndefined()
  })
})
