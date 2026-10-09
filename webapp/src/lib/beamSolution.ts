// Detailed worked solution for the beam design — legacy-style: each step has
// an explanation citing the governing provision, then the substituted
// equations. Mirrors engine/beamDesign.ts (ρ_max,TC with dt/d, DRRB with
// displaced concrete, §407.7 bar layout with Varignon d-iteration).
import { S_MIN_STIRRUP, type BeamDesignInput, type BeamDesignResult } from '../engine/beamDesign'
import { rectCapacity } from '../engine/flexure'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function buildBeamSolution(i: BeamDesignInput, r: BeamDesignResult): SolutionStep[] {
  const fyt = i.fyt ?? i.fy
  const legs = r.legs ?? i.legs ?? 2      // the design's actual leg count (§25.7.2.3)
  const dbC = i.comprBarDia ?? i.barDia
  const d = r.d
  const Ab = (Math.PI / 4) * i.barDia * i.barDia
  const multiLayer = r.layers.length > 1
  // Flanged action (§406.3.2): the width the compression block actually acts
  // on, and the moment left for it after the overhang couple. For a plain
  // rectangle these collapse to b and Mu, so every equation below is written
  // once and reads correctly in all three cases.
  const bF = r.bFlex
  const MuFlex = i.Mu - r.Muf
  const flanged = r.flangeAction !== 'none'
  const bSym = flanged ? 'b_f' : 'b'
  const MSym = r.flangeAction === 'true-T' ? 'M_{uw}' : 'M_u'

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

  if (flanged && i.flange) {
    const fl = i.flange
    const kind = fl.kind === 'L' ? 'L-beam (one-sided flange)' : 'T-beam'
    const aF = (r.a).toFixed(0)
    steps.push({
      title: `Flanged action — ${kind}`,
      lines: [
        txt('The slab acts with the web in sagging, so the compression zone is the flange first (§406.3.2). Assume the block stays inside the slab and check it: while a ≤ h_f the section is simply a rectangle of width b_f, because the concrete below the block does not participate whatever its shape.'),
        eq(String.raw`b_f = ${sn0(fl.bf)}\ \text{mm},\quad h_f = ${sn0(fl.hf)}\ \text{mm},\quad b_w = ${sn0(i.b)}\ \text{mm}`),
        ...(r.flangeAction === 'flange'
          ? [
              eq(String.raw`a = ${aF}\ \text{mm} \le h_f = ${sn0(fl.hf)}\ \text{mm}`),
              txt('The block fits inside the flange — design as a rectangle b_f × d.'),
            ]
          : [
              eq(String.raw`a > h_f \Rightarrow \textbf{true T}`),
              txt('The block leaves the slab, so the overhangs are spent at full stress over their whole depth h_f and become a FIXED couple; the web rectangle carries the rest. Substituting b_f for b past this point would credit concrete that is not there — below the flange and outside the web.'),
              eq(String.raw`A_{sf} = \dfrac{0.85 f'_c (b_f - b_w) h_f}{f_y} = \dfrac{0.85(${sn0(i.fc)})(${sn0(fl.bf)} - ${sn0(i.b)})(${sn0(fl.hf)})}{${sn0(i.fy)}} = ${sn0(r.Asf)}\ \text{mm}^2`),
              eq(String.raw`\phi M_{uf} = \phi A_{sf} f_y\!\left(d - \tfrac{h_f}{2}\right) = ${sn1(r.Muf)}\ \text{kN·m}`),
              eq(String.raw`M_{uw} = M_u - \phi M_{uf} = ${sn1(i.Mu)} - ${sn1(r.Muf)} = ${sn1(MuFlex)}\ \text{kN·m}\quad\text{on } b_w`),
            ]),
      ],
      note: r.flangeAction === 'flange'
        ? 'Rectangular behaviour — b = b_f in everything that follows.'
        : 'True T — the steps below carry the web width b_w and the web moment M_uw; A_sf is added back at the end.',
    })
  }

  steps.push({
    title: 'SRRB / DRRB classification',
    lines: [
      txt('Capacity of the section at ρ_max (the singly-reinforced ceiling, still tension-controlled so φ = 0.90). If Mu fits under φMn_max the beam is singly reinforced; otherwise compression steel carries the excess.'),
      eq(String.raw`A_{s,max} = \rho_{max} ${bSym} d = ${sn0(r.AsMax)}\ \text{mm}^2,\quad a_{max} = \tfrac{A_{s,max} f_y}{0.85 f'_c ${bSym}} = ${sn1(r.aMax)}\ \text{mm}`),
      eq(String.raw`\phi M_{n,max} = 0.90\,A_{s,max} f_y (d - \tfrac{a_{max}}{2}) = ${sn1(r.phiMnMax)}\ \text{kN·m}`),
      eq(String.raw`${MSym} = ${sn1(MuFlex)}\ \text{kN·m} \;${MuFlex <= r.phiMnMax ? '\\le' : '>'}\; \phi M_{n,max} \Rightarrow \textbf{${r.mode}}`),
    ],
    note: r.mode === 'SRRB' ? 'Singly reinforced — tension steel only.' : 'Doubly reinforced — add compression steel for the moment beyond the ceiling.',
  })

  if (r.mode === 'SRRB') {
    const Rn = (MuFlex * 1e6) / (0.9 * bF * d * d)
    const rhoCalc = (0.85 * i.fc / i.fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (0.85 * i.fc))))
    steps.push({
      title: 'Tension steel (SRRB)',
      lines: [
        txt('Solve the design strength equation for ρ via the coefficient of resistance Rₙ, then floor at ρ_min (§409.6.1). ρ_min is a WEB property — it is what keeps a lightly loaded section from failing the moment it cracks — so it never scales with the flange.'),
        eq(String.raw`R_n = \dfrac{${MSym}}{\phi ${bSym} d^2} = \dfrac{${sn0(MuFlex)}\times 10^6}{0.9(${sn0(bF)})(${sn1(d)})^2} = ${sn3(Rn)}\ \text{MPa}`),
        eq(String.raw`\rho = \tfrac{0.85 f'_c}{f_y}\!\left(1-\sqrt{1-\tfrac{2R_n}{0.85 f'_c}}\right) = ${sn4(rhoCalc)}`),
        eq(r.flangeAction === 'true-T'
          ? String.raw`A_s = \rho b_w d + A_{sf} = ${sn0(rhoCalc * bF * d)} + ${sn0(r.Asf)} = ${sn0(r.As)}\ \text{mm}^2`
          : String.raw`A_s = \rho ${bSym} d = ${sn0(r.As)}\ \text{mm}^2`),
      ],
      note: r.usedMin ? 'ρ_min governs.' : 'Computed ρ governs.',
    })
  } else {
    steps.push({
      title: 'Tension steel (DRRB)',
      lines: [
        txt('Split the demand: As1 pairs with the concrete at the ρ_max couple; the excess moment M2 = Mu/φ − Mn,max is carried by a steel couple As2 acting over the lever arm (d − d′).'),
        eq(String.raw`A_{s1} = A_{s,max} = ${sn0(r.As1)}\ \text{mm}^2`),
        eq(String.raw`M_2 = \tfrac{${MSym}}{\phi} - M_{n,max} = \tfrac{${sn1(MuFlex)}}{0.90} - ${sn1(r.MnMax)} = ${sn1(r.MnResid)}\ \text{kN·m}`),
        eq(String.raw`A_{s2} = \dfrac{M_2}{f_y (d - d')} = \dfrac{${sn1(r.MnResid)}\times 10^6}{${sn0(i.fy)}(${sn1(d)} - ${sn1(r.dPrime)})} = ${sn0(r.As2)}\ \text{mm}^2`),
        eq(r.flangeAction === 'true-T'
          ? String.raw`A_s = A_{s1} + A_{s2} + A_{sf} = ${sn0(r.As1)} + ${sn0(r.As2)} + ${sn0(r.Asf)} = \mathbf{${sn0(r.As)}}\ \text{mm}^2`
          : String.raw`A_s = A_{s1} + A_{s2} = \mathbf{${sn0(r.As)}}\ \text{mm}^2`),
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
  //
  // The width comes off the RESULT, not off b: where the beam frames into a
  // column no wider than itself, its bars are inside the column's verticals
  // and have less room than the web suggests. Recomputed here from b, the
  // sheet checked §407.7.1 across a web the bars are not allowed to use.
  const bw = r.bClear
  steps.push({
    title: 'Bar layout — spacing check & layers (§407.7)',
    lines: [
      txt(`Minimum clear spacing between parallel bars in a layer is max(d_b, 25 mm) = ${sn0(r.sMinClear)} mm (§407.7.1). ${r.jointGoverns
        ? `The beam frames into a column no wider than itself, so its bars are cranked INSIDE the column's verticals to pass the joint (§410.7.4.1, 1 in 6). They run at the beam's own cover line along the span, but the layer has to fit through the joint, and there the width is 2·(bar room) + d_b = ${sn0(bw)} mm against the clear web b − 2(cover + dₛ) = ${sn0(i.b - 2 * (i.cover + i.stirrupDia))} mm.`
        : `The clear web width is b − 2(cover + dₛ) = ${sn0(bw)} mm.`} At most ${r.maxPerLayer} bar${r.maxPerLayer === 1 ? '' : 's'} fit${r.maxPerLayer === 1 ? 's' : ''} per layer.`),
      ...(r.jointFit ? [] : [
        txt(`⚠ That leaves room for ${r.maxPerLayer} bar per layer. A stirrup needs a bar in each bottom corner, so this face cannot be detailed. Widening the BEAM does not help — the room is set by the column, not by the web — so widen the column or use a smaller bar.`),
      ]),
      // A_b appeared here as a bare number for a bar the sheet had not yet
      // named. Both come first now: which bar, and the area it gives.
      txt(`The bar adopted above is ⌀${sn0(i.barDia)}, so one bar carries:`),
      eq(String.raw`A_b = \tfrac{\pi}{4} d_b^2 = \tfrac{\pi}{4}(${sn0(i.barDia)})^2 = ${sn0(Ab)}\ \text{mm}^2`),
      eq(String.raw`n = \lceil A_s / A_b \rceil = \lceil ${sn0(r.As)} / ${sn0(Ab)} \rceil = ${r.bars}\ \text{bars} \Rightarrow \text{layers: } [${r.layers.join(', ')}]`),
      eq(String.raw`s_{clear} = \dfrac{${sn0(bw)} - ${r.layers[0]}(${sn0(i.barDia)})}{${Math.max(1, r.layers[0] - 1)}} = ${sn0(r.sClear)}\ \text{mm} \;\ge\; ${sn0(r.sMinClear)}\ \text{mm}\ \checkmark`),
      ...(multiLayer ? [
        txt('With more than one layer (25 mm clear between layers, §407.7.2) the bar-group centroid rises above the extreme layer — Varignon: ȳ = Σnᵢyᵢ/Σnᵢ — which reduces d, so the design re-runs at the new d until the layer arrangement stops changing.'),
        eq(String.raw`\bar{y} = \dfrac{\sum n_i y_i}{\sum n_i} = ${sn1(r.yBar)}\ \text{mm} \Rightarrow d = d_t - \bar{y} = ${sn1(r.dt)} - ${sn1(r.yBar)} = \mathbf{${sn1(r.d)}}\ \text{mm}`),
      ] : [
        txt('All tension bars fit in one layer, so d = d_t for the tension side.'),
      ]),
      ...(r.comprLayers.length > 0 ? [
        txt(`Compression side — same rule: s_min = max(d_b′, 25) = ${sn0(r.comprSMinClear)} mm, so at most ${r.comprMaxPerLayer} compression bars fit per layer.`),
        eq(String.raw`n' = ${r.comprBars}\ \text{bars} \Rightarrow \text{layers: } [${r.comprLayers.join(', ')}],\quad s_{clear}' = ${sn0(r.comprSClear)}\ \text{mm} \ge ${sn0(r.comprSMinClear)}\ \checkmark`),
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
      // 0.17 is the SI print of the code's own Vc (NSCP 2015 §422.5.5.1 / ACI
      // 318-14 Table 22.5.5.1 = 2λ√f'c in psi). It used to print 1/6 — a stale
      // coefficient from the older √f'c/6 form — while SUBSTITUTING the
      // engine's 0.17 result, so the sheet's formula and its own number
      // disagreed by 2%: (1/6)√28·300·440 = 116.4, printed next to 118.7.
      eq(String.raw`V_c = 0.17\lambda\sqrt{f'_c}\,b d = 0.17\sqrt{${sn0(i.fc)}}(${sn0(i.b)})(${sn1(d)})/1000 = ${sn1(r.Vc)}\ \text{kN}`),
      eq(String.raw`\phi V_c = ${sn1(r.phiVc)}\ \text{kN},\quad \tfrac{1}{2}\phi V_c = ${sn1(r.phiVc / 2)}\ \text{kN}`),
    ],
  })

  // Why 2 legs (or more): the leg count is set PRIMARILY by the beam width — the
  // transverse spacing between legs must stay within hx — and BUMPED by shear if a
  // 2-leg tie at the minimum spacing can't carry Vs.
  {
    const hx = r.legSpacingLimit
    const legWidth = (i.bMin ?? i.b)
    const legSpan = legWidth - 2 * (i.cover + i.stirrupDia / 2)
    const hxUsed = legSpan / (legs - 1)
    const crossties = legs - 2
    const lines: SolutionLine[] = [
      txt(`The number of legs is set primarily by the beam WIDTH: the transverse (horizontal) spacing between legs must stay within hx = ${sn0(hx)} mm (§418.6.4.3 — 350 mm for seismic frame beams, ~600 mm gravity) so the stirrup engages the full width and laterally supports the bars. A 2-leg tie is the default; a wide beam needs interior legs. Aᵥ is the total leg area crossing the shear crack.`),
      eq(String.raw`n_{legs} = \left\lceil \dfrac{b_{web} - 2(c + d_s/2)}{h_x} \right\rceil + 1 = \left\lceil \dfrac{${sn0(legSpan)}}{${sn0(hx)}} \right\rceil + 1 = ${Math.max(1, Math.ceil(legSpan / hx)) + 1}\quad(h_x^{used} = ${sn0(hxUsed)}\ \text{mm})`),
    ]
    if (r.region === 'designed' && r.VsReq > 0) {
      const avsReq = (r.VsReq * 1000) / (fyt * d)
      const shearLegs = Math.max(2, Math.ceil((avsReq * S_MIN_STIRRUP) / ((Math.PI / 4) * i.stirrupDia * i.stirrupDia)))
      lines.push(eq(String.raw`\text{shear bump: } n_{legs} \ge \left\lceil \dfrac{(A_v/s)_{req}\, s_{min}}{\tfrac{\pi}{4}d_s^2} \right\rceil = \left\lceil \dfrac{${sn3(avsReq)}(${S_MIN_STIRRUP})}{${sn1((Math.PI / 4) * i.stirrupDia * i.stirrupDia)}} \right\rceil = ${shearLegs}`))
    }
    lines.push(eq(String.raw`n_{legs} = \mathbf{${legs}},\qquad A_v = n_{legs}\cdot\tfrac{\pi}{4}d_s^2 = ${legs}\cdot\tfrac{\pi}{4}(${sn0(i.stirrupDia)})^2 = ${sn0(r.Av)}\ \text{mm}^2${crossties > 0 ? String.raw`\quad(${crossties}\ \text{extra leg${crossties === 1 ? '' : 's'}})` : ''}`))
    steps.push({ title: 'Transverse legs & shear-reinforcement area Aᵥ (§418.6.4.3 · §422.5)', lines })
  }

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
        txt('Vu exceeds ½φVc but not φVc — minimum shear reinforcement applies (§409.6.3.3), with spacing capped at d/2 ≤ 600 mm (§409.7.6.2.2). Aᵥ is the leg area from the step above.'),
        eq(String.raw`A_{v,min} = \max\!\left(0.062\sqrt{f'_c}\,\tfrac{b\,s}{f_{yt}},\ 0.35\tfrac{b\,s}{f_{yt}}\right),\quad s_{max} = \min(d/2,\,600) = ${sn0(r.sMax)}\ \text{mm}`),
      ],
      note: `Provide ⌀${i.stirrupDia} mm, ${legs}-leg stirrups @ ${sn0(r.sAdopt)} mm.`,
    })
  } else if (r.region === 'designed') {
    // The two §409.7.6.2.2 caps evaluated, not just named: which branch governs
    // decides the spacing the sheet adopts, so the sheet has to say which one
    // fired. And Av,min is APPLIED by the engine (it floors the adopted
    // spacing through sMinArea) — a check that silently shaped the answer
    // belongs on the sheet.
    const thirdRoot = Math.sqrt(i.fc) * i.b * d / 3 / 1000        // ⅓√f'c·b·d, kN
    const capHalved = r.VsReq > thirdRoot
    const avMinAtAdopted = Math.max(0.062 * Math.sqrt(i.fc), 0.35) * i.b * r.sAdopt / fyt
    steps.push({
      title: 'Stirrup design',
      lines: [
        txt('Vu exceeds φVc — design stirrups for Vs = Vu/φ − Vc (§422.5.10.5.3). The §409.7.6.2.2 spacing cap halves to min(d/4, 300) once Vs exceeds ⅓√f′c·b·d — the branch is evaluated here, not left to the reader.'),
        eq(String.raw`V_s = \tfrac{V_u}{\phi} - V_c = \tfrac{${sn1(i.Vu)}}{0.75} - ${sn1(r.Vc)} = ${sn1(r.VsReq)}\ \text{kN} \;(\le V_{s,max} = \tfrac{2}{3}\sqrt{f'_c}\,bd = ${sn1(r.VsMax)})`),
        eq(String.raw`V_s = ${sn1(r.VsReq)}\ \text{kN} ${capHalved ? '>' : '\\le'} \tfrac{1}{3}\sqrt{f'_c}\,bd = ${sn1(thirdRoot)}\ \text{kN} \Rightarrow s_{max} = ${capHalved ? String.raw`\min(d/4,\,300)` : String.raw`\min(d/2,\,600)`} = \mathbf{${sn0(r.sMax)}}\ \text{mm}${capHalved ? String.raw`\ (\text{cap halved})` : String.raw`\ (\text{cap not halved})`}`),
        eq(String.raw`s = \dfrac{A_v f_{yt} d}{V_s} = \dfrac{${sn0(r.Av)}(${sn0(fyt)})(${sn1(d)})}{${sn1(r.VsReq)}\times 10^3} = ${sn0(r.sReq)}\ \text{mm},\quad s_{max} = ${sn0(r.sMax)}\ \text{mm}`),
        eq(String.raw`A_{v,min} = \max(0.062\sqrt{f'_c},\,0.35)\tfrac{b\,s}{f_{yt}}\big|_{s=s_{adopt}} = ${sn0(avMinAtAdopted)}\ \text{mm}^2 \le A_v = ${sn0(r.Av)}\ \text{mm}^2\ \checkmark`),
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

  // Margin clauses + PASS chips for the calc-report layout: title-keyed so the
  // step-building branches above stay untouched. Every chip cites NSCP 2015
  // (the concrete chapter's 4-prefixed numbering); ACI 318-14's number is the
  // same one minus the chapter-4 prefix. The sheet used to mix both spellings
  // — §22.5 beside §407.7 — and read as two different codes.
  const notes: [string, string, boolean | undefined][] = [
    ['Effective depth', 'NSCP 2015 §420.6.1 cover', undefined],
    ['Reinforcement-ratio limits', 'NSCP 2015 §409.6.1.2 · §421.2.2', r.rho <= r.rhoMax + 1e-9 || r.mode === 'DRRB'],
    ['SRRB / DRRB classification', 'NSCP 2015 §422.2', undefined],
    ['Tension steel', 'NSCP 2015 §422.2', r.flexOK],
    ['Compression steel', 'NSCP 2015 §422.2.2', r.comprEffective && r.comprNAOK],
    ['Bar layout', 'NSCP 2015 §407.7', r.sClear >= r.sMinClear - 1e-9],
    ['Shear strength of concrete', 'NSCP 2015 §422.5.5.1', undefined],
    ['Stirrup requirement', 'NSCP 2015 §422.5', undefined],
    ['Minimum stirrups', 'NSCP 2015 §409.6.3', r.region !== 'inadequate'],
    ['Stirrup design', 'NSCP 2015 §422.5 · §409.7.6.2.2', r.region !== 'inadequate'],
    ['Section check (shear)', 'NSCP 2015 §422.5.1.2', r.region !== 'inadequate'],
    ['Stirrup detailing', 'NSCP 2015 §407.3.2 · §425.3.2', undefined],
    ['Hinge-zone confinement', 'NSCP 2015 §418.6.4.4 · §418.4.2.4', undefined],
    ['Provided capacities', 'NSCP 2015 §422.2 · §422.5', r.flexOK && r.region !== 'inadequate'],
  ]
  // The 2h zone at each support is confined by DETAILING, not by Vu: on a
  // lightly loaded beam the shear rules are satisfied at d/2 and say nothing
  // about the hinge. Shown only where a seismic system actually imposes it.
  if (r.seismicSConf !== undefined) {
    steps.push({
      title: 'Hinge-zone confinement',
      lines: [
        txt('Over 2h from each support face the hoops confine a plastic hinge. The spacing there is a detailing limit and does not come from the shear demand, which the gravity maximum of d/2 already satisfies.'),
        eq(String.raw`s_{hinge} = \min(s_{adopt},\ ${sn0(r.seismicSConf)}) = \mathbf{${sn0(r.sHinge)}}\ \text{mm}`),
      ],
      note: `Governed by ${r.hingeGovern}. Outside the zone, ⌀${i.stirrupDia} @ ${sn0(r.sAdopt)} mm.`,
    })
  }

  // The sheet used to STOP at the design: As required, stirrups required — and
  // the verdict chip on the page quoted a φMn the sheet never derived. This is
  // the closing step a checker looks for: the section as BUILT (provided bars,
  // adopted stirrup spacing) against the demand. Solved by strain
  // compatibility through `rectCapacity`, so an over-reinforced section shows
  // the steel stress it really reaches and the φ that goes with it, instead of
  // the yield formula's optimistic 0.90.
  {
    const cap = beamProvidedCapacities({ ...i, fyt, legs }, r)
    const sol = rectCapacity(i.b, r.d, r.dt, r.AsProv, i.fc, i.fy)
    const tensionOnly = r.mode !== 'DRRB' || r.comprBars === 0
    steps.push({
      title: 'Provided capacities — the section as built',
      lines: [
        txt(`The demand re-checked against the bars and stirrups actually detailed (${r.bars} ⌀${i.barDia} mm, ⌀${i.stirrupDia} @ ${sn0(r.sAdopt)} mm), not against the required areas the design solved for. Capacity is solved from strain compatibility, so the steel stress and φ come out of the section rather than being assumed.${tensionOnly ? '' : ' Tension steel only — the compression steel holds the neutral axis lower, so the figure below understates on the safe side.'}`),
        eq(String.raw`a = \dfrac{A_{s,prov} f_y}{0.85 f'_c b} = \dfrac{${sn0(r.AsProv)}(${sn0(i.fy)})}{0.85(${sn0(i.fc)})(${sn0(i.b)})} = ${sn1(sol.a)}\ \text{mm},\qquad \rho_{prov} = \dfrac{A_{s,prov}}{b\,d} = ${sn4(r.AsProv / (i.b * r.d))}\ \text{(required } ${sn4(r.rho)}\text{)}`),
        eq(String.raw`M_n = A_{s,prov} f_s (d - a/2) = ${sn0(r.AsProv)}(${sn1(sol.fs)})(${sn1(r.d)} - ${sn1(sol.a / 2)})/10^6 = ${sn1(sol.Mn)}\ \text{kN·m} \Rightarrow \phi M_n = ${sn2(sol.phi)}\times ${sn1(sol.Mn)} = \mathbf{${sn1(cap.phiMn)}}\ \text{kN·m}\ ${cap.phiMn >= i.Mu ? '\\ge' : '<'}\ M_u = ${sn1(i.Mu)}\ \text{kN·m}\ ${cap.phiMn >= i.Mu ? '\\checkmark' : '\\times'}`),
        eq(String.raw`\phi V_n = \phi V_c + \phi V_s = ${sn1(r.phiVc)} + \dfrac{0.75\,A_v f_{yt} d}{s} = ${sn1(r.phiVc)} + ${sn1(cap.phiVn - r.phiVc)} = \mathbf{${sn1(cap.phiVn)}}\ \text{kN}\ ${cap.phiVn >= i.Vu ? '\\ge' : '<'}\ V_u = ${sn1(i.Vu)}\ \text{kN}\ ${cap.phiVn >= i.Vu ? '\\checkmark' : '\\times'}`),
      ],
    })
  }
  return steps.map((st) => {
    const hit = notes.find(([k]) => st.title.startsWith(k))
    return hit ? { ...st, clause: hit[1], ...(hit[2] === undefined ? {} : { pass: hit[2] }) } : st
  })
}

/** Provided design capacities for the verdict/utilization display — the same
 *  arithmetic the worked-solution steps above already spell out (φ = 0.90
 *  flexure / 0.75 shear; Vs from the adopted stirrup spacing). Presentation
 *  math in the lib layer; the engine result stays the source of As, d, sAdopt. */
export function beamProvidedCapacities(
  i: BeamDesignInput & { fyt: number; legs: number }, r: BeamDesignResult,
): { phiMn: number; phiVn: number } {
  const AsProv = r.bars * (Math.PI / 4) * i.barDia ** 2               // provided bars, mm²
  // SOLVED, not assumed — both the steel stress and φ. This read
  // 0.9·As·fy·(d − a/2), which is right only while the steel yields and φ is
  // 0.90, and neither holds on an over-reinforced section: a 200×300 in f'c 21
  // with fy 550 and ⌀32 bars, where §9.6.1.2's two-bar minimum alone puts ρ at
  // 0.034, was reported at 87.7 kN·m against a true 51.7.
  //
  // Tension steel only, as before — for a DRRB section the compression steel
  // holds the neutral axis and this understates, which is the safe side.
  const phiMn = rectCapacity(i.b, r.d, r.dt, AsProv, i.fc, i.fy).phiMn
  const Av = i.legs * (Math.PI / 4) * i.stirrupDia ** 2               // mm²
  const phiVs = r.sAdopt > 0 ? (0.75 * Av * i.fyt * r.d) / r.sAdopt / 1e3 : 0   // kN
  return { phiMn, phiVn: r.phiVc + phiVs }
}
