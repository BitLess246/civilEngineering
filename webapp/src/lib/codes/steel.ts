// Code Library — structural steel members (NSCP 2015 Chapter 5, which adopts
// AISC 360; Zeta's engine follows the 360-16 edition, cited as the parallel).
//
// Every number comes from the engine functions the Model Space steel schedule
// and the Steel Beam / Steel Column calculators use — `beamFlexure` and
// `beamShear` (engine/steelDesign) and `steelCompression` (engine/
// steelCompression), called exactly as the pipeline calls them — so the
// explanation and the design cannot drift apart; `codes.test.ts` holds each
// example to the engine and the flexure numbers to AISC Table 3-2. The prose is
// Zeta's own; no code text is reproduced.
//
// Chapter 5 section numbers follow AISC's chapter letters (§505 = Chapter E,
// §506 = F, §507 = G), as the compression engine's own header cites them.
// Units: mm, MPa, m (lengths the user types), kN, kN·m.
import { AISC_SHAPES, shapeByName } from '../../engine/aiscSections'
import { deriveWSection, beamFlexure, beamShear, E_STEEL } from '../../engine/steelDesign'
import { steelCompression } from '../../engine/steelCompression'
import type { CodeRef, ExampleResult, InputField, SteelExampleInput, SteelProvision } from './types'
import { checkState } from './types'

const ED = 'NSCP 2015' as const
const ref = (clause: string, topic: string, parallel?: string): CodeRef => ({ edition: ED, clause, topic, parallel })
const n0 = (v: number) => Math.round(v).toString()
const n1 = (v: number) => v.toFixed(1)
const n2 = (v: number) => v.toFixed(2)
const n3 = (v: number) => v.toFixed(3)

/** W-shapes in the catalogue — §F2/§F3 cover doubly-symmetric I-shapes only. */
export const W_SHAPES: readonly string[] = AISC_SHAPES.filter((s) => s.family === 'W').map((s) => s.name)

export const DEFAULT_STEEL_BEAM: SteelExampleInput = {
  shape: 'W460x74', Fy: 345, Lb: 3, Cb: 1, Mu: 350, Vu: 300, L: 4, Kx: 1, Ky: 1, Pu: 1500,
}
export const DEFAULT_STEEL_COLUMN: SteelExampleInput = { ...DEFAULT_STEEL_BEAM, shape: 'W310x97', L: 4.5, Pu: 2500 }

const SHAPE: InputField<SteelExampleInput> = { key: 'shape', label: 'Shape', options: W_SHAPES }
const FY: InputField<SteelExampleInput> = { key: 'Fy', label: 'Fy', unit: 'MPa', min: 200, max: 500 }
const CALC_BEAM = [{ to: '/steel/beam', label: 'Open Steel Beam' }]
const CALC_COL = [{ to: '/steel/column', label: 'Open Steel Column' }]

/** A result for a shape the provision does not cover — said, not computed. */
const outOfScope = (why: string): ExampleResult => ({ values: {}, checks: [], lines: [{ text: why }] })

const shapeOf = (name: string) => {
  const s = shapeByName(name)
  return s && s.family === 'W' && s.d && s.bf && s.tf && s.tw ? s : undefined
}

// ── 1 · flexure, §F2 / §F3 ────────────────────────────────────────────────
const flexure: SteelProvision = {
  family: 'steel',
  defaults: DEFAULT_STEEL_BEAM,
  fields: [SHAPE, FY, { key: 'Lb', label: 'Lb', unit: 'm', min: 0, max: 30 }, { key: 'Cb', label: 'Cb', min: 1, max: 3 }, { key: 'Mu', label: 'Mu', unit: 'kN·m', min: 0 }],
  id: 'steel-beam-flexure',
  title: 'Flexural strength of a steel I-beam',
  category: 'steel',
  component: 'Beam',
  summary: 'A compact I-beam reaches its plastic moment Mp = Fy·Zx only if its compression flange is braced closely enough. Past the length Lp the flange can buckle sideways and twist — lateral–torsional buckling — and the strength falls, first linearly to 0.7Fy·Sx at Lr, then along the elastic buckling curve. The design strength is φb·Mn with φb = 0.90.',
  why: 'The compression flange of a beam is a column held up only by the web. Unbraced over a long length it buckles out of plane and the section rotates, long before the steel yields. Bracing length, not just section size, decides the strength.',
  mistakes: [
    'Taking Mn = Mp without checking the unbraced length Lb against Lp.',
    'Using the span as Lb when the compression flange is braced by the deck or by joists at closer spacing.',
    'Applying Cb = 1 to a cantilever or to a beam whose moment diagram is far from uniform — Cb is conservative at 1 only for uniform moment.',
    'Assuming every W-shape is compact: several have noncompact flanges at higher Fy, which brings in §F3 flange local buckling.',
  ],
  refs: {
    phi: ref('§506.1', 'φb = 0.90 for flexure', 'AISC 360-16 §F1'),
    f2: ref('§506.2', 'Compact doubly symmetric I-shapes', 'AISC 360-16 §F2'),
    f3: ref('§506.3', 'Noncompact or slender flanges', 'AISC 360-16 §F3'),
    b4: ref('§502.4', 'Width-to-thickness classification', 'AISC 360-16 Table B4.1b'),
  },
  variables: {
    Fy: { tex: 'F_y', name: 'Specified yield stress', unit: 'MPa', role: 'material' },
    Zx: { tex: 'Z_x', name: 'Plastic section modulus, strong axis', unit: 'mm³', role: 'geometry' },
    Sx: { tex: 'S_x', name: 'Elastic section modulus, strong axis', unit: 'mm³', role: 'geometry' },
    ry: { tex: 'r_y', name: 'Radius of gyration about the weak axis', unit: 'mm', role: 'geometry' },
    rts: { tex: 'r_{ts}', name: 'Effective radius of gyration for LTB', unit: 'mm', role: 'geometry' },
    Mp: { tex: 'M_p', name: 'Plastic moment', unit: 'kN·m', role: 'capacity' },
    Lb: { tex: 'L_b', name: 'Unbraced length of the compression flange', unit: 'm', role: 'geometry' },
    Lp: { tex: 'L_p', name: 'Limiting length for full plastic strength', unit: 'm', role: 'intermediate' },
    Lr: { tex: 'L_r', name: 'Limiting length for inelastic LTB', unit: 'm', role: 'intermediate', note: 'Zeta derives J from plate dimensions (no fillets), so Lr runs a few percent short of the tables — the conservative side.' },
    Cb: { tex: 'C_b', name: 'Moment-gradient factor', unit: '—', role: 'factor' },
    Mn: { tex: 'M_n', name: 'Nominal flexural strength', unit: 'kN·m', role: 'capacity' },
    phiMn: { tex: '\\phi_b M_n', name: 'Design flexural strength', unit: 'kN·m', role: 'capacity' },
    Mu: { tex: 'M_u', name: 'Factored moment demand', unit: 'kN·m', role: 'demand' },
  },
  equations: [
    { id: 'mp', label: 'Yielding', tex: 'M_n = M_p = F_y Z_x', vars: ['Mn', 'Mp', 'Fy', 'Zx'], when: 'Lb ≤ Lp', ref: 'f2' },
    { id: 'lp', label: 'Limit for full plastic strength', tex: 'L_p = 1.76\\, r_y \\sqrt{E/F_y}', vars: ['Lp', 'ry', 'Fy'], ref: 'f2' },
    { id: 'inel', label: 'Inelastic LTB', tex: 'M_n = C_b\\left[M_p - (M_p - 0.7F_yS_x)\\dfrac{L_b - L_p}{L_r - L_p}\\right] \\le M_p', vars: ['Mn', 'Cb', 'Mp', 'Fy', 'Sx', 'Lb', 'Lp', 'Lr'], when: 'Lp < Lb ≤ Lr', ref: 'f2' },
    { id: 'el', label: 'Elastic LTB', tex: 'M_n = F_{cr}S_x,\\quad F_{cr} = \\dfrac{C_b\\pi^2E}{(L_b/r_{ts})^2}\\sqrt{1 + 0.078\\dfrac{J}{S_xh_o}\\left(\\dfrac{L_b}{r_{ts}}\\right)^2}', vars: ['Mn', 'Cb', 'Lb', 'rts', 'Sx'], when: 'Lb > Lr', ref: 'f2' },
    { id: 'check', label: 'Design check', tex: 'M_u \\le \\phi_b M_n,\\quad \\phi_b = 0.90', vars: ['Mu', 'phiMn', 'Mn'], ref: 'phi' },
  ],
  diagram: 'steel-ltb-curve',
  calculators: CALC_BEAM,
  related: ['steel-beam-shear', 'steel-column-compression'],
  verification: 'engine-matched',
  keywords: ['steel', 'beam', 'flexure', 'LTB', 'lateral torsional buckling', 'Lb', 'Lp', 'Lr', 'Cb', 'Mp', 'plastic moment', 'wide flange', 'W shape'],
  evaluate(i) {
    const s = shapeOf(i.shape)
    if (!s) return outOfScope(`${i.shape} is not a W-shape in the catalogue — §F2/§F3 cover doubly-symmetric I-shapes.`)
    const p = deriveWSection(s)
    const r = beamFlexure(s, p, i.Fy, i.Lb * 1000, i.Cb)
    if (!r.applicable) return outOfScope(r.reason ?? `${s.name} is outside §F2/§F3.`)
    const check = { label: 'Mu ≤ φbMn', demand: i.Mu, capacity: r.phiMn, unit: 'kN·m', state: checkState(i.Mu, r.phiMn), ref: 'phi' }
    const zone = r.governing === 'FLB' ? `flange local buckling governs (§F3, λf = ${n2(r.lambdaF)})`
      : r.ltbZone === 'plastic' ? 'Lb ≤ Lp: the full plastic moment is reached'
        : r.ltbZone === 'inelastic' ? 'Lp < Lb ≤ Lr: inelastic lateral–torsional buckling' : 'Lb > Lr: elastic lateral–torsional buckling'
    return {
      values: { Fy: i.Fy, Zx: p.Zx, Sx: p.Sx, ry: s.ry, rts: p.rts, Mp: r.Mp, Lb: i.Lb, Lp: r.Lp / 1000, Lr: r.Lr / 1000, Cb: i.Cb, Mn: r.Mn, phiMn: r.phiMn, Mu: i.Mu },
      checks: [check],
      lines: [
        { tex: `M_p = F_yZ_x = ${i.Fy}\\cdot${n0(p.Zx)}/10^6 = ${n1(r.Mp)}\\ \\text{kN·m}` },
        { tex: `L_p = 1.76\\,(${n1(s.ry)})\\sqrt{${E_STEEL}/${i.Fy}} = ${n0(r.Lp)}\\ \\text{mm},\\qquad L_r = ${n0(r.Lr)}\\ \\text{mm}` },
        { text: `${s.name}: flange ${r.flangeClass}, web ${r.webClass} — §${r.clause}. With Lb = ${n2(i.Lb)} m, ${zone}.` },
        { tex: `M_n = ${n1(r.Mn)}\\ \\text{kN·m},\\qquad \\phi_bM_n = 0.90\\cdot${n1(r.Mn)} = ${n1(r.phiMn)}\\ \\text{kN·m}\\ ${check.state === 'fail' ? '<' : '\\ge'}\\ M_u = ${n1(i.Mu)}` },
      ],
    }
  },
  flow(i) {
    const s = shapeOf(i.shape)
    const r = s ? beamFlexure(s, deriveWSection(s), i.Fy, i.Lb * 1000, i.Cb) : undefined
    const ok = !!r?.applicable
    return {
      title: 'Which limit state governs?',
      steps: [
        { kind: 'start', text: `Classify ${i.shape} at Fy = ${i.Fy} MPa (Table B4.1b)`, ref: 'b4' },
        { kind: 'decision', text: 'Web compact?', ref: 'b4', next: 'Yes',
          branch: { when: 'No', taken: !!r && r.webClass !== 'compact', to: { kind: 'end', text: 'Noncompact / slender web: §F4/§F5 — not covered here', state: 'fail' } } },
        { kind: 'decision', text: 'Flange compact?', ref: 'b4', next: 'Yes, or LTB is lower',
          branch: { when: 'No', taken: ok && r!.flangeClass !== 'compact' && r!.governing === 'FLB', to: { kind: 'end', text: `§F3: flange local buckling governs${r ? `, Mn = ${n1(r.MnFLB)} kN·m` : ''}`, state: 'limit' } } },
        { kind: 'decision', text: `Lb ≤ Lp ?  (${n2(i.Lb)} vs ${r ? n2(r.Lp / 1000) : '—'} m)`, ref: 'f2', next: 'No',
          branch: { when: 'Yes', taken: ok && r!.governing !== 'FLB' && r!.ltbZone === 'plastic', to: { kind: 'end', text: `Yielding: Mn = Mp${r ? ` = ${n1(r.Mp)} kN·m` : ''}`, state: 'pass' } } },
        { kind: 'decision', text: `Lb ≤ Lr ?  (${n2(i.Lb)} vs ${r ? n2(r.Lr / 1000) : '—'} m)`, ref: 'f2', next: 'No',
          branch: { when: 'Yes', taken: ok && r!.governing !== 'FLB' && r!.ltbZone === 'inelastic', to: { kind: 'end', text: 'Inelastic LTB: straight line from Mp to 0.7FySx', state: 'limit' } } },
        { kind: 'end', text: 'Elastic LTB: Mn = Fcr·Sx', ref: 'f2', state: 'fail' },
      ],
    }
  },
}

// ── 2 · shear, §G2.1 ──────────────────────────────────────────────────────
const shear: SteelProvision = {
  family: 'steel',
  defaults: DEFAULT_STEEL_BEAM,
  fields: [SHAPE, FY, { key: 'Vu', label: 'Vu', unit: 'kN', min: 0 }],
  id: 'steel-beam-shear',
  title: 'Shear strength of a steel I-beam web',
  category: 'steel',
  component: 'Beam',
  summary: 'The web of an I-beam carries the shear. Its nominal strength is the web area d·tw times the shear yield stress 0.6Fy, reduced by Cv1 only if the web is slender enough to buckle first. For almost every rolled W-shape the web is stocky enough that it yields in shear (Cv1 = 1.0) and φv = 1.00.',
  why: 'Shear in a beam runs through the thin web. A deep, thin web can buckle diagonally before it yields; the h/tw limit says when that cannot happen, and then the full yield strength of the web area is available.',
  mistakes: [
    'Using the flange area or the gross area instead of the web area d·tw.',
    'Applying φv = 0.90 to a rolled shape whose web meets the stockiness limit — it takes φv = 1.00.',
    'Forgetting that a coped or heavily notched end reduces the web available at the connection.',
  ],
  refs: {
    g2: ref('§507.2.1', 'Shear strength of webs without tension field', 'AISC 360-16 §G2.1'),
    phi: ref('§507.1', 'φv for shear', 'AISC 360-16 §G1'),
  },
  variables: {
    Fy: { tex: 'F_y', name: 'Specified yield stress', unit: 'MPa', role: 'material' },
    Aw: { tex: 'A_w', name: 'Web area, overall depth × web thickness', unit: 'mm²', role: 'geometry' },
    hwTw: { tex: 'h/t_w', name: 'Web slenderness', unit: '—', role: 'geometry' },
    lim: { tex: '2.24\\sqrt{E/F_y}', name: 'Stockiness limit for rolled I-shapes', unit: '—', role: 'factor' },
    Cv1: { tex: 'C_{v1}', name: 'Web shear strength coefficient', unit: '—', role: 'factor' },
    phiV: { tex: '\\phi_v', name: 'Resistance factor for shear', unit: '—', role: 'factor' },
    Vn: { tex: 'V_n', name: 'Nominal shear strength', unit: 'kN', role: 'capacity' },
    phiVn: { tex: '\\phi_vV_n', name: 'Design shear strength', unit: 'kN', role: 'capacity' },
    Vu: { tex: 'V_u', name: 'Factored shear demand', unit: 'kN', role: 'demand' },
  },
  equations: [
    { id: 'vn', label: 'Nominal strength', tex: 'V_n = 0.6F_yA_wC_{v1}', vars: ['Vn', 'Fy', 'Aw', 'Cv1'], ref: 'g2' },
    { id: 'stocky', label: 'Stocky web', tex: 'h/t_w \\le 2.24\\sqrt{E/F_y} \\;\\Rightarrow\\; \\phi_v = 1.00,\\ C_{v1} = 1.0', vars: ['hwTw', 'lim', 'phiV', 'Cv1'], when: 'rolled I-shapes', ref: 'g2' },
    { id: 'check', label: 'Design check', tex: 'V_u \\le \\phi_vV_n', vars: ['Vu', 'phiV', 'Vn', 'phiVn'], ref: 'phi' },
  ],
  diagram: 'steel-shear-web',
  calculators: CALC_BEAM,
  related: ['steel-beam-flexure'],
  verification: 'engine-matched',
  keywords: ['steel', 'shear', 'web', 'Aw', 'Cv1', 'h/tw', 'web yielding', 'web buckling'],
  evaluate(i) {
    const s = shapeOf(i.shape)
    if (!s) return outOfScope(`${i.shape} is not a W-shape in the catalogue.`)
    const p = deriveWSection(s)
    const r = beamShear(s, p, i.Fy)
    const lim = 2.24 * Math.sqrt(E_STEEL / i.Fy)
    const check = { label: 'Vu ≤ φvVn', demand: i.Vu, capacity: r.phiVn, unit: 'kN', state: checkState(i.Vu, r.phiVn), ref: 'phi' }
    return {
      values: { Fy: i.Fy, Aw: r.Aw, hwTw: r.hwTw, lim, Cv1: r.Cv1, phiV: r.phiV, Vn: r.Vn, phiVn: r.phiVn, Vu: i.Vu },
      checks: [check],
      lines: [
        { tex: `A_w = d\\,t_w = ${n0(s.d!)}\\cdot${n2(s.tw!)} = ${n0(r.Aw)}\\ \\text{mm}^2` },
        { tex: `h/t_w = ${n1(r.hwTw)}\\ ${r.slenderWeb ? '>' : '\\le'}\\ 2.24\\sqrt{${E_STEEL}/${i.Fy}} = ${n1(lim)} \\Rightarrow \\phi_v = ${n2(r.phiV)},\\ C_{v1} = ${n3(r.Cv1)}` },
        { tex: `\\phi_vV_n = ${n2(r.phiV)}\\cdot0.6\\cdot${i.Fy}\\cdot${n0(r.Aw)}\\cdot${n3(r.Cv1)}/1000 = ${n1(r.phiVn)}\\ \\text{kN}\\ ${check.state === 'fail' ? '<' : '\\ge'}\\ V_u = ${n1(i.Vu)}` },
      ],
    }
  },
}

// ── 3 · compression, §E3 (with §E4 and §E7 where they govern) ─────────────
const column: SteelProvision = {
  family: 'steel',
  defaults: DEFAULT_STEEL_COLUMN,
  fields: [SHAPE, FY, { key: 'L', label: 'L', unit: 'm', min: 0.5, max: 30 }, { key: 'Kx', label: 'Kx', min: 0.5, max: 10 }, { key: 'Ky', label: 'Ky', min: 0.5, max: 10 }, { key: 'Pu', label: 'Pu', unit: 'kN', min: 0 }],
  id: 'steel-column-compression',
  title: 'Compressive strength of a steel column',
  category: 'steel',
  component: 'Column',
  summary: 'A steel column fails by buckling, so its strength is set by its slenderness KL/r about the weaker axis. The elastic buckling stress Fe = π²E/(KL/r)² is turned into a critical stress Fcr: an inelastic curve for stocky members, 0.877Fe for slender ones, with the switch at KL/r = 4.71√(E/Fy). The design strength is φc·Fcr·Ag, φc = 0.90.',
  why: 'A perfectly straight column would carry its squash load Fy·Ag. Real columns are slightly crooked and carry residual stresses from rolling, so they bow sideways long before that. The column curve is the measured envelope of that behaviour.',
  mistakes: [
    'Checking only the strong axis — a W-shape almost always buckles about y unless it is braced about y at mid-height.',
    'Using K = 1 for a column in a sway frame, where it can be well above 1.',
    'Ignoring local buckling of slender flanges or webs, which reduces the effective area (§E7).',
  ],
  refs: {
    phi: ref('§505.1', 'φc = 0.90 for compression', 'AISC 360-16 §E1'),
    e3: ref('§505.3', 'Flexural buckling of members without slender elements', 'AISC 360-16 §E3'),
    e2: ref('§505.2', 'Effective length; KL/r ≤ 200 recommended', 'AISC 360-16 §E2'),
    e7: ref('§505.7', 'Members with slender elements', 'AISC 360-16 §E7'),
  },
  variables: {
    Fy: { tex: 'F_y', name: 'Specified yield stress', unit: 'MPa', role: 'material' },
    KLr: { tex: 'KL/r', name: 'Governing slenderness ratio', unit: '—', role: 'geometry', note: 'The larger of KxL/rx and KyL/ry.' },
    lim: { tex: '4.71\\sqrt{E/F_y}', name: 'Slenderness at the inelastic–elastic switch', unit: '—', role: 'factor' },
    Fe: { tex: 'F_e', name: 'Elastic buckling stress', unit: 'MPa', role: 'intermediate' },
    Fcr: { tex: 'F_{cr}', name: 'Critical stress', unit: 'MPa', role: 'intermediate' },
    Ae: { tex: 'A_e', name: 'Effective area (= Ag unless an element is slender)', unit: 'mm²', role: 'geometry' },
    Pn: { tex: 'P_n', name: 'Nominal compressive strength', unit: 'kN', role: 'capacity' },
    phiPn: { tex: '\\phi_cP_n', name: 'Design compressive strength', unit: 'kN', role: 'capacity' },
    Pu: { tex: 'P_u', name: 'Factored axial demand', unit: 'kN', role: 'demand' },
  },
  equations: [
    { id: 'fe', label: 'Elastic buckling stress', tex: 'F_e = \\dfrac{\\pi^2E}{(KL/r)^2}', vars: ['Fe', 'KLr'], ref: 'e3' },
    { id: 'inel', label: 'Inelastic buckling', tex: 'F_{cr} = 0.658^{F_y/F_e}F_y', vars: ['Fcr', 'Fy', 'Fe'], when: 'KL/r ≤ 4.71√(E/Fy)', ref: 'e3' },
    { id: 'el', label: 'Elastic buckling', tex: 'F_{cr} = 0.877F_e', vars: ['Fcr', 'Fe'], when: 'KL/r > 4.71√(E/Fy)', ref: 'e3' },
    { id: 'pn', label: 'Nominal strength', tex: 'P_n = F_{cr}A_e', vars: ['Pn', 'Fcr', 'Ae'], ref: 'e3' },
    { id: 'check', label: 'Design check', tex: 'P_u \\le \\phi_cP_n,\\quad \\phi_c = 0.90', vars: ['Pu', 'phiPn', 'Pn'], ref: 'phi' },
  ],
  diagram: 'steel-column-curve',
  calculators: CALC_COL,
  related: ['steel-beam-flexure'],
  verification: 'engine-matched',
  keywords: ['steel', 'column', 'compression', 'buckling', 'KL/r', 'slenderness', 'Euler', 'Fcr', 'effective length'],
  evaluate(i) {
    const s = shapeOf(i.shape)
    if (!s) return outOfScope(`${i.shape} is not a W-shape in the catalogue.`)
    const Lmm = i.L * 1000
    const r = steelCompression(s, i.Fy, i.Kx * Lmm, i.Ky * Lmm, Lmm)
    if (!r.applicable) return outOfScope(r.reason ?? 'Outside the implemented compression clauses.')
    const lim = 4.71 * Math.sqrt(E_STEEL / i.Fy)
    const check = { label: 'Pu ≤ φcPn', demand: i.Pu, capacity: r.phiPn, unit: 'kN', state: checkState(i.Pu, r.phiPn), ref: 'phi' }
    const checks = [check, { label: 'KL/r ≤ 200', demand: r.slenderness, capacity: 200, unit: '', state: checkState(r.slenderness, 200), ref: 'e2' }]
    return {
      values: { Fy: i.Fy, KLr: r.slenderness, lim, Fe: r.Fe, Fcr: r.Fcr, Ae: r.Ae, Pn: r.Pn, phiPn: r.phiPn, Pu: i.Pu },
      checks,
      lines: [
        { tex: `\\dfrac{K_xL}{r_x} = \\dfrac{${n2(i.Kx)}\\cdot${n0(Lmm)}}{${n1(s.rx)}} = ${n1(r.slendernessX)},\\quad \\dfrac{K_yL}{r_y} = \\dfrac{${n2(i.Ky)}\\cdot${n0(Lmm)}}{${n1(s.ry)}} = ${n1(r.slendernessY)}` },
        { tex: `F_e = \\dfrac{\\pi^2(${E_STEEL})}{${n1(r.slenderness)}^2} = ${n1(r.Fe)}\\ \\text{MPa}${r.mode === 'flexural' ? '' : `\\ (\\text{${r.mode} buckling governs, §E4})`}` },
        { tex: r.slenderness <= lim
          ? `${n1(r.slenderness)} \\le ${n1(lim)}:\\ F_{cr} = 0.658^{${i.Fy}/${n1(r.Fe)}}(${i.Fy}) = ${n1(r.Fcr)}\\ \\text{MPa}`
          : `${n1(r.slenderness)} > ${n1(lim)}:\\ F_{cr} = 0.877(${n1(r.Fe)}) = ${n1(r.Fcr)}\\ \\text{MPa}` },
        ...(r.Ae < s.A - 1e-9 ? [{ text: `A slender element reduces the area to Ae = ${n0(r.Ae)} mm² of Ag = ${n0(s.A)} mm² (§E7).` }] : []),
        { tex: `\\phi_cP_n = 0.90\\cdot${n1(r.Fcr)}\\cdot${n0(r.Ae)}/1000 = ${n1(r.phiPn)}\\ \\text{kN}\\ ${check.state === 'fail' ? '<' : '\\ge'}\\ P_u = ${n1(i.Pu)}` },
      ],
    }
  },
}

export const STEEL_PROVISIONS: SteelProvision[] = [flexure, shear, column]
