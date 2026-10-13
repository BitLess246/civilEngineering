import { describe, it, expect } from 'vitest'
import { lateralCaseCoverage, type LateralCaseLike } from './lateralCoverage'
import type { StructuralModel, ModelLoad } from './model'

// a 2×2 plan (3D) and a planar frame in X–Y
const plan3d = { nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 6, y: 0, z: 0 }, { id: 'c', x: 0, y: 0, z: 5 }, { id: 'd', x: 0, y: 3, z: 0 }] } as unknown as StructuralModel
const planar = { nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 6, y: 0, z: 0 }, { id: 'd', x: 0, y: 3, z: 0 }] } as unknown as StructuralModel
const node = (Fx: number, Fz = 0, at = 'd'): ModelLoad => ({ kind: 'node', node: at, Fx, Fz, cat: 'E' } as ModelLoad)
const cs = (name: string, Fx: number, Fz = 0, kind: 'E' | 'W' = 'E', extra: ModelLoad[] = []): LateralCaseLike => ({ name, kind, loads: [node(Fx, Fz), ...extra] })

describe('lateral-case coverage (CODE-02)', () => {
  it('the UI\'s ±X/±Z set on a 3D model is complete', () => {
    expect(lateralCaseCoverage(plan3d, [cs('E+X', 100), cs('E-X', -100), cs('E+Z', 0, 80), cs('E-Z', 0, -80)])).toEqual([])
  })

  it('a case with no opposite-sense twin is flagged, by name (§208.5.1.1)', () => {
    const r = lateralCaseCoverage(plan3d, [cs('E+X', 100), cs('E-X', -100), cs('E+Z', 0, 80)])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'E', code: 'no-reversal', cases: ['E+Z'] })
  })

  it('a 3D model loaded along one axis only is flagged; a planar frame is not', () => {
    const xOnly = [cs('E+X', 100), cs('E-X', -100)]
    expect(lateralCaseCoverage(plan3d, xOnly)).toEqual([expect.objectContaining({ code: 'one-axis', kind: 'E' })])
    expect(lateralCaseCoverage(planar, xOnly)).toEqual([])
  })

  it('judges by resultant: split loads summing to −R are a twin; accidental-torsion variants are the same axis', () => {
    // E-X carried by two nodes (−60 −40) is still the reversal of +100
    const split: LateralCaseLike = { name: 'E-X', kind: 'E', loads: [node(-60, 0, 'a'), node(-40, 0, 'b')] }
    // a torsion variant moves the point of application, not the resultant
    const tors = cs('E+X+e', 100, 0, 'E', [node(0, 10, 'a'), node(0, -10, 'b')])
    const r = lateralCaseCoverage(planar, [cs('E+X', 100), split, tors])
    expect(r.filter((i) => i.code === 'no-reversal').flatMap((i) => i.cases)).toEqual([])
  })

  it('wind is checked on its own — a complete E set does not excuse a one-sided W set', () => {
    const r = lateralCaseCoverage(planar, [cs('E+X', 100), cs('E-X', -100), cs('W+X', 30, 0, 'W')])
    expect(r).toEqual([expect.objectContaining({ kind: 'W', code: 'no-reversal', cases: ['W+X'] })])
  })

  it('no lateral cases, or zero-resultant ones, raise nothing (gravity-only design)', () => {
    expect(lateralCaseCoverage(plan3d, [])).toEqual([])
    expect(lateralCaseCoverage(plan3d, [cs('E0', 0, 0)])).toEqual([])
  })
})
