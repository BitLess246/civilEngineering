import { describe, it, expect } from 'vitest'
import {
  concreteBeamMn, concreteColumnMn, scwbRatio, checkModelSCWB, SCWB_FACTOR,
} from './scwb'
import { beta1 } from './loads'
import type { StructuralModel, RectSection } from './model'
import type { StructureDesign } from './pipeline'

describe('concreteBeamMn — singly-reinforced rectangular', () => {
  it('Mn = As·fy·(d − a/2), a = As·fy/(0.85·fc·b)', () => {
    const b = 300, d = 440, As = 1200, fc = 28, fy = 415
    const a = (As * fy) / (0.85 * fc * b)
    expect(concreteBeamMn(b, d, As, fc, fy)).toBeCloseTo((As * fy * (d - a / 2)) / 1e6, 9)
  })
  it('zero/!positive steel ⇒ zero capacity', () => {
    expect(concreteBeamMn(300, 440, 0, 28, 415)).toBe(0)
    expect(concreteBeamMn(0, 440, 1200, 28, 415)).toBe(0)
  })
  it('more steel ⇒ more moment', () => {
    expect(concreteBeamMn(300, 440, 1800, 28, 415)).toBeGreaterThan(concreteBeamMn(300, 440, 1000, 28, 415))
  })
})

describe('concreteColumnMn — P–M strain-compatibility', () => {
  const b = 400, h = 400, Ast = 2500, fc = 28, fy = 415, cover = 40, db = 20

  it('positive capacity in pure bending (P = 0)', () => {
    expect(concreteColumnMn(b, h, Ast, fc, fy, 0, cover, db)).toBeGreaterThan(0)
  })

  it('axial below balanced increases the moment; high axial reduces it', () => {
    const m0 = concreteColumnMn(b, h, Ast, fc, fy, 0, cover, db)
    const mRise = concreteColumnMn(b, h, Ast, fc, fy, 1200, cover, db)
    const mFall = concreteColumnMn(b, h, Ast, fc, fy, 3800, cover, db)
    expect(mRise).toBeGreaterThan(m0)        // compression-controlled rising branch
    expect(mFall).toBeLessThan(mRise)        // past balanced, capacity drops
  })

  it('more longitudinal steel ⇒ more moment at the same axial', () => {
    const a = concreteColumnMn(b, h, 2000, fc, fy, 800, cover, db)
    const c = concreteColumnMn(b, h, 4000, fc, fy, 800, cover, db)
    expect(c).toBeGreaterThan(a)
  })

  it('recovers the rectangular-stress-block β1 dependence (smoke)', () => {
    // higher f′c (lower β1 above 28) still yields a finite, positive moment
    expect(beta1(45)).toBeLessThan(beta1(28))
    expect(concreteColumnMn(b, h, Ast, 45, fy, 1000, cover, db)).toBeGreaterThan(0)
  })
})

describe('scwbRatio — NSCP §418.7.3.2 (6/5)', () => {
  it('factor is 6/5', () => expect(SCWB_FACTOR).toBeCloseTo(1.2, 9))
  it('passes at exactly 6/5 and above', () => {
    expect(scwbRatio(120, 100).ok).toBe(true)       // 1.2
    expect(scwbRatio(150, 100).ok).toBe(true)
    expect(scwbRatio(119, 100).ok).toBe(false)
  })
  it('no beams framing in ⇒ infinite ratio, trivially satisfied', () => {
    const r = scwbRatio(100, 0)
    expect(r.ratio).toBe(Infinity); expect(r.ok).toBe(true)
  })
})

describe('checkModelSCWB — joint walk over a concrete frame', () => {
  const colSec: RectSection = { id: 'C', name: 'col', b: 500, h: 500, fc: 28, fy: 415, barDia: 25, tieDia: 10, cover: 40, material: 'concrete' }
  const beamSec: RectSection = { id: 'B', name: 'beam', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'concrete' }

  // interior joint 'j' with a column below (cA) + above (cB) and two beams (bL,bR)
  function model(): StructuralModel {
    return {
      version: 1, name: 'm',
      nodes: [
        { id: 'j', x: 0, y: 3, z: 0 }, { id: 'g', x: 0, y: 0, z: 0 }, { id: 'r', x: 0, y: 6, z: 0 },
        { id: 'l', x: -5, y: 3, z: 0 }, { id: 'rr', x: 5, y: 3, z: 0 },
      ],
      sections: [colSec, beamSec], members: [
        { id: 'cA', i: 'g', j: 'j', role: 'column', section: 'C' },
        { id: 'cB', i: 'j', j: 'r', role: 'column', section: 'C' },
        { id: 'bL', i: 'l', j: 'j', role: 'beam', section: 'B' },
        { id: 'bR', i: 'j', j: 'rr', role: 'beam', section: 'B' },
      ],
      plates: [], walls: [], supports: [], loads: [], storeys: [],
    }
  }
  // minimal design with only the fields checkModelSCWB reads
  function design(colBars: number, beamAs: number): StructureDesign {
    const col = (id: string) => ({ id, bars: colBars, Pu: 900 })
    const beam = (id: string) => ({ id, sections: [{ design: { As: beamAs, d: 450 } }] })
    return {
      columns: [col('cA'), col('cB')], beams: [beam('bL'), beam('bR')],
      steelBeams: [], steelColumns: [], basePlates: [], joints: [], slabs: [], walls: [],
      footings: [], combined: [], govName: '', cases: [], orphanEdges: 0,
      totals: { concreteMembers: 0, concreteSlabs: 0, concrete: 0, steelKg: 0 },
    } as unknown as StructureDesign
  }

  it('reports one row at the beam-column joint with ΣMnc/ΣMnb', () => {
    const rows = checkModelSCWB(model(), design(8, 1500))
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.node).toBe('j')
    expect(r.nCols).toBe(2); expect(r.nBeams).toBe(2)
    expect(r.ratio).toBeCloseTo(r.sumMnc / r.sumMnb, 9)
  })

  it('a strong column / light beam satisfies 6/5; a weak column / heavy beam fails', () => {
    const strong = checkModelSCWB(model(), design(12, 900))[0]
    const weak = checkModelSCWB(model(), design(4, 3000))[0]
    expect(strong.ratio).toBeGreaterThan(weak.ratio)
    expect(strong.ok).toBe(strong.ratio >= SCWB_FACTOR - 1e-9)
    expect(weak.ok).toBe(false)
  })

  it('ignores nodes that are not beam-column joints (a base with no beam)', () => {
    const rows = checkModelSCWB(model(), design(8, 1500))
    expect(rows.some((r) => r.node === 'g')).toBe(false)   // column base, no beams
    expect(rows.some((r) => r.node === 'l')).toBe(false)   // beam end, no column
  })
})
