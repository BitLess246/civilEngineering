import { describe, it, expect } from 'vitest'
import {
  TABLE_204_1, TABLE_204_2,
  sdlItemKPa, sdlTotal,
  type SdlItem,
} from './deadLoads'

describe('TABLE_204_1 — NSCP 2015 component loads (kPa)', () => {
  it('contains at least one floor-finish entry', () => {
    const flooring = TABLE_204_1.filter((c) => c.group === 'Floor finish')
    expect(flooring.length).toBeGreaterThan(0)
  })

  it('ceramic tile (20 mm on 25 mm mortar) = 1.10 kPa', () => {
    const item = TABLE_204_1.find((c) => c.id === 'fin-ceramic')!
    expect(item).toBeDefined()
    expect(item.kPa).toBeCloseTo(1.10, 2)
  })

  it('partition allowance ≥ 1.0 kPa (§204.3.2 minimum)', () => {
    const part = TABLE_204_1.find((c) => c.id === 'part-allow')!
    expect(part.kPa).toBeGreaterThanOrEqual(1.0)
  })

  it('all kPa values are positive', () => {
    expect(TABLE_204_1.every((c) => c.kPa > 0)).toBe(true)
  })

  it('all entries have a non-empty id, label, and group', () => {
    for (const c of TABLE_204_1) {
      expect(c.id.length).toBeGreaterThan(0)
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.group.length).toBeGreaterThan(0)
    }
  })
})

describe('TABLE_204_2 — NSCP 2015 material unit weights (kN/m³)', () => {
  it('reinforced concrete = 23.6 kN/m³', () => {
    const rc = TABLE_204_2.find((m) => m.id === 'mat-rc')!
    expect(rc.gamma).toBeCloseTo(23.6, 2)
  })

  it('all gamma values are positive', () => {
    expect(TABLE_204_2.every((m) => m.gamma > 0)).toBe(true)
  })

  it('water ≈ 9.81 kN/m³', () => {
    const water = TABLE_204_2.find((m) => m.id === 'mat-water')!
    expect(water.gamma).toBeCloseTo(9.81, 2)
  })
})

describe('sdlItemKPa', () => {
  it('204-1 item returns its kPa directly', () => {
    const item: SdlItem = { id: 'fin-ceramic', kind: '204-1', label: 'Ceramic tile', kPa: 1.10 }
    expect(sdlItemKPa(item)).toBeCloseTo(1.10, 9)
  })

  it('204-2 item returns γ · t / 1000', () => {
    // RC topping: γ = 23.6 kN/m³, t = 50 mm → 23.6 × 0.05 = 1.18 kPa
    const item: SdlItem = { id: 'mat-rc', kind: '204-2', label: 'RC topping', gamma: 23.6, thicknessMm: 50 }
    expect(sdlItemKPa(item)).toBeCloseTo(1.18, 9)
  })

  it('204-1 item with missing kPa returns 0', () => {
    const item: SdlItem = { id: 'x', kind: '204-1', label: '?' }
    expect(sdlItemKPa(item)).toBe(0)
  })

  it('204-2 item with missing thickness returns 0', () => {
    const item: SdlItem = { id: 'mat-rc', kind: '204-2', label: 'RC', gamma: 23.6 }
    expect(sdlItemKPa(item)).toBe(0)
  })
})

describe('sdlTotal', () => {
  it('empty list → 0', () => {
    expect(sdlTotal([])).toBe(0)
  })

  it('undefined → 0', () => {
    expect(sdlTotal(undefined)).toBe(0)
  })

  it('sums all items', () => {
    const items: SdlItem[] = [
      { id: 'a', kind: '204-1', label: 'A', kPa: 1.10 },
      { id: 'b', kind: '204-1', label: 'B', kPa: 0.24 },
      { id: 'c', kind: '204-2', label: 'C', gamma: 23.6, thicknessMm: 50 },  // 1.18
    ]
    expect(sdlTotal(items)).toBeCloseTo(1.10 + 0.24 + 1.18, 9)
  })
})
