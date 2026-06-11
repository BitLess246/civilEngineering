// Worked solution for the pile-cap design — presents the engine's computed
// demands and capacities (engine/pileCap.ts) with the governing checks.
import type { PileCapInput, PileCapResult } from '../engine/pileCap'
import { type SolutionStep, sn0, sn1 } from './solution'

const ok = (b: boolean) => (b ? '\\checkmark' : '\\times\\ \\text{(revise)}')

export function pileCapSolution(i: PileCapInput, r: PileCapResult): SolutionStep[] {
  const n = r.coords.length
  const maxFact = Math.max(...r.factReactions)

  const shearStep = (title: string, Vu: number, phiVc: number, pass: boolean): SolutionStep => ({
    title,
    lines: [{ tex: `V_u = ${sn1(Vu)}\\ \\text{kN} \\;\\le\\; \\phi V_c = ${sn1(phiVc)}\\ \\text{kN}\\ ${ok(pass)}` }],
  })

  const flexStep = (title: string, Mu: number, s: PileCapResult['steelX']): SolutionStep => ({
    title,
    lines: [
      { tex: `M_u = ${sn1(Mu)}\\ \\text{kN·m}` },
      { tex: `A_s = ${sn0(s.As)}\\ \\text{mm}^2\\ (${s.usedMin ? '\\rho_{min}' : `\\rho = ${s.rho.toFixed(4)}`})` },
    ],
    note: `Provide ${s.bars} ⌀${i.barDia} mm @ ${sn0(s.spacing)} mm.`,
  })

  return [
    {
      title: 'Pile reactions (biaxial)',
      lines: [
        { tex: `R_i = \\dfrac{P_u}{n} \\pm \\dfrac{M_{ux}\\,y_i}{\\sum y^2} \\pm \\dfrac{M_{uy}\\,x_i}{\\sum x^2}` },
        { tex: `n = ${n}\\ \\text{piles},\\quad R_{u,max} = ${sn1(maxFact)}\\ \\text{kN}` },
        { tex: `R_{service,max} = ${sn1(r.maxReaction)}\\ \\text{kN} \\;\\le\\; R_{allow} = ${sn0(i.pileCapacity)}\\ \\text{kN}\\ ${ok(r.capacityOK)}` },
      ],
    },
    {
      title: 'Cap thickness & effective depth',
      lines: [{ tex: `D_c = ${sn0(r.Dc)}\\ \\text{mm},\\quad d = D_c - cover - \\tfrac{3}{2}d_b = ${sn0(r.d)}\\ \\text{mm}` }],
    },
    shearStep('Two-way (punching) at the column', r.VuPunchCol, r.phiVcPunchCol, r.punchColOK),
    shearStep('Two-way (punching) at a corner pile', r.VuPunchPile, r.phiVcPunchPile, r.punchPileOK),
    shearStep('One-way (beam) shear — x', r.VuBeamX, r.phiVcBeamX, r.beamXOK),
    shearStep('One-way (beam) shear — y', r.VuBeamY, r.phiVcBeamY, r.beamYOK),
    flexStep('Flexure — x direction', r.MuX, r.steelX),
    flexStep('Flexure — y direction', r.MuY, r.steelY),
    {
      title: 'Development length',
      lines: [{ tex: `\\ell_{d,req} = ${sn0(r.ldRequired)}\\ \\text{mm} \\;\\le\\; \\ell_{d,avail} = ${sn0(r.ldAvailable)}\\ \\text{mm}\\ ${ok(r.ldOK)}` }],
    },
  ]
}
