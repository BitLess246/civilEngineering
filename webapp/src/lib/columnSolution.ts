// Detailed worked solution for the column design — provision-cited steps in
// the foundation/beam style, mirroring engine/columnDesign.ts.
import {
  type AxialColumnInput, type AxialColumnResult,
  type InteractionInput, type InteractionResult, type PMPoint,
  type SlendernessInput, type SlendernessResult,
} from '../engine/columnDesign'
import { beta1 } from '../engine/loads'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function axialColumnSolution(i: AxialColumnInput, r: AxialColumnResult): SolutionStep[] {
  const tied = i.shape === 'tied'
  const steps: SolutionStep[] = []

  steps.push({
    title: 'Gross section & demand',
    lines: [
      txt(tied
        ? 'Short tied rectangular column under concentric factored load.'
        : 'Short spiral circular column under concentric factored load.'),
      eq(tied
        ? String.raw`A_g = b\,h = ${sn0(i.b ?? 0)}\times ${sn0(i.h ?? 0)} = ${sn0(r.Ag)}\ \text{mm}^2,\qquad P_u = ${sn1(i.Pu)}\ \text{kN}`
        : String.raw`A_g = \tfrac{\pi}{4}D^2 = \tfrac{\pi}{4}(${sn0(i.D ?? 0)})^2 = ${sn0(r.Ag)}\ \text{mm}^2,\qquad P_u = ${sn1(i.Pu)}\ \text{kN}`),
    ],
  })

  steps.push({
    title: 'Required longitudinal steel',
    lines: [
      txt(`Axial design strength (§422.4.2): φPn,max = φ·α·[0.85f′c(Ag − Ast) + fy·Ast], with α = ${r.alpha.toFixed(2)} and φ = ${r.phi.toFixed(2)} for a ${tied ? 'tied' : 'spiral'} column (§421.2). Solve for Ast at φPn,max = Pu, floored at ρ = 1% (§410.6.1.1).`),
      eq(String.raw`A_{st,req} = \dfrac{P_u/(\phi\alpha) - 0.85 f'_c A_g}{f_y - 0.85 f'_c} = ${sn0(r.AstReq)}\ \text{mm}^2\ (\rho = ${sn4(r.rhoReq)})`),
    ],
    note: r.rhoReq <= 0.01 + 1e-9 ? 'ρmin = 1% governs.' : undefined,
  })

  steps.push({
    title: 'Bar selection & limits',
    lines: [
      txt(`Steel must satisfy 0.01Ag ≤ Ast ≤ 0.08Ag (§410.6.1.1) with at least ${r.minBars} bars for a ${tied ? 'rectangular tied' : 'spiral'} column (§410.7.3.1).`),
      eq(String.raw`n = \lceil A_{st,req}/A_b \rceil = ${r.bars}\ \text{⌀}${i.barDia}\ \Rightarrow A_{st} = ${sn0(r.Ast)}\ \text{mm}^2\ (\rho = ${sn4(r.rho)})\ ${r.rhoOK ? '\\checkmark' : '\\times'}`),
    ],
  })

  steps.push({
    title: 'Design axial strength check',
    lines: [
      eq(String.raw`P_o = 0.85 f'_c (A_g - A_{st}) + f_y A_{st} = ${sn1(r.Po)}\ \text{kN}`),
      eq(String.raw`\phi P_{n,max} = ${r.phi.toFixed(2)}\times ${r.alpha.toFixed(2)}\times P_o = ${sn1(r.phiPnMax)}\ \text{kN} \;${r.axialOK ? '\\ge' : '<'}\; P_u = ${sn1(i.Pu)}\ \text{kN}\ ${r.axialOK ? '\\checkmark' : '\\times'}`),
    ],
  })

  if (tied) {
    steps.push({
      title: 'Tie detailing (§425.7.2)',
      lines: [
        txt(`Ties at least ⌀${r.tieDiaMin} mm for ⌀${i.barDia} longitudinal bars; spacing the least of 16d_b, 48d_tie, and the least column dimension.`),
        eq(String.raw`s \le \min(16\times ${i.barDia},\ 48\times ${i.tieDia},\ ${sn0(Math.min(i.b ?? 0, i.h ?? 0))}) = ${sn0(r.tieSpacing)}\ \text{mm}\ (\text{${r.tieGovern}})`),
      ],
      note: `Provide ⌀${Math.max(i.tieDia, r.tieDiaMin)} mm ties @ ${sn0(r.tieSpacing)} mm.`,
    })
  } else {
    steps.push({
      title: 'Spiral detailing (§425.7.3)',
      lines: [
        txt('The volumetric ratio must satisfy ρs ≥ max[0.45(Ag/Ach − 1), 0.12]·f′c/fyt (§425.7.3.3); the clear pitch must lie between 25 and 75 mm (§425.7.3.1).'),
        eq(String.raw`\rho_s = ${sn4(r.rhoS)},\qquad s = \dfrac{4 A_{sp}}{\rho_s D_{ch}} \Rightarrow ${sn0(r.spiralPitch)}\ \text{mm pitch}\ ${r.pitchClearOK ? '\\checkmark' : '\\times'}`),
      ],
      note: `Provide a ⌀${i.tieDia} mm spiral @ ${sn0(r.spiralPitch)} mm pitch.`,
    })
  }

  return steps
}

export function eccentricColumnSolution(
  i: InteractionInput, r: InteractionResult, Pu: number, Mu: number, cap: PMPoint,
): SolutionStep[] {
  const e = Pu > 1e-9 ? Mu / Pu : 0
  const compr = e <= r.balanced.eb
  const util = cap.phi * cap.Pn > 1e-9 ? Pu / (cap.phi * cap.Pn) : Infinity
  const b1 = beta1(i.fc)
  const aB = Math.min(b1 * r.balanced.c, i.h)

  return [
    {
      title: 'Eccentricity of the load',
      lines: [
        txt('The displaced concrete is not neglected; moments are taken about the plastic centroid (the geometric centre of this symmetric section).'),
        eq(String.raw`e = \dfrac{M_u}{P_u} = \dfrac{${sn1(Mu)}}{${sn1(Pu)}} = ${sn0(e * 1000)}\ \text{mm}`),
      ],
    },
    {
      title: 'Balanced strain condition',
      lines: [
        txt('Concrete crushes (εc = 0.003) exactly as the extreme tension steel yields (εs = fy/Es) — locating the neutral axis at cb = 600·dt/(600 + fy).'),
        eq(String.raw`c_b = \dfrac{600\,d_t}{600+f_y} = \dfrac{600(${sn0(r.dt)})}{${sn0(600 + i.fy)}} = ${sn1(r.balanced.c)}\ \text{mm},\quad a_b = \beta_1 c_b = ${sn1(aB)}\ \text{mm}`),
        eq(String.raw`P_b = ${sn1(r.balanced.Pb)}\ \text{kN},\qquad M_b = ${sn1(r.balanced.Mb)}\ \text{kN·m},\qquad e_b = ${sn0(r.balanced.eb * 1000)}\ \text{mm}`),
      ],
      note: compr
        ? `e ≤ eb — compression-controlled side of the interaction diagram.`
        : `e > eb — tension-controlled side of the interaction diagram.`,
    },
    {
      title: 'Capacity along the demand ray (strain compatibility)',
      lines: [
        txt('Sweep the neutral axis until Mn/Pn equals the demand eccentricity: fs = 600(c − d)/c clamped at ±fy on each face, displaced concrete deducted for bars inside the stress block, φ from εt (§421.2: 0.65 compression- to 0.90 tension-controlled).'),
        eq(String.raw`c = ${sn1(cap.c)}\ \text{mm},\quad \varepsilon_t = ${sn4(cap.et)},\quad \phi = ${sn3(cap.phi)}`),
        eq(String.raw`P_n = ${sn1(cap.Pn)}\ \text{kN},\quad M_n = ${sn1(cap.Mn)}\ \text{kN·m}`),
        eq(String.raw`\phi P_n = ${sn1(cap.phi * cap.Pn)}\ \text{kN} \;${util <= 1 ? '\\ge' : '<'}\; P_u = ${sn1(Pu)}\ \text{kN}\quad(\text{utilisation } ${sn2(util)})\ ${util <= 1 ? '\\checkmark' : '\\times'}`),
      ],
      note: util <= 1 ? 'Section is adequate at this eccentricity.' : 'Section is NOT adequate — add steel or enlarge the section.',
    },
  ]
}

export function slendernessSolution(i: SlendernessInput, r: SlendernessResult): SolutionStep[] {
  return [
    {
      title: 'Slenderness classification (nonsway)',
      lines: [
        txt('For compression members braced against sidesway, slenderness may be neglected when kLu/r ≤ 34 + 12(M1/M2) ≤ 40, with M1/M2 negative in single curvature (RC-06 / §406.2.5). r = 0.3h for rectangular sections.'),
        eq(String.raw`\dfrac{k L_u}{r} = \dfrac{${sn2(i.k)}\times ${sn2(i.Lu)}\times 1000}{${sn1(r.r)}} = ${sn1(r.kLuOverR)} \;${r.slender ? '>' : '\\le'}\; ${sn1(r.limit)}`),
      ],
      note: r.slender ? 'Slender — magnify the moment.' : 'Short — slenderness effects may be neglected (δ shown for reference).',
    },
    {
      title: 'Moment magnification (§406.6.4)',
      lines: [
        eq(String.raw`C_m = 0.6 - 0.4\,\tfrac{M_1}{M_2} = ${sn3(r.Cm)}`),
        eq(String.raw`P_c = \dfrac{\pi^2 EI}{(k L_u)^2} = \dfrac{\pi^2 (${sn0(r.EI)})}{(${sn2(i.k * i.Lu)})^2} = ${sn1(r.Pc)}\ \text{kN}`),
        eq(String.raw`\delta = \dfrac{C_m}{1 - \tfrac{P_u}{0.75 P_c}} = ${sn3(r.delta)} \ge 1.0`),
        eq(String.raw`M_{2,min} = P_u(15 + 0.03h) = ${sn2(r.M2min)}\ \text{kN·m},\qquad M_c = \delta\,M_2 = \mathbf{${sn2(r.Mc)}}\ \text{kN·m}`),
      ],
      note: 'Mc replaces Mu in the eccentric design above.',
    },
  ]
}
