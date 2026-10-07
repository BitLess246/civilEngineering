// ─────────────────────────────────────────────────────────────────────────
// Step-by-step worked solution for a designed steel brace and its gusset
// ends — AISC 360-16 Ch. D/E/J and the Uniform Force Method (Manual Part 13).
// Every number is the schedule row's own. Units: mm, MPa, kN.
// ─────────────────────────────────────────────────────────────────────────
import type { SolutionStep } from './solution'
import { sn1, sn2 } from './solution'
import type { SteelBraceScheduleRow } from '../engine/pipeline'
import type { BraceEndDesign } from '../engine/braceConnection'

const ok = (b: boolean) => (b ? '\\checkmark' : '\\text{NG}')
const KIND: Record<BraceEndDesign['kind'], string> = {
  corner: 'corner gusset at the beam–column joint', beam: 'gusset under the beam (no column)', base: 'gusset on the base plate, against the column',
}

export function braceRowSolution(b: SteelBraceScheduleRow): SolutionStep[] {
  const { Fy, Fu } = b
  const m = b.member, c = m.compression, t = m.tension
  const steps: SolutionStep[] = [{
    title: 'Design forces',
    lines: [
      { tex: `P_u = ${sn1(b.Pu)}\\ \\text{kN (compression)},\\quad T_u = ${sn1(b.Tu)}\\ \\text{kN (tension)},\\quad L = ${sn2(b.L)}\\ \\text{m}` },
      { text: `${b.shape}, Fy ${Fy} / Fu ${Fu} MPa; pin-ended (K = ${m.K}), buckling about r = ${sn1(m.rmin)} mm.` },
    ],
  }]
  steps.push({
    title: 'Compression (§E3, §E7)',
    pass: m.Pu <= c.phiPn,
    lines: [
      { tex: `\\tfrac{KL}{r} = \\tfrac{${m.K} \\cdot ${Math.round(m.L * 1000)}}{${sn1(m.rmin)}} = ${sn1(c.KLr)} \\le 200 \\quad ${ok(c.KLr <= 200)}` },
      { tex: `F_e = \\tfrac{\\pi^2 E}{(KL/r)^2} = ${sn1(c.Fe)}\\ \\text{MPa},\\quad F_{cr} = ${c.KLr <= 4.71 * Math.sqrt(200000 / Fy) ? `0.658^{F_y/F_e}F_y` : '0.877F_e'} = ${sn1(c.Fcr)}\\ \\text{MPa}` },
      ...c.elements.map((e) => ({ tex: `\\text{${e.label}: } \\lambda = ${sn1(e.lambda)}\\ ${e.slender ? '>' : '\\le'}\\ \\lambda_r = ${sn1(e.lambdaR)}\\ \\text{(Table B4.1a)}` })),
      { tex: `A_e = ${Math.round(c.Ae)}\\ \\text{mm}^2${c.elements.some((e) => e.slender) ? '\\ \\text{(E7 effective width)}' : '\\ (= A_g)'};\\quad \\phi P_n = 0.9 F_{cr} A_e = ${sn1(c.phiPn)}\\ \\text{kN} \\quad ${ok(m.Pu <= c.phiPn)}` },
    ],
  })
  steps.push({
    title: 'Tension (§D2, Table D3.1)',
    pass: m.Tu <= t.phiPn,
    lines: [
      { tex: `\\text{yielding: } 0.9 F_y A_g = ${sn1(t.phiPnYield)}\\ \\text{kN}` },
      { tex: `\\text{rupture at the slot: } A_n = A_g - 2t(t_g + 3) = ${Math.round(t.An)}\\ \\text{mm}^2,\\ U = ${sn2(t.U)} \\Rightarrow A_e = ${Math.round(t.Ae)}\\ \\text{mm}^2,\\ 0.75F_uA_e = ${sn1(t.phiPnRupture)}\\ \\text{kN}` },
      { tex: `\\phi P_n = ${sn1(t.phiPn)}\\ \\text{kN} \\ge T_u \\quad ${ok(m.Tu <= t.phiPn)};\\quad L/r = ${sn1(m.Lr)} \\le 300 \\quad ${ok(m.Lr <= 300)}` },
    ],
  })
  for (const { node, design: e } of b.ends) {
    const u = e.ufm
    steps.push({
      title: `End at ${node} — ${KIND[e.kind]}`,
      pass: e.ok,
      lines: [
        { tex: `\\text{4 fillets } w = ${e.weld.w}:\\ \\min(\\underbrace{0.75\\cdot0.6\\cdot482\\cdot0.707w}_{\\text{weld}},\\ \\underbrace{0.75\\cdot0.6F_ut}_{\\text{HSS wall}},\\ \\underbrace{0.75\\cdot0.6F_ut_g/2}_{\\text{gusset}}) = ${sn1(e.weld.phiPerLen)}\\ \\text{N/mm}` },
        { tex: `l_w = ${e.weld.lw}\\ \\text{mm} \\Rightarrow \\phi R_n = 4 \\cdot ${sn1(e.weld.phiPerLen)} \\cdot ${e.weld.lw} = ${sn1(e.weld.phiRn)}\\ \\text{kN} \\ge ${sn1(e.P)} \\quad ${ok(e.weld.ok)}` },
        { tex: `\\text{Whitmore: } H + 2l_w\\tan30^\\circ = ${sn1(e.whitmore.Lw0)}\\ \\text{mm}${e.whitmore.Lw < e.whitmore.Lw0 - 0.5 ? `;\\ \\text{in the plate } L_w = ${sn1(e.whitmore.Lw)}\\ \\text{mm}` : ''},\\ \\phi R_n = 0.9F_yL_wt_g = ${sn1(e.whitmore.phiYield)}\\ \\text{kN} \\ge T_u` },
        ...(e.whitmore.Lw < e.whitmore.Lw0 - 0.5 ? [{ text: 'The part of the Whitmore width that runs into the beam or column is not counted — only the width that lies in the gusset carries the brace force through it.' }] : []),
        { tex: `\\text{buckling (J4.4): } \\bar L = \\tfrac{L_1 + L_2 + L_3}{3} = ${sn1(e.whitmore.L)}\\ \\text{mm},\\ \\tfrac{0.65\\,\\bar L}{t_g/\\sqrt{12}} = ${sn1(e.whitmore.KLr)},\\ F_{cr} = ${sn1(e.whitmore.Fcr)} \\Rightarrow ${sn1(e.whitmore.phiBuckle)}\\ \\text{kN} \\ge P_u \\quad ${ok(e.whitmore.ok)}` },
        { tex: `\\text{block shear: } A_{gv} = ${Math.round(e.blockShear.Agv)},\\ A_{nt} = ${Math.round(e.blockShear.Ant)}\\ \\text{mm}^2 \\Rightarrow ${sn1(e.blockShear.phiRn)}\\ \\text{kN} \\quad ${ok(e.blockShear.ok)}` },
        { tex: `\\text{UFM: } \\alpha = ${sn1(u.alpha)},\\ \\beta = ${sn1(u.beta)},\\ r = \\sqrt{(\\alpha + e_c)^2 + (\\beta + e_b)^2} = ${sn1(u.r)}\\ \\text{mm}` },
        { tex: `H_b = \\tfrac{\\alpha P}{r} = ${sn1(u.Hb)},\\ V_b = \\tfrac{e_b P}{r} = ${sn1(u.Vb)}${e.kind !== 'beam' ? `,\\ H_c = \\tfrac{e_c P}{r} = ${sn1(u.Hc)},\\ V_c = \\tfrac{\\beta P}{r} = ${sn1(u.Vc)}` : ''}\\ \\text{kN}` },
        { text: `Gusset PL ${e.tg}: ${Math.round(u.Lh)} mm along the ${e.kind === 'base' ? 'base plate' : 'beam'} (${u.weldBeam} mm fillets both sides)${e.kind !== 'beam' ? `, ${Math.round(u.Lv)} mm along the column (${u.weldColumn} mm fillets both sides)` : ''} — fillets for 1.25× the interface resultant; gusset edges in shear with normal yielding.` },
        { tex: `\\text{edges: } \\sqrt{(\\tfrac{V}{\\phi 0.6F_yt_gL})^2 + (\\tfrac{N}{\\phi F_yt_gL})^2} = ${sn2(u.beamEdge)}\\ \\text{(beam)}${e.kind !== 'beam' && u.Lv > 0 ? `,\\ ${sn2(u.columnEdge)}\\ \\text{(column)}` : ''} \\le 1 \\quad ${ok(u.beamEdgeOk && u.columnEdgeOk)}` },
      ],
      note: `governs: ${e.governs}, ${Math.round(e.util * 100)}%`,
    })
  }
  steps.push({
    title: 'Verdict',
    lines: [{ text: b.ok
      ? `${b.shape} brace with ${b.ends.map((e) => `PL ${e.design.tg} gusset at ${e.node}`).join(' and ')} — all checks pass.`
      : `Fails: ${[!m.ok && `member (${m.governs})`, ...b.ends.filter((e) => !e.design.ok).map((e) => `end ${e.node} (${e.design.governs})`)].filter(Boolean).join('; ')}.` }],
  })
  return steps
}
