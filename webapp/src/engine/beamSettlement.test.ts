// Support settlement — every number against a closed form (Hibbeler,
// Structural Analysis §12.4 and ch. 10; the slope-deflection fixed-end
// moments 6EIΔ/L²). Settlement δ is downward +, mm; EI in kN·m².
import { describe, it, expect } from 'vitest'
import { solveFEM, analyzeBeam, threeMoment, settlementProfile, type Support, type BeamLoad } from './beamAnalysis'
import { deriveBeam } from './beamDerivation'

const E = 25000, I = 3.125e9          // MPa, mm⁴ → EI = 78 125 kN·m²
const EI = E * I * 1e-9
const at = (xs: number[], v: number[], x: number) => v[xs.findIndex((q) => Math.abs(q - x) < 1e-6)]
const R = (r: { reactions: { x: number; Rv: number; Rm: number }[] }, x: number) => r.reactions.find((q) => Math.abs(q.x - x) < 1e-6)!

describe('settlement in the stiffness solution, against closed forms', () => {
  it('two equal spans, middle support settles δ: M_B = 3EIδ/L², R_B = −6EIδ/L³', () => {
    const L = 6, d = 0.012
    const sup: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: L, settlement: 12 }, { type: 'roller', x: 2 * L }]
    const r = solveFEM(sup, [], 2 * L, E, I)!
    expect(at(r.xs, r.M, L)).toBeCloseTo((3 * EI * d) / L ** 2, 2)          // sagging: the support pulls down
    expect(R(r, L).Rv).toBeCloseTo((-6 * EI * d) / L ** 3, 3)
    expect(R(r, 0).Rv).toBeCloseTo((3 * EI * d) / L ** 3, 3)
    expect(at(r.xs, r.D, L)).toBeCloseTo(-12, 6)                             // the beam follows the support
    expect(r.reactions.reduce((a, q) => a + q.Rv, 0)).toBeCloseTo(0, 6)     // self-equilibrated
  })

  it('propped cantilever, the roller settles δ: R_B = −3EIδ/L³, M_A = −3EIδ/L²', () => {
    const L = 5, d = 0.01
    const r = solveFEM([{ type: 'fixed', x: 0 }, { type: 'roller', x: L, settlement: 10 }], [], L, E, I)!
    expect(R(r, L).Rv).toBeCloseTo((-3 * EI * d) / L ** 3, 3)
    expect(at(r.xs, r.M, 0)).toBeCloseTo((-3 * EI * d) / L ** 2, 2)
  })

  it('fixed–fixed beam, one end settles δ: end moments 6EIδ/L², shear 12EIδ/L³', () => {
    const L = 4, d = 0.008
    const r = solveFEM([{ type: 'fixed', x: 0 }, { type: 'fixed', x: L, settlement: 8 }], [], L, E, I)!
    expect(Math.abs(at(r.xs, r.M, 0))).toBeCloseTo((6 * EI * d) / L ** 2, 1)
    expect(Math.abs(at(r.xs, r.M, L))).toBeCloseTo((6 * EI * d) / L ** 2, 1)
    expect(Math.abs(R(r, 0).Rv)).toBeCloseTo((12 * EI * d) / L ** 3, 2)
  })

  it('a determinate beam is moved, not strained: same reactions and moments, deflection = load + settlement line', () => {
    const L = 6
    const w: BeamLoad[] = [{ type: 'udl', x1: 0, x2: L, w: 10, cat: 'D' }]
    const a = solveFEM([{ type: 'pin', x: 0 }, { type: 'roller', x: L }], w, L, E, I)!
    const b = solveFEM([{ type: 'pin', x: 0 }, { type: 'roller', x: L, settlement: 20 }], w, L, E, I)!
    expect(R(b, 0).Rv).toBeCloseTo(R(a, 0).Rv, 6)
    expect(at(b.xs, b.M, L / 2)).toBeCloseTo(at(a.xs, a.M, L / 2), 6)
    // midspan: the load's 5wL⁴/384EI plus half the 20 mm settlement
    expect(at(b.xs, b.D, L / 2)).toBeCloseTo(at(a.xs, a.D, L / 2) - 10, 4)
    // and the member's OWN deflection — what L/360 limits — is the load's
    b.xs.forEach((_x, k) => expect(b.D[k] - b.Dsettle[k]).toBeCloseTo(a.D[k], 4))
  })

  it('a spring settlement moves its base: a very stiff spring behaves as a settled roller', () => {
    const L = 6
    const rigid = solveFEM([{ type: 'pin', x: 0 }, { type: 'roller', x: L, settlement: 10 }, { type: 'roller', x: 2 * L }], [], 2 * L, E, I)!
    const spring = solveFEM([{ type: 'pin', x: 0 }, { type: 'spring', x: L, k: 1e10, settlement: 10 }, { type: 'roller', x: 2 * L }], [], 2 * L, E, I)!
    expect(R(spring, L).Rv).toBeCloseTo(R(rigid, L).Rv, 2)
  })

  it('the settlement line is linear between supports and runs on past the ends', () => {
    const s: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: 4, settlement: 8 }]
    expect(settlementProfile(s, 2)).toBeCloseTo(-0.004, 12)
    expect(settlementProfile(s, 6)).toBeCloseTo(-0.012, 12)      // an overhang tips on with the span
  })
})

describe('the three-moment equation carries the settlement term', () => {
  it('two spans, middle support δ, no load: M_B = 3EIδ/L² — the same as the stiffness solution', () => {
    const L = 6, d = 0.012
    const res = threeMoment([L, L], [[], []], [EI, EI], [0, 0], [0, d, 0])!
    expect(res.supportMoments[1]).toBeCloseTo((3 * EI * d) / L ** 2, 6)
    expect(res.reactions[1]).toBeCloseTo((-6 * EI * d) / L ** 3, 6)
  })
})

describe('combinations: settlement is factored like T (NSCP §203.3.3)', () => {
  const L = 6
  const sup: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: L, settlement: 10 }, { type: 'roller', x: 2 * L }]
  const loads: BeamLoad[] = [{ type: 'udl', x1: 0, x2: 2 * L, w: 10, cat: 'D' }]
  const res = analyzeBeam(sup, loads, 2 * L, E, I)!
  const run = (name: string) => res.perCombo.find((c) => c.combo.name === name)!
  const alone = (f: number) => solveFEM(sup, [], 2 * L, E, I, undefined, f)!

  it('rides at 1.2 with the factored dead load, and is absent from 0.9D', () => {
    expect(run('1.4D').settleFactor).toBe(1.2)
    expect(run('0.9D + 1.0W').settleFactor).toBe(0)
    // superposition: 1.4D's middle reaction is the load's plus 1.2 × settlement's
    const loadOnly = solveFEM(sup.map((s) => ({ ...s, settlement: 0 })), loads.map((l) => ({ ...l, w: 14 })) as BeamLoad[], 2 * L, E, I)!
    expect(R(run('1.4D').result!, L).Rv).toBeCloseTo(R(loadOnly, L).Rv + R(alone(1.2), L).Rv, 3)
  })

  it('the three-moment cross-check agrees with the stiffness solution under settlement', () => {
    const gov = res.perCombo[res.govIdx]
    expect(res.tmt).not.toBeNull()
    res.tmt!.positions.forEach((x, k) => expect(res.tmt!.reactions[k]).toBeCloseTo(R(gov.result!, x).Rv, 1))
  })
})

describe('the hand derivation reproduces the stiffness solution with settlement', () => {
  const L = 6
  const loads: BeamLoad[] = [{ type: 'udl', x1: 0, x2: 2 * L, w: 12, cat: 'D' }]
  const cases: [string, Support[], number, string][] = [
    ['two spans, middle support settles (three-moment)', [{ type: 'pin', x: 0 }, { type: 'roller', x: L, settlement: 15 }, { type: 'roller', x: 2 * L }], 2 * L, 'three-moment'],
    ['propped cantilever, roller settles (force method)', [{ type: 'fixed', x: 0 }, { type: 'roller', x: L, settlement: 10 }], L, 'force'],
    ['fixed support settles, roller does not (force method, rigid primary motion)', [{ type: 'fixed', x: 0, settlement: 6 }, { type: 'roller', x: L }], L, 'force'],
    ['three supports, two settle (three-moment)', [{ type: 'pin', x: 0, settlement: 5 }, { type: 'roller', x: L, settlement: 15 }, { type: 'roller', x: 2 * L }], 2 * L, 'three-moment'],
    ['continuous over a spring that settles (force method)', [{ type: 'pin', x: 0 }, { type: 'spring', x: L, k: 20000, settlement: 10 }, { type: 'roller', x: 2 * L }], 2 * L, 'force'],
  ]
  for (const [name, sup, span, method] of cases) {
    it(name, () => {
      const lds = loads.map((l) => ({ ...l, x2: span })) as BeamLoad[]
      const fem = solveFEM(sup, lds, span, E, I)!
      const dv = deriveBeam(sup, lds, span, E, I, undefined, 'test', fem.reactions)
      expect(dv.method).toBe(method)
      sup.forEach((s, k) => {
        expect(dv.reactions[k].Rv, `${s.type} @ ${s.x}`).toBeCloseTo(R(fem, s.x).Rv, 1)
        if (s.type === 'fixed') expect(dv.reactions[k].Rm).toBeCloseTo(R(fem, s.x).Rm, 1)
      })
      // and the elastic curve passes through the settled supports
      for (const s of sup) {
        const g = dv.segs.find((q) => s.x >= q.a - 1e-9 && s.x <= q.b + 1e-9)!
        expect(g).toBeDefined()
      }
      expect(dv.Dpeak.y).toBeCloseTo(-Math.max(...fem.D.map((v) => -v)), 0)
    })
  }
})
