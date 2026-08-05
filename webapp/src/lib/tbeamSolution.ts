// Worked solution for the T-beam engine (engine/tbeam.ts).
import type { TBeamInput, TBeamResult } from '../engine/tbeam'
import { beta1 } from '../engine/tbeam'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function buildTBeamSolution(i: TBeamInput, r: TBeamResult): SolutionStep[] {
  const hog = i.Mu < 0
  // Steel the capacity was actually computed on — the detailed cage, or the
  // area handed in for an analyze run.
  const AsProv = i.AsGiven && i.AsGiven > 0 ? i.AsGiven : r.bars * (Math.PI / 4) * i.barDia ** 2
  // C recomputed from the reported a, to show the equilibrium closing.
  const bComp = hog ? i.bw : r.bf
  const Ccheck = r.tBehavior
    ? 0.85 * i.fc * ((bComp - i.bw) * i.hf + i.bw * r.a)
    : 0.85 * i.fc * bComp * r.a
  const webCapped = r.notes.some((n) => n.includes('singly-reinforced'))
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
      eq(String.raw`A_{sw} = ${sn0(r.Asw)}\ \text{mm}^2\ ${webCapped
        ? String.raw`(\text{capped at } A_{s,max} - A_{sf}\text{ — see the note})`
        : String.raw`(\text{web rectangle for } M_u - M_{uf})`}`),
      ...(webCapped ? [txt('The web cannot carry Mu − Muf singly reinforced at any legal steel ratio, so Asw is shown at the tension-controlled ceiling rather than at a value the section cannot reach. Enlarge bw or h, or add compression steel.')] : []),
    ],
  })
  steps.push(
    {
      title: 'Steel area and minimum',
      clause: 'ACI 318-14 §9.6.1.2',
      // The cap applies to the steel that gets BUILT, not to the demand — a
      // section can need less than AsMax and still be over-reinforced once the
      // bar count is rounded up and the lone-bar pairing adds one.
      pass: AsProv <= r.AsMax + 1e-9,
      lines: [
        eq(String.raw`A_{s,min} = \dfrac{\max(0.25\sqrt{f'_c},\ 1.4)}{f_y}\, b_w d = ${sn0(r.AsMin)}\ \text{mm}^2${r.minGoverns ? String.raw`\ \Rightarrow\ \text{governs}` : ''}`),
        eq(String.raw`A_{s,req} = ${sn0(r.As)}\ \text{mm}^2`),
        eq(String.raw`n = ${r.bars}\ \text{–}\ \varnothing${i.barDia}\ (\text{layers } [${r.layers.join(', ')}]) \Rightarrow A_{s,prov} = ${sn0(AsProv)}\ \text{mm}^2,\quad s_{clear} = ${sn0(r.sClear)} \ge ${sn0(r.sClearMin)}\ \text{mm}`),
        eq(String.raw`A_{s,prov} = ${sn0(AsProv)} \;${AsProv <= r.AsMax ? '\\le' : '>'}\; A_{s,max}(\varepsilon_t = 0.005) = ${sn0(r.AsMax)}\ \text{mm}^2\ ${AsProv <= r.AsMax ? '\\checkmark' : '\\times'}`),
      ],
    },
  )
  if (r.layers.length > 1) steps.push({
    title: 'Effective depth of the stacked cage',
    clause: 'ACI 318-14 §25.2.2 / Varignon',
    lines: [
      txt(`The bars do not all fit in one layer, so the tension resultant acts at the centroid of the ${r.layers.length}-layer group, not at the extreme layer. Layers are pitched db + 25 mm apart.`),
      eq(String.raw`\bar{y} = \dfrac{\sum n_k\, y_k}{\sum n_k} = ${sn1(r.dt - r.d)}\ \text{mm},\qquad d = d_t - \bar{y} = ${sn1(r.dt)} - ${sn1(r.dt - r.d)} = ${sn1(r.d)}\ \text{mm}`),
      txt(`A smaller d demands more steel, which can add another bar and drop d again, so As and the layout are solved together — ${r.layerIters} pass${r.layerIters === 1 ? '' : 'es'} here. Every As above is the converged value, at this d.`),
    ],
  })
  steps.push(
    {
      title: 'Depth of the stress block a — from C = T',
      clause: 'ACI 318-14 §22.2.2.4',
      lines: [
        txt('a is not assumed; it is solved from horizontal equilibrium of the section, C = T. Which concrete area supplies C is the only difference between the two cases.'),
        eq(String.raw`T = A_{s,prov} f_y = ${sn0(AsProv)} \times ${sn0(i.fy)} = ${sn1((AsProv * i.fy) / 1e3)}\ \text{kN}`),
        ...(r.tBehavior ? [
          txt('The flange alone cannot supply C, so the overhangs are fully stressed over their whole depth hf and only the web carries the remainder:'),
          eq(String.raw`C = \underbrace{0.85 f'_c (b_f - b_w) h_f}_{\text{overhangs, full}} + \underbrace{0.85 f'_c\, b_w\, a}_{\text{web}} = T`),
          eq(String.raw`a = \dfrac{T - 0.85 f'_c (b_f - b_w) h_f}{0.85 f'_c\, b_w} = ${sn1(r.a)}\ \text{mm} \;>\; h_f = ${sn0(i.hf)}\ \text{mm}`),
        ] : [
          txt(hog
            ? `The flange is in tension, so the compression zone is the web alone — a plain rectangle of width b = bw = ${sn0(i.bw)} mm.`
            : `The block stays inside the flange, so the compression zone is a plain rectangle of width b = bf = ${sn0(r.bf)} mm.`),
          eq(String.raw`C = 0.85 f'_c\, b\, a = T \;\Rightarrow\; a = \dfrac{T}{0.85 f'_c\, b} = ${sn1(r.a)}\ \text{mm}${hog ? '' : String.raw` \;\le\; h_f = ${sn0(i.hf)}\ \text{mm}`}`),
        ]),
        eq(String.raw`\text{check: } C = ${sn1(Ccheck / 1e3)}\ \text{kN} = T = ${sn1((AsProv * i.fy) / 1e3)}\ \text{kN}\ \checkmark`),
      ],
    },
    {
      title: 'Design strength at the provided steel',
      clause: 'ACI 318-14 §21.2.2',
      pass: r.ok,
      lines: [
        eq(String.raw`c = a/\beta_1 = ${sn1(r.a)}/${sn2(beta1(i.fc))} = ${sn1(r.c)}\ \text{mm}`),
        eq(String.raw`\varepsilon_t = 0.003\,\tfrac{d_t - c}{c} = ${sn4(r.et)} \Rightarrow \phi = ${sn2(r.phi)}`),
        eq(String.raw`\phi M_n = ${sn1(r.phiMn)}\ \text{kN·m}\ ${r.phiMn >= Math.abs(i.Mu) ? '\\ge' : '<'}\ M_u = ${sn1(Math.abs(i.Mu))}\ \text{kN·m}\ ${r.ok ? '\\checkmark' : '\\times'}`),
      ],
      note: r.notes.join(' · ') || undefined,
    },
  )
  return steps
}
