// Worked solution for an RC stair flight (waist slab) — NSCP 2015 / ACI 318-14.
// Mirrors engine/stair.ts.
//
// The step people get wrong on a stair is the load: the waist is measured along
// the SLOPE but the load is carried per metre of PLAN, so the waist weight is
// divided by cos θ. The sheet shows that explicitly rather than presenting a
// combined dead load with no derivation.
import type { StairDesign, StairSupport } from '../engine/stair'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export interface StairSolutionInput {
  span: number; t: number; R: number; G: number
  fc: number; fy: number; barDia: number; distBarDia?: number; cover: number
  finishes: number; live: number; support?: StairSupport
}

const MOMENT_DENOM: Record<StairSupport, number> = { simple: 8, 'one-end': 9, 'both-ends': 11 }
const THICK_DENOM: Record<StairSupport, number> = { simple: 20, 'one-end': 24, 'both-ends': 28 }
const SUPPORT_LABEL: Record<StairSupport, string> = {
  simple: 'simply supported', 'one-end': 'one end continuous', 'both-ends': 'both ends continuous',
}

export function buildStairSolution(i: StairSolutionInput, r: StairDesign): SolutionStep[] {
  const support = i.support ?? 'simple'
  const L = r.loads
  const denom = MOMENT_DENOM[support]
  const tDenom = THICK_DENOM[support]
  const distDia = i.distBarDia ?? 10

  return [
    {
      title: 'Flight geometry',
      clause: 'NSCP 2015 §409',
      lines: [
        txt('The waist runs along the slope; loads and spans are per metre of horizontal plan. θ is the pitch set by the riser and going, and cos θ is what converts between the two.'),
        eq(String.raw`\tan\theta = \frac{R}{G} = \frac{${sn0(i.R)}}{${sn0(i.G)}} \Rightarrow \theta = ${sn2(r.geom.thetaDeg)}^\circ,\qquad \cos\theta = ${sn3(r.geom.cosTheta)}`),
        eq(String.raw`\text{waist } t = ${sn0(i.t)}\ \text{mm},\qquad \text{span } = ${sn2(i.span)}\ \text{m}\quad(\text{${SUPPORT_LABEL[support]}})`),
      ],
    },
    {
      title: 'Loads on plan',
      clause: 'NSCP 2015 §203.3.1',
      lines: [
        txt('The waist self-weight is computed on the slope then divided by cos θ to act per metre of plan — the step most often missed. The triangular steps add half a riser of concrete on average, and finishes and live load already act on plan.'),
        eq(String.raw`w_{waist} = \frac{\gamma_c\,t}{\cos\theta} = ${sn2(L.waist)}\ \text{kPa}`),
        eq(String.raw`w_{steps} = \gamma_c\,\frac{R}{2} = ${sn2(L.steps)}\ \text{kPa},\qquad w_{finishes} = ${sn2(L.finishes)}\ \text{kPa}`),
        eq(String.raw`D = ${sn2(L.waist)} + ${sn2(L.steps)} + ${sn2(L.finishes)} = ${sn2(L.dead)}\ \text{kPa},\qquad L = ${sn2(L.live)}\ \text{kPa}`),
        eq(String.raw`w_u = 1.2D + 1.6L = 1.2(${sn2(L.dead)}) + 1.6(${sn2(L.live)}) = \mathbf{${sn2(L.wu)}}\ \text{kPa}`),
      ],
    },
    {
      title: 'Design moment',
      clause: 'ACI 318-14 §6.5.2',
      lines: [
        txt(`With ${SUPPORT_LABEL[support]} ends the approximate coefficient gives wuL²/${denom}. A stair flight is analysed as a one-way slab strip one metre wide.`),
        eq(String.raw`M_u = \frac{w_u \ell^2}{${denom}} = \frac{${sn2(L.wu)} \times ${sn2(i.span)}^2}{${denom}} = \mathbf{${sn2(r.Mu)}}\ \text{kN·m/m}`),
        eq(String.raw`d = t - cover - \tfrac{d_b}{2} = ${sn0(i.t)} - ${sn0(i.cover)} - ${sn1(i.barDia / 2)} = ${sn1(r.d)}\ \text{mm}`),
      ],
    },
    {
      title: 'Main reinforcement',
      clause: 'ACI 318-14 §22.2 · §9.6.1.2',
      lines: [
        txt('Flexural steel for a 1 m strip, floored at the minimum reinforcement ratio. Spacing is capped at the lesser of 3t and 450 mm.'),
        eq(String.raw`A_{s} = ${sn0(r.AsMain)}\ \text{mm}^2\text{/m}\quad(\text{per metre width, } b = 1000\ \text{mm})`),
        eq(String.raw`A_b = \tfrac{\pi}{4}d_b^2 = \tfrac{\pi}{4}(${sn0(i.barDia)})^2 = ${sn1((Math.PI / 4) * i.barDia ** 2)}\ \text{mm}^2`),
        eq(String.raw`s = \frac{1000\,A_b}{A_s} = \frac{1000 \times ${sn1((Math.PI / 4) * i.barDia ** 2)}}{${sn0(r.AsMain)}} \Rightarrow \text{adopt } \varnothing${sn0(i.barDia)}@\mathbf{${sn0(r.mainSpacing)}}\ \text{mm}`),
      ],
    },
    {
      title: 'Distribution reinforcement',
      clause: 'ACI 318-14 §24.4.3.2',
      lines: [
        txt('Transverse steel for shrinkage and temperature, placed across the flight. It is a gross-area rule, so it depends on the waist thickness rather than on the moment.'),
        eq(String.raw`A_{s,dist} = 0.0018\,A_g = 0.0018 \times 1000 \times ${sn0(i.t)} = ${sn0(r.AsDist)}\ \text{mm}^2\text{/m}`),
        eq(String.raw`\Rightarrow \varnothing${sn0(distDia)}@\mathbf{${sn0(r.distSpacing)}}\ \text{mm}`),
      ],
    },
    {
      title: 'Minimum thickness (deflection control)',
      clause: 'ACI 318-14 Table 9.3.1.1',
      pass: r.tMinOK,
      lines: [
        txt('A one-way slab deeper than ℓ/denominator needs no deflection calculation. The denominator depends on end restraint — continuity at both ends allows a thinner flight.'),
        eq(String.raw`t_{min} = \frac{\ell}{${tDenom}} = \frac{${sn0(i.span * 1000)}}{${tDenom}} = ${sn1(r.tMin)}\ \text{mm}`),
        eq(String.raw`t = ${sn0(i.t)}\ \text{mm} \;${r.tMinOK ? '\\ge' : '<'}\; ${sn1(r.tMin)} \Rightarrow \textbf{${r.tMinOK ? 'OK — no deflection check required' : 'THINNER THAN Table 9.3.1.1 — compute deflections'}}`),
      ],
    },
  ]
}
