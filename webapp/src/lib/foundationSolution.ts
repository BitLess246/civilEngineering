// ─────────────────────────────────────────────────────────────────────────
// Detailed worked solution for the Foundation page — modelled on the legacy
// step-by-step output: each step has a short explanation (citing the governing
// clause) followed by the substituted equations. Square footings support the
// Analysis Method (design / analyze given dimensions) and Solution Method
// (iteration / approximate). Computed with the same engine formulas so the
// steps always agree with the Results panel.
// ─────────────────────────────────────────────────────────────────────────
import type { ColumnPosition } from '../engine/shear'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3, sn4 } from './solution'

interface SteelCtx { As: number; rho: number; usedMin: boolean; bars: number; spacing: number }

export interface SolutionCtx {
  type: 'square' | 'rectangular'
  loading: 'concentric' | 'eccentric'
  analysis: 'design' | 'analyze'
  method: 'iteration' | 'approximate'
  serviceLoad: number; ultimateLoad: number
  /** Present when P/Pu were derived from individual dead & live loads. */
  loads?: { dead: number; live: number } | null
  serviceMoment: number; ultimateMoment: number
  columnWidth: number; fc: number; fy: number
  qAllow: number; gammaSoil: number; gammaConc: number; H: number
  barDia: number; cover: number; surcharge: number; position: ColumnPosition
  Bx: number; By: number; Dc: number; qNet: number; qu: number
  dPunch: number; dBeamLong: number; dBeamShort: number; dProvided: number
  punchOK: boolean; beamOK: boolean
  long: SteelCtx; short: (SteelCtx & { bandBars: number; bandFraction: number }) | null
  ecc: { e: number; qMax: number; qMin: number; kernOK: boolean } | null
}

const ALPHA_S: Record<ColumnPosition, number> = { interior: 40, edge: 30, corner: 20 }
const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

function loadsStep(c: SolutionCtx): SolutionStep {
  if (c.loads) {
    const { dead, live } = c.loads
    return {
      title: 'Service & factored loads',
      lines: [
        txt('Individual loads were given: the service load is D + L for the bearing check, and the factored load is the larger of 1.4D and 1.2D + 1.6L for strength design (NSCP 2015 §203 / ACI 318-14 §5.3).'),
        eq(String.raw`P = D + L = ${sn0(dead)} + ${sn0(live)} = \mathbf{${sn0(c.serviceLoad)}}\ \text{kN}`),
        eq(String.raw`P_u = \max(1.4D,\ 1.2D + 1.6L) = \max(${sn1(1.4 * dead)},\ ${sn1(1.2 * dead + 1.6 * live)}) = \mathbf{${sn1(c.ultimateLoad)}}\ \text{kN}`),
      ],
      note: 1.4 * dead >= 1.2 * dead + 1.6 * live ? '1.4D governs.' : '1.2D + 1.6L governs.',
    }
  }
  return {
    title: 'Service & factored loads',
    lines: [
      txt('The footing carries a service (unfactored) axial load P for the bearing check and a factored load Pu = max(1.4D, 1.2D + 1.6L) for strength design (NSCP 2015 §203 / ACI 318-14 §5.3).'),
      eq(String.raw`P = ${sn0(c.serviceLoad)}\ \text{kN},\qquad P_u = ${sn0(c.ultimateLoad)}\ \text{kN}`),
    ],
  }
}

function bearingStep(c: SolutionCtx): SolutionStep {
  const DcM = c.Dc / 1000, Ds = c.H - DcM
  const why =
    c.analysis === 'analyze'
      ? `Using the provided slab thickness D_c = ${sn0(c.Dc)} mm.`
      : c.method === 'approximate'
        ? 'Approximate method: assume a trial slab thickness D_c = 250 mm to estimate the overburden, size the footing in one pass, then compute the required thickness once (no re-iteration — slightly conservative).'
        : `Iteration method: D_c changes q_net, which changes the plan size, which changes D_c — so the sizing and thickness are solved together to a fixed point. The converged D_c = ${sn0(c.Dc)} mm is shown.`
  return {
    title: 'Net allowable soil bearing pressure',
    lines: [
      txt('The net pressure available for the column load is the gross allowable bearing less the overburden of soil and concrete above the founding level, and any surcharge.'),
      txt(why),
      eq(String.raw`D_s = H - D_c = ${sn2(c.H)} - ${sn3(DcM)} = ${sn3(Ds)}\ \text{m}`),
      eq(String.raw`q_{net} = q_a - \gamma_s D_s - \gamma_c D_c - q = ${sn0(c.qAllow)} - ${sn0(c.gammaSoil)}(${sn3(Ds)}) - ${sn0(c.gammaConc)}(${sn3(DcM)}) - ${sn0(c.surcharge)} = \mathbf{${sn2(c.qNet)}}\ \text{kPa}`),
    ],
  }
}

function sizeOrGivenStep(c: SolutionCtx): SolutionStep {
  if (c.analysis === 'analyze') {
    return {
      title: 'Given section',
      lines: [
        txt('Analyze mode — the plan size and thickness are provided; the remaining steps check the section rather than size it.'),
        eq(String.raw`B = ${sn2(c.Bx)}\ \text{m},\qquad D_c = ${sn0(c.Dc)}\ \text{mm}`),
      ],
    }
  }
  const Areq = c.serviceLoad / c.qNet
  return {
    title: 'Required area and footing size',
    lines: [
      txt('Size the plan so the service pressure does not exceed q_net, then round up to a practical dimension.'),
      eq(String.raw`A_{req} = \dfrac{P}{q_{net}} = \dfrac{${sn0(c.serviceLoad)}}{${sn2(c.qNet)}} = ${sn3(Areq)}\ \text{m}^2`),
      eq(String.raw`B = \sqrt{A_{req}} = ${sn2(Math.sqrt(Areq))} \to \mathbf{${sn2(c.Bx)}}\ \text{m}`),
    ],
  }
}

function pressureStep(c: SolutionCtx): SolutionStep {
  const tex = c.type === 'square'
    ? String.raw`q_u = \dfrac{P_u}{B^2} = \dfrac{${sn0(c.ultimateLoad)}}{${sn2(c.Bx)}^2} = \mathbf{${sn2(c.qu)}}\ \text{kPa}`
    : String.raw`q_u = \dfrac{P_u}{B_x B_y} = \dfrac{${sn0(c.ultimateLoad)}}{${sn2(c.Bx)}\times ${sn2(c.By)}} = \mathbf{${sn2(c.qu)}}\ \text{kPa}`
  return {
    title: 'Factored bearing pressure',
    lines: [txt('The soil reaction used for strength design is the factored load spread over the plan area.'), eq(tex)],
  }
}

function punchingStep(c: SolutionCtx): SolutionStep {
  const cmm = c.columnWidth, d = c.analysis === 'analyze' ? c.dProvided : c.dPunch
  const crit = cmm + d, bo = 4 * crit, Ao = crit * crit * 1e-6
  const Vu = c.ultimateLoad - c.qu * Ao
  const base = (Math.sqrt(c.fc) * bo * d) / 1000
  const vc1 = base / 3, vc2 = base / 2, vc3 = (1 / 12) * (2 + (ALPHA_S[c.position] * d) / bo) * base
  const vc = Math.min(vc1, vc2, vc3)
  const phiVc = 0.75 * vc
  const pass = phiVc >= Vu
  return {
    title: 'Two-way (punching) shear',
    lines: [
      txt(`Two-way (punching) shear acts on a critical perimeter b₀ at d/2 from the column face (ACI §22.6). V_c is the least of three expressions; α_s = ${ALPHA_S[c.position]} for an ${c.position} column.`),
      eq(String.raw`b_o = 4(c + d) = 4(${sn0(cmm)} + ${sn0(d)}) = ${sn0(bo)}\ \text{mm},\quad d = ${sn0(d)}\ \text{mm}`),
      eq(String.raw`V_u = P_u - q_u(c+d)^2 = ${sn0(c.ultimateLoad)} - ${sn2(c.qu)}(${sn3(Ao)}) = ${sn1(Vu)}\ \text{kN}`),
      eq(String.raw`V_{c} = \min\!\left(\tfrac{1}{3}, \tfrac{1}{6}(1{+}\tfrac{2}{\beta}), \tfrac{1}{12}(2{+}\tfrac{\alpha_s d}{b_o})\right)\sqrt{f'_c}\,b_o d`),
      eq(String.raw`= \min(${sn1(vc1)},\ ${sn1(vc2)},\ ${sn1(vc3)}) = ${sn1(vc)}\ \text{kN}`),
      eq(String.raw`\phi V_c = 0.75 V_c = ${sn1(phiVc)}\ \text{kN} \;${pass ? '\\ge' : '<'}\; V_u = ${sn1(Vu)}\ \text{kN}\;${pass ? '\\checkmark' : '\\times'}`),
    ],
    note: c.analysis === 'design'
      ? `Solving φV_c = V_u gives the required d = ${sn0(c.dPunch)} mm.`
      : (pass ? 'Provided depth is adequate for punching.' : 'Provided depth is NOT adequate for punching — increase D_c.'),
  }
}

function oneWayStep(c: SolutionCtx, B: number, dReq: number, label: string): SolutionStep {
  const cm = c.columnWidth / 1000
  const d = c.analysis === 'analyze' ? c.dProvided : dReq
  const arm = (B - cm) / 2 - d / 1000
  const Vu = c.qu * B * Math.max(0, arm)
  const phiVc = (0.75 * (1 / 6) * Math.sqrt(c.fc) * (B * 1000) * d) / 1000
  const pass = phiVc >= Vu
  return {
    title: `One-way (beam) shear${label ? ` — ${label}` : ''}`,
    lines: [
      txt('One-way shear is checked on a section a distance d from the column face (ACI §22.5); the soil pressure beyond that section produces V_u.'),
      eq(String.raw`a_v = \tfrac{B-c}{2} - d = \tfrac{${sn2(B)}-${sn3(cm)}}{2} - ${sn3(d / 1000)} = ${sn3(arm)}\ \text{m}`),
      eq(String.raw`V_u = q_u B\,a_v = ${sn2(c.qu)}(${sn2(B)})(${sn3(arm)}) = ${sn1(Vu)}\ \text{kN}`),
      eq(String.raw`\phi V_c = 0.75\cdot\tfrac{1}{6}\sqrt{f'_c}\,B d = ${sn1(phiVc)}\ \text{kN} \;${pass ? '\\ge' : '<'}\; V_u\;${pass ? '\\checkmark' : '\\times'}`),
    ],
    note: c.analysis === 'design' ? `Required d = ${sn0(dReq)} mm.` : undefined,
  }
}

function thicknessStep(c: SolutionCtx): SolutionStep {
  const dFlex = c.Dc - c.cover - c.barDia / 2
  if (c.analysis === 'analyze') {
    const adequate = c.punchOK && c.beamOK
    return {
      title: 'Depth adequacy',
      lines: [
        eq(String.raw`d_{prov} = D_c - cover - d_b = ${sn0(c.Dc)} - ${sn0(c.cover)} - ${sn0(c.barDia)} = ${sn0(c.dProvided)}\ \text{mm}`),
        eq(String.raw`d_{prov} = ${sn0(c.dProvided)} \;${adequate ? '\\ge' : '<'}\; \max(d_{punch},d_{beam}) = \max(${sn0(c.dPunch)},${sn0(c.dBeamLong)}) = ${sn0(Math.max(c.dPunch, c.dBeamLong))}\ \text{mm}\;${adequate ? '\\checkmark' : '\\times'}`),
      ],
      note: adequate ? 'The provided section satisfies both shear checks.' : 'The provided section is inadequate in shear — increase D_c.',
    }
  }
  return {
    title: 'Slab thickness',
    lines: [
      txt('The thickness is set by the larger shear requirement plus cover and one bar diameter, rounded up to 25 mm.'),
      eq(String.raw`D_c = \max(d_{punch},d_{beam}) + cover + d_b = \max(${sn0(c.dPunch)},${sn0(Math.max(c.dBeamLong, c.dBeamShort))}) + ${sn0(c.cover)} + ${sn0(c.barDia)} \to \mathbf{${sn0(c.Dc)}}\ \text{mm}`),
      eq(String.raw`d = D_c - cover - \tfrac{d_b}{2} = ${sn1(dFlex)}\ \text{mm}`),
    ],
  }
}

function flexureStep(c: SolutionCtx, span: number, width: number, steel: SteelCtx, label: string): SolutionStep {
  const cm = c.columnWidth / 1000
  const d = c.Dc - c.cover - c.barDia / 2
  const arm = (span - cm) / 2
  const Mu = (c.qu * width * arm * arm) / 2
  const b = width * 1000
  const Rn = (Mu * 1e6) / (0.9 * b * d * d)
  const rhoCalc = (0.85 * c.fc / c.fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (0.85 * c.fc))))
  const rMin = Math.max(1.4 / c.fy, Math.sqrt(c.fc) / (4 * c.fy))
  return {
    title: `Flexural reinforcement${label ? ` — ${label}` : ''}`,
    lines: [
      txt('The footing cantilevers from the column face; the design moment is the soil pressure acting over that cantilever (ACI §13.2). ρ is found from Rₙ and floored at ρ_min.'),
      eq(String.raw`a = \tfrac{${label === 'short (y)' ? 'B_y' : 'B'}-c}{2} = ${sn3(arm)}\ \text{m},\quad M_u = \tfrac{q_u\,b\,a^2}{2} = ${sn1(Mu)}\ \text{kN·m}`),
      eq(String.raw`R_n = \dfrac{M_u}{\phi b d^2} = ${sn3(Rn)}\ \text{MPa},\quad \rho = \tfrac{0.85 f'_c}{f_y}\!\left(1-\sqrt{1-\tfrac{2R_n}{0.85 f'_c}}\right) = ${sn4(rhoCalc)}`),
      eq(String.raw`\rho_{min} = \max(\tfrac{1.4}{f_y}, \tfrac{\sqrt{f'_c}}{4 f_y}) = ${sn4(rMin)} \Rightarrow A_s = \rho b d = ${sn0(steel.As)}\ \text{mm}^2`),
    ],
    note: steel.usedMin ? 'ρ_min governs.' : 'Computed ρ governs.',
  }
}

function barsStep(c: SolutionCtx, steel: SteelCtx, label: string): SolutionStep {
  const Ab = (Math.PI / 4) * c.barDia * c.barDia
  return {
    title: `Bar selection${label ? ` — ${label}` : ''}`,
    lines: [
      txt('Choose the bar count from the required area and one bar size, then space them evenly across the width less the side covers.'),
      eq(String.raw`A_b = \tfrac{\pi}{4}d_b^2 = ${sn0(Ab)}\ \text{mm}^2,\quad n = \lceil A_s/A_b \rceil = ${steel.bars}`),
      eq(String.raw`s = \dfrac{b - 2\,cover - n d_b}{n-1} = ${sn0(steel.spacing)}\ \text{mm}`),
    ],
    note: `Provide ${steel.bars} ⌀${c.barDia} mm @ ${sn0(steel.spacing)} mm ${label ? `(${label})` : 'each way'}.`,
  }
}

function devLengthStep(c: SolutionCtx): SolutionStep {
  // Simplified tension development length (NSCP 425.4.2.3 with ψ = 1,
  // (c_b+K_tr)/d_b = 2.5): l_d = f_y d_b / (1.1 λ √f'c · 2.5), ≥ 300 mm.
  const ld = Math.max(300, (c.fy * c.barDia) / (1.1 * Math.sqrt(c.fc) * 2.5))
  const avail = ((c.Bx - c.columnWidth / 1000) / 2) * 1000 - 75
  const ok = avail >= ld
  return {
    title: 'Development length (simplified)',
    lines: [
      txt('The bars must develop f_y within the cantilever; the straight length available is from the column face to the footing edge less the end cover.'),
      eq(String.raw`\ell_d = \dfrac{f_y d_b}{1.1\lambda\sqrt{f'_c}\,2.5} = ${sn0(ld)}\ \text{mm}`),
      eq(String.raw`\ell_{avail} = \tfrac{B-c}{2} - 75 = ${sn0(avail)}\ \text{mm} \;${ok ? '\\ge' : '<'}\; \ell_d\;${ok ? '\\checkmark' : '\\times'}`),
    ],
    note: ok ? 'Straight bars develop fully; no hooks required.' : 'Insufficient straight length — provide hooks or increase the footing.',
  }
}

function eccentricityStep(c: SolutionCtx): SolutionStep | null {
  if (!c.ecc) return null
  const B = c.Bx
  return {
    title: 'Eccentricity & pressure distribution',
    lines: [
      txt('A column moment shifts the resultant by e = M/P. Keeping e within the kern (B/6) guarantees the whole base stays in compression (no uplift).'),
      eq(String.raw`e = \dfrac{M}{P} = \dfrac{${sn0(c.serviceMoment)}}{${sn0(c.serviceLoad)}} = ${sn3(c.ecc.e)}\ \text{m} \;${c.ecc.kernOK ? '\\le' : '>'}\; \tfrac{B}{6} = ${sn3(B / 6)}\ \text{m}`),
      eq(String.raw`q_{max,min} = \dfrac{P}{B^2}\!\left(1 \pm \dfrac{6e}{B}\right) = ${sn2(c.ecc.qMax)} \,/\, ${sn2(c.ecc.qMin)}\ \text{kPa}`),
    ],
    note: c.ecc.kernOK ? 'Within the kern — full bearing. Design uses the factored peak pressure.' : 'e > B/6 — partial bearing/uplift; revise the footing.',
  }
}

export function buildFoundationSolution(c: SolutionCtx): SolutionStep[] {
  const steps: SolutionStep[] = [loadsStep(c), bearingStep(c)]
  const eccS = eccentricityStep(c)
  if (eccS) steps.push(eccS)
  steps.push(sizeOrGivenStep(c), pressureStep(c), punchingStep(c))

  if (c.type === 'square') {
    steps.push(oneWayStep(c, c.Bx, c.dBeamLong, ''), thicknessStep(c))
    steps.push(flexureStep(c, c.Bx, c.Bx, c.long, ''), barsStep(c, c.long, ''), devLengthStep(c))
  } else {
    steps.push(
      oneWayStep(c, c.Bx, c.dBeamLong, 'long (x)'),
      oneWayStep(c, c.By, c.dBeamShort, 'short (y)'),
      thicknessStep(c),
      flexureStep(c, c.Bx, c.By, c.long, 'long (x)'),
      barsStep(c, c.long, 'long (x)'),
    )
    if (c.short) {
      steps.push(flexureStep(c, c.By, c.Bx, c.short, 'short (y)'), barsStep(c, c.short, 'short (y)'))
      steps.push({
        title: 'Central band (short direction)',
        lines: [
          txt('In a rectangular footing more of the short-direction steel is concentrated in a central band of width B_y under the column (NSCP §413.3.3.3).'),
          eq(String.raw`\dfrac{\text{band steel}}{\text{total}} = \dfrac{2}{\beta + 1},\quad \beta = \tfrac{B_x}{B_y} = ${sn2(c.Bx / c.By)} \Rightarrow ${c.short.bandBars}\ \text{of}\ ${c.short.bars}\ \text{bars}\ (\approx ${sn0(c.short.bandFraction * 100)}\%)`),
        ],
      })
    }
  }
  return steps
}
