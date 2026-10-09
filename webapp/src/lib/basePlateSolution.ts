// ─────────────────────────────────────────────────────────────────────────
// Step-by-step worked solution for a designed column base plate — AISC 360-16
// §J8 bearing, Design Guide 1 plate sizing and thickness (axial, then axial +
// moment by the uniform-bearing method, both axes), and the anchor rods in the
// concrete (ACI 318-14 Ch. 17). Every number is the schedule row's own.
// Units: mm, MPa, kN, kN·m.
// ─────────────────────────────────────────────────────────────────────────
import type { SolutionStep } from './solution'
import { sn1, sn2 } from './solution'
import type { BasePlateScheduleRow } from '../engine/pipeline'
import type { BaseMomentCase } from '../engine/baseplate'
import type { StructuralModel } from '../engine/model'
import { shapeByName } from '../engine/aiscSections'

const ok = (b: boolean) => (b ? '\\checkmark' : '\\text{NG}')

export function basePlateRowSolution(p: BasePlateScheduleRow, col: { d: number; bf: number; tf: number }, fc: number, Fy: number): SolutionStep[] {
  const d = p.design
  const steps: SolutionStep[] = []
  steps.push({
    title: 'Design forces and materials',
    lines: [
      { tex: `P_u = ${sn1(p.Pu)}\\ \\text{kN (envelope compression)}${p.Tu > 0 ? `,\\quad T_u = ${sn1(p.Tu)}\\ \\text{kN (net uplift)}` : ''}` },
      { text: `Column ${p.shape}: d = ${col.d}, bf = ${col.bf}, tf = ${col.tf} mm. Plate Fy = ${Fy} MPa; concrete f′c = ${fc} MPa.` },
    ],
  })
  steps.push({
    title: 'Concrete bearing (§J8)',
    clause: 'AISC 360-16 §J8',
    pass: d.bearingOK,
    lines: [
      { tex: `\\phi_c f_{p,max} = 0.65 \\cdot 0.85 f'_c \\sqrt{A_2/A_1} = 0.65 \\cdot 0.85 \\cdot ${fc} \\cdot ${sn2(d.sqrtRatio)} = ${sn2(d.fpMax)}\\ \\text{MPa}` },
      { tex: `A_{1,req} = P_u / \\phi_c f_{p,max} = ${Math.round(d.A1req)}\\ \\text{mm}^2;\\quad N \\times B = ${Math.round(d.N)} \\times ${Math.round(d.B)} = ${Math.round(d.A1)}\\ \\text{mm}^2` },
      { tex: `f_p = P_u/A_1 = ${sn2(d.fp)}\\ \\text{MPa} \\Rightarrow ${Math.round(d.bearingUtil * 100)}\\% \\quad ${ok(d.bearingOK)}` },
      { text: `N runs along the column depth d, B along bf. The rods sit outside the flanges, at ±${Math.round(d.rodX)} mm along N and ±${Math.round(d.rodY)} mm along B.` },
    ],
  })
  steps.push({
    title: 'Plate thickness under axial load (DG1)',
    lines: [
      { tex: `m = \\tfrac{N - 0.95d}{2} = ${sn1(d.m)},\\quad n = \\tfrac{B - 0.8b_f}{2} = ${sn1(d.n)},\\quad n' = \\tfrac{\\sqrt{d\\,b_f}}{4} = ${sn1(d.nPrime)}\\ \\text{mm}` },
      { tex: `t_{req} = \\ell \\sqrt{\\dfrac{2 f_p}{0.9 F_y}} = ${sn1(d.ell)} \\sqrt{\\dfrac{2 \\cdot ${sn2(d.fp)}}{0.9 \\cdot ${Fy}}} = ${sn2(d.tReq)}\\ \\text{mm}` },
    ],
  })

  const mo = p.moment
  if (mo) {
    const axis = (c: BaseMomentCase, label: string, mName: string, mVal: number, f: number): SolutionStep => ({
      title: `Axial + moment, ${label} (DG1 uniform bearing)`,
      pass: c.ok,
      lines: [
        { text: `Governing case ${c.name}: the base moment turns the plate about its ${label}; the rods are at f = ${Math.round(f)} mm from its centre.` },
        { tex: `q_{max} = \\phi_c f_{p,max} B = ${sn1(c.qmax)}\\ \\text{N/mm},\\quad e = M_u/P_u = ${Number.isFinite(c.e) ? `${sn1(c.e)}\\ \\text{mm}` : '\\infty'},\\quad e_{crit} = \\tfrac{N}{2} - \\tfrac{P_u}{2q_{max}} = ${sn1(c.ecrit)}\\ \\text{mm}` },
        ...(c.regime === 'small' ? [
          { tex: `e \\le e_{crit}:\\ Y = N - 2e = ${sn1(c.Y)}\\ \\text{mm},\\ f_p = \\tfrac{P_u}{BY} = ${sn2(c.fp)}\\ \\text{MPa — the rods stay slack}` },
        ] : c.regime === 'large' ? [
          { tex: `e > e_{crit}:\\ Y = \\left(f + \\tfrac{N}{2}\\right) - \\sqrt{\\left(f + \\tfrac{N}{2}\\right)^2 - \\tfrac{2(M_u + P_u f)}{q_{max}}} = ${sn1(c.Y)}\\ \\text{mm}` },
          { tex: `T_u = q_{max}Y - P_u = ${sn1(c.Tu)}\\ \\text{kN on the two rods of the tension side}` },
        ] : c.regime === 'uplift' ? [
          { tex: `\\text{net uplift: } T_u = \\tfrac{M_u}{2f} + \\tfrac{-P_u}{2} = ${sn1(c.Tu)}\\ \\text{kN, no bearing}` },
        ] : [
          { text: 'No real bearing length: the plate is too short for this moment.' },
        ]),
        ...(c.ok ? [
          ...(c.tReqBearing > 0 ? [{ tex: c.Y >= mVal
            ? `\\text{bearing side } (Y \\ge ${mName}): t = 1.5\\,${mName}\\sqrt{f_p/F_y} = 1.5 \\cdot ${sn1(mVal)}\\sqrt{${sn2(c.fp)}/F_y} = ${sn2(c.tReqBearing)}\\ \\text{mm}`
            : `\\text{bearing side } (Y < ${mName}): t = 2.11\\sqrt{f_p Y(${mName} - Y/2)/F_y} = ${sn2(c.tReqBearing)}\\ \\text{mm}` }] : []),
          ...(c.tReqTension > 0 ? [{ tex: `\\text{tension side: } t = 2.11\\sqrt{\\tfrac{T_u x}{B F_y}},\\ x = ${sn1(c.x)}\\ \\text{mm} \\Rightarrow ${sn2(c.tReqTension)}\\ \\text{mm}` }] : []),
        ] : []),
      ],
    })
    steps.push(axis(mo.strong, 'strong axis (along N)', 'm', d.m, d.rodX))
    steps.push(axis(mo.weak, 'weak axis (along B)', 'n', d.n, d.rodY))
  }

  const tGov = Math.max(d.tReq, mo?.tReq ?? 0)
  steps.push({
    title: 'Adopted plate',
    lines: [
      { tex: `t_{req} = \\max(${sn2(d.tReq)}${mo ? `,\\ ${sn2(mo.tReq)}` : ''}) = ${sn2(tGov)}\\ \\text{mm} \\Rightarrow \\text{PL } ${Math.round(d.N)} \\times ${Math.round(d.B)} \\times ${p.tAdopt}\\ \\text{(stock)}` },
    ],
  })

  const w = p.weld
  steps.push({
    title: 'Column to plate — fillet welds (§J2.4)',
    pass: w.ok,
    lines: [
      { tex: `T = \\max\\left(\\dfrac{M_s}{d - t_f} - \\dfrac{P_u}{2}\\right) = ${sn1(w.T)}\\ \\text{kN (tension flange; 0 in bearing alone)}` },
      { tex: `L = 2b_f - t_w = ${Math.round(w.L)}\\ \\text{mm (both faces of a flange)},\\quad w_{min} = ${w.wMin}\\ \\text{mm (Table J2.4)}` },
      { tex: `\\phi R_n = 0.75 \\cdot 0.6 \\cdot 482 \\cdot 0.707\\,w L = ${sn1(w.phiRn)}\\ \\text{kN at } w = ${w.w}\\ \\text{mm} \\quad ${ok(w.ok)}` },
      { text: `${w.w} mm E70XX fillets all round the column — both faces of each flange and both sides of the web.` },
    ],
  })

  const a = p.anchors
  if (a) {
    const c = a.check
    const mode = (label: string, m: { phiN: number; util: number; clause: string } | null) =>
      m ? [{ tex: `\\text{${label} (${m.clause}): } \\phi = ${sn1(m.phiN)}\\ \\text{kN},\\ ${Math.round(m.util * 100)}\\%` }] : []
    steps.push({
      title: `Anchor rods — ${a.n}-⌀${a.da} headed, hef ${a.hef} mm (ACI 318-14 Ch. 17)`,
      pass: c.ok,
      lines: [
        { text: `Every case's tension and shear together, the seismic ones at 75 % on the concrete tension modes (§17.2.3.4.4).${mo ? ` Under a base moment the group is taken to carry the tension-side rods' pull on every rod (${sn1(mo.rodTu)} kN each at worst): no credit for the eccentricity factor ψec.` : ''}` },
        ...mode('steel in tension', c.tension.steel), ...mode('concrete breakout', c.tension.breakout),
        ...mode('pullout', c.tension.pullout), ...mode('side-face blowout', c.tension.sideFace),
        ...mode('steel in shear', c.shear.steel), ...mode('shear breakout', c.shear.breakout), ...mode('pryout', c.shear.pryout),
        { tex: `\\text{§17.6 interaction} = ${sn2(c.interaction)};\\ \\text{governs: ${c.governs}},\\ ${Math.round(c.util * 100)}\\% \\quad ${ok(c.ok)}` },
        { text: `§17.7: spacing ≥ 4da ${c.spacingOK ? 'OK' : 'NOT MET'}, edge ≥ 6da ${c.edgeOK ? 'OK' : 'NOT MET'}.` },
      ],
    })
  }

  const fails = [
    !d.bearingOK && 'concrete bearing',
    mo && (mo.shortN || mo.shortB) && 'plate too short for the base moment',
    a && !a.check.ok && `anchor rods (${a.check.governs})`,
    !d.anchorOK && 'rod tension',
    !w.ok && 'column-to-plate weld',
  ].filter(Boolean)
  steps.push({
    title: 'Verdict',
    lines: [{ text: p.ok
      ? `PL ${Math.round(d.N)}×${Math.round(d.B)}×${p.tAdopt} with ${a ? `${a.n}-⌀${a.da} rods, hef ${a.hef}` : 'its rods'} — all checks pass.`
      : `Fails: ${fails.join('; ')}.` }],
  })
  return steps
}

/** The column standing on a base plate, as the drawing and the solution read
 *  it: its W dimensions and the column section's f′c (the footing/pedestal
 *  concrete the bearing was checked on) and steel Fy. */
export function basePlateContext(model: StructuralModel, row: BasePlateScheduleRow): { col: { d: number; bf: number; tf: number; tw: number }; fc: number; Fy: number } {
  const s = shapeByName(row.shape)
  const m = model.members.find((x) => x.role === 'column' && (x.i === row.node || x.j === row.node))
  const sec = m ? model.sections.find((x) => x.id === m.section) : undefined
  return {
    col: { d: s?.d ?? 300, bf: s?.bf ?? 250, tf: s?.tf ?? 14, tw: s?.tw ?? 9 },
    fc: sec?.fc ?? 21, Fy: sec?.steelFy ?? 248,
  }
}
