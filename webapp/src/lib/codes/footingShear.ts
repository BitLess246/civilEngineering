// Code Library — one-way (beam) shear in a spread footing, NSCP 2015 §422.5
// (ACI 318-14 §22.5).
//
// The footing is a wide cantilever out from the column face. The section is
// taken a distance d from that face; the factored soil pressure on the strip
// beyond it is the shear, and the whole width B carries it at
// Vc = 0.17λ√f'c·B·d. The arithmetic is the footing engines' own: `oneWayVc`
// (engine/shear) for the strength, and the arm (L − c)/2 − d and
// Vu = qu·B·arm that `oneWayShearDepth` sizes the isolated pad against — so a
// footing designed in the Foundation Design calculator or in Model Space lands
// on this page with the numbers it was checked with. `footingShear.test.ts`
// holds it to the engine and to a hand calculation. The prose is Zeta's own.
// Units: plan m, section mm, MPa, kPa, kN.
import { oneWayVc } from '../../engine/shear'
import type { CodeRef, ExampleResult, FootingShearInput, FootingShearProvision, Flowchart } from './types'
import { checkState } from './types'

const ED = 'NSCP 2015' as const
const ref = (clause: string, topic: string, parallel?: string): CodeRef => ({ edition: ED, clause, topic, parallel })
const n1 = (v: number) => v.toFixed(1)
const n3 = (v: number) => v.toFixed(3)

/** A 2.4 m square pad on a 400 mm column, Dc 500 over 75 cover and ⌀16 bars. */
export const DEFAULT_FOOTING_SHEAR: FootingShearInput = {
  B: 2.4, L: 2.4, c: 400, h: 500, d: 409, fc: 28, lambda: 1, qu: 250,
}

/** The section's numbers, from the engine. Null when the geometry is impossible. */
export function footingShearExample(i: FootingShearInput) {
  if (!(i.d > 0) || i.d >= i.h || !(i.B > 0) || !(i.L > 0) || !(i.c > 0) || i.c / 1000 >= i.L) return null
  const cant = (i.L - i.c / 1000) / 2                  // column face to the edge, m
  const arm = Math.max(0, cant - i.d / 1000)           // the loaded strip beyond the section, m
  const Vu = i.qu * i.B * arm                          // kN
  const Vc = oneWayVc({ fc: i.fc, b: i.B * 1000, d: i.d, lambda: i.lambda })
  const phiVc = 0.75 * Vc
  return { cant, arm, Vu, Vc, phiVc, inside: arm === 0 }
}

const outOfScope = (why: string): ExampleResult => ({ values: {}, checks: [], lines: [{ text: why }] })

const oneWay: FootingShearProvision = {
  family: 'footing-shear',
  defaults: DEFAULT_FOOTING_SHEAR,
  fields: [
    { key: 'L', label: 'L (shear direction)', unit: 'm', min: 0.5, max: 15 },
    { key: 'B', label: 'B (section width)', unit: 'm', min: 0.5, max: 15 },
    { key: 'c', label: 'Column c (along L)', unit: 'mm', min: 150, max: 2000 },
    { key: 'h', label: 'Thickness Dc', unit: 'mm', min: 200, max: 2500 },
    { key: 'd', label: 'Effective depth d', unit: 'mm', min: 50, max: 2400 },
    { key: 'fc', label: 'f′c', unit: 'MPa', min: 17, max: 70 },
    { key: 'lambda', label: 'λ', min: 0.75, max: 1, step: '0.05' },
    { key: 'qu', label: 'qu (factored soil)', unit: 'kPa', min: 0, max: 2000 },
  ],
  id: 'footing-one-way-shear',
  title: 'One-way shear in a spread footing',
  category: 'foundations',
  component: 'Footing',
  summary: 'A footing projects from the column like a very wide, short cantilever, loaded upward by the soil. One-way shear is checked on a section across the whole footing width at a distance d from the column face: the factored soil pressure on the strip beyond that section is the shear Vu, and the concrete carries Vc = 0.17λ√f′c·B·d with φ = 0.75. Pressure between the column face and the section goes straight into the column by arching and is not counted. The check is made in each direction; on a square pad on a square column the two are the same.',
  why: 'A diagonal crack can open across the footing between the column face and the edge, the same way it does near a beam support. Footings carry no stirrups, so the concrete alone must take it — which is why one-way shear, together with punching, sets a footing\'s thickness.',
  mistakes: [
    'Taking the section at the column face rather than at d from it — conservative, but it oversizes the pad.',
    'Using the service bearing pressure instead of the factored pressure qu = Pu/A.',
    'Checking only one direction of a rectangular footing: the long cantilever usually governs, with the short width carrying it.',
    'Using the footing\'s overall thickness for d, or forgetting that the second mat sits one bar higher.',
  ],
  refs: {
    sec: ref('§422.5', 'One-way shear strength — section at d from the support face', 'ACI 318-14 §22.5'),
    vc: ref('§422.5.5.1', 'Vc for nonprestressed members without axial force', 'ACI 318-14 §22.5.5.1'),
    phi: ref('§421.2.1', 'φ = 0.75 for shear', 'ACI 318-14 §21.2.1'),
    min: ref('§413.3.1.2', 'Depth above the bottom reinforcement ≥ 150 mm', 'ACI 318-14 §13.3.1.2'),
  },
  variables: {
    L: { tex: 'L', name: 'Footing length in the direction of the shear', unit: 'm', role: 'geometry' },
    B: { tex: 'B', name: 'Footing width the section crosses', unit: 'm', role: 'geometry' },
    c: { tex: 'c', name: 'Column dimension along L', unit: 'mm', role: 'geometry' },
    h: { tex: 'D_c', name: 'Footing thickness', unit: 'mm', role: 'geometry' },
    d: { tex: 'd', name: 'Effective depth (average of the two mats)', unit: 'mm', role: 'geometry' },
    cant: { tex: 'a', name: 'Projection from the column face to the edge, (L − c)/2', unit: 'm', role: 'intermediate' },
    arm: { tex: 'a_v', name: 'Loaded strip beyond the critical section, a − d', unit: 'm', role: 'intermediate' },
    fc: { tex: "f'_c", name: 'Specified concrete strength', unit: 'MPa', role: 'material' },
    lambda: { tex: '\\lambda', name: 'Lightweight-concrete factor', unit: '—', role: 'factor' },
    qu: { tex: 'q_u', name: 'Factored soil pressure, Pu/A', unit: 'kPa', role: 'demand' },
    Vu: { tex: 'V_u', name: 'Factored shear on the section', unit: 'kN', role: 'demand' },
    Vc: { tex: 'V_c', name: 'One-way shear strength of the concrete', unit: 'kN', role: 'capacity' },
    phiVc: { tex: '\\phi V_c', name: 'Design one-way shear strength', unit: 'kN', role: 'capacity' },
  },
  equations: [
    { id: 'arm', label: 'Strip beyond the critical section', tex: 'a_v = \\dfrac{L - c}{2} - d', vars: ['arm', 'L', 'c', 'd'], ref: 'sec' },
    { id: 'vu', label: 'Shear on the section', tex: 'V_u = q_u\\,B\\,a_v', vars: ['Vu', 'qu', 'B', 'arm'], when: 'the section falls outside the column face plus d (else Vu = 0)', ref: 'sec' },
    { id: 'vc', label: 'Concrete strength', tex: 'V_c = 0.17\\,\\lambda\\sqrt{f\'_c}\\,B\\,d', vars: ['Vc', 'lambda', 'fc', 'B', 'd'], ref: 'vc' },
    { id: 'check', label: 'Design check', tex: 'V_u \\le \\phi V_c,\\quad \\phi = 0.75', vars: ['Vu', 'phiVc'], ref: 'phi' },
  ],
  diagram: 'footing-one-way',
  calculators: [{ to: '/foundation', label: 'Open Foundation Design' }],
  related: ['two-way-punching-shear', 'rc-beam-shear'],
  verification: 'engine-matched',
  keywords: ['one-way shear', 'beam shear', 'footing', 'spread footing', 'isolated footing', 'critical section', 'd from face', '422.5', 'Vc', 'foundation'],
  evaluate(i) {
    const r = footingShearExample(i)
    if (!r) return outOfScope('The effective depth must be positive and less than the thickness, and the column must be narrower than the footing.')
    const check = { label: 'Vu ≤ φVc', demand: r.Vu, capacity: r.phiVc, unit: 'kN', state: checkState(r.Vu, r.phiVc), ref: 'phi' }
    return {
      values: { L: i.L, B: i.B, c: i.c, h: i.h, d: i.d, cant: r.cant, arm: r.arm, fc: i.fc, lambda: i.lambda, qu: i.qu, Vu: r.Vu, Vc: r.Vc, phiVc: r.phiVc },
      checks: [check],
      lines: [
        { tex: `a_v = \\dfrac{${i.L} - ${n3(i.c / 1000)}}{2} - ${n3(i.d / 1000)} = ${n3(r.arm)}\\ \\text{m}` },
        ...(r.inside
          ? [{ text: 'The section at d from the face lies at or beyond the footing edge: no soil pressure acts outside it, so Vu = 0 — one-way shear cannot govern this pad.' }]
          : [{ tex: `V_u = q_uBa_v = ${n1(i.qu)}\\cdot${i.B}\\cdot${n3(r.arm)} = ${n1(r.Vu)}\\ \\text{kN}` }]),
        { tex: `V_c = 0.17(${i.lambda})\\sqrt{${i.fc}}\\cdot${Math.round(i.B * 1000)}\\cdot${n1(i.d)}/1000 = ${n1(r.Vc)}\\ \\text{kN}` },
        { tex: `\\phi V_c = 0.75\\cdot${n1(r.Vc)} = ${n1(r.phiVc)}\\ \\text{kN}\\ ${check.state === 'fail' ? '<' : '\\ge'}\\ V_u = ${n1(r.Vu)}\\ \\text{kN}` },
        ...(check.state === 'fail'
          ? [{ text: 'Fails: deepen the footing — d raises the strength and shortens the loaded strip at once. Widening the pad lowers qu but lengthens the cantilever.' }]
          : []),
      ],
    }
  },
  flow(i): Flowchart {
    const r = footingShearExample(i)
    return {
      title: 'Does one-way shear govern this footing?',
      steps: [
        { kind: 'start', text: `Section at d = ${n1(i.d)} mm from the column face`, ref: 'sec' },
        { kind: 'decision', text: `Is any footing left beyond it?  (a = ${r ? n3(r.cant) : '—'} m vs d)`, ref: 'sec', next: 'Yes',
          branch: { when: 'No', taken: !!r && r.inside, to: { kind: 'end', text: 'Vu = 0 — one-way shear cannot govern', state: 'pass' } } },
        { kind: 'process', text: `Vu = qu·B·av = ${r ? n1(r.Vu) : '—'} kN`, ref: 'sec' },
        { kind: 'process', text: `φVc = 0.75 · 0.17λ√f′c·B·d = ${r ? n1(r.phiVc) : '—'} kN`, ref: 'vc' },
        { kind: 'decision', text: `Vu ≤ φVc ?  (${r ? n1(r.Vu) : '—'} vs ${r ? n1(r.phiVc) : '—'} kN)`, ref: 'phi', next: 'Yes',
          branch: { when: 'No', taken: !!r && !r.inside && r.Vu > r.phiVc * 1.005, to: { kind: 'end', text: 'Deepen the footing', state: 'fail' } } },
        { kind: 'end', text: 'One-way shear passes', ref: 'vc', state: r && r.Vu >= r.phiVc * 0.995 ? 'limit' : 'pass' },
      ],
    }
  },
}

export const FOOTING_SHEAR_PROVISIONS: FootingShearProvision[] = [oneWay]
