// Worked solution for a laterally loaded pile — Broms ultimate capacity plus a
// p–y beam-on-nonlinear-springs analysis. Mirrors engine/lateralPile.ts.
//
// The sheet answers two different questions and keeps them apart, because
// conflating them is the classic error here:
//
//  • BROMS gives the ULTIMATE lateral load. It is a strength check, and the
//    governing capacity is the LOWER of the short-pile (soil crushes) and
//    long-pile (a plastic hinge forms) mechanisms. Which one wins is what makes
//    a pile "short" or "long" — that is a verdict about the pile's stiffness
//    relative to the soil, not a statement about its length in metres.
//
//  • p–y gives the SERVICEABILITY answer — how far the head moves and where the
//    maximum moment sits. Broms cannot give either, and a pile that satisfies
//    Broms comfortably can still be unserviceable on deflection.
import type { BromsResult, PyResult, PileHead } from '../engine/lateralPile'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export interface LateralPileSolutionInput {
  soilKind: 'clay' | 'sand'
  L: number; D: number; EI: number; My: number
  H: number; e: number; head: PileHead
  cu: number; e50: number
  phiDeg: number; k: number; gamma: number
  /** Head-deflection yardstick the p–y result is judged against, mm. */
  yLimit?: number
}

export function buildLateralPileSolution(
  i: LateralPileSolutionInput, broms: BromsResult, py: PyResult,
): SolutionStep[] {
  const yLimit = i.yLimit ?? 25
  const clay = i.soilKind === 'clay'
  const util = broms.Hu > 0 ? i.H / broms.Hu : Infinity
  const capOK = util <= 1
  const defOK = py.yHead <= yLimit
  const Kp = Math.tan(((45 + i.phiDeg / 2) * Math.PI) / 180) ** 2
  const eEff = i.head === 'free' ? i.e : 0

  const steps: SolutionStep[] = [
    {
      title: 'Pile, load and soil',
      clause: 'Broms (1964) · API RP 2A-WSD §6.8',
      lines: [
        txt(`The pile is loaded laterally at ${i.e > 0 ? 'an eccentricity above ground' : 'ground level'} with a ${i.head} head. Head fixity matters more than almost any other input: restraining the head against rotation roughly doubles the ultimate capacity and cuts the deflection several-fold, but it moves the maximum moment to the head, where the cap connection has to carry it.`),
        eq(String.raw`L = ${sn2(i.L)}\ \text{m},\qquad D = ${sn2(i.D)}\ \text{m},\qquad EI = ${sn0(i.EI)}\ \text{kN·m}^2,\qquad M_y = ${sn1(i.My)}\ \text{kN·m}`),
        eq(String.raw`H = ${sn1(i.H)}\ \text{kN},\qquad e = ${sn2(i.e)}\ \text{m},\qquad \text{head: ${i.head}}`),
        clay
          ? eq(String.raw`\text{cohesive: } c_u = ${sn1(i.cu)}\ \text{kPa},\qquad \varepsilon_{50} = ${sn3(i.e50)},\qquad \gamma' = ${sn1(i.gamma)}\ \text{kN/m}^3`)
          : eq(String.raw`\text{cohesionless: } \phi = ${sn1(i.phiDeg)}^\circ,\qquad k = ${sn0(i.k)}\ \text{kN/m}^3,\qquad \gamma' = ${sn1(i.gamma)}\ \text{kN/m}^3`),
      ],
    },
    clay
      ? {
        title: 'Soil resistance profile — cohesive',
        clause: 'Broms (1964a) — cohesive soils',
        lines: [
          txt('Broms takes the ultimate soil resistance in clay as 9·cu·d, constant with depth, and neglects it over the top 1.5 diameters where the ground heaves and gaps open behind the pile. That truncated top is why a short pile in clay is less efficient than the full length suggests.'),
          eq(String.raw`q_u = 9\,c_u\,d = 9(${sn1(i.cu)})(${sn2(i.D)}) = ${sn1(9 * i.cu * i.D)}\ \text{kN/m}`),
          eq(String.raw`\text{ignored depth } a = 1.5d = ${sn2(1.5 * i.D)}\ \text{m}`),
        ],
      }
      : {
        title: 'Soil resistance profile — cohesionless',
        clause: 'Broms (1964b) — cohesionless soils',
        lines: [
          txt('In sand the resistance grows linearly with depth as 3·Kp·γ′·z·d — three times the Rankine passive pressure, Broms\u2019 allowance for the three-dimensional wedge that forms in front of a pile rather than a wall.'),
          eq(String.raw`K_p = \tan^2\!\left(45^\circ + \tfrac{\phi}{2}\right) = \tan^2\!\left(45^\circ + \tfrac{${sn1(i.phiDeg)}^\circ}{2}\right) = ${sn3(Kp)}`),
          eq(String.raw`p_u(z) = 3K_p\,\gamma'\,z\,d = 3(${sn3(Kp)})(${sn1(i.gamma)})(z)(${sn2(i.D)})\ \text{kN/m}`),
        ],
      },
    {
      title: 'Short-pile mechanism — soil governs',
      clause: 'Broms (1964) — rigid rotation',
      lines: [
        txt('A stiff pile in weak soil rotates as a rigid body and fails when the soil ahead of it is fully mobilised. The pile itself never yields, so its section strength is irrelevant to this mechanism — only the soil and the embedded length matter.'),
        clay
          ? eq(String.raw`H_{u,short} = ${sn1(broms.shortPile)}\ \text{kN}\quad\text{(moment equilibrium about the ${i.head === 'fixed' ? 'toe, pure translation' : 'point of rotation'})}`)
          : eq(String.raw`H_{u,short} = ${i.head === 'fixed' ? String.raw`1.5K_p\gamma' dL^2` : String.raw`\frac{0.5K_p\gamma' dL^3}{e + L}`} = ${sn1(broms.shortPile)}\ \text{kN}`),
      ],
    },
    {
      title: 'Long-pile mechanism — a hinge forms',
      clause: 'Broms (1964) — plastic hinge',
      lines: [
        txt(`A flexible pile in strong soil does not rotate bodily; the moment builds until the section yields and a plastic hinge forms at the depth where the shear passes through zero. Here the section strength My governs and extra length buys nothing.${i.head === 'fixed' ? ' A fixed head needs two hinges — one at the head, one in the ground — hence the factor of 2 on My.' : ''}`),
        eq(String.raw`\text{hinge at } z = ${sn2(broms.zMax)}\ \text{m below ground},\qquad M_{max} = ${sn1(broms.Mmax)}\ \text{kN·m}`),
        eq(String.raw`H_{u,long} = ${Number.isFinite(broms.longPile) ? `${sn1(broms.longPile)}\\ \\text{kN}` : '\\infty'}\quad\text{from } M(H) = ${i.head === 'fixed' ? '2' : '1'}\,M_y = ${sn1((i.head === 'fixed' ? 2 : 1) * i.My)}\ \text{kN·m}`),
      ],
    },
    {
      title: 'Governing capacity',
      clause: 'Broms (1964) — lower-bound mechanism',
      pass: capOK,
      lines: [
        txt(`The pile fails by whichever mechanism needs the smaller load, so the capacity is the lower of the two. This one is a ${broms.mode.toUpperCase()} pile: ${broms.mode === 'short' ? 'the soil yields before the section does, so strengthening the section will not help — lengthen it or improve the ground.' : 'the section yields before the soil does, so lengthening the pile will not help — a stronger section will.'}`),
        eq(String.raw`H_u = \min(${sn1(broms.shortPile)},\ ${Number.isFinite(broms.longPile) ? sn1(broms.longPile) : '\\infty'}) = \mathbf{${sn1(broms.Hu)}}\ \text{kN}\quad(\text{${broms.mode} pile})`),
        eq(String.raw`\frac{H}{H_u} = \frac{${sn1(i.H)}}{${sn1(broms.Hu)}} = ${sn3(util)} \;${capOK ? '\\le' : '>'}\; 1 \Rightarrow \textbf{${capOK ? 'OK' : 'OVERLOADED'}}`),
      ],
      note: 'Broms is an ULTIMATE capacity with no factor of safety built in. Apply the project global factor (commonly 2–3 on the ultimate lateral load) or check against factored actions.',
    },
    {
      title: 'p–y analysis — deflection and moment',
      clause: `${clay ? 'Matlock (1970) soft clay' : 'API RP 2A-WSD §6.8 sand'} p–y curves`,
      pass: defOK,
      lines: [
        txt('The pile is now modelled as a beam on nonlinear soil springs and solved by Newton iteration. This is the serviceability answer: Broms says what fails it, p–y says how far it moves and where the design moment actually sits, which is rarely at the ground surface.'),
        eq(String.raw`EI\frac{d^4y}{dz^4} + p(y,z) = 0,\qquad \text{${sn0(py.stations.length)} stations over } ${sn2(i.L)}\ \text{m},\qquad e_{eff} = ${sn2(eEff)}\ \text{m}`),
        eq(String.raw`y_{head} = \mathbf{${sn2(py.yHead)}}\ \text{mm},\qquad M_{max} = \mathbf{${sn1(py.Mmax)}}\ \text{kN·m at } z = ${sn2(py.zMmax)}\ \text{m}`),
        eq(String.raw`${sn2(py.yHead)} \;${defOK ? '\\le' : '>'}\; ${sn0(yLimit)}\ \text{mm} \Rightarrow \textbf{${defOK ? 'OK' : 'EXCEEDS THE DEFLECTION YARDSTICK'}}`),
        eq(String.raw`\text{Newton: } ${py.converged ? 'converged' : '\\textbf{DID NOT CONVERGE}'}\ \text{in } ${sn0(py.iterations)}\ \text{iterations, residual } ${py.residual.toExponential(1)}`),
      ],
      note: py.converged
        ? `${yLimit} mm is a common serviceability yardstick, not a code limit — the tolerable head movement is a project decision set by what the pile supports.`
        : 'The p–y solve did not converge: the deflection and moment above are the last iterate, not a solution. Reduce the load or refine the discretisation before using them.',
    },
    {
      title: 'Section moment demand',
      clause: 'Broms (1964) vs p–y — moment comparison',
      lines: [
        txt('The two methods give moments for different load levels — Broms at the ultimate load Hu, p–y at the applied load H — so they are not interchangeable. Design the section for the p–y moment at the factored load, and check that it still exceeds My only where a hinge is intended.'),
        eq(String.raw`M_{max}^{p-y}(H = ${sn1(i.H)}\ \text{kN}) = ${sn1(py.Mmax)}\ \text{kN·m}\quad\text{vs}\quad M_y = ${sn1(i.My)}\ \text{kN·m}`),
        eq(String.raw`\frac{M_{max}}{M_y} = ${i.My > 0 ? sn3(py.Mmax / i.My) : '\\infty'}\quad${i.My > 0 && py.Mmax > i.My ? String.raw`\Rightarrow \text{the section has already yielded at the service load}` : String.raw`\Rightarrow \text{elastic at this load}`}`),
      ],
    },
  ]

  return steps
}
