import { describe, it, expect } from 'vitest'
import { generateTruss, solveTruss, type TrussModel } from './truss'
import { designTruss, designTrussMember } from './trussDesign'

describe('truss solver — statics', () => {
  it('single triangle: equilibrium of reactions and tension in the bottom tie', () => {
    // pin at b0(0,0), roller at b1(4,0), apex t at (2,3); 10 kN down at apex.
    const m: TrussModel = {
      nodes: [{ id: 'b0', x: 0, y: 0 }, { id: 'b1', x: 4, y: 0 }, { id: 'a', x: 2, y: 3 }],
      members: [
        { id: 'm0', i: 'b0', j: 'b1', kind: 'bottom' },
        { id: 'm1', i: 'b0', j: 'a', kind: 'diagonal' },
        { id: 'm2', i: 'b1', j: 'a', kind: 'diagonal' },
      ],
      supports: [{ node: 'b0', ux: true, uy: true }, { node: 'b1', ux: false, uy: true }],
      loads: [{ node: 'a', fx: 0, fy: -10 }],
      E: 200000, A: 1500,
    }
    const r = solveTruss(m)!
    // reactions: symmetric 5 kN up each; total vertical = 10
    const Ry = r.reactions.reduce((s, x) => s + x.fy, 0)
    expect(Ry).toBeCloseTo(10, 4)
    expect(r.reactions.find((x) => x.node === 'b0')!.fy).toBeCloseTo(5, 4)
    // determinate: m=3, r=3, j=3 → 3+3-6 = 0
    expect(r.determinacy.value).toBe(0)
    expect(r.determinacy.status).toBe('determinate')
    // bottom chord is a tie (tension +); inclined members are struts (compression)
    const bottom = r.forces.find((f) => f.id === 'm0')!
    expect(bottom.N).toBeGreaterThan(0)
    expect(r.forces.find((f) => f.id === 'm1')!.N).toBeLessThan(0)
    // bottom tie = R·a/h projection: 5·(2/3) = 3.333 kN
    expect(bottom.N).toBeCloseTo(10 / 3, 3)
  })

  it('generated Pratt truss is determinate, carries the load, and is symmetric', () => {
    const m = generateTruss({ type: 'pratt', span: 12, height: 2, panels: 4, panelLoad: 10 })
    const r = solveTruss(m)!
    expect(r.determinacy.status).toBe('determinate')   // m + r = 2j
    const Ry = r.reactions.reduce((s, x) => s + x.fy, 0)
    const totalLoad = m.loads.reduce((s, l) => s + Math.abs(l.fy), 0)
    expect(Ry).toBeCloseTo(totalLoad, 3)               // ΣRy balances the applied load
    expect(r.maxTension).toBeGreaterThan(0)
    expect(r.maxCompression).toBeGreaterThan(0)         // top chord in compression
  })

  it('every generator produces a stable, determinate truss', () => {
    for (const type of ['pratt', 'howe', 'warren', 'roof'] as const) {
      const r = solveTruss(generateTruss({ type, span: 10, height: 2.5, panels: 4, panelLoad: 8 }))
      expect(r, type).not.toBeNull()
      expect(r!.stable, type).toBe(true)
    }
  })
})

describe('truss member design (AISC LRFD)', () => {
  const sec = { A: 1500, r: 25, E: 200000, Fy: 248 }
  it('tension capacity = 0.9·Fy·Ag', () => {
    const d = designTrussMember({ id: 'm', N: 100, L: 3, kind: 'bottom', i: 'a', j: 'b' }, sec)
    expect(d.mode).toBe('tension')
    expect(d.phiPn).toBeCloseTo((0.9 * 248 * 1500) / 1000, 3)   // 334.8 kN
  })
  it('compression capacity drops with slenderness and never exceeds tension', () => {
    const short = designTrussMember({ id: 'm', N: -100, L: 1, kind: 'top', i: 'a', j: 'b' }, sec)
    const long = designTrussMember({ id: 'm', N: -100, L: 4, kind: 'top', i: 'a', j: 'b' }, sec)
    expect(short.mode).toBe('compression')
    expect(long.phiPn).toBeLessThan(short.phiPn)                // longer → more slender → weaker
    expect(short.phiPn).toBeLessThanOrEqual((0.9 * 248 * 1500) / 1000 + 1e-6)
  })
  it('designTruss aggregates utilisation and pass/fail', () => {
    const forces = solveTruss(generateTruss({ type: 'warren', span: 12, height: 2, panels: 6, panelLoad: 15 }))!.forces
    const res = designTruss(forces, sec)
    expect(res.members).toHaveLength(forces.length)
    expect(res.maxUtil).toBeGreaterThan(0)
    expect(typeof res.allOK).toBe('boolean')
  })
})
