// Detailed worked solution for the beam design — legacy-style: each step has
// an explanation citing the governing provision, then the substituted
// equations. Mirrors engine/beamDesign.ts (SRRB/DRRB at ρ_max = 0.75ρ_b).
import type { BeamDesignInput, BeamDesignResult } from '../engine/beamDesign'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn3, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function buildBeamSolution(i: BeamDesignInput, r: BeamDesignResult): SolutionStep[] {
  const fyt = i.fyt ?? i.fy
  const legs = i.legs ?? 2
  const dbC = i.comprBarDia ?? i.barDia
  const d = r.d
  const Ab = (Math.PI / 4) * i.barDia * i.barDia

  const steps: SolutionStep[] = []

  steps.push({
    title: 'Effective depths',
    lines: [
      txt('Tension steel sits inside the stirrup: d = h − cover − dₛ − d_b/2. The compression-steel depth d′ is measured the same way from the top face.'),
      eq(String.raw`d = ${sn0(i.h)} - ${sn0(i.cover)} - ${sn0(i.stirrupDia)} - ${sn1(i.barDia / 2)} = \mathbf{${sn1(d)}}\ \text{mm}`),
      eq(String.raw`d' = cover + d_s + \tfrac{d_b'}{2} = ${sn0(i.cover)} + ${sn0(i.stirrupDia)} + ${sn1(dbC / 2)} = ${sn1(r.dPrime)}\ \text{mm}`),
    ],
  })

  steps.push({
    title: 'Reinforcement-ratio limits',
    lines: [
      txt('The balanced ratio comes from strain compatibility (εcu = 0.003, Es = 200 GPa → the 600/(600+fy) form, NSCP 2015 §422 / ACI 318-14 §21.2). The legacy sheet caps the singly-reinforced design at ρ_max = 0.75ρ_b; ρ_min per §409.6.1.'),
      eq(String.raw`\rho_b = \tfrac{0.85\beta_1 f'_c}{f_y}\cdot\tfrac{600}{600+f_y} = ${sn4(r.rhoB)}`),
      eq(String.raw`\rho_{max} = 0.75\rho_b = ${sn4(r.rhoMax)},\qquad \rho_{min} = \max\!\left(\tfrac{1.4}{f_y}, \tfrac{\sqrt{f'_c}}{4f_y}\right) = ${sn4(r.rhoMin)}`),
    ],
  })

  steps.push({
    title: 'SRRB / DRRB classification',
    lines: [
      txt('Compute the moment capacity of the section if it carried the maximum singly-reinforced steel (ρ_max). If Mu fits under φMn_max the beam is singly reinforced (SRRB); otherwise compression steel is required (DRRB).'),
      eq(String.raw`A_{s,max} = \rho_{max} b d = ${sn0(r.AsMax)}\ \text{mm}^2,\quad a_{max} = \tfrac{A_{s,max} f_y}{0.85 f'_c b} = ${sn1(r.aMax)}\ \text{mm}`),
      eq(String.raw`\phi M_{n,max} = 0.90\,A_{s,max} f_y (d - \tfrac{a_{max}}{2}) = ${sn1(r.phiMnMax)}\ \text{kN·m}`),
      eq(String.raw`M_u = ${sn1(i.Mu)}\ \text{kN·m} \;${i.Mu <= r.phiMnMax ? '\\le' : '>'}\; \phi M_{n,max} \Rightarrow \textbf{${r.mode}}`),
    ],
    note: r.mode === 'SRRB' ? 'Singly reinforced — tension steel only.' : 'Doubly reinforced — add compression steel for the moment beyond the ceiling.',
  })

  if (r.mode === 'SRRB') {
    const Rn = (i.Mu * 1e6) / (0.9 * i.b * d * d)
    steps.push({
      title: 'Tension steel (SRRB)',
      lines: [
        txt('Solve the design strength equation for ρ via the coefficient of resistance Rₙ, then floor at ρ_min (§409.6.1).'),
        eq(String.raw`R_n = \dfrac{M_u}{\phi b d^2} = \dfrac{${sn0(i.Mu)}\times 10^6}{0.9(${sn0(i.b)})(${sn1(d)})^2} = ${sn3(Rn)}\ \text{MPa}`),
        eq(String.raw`\rho = \tfrac{0.85 f'_c}{f_y}\!\left(1-\sqrt{1-\tfrac{2R_n}{0.85 f'_c}}\right) = ${sn4(r.rho)}`),
        eq(String.raw`A_s = \rho b d = ${sn0(r.As)}\ \text{mm}^2`),
      ],
      note: r.usedMin ? 'ρ_min governs.' : 'Computed ρ governs.',
    })
  } else {
    steps.push({
      title: 'Tension steel (DRRB)',
      lines: [
        txt('Split the demand into the ρ_max couple (As1, concrete) and a residual steel couple (As2, paired with the compression steel A′s across the lever arm d − d′).'),
        eq(String.raw`A_{s1} = A_{s,max} = ${sn0(r.As1)}\ \text{mm}^2`),
        eq(String.raw`M_{n,resid} = \tfrac{M_u}{\phi} - M_{n,max} = \tfrac{${sn1(i.Mu)}}{0.90} - ${sn1(r.MnMax)} = ${sn1(r.MnResid)}\ \text{kN·m}`),
        eq(String.raw`A_{s2} = \dfrac{M_{n,resid}}{f_y (d - d')} = \dfrac{${sn1(r.MnResid)}\times 10^6}{${sn0(i.fy)}(${sn1(d)} - ${sn1(r.dPrime)})} = ${sn0(r.As2)}\ \text{mm}^2`),
        eq(String.raw`A_s = A_{s1} + A_{s2} = \mathbf{${sn0(r.As)}}\ \text{mm}^2`),
      ],
    })
    steps.push({
      title: 'Compression-steel stress check',
      lines: [
        txt('Strain compatibility at a = a_max: if the compression steel has not yielded, A′s is scaled up by fy/f′s so the couple still balances (§422.2.2).'),
        eq(String.raw`c = \tfrac{a_{max}}{\beta_1} = ${sn1(r.cNA)}\ \text{mm},\quad \varepsilon_s' = 0.003\,\tfrac{c - d'}{c} = ${sn4(r.epsSp)}`),
        eq(String.raw`f_s' = \min(f_y,\ E_s\varepsilon_s') = ${sn1(r.fsPrime)}\ \text{MPa}\ ${r.fsYields ? '(\\text{yields})' : '(\\text{does not yield})'}`),
        eq(String.raw`A_s' = A_{s2}\,\tfrac{f_y}{f_s'} = ${sn0(r.AsPrime)}\ \text{mm}^2`),
      ],
      note: `Provide ${r.comprBars} ⌀${dbC} mm compression bars.`,
    })
  }

  steps.push({
    title: 'Bar selection (tension)',
    lines: [
      txt('Choose the bar count from the required area; clear spacing must accommodate the bars inside the stirrup (§425.2).'),
      eq(String.raw`A_b = \tfrac{\pi}{4}d_b^2 = ${sn0(Ab)}\ \text{mm}^2,\quad n = \lceil A_s/A_b \rceil = ${r.bars}`),
      eq(String.raw`s = ${sn0(r.barSpacing)}\ \text{mm o.c.}`),
    ],
    note: `Provide ${r.bars} ⌀${i.barDia} mm tension bars${r.mode === 'DRRB' ? ` + ${r.comprBars} ⌀${dbC} mm compression bars` : ''}.`,
  })

  steps.push({
    title: 'Shear strength of concrete',
    lines: [
      txt('Concrete one-way shear strength per NSCP 2015 §422.5.5.1 with φ = 0.75 (§421.2). Half of φVc marks the threshold below which no stirrups are required (§409.6.3).'),
      eq(String.raw`V_c = \tfrac{1}{6}\lambda\sqrt{f'_c}\,b d = \tfrac{1}{6}\sqrt{${sn0(i.fc)}}(${sn0(i.b)})(${sn1(d)})/1000 = ${sn1(r.Vc)}\ \text{kN}`),
      eq(String.raw`\phi V_c = ${sn1(r.phiVc)}\ \text{kN},\quad \tfrac{1}{2}\phi V_c = ${sn1(r.phiVc / 2)}\ \text{kN}`),
    ],
  })

  if (r.region === 'none') {
    steps.push({
      title: 'Stirrup requirement',
      lines: [
        txt('Vu is below half of φVc, so the code does not require shear reinforcement (§409.6.3.1).'),
        eq(String.raw`V_u = ${sn1(i.Vu)}\ \text{kN} \le \tfrac{1}{2}\phi V_c = ${sn1(r.phiVc / 2)}\ \text{kN}`),
      ],
      note: 'Provide nominal stirrups in practice.',
    })
  } else if (r.region === 'minimum') {
    steps.push({
      title: 'Minimum stirrups',
      lines: [
        txt('Vu exceeds ½φVc but not φVc — minimum shear reinforcement applies (§409.6.3.3), with spacing capped at d/2 ≤ 600 mm (§409.7.6.2.2).'),
        eq(String.raw`A_v = ${legs}\cdot\tfrac{\pi}{4}d_s^2 = ${sn0(r.Av)}\ \text{mm}^2,\quad s_{max} = \min(d/2,\,600) = ${sn0(r.sMax)}\ \text{mm}`),
      ],
      note: `Provide ⌀${i.stirrupDia} mm, ${legs}-leg stirrups @ ${sn0(r.sAdopt)} mm.`,
    })
  } else if (r.region === 'designed') {
    steps.push({
      title: 'Stirrup design',
      lines: [
        txt('Vu exceeds φVc — design stirrups for Vs = Vu/φ − Vc (§422.5.10.5.3). The spacing cap halves once Vs exceeds ⅓√f′c·b·d (§409.7.6.2.2).'),
        eq(String.raw`V_s = \tfrac{V_u}{\phi} - V_c = \tfrac{${sn1(i.Vu)}}{0.75} - ${sn1(r.Vc)} = ${sn1(r.VsReq)}\ \text{kN} \;(\le V_{s,max} = \tfrac{2}{3}\sqrt{f'_c}\,bd = ${sn1(r.VsMax)})`),
        eq(String.raw`s = \dfrac{A_v f_{yt} d}{V_s} = \dfrac{${sn0(r.Av)}(${sn0(fyt)})(${sn1(d)})}{${sn1(r.VsReq)}\times 10^3} = ${sn0(r.sReq)}\ \text{mm},\quad s_{max} = ${sn0(r.sMax)}\ \text{mm}`),
      ],
      note: `Provide ⌀${i.stirrupDia} mm, ${legs}-leg stirrups @ ${sn0(r.sAdopt)} mm.`,
    })
  } else {
    steps.push({
      title: 'Section check (shear)',
      lines: [
        txt('The required Vs exceeds the §422.5.1.2 ceiling — the cross-section itself is too small for the shear; no amount of stirrups fixes it.'),
        eq(String.raw`V_s = ${sn1(r.VsReq)}\ \text{kN} > V_{s,max} = \tfrac{2}{3}\sqrt{f'_c}\,b d = ${sn1(r.VsMax)}\ \text{kN}`),
      ],
      note: 'Increase b, d, or f′c.',
    })
  }

  return steps
}
