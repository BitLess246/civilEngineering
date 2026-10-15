// Code Library — two-way (punching) shear at a column, NSCP 2015 §422.6
// (ACI 318-14 §22.6).
//
// One provision for both places it is checked: a column on a flat slab, where
// Vu is the column's shear, and a column on a footing, where the soil pressure
// INSIDE the critical section pushes back on the very block that would punch
// out, so Vu = Pu − qu·A0. The capacity is `designPunchingShear` (engine/
// punchingShear) — the Punching Shear calculator's — whose b0 and Vc are the
// shared `criticalSection` and the Table 422.6.5.2 coefficients the footing
// engines use, so the page, the calculator and a Model Space footing cannot
// report different numbers for the same column. `punching.test.ts` holds the
// example to the engine and to a hand calculation. The prose is Zeta's own.
// Units: mm, MPa, kN, kPa.
import { designPunchingShear } from '../../engine/punchingShear'
import { criticalSection } from '../../engine/shear'
import type { CodeRef, ExampleResult, PunchingExampleInput, PunchingProvision, Flowchart } from './types'
import { checkState } from './types'

const ED = 'NSCP 2015' as const
const ref = (clause: string, topic: string, parallel?: string): CodeRef => ({ edition: ED, clause, topic, parallel })
const n0 = (v: number) => Math.round(v).toString()
const n1 = (v: number) => v.toFixed(1)
const n2 = (v: number) => v.toFixed(2)

/** The Punching Shear calculator's own defaults: a 500 mm column on a 200 mm slab, d = 200 − 25 − 16/2. */
export const DEFAULT_PUNCHING: PunchingExampleInput = {
  c1: 500, c2: 500, h: 200, d: 167, fc: 28, lambda: 1, position: 'interior', Pu: 500, qu: 0,
}

export const POSITIONS = ['interior', 'edge', 'corner'] as const

/** Everything the page shows, from the engine. Null when the geometry is impossible. */
export function punchingExample(i: PunchingExampleInput) {
  if (!(i.d > 0) || i.d >= i.h || !(i.c1 > 0) || !(i.c2 > 0)) return null
  // the engine passes (c2, c1) to the shared section — so does this
  const cs = criticalSection(i.c2, i.c1, i.d, i.position)
  const relief = i.qu * cs.Ao * 1e-6                     // kPa × m² = kN
  const Vu = Math.max(0, i.Pu - relief)
  const r = designPunchingShear({ c1: i.c1, c2: i.c2, d: i.d, fc: i.fc, lambda: i.lambda, Vu, position: i.position })
  // Table 422.6.5.2 as printed: (a) 0.33, (b) 0.17(1 + 2/βc), (c) 0.083(2 + αs·d/b0)
  const Va = r.Vc3, Vb = r.Vc1, Vcc = r.Vc2
  const gov: 'a' | 'b' | 'c' = r.Vc === Va ? 'a' : r.Vc === Vb ? 'b' : 'c'
  return { ...r, Ao: cs.Ao, relief, Vu, Va, Vb, Vcc, gov }
}

const B0_TEX: Record<PunchingExampleInput['position'], string> = {
  interior: 'b_0 = 2(c_1 + d) + 2(c_2 + d)',
  edge: 'b_0 = (c_1 + d) + 2\\left(c_2 + \\tfrac{d}{2}\\right)',
  corner: 'b_0 = \\left(c_1 + \\tfrac{d}{2}\\right) + \\left(c_2 + \\tfrac{d}{2}\\right)',
}

const outOfScope = (why: string): ExampleResult => ({ values: {}, checks: [], lines: [{ text: why }] })

const punching: PunchingProvision = {
  family: 'punching',
  defaults: DEFAULT_PUNCHING,
  fields: [
    { key: 'c1', label: 'c₁ (∥ free edge)', unit: 'mm', min: 150, max: 2000 },
    { key: 'c2', label: 'c₂ (⊥ free edge)', unit: 'mm', min: 150, max: 2000 },
    { key: 'position', label: 'Column position', options: POSITIONS },
    { key: 'h', label: 'Slab / footing h', unit: 'mm', min: 100, max: 2500 },
    { key: 'd', label: 'Effective depth d', unit: 'mm', min: 50, max: 2400 },
    { key: 'fc', label: 'f′c', unit: 'MPa', min: 17, max: 70 },
    { key: 'lambda', label: 'λ', min: 0.75, max: 1, step: '0.05' },
    { key: 'Pu', label: 'Pu (column)', unit: 'kN', min: 0, max: 1e5 },
    { key: 'qu', label: 'qu (soil, footing only)', unit: 'kPa', min: 0, max: 2000 },
  ],
  id: 'two-way-punching-shear',
  title: 'Two-way (punching) shear at a column',
  category: 'foundations',
  component: 'Footing / flat slab',
  summary: 'Where a column bears on a slab or a footing, the concrete can fail by a truncated pyramid punching through around the column. The check is made on a critical section at d/2 from the column faces: its perimeter b0 times d is the area that resists, and the strength is the least of three expressions — one for a compact column, one for an elongated column, and one for a perimeter that is large compared with the depth. On a footing, the soil pressure acting inside the section pushes back on the block that would punch out, so only the load outside it counts. φ = 0.75.',
  why: 'Punching is a brittle shear failure with little warning, and it is local: a slab or a footing that is perfectly adequate in bending can still let a column push straight through it. Because it is governed by the depth around the column, it usually decides a flat plate\'s or a footing\'s thickness.',
  mistakes: [
    'Taking the section at the column face, or at d from it as for one-way shear — the two-way section is at d/2.',
    'Using a closed four-sided perimeter at an edge or corner column, where the section stops at the free edge (αs = 30 or 20, not 40).',
    'On a footing, checking the full column load Pu without subtracting the soil pressure inside the critical section — conservative, but it oversizes the pad.',
    'Using the slab\'s overall thickness h for d, or a footing\'s d to the top layer instead of to the average of the two mats.',
  ],
  refs: {
    crit: ref('§422.6.4.1', 'Critical section for two-way shear', 'ACI 318-14 §22.6.4.1'),
    vc: ref('§422.6.5.2', 'Two-way shear strength, nonprestressed (Table 422.6.5.2)', 'ACI 318-14 Table 22.6.5.2'),
    phi: ref('§421.2.1', 'φ = 0.75 for shear', 'ACI 318-14 §21.2.1'),
    reinf: ref('§422.6.7–§422.6.8', 'Two-way shear reinforcement — stirrups or headed studs', 'ACI 318-14 §22.6.7–22.6.8'),
  },
  variables: {
    c1: { tex: 'c_1', name: 'Column dimension parallel to the free edge', unit: 'mm', role: 'geometry' },
    c2: { tex: 'c_2', name: 'Column dimension perpendicular to the free edge', unit: 'mm', role: 'geometry' },
    h: { tex: 'h', name: 'Slab or footing thickness', unit: 'mm', role: 'geometry' },
    d: { tex: 'd', name: 'Effective depth (average of the two mats)', unit: 'mm', role: 'geometry' },
    b0: { tex: 'b_0', name: 'Critical perimeter at d/2 from the column faces', unit: 'mm', role: 'intermediate' },
    Ao: { tex: 'A_0', name: 'Area enclosed by the critical section', unit: 'mm²', role: 'intermediate' },
    betac: { tex: '\\beta_c', name: 'Long to short side of the column', unit: '—', role: 'factor' },
    alphaS: { tex: '\\alpha_s', name: 'Position factor: 40 interior, 30 edge, 20 corner', unit: '—', role: 'factor' },
    fc: { tex: "f'_c", name: 'Specified concrete strength', unit: 'MPa', role: 'material' },
    lambda: { tex: '\\lambda', name: 'Lightweight-concrete factor', unit: '—', role: 'factor' },
    Pu: { tex: 'P_u', name: 'Factored column load', unit: 'kN', role: 'demand' },
    qu: { tex: 'q_u', name: 'Factored soil pressure under a footing (0 for a slab)', unit: 'kPa', role: 'demand' },
    Vu: { tex: 'V_u', name: 'Factored punching shear on the section', unit: 'kN', role: 'demand' },
    Va: { tex: 'V_{c,a}', name: 'Vc, expression (a) — compact column', unit: 'kN', role: 'intermediate' },
    Vb: { tex: 'V_{c,b}', name: 'Vc, expression (b) — elongated column', unit: 'kN', role: 'intermediate' },
    Vcc: { tex: 'V_{c,c}', name: 'Vc, expression (c) — large perimeter', unit: 'kN', role: 'intermediate' },
    Vc: { tex: 'V_c', name: 'Two-way shear strength — the least of (a), (b), (c)', unit: 'kN', role: 'capacity' },
    phiVc: { tex: '\\phi V_c', name: 'Design punching strength', unit: 'kN', role: 'capacity' },
  },
  equations: [
    { id: 'b0', label: 'Critical perimeter at d/2', tex: '\\begin{aligned}&\\text{interior: } 2(c_1 + d) + 2(c_2 + d)\\\\ &\\text{edge: } (c_1 + d) + 2(c_2 + d/2)\\\\ &\\text{corner: } (c_1 + d/2) + (c_2 + d/2)\\end{aligned}', vars: ['b0', 'c1', 'c2', 'd'], ref: 'crit' },
    { id: 'vu', label: 'Shear on the section', tex: 'V_u = P_u - q_u A_0', vars: ['Vu', 'Pu', 'qu', 'Ao'], when: 'the column bears on a footing (qu = 0 on a slab)', ref: 'crit' },
    { id: 'a', label: '(a) Compact column', tex: 'V_{c,a} = 0.33\\,\\lambda\\sqrt{f\'_c}\\,b_0 d', vars: ['Va', 'lambda', 'fc', 'b0', 'd'], ref: 'vc' },
    { id: 'b', label: '(b) Elongated column', tex: 'V_{c,b} = 0.17\\left(1 + \\dfrac{2}{\\beta_c}\\right)\\lambda\\sqrt{f\'_c}\\,b_0 d', vars: ['Vb', 'betac', 'lambda', 'fc', 'b0', 'd'], when: 'βc > 2, where it falls below (a)', ref: 'vc' },
    { id: 'c', label: '(c) Large perimeter', tex: 'V_{c,c} = 0.083\\left(2 + \\dfrac{\\alpha_s d}{b_0}\\right)\\lambda\\sqrt{f\'_c}\\,b_0 d', vars: ['Vcc', 'alphaS', 'd', 'b0', 'lambda', 'fc'], when: 'b0 is large relative to d', ref: 'vc' },
    { id: 'check', label: 'Design check', tex: 'V_u \\le \\phi V_c,\\quad V_c = \\min(V_{c,a}, V_{c,b}, V_{c,c}),\\quad \\phi = 0.75', vars: ['Vu', 'phiVc', 'Vc'], ref: 'phi' },
  ],
  diagram: 'punching-perimeter',
  calculators: [{ to: '/punching-shear', label: 'Open Punching Shear' }, { to: '/foundation', label: 'Open Foundation Design' }],
  related: ['rc-beam-shear'],
  verification: 'engine-matched',
  keywords: ['punching', 'two-way shear', 'flat slab', 'flat plate', 'footing', 'critical perimeter', 'b0', 'alpha s', 'beta c', 'column', '422.6', 'headed studs'],
  evaluate(i) {
    const r = punchingExample(i)
    if (!r) return outOfScope('The effective depth must be positive and less than the thickness, and the column must have a size.')
    const check = { label: 'Vu ≤ φVc', demand: r.Vu, capacity: r.phiVc, unit: 'kN', state: checkState(r.Vu, r.phiVc), ref: 'phi' }
    const base = `\\lambda\\sqrt{f'_c}\\,b_0d = ${n2(i.lambda)}\\sqrt{${i.fc}}\\cdot${n0(r.b0)}\\cdot${n1(i.d)}/1000 = ${n1(r.Va / 0.33)}\\ \\text{kN}`
    return {
      values: {
        c1: i.c1, c2: i.c2, h: i.h, d: i.d, b0: r.b0, Ao: r.Ao, betac: r.betac, alphaS: r.alphaS, fc: i.fc, lambda: i.lambda,
        Pu: i.Pu, qu: i.qu, Vu: r.Vu, Va: r.Va, Vb: r.Vb, Vcc: r.Vcc, Vc: r.Vc, phiVc: r.phiVc,
      },
      checks: [check],
      lines: [
        { tex: `${B0_TEX[i.position]} = ${n0(r.b0)}\\ \\text{mm}\\quad(\\text{${i.position}},\\ \\alpha_s = ${r.alphaS})` },
        ...(i.qu > 0
          ? [{ tex: `V_u = P_u - q_uA_0 = ${n1(i.Pu)} - ${n1(i.qu)}\\cdot${n2(r.Ao / 1e6)} = ${n1(r.Vu)}\\ \\text{kN}` }]
          : [{ text: `No soil pressure inside the section (a slab): Vu = Pu = ${n1(r.Vu)} kN.` }]),
        { tex: base },
        { tex: `V_{c,a} = 0.33(${n1(r.Va / 0.33)}) = ${n1(r.Va)},\\quad V_{c,b} = 0.17\\left(1 + \\tfrac{2}{${n2(r.betac)}}\\right)(\\ldots) = ${n1(r.Vb)},\\quad V_{c,c} = 0.083\\left(2 + \\tfrac{${r.alphaS}\\cdot${n1(i.d)}}{${n0(r.b0)}}\\right)(\\ldots) = ${n1(r.Vcc)}\\ \\text{kN}` },
        { tex: `\\phi V_c = 0.75\\cdot${n1(r.Vc)} = ${n1(r.phiVc)}\\ \\text{kN}\\ ${check.state === 'fail' ? '<' : '\\ge'}\\ V_u = ${n1(r.Vu)}\\ \\text{kN}\\quad(\\text{(${r.gov}) governs})` },
        ...(check.state === 'fail'
          ? [{ text: 'Fails: thicken the slab or footing (d enters twice), enlarge the column or add a drop panel / pedestal, or provide stirrups or headed studs (§422.6.7–§422.6.8).' }]
          : []),
      ],
    }
  },
  flow(i): Flowchart {
    const r = punchingExample(i)
    return {
      title: 'Which expression governs, and does it pass?',
      steps: [
        { kind: 'start', text: `Critical section at d/2: b0 = ${r ? n0(r.b0) : '—'} mm (${i.position}, αs = ${r?.alphaS ?? '—'})`, ref: 'crit' },
        { kind: 'process', text: i.qu > 0 ? `Footing: Vu = Pu − qu·A0 = ${r ? n1(r.Vu) : '—'} kN` : `Slab: Vu = Pu = ${n1(i.Pu)} kN`, ref: 'crit' },
        { kind: 'process', text: `(a) ${r ? n1(r.Va) : '—'} · (b) ${r ? n1(r.Vb) : '—'} · (c) ${r ? n1(r.Vcc) : '—'} kN`, ref: 'vc' },
        { kind: 'process', text: `Vc = least = ${r ? `${n1(r.Vc)} kN, (${r.gov})` : '—'}; φVc = ${r ? n1(r.phiVc) : '—'} kN`, ref: 'phi' },
        { kind: 'decision', text: `Vu ≤ φVc ?  (${r ? n1(r.Vu) : '—'} vs ${r ? n1(r.phiVc) : '—'} kN)`, ref: 'phi', next: 'Yes',
          branch: { when: 'No', taken: !!r && r.Vu > r.phiVc * 1.005, to: { kind: 'end', text: 'Thicken, enlarge the column, or add studs / stirrups', ref: 'reinf', state: 'fail' } } },
        { kind: 'end', text: 'Two-way shear passes', ref: 'vc', state: r && r.Vu >= r.phiVc * 0.995 ? 'limit' : 'pass' },
      ],
    }
  },
}

export const PUNCHING_PROVISIONS: PunchingProvision[] = [punching]
