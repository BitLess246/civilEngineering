// Detailed worked solution for the combined footing (rigid/conventional
// method) — provision-cited steps mirroring engine/combinedFooting.ts:
// loads → net bearing → plan geometry (CRF rectangle / CTF trapezoid sized so
// the soil resultant is concentric) → equivalent uniformly-varying line load
// with closed-form V(x), M(x) → thickness from punching + one-way shear →
// longitudinal and transverse flexure.
import type { CombinedFootingInput, CombinedFootingResult } from '../engine/combinedFooting'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })
const roundUp = (v: number, step: number) => Math.ceil(v / step) * step

export function buildCombinedFootingSolution(i: CombinedFootingInput, r: CombinedFootingResult): SolutionStep[] {
  const steps: SolutionStep[] = []
  const crf = r.shape[0] === 'R'
  const Pa1 = i.dl1 + i.ll1, Pa2 = i.dl2 + i.ll2

  // 1 — Loads
  steps.push({
    title: 'Service & factored column loads',
    lines: [
      txt('Each column carries its own service load P = D + L (for soil bearing) and factored load Pu = max(1.4D, 1.2D + 1.6L) for strength design (NSCP 2015 §203.3.1 / ACI 318-14 §5.3).'),
      eq(String.raw`P_{a1}=${sn0(i.dl1)}+${sn0(i.ll1)}=${sn1(Pa1)},\quad P_{a2}=${sn0(i.dl2)}+${sn0(i.ll2)}=${sn1(Pa2)}\ \text{kN}`),
      eq(String.raw`\sum P_a=\mathbf{${sn1(r.Pa)}}\ \text{kN}`),
      eq(String.raw`P_{u1}=\max(1.4\cdot${sn0(i.dl1)},\,1.2\cdot${sn0(i.dl1)}+1.6\cdot${sn0(i.ll1)})=\mathbf{${sn1(r.Pu1)}}\ \text{kN}`),
      eq(String.raw`P_{u2}=\max(1.4\cdot${sn0(i.dl2)},\,1.2\cdot${sn0(i.dl2)}+1.6\cdot${sn0(i.ll2)})=\mathbf{${sn1(r.Pu2)}},\quad \sum P_u=\mathbf{${sn1(r.Pu)}}\ \text{kN}`),
    ],
  })

  // 2 — Net bearing
  steps.push({
    title: 'Net allowable soil pressure',
    lines: [
      txt('Subtract the overburden (soil above the footing) and the footing self-weight from the allowable bearing, with a trial thickness Dc = 0.25 m.'),
      eq(String.raw`q_{net}=q_a-\gamma_s(H-D_c)-\gamma_c D_c-q_{sur}`),
      eq(String.raw`q_{net}=${sn0(i.qAllow)}-${sn0(i.gammaSoil)}(${sn2(i.H)}-0.25)-${sn0(i.gammaConc)}(0.25)-${sn0(i.surcharge)}=\mathbf{${sn1(r.qNet)}}\ \text{kPa}`),
    ],
  })

  // 3 — Plan geometry
  if (crf) {
    const eRes = (Pa2 * i.spacing) / r.Pa
    steps.push({
      title: 'Plan dimensions — rectangular combined footing (CRF)',
      lines: [
        txt('For uniform soil pressure the footing length is positioned so the centroid of its area lines up with the resultant of the service loads. The resultant sits a distance e from column 1:'),
        eq(String.raw`e=\dfrac{P_{a2}\,s}{\sum P_a}=\dfrac{${sn1(Pa2)}\cdot${sn2(i.spacing)}}{${sn1(r.Pa)}}=${sn3(eRes)}\ \text{m}`),
        txt('The length Bx is taken so the soil resultant is concentric and both columns are covered; the width then carries the uniform pressure:'),
        eq(String.raw`B_x=\mathbf{${sn2(r.Bx)}}\ \text{m},\quad B_y=\dfrac{\sum P_a}{q_{net}\,B_x}=\dfrac{${sn1(r.Pa)}}{${sn1(r.qNet)}\cdot${sn2(r.Bx)}}=\mathbf{${sn2(r.By)}}\ \text{m}`),
        eq(String.raw`x_1=${sn2(r.x1)}\ \text{m},\quad x_2=${sn2(r.x2)}\ \text{m (column positions from the left edge)}`),
      ],
      note: r.widened ? 'Width increased so each column sits on the slab plus a 75 mm projection on every side.' : undefined,
    })
  } else {
    const A = r.Pa / r.qNet
    const xbar = (Pa1 * r.x1 + Pa2 * r.x2) / r.Pa
    steps.push({
      title: 'Plan dimensions — trapezoidal combined footing (CTF)',
      lines: [
        txt('When both ends are restricted the length is fixed by the geometry, so a trapezoid (widths By1 at the left, By2 at the right) is used to keep the area centroid under the load resultant.'),
        eq(String.raw`B_x=s+\tfrac{c_1}{2}+\tfrac{c_2}{2}+\text{overhangs}=\mathbf{${sn2(r.Bx)}}\ \text{m}`),
        eq(String.raw`A=\dfrac{\sum P_a}{q_{net}}=\dfrac{${sn1(r.Pa)}}{${sn1(r.qNet)}}=${sn2(A)}\ \text{m}^2,\quad \bar x=\dfrac{P_{a1}x_1+P_{a2}x_2}{\sum P_a}=${sn2(xbar)}\ \text{m}`),
        eq(String.raw`B_{y1}=\mathbf{${sn2(r.By1)}}\ \text{m},\quad B_{y2}=\mathbf{${sn2(r.By2)}}\ \text{m}`),
      ],
      note: r.widened ? 'Width increased so each column sits on the slab plus a 75 mm projection on every side.' : undefined,
    })
  }

  // 4 — Equivalent line load + shear/moment
  const wsum = (2 * r.Pu) / r.Bx
  const w1p2 = (6 * (r.Pu1 * r.x1 + r.Pu2 * r.x2)) / (r.Bx * r.Bx)
  steps.push({
    title: 'Factored soil reaction as a line load, then V(x) and M(x)',
    lines: [
      txt('Treating the footing as a rigid beam on soil, the factored upward pressure is an equivalent uniformly-varying line load wu1 → wu2 (kN/m) that reproduces the total reaction and its resultant location:'),
      eq(String.raw`\sum w=\dfrac{2\sum P_u}{B_x}=\dfrac{2\cdot${sn1(r.Pu)}}{${sn2(r.Bx)}}=${sn1(wsum)},\quad w_1{+}2w_2=\dfrac{6(P_{u1}x_1+P_{u2}x_2)}{B_x^{2}}=${sn1(w1p2)}`),
      eq(String.raw`w_{u1}=\mathbf{${sn1(r.wu1)}}\ \text{kN/m},\quad w_{u2}=\mathbf{${sn1(r.wu2)}}\ \text{kN/m}`),
      txt('Integrating the line load minus the two column loads gives the shear and moment. Shear crosses zero (peak moment) at:'),
      eq(String.raw`x_{V=0}=${sn2(r.xPeak)}\ \text{m}\;\Rightarrow\; M_{max}=\mathbf{${sn1(r.mPeak)}}\ \text{kN·m}`),
    ],
  })

  // 5 — Thickness
  const DcPunch = roundUp(r.dPunch + i.cover + i.barDia, 25)
  const DcBeam = roundUp(r.dBeam + i.cover + i.barDia, 25)
  const Afoot = crf ? r.Bx * r.By : ((r.By1 + r.By2) * r.Bx) / 2
  const qu = r.Pu / Afoot
  steps.push({
    title: 'Slab thickness — two-way (punching) and one-way (beam) shear',
    lines: [
      txt('The depth is governed by the larger of punching shear around the critical column (perimeter at d/2, NSCP §422.6 / ACI §22.6) and one-way shear at d from the column face (NSCP §422.5, Vc = (1/6)√f′c·b·d), both with φ = 0.75.'),
      eq(String.raw`q_u=\dfrac{\sum P_u}{A_{foot}}=\dfrac{${sn1(r.Pu)}}{${sn2(Afoot)}}=${sn1(qu)}\ \text{kPa}`),
      eq(String.raw`d_{punch}=${sn0(r.dPunch)}\ \text{mm}\;\Rightarrow\;D_{c,punch}=${sn0(DcPunch)}\ \text{mm}`),
      eq(String.raw`d_{beam}=${sn0(r.dBeam)}\ \text{mm}\;\Rightarrow\;D_{c,beam}=${sn0(DcBeam)}\ \text{mm}`),
      eq(String.raw`D_c=\max(D_{c,punch},D_{c,beam})=\mathbf{${sn0(r.Dc)}}\ \text{mm}`),
    ],
  })

  // 6 — Longitudinal flexure
  const dFlex = r.Dc - i.cover - i.barDia / 2
  steps.push({
    title: 'Longitudinal flexure (top & bottom steel)',
    lines: [
      txt(`The footing spans longitudinally between columns. Tension steel is designed (φ = 0.90, NSCP §410) at the maximum interior moment (top bars) and at each column face, using d = Dc − cover − db/2 = ${sn0(dFlex)} mm.`),
      ...r.longSections.flatMap((s) => [
        eq(String.raw`\text{${s.label}: } M_u=${sn1(s.Mu)}\ \text{kN·m},\; b=${sn0(s.b)}\ \text{mm}\;\Rightarrow\; A_s=${sn0(s.As)}\ \text{mm}^2`),
        eq(String.raw`\quad\to\;${s.bars}\,\varnothing${sn0(i.barDia)}\ \text{@}\ ${sn0(s.spacing)}\ \text{mm}\ (\text{${s.top ? 'top' : 'bottom'}})`),
      ]),
    ],
  })

  // 7 — Transverse flexure
  const dT = r.Dc - i.cover - 1.5 * i.barDia
  steps.push({
    title: 'Transverse flexure under each column (per metre strip)',
    lines: [
      txt(`Across the width, each column load spreads through a transverse strip cantilevering from the column face, arm = (By − c)/2, with d = Dc − cover − 1.5db = ${sn0(dT)} mm.`),
      ...r.transverse.flatMap((t) => [
        eq(String.raw`\text{${t.label}: } \text{arm}=${sn2(t.arm)}\ \text{m},\; M_u=${sn1(t.MuPerM)}\ \text{kN·m/m}\;\Rightarrow\; A_s=${sn0(t.AsPerM)}\ \text{mm}^2/\text{m}`),
        eq(String.raw`\quad\to\;\varnothing${sn0(i.barDia)}\ \text{@}\ ${sn0(t.spacing)}\ \text{mm}`),
      ]),
    ],
  })

  return steps
}
