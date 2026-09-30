import { describe, it, expect } from 'vitest'
import { runModelAnalysis, type ModelAnalysisReq } from './modelAnalysis'
import { generateGridModel } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { analyzeFrame3D, solveFrame3D, applyF3Combo } from './frame3d'
import { stitchAnalysis } from './memberSplit'
import { driftCheck } from './seismic'
import type { RectSection, StructuralModel } from './model'

const section: RectSection = { id: 'C', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

/** 2×2 bays, 3 storeys, slab dead load, and a lateral E push concentrated on
 *  one edge — so the floors twist, and a rigid diaphragm changes the answer. */
function frame(diaphragm: boolean): StructuralModel {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5, 5], storeyH: [4, 3.5, 3.5], section, slabThickness: 150 })
  for (const p of m.plates) m.loads.push({ kind: 'area', plate: p.id, q: 5, cat: 'D' })
  for (const n of m.nodes) if (n.y > 1e-6) m.loads.push({ kind: 'node', node: n.id, Fx: n.z < 1e-6 ? 40 : 5, cat: 'E' })
  m.diaphragm = diaphragm
  return m
}

const req = (model: StructuralModel): ModelAnalysisReq => ({
  model, opts: { f1: 0.5 }, drift: { hasSeis: true, T: 0.5, R: 8.5, axis: 'x', pDelta: false, Z: 0.4 },
})

describe('runModelAnalysis — the drift check solves the structure the combos solved', () => {
  it('without a diaphragm, every result is what the separate solves gave', () => {
    // the pre-refactor recipe: analyzeFrame3D for the sweep, a fresh
    // solveFrame3D (its own assembly and factorization) for the E-case
    const m = frame(false)
    const out = runModelAnalysis(req(m))
    const br = modelToFrame3D(m, {})
    const legacy = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, { f1: 0.5 }, undefined, br.diaphragmGroups, br.shells)!
    expect(out.analysis).toEqual(stitchAnalysis(legacy, br.memberSplits))
    const e = solveFrame3D(br.nodes, br.members, br.supports, applyF3Combo(br.loads, { E: 1 }), { pDelta: false }, br.shells)!
    expect(out.eCase!.d).toEqual(e.d)
    expect(out.drift).toEqual(driftCheck(m, br.nodes, e.d, 8.5, 0.5, 'x'))
    expect(out.drift!.length).toBe(3)
  })

  it('with a rigid diaphragm, the drift E-case is the E the combos carry', () => {
    // Superposition on ONE structure: d(0.9D + 1.0E) − (0.9/1.4)·d(1.4D) = d(E).
    // The drift solve used to skip the diaphragm groups, so it read a
    // different structure — checked below to be a real difference here.
    const m = frame(true)
    const out = runModelAnalysis(req(m))
    const runs = out.analysis!.perCombo
    const d14 = runs.find((r) => r.combo.name === '1.4D')!.result!.d
    const d09E = runs.find((r) => r.combo.name === '0.9D + 1.0E')!.result!.d
    const dE = d09E.map((v, k) => v - (0.9 / 1.4) * d14[k])
    const peak = Math.max(...dE.map(Math.abs))
    expect(peak).toBeGreaterThan(1e-4)
    let worst = 0
    out.eCase!.d.forEach((v, k) => { worst = Math.max(worst, Math.abs(v - dE[k])) })
    expect(worst / peak).toBeLessThan(1e-9)
    // …and the old no-diaphragm E-case is measurably another structure
    const br = modelToFrame3D(m, {})
    const old = solveFrame3D(br.nodes, br.members, br.supports, applyF3Combo(br.loads, { E: 1 }), { pDelta: false }, br.shells)!
    let diff = 0
    old.d.forEach((v, k) => { diff = Math.max(diff, Math.abs(v - dE[k])) })
    expect(diff / peak).toBeGreaterThan(0.01)
  })

  it('reports the factorization as its own progress phase', () => {
    const phases: string[] = []
    runModelAnalysis(req(frame(false)), (p) => phases.push(p.phase))
    expect(phases[0]).toBe('Assembling and factoring stiffness')
    expect(phases.filter((p) => p === 'Assembling and factoring stiffness')).toHaveLength(1)
    expect(phases).toContain('Storey-drift check')
  })
})
