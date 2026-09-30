// One Analyze run assembles and factors K ONCE. Counted at the module
// boundary: `precomputeFrame` is the only assembler `modelAnalysis` may call,
// and the whole-structure entry points that assemble their own
// (`analyzeFrame3D`, `solveFrame3D`) must not be called at all.
import { describe, it, expect, vi } from 'vitest'

const calls = { precompute: 0, analyze: 0, solve: 0 }
vi.mock('./frame3d', async (importOriginal) => {
  const real = await importOriginal<typeof import('./frame3d')>()
  return {
    ...real,
    precomputeFrame: (...a: Parameters<typeof real.precomputeFrame>) => { calls.precompute++; return real.precomputeFrame(...a) },
    analyzeFrame3D: (...a: Parameters<typeof real.analyzeFrame3D>) => { calls.analyze++; return real.analyzeFrame3D(...a) },
    solveFrame3D: (...a: Parameters<typeof real.solveFrame3D>) => { calls.solve++; return real.solveFrame3D(...a) },
  }
})

const { runModelAnalysis } = await import('./modelAnalysis')
const { generateGridModel } = await import('./modelBuilder')

describe('runModelAnalysis — one factorization per run', () => {
  it('the combo sweep and the drift E-case share one precompute', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: { id: 'C', name: 'C', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }, slabThickness: 150 })
    for (const n of m.nodes) if (n.y > 1e-6) m.loads.push({ kind: 'node', node: n.id, Fx: 10, cat: 'E' })
    for (const p of m.plates) m.loads.push({ kind: 'area', plate: p.id, q: 5, cat: 'D' })
    const out = runModelAnalysis({ model: m, opts: {}, drift: { hasSeis: true, T: 0.4, R: 8.5, axis: 'x', pDelta: false } })
    expect(out.drift).not.toBeNull()
    expect(calls).toEqual({ precompute: 1, analyze: 0, solve: 0 })
  })
})
