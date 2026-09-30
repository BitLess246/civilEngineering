import { describe, it, expect } from 'vitest'
import { frameMaterialOptions, isOfferedFrameMaterial, modelIsMadeOf } from './frameMaterial'

describe('frame material dropdown', () => {
  it('offers reinforced concrete only while steel and timber are reworked', () => {
    expect(frameMaterialOptions('concrete').map(([m]) => m)).toEqual(['concrete'])
    expect(isOfferedFrameMaterial('steel')).toBe(false)
    expect(isOfferedFrameMaterial('wood')).toBe(false)
  })

  it('keeps an existing steel or timber model its own option, marked as being reworked', () => {
    for (const m of ['steel', 'wood'] as const) {
      const opts = frameMaterialOptions(m)
      expect(opts.map(([v]) => v)).toEqual(['concrete', m])
      expect(opts[1][1]).toMatch(/being reworked$/)
    }
  })
})

describe('modelIsMadeOf', () => {
  const sec = (id: string, material?: 'steel' | 'wood') => ({ id, name: id, b: 300, h: 300, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material })
  const mem = (id: string, section: string) => ({ id, i: 'a', j: 'b', role: 'beam' as const, section })
  it('reads the members, not a section nobody uses', () => {
    const m = { sections: [sec('A'), sec('B', 'steel')], members: [mem('m', 'A')] }
    expect(modelIsMadeOf(m, 'steel')).toBe(false)
    expect(modelIsMadeOf(m, 'concrete')).toBe(true)
    expect(modelIsMadeOf({ ...m, members: [mem('m', 'B')] }, 'steel')).toBe(true)
    expect(modelIsMadeOf(null, 'steel')).toBe(false)
  })
})
