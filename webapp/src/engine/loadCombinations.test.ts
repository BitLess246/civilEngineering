import { describe, it, expect } from 'vitest'
import { calcLoadCombinations, type LoadDemands } from './loadCombinations'

// Reference: D=10, L=5, Lr=2, W=8, E=12
const BASE: LoadDemands = { D: 10, L: 5, Lr: 2, W: 8, E: 12 }

describe('calcLoadCombinations — individual combos', () => {
  const { combos } = calcLoadCombinations(BASE)
  const by = (id: string) => combos.find(c => c.id === id)!

  it('combo 1: 1.4D = 14', () => {
    expect(by('1').value).toBeCloseTo(1.4 * 10, 9)
  })

  it('combo 2: 1.2D + 1.6L + 0.5Lr = 12 + 8 + 1 = 21', () => {
    expect(by('2').value).toBeCloseTo(1.2 * 10 + 1.6 * 5 + 0.5 * 2, 9)
  })

  it('combo 3a: 1.2D + 1.6Lr + 1.0L = 12 + 3.2 + 5 = 20.2', () => {
    expect(by('3a').value).toBeCloseTo(1.2 * 10 + 1.6 * 2 + 1.0 * 5, 9)
  })

  it('combo 3b: 1.2D + 1.6Lr + 0.5W = 12 + 3.2 + 4 = 19.2', () => {
    expect(by('3b').value).toBeCloseTo(1.2 * 10 + 1.6 * 2 + 0.5 * 8, 9)
  })

  it('combo 3c: 1.2D + 1.6Lr − 0.5W = 12 + 3.2 − 4 = 11.2', () => {
    expect(by('3c').value).toBeCloseTo(1.2 * 10 + 1.6 * 2 - 0.5 * 8, 9)
  })

  it('combo 4a: 1.2D + 1.0W + 1.0L + 0.5Lr = 12 + 8 + 5 + 1 = 26', () => {
    expect(by('4a').value).toBeCloseTo(1.2 * 10 + 1.0 * 8 + 1.0 * 5 + 0.5 * 2, 9)
  })

  it('combo 4b: 1.2D − 1.0W + 1.0L + 0.5Lr = 12 − 8 + 5 + 1 = 10', () => {
    expect(by('4b').value).toBeCloseTo(1.2 * 10 - 1.0 * 8 + 1.0 * 5 + 0.5 * 2, 9)
  })

  it('combo 5a: 0.9D + 1.0W = 9 + 8 = 17', () => {
    expect(by('5a').value).toBeCloseTo(0.9 * 10 + 1.0 * 8, 9)
  })

  it('combo 5b: 0.9D − 1.0W = 9 − 8 = 1', () => {
    expect(by('5b').value).toBeCloseTo(0.9 * 10 - 1.0 * 8, 9)
  })

  it('combo 6a: 1.2D + 1.0E + 1.0L = 12 + 12 + 5 = 29', () => {
    expect(by('6a').value).toBeCloseTo(1.2 * 10 + 1.0 * 12 + 1.0 * 5, 9)
  })

  it('combo 6b: 1.2D − 1.0E + 1.0L = 12 − 12 + 5 = 5', () => {
    expect(by('6b').value).toBeCloseTo(1.2 * 10 - 1.0 * 12 + 1.0 * 5, 9)
  })

  it('combo 7a: 0.9D + 1.0E = 9 + 12 = 21', () => {
    expect(by('7a').value).toBeCloseTo(0.9 * 10 + 1.0 * 12, 9)
  })

  it('combo 7b: 0.9D − 1.0E = 9 − 12 = −3', () => {
    expect(by('7b').value).toBeCloseTo(0.9 * 10 - 1.0 * 12, 9)
  })
})

describe('calcLoadCombinations — envelope', () => {
  const r = calcLoadCombinations(BASE)

  it('13 combinations returned', () => {
    expect(r.combos).toHaveLength(13)
  })

  it('maxCombo = 6a with value 29', () => {
    expect(r.maxCombo.id).toBe('6a')
    expect(r.maxCombo.value).toBeCloseTo(29, 9)
  })

  it('minCombo = 7b with value −3', () => {
    expect(r.minCombo.id).toBe('7b')
    expect(r.minCombo.value).toBeCloseTo(-3, 9)
  })

  it('zero loads → all combos = 0', () => {
    const { combos } = calcLoadCombinations({ D: 0, L: 0, Lr: 0, W: 0, E: 0 })
    combos.forEach(c => expect(c.value).toBeCloseTo(0, 9))
  })

  it('only dead load: max = combo 1 = 1.4D', () => {
    const { maxCombo } = calcLoadCombinations({ D: 10, L: 0, Lr: 0, W: 0, E: 0 })
    expect(maxCombo.id).toBe('1')
    expect(maxCombo.value).toBeCloseTo(14, 9)
  })

  it('factors stored on each combo', () => {
    const c = r.combos.find(c => c.id === '2')!
    expect(c.fD).toBeCloseTo(1.2, 9)
    expect(c.fL).toBeCloseTo(1.6, 9)
    expect(c.fLr).toBeCloseTo(0.5, 9)
    expect(c.fW).toBeCloseTo(0, 9)
    expect(c.fE).toBeCloseTo(0, 9)
  })
})
