// Code Library — a tied rectangular RC column under axial load and uniaxial
// bending, NSCP 2015 §422.4 with the §422.2 strain-compatibility assumptions
// (ACI 318-14 §22.2, §22.4).
//
// Every number is the Column Design calculator's: `interaction` builds the
// strain-compatibility curve (concrete at 0.003, the β1 block, each bar row
// at Es·εs ≤ fy, φ from εt per Table 421.2.2), and `capacityAtEccentricity`
// finds the point on it along the demand's own e = Mu/Pu — the ray the
// calculator rates the column on. `rcColumn.test.ts` holds both to the engine
// and the pure-axial end to a hand calculation. The prose is Zeta's own.
// Units: mm, MPa, kN, kN·m.
import { interaction, capacityAtEccentricity } from '../../engine/columnDesign'
import { beta1 } from '../../engine/loads'
import type { CodeRef, ColumnExampleInput, ColumnProvision, ExampleResult, Flowchart } from './types'
import { checkState } from './types'

const ED = 'NSCP 2015' as const
const ref = (clause: string, topic: string, parallel?: string): CodeRef => ({ edition: ED, clause, topic, parallel })
const n0 = (v: number) => Math.round(v).toString()
const n1 = (v: number) => v.toFixed(1)
const n2 = (v: number) => v.toFixed(2)
const PHI_C = 0.65

/** Column Design's section — 400×400, 8-⌀28 all around — at Pu 1600 kN, Mu 160 kN·m: inside the curve. */
export const DEFAULT_COLUMN: ColumnExampleInput = {
  b: 400, h: 400, cover: 40, tieDia: 10, barDia: 28, numBars: 8, layout: 'all-around', fc: 28, fy: 415, Pu: 1600, Mu: 160,
}

/** Everything the page shows, from the engine. Null for a section that cannot exist. */
export function columnExample(i: ColumnExampleInput) {
  const dPrime = i.cover + i.tieDia + i.barDia / 2
  if (!(i.b > 0 && i.h > 2 * dPrime && i.numBars >= 4 && i.Pu > 0 && i.Mu >= 0)) return null
  const it = interaction(i)
  const e = i.Mu / i.Pu                                  // m
  const cap = capacityAtEccentricity(i, e)
  const phiPnMax = PHI_C * it.PnMax
  const phiPn = cap.phi * cap.Pn
  const ety = i.fy / 200000
  const zone: 'compression' | 'transition' | 'tension' = cap.et <= ety ? 'compression' : cap.et >= 0.005 ? 'tension' : 'transition'
  return { it, e, cap, phiPn, phiMn: cap.phi * cap.Mn, phiPnMax, ety, zone, Ast: it.layers.reduce((s, L) => s + L.As, 0) }
}

const outOfScope = (why: string): ExampleResult => ({ values: {}, checks: [], lines: [{ text: why }] })

const ZONE_TEXT = {
  compression: 'compression-controlled (εt ≤ εty): φ = 0.65',
  transition: 'in the transition (εty < εt < 0.005): φ interpolated',
  tension: 'tension-controlled (εt ≥ 0.005): φ = 0.90',
} as const

const pm: ColumnProvision = {
  family: 'rc-column',
  defaults: DEFAULT_COLUMN,
  fields: [
    { key: 'b', label: 'b', unit: 'mm', min: 200, max: 1500 },
    { key: 'h', label: 'h (bending depth)', unit: 'mm', min: 200, max: 1500 },
    { key: 'cover', label: 'Clear cover', unit: 'mm', min: 20, max: 100 },
    { key: 'tieDia', label: 'Tie ⌀', unit: 'mm', min: 8, max: 16 },
    { key: 'barDia', label: 'Bar ⌀', unit: 'mm', min: 12, max: 40 },
    { key: 'numBars', label: 'Bars', min: 4, max: 40, step: '2' },
    { key: 'layout', label: 'Bar layout', options: ['all-around', 'two-face'] },
    { key: 'fc', label: 'f′c', unit: 'MPa', min: 17, max: 70 },
    { key: 'fy', label: 'fy', unit: 'MPa', min: 230, max: 550 },
    { key: 'Pu', label: 'Pu', unit: 'kN', min: 1, max: 1e5 },
    { key: 'Mu', label: 'Mu', unit: 'kN·m', min: 0, max: 1e5 },
  ],
  id: 'rc-column-pm',
  title: 'Axial load and bending in a tied column',
  category: 'concrete',
  component: 'Column',
  summary: 'A column\'s strength is not one number but a curve: every combination of axial load and moment it can carry. Each point comes from one neutral-axis depth c — concrete crushing at a strain of 0.003, a stress block β1·c deep, every bar row strained in proportion to its distance from the neutral axis and capped at fy. Deep c gives high load and little moment; shallow c the reverse; the balanced point, where the tension bars just yield as the concrete crushes, is the nose of the curve. The design curve is φ times it, with φ rising from 0.65 to 0.90 as the tension steel strains, and is cut off at 0.80·φ·Po for a tied column. A column passes when its demand point (Mu, Pu) lies inside.',
  why: 'Moment and axial load interact: compression helps a column resist bending up to the balanced point and hurts it beyond. Checking axial load and moment separately misses that — a column can be fine for each alone and fail under both.',
  mistakes: [
    'Checking Pu against φPn,max alone when there is moment — the capacity along the demand\'s eccentricity is lower.',
    'Using the first-order moment for a slender column: the moment that enters the diagram is the magnified one (§406.6.4).',
    'Taking φ = 0.65 everywhere: below the balanced load a tension-controlled section earns up to 0.90.',
    'Counting bars on the side faces as if they sat at the extreme faces — side bars near the neutral axis add little moment.',
  ],
  refs: {
    assume: ref('§422.2', 'Strain compatibility, εcu = 0.003, the β1 stress block', 'ACI 318-14 §22.2'),
    po: ref('§422.4.2.2', 'Nominal axial strength Po', 'ACI 318-14 §22.4.2.2'),
    max: ref('§422.4.2.1', 'Pn,max = 0.80Po for tied columns', 'ACI 318-14 §22.4.2.1'),
    phi: ref('§421.2.2', 'φ by net tensile strain εt (Table 421.2.2)', 'ACI 318-14 Table 21.2.2'),
    rho: ref('§410.6.1.1', 'Longitudinal steel between 1 % and 8 % of Ag', 'ACI 318-14 §10.6.1.1'),
  },
  variables: {
    b: { tex: 'b', name: 'Width (parallel to the bending axis)', unit: 'mm', role: 'geometry' },
    h: { tex: 'h', name: 'Depth in the plane of bending', unit: 'mm', role: 'geometry' },
    Ast: { tex: 'A_{st}', name: 'Total longitudinal steel', unit: 'mm²', role: 'geometry' },
    dt: { tex: 'd_t', name: 'Depth to the extreme tension bars', unit: 'mm', role: 'geometry' },
    fc: { tex: "f'_c", name: 'Specified concrete strength', unit: 'MPa', role: 'material' },
    fy: { tex: 'f_y', name: 'Specified yield strength of the bars', unit: 'MPa', role: 'material' },
    Po: { tex: 'P_o', name: 'Nominal axial strength at zero eccentricity', unit: 'kN', role: 'capacity' },
    PnMax: { tex: 'P_{n,max}', name: 'Maximum nominal axial strength, tied', unit: 'kN', role: 'capacity' },
    phiPnMax: { tex: '\\phi P_{n,max}', name: 'Design axial cap, 0.65 × 0.80Po', unit: 'kN', role: 'capacity' },
    c: { tex: 'c', name: 'Neutral-axis depth at the capacity point', unit: 'mm', role: 'intermediate' },
    cb: { tex: 'c_b', name: 'Balanced neutral-axis depth', unit: 'mm', role: 'intermediate' },
    Pb: { tex: 'P_b', name: 'Balanced axial load', unit: 'kN', role: 'intermediate' },
    Mb: { tex: 'M_b', name: 'Balanced moment', unit: 'kN·m', role: 'intermediate' },
    et: { tex: '\\varepsilon_t', name: 'Net tensile strain in the extreme tension bars', unit: '—', role: 'intermediate' },
    phi: { tex: '\\phi', name: 'Strength reduction factor at the capacity point', unit: '—', role: 'factor' },
    e: { tex: 'e', name: 'Eccentricity of the demand, Mu/Pu', unit: 'm', role: 'intermediate' },
    Pn: { tex: 'P_n', name: 'Nominal axial strength along e', unit: 'kN', role: 'capacity' },
    Mn: { tex: 'M_n', name: 'Nominal moment along e', unit: 'kN·m', role: 'capacity' },
    phiPn: { tex: '\\phi P_n', name: 'Design axial strength along e', unit: 'kN', role: 'capacity' },
    Pu: { tex: 'P_u', name: 'Factored axial load', unit: 'kN', role: 'demand' },
    Mu: { tex: 'M_u', name: 'Factored moment (magnified, if slender)', unit: 'kN·m', role: 'demand' },
  },
  equations: [
    { id: 'po', label: 'Pure axial strength', tex: "P_o = 0.85f'_c(A_g - A_{st}) + f_yA_{st}", vars: ['Po', 'fc', 'Ast', 'fy'], ref: 'po' },
    { id: 'max', label: 'Axial cap, tied', tex: 'P_{n,max} = 0.80P_o,\\qquad \\phi P_{n,max} = 0.65(0.80P_o)', vars: ['PnMax', 'phiPnMax', 'Po'], ref: 'max' },
    { id: 'sc', label: 'One point of the curve, from c', tex: "\\begin{aligned}P_n &= 0.85f'_c\\,\\beta_1c\\,b + \\textstyle\\sum A_{s,i}f_{s,i}\\\\ f_{s,i} &= E_s\\,0.003\\dfrac{c - d_i}{c},\\ |f_{s,i}| \\le f_y\\end{aligned}", vars: ['Pn', 'c', 'fc', 'fy'], ref: 'assume' },
    { id: 'bal', label: 'Balanced point', tex: 'c_b = \\dfrac{600}{600 + f_y}\\,d_t', vars: ['cb', 'dt', 'fy', 'Pb', 'Mb'], ref: 'assume' },
    { id: 'phi', label: 'φ by net tensile strain', tex: '\\phi = 0.65 + 0.25\\dfrac{\\varepsilon_t - \\varepsilon_{ty}}{0.005 - \\varepsilon_{ty}},\\quad 0.65 \\le \\phi \\le 0.90', vars: ['phi', 'et'], ref: 'phi' },
    { id: 'check', label: 'Design check along e = Mu/Pu', tex: 'P_u \\le \\phi P_n(e),\\qquad P_u \\le \\phi P_{n,max}', vars: ['Pu', 'phiPn', 'e', 'phiPnMax'], ref: 'max' },
  ],
  diagram: 'column-pm',
  calculators: [{ to: '/column-design', label: 'Open Column Design' }],
  related: ['rc-beam-flexure', 'rc-beam-phi'],
  verification: 'engine-matched',
  keywords: ['column', 'interaction diagram', 'P-M', 'axial', 'bending', 'balanced', 'eccentricity', 'tied', 'Po', 'Pn,max', '422.4', 'strain compatibility'],
  evaluate(i) {
    const r = columnExample(i)
    if (!r) return outOfScope('The section needs at least four bars, room for them inside the depth, a positive Pu and a moment of zero or more.')
    const { it, cap } = r
    const checks = [
      { label: 'Pu ≤ φPn along e', demand: i.Pu, capacity: r.phiPn, unit: 'kN', state: checkState(i.Pu, r.phiPn), ref: 'phi' },
      { label: 'Pu ≤ φPn,max', demand: i.Pu, capacity: r.phiPnMax, unit: 'kN', state: checkState(i.Pu, r.phiPnMax), ref: 'max' },
    ]
    const ag = i.b * i.h
    return {
      values: {
        b: i.b, h: i.h, Ast: r.Ast, dt: it.dt, fc: i.fc, fy: i.fy, Po: it.Po, PnMax: it.PnMax, phiPnMax: r.phiPnMax,
        c: cap.c, cb: it.balanced.c, Pb: it.balanced.Pb, Mb: it.balanced.Mb, et: cap.et, phi: cap.phi,
        e: r.e, Pn: cap.Pn, Mn: cap.Mn, phiPn: r.phiPn, Pu: i.Pu, Mu: i.Mu,
      },
      checks,
      lines: [
        { tex: `A_{st} = ${i.numBars}\\cdot\\tfrac{\\pi}{4}(${i.barDia})^2 = ${n0(r.Ast)}\\ \\text{mm}^2\\quad(\\rho = ${n2((100 * r.Ast) / ag)}\\%),\\qquad d_t = ${n1(it.dt)}\\ \\text{mm}` },
        { tex: `P_o = 0.85(${i.fc})(${n0(ag)} - ${n0(r.Ast)}) + ${i.fy}(${n0(r.Ast)}) = ${n1(it.Po)}\\ \\text{kN},\\quad \\phi P_{n,max} = 0.65(0.80)(${n1(it.Po)}) = ${n1(r.phiPnMax)}\\ \\text{kN}` },
        { tex: `c_b = \\tfrac{600}{600 + ${i.fy}}(${n1(it.dt)}) = ${n1(it.balanced.c)}\\ \\text{mm}:\\quad P_b = ${n1(it.balanced.Pb)}\\ \\text{kN},\\ M_b = ${n1(it.balanced.Mb)}\\ \\text{kN·m},\\ \\beta_1 = ${n2(beta1(i.fc))}` },
        { tex: `e = M_u/P_u = ${n1(i.Mu)}/${n1(i.Pu)} = ${n0(r.e * 1000)}\\ \\text{mm}\\ \\Rightarrow\\ c = ${n1(cap.c)}\\ \\text{mm},\\ P_n = ${n1(cap.Pn)},\\ M_n = ${n1(cap.Mn)}` },
        { text: `εt = ${cap.et.toFixed(5)} against εty = ${r.ety.toFixed(5)}: ${ZONE_TEXT[r.zone]} (φ = ${cap.phi.toFixed(3)}).` },
        { tex: `\\phi P_n = ${cap.phi.toFixed(3)}(${n1(cap.Pn)}) = ${n1(r.phiPn)}\\ \\text{kN}\\ ${checks[0].state === 'fail' ? '<' : '\\ge'}\\ P_u = ${n1(i.Pu)}\\ \\text{kN}` },
        ...(checks.some((c) => c.state === 'fail')
          ? [{ text: 'Fails: enlarge the section (h in the plane of bending helps moment most), add steel up to the 8 % limit, or raise f′c.' }]
          : []),
      ],
    }
  },
  flow(i): Flowchart {
    const r = columnExample(i)
    return {
      title: 'Where does this column sit on its diagram?',
      steps: [
        { kind: 'start', text: `Po = ${r ? n1(r.it.Po) : '—'} kN; φPn,max = ${r ? n1(r.phiPnMax) : '—'} kN`, ref: 'po' },
        { kind: 'decision', text: `Pu ≤ φPn,max ?  (${n1(i.Pu)} vs ${r ? n1(r.phiPnMax) : '—'} kN)`, ref: 'max', next: 'Yes',
          branch: { when: 'No', taken: !!r && i.Pu > r.phiPnMax * 1.005, to: { kind: 'end', text: 'Too much axial load for any moment: enlarge or add steel', state: 'fail' } } },
        { kind: 'process', text: `Follow e = Mu/Pu = ${r ? n0(r.e * 1000) : '—'} mm to the curve: c = ${r ? n1(r.cap.c) : '—'} mm`, ref: 'assume' },
        { kind: 'process', text: r ? `εt = ${r.cap.et.toFixed(4)} — ${ZONE_TEXT[r.zone]}` : 'εt, then φ', ref: 'phi' },
        { kind: 'decision', text: `Pu ≤ φPn ?  (${n1(i.Pu)} vs ${r ? n1(r.phiPn) : '—'} kN)`, ref: 'phi', next: 'Yes',
          branch: { when: 'No', taken: !!r && i.Pu <= r.phiPnMax * 1.005 && i.Pu > r.phiPn * 1.005, to: { kind: 'end', text: 'Demand point outside the design curve', state: 'fail' } } },
        { kind: 'end', text: 'Inside the design curve: passes', ref: 'phi', state: r && i.Pu >= r.phiPn * 0.995 ? 'limit' : 'pass' },
      ],
    }
  },
}

export const RC_COLUMN_PROVISIONS: ColumnProvision[] = [pm]
