import { describe, it, expect } from 'vitest'
import { frameMaterialOptions, isOfferedFrameMaterial, modelIsMadeOf, switchFrameDefaults, switchWoodDefault, FRAME_FORM_DEFAULTS, DEFAULT_PH_WOOD } from './frameMaterial'
import { isStockSawn, TIMBER_FLOOR_SDL } from '../engine/timberStock'
import { WOOD_SPECIES } from '../engine/woodDesign'

describe('frame material dropdown', () => {
  it('offers concrete, steel and timber again', () => {
    expect(frameMaterialOptions('concrete').map(([m]) => m)).toEqual(['concrete', 'steel', 'wood'])
    for (const m of ['concrete', 'steel', 'wood'] as const) expect(isOfferedFrameMaterial(m)).toBe(true)
    expect(frameMaterialOptions('wood').every(([, l]) => !/being reworked/.test(l))).toBe(true)
  })
})

describe('switching material — the form follows, the user’s values stay', () => {
  const rc = FRAME_FORM_DEFAULTS.concrete, wd = FRAME_FORM_DEFAULTS.wood
  it('an untouched RC form becomes the timber defaults: stocked sizes, light SDL', () => {
    const d = switchFrameDefaults('concrete', 'wood', rc)
    expect(d).toEqual(wd)
    for (const k of ['col', 'gir', 'bea'] as const) expect(isStockSawn(d[k][0], d[k][1])).toBe(true)
    expect(d.qD).toBe(TIMBER_FLOOR_SDL)
  })
  it('and back again', () => {
    expect(switchFrameDefaults('wood', 'concrete', wd)).toEqual(rc)
    expect(switchFrameDefaults('wood', 'steel', wd)).toEqual(rc)        // steel's slabs are RC
  })
  it('keeps every value the user changed', () => {
    const mine = { ...rc, col: [500, 500] as const, qD: 3.0 }
    const d = switchFrameDefaults('concrete', 'wood', mine)
    expect(d.col).toEqual([500, 500])
    expect(d.qD).toBe(3.0)
    expect(d.gir).toEqual(wd.gir)                                        // untouched, so it moves
  })
  it('steel ↔ concrete changes nothing', () => {
    expect(switchFrameDefaults('concrete', 'steel', rc)).toEqual(rc)
  })
  it('starts timber on PH Apitong 80% unless a species was picked', () => {
    expect(switchWoodDefault('DFL', '2')).toEqual(DEFAULT_PH_WOOD)
    expect(WOOD_SPECIES[`${DEFAULT_PH_WOOD.species}-${DEFAULT_PH_WOOD.grade}`]?.origin).toBe('NSCP')
    expect(switchWoodDefault('PH-YAKAL', '63')).toEqual({ species: 'PH-YAKAL', grade: '63' })
    expect(switchWoodDefault('DFL', 'SS')).toEqual({ species: 'DFL', grade: 'SS' })
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
