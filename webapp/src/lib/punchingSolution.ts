// Worked solution for two-way (punching) shear — ACI 318-14 §22.6.
// Mirrors engine/punchingShear.ts step for step: every equation is shown
// symbolically, then with the actual numbers substituted, then with its result
// and unit. Nothing is recomputed here — the values come from the engine
// result, so the sheet cannot disagree with the verdict printed above it.
import type { PunchingInput, PunchingResult } from '../engine/punchingShear'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

const POSITION_LABEL: Record<string, string> = {
  interior: 'Interior column — four faces contribute',
  edge: 'Edge column — c₁ parallel to the free edge',
  corner: 'Corner column — two faces contribute',
}

export function buildPunchingSolution(i: PunchingInput, r: PunchingResult): SolutionStep[] {
  const { c1, c2, d, fc, lambda } = i
  const sq = Math.sqrt(Math.max(fc, 1))
  const cMax = Math.max(c1, c2), cMin = Math.min(c1, c2)

  // b0·d in mm², and the kN conversion the engine applies (N → kN)
  const b0d = r.b0 * d

  const perimeterEq =
    i.position === 'interior'
      ? String.raw`b_0 = 2(c_1+d) + 2(c_2+d) = 2(${sn0(c1)}+${sn0(d)}) + 2(${sn0(c2)}+${sn0(d)}) = ${sn0(r.b0)}\ \text{mm}`
      : i.position === 'edge'
        ? String.raw`b_0 = 2\!\left(\tfrac{c_1}{2}+d\right) + (c_2+d) = 2(${sn0(c1 / 2)}+${sn0(d)}) + (${sn0(c2)}+${sn0(d)}) = ${sn0(r.b0)}\ \text{mm}`
        : String.raw`b_0 = \left(\tfrac{c_1}{2}+d\right) + \left(\tfrac{c_2}{2}+d\right) = (${sn0(c1 / 2)}+${sn0(d)}) + (${sn0(c2 / 2)}+${sn0(d)}) = ${sn0(r.b0)}\ \text{mm}`

  return [
    {
      title: 'Critical perimeter b₀',
      clause: 'ACI 318-14 §22.6.4.1',
      lines: [
        txt(`${POSITION_LABEL[i.position] ?? i.position}. The critical section is taken at d/2 from the column face, so each face of the perimeter is the column dimension plus one effective depth.`),
        eq(perimeterEq),
        eq(String.raw`b_0 d = ${sn0(r.b0)} \times ${sn0(d)} = ${sn0(b0d)}\ \text{mm}^2`),
      ],
    },
    {
      title: 'Shape and location factors',
      clause: 'ACI 318-14 §22.6.5.2',
      lines: [
        txt('βc is the ratio of long to short column side — a very elongated column concentrates shear at its corners, which is what the βc term penalises. αs depends on how many faces of the critical section are available to carry shear.'),
        eq(String.raw`\beta_c = \frac{\max(c_1,c_2)}{\min(c_1,c_2)} = \frac{${sn0(cMax)}}{${sn0(cMin)}} = ${sn2(r.betac)}`),
        eq(String.raw`\alpha_s = ${sn0(r.alphaS)}\quad(\text{${i.position}}),\qquad \lambda = ${sn2(lambda)},\qquad \sqrt{f'_c} = \sqrt{${sn0(fc)}} = ${sn3(sq)}\ \text{MPa}^{0.5}`),
      ],
    },
    {
      title: 'Concrete shear strength — three equations',
      clause: 'ACI 318-14 §22.6.5.2 (a)(b)(c)',
      lines: [
        txt('The code gives three expressions and the smallest governs. (a) penalises elongated columns, (b) penalises a thick slab against a small perimeter, and (c) is the plain upper bound.'),
        eq(String.raw`V_{c1} = \left(0.17 + \tfrac{0.33}{\beta_c}\right)\lambda\sqrt{f'_c}\,b_0 d = \left(0.17 + \tfrac{0.33}{${sn2(r.betac)}}\right)(${sn2(lambda)})(${sn3(sq)})(${sn0(b0d)})/10^3 = ${sn1(r.Vc1)}\ \text{kN}`),
        eq(String.raw`V_{c2} = \left(\tfrac{0.083\,\alpha_s d}{b_0} + 0.17\right)\lambda\sqrt{f'_c}\,b_0 d = \left(\tfrac{0.083(${sn0(r.alphaS)})(${sn0(d)})}{${sn0(r.b0)}} + 0.17\right)(${sn2(lambda)})(${sn3(sq)})(${sn0(b0d)})/10^3 = ${sn1(r.Vc2)}\ \text{kN}`),
        eq(String.raw`V_{c3} = 0.33\,\lambda\sqrt{f'_c}\,b_0 d = 0.33(${sn2(lambda)})(${sn3(sq)})(${sn0(b0d)})/10^3 = ${sn1(r.Vc3)}\ \text{kN}`),
        eq(String.raw`V_c = \min(V_{c1},V_{c2},V_{c3}) = \mathbf{${sn1(r.Vc)}}\ \text{kN}`),
      ],
      note: governingNote(r),
    },
    {
      title: 'Design check',
      clause: 'ACI 318-14 §21.2.1 · §22.6.1',
      pass: r.ok,
      lines: [
        txt('φ = 0.75 for shear. The connection is adequate when the factored column shear does not exceed the reduced concrete strength; otherwise the slab must be thickened, the column enlarged, or shear reinforcement (studs, shearheads) provided.'),
        eq(String.raw`\phi V_c = 0.75 \times ${sn1(r.Vc)} = ${sn1(r.phiVc)}\ \text{kN}`),
        eq(String.raw`\frac{V_u}{\phi V_c} = \frac{${sn1(i.Vu)}}{${sn1(r.phiVc)}} = ${sn2(r.ratio)} \;${r.ok ? '\\le' : '>'}\; 1.0 \Rightarrow \textbf{${r.ok ? 'OK' : 'FAILS'}}`),
      ],
    },
  ]
}

/** Which of the three equations governed, and what that means physically. */
function governingNote(r: PunchingResult): string {
  const m = Math.min(r.Vc1, r.Vc2, r.Vc3)
  if (m === r.Vc1) return 'Eq. (a) governs — the column aspect ratio is what limits the strength.'
  if (m === r.Vc2) return 'Eq. (b) governs — the slab is thick relative to the critical perimeter.'
  return 'Eq. (c) governs — the plain upper bound controls, the usual case for a squarish interior column.'
}
