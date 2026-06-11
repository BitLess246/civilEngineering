// Worked solution for the combined-footing rigid method — mirrors
// engine/combinedFooting.ts.
import type { CombinedFootingInput, CombinedFootingResult } from '../engine/combinedFooting'
import { type SolutionStep, sn0, sn1, sn2 } from './solution'

export function combinedSolution(i: CombinedFootingInput, r: CombinedFootingResult): SolutionStep[] {
  const Pa1 = i.dl1 + i.ll1, Pa2 = i.dl2 + i.ll2

  const steps: SolutionStep[] = [
    {
      title: 'Service & factored column loads',
      lines: [
        { tex: `P_{a1} = ${sn0(i.dl1)}+${sn0(i.ll1)} = ${sn0(Pa1)}\\ \\text{kN},\\quad P_{a2} = ${sn0(Pa2)}\\ \\text{kN}` },
        { tex: `P_{u} = \\max(1.4D,1.2D+1.6L):\\; P_{u1} = ${sn0(r.Pu1)},\\; P_{u2} = ${sn0(r.Pu2)},\\; P_u = ${sn0(r.Pu)}\\ \\text{kN}` },
      ],
    },
    {
      title: 'Net allowable bearing',
      lines: [{ tex: `q_{net} = q_a - \\gamma_s D_s - \\gamma_c D_c - q = ${sn2(r.qNet)}\\ \\text{kPa}` }],
    },
    {
      title: `Geometry — ${r.shape}`,
      lines: r.shape[0] === 'T'
        ? [
            { tex: `B_x = ${sn2(r.Bx)}\\ \\text{m},\\quad B_{y1} \\to B_{y2} = ${sn2(r.By1)} \\to ${sn2(r.By2)}\\ \\text{m}` },
            { tex: `x_1 = ${sn2(r.x1)},\\quad x_2 = ${sn2(r.x2)}\\ \\text{m (column centres from left edge)}` },
          ]
        : [
            { tex: `B_x = ${sn2(r.Bx)}\\ \\text{m},\\quad B_y = ${sn2(r.By)}\\ \\text{m}` },
            { tex: `x_1 = ${sn2(r.x1)},\\quad x_2 = ${sn2(r.x2)}\\ \\text{m (sized about the service-load resultant)}` },
          ],
      note: r.widened ? 'Slab widened so each column sits fully within the footing (containment).' : undefined,
    },
    {
      title: 'Equivalent uniformly-varying line load',
      lines: [
        { tex: `w_{sum} = \\dfrac{2P_u}{B_x} = ${sn1(r.wu1 + r.wu2)}\\ \\text{kN/m}` },
        { tex: `w_{u1} = ${sn1(r.wu1)},\\quad w_{u2} = ${sn1(r.wu2)}\\ \\text{kN/m (linear, resultant matches } P_u)` },
      ],
    },
    {
      title: 'Peak (hogging) moment',
      lines: [{ tex: `M_{u,peak} = ${sn0(r.mPeak)}\\ \\text{kN·m at } x = ${sn2(r.xPeak)}\\ \\text{m}` }],
    },
    {
      title: 'Slab thickness',
      lines: [{ tex: `d_{punch} = ${sn0(r.dPunch)},\\; d_{beam} = ${sn0(r.dBeam)} \\Rightarrow D_c = ${sn0(r.Dc)}\\ \\text{mm}` }],
    },
    {
      title: 'Longitudinal flexure',
      lines: r.longSections.map((s) => ({
        tex: `\\text{${s.label}: } M_u = ${sn0(s.Mu)}\\ \\text{kN·m},\\; ${s.bars}\\,⌀${i.barDia}@${sn0(s.spacing)}\\ \\text{mm (${s.top ? 'top' : 'bottom'})}`,
      })),
    },
    {
      title: 'Transverse flexure (under columns)',
      lines: r.transverse.map((t) => ({
        tex: `\\text{${t.label}: } M_u = ${sn1(t.MuPerM)}\\ \\text{kN·m/m},\\; A_s = ${sn0(t.AsPerM)}\\ \\text{mm}^2/\\text{m} \\;@\\; ${sn0(t.spacing)}\\ \\text{mm}`,
      })),
    },
  ]
  return steps
}
