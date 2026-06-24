// Detailed worked solution for the beam design — legacy-style: each step has
// an explanation citing the governing provision, then the substituted
// equations. Mirrors engine/beamDesign.ts (ρ_max,TC with dt/d, DRRB with
// displaced concrete, §407.7 bar layout with Varignon d-iteration).
import type { BeamDesignInput, BeamDesignResult } from '../engine/beamDesign'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function buildBeamSolution(i: BeamDesignInput, r: BeamDesignResult): SolutionStep[] {
  const fyt = i.fyt ?? i.fy
  const legs = i.legs ?? 2
  const dbC = i.comprBarDia ?? i.barDia
  const d = r.d
  const Ab = (Math.PI / 4) * i.barDia * i.barDia
  const multiLayer = r.layers.length > 1

  const steps: SolutionStep[] = []

  steps.push({
    title: 'Effective depths',
    lines: [
      txt('d_t is the depth to the extreme (bottom) tension layer; d is the depth to the centroid of the whole bar group — they coincide for a single layer, and d < d_t once the bars need more than one layer (see the bar-layout step).'),
      eq(String.raw`d_t = h - cover - d_s - \tfrac{d_b}{2} = ${sn0(i.h)} - ${sn0(i.cover)} - ${sn0(i.stirrupDia)} - ${sn1(i.barDia / 2)} = ${sn1(r.dt)}\ \text{mm}`),
      eq(String.raw`d' = cover + d_s + \tfrac{d_b'}{2}${r.comprYBar > 0 ? String.raw` + \bar{y}'` : ''} = ${sn0(i.cover)} + ${sn0(i.stirrupDia)} + ${sn1(dbC / 2)}${r.comprYBar > 0 ? ` + ${sn1(r.comprYBar)}` : ''} = ${sn1(r.dPrime)}\ \text{mm},\qquad d = \mathbf{${sn1(d)}}\ \text{mm}${multiLayer ? String.raw`\ (\text{after } ${r.layerIters}\ \text{layout passes})` : ''}`),
    ],
  })

  steps.push({
    title: 'Reinforcement-ratio limits',
    lines: [
      txt('The tension-controlled maximum comes from c = (3/8)d_t (ε_t = 0.005 at the extreme layer): ρ_max = (0.85 f′c/fy · β1)(3/8)(d_t/d). The balanced ratio carries the same d_t/d factor; ρ_min per §409.6.1.'),
      eq(String.raw`\rho_{max,TC} = \tfrac{0.85 f'_c}{f_y}\beta_1\cdot\tfrac{3}{8}\cdot\tfrac{d_t}{d} = ${sn4(r.rhoMax)}`),
      eq(String.raw`\rho_b = \tfrac{0.85 f'_c}{f_y}\beta_1\cdot\tfrac{600}{600+f_y}\cdot\tfrac{d_t}{d} = ${sn4(r.rhoB)},\qquad \rho_{min} = ${sn4(r.rhoMin)}`),
    ],
  })

  steps.push({
    title: 'SRRB / DRRB classification',
    lines: [
      txt('Capacity of the section at ρ_max (the singly-reinforced ceiling, still tension-controlled so φ = 0.90). If Mu fits under φMn_max the beam is singly reinforced; otherwise compression steel carries the excess.'),
      eq(String.raw`A_{s,max} = \rho_{max} b d = ${sn0(r.AsMax)}\ \text{mm}^2,\quad a_{max} = \tfrac{A_{s,max} f_y}{0.85 f'_c b} = ${sn1(r.aMax)}\ \text{mm}`),
      eq(String.raw`\phi M_{n,max} = 0.90\,A_{s,max} f_y (d - \tfrac{a_{max}}{2}) = ${sn1(r.phiMnMax)}\ \text{kN·m}`),
      eq(String.raw`M_u = ${sn1(i.Mu)}\ \text{kN·m} \;${i.Mu <= r.phiMnMax ? '\\le' : '>'}\; \phi M_{n,max} \Rightarrow \textbf{${r.mode}}`),
    ],
    note: r.mode === 'SRRB' ? 'Singly reinforced — tension steel only.' : 'Doubly reinforced — add compression steel for the moment beyond the ceiling.',
  })

  if (r.mode === 'SRRB') {
    const Rn = (i.Mu * 1e6) / (0.9 * i.b * d * d)
    steps.push({
      title: 'Tension steel (SRRB)',
      lines: [
        txt('Solve the design strength equation for ρ via the coefficient of resistance Rₙ, then floor at ρ_min (§409.6.1).'),
        eq(String.raw`R_n = \dfrac{M_u}{\phi b d^2} = \dfrac{${sn0(i.Mu)}\times 10^6}{0.9(${sn0(i.b)})(${sn1(d)})^2} = ${sn3(Rn)}\ \text{MPa}`),
        eq(String.raw`\rho = \tfrac{0.85 f'_c}{f_y}\!\left(1-\sqrt{1-\tfrac{2R_n}{0.85 f'_c}}\right) = ${sn4(r.rho)}`),
        eq(String.raw`A_s = \rho b d = ${sn0(r.As)}\ \text{mm}^2`),
      ],
      note: r.usedMin ? 'ρ_min governs.' : 'Computed ρ governs.',
    })
  } else {
    steps.push({
      title: 'Tension steel (DRRB)',
      lines: [
        txt('Split the demand: As1 pairs with the concrete at the ρ_max couple; the excess moment M2 = Mu/φ − Mn,max is carried by a steel couple As2 acting over the lever arm (d − d′).'),
        eq(String.raw`A_{s1} = A_{s,max} = ${sn0(r.As1)}\ \text{mm}^2`),
        eq(String.raw`M_2 = \tfrac{M_u}{\phi} - M_{n,max} = \tfrac{${sn1(i.Mu)}}{0.90} - ${sn1(r.MnMax)} = ${sn1(r.MnResid)}\ \text{kN·m}`),
        eq(String.raw`A_{s2} = \dfrac{M_2}{f_y (d - d')} = \dfrac{${sn1(r.MnResid)}\times 10^6}{${sn0(i.fy)}(${sn1(d)} - ${sn1(r.dPrime)})} = ${sn0(r.As2)}\ \text{mm}^2`),
        eq(String.raw`A_s = A_{s1} + A_{s2} = \mathbf{${sn0(r.As)}}\ \text{mm}^2`),
      ],
    })
    steps.push({
      title: 'Compression steel',
      lines: [
        txt('Stress in the compression steel from strain compatibility at c = a_max/β1: f′s = 600(1 − d′/c) ≤ fy. Equating Cs to T2 with the displaced concrete deducted: A′s(f′s − 0.85f′c) = As2·fy.'),
        eq(String.raw`c = \tfrac{a_{max}}{\beta_1} = ${sn1(r.cNA)}\ \text{mm},\quad f_s' = 600\!\left(1 - \tfrac{${sn1(r.dPrime)}}{${sn1(r.cNA)}}\right) = ${sn1(600 * (1 - r.dPrime / r.cNA))} \to ${sn1(r.fsPrime)}\ \text{MPa}\ ${r.fsYields ? '(\\text{yields})' : '(\\text{does not yield})'}`),
        eq(String.raw`A_s' = \dfrac{A_{s2} f_y}{f_s' - 0.85 f'_c} = \dfrac{${sn0(r.As2)}(${sn0(i.fy)})}{${sn1(r.fsPrime)} - ${sn2(0.85 * i.fc)}} = ${sn0(r.AsPrime)}\ \text{mm}^2`),
        ...(r.comprLayers.length > 0 ? [
          txt('Neutral-axis check: every compression bar must lie above the NA to actually be in compression — the deepest layer governs.'),
          eq(String.raw`d'_{deepest} = ${sn0(r.dPrimeExtreme)}\ \text{mm} \;${r.comprNAOK ? '<' : '\\ge'}\; c = ${sn0(r.cNA)}\ \text{mm}\;${r.comprNAOK ? '\\checkmark' : '\\times'}`),
        ] : []),
      ],
      note: !r.comprEffective
        ? 'f′s ≤ 0.85f′c — compression steel is ineffective; enlarge the section.'
        : r.comprNAOK
          ? `Provide ${r.comprBars} ⌀${dbC} mm compression bars.`
          : '⚠ The deepest compression layer crosses the neutral axis — those bars are not in compression. Use a larger compression-bar diameter (fewer layers) or enlarge the section.',
    })
  }

  // ── Bar layout: spacing check → layers → Varignon d ──
  const bw = i.b - 2 * (i.cover + i.stirrupDia)
  steps.push({
    title: 'Bar layout — spacing check & layers (§407.7)',
    lines: [
      txt(`Minimum clear spacing between parallel bars in a layer is max(d_b, 25 mm) = ${sn0(r.sMinClear)} mm (§407.7.1). The clear web width is b − 2(cover + dₛ) = ${sn0(bw)} mm, so at most ${r.maxPerLayer} bars fit per layer.`),
      eq(String.raw`n = \lceil A_s / A_b \rceil = \lceil ${sn0(r.As)} / ${sn0(Ab)} \rceil = ${r.bars}\ \text{bars} \Rightarrow \text{layers: } [${r.layers.join(',\ ')}]`),
      eq(String.raw`s_{clear} = \dfrac{${sn0(bw)} - ${r.layers[0]}(${sn0(i.barDia)})}{${Math.max(1, r.layers[0] - 1)}} = ${sn0(r.sClear)}\ \text{mm} \;\ge\; ${sn0(r.sMinClear)}\ \text{mm}\ \checkmark`),
      ...(multiLayer ? [
        txt('With more than one layer (25 mm clear between layers, §407.7.2) the bar-group centroid rises above the extreme layer — Varignon: ȳ = Σnᵢyᵢ/Σnᵢ — which reduces d, so the design re-runs at the new d until the layer arrangement stops changing.'),
        eq(String.raw`\bar{y} = \dfrac{\sum n_i y_i}{\sum n_i} = ${sn1(r.yBar)}\ \text{mm} \Rightarrow d = d_t - \bar{y} = ${sn1(r.dt)} - ${sn1(r.yBar)} = \mathbf{${sn1(r.d)}}\ \text{mm}`),
      ] : [
        txt('All tension bars fit in one layer, so d = d_t for the tension side.'),
      ]),
      ...(r.comprLayers.length > 0 ? [
        txt(`Compression side — same rule: s_min = max(d_b′, 25) = ${sn0(r.comprSMinClear)} mm, so at most ${r.comprMaxPerLayer} compression bars fit per layer.`),
        eq(String.raw`n' = ${r.comprBars}\ \text{bars} \Rightarrow \text{layers: } [${r.comprLayers.join(',\ ')}],\quad s_{clear}' = ${sn0(r.comprSClear)}\ \text{mm} \ge ${sn0(r.comprSMinClear)}\ \checkmark`),
        ...(r.comprLayers.length > 1 ? [
          txt('Stacking compression layers drops the compression-steel centroid (Varignon), DEEPENING d′ — which reduces the (d − d′) lever arm and feeds back into As2 and A′s.'),
          eq(String.raw`\bar{y}' = ${sn1(r.comprYBar)}\ \text{mm} \Rightarrow d' = ${sn1(r.dPrime - r.comprYBar)} + ${sn1(r.comprYBar)} = \mathbf{${sn1(r.dPrime)}}\ \text{mm}`),
        ] : []),
      ] : []),
      ...(multiLayer || r.comprLayers.length > 1 ? [
        txt(`Both faces converged after ${r.layerIters} passes — the ρ limits, classification, and steel above are already evaluated at the final d and d′.`),
      ] : []),
    ],
    note: r.flexOK
      ? `Provide ${r.bars} ⌀${i.barDia} mm in ${r.layers.length} layer${r.layers.length > 1 ? 's' : ''} (${r.layers.join(' + ')})${r.mode === 'DRRB' && r.comprEffective ? ` + ${r.comprBars} ⌀${dbC} mm compression bars` : ''}.`
      : '⚠ The layout diverges (d collapses as layers stack up) — the section cannot accommodate the required steel. Enlarge b or h.',
  })

  steps.push({
    title: 'Shear strength of concrete',
    lines: [
      txt('Concrete one-way shear strength per NSCP 2015 §422.5.5.1 with φ = 0.75 (§421.2). Half of φVc marks the threshold below which no stirrups are required (§409.6.3).'),
      eq(String.raw`V_c = \tfrac{1}{6}\lambda\sqrt{f'_c}\,b d = \tfrac{1}{6}\sqrt{${sn0(i.fc)}}(${sn0(i.b)})(${sn1(d)})/1000 = ${sn1(r.Vc)}\ \text{kN}`),
      eq(String.raw`\phi V_c = ${sn1(r.phiVc)}\ \text{kN},\quad \tfrac{1}{2}\phi V_c = ${sn1(r.phiVc / 2)}\ \text{kN}`),
    ],
  })

  if (r.region === 'none') {
    steps.push({
      title: 'Stirrup requirement',
      lines: [
        txt('Vu is below half of φVc, so the code does not require shear reinforcement (§409.6.3.1).'),
        eq(String.raw`V_u = ${sn1(i.Vu)}\ \text{kN} \le \tfrac{1}{2}\phi V_c = ${sn1(r.phiVc / 2)}\ \text{kN}`),
      ],
      note: 'Provide nominal stirrups in practice.',
    })
  } else if (r.region === 'minimum') {
    steps.push({
      title: 'Minimum stirrups',
      lines: [
        txt('Vu exceeds ½φVc but not φVc — minimum shear reinforcement applies (§409.6.3.3), with spacing capped at d/2 ≤ 600 mm (§409.7.6.2.2).'),
        eq(String.raw`A_v = ${legs}\cdot\tfrac{\pi}{4}d_s^2 = ${sn0(r.Av)}\ \text{mm}^2,\quad s_{max} = \min(d/2,\,600) = ${sn0(r.sMax)}\ \text{mm}`),
      ],
      note: `Provide ⌀${i.stirrupDia} mm, ${legs}-leg stirrups @ ${sn0(r.sAdopt)} mm.`,
    })
  } else if (r.region === 'designed') {
    steps.push({
      title: 'Stirrup design',
      lines: [
        txt('Vu exceeds φVc — design stirrups for Vs = Vu/φ − Vc (§422.5.10.5.3). The spacing cap halves once Vs exceeds ⅓√f′c·b·d (§409.7.6.2.2).'),
        eq(String.raw`V_s = \tfrac{V_u}{\phi} - V_c = \tfrac{${sn1(i.Vu)}}{0.75} - ${sn1(r.Vc)} = ${sn1(r.VsReq)}\ \text{kN} \;(\le V_{s,max} = \tfrac{2}{3}\sqrt{f'_c}\,bd = ${sn1(r.VsMax)})`),
        eq(String.raw`s = \dfrac{A_v f_{yt} d}{V_s} = \dfrac{${sn0(r.Av)}(${sn0(fyt)})(${sn1(d)})}{${sn1(r.VsReq)}\times 10^3} = ${sn0(r.sReq)}\ \text{mm},\quad s_{max} = ${sn0(r.sMax)}\ \text{mm}`),
      ],
      note: `Provide ⌀${i.stirrupDia} mm, ${legs}-leg stirrups @ ${sn0(r.sAdopt)} mm.`,
    })
  } else {
    steps.push({
      title: 'Section check (shear)',
      lines: [
        txt('The required Vs exceeds the §422.5.1.2 ceiling — the cross-section itself is too small for the shear; no amount of stirrups fixes it.'),
        eq(String.raw`V_s = ${sn1(r.VsReq)}\ \text{kN} > V_{s,max} = \tfrac{2}{3}\sqrt{f'_c}\,b d = ${sn1(r.VsMax)}\ \text{kN}`),
      ],
      note: 'Increase b, d, or f′c.',
    })
  }

  steps.push({
    title: 'Stirrup detailing — bend & hooks (§407.3.2, §425.3.2)',
    lines: [
      txt('Inside diameter of bend for stirrups and ties shall not be less than 4d_b for ⌀16 mm bars and smaller (§407.3.2.2). Stirrups close with 135° hooks around a longitudinal bar; the hook extension beyond the bend is 6d_b but not less than 75 mm (§425.3.2).'),
      eq(String.raw`D_{bend} = 4 d_s = 4(${sn0(i.stirrupDia)}) = ${sn0(r.stirrupBendDia)}\ \text{mm}`),
      eq(String.raw`\ell_{hook} = \max(6 d_s,\ 75) = \max(${sn0(6 * i.stirrupDia)},\ 75) = ${sn0(r.stirrupHookExt)}\ \text{mm}`),
    ],
    note: `Provide 135° seismic hooks, ${sn0(r.stirrupHookExt)} mm extension, bent around a corner bar.`,
  })

  return steps
}
