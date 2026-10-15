import { describe, it, expect } from 'vitest'
import { codeLink, exampleFromQuery, codeReferenceStep } from './links'
import { DEFAULT_BEAM } from './rcBeam'
import { provisionById } from './index'

const parse = (href: string) => {
  const [path, q = ''] = href.split('?')
  return { path, q: new URLSearchParams(q) }
}

describe('code links carry the calculator\'s beam', () => {
  const beam = { b: 350, h: 600, cover: 40, stirrupDia: 10, nBars: 5, barDia: 25, fc: 28, fy: 415, fyt: 275, Mu: 260.25, Vu: 180, legs: 2, s: 150 }
  it('round-trips every field and the source', () => {
    const { path, q } = parse(codeLink('rc-beam-flexure', beam, { route: '/beam-design', label: 'Beam Design', layers: 2 }))
    expect(path).toBe('/codes/rc-beam-flexure')
    const back = exampleFromQuery(q)
    expect(back.inp).toEqual(beam)
    expect(back.carried.length).toBe(Object.keys(beam).length)
    expect(back.from).toEqual({ route: '/beam-design', label: 'Beam Design', layers: 2 })
  })
  it('a bare link is the default example with no source', () => {
    expect(codeLink('rc-beam-shear')).toBe('/codes/rc-beam-shear')
    expect(exampleFromQuery(new URLSearchParams())).toEqual({ inp: DEFAULT_BEAM, carried: [], from: undefined })
  })
  it('a field the calculator did not send keeps the default', () => {
    const back = exampleFromQuery(parse(codeLink('rc-beam-shear', { b: 400 })).q)
    expect(back.inp).toEqual({ ...DEFAULT_BEAM, b: 400 })
    expect(back.carried).toEqual(['b'])
  })
})

describe('what a link cannot do', () => {
  it('out-of-range, non-numeric and fractional-count values fall back to the default', () => {
    const q = new URLSearchParams({ b: '-5', h: 'abc', nBars: '2.5', fc: 'Infinity', Mu: '1e9', legs: '3', s: '' })
    const back = exampleFromQuery(q)
    expect(back.inp).toEqual({ ...DEFAULT_BEAM, legs: 3 })
    expect(back.carried).toEqual(['legs'])
  })
  it('a "back to" route that is not a Zeta tool is dropped — no open redirect', () => {
    for (const from of ['https://evil.example', '//evil.example', '/not-a-tool', 'javascript:alert(1)']) {
      expect(exampleFromQuery(new URLSearchParams({ from, fromLabel: 'x' })).from, from).toBeUndefined()
    }
  })
  it('the label is clipped and an implausible layer count is ignored', () => {
    const back = exampleFromQuery(new URLSearchParams({ from: '/beam-design', fromLabel: 'x'.repeat(500), layers: '40' }))
    expect(back.from!.label.length).toBe(60)
    expect(back.from!.layers).toBeUndefined()
  })
})

describe('the references step for a report', () => {
  it('lists every clause of every provision it names', () => {
    const ids = ['rc-beam-flexure', 'rc-beam-shear']
    const step = codeReferenceStep(ids)
    expect(step.lines.length).toBe(2)
    ids.forEach((id, k) => {
      const line = step.lines[k]
      const text = 'item' in line ? line.item : ''
      for (const r of Object.values(provisionById(id)!.refs)) expect(text).toContain(r.clause)
      expect(text).toContain(`/codes/${id}`)
    })
  })
  it('refuses a provision that does not exist rather than printing a dead reference', () => {
    expect(() => codeReferenceStep(['rc-beam-nope'])).toThrow(/no provision/)
  })
})
