// Worked solution for the beam design — mirrors engine/beamDesign.ts.
import type { BeamDesignInput, BeamDesignResult } from '../engine/beamDesign'
import { type SolutionStep, sn0, sn1, sn3, sn4 } from './solution'

export function buildBeamSolution(i: BeamDesignInput, r: BeamDesignResult): SolutionStep[] {
  const fyt = i.fyt ?? i.fy
  const legs = i.legs ?? 2
  const d = r.d
  const Rn = (i.Mu * 1e6) / (0.9 * i.b * d * d)
  const Ab = (Math.PI / 4) * i.barDia * i.barDia

  const steps: SolutionStep[] = []

  steps.push({
    title: 'Effective depth',
    lines: [{
      tex: String.raw`d = h - cover - d_{s} - \tfrac{d_b}{2} = ${sn0(i.h)} - ${sn0(i.cover)} - ${sn0(i.stirrupDia)} - ${sn1(i.barDia / 2)} = \mathbf{${sn1(d)}}\ \text{mm}`,
    }],
  })

  steps.push({
    title: 'Flexural reinforcement',
    lines: [
      { tex: String.raw`R_n = \dfrac{M_u}{\phi b d^2} = \dfrac{${sn0(i.Mu)}\times 10^6}{0.9(${sn0(i.b)})(${sn1(d)})^2} = ${sn3(Rn)}\ \text{MPa}` },
      { tex: String.raw`\rho = \tfrac{0.85 f'_c}{f_y}\!\left(1-\sqrt{1-\tfrac{2R_n}{0.85 f'_c}}\right) = ${sn4(r.rho)}` },
      { tex: String.raw`\rho_{min} = ${sn4(r.rhoMin)},\quad \rho_{max} = ${sn4(r.rhoMax)}\ (\varepsilon_t = 0.005)` },
      { tex: String.raw`A_s = \rho b d = ${sn0(r.As)}\ \text{mm}^2` },
    ],
    note: (r.usedMin ? 'ρ_min governs. ' : '') +
      (r.tensionControlled ? 'ρ ≤ ρ_max → tension-controlled (φ = 0.90).' : 'ρ > ρ_max — section is not tension-controlled; enlarge it or add compression steel.'),
  })

  steps.push({
    title: 'Bar selection',
    lines: [
      { tex: String.raw`A_b = \tfrac{\pi}{4}d_b^2 = ${sn0(Ab)}\ \text{mm}^2,\quad n = \lceil A_s/A_b \rceil = ${r.bars}` },
      { tex: String.raw`\text{clear spacing} = \dfrac{b - 2(cover+d_s) - n d_b}{n-1} = ${sn0(r.barSpacing)}\ \text{mm}` },
    ],
    note: `Provide ${r.bars} ⌀${i.barDia} mm tension bars.`,
  })

  steps.push({
    title: 'Shear strength of concrete',
    lines: [
      { tex: String.raw`V_c = \tfrac{1}{6}\lambda\sqrt{f'_c}\,b d = \tfrac{1}{6}\sqrt{${sn0(i.fc)}}(${sn0(i.b)})(${sn1(d)})/1000 = ${sn1(r.Vc)}\ \text{kN}` },
      { tex: String.raw`\phi V_c = 0.75 V_c = ${sn1(r.phiVc)}\ \text{kN},\quad \tfrac{1}{2}\phi V_c = ${sn1(r.phiVc / 2)}\ \text{kN}` },
    ],
  })

  if (r.region === 'none') {
    steps.push({
      title: 'Stirrup requirement',
      lines: [{ tex: String.raw`V_u = ${sn1(i.Vu)}\ \text{kN} \le \tfrac{1}{2}\phi V_c = ${sn1(r.phiVc / 2)}\ \text{kN}` }],
      note: 'No shear reinforcement required (provide nominal stirrups in practice).',
    })
  } else if (r.region === 'minimum') {
    steps.push({
      title: 'Minimum stirrups',
      lines: [
        { tex: String.raw`\tfrac{1}{2}\phi V_c < V_u = ${sn1(i.Vu)} \le \phi V_c = ${sn1(r.phiVc)}\ \text{kN}` },
        { tex: String.raw`A_v = ${legs}\cdot\tfrac{\pi}{4}d_s^2 = ${sn0(r.Av)}\ \text{mm}^2,\quad s_{max} = \min(d/2, 600) = ${sn0(r.sMax)}\ \text{mm}` },
      ],
      note: `Provide ⌀${i.stirrupDia} mm, ${legs}-leg stirrups @ ${sn0(r.sAdopt)} mm (minimum area governs).`,
    })
  } else if (r.region === 'designed') {
    steps.push({
      title: 'Stirrup design',
      lines: [
        { tex: String.raw`V_s = \tfrac{V_u}{\phi} - V_c = \tfrac{${sn1(i.Vu)}}{0.75} - ${sn1(r.Vc)} = ${sn1(r.VsReq)}\ \text{kN} \;(\le V_{s,max} = ${sn1(r.VsMax)})` },
        { tex: String.raw`A_v = ${legs}\cdot\tfrac{\pi}{4}d_s^2 = ${sn0(r.Av)}\ \text{mm}^2` },
        { tex: String.raw`s = \dfrac{A_v f_{yt} d}{V_s} = \dfrac{${sn0(r.Av)}(${sn0(fyt)})(${sn1(d)})}{${sn1(r.VsReq)}\times 10^3} = ${sn0(r.sReq)}\ \text{mm}` },
        { tex: String.raw`s_{max} = ${sn0(r.sMax)}\ \text{mm} \Rightarrow s_{adopt} = ${sn0(r.sAdopt)}\ \text{mm}` },
      ],
      note: `Provide ⌀${i.stirrupDia} mm, ${legs}-leg stirrups @ ${sn0(r.sAdopt)} mm.`,
    })
  } else {
    steps.push({
      title: 'Section check',
      lines: [
        { tex: String.raw`V_s = \tfrac{V_u}{\phi} - V_c = ${sn1(r.VsReq)}\ \text{kN} > V_{s,max} = \tfrac{2}{3}\sqrt{f'_c}\,b d = ${sn1(r.VsMax)}\ \text{kN}` },
      ],
      note: 'Section is inadequate for shear — increase b, d, or f′c.',
    })
  }

  return steps
}
