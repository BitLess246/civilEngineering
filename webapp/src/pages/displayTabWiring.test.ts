// The Display tab and the options around it, pinned in source — `/model`
// sits behind auth, so the page is driven in a browser for the PR, and the
// wiring that must not regress is held here.
import { describe, it, expect } from 'vitest'
import page from './ModelSpace.tsx?raw'

const tab = (name: string) => {
  const at = page.indexOf(`{tab === '${name}' && (`)
  expect(at, name).toBeGreaterThan(-1)
  const next = page.indexOf('{tab === \'', at + 10)
  return page.slice(at, next < 0 ? undefined : next)
}

describe('Display tab — one contour at a time', () => {
  const display = tab('display')

  it('chooses the contour with a radio group, not three checkboxes', () => {
    expect(display).toMatch(/type="radio" name="contour"/)
    expect(display).toMatch(/CONTOUR_OPTIONS\.map/)
    for (const old of ['Show deformed shape', 'Show plate stresses', 'Show beam / column stresses'])
      expect(display).not.toContain(old)
    expect(page).not.toMatch(/setShowDeformed|setShowStress|setShowMemStress/)
  })

  it('every contour follows the Load case selector, as the selector says it does', () => {
    const memo = (name: string) => page.slice(page.indexOf(`const ${name} = useMemo(`), page.indexOf('\n  }, [', page.indexOf(`const ${name} = useMemo(`)))
    expect(memo('memStressInfo')).toContain('dispRes.members')
    expect(memo('memStressInfo')).not.toContain('govRes')
    expect(memo('deformInfo')).toContain('deformedInputs(model, dispRes.d, dispRes.members, br)')
    expect(display).toContain('Drives the contour, the deformed shape and the force diagrams together.')
  })

  it('the plate contour recovers its own stresses — no trip to the Analysis tab first', () => {
    expect(page).toMatch(/if \(!\(shellOn \|\| showStress\) \|\| !model/)
  })
})

describe('design-only switches live in the Design tab', () => {
  const analysis = tab('analysis'), design = tab('design')
  it('bar layout, bar-size search and the design mesh are Design options, not Analysis ones', () => {
    for (const re of [/checked=\{allAround\}/, /checked=\{tryBars\}/, /checked=\{designShells\}/]) {
      expect(analysis, String(re)).not.toMatch(re)
      expect(design, String(re)).toMatch(re)
    }
    // …with the tributary-load caveat that describes the DESIGN beside them
    expect(design).toContain('The design takes slab loads to the beams by 45° tributary area')
    expect(analysis).not.toContain('45° tributary area')
  })
})
