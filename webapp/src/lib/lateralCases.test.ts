/**
 * Which lateral case the viewport is showing.
 *
 * Driven through the real §208 case builder rather than hand-made fixtures, so
 * a change to how cases are named or composed surfaces here. Every case below
 * is a way the preview can mislead: a case drawn at its own scale so a 30%
 * component looks like a 100% one, a previewed earthquake drawn on top of a
 * committed wind, or a name shown as glyphs nobody can expand.
 */
import { describe, it, expect } from 'vitest'
import { computeSeismic, buildECases } from '../engine/seismic'
import { generateGridModel } from '../engine/modelBuilder'
import type { RectSection } from '../engine/model'
import type { LateralCase } from '../engine/pipeline'
import { parseCase, describeCase, caseNodePeak, caseLoads, caseBaseShear } from './lateralCases'

const section: RectSection = {
  id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
}
const model = (() => {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section })
  m.loads = m.plates.map((p) => ({ kind: 'area' as const, plate: p.id, q: 5, cat: 'D' as const }))
  return m
})()
const seis = computeSeismic(model, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!
const baseX = seis.loads
const baseZ = baseX.map((l) => ({
  kind: 'node' as const, node: (l as { node: string }).node,
  Fz: (l as { Fx?: number }).Fx, cat: 'E' as const,
}))
const dirs = ['+X', '-X', '+Z', '-Z']
const all = buildECases(model, baseX, baseZ, { dirs, orth30: true, torsion: true })

describe('the fixture is the real expansion', () => {
  it('is all sixteen cases, of which the model ever committed one', () => {
    expect(all).toHaveLength(16)
    expect(new Set(all.map((c) => c.name)).size).toBe(16)
  })
})

describe('parseCase', () => {
  it('takes apart every name the builder produces', () => {
    for (const c of all) {
      const p = parseCase(c.name)
      expect(p, c.name).not.toBeNull()
      expect(p!.kind).toBe('E')
      expect(dirs).toContain(p!.dir)
      expect(p!.orth).toMatch(/^[+−]0\.3[XZ]$/)
      expect(['⟳', '⟲']).toContain(p!.torsion)
    }
  })

  it('accepts BOTH minus signs, because the builder emits both', () => {
    // The direction carries an ASCII hyphen and the orthogonal tag a Unicode
    // MINUS SIGN — they come from different lines of `buildECases`. A parser
    // that knows only one silently fails to read half the names.
    expect(parseCase('E-X−0.3Z⟲')).toEqual(
      { kind: 'E', dir: '-X', orth: '−0.3Z', torsion: '⟲' })
    expect(parseCase('E-X-0.3Z')).toEqual(
      { kind: 'E', dir: '-X', orth: '−0.3Z', torsion: null })
  })

  it('reads the plain cases, and refuses what is not a case name', () => {
    expect(parseCase('W+Z')).toEqual({ kind: 'W', dir: '+Z', orth: null, torsion: null })
    expect(parseCase('E+X⟳')).toEqual({ kind: 'E', dir: '+X', orth: null, torsion: '⟳' })
    for (const bad of ['', 'E', 'D+X', 'E+Y', 'E+X+0.5Z', 'nonsense']) {
      expect(parseCase(bad), bad).toBeNull()
    }
  })
})

describe('describeCase', () => {
  it('spells out the glyphs and cites the clause that asks for them', () => {
    const s = describeCase('E+X−0.3Z⟲')
    expect(s).toContain('+X')
    expect(s).toContain('208.8.1')
    expect(s).toContain('anticlockwise')
    expect(s).toContain('208.7.2.7')
    expect(describeCase('E+X⟳')).toContain('clockwise')
    // No orthogonal component → no orthogonal sentence to mislead with.
    expect(describeCase('W+X')).not.toContain('208.8.1')
    expect(describeCase('W+X')).toContain('Wind')
  })

  it('falls back to the raw name rather than inventing a description', () => {
    expect(describeCase('something else')).toBe('something else')
  })
})

describe('caseNodePeak — one scale for all the cases', () => {
  it('is the largest force anywhere in the set, not in one case', () => {
    const peak = caseNodePeak(all)
    const perCase = all.map((c) => caseNodePeak([c]))
    expect(peak).toBeCloseTo(Math.max(...perCase), 9)
    expect(peak).toBeGreaterThan(0)
  })

  it('keeps a weak case looking weak beside a strong one', () => {
    // THE DEFECT THIS EXISTS FOR. `Loads3D` scales arrow length against the
    // largest force it is handed, so a case drawn ALONE always renders its own
    // peak at full length. Step from an earthquake case to a wind case that
    // way and the wind draws exactly as big as the earthquake, whatever the
    // two base shears actually are — the picture says they are the same size
    // because it re-normalised, not because they are.
    //
    // Measured on this fixture below: wind at a tenth of the seismic pattern.
    const wind: LateralCase = {
      name: 'W+X', kind: 'W',
      loads: baseX.map((l) => ({
        kind: 'node' as const, node: (l as { node: string }).node,
        Fx: ((l as { Fx?: number }).Fx ?? 0) * 0.1, cat: 'W' as const,
      })),
    }
    const shared = caseNodePeak([...all, wind])
    const alone = caseNodePeak([wind])
    expect(caseNodePeak([wind]) / shared).toBeCloseTo(0.1, 6)   // reads as a tenth
    expect(caseNodePeak([wind]) / alone).toBe(1)                // ... would read full size
  })

  it('reduces the 30% orthogonal component to 30% of the primary', () => {
    // Within one case the two components are separate node loads, so the
    // shared scale is what keeps the 100%+30% composition visible AS 100%+30%.
    const zCase = all.find((c) => c.name.startsWith('E+Z') && c.name.includes('+0.3X'))!
    const comp = (k: 'Fx' | 'Fz') => Math.max(...zCase.loads
      .filter((l) => l.kind === 'node')
      .map((l) => Math.abs((l as unknown as Record<string, number | undefined>)[k] ?? 0)))
    expect(comp('Fx') / comp('Fz')).toBeCloseTo(0.3, 6)
    expect(comp('Fz')).toBeCloseTo(caseNodePeak(all), 6)
  })

  it('survives a set with no node loads at all', () => {
    expect(caseNodePeak([])).toBe(0)
    expect(caseNodePeak([{ name: 'E+X', kind: 'E', loads: [] }])).toBe(0)
  })
})

describe('caseLoads', () => {
  const withWind: typeof model = {
    ...model,
    loads: [
      ...model.loads,
      { kind: 'node', node: model.nodes[0].id, Fx: 99, cat: 'W' },
      { kind: 'node', node: model.nodes[1].id, Fx: 77, cat: 'E' },
    ],
  }

  it('replaces the committed lateral loads with the previewed case', () => {
    const out = caseLoads(withWind, all[0])
    const node = out.filter((l) => l.kind === 'node')
    expect(node.every((l) => l.cat === 'E')).toBe(true)
    expect(node.some((l) => (l as { Fx?: number }).Fx === 77)).toBe(false)
    expect(node).toHaveLength(all[0].loads.filter((l) => l.kind === 'node').length)
  })

  it('strips WIND too when an earthquake case is previewed', () => {
    // E and W are ALTERNATIVE cases — no NSCP combination contains both — so
    // leaving the committed wind primary on screen under a previewed seismic
    // case draws a loading the structure is never checked for.
    const out = caseLoads(withWind, all[0])
    expect(out.some((l) => l.cat === 'W')).toBe(false)
  })

  it('keeps gravity, which genuinely acts at the same time', () => {
    const out = caseLoads(withWind, all[0])
    const dead = withWind.loads.filter((l) => l.cat === 'D')
    expect(out.filter((l) => l.cat === 'D')).toEqual(dead)
  })

  it('is the model untouched when nothing is previewed', () => {
    expect(caseLoads(withWind, null)).toBe(withWind.loads)
  })

  it('does not mutate the model', () => {
    const before = JSON.stringify(withWind.loads)
    caseLoads(withWind, all[5])
    expect(JSON.stringify(withWind.loads)).toBe(before)
  })
})

describe('caseBaseShear', () => {
  const V = baseX.reduce((s, l) => s + ((l as { Fx?: number }).Fx ?? 0), 0)

  it('recovers V along the primary axis and 0.3V across it', () => {
    const plain = buildECases(model, baseX, baseZ, { dirs: ['+X'] })[0]
    expect(caseBaseShear(plain).Fx).toBeCloseTo(V, 6)
    expect(caseBaseShear(plain).Fz).toBeCloseTo(0, 6)

    const orth = buildECases(model, baseX, baseZ, { dirs: ['+X'], orth30: true })
      .find((c) => c.name.includes('+0.3Z'))!
    expect(caseBaseShear(orth).Fx).toBeCloseTo(V, 6)
    expect(caseBaseShear(orth).Fz).toBeCloseTo(0.3 * V, 6)

    const neg = buildECases(model, baseX, baseZ, { dirs: ['-X'] })[0]
    expect(caseBaseShear(neg).Fx).toBeCloseTo(-V, 6)
  })

  it('is unchanged by accidental torsion, which is a COUPLE', () => {
    // §208.7.2.7 moves where the storey force acts; it does not add force. If
    // the torsion loads summed to anything, the read-out beside the preview
    // would report a different base shear for the same earthquake.
    for (const c of all) {
      const { Fx, Fz } = caseBaseShear(c)
      const p = parseCase(c.name)!
      const primary = p.dir.includes('X') ? Fx : Fz
      const cross = p.dir.includes('X') ? Fz : Fx
      expect(Math.abs(primary), c.name).toBeCloseTo(V, 6)
      expect(Math.abs(cross), c.name).toBeCloseTo(0.3 * V, 6)
    }
  })
})

describe('the page actually uses it', () => {
  // A pure module nothing calls is the quietest way for this feature to be
  // "shipped" and absent. These assert the WIRING, which no amount of unit
  // testing of the module itself can reach.
  const src = import.meta.glob('../pages/ModelSpace.tsx', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const page = Object.values(src)[0]

  it('reads ModelSpace', () => {
    expect(page.length).toBeGreaterThan(1000)
  })

  /**
   * The `<Loads3D …/>` element itself, not the whole file.
   *
   * Searching the file for `caseLoads(model, shownCase)` LOOKS like it guards
   * the wiring and does not: the swatch legend calls it too, so cutting the
   * overlay's prop back to `model.loads` left the string present and the guard
   * green. Verified by doing exactly that.
   */
  const overlay = (() => {
    const i = page.indexOf('<Loads3D')
    expect(i, 'the page must still render Loads3D').toBeGreaterThan(-1)
    return page.slice(i, page.indexOf('/>', i) + 2)
  })()

  it('hands the previewed case to the load overlay', () => {
    expect(overlay).toContain('loads={caseLoads(model, shownCase)}')
  })

  it('passes the ACROSS-CASE peak as the arrow scale', () => {
    // Without this the overlay re-normalises per case and every case draws the
    // same size — the defect `caseNodePeak` exists for.
    expect(overlay).toMatch(/nodeScale=\{lateralPeak/)
    expect(page).toContain('caseNodePeak(lateral)')
  })

  it('never writes a preview back into the model', () => {
    // `saveKeepModal` / `save` inside the preview handler would make looking at
    // a case change the case the drift check and report are based on.
    const i = page.indexOf('setPreviewCase')
    const handler = page.slice(i - 400, i + 400)
    expect(handler).not.toContain('saveKeepModal')
  })
})
