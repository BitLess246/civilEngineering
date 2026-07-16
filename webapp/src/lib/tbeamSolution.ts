// Worked solution for the T-beam engine (engine/tbeam.ts).
import type { TBeamInput, TBeamResult } from '../engine/tbeam'
import { beta1 } from '../engine/tbeam'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function buildTBeamSolution(i: TBeamInput, r: TBeamResult): SolutionStep[] {
  const hog = i.Mu < 0
  const steps: SolutionStep[] = [
    {
      title: 'Effective flange width',
      clause: 'ACI 318-14 §6.3.2',
      pass: i.kind === 'isolated' ? r.isolatedOK : undefined,
      lines: [
        txt(`${i.kind} T-beam: ${r.bfGovern}.`),
        eq(String.raw`b_f = ${sn0(r.bf)}\ \text{mm},\qquad d_t = h - cover - d_s - \tfrac{d_b}{2} = ${sn1(r.dt)}\ \text{mm},\quad d = ${sn1(r.d)}\ \text{mm}`),
      ],
    },
    {
      title: hog ? 'Hogging — flange in tension, web rectangle resists' : 'Rectangular or T behaviour?',
      clause: 'ACI 318-14 §22.2',
      lines: hog ? [
        txt('Negative moment puts the flange in tension — compression lives in the web, so the section designs as a rectangle b = bw.'),
      ] : [
        txt('If the flange alone can supply the compression (a ≤ hf) the section behaves as a rectangle b = bf; otherwise the stress block enters the web.'),
        eq(String.raw`\phi M_{n,f} = 0.90(0.85 f'_c)\,b_f h_f (d - \tfrac{h_f}{2}) = ${sn1(r.MnfPhi)}\ \text{kN·m}\ ${Math.abs(i.Mu) <= r.MnfPhi ? String.raw`\ge M_u \Rightarrow \text{rectangular}` : String.raw`< M_u \Rightarrow \textbf{true T}`}`),
      ],
    },
  ]
  if (!hog && r.tBehavior) steps.push({
    title: 'Two-couple split (true T)',
    clause: 'flange couple + web',
    lines: [
      eq(String.raw`A_{sf} = \dfrac{0.85 f'_c (b_f - b_w) h_f}{f_y} = ${sn0(r.Asf)}\ \text{mm}^2`),
      eq(String.raw`A_{sw} = ${sn0(r.Asw)}\ \text{mm}^2\ (\text{web rectangle for } M_u - M_{uf})`),
    ],
  })
  steps.push(
    {
      title: 'Steel area and minimum',
      clause: 'ACI 318-14 §9.6.1.2',
      pass: r.As <= r.AsMax + 1e-9,
      lines: [
        eq(String.raw`A_{s,min} = \dfrac{\max(0.25\sqrt{f'_c},\ 1.4)}{f_y}\, b_w d = ${sn0(r.AsMin)}\ \text{mm}^2${r.minGoverns ? String.raw`\ \Rightarrow\ \text{governs}` : ''}`),
        eq(String.raw`A_s = ${sn0(r.As)}\ \text{mm}^2 \;\le\; A_{s,max}(\varepsilon_t = 0.005) = ${sn0(r.AsMax)}\ \text{mm}^2\ ${r.As <= r.AsMax ? '\\checkmark' : '\\times'}`),
        eq(String.raw`n = ${r.bars}\ \text{–}\ \varnothing${i.barDia}\ (\text{layers } [${r.layers.join(', ')}]),\quad s_{clear} = ${sn0(r.sClear)} \ge ${sn0(r.sClearMin)}\ \text{mm}`),
      ],
    },
    {
      title: 'Design strength at the provided steel',
      clause: 'ACI 318-14 §21.2.2',
      pass: r.ok,
      lines: [
        eq(String.raw`a = ${sn1(r.a)}\ \text{mm}\ (${r.tBehavior ? 'a > h_f' : 'a \\le h_f'}),\quad c = a/\beta_1 = ${sn1(r.c)}\ \text{mm}\ (\beta_1 = ${sn2(beta1(i.fc))})`),
        eq(String.raw`\varepsilon_t = 0.003\,\tfrac{d_t - c}{c} = ${sn4(r.et)} \Rightarrow \phi = ${sn2(r.phi)}`),
        eq(String.raw`\phi M_n = ${sn1(r.phiMn)}\ \text{kN·m}\ ${r.phiMn >= Math.abs(i.Mu) ? '\\ge' : '<'}\ M_u = ${sn1(Math.abs(i.Mu))}\ \text{kN·m}\ ${r.ok ? '\\checkmark' : '\\times'}`),
      ],
      note: r.notes.join(' · ') || undefined,
    },
  )
  return steps
}
