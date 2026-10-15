// Code Library — RC beam provisions (NSCP 2015 Chapter 4; ACI 318-14 parallels).
//
// Every equation here is evaluated through the SAME engine functions the Beam
// Design calculator uses — `rectCapacity`, `beta1`, `phiFromStrain`, `rhoMin`
// (engine/flexure) and `oneWayVc` (engine/shear) — so the explanation and the
// calculator cannot drift apart; `codes.test.ts` holds the worked examples to
// `designBeam` itself. The prose is Zeta's own; no code text is reproduced.
// Units: mm, MPa, kN, kN·m.
import { rectCapacity, beta1, phiFromStrain, rhoMin } from '../../engine/flexure'
import { oneWayVc } from '../../engine/shear'
import type { BeamExampleInput, CodeRef, Provision, ExampleCheck, Flowchart, WalkStep } from './types'
import { checkState } from './types'

const ED = 'NSCP 2015' as const
const ref = (clause: string, topic: string, parallel?: string): CodeRef => ({ edition: ED, clause, topic, parallel })
const n0 = (v: number) => Math.round(v).toString()
const n1 = (v: number) => v.toFixed(1)
const n3 = (v: number) => v.toFixed(3)
const n4 = (v: number) => v.toFixed(4)

export const PHI_SHEAR = 0.75

/** Single-layer effective depth: to the centroid of one row of bars, mm. */
export const effDepth = (i: BeamExampleInput) => i.h - i.cover - i.stirrupDia - i.barDia / 2
export const steelArea = (i: BeamExampleInput) => i.nBars * (Math.PI / 4) * i.barDia ** 2

/** The beam every RC-beam page opens with — 300 × 500, 4-⌀20, f′c 28, fy 415. */
export const DEFAULT_BEAM: BeamExampleInput = {
  b: 300, h: 500, cover: 40, stirrupDia: 10, nBars: 4, barDia: 20,
  fc: 28, fy: 415, fyt: 275, Mu: 150, Vu: 120, legs: 2, s: 200,
}

const CALC_BEAM = [{ to: '/beam-design', label: 'Open Beam Design' }]

const COMMON_VARS = {
  b: { tex: 'b_w', name: 'Web width', unit: 'mm', role: 'geometry' as const },
  d: { tex: 'd', name: 'Effective depth — top fibre to the tension steel centroid', unit: 'mm', role: 'geometry' as const },
  fc: { tex: "f'_c", name: 'Specified concrete compressive strength', unit: 'MPa', role: 'material' as const },
  fy: { tex: 'f_y', name: 'Specified yield strength of the longitudinal bars', unit: 'MPa', role: 'material' as const },
  As: { tex: 'A_s', name: 'Area of tension reinforcement', unit: 'mm²', role: 'geometry' as const },
}

// ── 1 · flexural strength ─────────────────────────────────────────────────
const flexure: Provision = {
  id: 'rc-beam-flexure',
  title: 'Flexural strength of a rectangular beam',
  category: 'concrete',
  component: 'Beam',
  summary: 'A beam section is adequate in bending when the factored moment it must carry does not exceed its design flexural strength φMn. Mn comes from the internal couple between the concrete compression block and the tension steel, found by equilibrium with the concrete crushing strain at the top fibre.',
  why: 'Bending is resisted by a lever arm: concrete squeezed at the top, steel pulled at the bottom. If the factored moment outgrows that couple, the steel yields excessively or the concrete crushes. Using an equivalent rectangular stress block makes the couple a closed-form calculation.',
  mistakes: [
    'Using the total depth h instead of the effective depth d in the lever arm.',
    'Assuming the steel yields without checking the strain — over-reinforced sections do not, and the stress-block depth changes.',
    'Applying φ = 0.90 without confirming the section is tension-controlled.',
  ],
  refs: {
    design: ref('§409.5.1.1', 'Design strength ≥ factored demand', 'ACI 318-14 §9.5.1.1'),
    block: ref('§422.2.2', 'Equivalent rectangular stress block', 'ACI 318-14 §22.2.2'),
    beta: ref('§422.2.2.4.3', 'β1 against f′c', 'ACI 318-14 Table 22.2.2.4.3'),
    phi: ref('§421.2.2', 'φ from the net tensile strain', 'ACI 318-14 Table 21.2.2'),
  },
  variables: {
    ...COMMON_VARS,
    Mu: { tex: 'M_u', name: 'Factored moment demand', unit: 'kN·m', role: 'demand', note: 'From the governing load combination of the analysis.' },
    a: { tex: 'a', name: 'Depth of the equivalent stress block', unit: 'mm', role: 'intermediate', note: 'a = β1·c.' },
    c: { tex: 'c', name: 'Neutral-axis depth', unit: 'mm', role: 'intermediate' },
    beta1: { tex: '\\beta_1', name: 'Stress-block depth factor', unit: '—', role: 'factor', note: '0.85 up to f′c = 28 MPa, reducing to 0.65 at 55 MPa.' },
    et: { tex: '\\varepsilon_t', name: 'Net tensile strain in the extreme tension steel', unit: '—', role: 'intermediate' },
    fs: { tex: 'f_s', name: 'Stress in the tension steel at equilibrium', unit: 'MPa', role: 'intermediate', note: 'Equal to fy when the steel yields.' },
    Mn: { tex: 'M_n', name: 'Nominal flexural strength', unit: 'kN·m', role: 'capacity' },
    phi: { tex: '\\phi', name: 'Strength reduction factor', unit: '—', role: 'factor', note: 'See "Strength reduction factor and tension control".' },
    phiMn: { tex: '\\phi M_n', name: 'Design flexural strength', unit: 'kN·m', role: 'capacity' },
  },
  equations: [
    { id: 'a', label: 'Stress-block depth (steel yielding)', tex: "a = \\dfrac{A_s f_y}{0.85\\, f'_c\\, b_w}", vars: ['a', 'As', 'fy', 'fc', 'b'], ref: 'block' },
    { id: 'c', label: 'Neutral axis', tex: 'c = \\dfrac{a}{\\beta_1}', vars: ['c', 'a', 'beta1'], ref: 'beta' },
    { id: 'et', label: 'Strain in the tension steel', tex: '\\varepsilon_t = 0.003\\,\\dfrac{d - c}{c}', vars: ['et', 'd', 'c'], when: 'single layer, so dt = d', ref: 'block' },
    { id: 'Mn', label: 'Nominal strength', tex: 'M_n = A_s f_s \\left(d - \\dfrac{a}{2}\\right)', vars: ['Mn', 'As', 'fs', 'd', 'a'], ref: 'block' },
    { id: 'check', label: 'Design check', tex: 'M_u \\le \\phi M_n', vars: ['Mu', 'phi', 'Mn', 'phiMn'], ref: 'design' },
  ],
  diagram: 'rc-beam-flexure',
  calculators: CALC_BEAM,
  related: ['rc-beam-phi', 'rc-beam-min-steel', 'rc-beam-shear'],
  verification: 'engine-matched',
  keywords: ['moment', 'bending', 'Mn', 'phi Mn', 'stress block', 'Whitney', 'neutral axis', 'singly reinforced', 'SRRB'],
  walk: flexureWalk,
  evaluate(i) {
    const d = effDepth(i), As = steelArea(i)
    const cap = rectCapacity(i.b, d, d, As, i.fc, i.fy)
    const b1 = beta1(i.fc)
    const check: ExampleCheck = { label: 'Mu ≤ φMn', demand: i.Mu, capacity: cap.phiMn, unit: 'kN·m', state: checkState(i.Mu, cap.phiMn), ref: 'design' }
    return {
      values: { b: i.b, d, fc: i.fc, fy: i.fy, As, Mu: i.Mu, a: cap.a, c: cap.c, beta1: b1, et: cap.et, fs: cap.fs, Mn: cap.Mn, phi: cap.phi, phiMn: cap.phiMn },
      checks: [check],
      lines: [
        { tex: `d = h - c_c - d_s - \\tfrac{d_b}{2} = ${i.h} - ${i.cover} - ${i.stirrupDia} - ${n1(i.barDia / 2)} = ${n1(d)}\\ \\text{mm}` },
        { tex: `A_s = ${i.nBars}\\cdot\\tfrac{\\pi}{4}(${i.barDia})^2 = ${n0(As)}\\ \\text{mm}^2` },
        cap.fsYields
          ? { tex: `a = \\dfrac{${n0(As)}\\cdot${i.fy}}{0.85\\cdot${i.fc}\\cdot${i.b}} = ${n1(cap.a)}\\ \\text{mm},\\quad c = \\dfrac{a}{${n3(b1)}} = ${n1(cap.c)}\\ \\text{mm}` }
          : { text: `The steel does not yield at the yield-assumption block, so c is solved from equilibrium with fs = 600(d − c)/c: c = ${n1(cap.c)} mm, a = ${n1(cap.a)} mm, fs = ${n0(cap.fs)} MPa.` },
        { tex: `\\varepsilon_t = 0.003\\,\\dfrac{${n1(d)} - ${n1(cap.c)}}{${n1(cap.c)}} = ${n4(cap.et)} \\Rightarrow \\phi = ${n3(cap.phi)}` },
        { tex: `M_n = ${n0(As)}\\cdot${n0(cap.fs)}\\left(${n1(d)} - \\tfrac{${n1(cap.a)}}{2}\\right) = ${n1(cap.Mn)}\\ \\text{kN·m}` },
        { tex: `\\phi M_n = ${n1(cap.phiMn)}\\ \\text{kN·m}\\ ${check.state === 'fail' ? '<' : '\\ge'}\\ M_u = ${n1(i.Mu)}\\ \\text{kN·m}` },
      ],
    }
  },
}

// ── 2 · φ and tension control ──────────────────────────────────────────────
const phiProv: Provision = {
  id: 'rc-beam-phi',
  title: 'Strength reduction factor and tension control',
  category: 'concrete',
  component: 'Beam',
  summary: 'The strength reduction factor φ for flexure is not fixed: it follows the net tensile strain εt in the extreme tension steel at nominal strength. A section with εt ≥ 0.005 is tension-controlled (φ = 0.90); at or below the steel yield strain it is compression-controlled (φ = 0.65); in between φ is interpolated. A beam must also keep εt at or above a minimum so that it fails with warning.',
  why: 'A beam that fails by the steel stretching gives visible cracking and deflection first; one that fails by the concrete crushing gives none. Tying φ to εt rewards the ductile kind and penalises the brittle kind, and the minimum εt rules the brittle kind out for beams.',
  mistakes: [
    'Measuring εt at the steel centroid d instead of the extreme layer dt when there are two layers.',
    'Adding tension steel to fix a strength shortfall can push the section into the transition zone, where φ drops; compression steel or a deeper section is often the better fix.',
  ],
  refs: {
    phi: ref('§421.2.2', 'φ against εt', 'ACI 318-14 Table 21.2.2'),
    limit: ref('§409.3.3.1', 'Minimum εt for non-prestressed beams', 'ACI 318-14 §9.3.3.1'),
  },
  variables: {
    et: { tex: '\\varepsilon_t', name: 'Net tensile strain at the extreme tension layer', unit: '—', role: 'demand' },
    ety: { tex: '\\varepsilon_{ty}', name: 'Yield strain of the bars, fy/Es', unit: '—', role: 'material', note: 'Es = 200 000 MPa.' },
    phi: { tex: '\\phi', name: 'Strength reduction factor for flexure', unit: '—', role: 'factor' },
    etMin: { tex: '\\varepsilon_{t,\\min}', name: 'Minimum net tensile strain for a beam', unit: '—', role: 'capacity', note: 'Zeta designs to 0.005 (tension-controlled), which also satisfies this.' },
  },
  equations: [
    { id: 'tc', label: 'Tension-controlled', tex: '\\varepsilon_t \\ge 0.005 \\;\\Rightarrow\\; \\phi = 0.90', vars: ['et', 'phi'], ref: 'phi' },
    { id: 'tr', label: 'Transition', tex: '\\phi = 0.65 + 0.25\\,\\dfrac{\\varepsilon_t - \\varepsilon_{ty}}{0.005 - \\varepsilon_{ty}}', vars: ['phi', 'et', 'ety'], when: 'εty < εt < 0.005', ref: 'phi' },
    { id: 'cc', label: 'Compression-controlled', tex: '\\varepsilon_t \\le \\varepsilon_{ty} \\;\\Rightarrow\\; \\phi = 0.65', vars: ['et', 'ety', 'phi'], when: 'tied sections', ref: 'phi' },
    { id: 'min', label: 'Beam ductility limit', tex: '\\varepsilon_t \\ge 0.004', vars: ['et', 'etMin'], ref: 'limit' },
  ],
  diagram: 'rc-beam-flexure',
  calculators: CALC_BEAM,
  related: ['rc-beam-flexure', 'rc-beam-min-steel'],
  verification: 'engine-matched',
  flow: phiFlow,
  keywords: ['phi', 'strength reduction', 'tension controlled', 'compression controlled', 'transition', 'net tensile strain', 'ductility', 'over-reinforced', 'rho max'],
  evaluate(i) {
    const d = effDepth(i), As = steelArea(i)
    const cap = rectCapacity(i.b, d, d, As, i.fc, i.fy)
    const ety = i.fy / 200000
    const phi = phiFromStrain(cap.et, i.fy)
    const zone = cap.et >= 0.005 ? 'tension-controlled' : cap.et <= ety ? 'compression-controlled' : 'in the transition zone'
    return {
      values: { et: cap.et, ety, phi, etMin: 0.004 },
      checks: [{ label: 'εt ≥ 0.004', demand: 0.004, capacity: cap.et, unit: '', state: checkState(0.004, cap.et), ref: 'limit' }],
      lines: [
        { tex: `\\varepsilon_{ty} = \\dfrac{f_y}{E_s} = \\dfrac{${i.fy}}{200\\,000} = ${n4(ety)}` },
        { tex: `\\varepsilon_t = 0.003\\,\\dfrac{d_t - c}{c} = ${n4(cap.et)}` },
        { text: `The section is ${zone}, so φ = ${n3(phi)}.` },
        { tex: `\\varepsilon_t = ${n4(cap.et)}\\ ${cap.et >= 0.004 ? '\\ge' : '<'}\\ 0.004` },
      ],
    }
  },
}

// ── 3 · minimum flexural steel ─────────────────────────────────────────────
const minSteel: Provision = {
  id: 'rc-beam-min-steel',
  title: 'Minimum flexural reinforcement',
  category: 'concrete',
  component: 'Beam',
  summary: 'Wherever tension steel is needed by analysis, a beam must carry at least a minimum area of it: the larger of two ratios times bw·d, one tied to the concrete strength and one fixed.',
  why: 'A lightly loaded, deep section can crack at a moment larger than the strength its few bars provide — so the moment that cracks it would also break it, with no warning. The minimum steel keeps the post-cracking strength above the cracking moment.',
  mistakes: [
    'Using the flange width of a T-beam in the minimum instead of the web width.',
    'Treating minimum steel as optional where the computed steel is small — it is the computed steel that is optional, not the minimum.',
  ],
  refs: {
    min: ref('§409.6.1.2', 'As,min for beams', 'ACI 318-14 §9.6.1.2'),
  },
  variables: {
    ...COMMON_VARS,
    AsMin: { tex: 'A_{s,\\min}', name: 'Minimum tension steel', unit: 'mm²', role: 'capacity' },
    rhoMin: { tex: '\\rho_{\\min}', name: 'Governing minimum ratio', unit: '—', role: 'factor' },
  },
  equations: [
    { id: 'min', label: 'Minimum area', tex: "A_{s,\\min} = \\max\\!\\left(\\dfrac{0.25\\sqrt{f'_c}}{f_y},\\ \\dfrac{1.4}{f_y}\\right) b_w d", vars: ['AsMin', 'fc', 'fy', 'b', 'd'], ref: 'min' },
    { id: 'check', label: 'Provided steel', tex: 'A_s \\ge A_{s,\\min}', vars: ['As', 'AsMin'], ref: 'min' },
  ],
  diagram: 'rc-beam-flexure',
  calculators: CALC_BEAM,
  related: ['rc-beam-flexure', 'rc-beam-phi'],
  verification: 'engine-matched',
  keywords: ['minimum steel', 'As min', 'rho min', 'cracking moment', '1.4/fy'],
  evaluate(i) {
    const d = effDepth(i), As = steelArea(i)
    const r = rhoMin(i.fc, i.fy), AsMin = r * i.b * d
    const a = (0.25 * Math.sqrt(i.fc)) / i.fy, c = 1.4 / i.fy
    return {
      values: { b: i.b, d, fc: i.fc, fy: i.fy, As, AsMin, rhoMin: r },
      checks: [{ label: 'As ≥ As,min', demand: AsMin, capacity: As, unit: 'mm²', state: checkState(AsMin, As), ref: 'min' }],
      lines: [
        { tex: `\\dfrac{0.25\\sqrt{${i.fc}}}{${i.fy}} = ${n4(a)},\\qquad \\dfrac{1.4}{${i.fy}} = ${n4(c)}\\ \\Rightarrow\\ \\rho_{\\min} = ${n4(r)}` },
        { tex: `A_{s,\\min} = ${n4(r)}\\cdot${i.b}\\cdot${n1(d)} = ${n0(AsMin)}\\ \\text{mm}^2` },
        { tex: `A_s = ${n0(As)}\\ \\text{mm}^2\\ ${As >= AsMin ? '\\ge' : '<'}\\ ${n0(AsMin)}\\ \\text{mm}^2` },
      ],
    }
  },
}

// ── 4 · one-way shear ──────────────────────────────────────────────────────
const shear: Provision = {
  id: 'rc-beam-shear',
  title: 'One-way shear in beams',
  category: 'concrete',
  component: 'Beam',
  summary: 'Shear is carried by the concrete (Vc) and by vertical stirrups crossing the diagonal crack (Vs). The beam is adequate when Vu ≤ φ(Vc + Vs). Stirrups are spaced no wider than a limit that halves when the stirrups work hard, carry at least a minimum area once Vu exceeds ½φVc, and Vs itself is capped so the concrete struts do not crush first.',
  why: 'Shear failure is sudden: a diagonal crack opens and the beam drops without the long warning a flexural failure gives. Stirrups tie the crack shut, and the spacing limit makes sure every potential crack is crossed by at least one of them.',
  mistakes: [
    'Spacing stirrups by strength alone and missing the maximum-spacing limit.',
    'Forgetting that the spacing limit tightens once Vs passes 0.33√f′c·bw·d.',
    'Counting only one leg of a closed stirrup in Av.',
  ],
  refs: {
    vc: ref('§422.5.5.1', 'Concrete shear strength Vc', 'ACI 318-14 Table 22.5.5.1'),
    vs: ref('§422.5.10.5.3', 'Stirrup shear strength Vs', 'ACI 318-14 §22.5.10.5.3'),
    vsMax: ref('§422.5.1.2', 'Upper limit on shear strength', 'ACI 318-14 §22.5.1.2'),
    smax: ref('§409.7.6.2.2', 'Maximum stirrup spacing', 'ACI 318-14 Table 9.7.6.2.2'),
    avmin: ref('§409.6.3.3', 'Minimum shear reinforcement', 'ACI 318-14 Table 9.6.3.3'),
    need: ref('§409.6.3.1', 'When minimum stirrups are required', 'ACI 318-14 §9.6.3.1'),
    phi: ref('§421.2.1', 'φ = 0.75 for shear', 'ACI 318-14 Table 21.2.1'),
  },
  variables: {
    b: COMMON_VARS.b, d: COMMON_VARS.d, fc: COMMON_VARS.fc,
    fyt: { tex: 'f_{yt}', name: 'Yield strength of the stirrups', unit: 'MPa', role: 'material' },
    Vu: { tex: 'V_u', name: 'Factored shear demand', unit: 'kN', role: 'demand', note: 'Usually taken at d from the support face.' },
    Vc: { tex: 'V_c', name: 'Shear carried by the concrete', unit: 'kN', role: 'capacity' },
    Av: { tex: 'A_v', name: 'Area of all stirrup legs at one spacing', unit: 'mm²', role: 'geometry' },
    s: { tex: 's', name: 'Stirrup spacing along the beam', unit: 'mm', role: 'geometry' },
    Vs: { tex: 'V_s', name: 'Shear carried by the stirrups', unit: 'kN', role: 'capacity' },
    VsMax: { tex: 'V_{s,\\max}', name: 'Largest Vs the section may count on', unit: 'kN', role: 'capacity', note: 'Zeta evaluates the coefficient as 2/3 (0.667); the SI code prints 0.66.' },
    phiVn: { tex: '\\phi V_n', name: 'Design shear strength φ(Vc + Vs)', unit: 'kN', role: 'capacity' },
    sMax: { tex: 's_{\\max}', name: 'Maximum stirrup spacing', unit: 'mm', role: 'capacity' },
    lambda: { tex: '\\lambda', name: 'Lightweight-concrete factor (1.0 for normal weight)', unit: '—', role: 'factor' },
  },
  equations: [
    { id: 'vc', label: 'Concrete contribution', tex: "V_c = 0.17\\,\\lambda\\sqrt{f'_c}\\, b_w d", vars: ['Vc', 'lambda', 'fc', 'b', 'd'], ref: 'vc' },
    { id: 'vs', label: 'Stirrup contribution', tex: 'V_s = \\dfrac{A_v f_{yt}\\, d}{s}', vars: ['Vs', 'Av', 'fyt', 'd', 's'], ref: 'vs' },
    { id: 'vsmax', label: 'Upper limit on Vs', tex: "V_s \\le 0.66\\sqrt{f'_c}\\, b_w d", vars: ['Vs', 'VsMax', 'fc', 'b', 'd'], ref: 'vsMax' },
    { id: 'smax', label: 'Maximum spacing', tex: "s_{\\max} = \\begin{cases} \\min(d/2,\\ 600) & V_s \\le 0.33\\sqrt{f'_c}\\,b_w d \\\\ \\min(d/4,\\ 300) & \\text{otherwise} \\end{cases}", vars: ['sMax', 'd', 'Vs'], ref: 'smax' },
    { id: 'avmin', label: 'Minimum stirrups', tex: "\\dfrac{A_v}{s} \\ge \\max\\!\\left(0.062\\sqrt{f'_c},\\ 0.35\\right)\\dfrac{b_w}{f_{yt}}", vars: ['Av', 's', 'fc', 'b', 'fyt'], when: 'Vu > ½φVc', ref: 'avmin' },
    { id: 'check', label: 'Design check', tex: 'V_u \\le \\phi\\,(V_c + V_s)', vars: ['Vu', 'Vc', 'Vs', 'phiVn'], ref: 'vs' },
  ],
  diagram: 'rc-beam-shear',
  calculators: CALC_BEAM,
  related: ['rc-beam-flexure'],
  verification: 'engine-matched',
  keywords: ['shear', 'stirrups', 'Vc', 'Vs', 'spacing', 'diagonal tension', 'Av min', 'phi Vn'],
  flow: shearFlow,
  evaluate(i) {
    const d = effDepth(i)
    const Vc = oneWayVc({ fc: i.fc, b: i.b, d })
    const Av = i.legs * (Math.PI / 4) * i.stirrupDia ** 2
    const VsRaw = (Av * i.fyt * d) / i.s / 1000
    const VsMax = ((2 / 3) * Math.sqrt(i.fc) * i.b * d) / 1000
    const Vs = Math.min(VsRaw, VsMax)
    const phiVn = PHI_SHEAR * (Vc + Vs)
    const heavy = VsRaw > (Math.sqrt(i.fc) * i.b * d) / 3 / 1000
    const sMax = heavy ? Math.min(d / 4, 300) : Math.min(d / 2, 600)
    const avsMin = Math.max(0.062 * Math.sqrt(i.fc), 0.35) * i.b / i.fyt
    const needMin = i.Vu > 0.5 * PHI_SHEAR * Vc
    const checks: ExampleCheck[] = [
      { label: 'Vu ≤ φ(Vc + Vs)', demand: i.Vu, capacity: phiVn, unit: 'kN', state: checkState(i.Vu, phiVn), ref: 'vs' },
      { label: 's ≤ s,max', demand: i.s, capacity: sMax, unit: 'mm', state: checkState(i.s, sMax), ref: 'smax' },
      { label: 'Vs ≤ Vs,max', demand: VsRaw, capacity: VsMax, unit: 'kN', state: checkState(VsRaw, VsMax), ref: 'vsMax' },
    ]
    if (needMin) checks.push({ label: 'Av/s ≥ (Av/s)min', demand: avsMin, capacity: Av / i.s, unit: 'mm²/mm', state: checkState(avsMin, Av / i.s), ref: 'avmin' })
    return {
      values: { b: i.b, d, fc: i.fc, fyt: i.fyt, Vu: i.Vu, Vc, Av, s: i.s, Vs, VsMax, phiVn, sMax, lambda: 1 },
      checks,
      lines: [
        { tex: `V_c = 0.17\\sqrt{${i.fc}}\\cdot${i.b}\\cdot${n1(d)} = ${n1(Vc)}\\ \\text{kN},\\qquad \\tfrac12\\phi V_c = ${n1(0.5 * PHI_SHEAR * Vc)}\\ \\text{kN}` },
        { text: needMin ? `Vu = ${n1(i.Vu)} kN exceeds ½φVc, so at least the minimum stirrups are required.` : `Vu = ${n1(i.Vu)} kN is within ½φVc; stirrups are not required by strength here (detailing may still call for them).` },
        { tex: `A_v = ${i.legs}\\cdot\\tfrac{\\pi}{4}(${i.stirrupDia})^2 = ${n1(Av)}\\ \\text{mm}^2,\\quad V_s = \\dfrac{${n1(Av)}\\cdot${i.fyt}\\cdot${n1(d)}}{${i.s}} = ${n1(VsRaw)}\\ \\text{kN}` },
        { tex: `V_{s,\\max} = \\tfrac23\\sqrt{${i.fc}}\\cdot${i.b}\\cdot${n1(d)} = ${n1(VsMax)}\\ \\text{kN}` },
        { tex: `s_{\\max} = ${heavy ? `\\min(d/4,\\,300)` : `\\min(d/2,\\,600)`} = ${n0(sMax)}\\ \\text{mm}` },
        { tex: `\\phi V_n = 0.75\\,(${n1(Vc)} + ${n1(Vs)}) = ${n1(phiVn)}\\ \\text{kN}\\ ${i.Vu <= phiVn ? '\\ge' : '<'}\\ V_u = ${n1(i.Vu)}\\ \\text{kN}` },
        { tex: `\\left(\\tfrac{A_v}{s}\\right)_{\\min} = ${n4(avsMin)}\\ \\text{mm}^2/\\text{mm};\\quad \\tfrac{A_v}{s} = ${n4(Av / i.s)}` },
      ],
    }
  },
}

// ── walkthrough and flowcharts ─────────────────────────────────────────────

/** The flexure diagram built up the way the strength is derived: steel → block → N.A. → strain → couple → φ. */
export function flexureWalk(i: BeamExampleInput): WalkStep[] {
  const d = effDepth(i), As = steelArea(i)
  const cap = rectCapacity(i.b, d, d, As, i.fc, i.fy)
  const b1 = beta1(i.fc), ety = i.fy / 200000
  const T = (As * cap.fs) / 1000
  return [
    { title: 'The tension steel', layers: ['stirrup', 'bars'], hl: 'As',
      text: `${i.nBars} bars of ⌀${i.barDia} sit at the effective depth d = ${n1(d)} mm, measured from the compression face to their centroid.`,
      tex: `A_s = ${n0(As)}\\ \\text{mm}^2,\\quad d = ${n1(d)}\\ \\text{mm}` },
    { title: 'Equilibrium sizes the compression block', layers: ['stirrup', 'bars', 'block', 'forces'], hl: 'a',
      text: cap.fsYields
        ? 'Assume the steel yields, so T = As·fy. The concrete balances it with a uniform 0.85f′c block of depth a: C = T.'
        : 'If the steel yielded, the block would be too deep for it to — so fs < fy, and C = T is solved together with strain compatibility.',
      tex: `0.85\\,f'_c\\,a\\,b_w = A_s f_s \\;\\Rightarrow\\; a = ${n1(cap.a)}\\ \\text{mm}` },
    { title: 'The neutral axis', layers: ['stirrup', 'bars', 'block', 'forces', 'na'], hl: 'c',
      text: `The block is shallower than the true compression zone by β1 = ${n3(b1)}; the neutral axis sits at c = a/β1.`,
      tex: `c = \\dfrac{${n1(cap.a)}}{${n3(b1)}} = ${n1(cap.c)}\\ \\text{mm}` },
    { title: 'Strain compatibility', layers: ['stirrup', 'bars', 'block', 'forces', 'na', 'strain'], hl: 'et',
      text: `Plane sections stay plane: with 0.003 at the top fibre and zero at the neutral axis, the strain at the steel follows by similar triangles. εt ${cap.et >= ety ? '≥' : '<'} εty = ${n4(ety)}, so the steel ${cap.fsYields ? 'has yielded — the assumption holds' : 'has not yielded'}.`,
      tex: `\\varepsilon_t = 0.003\\,\\dfrac{${n1(d)} - ${n1(cap.c)}}{${n1(cap.c)}} = ${n4(cap.et)}` },
    { title: 'The internal couple', layers: ['stirrup', 'bars', 'block', 'forces', 'na', 'strain'], hl: 'Mn',
      text: `C and T are equal and opposite, ${n1(T)} kN each, a lever arm d − a/2 apart. Their couple is the nominal strength.`,
      tex: `M_n = ${n1(T)}\\cdot\\left(${n1(d)} - \\tfrac{${n1(cap.a)}}{2}\\right)/1000 = ${n1(cap.Mn)}\\ \\text{kN·m}` },
    { title: 'Design strength and the check', layers: ['stirrup', 'bars', 'block', 'forces', 'na', 'strain'], hl: 'phiMn',
      text: `εt = ${n4(cap.et)} gives φ = ${n3(cap.phi)}. The section ${i.Mu <= cap.phiMn ? 'carries' : 'does NOT carry'} the factored moment.`,
      tex: `\\phi M_n = ${n3(cap.phi)}\\cdot${n1(cap.Mn)} = ${n1(cap.phiMn)}\\ ${i.Mu <= cap.phiMn ? '\\ge' : '<'}\\ M_u = ${n1(i.Mu)}\\ \\text{kN·m}` },
  ]
}

/** φ for flexure from the net tensile strain (§421.2.2), with the beam ductility floor (§409.3.3.1). */
export function phiFlow(i: BeamExampleInput): Flowchart {
  const d = effDepth(i), As = steelArea(i)
  const cap = rectCapacity(i.b, d, d, As, i.fc, i.fy)
  const et = cap.et, ety = i.fy / 200000
  const phi = phiFromStrain(et, i.fy)
  return {
    title: 'Which φ applies?',
    steps: [
      { kind: 'start', text: `From equilibrium: εt = 0.003(dt − c)/c = ${n4(et)}`, ref: 'phi' },
      { kind: 'decision', text: 'εt ≥ 0.005 ?', ref: 'phi', next: 'No',
        branch: { when: 'Yes', taken: et >= 0.005, to: { kind: 'end', text: 'Tension-controlled: φ = 0.90', state: 'pass' } } },
      { kind: 'decision', text: 'εt ≥ 0.004 ?  (beam ductility floor)', ref: 'limit', next: 'Yes',
        branch: { when: 'No', taken: et < 0.004, to: { kind: 'end', text: 'Not permitted in a beam — add compression steel or deepen it', state: 'fail' } } },
      { kind: 'end', ref: 'phi', state: 'limit',
        text: `Transition: φ = 0.65 + 0.25(εt − εty)/(0.005 − εty)${et < 0.005 && et >= 0.004 ? ` = ${n3(phi)}` : ''}, with εty = ${n4(ety)}` },
    ],
  }
}

/** The stirrup decision for a factored shear Vu (§409.6.3.1, §422.5, §409.7.6.2.2). */
export function shearFlow(i: BeamExampleInput): Flowchart {
  const d = effDepth(i)
  const Vc = oneWayVc({ fc: i.fc, b: i.b, d })
  const phiVc = PHI_SHEAR * Vc
  const VsReq = Math.max(0, i.Vu / PHI_SHEAR - Vc)
  const VsMax = ((2 / 3) * Math.sqrt(i.fc) * i.b * d) / 1000
  const VsHalf = (Math.sqrt(i.fc) * i.b * d) / 3 / 1000
  const light = i.Vu <= 0.5 * phiVc, minOnly = !light && i.Vu <= phiVc
  const tooBig = !light && !minOnly && VsReq > VsMax
  const loose = !light && !minOnly && !tooBig && VsReq <= VsHalf
  return {
    title: 'Are stirrups needed, and how close?',
    steps: [
      { kind: 'start', text: `Vc = 0.17λ√f′c·bw·d = ${n1(Vc)} kN,  φVc = ${n1(phiVc)} kN`, ref: 'vc' },
      { kind: 'decision', text: `Vu ≤ ½φVc ?  (${n1(i.Vu)} vs ${n1(0.5 * phiVc)} kN)`, ref: 'need', next: 'No',
        branch: { when: 'Yes', taken: light, to: { kind: 'end', text: 'No stirrups required by strength', state: 'pass' } } },
      { kind: 'decision', text: `Vu ≤ φVc ?  (${n1(i.Vu)} vs ${n1(phiVc)} kN)`, ref: 'avmin', next: 'No',
        branch: { when: 'Yes', taken: minOnly, to: { kind: 'end', text: `Minimum stirrups, s ≤ min(d/2, 600) = ${n0(Math.min(d / 2, 600))} mm`, state: 'pass' } } },
      { kind: 'process', text: `Stirrups must carry Vs = Vu/φ − Vc = ${n1(VsReq)} kN`, ref: 'vs' },
      { kind: 'decision', text: `Vs ≤ ⅔√f′c·bw·d ?  (${n1(VsReq)} vs ${n1(VsMax)} kN)`, ref: 'vsMax', next: 'Yes',
        branch: { when: 'No', taken: tooBig, to: { kind: 'end', text: 'Section too small — enlarge bw or d', state: 'fail' } } },
      { kind: 'decision', text: `Vs ≤ ⅓√f′c·bw·d ?  (${n1(VsReq)} vs ${n1(VsHalf)} kN)`, ref: 'smax', next: 'No',
        branch: { when: 'Yes', taken: loose, to: { kind: 'end', text: `s ≤ min(d/2, 600) = ${n0(Math.min(d / 2, 600))} mm`, state: 'pass' } } },
      { kind: 'end', text: `Spacing limit halves: s ≤ min(d/4, 300) = ${n0(Math.min(d / 4, 300))} mm`, ref: 'smax', state: 'limit' },
    ],
  }
}

export const RC_BEAM_PROVISIONS: Provision[] = [flexure, phiProv, minSteel, shear]
