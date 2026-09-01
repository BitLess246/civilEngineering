// Worked solution for the T-beam engine (engine/tbeam.ts).
import type { TBeamInput, TBeamResult } from '../engine/tbeam'
import { beta1 } from '../engine/tbeam'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn4 } from './solution'

/** A coefficient in the equilibrium quadratic, as the worked solution writes
 *  it: plain below 10⁴, otherwise a 3-figure mantissa × 10ⁿ. Raw, they run to
 *  ten digits and the equation stops being readable. */
const sci = (v: number): string => {
  if (Math.abs(v) < 1e4) return v.toFixed(1)
  const e = Math.floor(Math.log10(Math.abs(v)))
  return String.raw`${(v / 10 ** e).toFixed(3)} \times 10^{${e}}`
}

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function buildTBeamSolution(i: TBeamInput, r: TBeamResult): SolutionStep[] {
  const hog = i.Mu < 0
  // Steel the capacity was actually computed on — the detailed cage, or the
  // area handed in for an analyze run.
  const AsProv = i.AsGiven && i.AsGiven > 0 ? i.AsGiven : r.bars * (Math.PI / 4) * i.barDia ** 2
  const webCapped = r.notes.some((n) => n.includes('singly-reinforced'))
  // Radicand collapsed — the reported block is the tension-controlled ceiling,
  // not a depth that solves the moment. Sagging and hogging both land here.
  const blockCapped = webCapped || r.notes.some((n) => n.includes('hogging moment'))
  // Which branch the DESIGN took, not which one the provided bars end up in:
  // `Asf` is written only by the true-T branch, so it is the exact marker. The
  // two can disagree at the boundary, because rounding the bar count up pushes
  // the delivered block a little deeper than the one the moment asked for.
  const analyze = !!(i.AsGiven && i.AsGiven > 0)
  const MuAbs = Math.abs(i.Mu)
  const trueTDesign = !hog && r.Asf > 0
  // Fixed couple the spent overhangs contribute, φ·Asf·fy·(d − hf/2).
  const Muf = (0.90 * r.Asf * i.fy * (r.d - i.hf / 2)) / 1e6
  // Width of the concrete the block grows into, and the moment it must carry.
  const bDes = trueTDesign || hog ? i.bw : r.bf
  const bDesLbl = trueTDesign || hog ? 'b_w' : 'b_f'
  const MuDes = trueTDesign ? MuAbs - Muf : MuAbs
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
      // A REAL T-BEAM IS AN OUTCOME, NOT A FAILURE. This step decides which of
      // two geometries the section has; both are valid, so it is marked as a
      // check that RESOLVED. Reading "true T" as a red mark is what made a
      // perfectly ordinary flanged beam look like a failed one.
      title: hog ? 'Hogging — flange in tension, web rectangle resists'
        : analyze ? `Real T-beam check — ${r.tBehavior ? 'TRUE T-BEAM' : 'rectangular (a ≤ hf)'}`
          : 'Rectangular or T behaviour?',
      clause: 'ACI 318-14 §22.2 / NSCP §422.2',
      pass: hog ? undefined : true,
      lines: hog ? [
        txt('Negative moment puts the flange in tension — compression lives in the web, so the section designs as a rectangle b = bw.'),
      ] : analyze ? [
        // ANALYSING a given As: the moment is not what sets the block — the
        // steel is. Comparing Mu against the flange couple here would answer a
        // question nobody asked, and it contradicted the equilibrium below
        // whenever the two disagreed.
        txt('The steel is given, so the block is whatever balances it — the moment plays no part. Take C = T with the steel at yield and read off the concrete area it needs; if that is more than the flange holds, the block must push into the web and the section is a REAL T-beam.'),
        eq(String.raw`0.85 f'_c A_{conc} = A_s f_y \;\Rightarrow\; A_{conc} = \dfrac{${sn0(AsProv)}(${sn0(i.fy)})}{0.85(${sn0(i.fc)})} = ${sn2(AsProv * i.fy / (0.85 * i.fc))}\ \text{mm}^2`),
        eq(String.raw`A_{conc} = ${sn2(AsProv * i.fy / (0.85 * i.fc))} \;${r.tBehavior ? '>' : '\\le'}\; b_f h_f = ${sn0(r.bf * i.hf)}\ \text{mm}^2 \;\Rightarrow\; ${r.tBehavior ? String.raw`\textbf{real T-beam}\ \checkmark` : String.raw`\text{rectangular, } b = b_f`}`),
      ] : [
        txt('The compression block is what grows with the moment, and it spends the widest concrete first: while it is no deeper than hf the section is a plain rectangle of width bf. Only when the flange is used up does the block push into the narrow web.'),
        eq(String.raw`\phi M_{n,f} = 0.90(0.85 f'_c)\,b_f h_f (d - \tfrac{h_f}{2}) = ${sn1(r.MnfPhi)}\ \text{kN·m}\ ${Math.abs(i.Mu) <= r.MnfPhi ? String.raw`\ge M_u \Rightarrow \text{block stays in the flange}` : String.raw`< M_u \Rightarrow \textbf{true T}`}`),
        txt(`— the moment the flange can carry with the block exactly filling it (a = hf). Mu = ${sn1(Math.abs(i.Mu))} kN·m is ${Math.abs(i.Mu) <= r.MnfPhi ? 'below' : 'above'} it.`),
      ],
    },
  ]
  if (trueTDesign) steps.push({
    title: 'Two-couple split (true T) — the overhangs are spent',
    clause: 'ACI 318-14 §22.2 / flange couple + web',
    lines: [
      txt('Past a = hf the overhangs are fully stressed and cannot give any more, so their contribution is a FIXED couple. Whatever moment is left over is the web block\u2019s job, and it is the web block that keeps growing from here.'),
      eq(String.raw`A_{sf} = \dfrac{0.85 f'_c (b_f - b_w) h_f}{f_y} = ${sn0(r.Asf)}\ \text{mm}^2`),
      eq(String.raw`M_{uf} = \phi A_{sf} f_y (d - \tfrac{h_f}{2}) = ${sn1(Muf)}\ \text{kN·m}`),
      eq(String.raw`M_{uw} = M_u - M_{uf} = ${sn1(MuAbs)} - ${sn1(Muf)} = ${sn1(MuDes)}\ \text{kN·m}`),
    ],
  })
  if (!analyze) steps.push({
    title: `Required depth of the compression block — a from ${trueTDesign ? 'Muw' : 'Mu'}`,
    clause: 'ACI 318-14 §22.2.2.4.1',
    pass: !blockCapped && r.aReq <= r.aMax + 1e-9,
    lines: [
      txt('The block is the unknown the moment fixes; the steel is what follows from it. Taking moments about the tension steel for a compression zone of width b gives a quadratic in a:'),
      eq(String.raw`\phi\,(0.85 f'_c)\, ${bDesLbl}\, a \left(d - \tfrac{a}{2}\right) = M_{u${trueTDesign ? 'w' : ''}}`),
      eq(String.raw`a^2 - 2 d\,a + \dfrac{2 M_{u${trueTDesign ? 'w' : ''}}}{\phi (0.85 f'_c) ${bDesLbl}} = 0 \;\Longrightarrow\; a = d - \sqrt{d^2 - \dfrac{2 M_{u${trueTDesign ? 'w' : ''}}}{0.90(0.85 f'_c) ${bDesLbl}}}`),
      eq(String.raw`a = ${sn1(r.d)} - \sqrt{${sn1(r.d)}^2 - \dfrac{2(${sn1(MuDes)} \times 10^6)}{0.90(0.85 \times ${sn0(i.fc)})(${sn0(bDes)})}} = ${sn1(r.aReq)}\ \text{mm}`),
      eq(String.raw`a_{req} = ${sn1(r.aReq)} \;${r.aReq <= r.aMax ? '\\le' : '>'}\; a_{max} = \beta_1\,\tfrac{3}{8} d_t = ${sn1(r.aMax)}\ \text{mm}\ ${r.aReq <= r.aMax ? '\\checkmark' : '\\times\\ (\\varepsilon_t < 0.005)'}`),
      ...(blockCapped ? [txt('The radicand is negative here — no singly-reinforced block of this width can reach the moment at this depth, so a is shown at the tension-controlled ceiling and the steel at As,max rather than at values the section cannot reach. Enlarge the web, deepen the section, or add compression steel.')] : []),
    ],
  })
  steps.push(
    {
      title: 'Steel area and minimum',
      clause: 'ACI 318-14 §22.2 / §9.6.1.2',
      // The cap applies to the steel that gets BUILT, not to the demand — a
      // section can need less than AsMax and still be over-reinforced once the
      // bar count is rounded up and the lone-bar pairing adds one.
      pass: AsProv <= r.AsMax + 1e-9,
      lines: [
        ...(analyze ? [] : [
          txt('Now force equilibrium, C = T, converts that block into steel — the steel area is a consequence of the block, not the other way round.'),
          ...(trueTDesign
            ? [eq(String.raw`A_{sw} = \dfrac{0.85 f'_c\, b_w\, a_{req}}{f_y} = \dfrac{0.85(${sn0(i.fc)})(${sn0(i.bw)})(${sn1(r.aReq)})}{${sn0(i.fy)}} = ${sn0(r.Asw)}\ \text{mm}^2`),
               eq(String.raw`A_s = A_{sf} + A_{sw} = ${sn0(r.Asf)} + ${sn0(r.Asw)} = ${sn0(r.Asf + r.Asw)}\ \text{mm}^2`)]
            : [eq(String.raw`A_s = \dfrac{0.85 f'_c\, ${bDesLbl}\, a_{req}}{f_y} = \dfrac{0.85(${sn0(i.fc)})(${sn0(bDes)})(${sn1(r.aReq)})}{${sn0(i.fy)}} = ${sn0((0.85 * i.fc * bDes * r.aReq) / i.fy)}\ \text{mm}^2`)]),
        ]),
        eq(String.raw`A_{s,min} = \dfrac{\max(0.25\sqrt{f'_c},\ 1.4)}{f_y}\, b_w d = ${sn0(r.AsMin)}\ \text{mm}^2${r.minGoverns ? String.raw`\ \Rightarrow\ \text{governs}` : ''}`),
        eq(String.raw`A_{s,req} = \max(A_s,\ A_{s,min}) = ${sn0(r.As)}\ \text{mm}^2`),
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
  // The block the YIELD assumption gives — the answer when the steel does
  // reach fy, and the line that gets crossed out when it does not.
  const tr = r.fsTrial ?? { a: r.a, c: r.c, fs: r.fs }
  const trT = tr.a > i.hf
  const bComp2 = hog ? i.bw : r.bf
  const Ctrial = trT
    ? 0.85 * i.fc * ((bComp2 - i.bw) * i.hf + i.bw * tr.a)
    : 0.85 * i.fc * bComp2 * tr.a
  const Es = 200000, ecu = 0.003
  steps.push(
    {
      title: 'Block depth, assuming the steel yields',
      clause: 'ACI 318-14 §22.2.2.4',
      lines: [
        txt(analyze
          ? 'Take fs = fy for now — an ASSUMPTION, checked in the next step. Horizontal equilibrium C = T then fixes the block; which concrete area supplies C is the only difference between the two cases.'
          : `Rounding up to whole bars gives more steel than the moment asked for, so the block the built section develops is a little deeper than a,req = ${sn1(r.aReq)} mm. Take fs = fy for now — an ASSUMPTION, checked in the next step.`),
        eq(String.raw`T = A_{s,prov} f_y = ${sn0(AsProv)} \times ${sn0(i.fy)} = ${sn1((AsProv * i.fy) / 1e3)}\ \text{kN}`),
        ...(trT ? [
          txt('The flange alone cannot supply C, so the overhangs are fully stressed over their whole depth hf and only the web carries the remainder:'),
          eq(String.raw`C = \underbrace{0.85 f'_c (b_f - b_w) h_f}_{\text{overhangs, full}} + \underbrace{0.85 f'_c\, b_w\, a}_{\text{web}} = T`),
          eq(String.raw`a = \dfrac{T - 0.85 f'_c (b_f - b_w) h_f}{0.85 f'_c\, b_w} = ${sn1(tr.a)}\ \text{mm} \;>\; h_f = ${sn0(i.hf)}\ \text{mm}`),
        ] : [
          txt(hog
            ? `The flange is in tension, so the compression zone is the web alone — a plain rectangle of width b = bw = ${sn0(i.bw)} mm.`
            : `The block stays inside the flange, so the compression zone is a plain rectangle of width b = bf = ${sn0(r.bf)} mm.`),
          eq(String.raw`C = 0.85 f'_c\, b\, a = T \;\Rightarrow\; a = \dfrac{T}{0.85 f'_c\, b} = ${sn1(tr.a)}\ \text{mm}${hog ? '' : String.raw` \;\le\; h_f = ${sn0(i.hf)}\ \text{mm}`}`),
        ]),
        eq(String.raw`\text{check: } C = ${sn1(Ctrial / 1e3)}\ \text{kN} = T = ${sn1((AsProv * i.fy) / 1e3)}\ \text{kN}\ \checkmark`),
        eq(String.raw`c = a/\beta_1 = ${sn1(tr.a)}/${sn2(beta1(i.fc))} = ${sn1(tr.c)}\ \text{mm}`),
      ],
    },
    {
      title: 'Stress check — does the steel actually reach fy?',
      clause: 'ACI 318-14 §22.2.1.2',
      pass: r.fsYields,
      lines: [
        txt('Strain is linear across the depth, so where the neutral axis landed decides the steel stress. The assumption above only stands if it comes back at or above fy — and a heavily reinforced section is exactly where it does not.'),
        eq(String.raw`f_s = E_s \varepsilon_{cu} \dfrac{d - c}{c} = ${sn0(Es * ecu)}\left(\dfrac{${sn1(r.d)} - ${sn1(tr.c)}}{${sn1(tr.c)}}\right) = ${sn1(tr.fs)}\ \text{MPa}`),
        eq(String.raw`f_s = ${sn1(tr.fs)} \;${r.fsYields ? '\\ge' : '<'}\; f_y = ${sn0(i.fy)}\ \text{MPa}\ ${r.fsYields
          ? String.raw`\checkmark\ \text{the steel yields — the block above stands}`
          : String.raw`\times\ \text{the steel does NOT yield}`}`),
      ],
    },
  )
  if (!r.fsYields) {
    const k = 0.85 * i.fc, b1v = beta1(i.fc), K = Es * ecu * AsProv
    const web = r.tBehavior
    const A2 = web ? k * b1v * i.bw : k * bComp2 * b1v
    const B2 = web ? k * i.hf * (bComp2 - i.bw) + K : K
    steps.push({
      title: 'Re-solve with fs on the strain diagram',
      clause: 'ACI 318-14 §22.2.1.2 / §22.2.2.4.1',
      lines: [
        txt('Put fs = Es·εcu(d − c)/c back into C = T. The unknown c now appears on both sides, and clearing the fraction leaves a quadratic — exact in one step, no iteration.'),
        eq(String.raw`0.85f'_c\left[${web ? String.raw`b_f h_f + (\beta_1 c - h_f) b_w` : String.raw`b_f \beta_1 c`}\right] = A_s\, E_s \varepsilon_{cu} \dfrac{d - c}{c}`),
        eq(String.raw`${sci(A2)}\,c^2 + ${sci(B2)}\,c - ${sci(K * r.d)} = 0 \;\Longrightarrow\; c = ${sn1(r.c)}\ \text{mm}`),
        eq(String.raw`a = \beta_1 c = ${sn2(b1v)}(${sn1(r.c)}) = ${sn1(r.a)}\ \text{mm},\qquad f_s = ${sn0(Es * ecu)}\left(\dfrac{${sn1(r.d)} - ${sn1(r.c)}}{${sn1(r.c)}}\right) = ${sn1(r.fs)}\ \text{MPa}`),
        txt(`The block is shallower than the yield assumption gave (${sn1(r.a)} against ${sn1(tr.a)} mm), and the tension it balances is smaller — so the capacity is LOWER. Stopping at the assumption overstates it.`),
      ],
    })
  }
  steps.push(
    {
      title: 'Lever arm — centroid of the compression block',
      clause: 'Varignon / ACI 318-14 §22.2',
      lines: [
        txt(r.tBehavior
          ? 'The block is an inverted T of two rectangles — the full flange and the web strip below it — so the compressive resultant acts at their combined centroid, not at a/2.'
          : 'The block is a single rectangle, so its resultant acts at mid-depth.'),
        eq(String.raw`A_{conc} = ${r.tBehavior ? String.raw`b_f h_f + (a - h_f) b_w` : String.raw`b\,a`} = ${sn1(r.Aconc)}\ \text{mm}^2`),
        eq(String.raw`A_{conc}\,\bar{y} = \sum A_n y_n \;\Longrightarrow\; \bar{y} = ${sn1(r.yBar)}\ \text{mm}`),
        eq(String.raw`M_n = T\,(d - \bar{y}) = ${sn0(AsProv)}(${sn1(r.fs)})(${sn1(r.d)} - ${sn1(r.yBar)}) = ${sn1(r.Mn)}\ \text{kN·m}`),
      ],
    },
    {
      title: 'Design strength at the provided steel',
      clause: 'ACI 318-14 §21.2.2',
      pass: r.ok,
      lines: [
        eq(String.raw`\varepsilon_t = 0.003\,\tfrac{d_t - c}{c} = 0.003\left(\tfrac{${sn1(r.dt)} - ${sn1(r.c)}}{${sn1(r.c)}}\right) = ${sn4(r.et)} \Rightarrow \phi = ${sn2(r.phi)}${r.fsYields ? '' : String.raw`\ (\text{compression-controlled: } f_s < f_y)`}`),
        eq(String.raw`\phi M_n = ${sn2(r.phi)} \times ${sn1(r.Mn)} = ${sn1(r.phiMn)}\ \text{kN·m}\ ${r.phiMn >= Math.abs(i.Mu) ? '\\ge' : '<'}\ M_u = ${sn1(Math.abs(i.Mu))}\ \text{kN·m}\ ${r.ok ? '\\checkmark' : '\\times'}`),
      ],
      note: r.notes.join(' · ') || undefined,
    },
  )
  return steps
}
