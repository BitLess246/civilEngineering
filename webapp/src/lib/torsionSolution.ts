// Worked solution for combined shear + torsion — ACI 318-14 §22.7.
// Mirrors engine/torsionDesign.ts: symbolic equation, substituted numbers,
// result with unit, clause reference. Values come from the engine result, so
// the sheet and the verdict cannot disagree.
import type { TorsionInput, TorsionResult } from '../engine/torsionDesign'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function buildTorsionSolution(i: TorsionInput, r: TorsionResult): SolutionStep[] {
  const { b, h, cover, stirrupDia: ds, fc, fy, fyt } = i
  const lambda = i.lambda ?? 1
  const legs = i.legs ?? 2
  const sq = Math.sqrt(Math.max(fc, 1))
  const Ab = (Math.PI / 4) * ds * ds
  const Acp2_pcp = (r.Acp * r.Acp) / r.pcp
  const vu = (i.Vu * 1000) / (b * r.d)
  const tu = (i.Tu * 1e6 * r.ph) / (1.7 * r.Aoh * r.Aoh)

  const steps: SolutionStep[] = [
    {
      title: 'Section geometry',
      clause: 'ACI 318-14 §22.7.6.1',
      lines: [
        txt('Torsion is carried by a thin-walled tube following the closed stirrup. Acp/pcp describe the gross section; Aoh is the area enclosed by the stirrup centreline, and Ao = 0.85·Aoh is the effective shear-flow area.'),
        eq(String.raw`A_{cp} = b\,h = ${sn0(b)} \times ${sn0(h)} = ${sn0(r.Acp)}\ \text{mm}^2,\qquad p_{cp} = 2(b+h) = 2(${sn0(b)}+${sn0(h)}) = ${sn0(r.pcp)}\ \text{mm}`),
        eq(String.raw`c_{st} = cover + \tfrac{d_s}{2} = ${sn0(cover)} + ${sn1(ds / 2)} = ${sn1(r.cSt)}\ \text{mm}`),
        eq(String.raw`x_1 = b - 2c_{st} = ${sn0(b)} - 2(${sn1(r.cSt)}) = ${sn1(r.x1)}\ \text{mm},\qquad y_1 = h - 2c_{st} = ${sn1(r.y1)}\ \text{mm}`),
        eq(String.raw`A_{oh} = x_1 y_1 = ${sn0(r.Aoh)}\ \text{mm}^2,\quad p_h = 2(x_1+y_1) = ${sn0(r.ph)}\ \text{mm},\quad A_o = 0.85A_{oh} = ${sn0(r.Ao)}\ \text{mm}^2`),
        eq(String.raw`d = ${sn1(r.d)}\ \text{mm}`),
      ],
    },
    {
      title: 'Is torsion significant?',
      clause: 'ACI 318-14 §22.7.4.1 · §22.7.3',
      lines: [
        txt('Below the threshold torque, torsion may be neglected entirely — the section cracks in shear long before torsion matters. The cracking torque Tcr is quoted alongside, as it is what governs whether redistribution is permitted in an indeterminate frame.'),
        eq(String.raw`\frac{A_{cp}^2}{p_{cp}} = \frac{${sn0(r.Acp)}^2}{${sn0(r.pcp)}} = ${sn0(Acp2_pcp)}\ \text{mm}^3`),
        eq(String.raw`T_{u,th} = \phi\lambda\sqrt{f'_c}\,\frac{A_{cp}^2}{12\,p_{cp}} = 0.75(${sn2(lambda)})(${sn3(sq)})\frac{${sn0(Acp2_pcp)}}{12}\times10^{-6} = ${sn2(r.Tu_th)}\ \text{kN·m}`),
        eq(String.raw`T_{cr} = \lambda\sqrt{f'_c}\,\frac{A_{cp}^2}{3\,p_{cp}} = ${sn2(r.Tcr)}\ \text{kN·m}`),
        eq(String.raw`T_u = ${sn2(i.Tu)}\ \text{kN·m} \;${r.torsionNeeded ? '\\ge' : '<'}\; T_{u,th} \Rightarrow \textbf{${r.torsionNeeded ? 'torsion must be designed for' : 'torsion may be neglected'}}`),
      ],
    },
    {
      title: 'Section adequacy — shear + torsion interaction',
      clause: 'ACI 318-14 §22.7.7.1',
      pass: r.interactionOK,
      lines: [
        txt('Shear and torsional shear stresses add on one face of the section. This limit prevents the concrete crushing before the stirrups can yield, and no amount of reinforcement fixes a section that fails it — the section itself must grow.'),
        eq(String.raw`\frac{V_u}{b_w d} = \frac{${sn1(i.Vu)}\times10^3}{${sn0(b)} \times ${sn1(r.d)}} = ${sn3(vu)}\ \text{MPa}`),
        eq(String.raw`\frac{T_u p_h}{1.7 A_{oh}^2} = \frac{${sn2(i.Tu)}\times10^6 \times ${sn0(r.ph)}}{1.7(${sn0(r.Aoh)})^2} = ${sn3(tu)}\ \text{MPa}`),
        eq(String.raw`\sqrt{\left(\tfrac{V_u}{b_w d}\right)^2 + \left(\tfrac{T_u p_h}{1.7A_{oh}^2}\right)^2} = \sqrt{${sn3(vu)}^2 + ${sn3(tu)}^2} = ${sn3(r.lhs)}\ \text{MPa}`),
        eq(String.raw`\phi\left(\frac{V_c}{b_w d} + \tfrac{2}{3}\sqrt{f'_c}\right) = 0.75\left(\frac{${sn1(r.Vc)}\times10^3}{${sn0(b)}\times${sn1(r.d)}} + \tfrac{2}{3}(${sn3(sq)})\right) = ${sn3(r.rhs)}\ \text{MPa}`),
        eq(String.raw`${sn3(r.lhs)} \;${r.interactionOK ? '\\le' : '>'}\; ${sn3(r.rhs)} \Rightarrow \textbf{${r.interactionOK ? 'section adequate' : 'ENLARGE THE SECTION'}}`),
      ],
    },
  ]

  if (r.torsionNeeded) {
    steps.push({
      title: 'Transverse torsional steel',
      clause: 'ACI 318-14 §22.7.6.1',
      lines: [
        txt('At/s is the area of ONE closed-stirrup leg per unit length required to carry the torque, from the space-truss model with θ = 45°. The code minimum applies whenever torsion is designed for.'),
        eq(String.raw`\frac{A_t}{s} = \frac{T_u}{\phi\,2A_o f_{yt}} = \frac{${sn2(i.Tu)}\times10^6}{0.75 \times 2(${sn0(r.Ao)})(${sn0(fyt)})} = ${sn4(r.AtPerS)}\ \text{mm}^2\text{/mm}`),
        eq(String.raw`\left(\frac{A_t}{s}\right)_{min} = \max\!\left(\frac{0.0625\sqrt{f'_c}}{f_{yt}},\ \frac{0.35}{f_{yt}}\right) = ${sn4(r.AtPerS_min)}\ \text{mm}^2\text{/mm}`),
        eq(String.raw`\left(\frac{A_t}{s}\right)_{design} = ${sn4(r.AtPerS_design)}\ \text{mm}^2\text{/mm}`),
      ],
    })

    steps.push({
      title: 'Longitudinal torsional steel',
      clause: 'ACI 318-14 §22.7.5.1 · §22.7.5.2',
      lines: [
        txt('The space truss needs longitudinal steel to balance the diagonal compression, distributed around the perimeter of the closed stirrup — not lumped at the tension face.'),
        eq(String.raw`A_l = \frac{A_t}{s}\,p_h\,\frac{f_{yt}}{f_y} = ${sn4(r.AtPerS_design)} \times ${sn0(r.ph)} \times \frac{${sn0(fyt)}}{${sn0(fy)}} = ${sn1(r.Al)}\ \text{mm}^2`),
        eq(String.raw`A_{l,min} = \frac{5\sqrt{f'_c}A_{cp}}{12 f_y} - \frac{A_t}{s}p_h\frac{f_{yt}}{f_y} = ${sn1(r.Al_min)}\ \text{mm}^2`),
        eq(String.raw`A_{l,design} = \max(A_l, A_{l,min}) = \mathbf{${sn1(r.Al_design)}}\ \text{mm}^2`),
      ],
    })
  }

  steps.push({
    title: 'Combined stirrups and spacing',
    clause: 'ACI 318-14 §22.5.10.5 · §9.7.6.3.2',
    lines: [
      txt('Shear steel is shared between all legs; torsion steel is carried by the outermost closed leg on each side. They are added as (Av + 2At)/s because the two legs of the closed stirrup each carry At.'),
      eq(String.raw`V_s = \frac{V_u}{\phi} - V_c = \frac{${sn1(i.Vu)}}{0.75} - ${sn1(r.Vc)} = ${sn1(r.Vs)}\ \text{kN}`),
      eq(String.raw`\frac{A_v}{s} = \frac{V_s}{f_{yt} d} = \frac{${sn1(r.Vs)}\times10^3}{${sn0(fyt)} \times ${sn1(r.d)}} = ${sn4(r.AvPerS)}\ \text{mm}^2\text{/mm}`),
      eq(String.raw`\frac{A_v + 2A_t}{s} = ${sn4(r.AvPerS)} + 2(${sn4(r.AtPerS_design)}) = ${sn4(r.AvPlus2At)}\ \text{mm}^2\text{/mm}\quad\left(\text{min } ${sn4(r.AvPlus2At_min)}\right)`),
      eq(String.raw`s_{req} = \frac{n_{legs} A_b}{(A_v+2A_t)/s} = \frac{${sn0(legs)} \times ${sn1(Ab)}}{${sn4(r.AvPlus2At)}} = ${Number.isFinite(r.sReq) ? sn1(r.sReq) : '\\infty'}\ \text{mm}`),
      eq(String.raw`s_{max} = \min\!\left(\tfrac{p_h}{8},\ 300,\ \tfrac{d}{2},\ 600\right) = \min(${sn1(r.ph / 8)},\ 300,\ ${sn1(r.d / 2)},\ 600) = ${sn1(r.sMax)}\ \text{mm}`),
      eq(String.raw`s_{adopt} = \min(s_{req}, s_{max}) = \mathbf{${sn1(r.sAdopt)}}\ \text{mm}`),
    ],
    note: `Provide ⌀${sn0(ds)} closed stirrups, ${sn0(legs)} legs, at ${sn0(r.sAdopt)} mm centres.`,
  })

  return steps
}
