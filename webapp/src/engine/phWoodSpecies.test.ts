import { describe, it, expect } from 'vitest'
import { PH_WOODS, PH_EMIN_RATIO } from './phWoodSpecies'
import { WOOD_SPECIES, gradesOf, speciesList, woodUnitWeight, validateWoodRef } from './woodDesign'

// NSCP 2015 Table 615.2-1 — the transcription, held against the printed page.
const row = (name: string) => PH_WOODS.find((r) => r[0] === name)!

describe('Philippine woods — NSCP 2015 Table 615.2-1', () => {
  it('carries all 45 species of the table, each at 80 / 63 / 50% stress grade', () => {
    expect(PH_WOODS).toHaveLength(45)
    expect(Object.values(WOOD_SPECIES).filter((s) => s.origin === 'NSCP')).toHaveLength(135)
    expect(gradesOf('PH-YAKAL').map((g) => g.grade)).toEqual(['80', '63', '50'])
  })

  it('matches the printed table, cell for cell, on species across all four groups', () => {
    //                  Fb=Ft  E×10³  Fc    Fc⊥   Fv
    expect(row('Yakal')[4]).toEqual([24.5, 9.78, 15.8, 6.27, 2.49])
    expect(row('Molave')[5]).toEqual([18.9, 5.15, 12.1, 5.0, 2.27])
    expect(row('Guijo')[4]).toEqual([21.8, 8.47, 13.2, 4.26, 2.40])
    expect(row('Narra')[6]).toEqual([11.2, 3.71, 7.12, 1.92, 1.20])
    expect(row('Apitong')[4]).toEqual([16.5, 7.31, 9.56, 2.20, 1.73])
    expect(row('Apitong')[5]).toEqual([13.0, 5.76, 7.53, 1.73, 1.36])
    expect(row('Lauan')[6]).toEqual([8.68, 3.64, 5.11, 1.07, 0.93])
    expect(row('Yemane')[4]).toEqual([12.6, 4.09, 7.87, 3.40, 1.96])
  })

  it('every cell is its 80% value scaled by the grade (63% ≈ 0.7875, 50% ≈ 0.625) — a transcription check', () => {
    for (const [name, , , , g80, g63, g50] of PH_WOODS)
      for (let k = 0; k < 5; k++) {
        expect(Math.abs(g63[k] / g80[k] - 0.7875), `${name} 63% [${k}]`).toBeLessThan(0.04)
        expect(Math.abs(g50[k] / g80[k] - 0.625), `${name} 50% [${k}]`).toBeLessThan(0.04)
      }
  })

  it('the four printed misprints are replaced by the value the other grades give', () => {
    expect(row('Liusin')[6][2]).toBe(9.76)        // printed "9376"
    expect(row('Malabayabas')[6][2]).toBe(9.90)   // printed "9390"
    expect(row('Yakal')[6][1]).toBe(6.11)         // printed 3.11
    expect(row('Lomarau')[6][3]).toBe(1.86)       // printed 2.86
  })

  it('Emin is §617.3.1 E(1 − 1.645·0.25)(1.03)/1.66, and Ft is the tabulated Fb', () => {
    expect(PH_EMIN_RATIO).toBeCloseTo(0.36531, 5)
    const y = WOOD_SPECIES['PH-YAKAL-80'].ref
    expect(y.E).toBeCloseTo(9780, 6)
    expect(y.Emin).toBeCloseTo(9780 * 0.36531, 0)
    expect(y.Ft).toBe(y.Fb)
  })

  it('weighs each species at its Table 619.1-1 relative density', () => {
    expect(WOOD_SPECIES['PH-YAKAL-80'].ref.G).toBe(0.76)
    expect(WOOD_SPECIES['PH-APITONG-63'].ref.G).toBe(0.57)
    expect(WOOD_SPECIES['PH-LAUAN-50'].ref.G).toBe(0.40)
    expect(woodUnitWeight(0.76)).toBeCloseTo(0.76 * 9.81, 2)
  })

  it('every entry is a valid reference set and appears in the species list as NSCP', () => {
    for (const s of Object.values(WOOD_SPECIES).filter((x) => x.origin === 'NSCP'))
      expect(validateWoodRef(s.ref), s.id).toEqual([])
    expect(speciesList().filter((s) => s.origin === 'NSCP')).toHaveLength(45)
  })
})
