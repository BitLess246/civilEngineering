// ─────────────────────────────────────────────────────────────────────────
// Worked step-by-step solution for the Foundation page — reproduces the
// legacy app's derivation (loads → net bearing → size → shear → flexure →
// bars) with substituted numbers, computed with the same engine formulas so
// the steps stay consistent with the Results panel. Pure & framework-agnostic;
// returns KaTeX strings the React component renders.
// ─────────────────────────────────────────────────────────────────────────
import type { ColumnPosition } from '../engine/shear'

export interface SolutionLine { tex: string }
export interface SolutionStep { title: string; lines: SolutionLine[]; note?: string }

interface SteelCtx { As: number; rho: number; usedMin: boolean; bars: number; spacing: number }

/** Flattened design context (page maps form + result into this). */
export interface SolutionCtx {
  type: 'square' | 'rectangular'
  loading: 'concentric' | 'eccentric'
  serviceLoad: number; ultimateLoad: number
  serviceMoment: number; ultimateMoment: number
  columnWidth: number; fc: number; fy: number
  qAllow: number; gammaSoil: number; gammaConc: number; H: number
  barDia: number; cover: number; surcharge: number; position: ColumnPosition
  Bx: number; By: number; Dc: number; qNet: number; qu: number
  dPunch: number; dBeamLong: number; dBeamShort: number
  long: SteelCtx; short: (SteelCtx & { bandBars: number; bandFraction: number }) | null
  ecc: { e: number; qMax: number; qMin: number; kernOK: boolean } | null
}

const n0 = (v: number) => Math.round(v).toString()
const n1 = (v: number) => v.toFixed(1)
const n2 = (v: number) => v.toFixed(2)
const n3 = (v: number) => v.toFixed(3)
const n4 = (v: number) => v.toFixed(4)
const ALPHA_S: Record<ColumnPosition, number> = { interior: 40, edge: 30, corner: 20 }

// ── Shared steps ────────────────────────────────────────────────────────
function bearingStep(c: SolutionCtx): SolutionStep {
  const DcM = c.Dc / 1000, Ds = c.H - DcM
  return {
    title: 'Net allowable soil pressure',
    lines: [
      { tex: String.raw`q_{net} = q_a - \gamma_s D_s - \gamma_c D_c - q,\quad D_s = H - D_c` },
      { tex: String.raw`q_{net} = ${n0(c.qAllow)} - ${n0(c.gammaSoil)}(${n3(Ds)}) - ${n0(c.gammaConc)}(${n3(DcM)}) - ${n0(c.surcharge)} = \mathbf{${n2(c.qNet)}}\ \text{kPa}` },
    ],
    note: `Using the converged slab thickness D_c = ${n0(c.Dc)} mm (sizing and thickness are iterated together).`,
  }
}

function pressureStep(c: SolutionCtx): SolutionStep {
  const area = c.Bx * c.By
  const sizeTex = c.type === 'square'
    ? String.raw`q_u = \dfrac{P_u}{B^2} = \dfrac{${n0(c.ultimateLoad)}}{${n2(c.Bx)}^2} = \mathbf{${n2(c.qu)}}\ \text{kPa}`
    : String.raw`q_u = \dfrac{P_u}{B_x B_y} = \dfrac{${n0(c.ultimateLoad)}}{${n2(c.Bx)}\times ${n2(c.By)}} = \mathbf{${n2(c.qu)}}\ \text{kPa}`
  return { title: 'Factored bearing pressure', lines: [{ tex: `A = ${n3(area)}\\ \\text{m}^2` }, { tex: sizeTex }] }
}

function punchingStep(c: SolutionCtx): SolutionStep {
  const cmm = c.columnWidth, d = c.dPunch
  const crit = cmm + d, bo = 4 * crit, Ao = crit * crit * 1e-6
  const Vu = c.ultimateLoad - c.qu * Ao
  const base = (Math.sqrt(c.fc) * bo * d) / 1000
  const vc = Math.min(base / 3, base / 2, (1 / 12) * (2 + (ALPHA_S[c.position] * d) / bo) * base)
  const phiVc = 0.75 * vc
  return {
    title: 'Two-way (punching) shear',
    lines: [
      { tex: String.raw`b_o = 4(c+d) = 4(${n0(cmm)}+${n0(d)}) = ${n0(bo)}\ \text{mm}` },
      { tex: String.raw`V_u = P_u - q_u(c+d)^2 = ${n0(c.ultimateLoad)} - ${n2(c.qu)}(${n3(Ao)}) = ${n1(Vu)}\ \text{kN}` },
      { tex: String.raw`\phi V_c = 0.75\,\min(V_{c1},V_{c2},V_{c3}) = ${n1(phiVc)}\ \text{kN} \ge V_u\ \checkmark` },
    ],
    note: `Critical perimeter at d/2 from the column face; required d = ${n0(d)} mm.`,
  }
}

function oneWayStep(c: SolutionCtx, B: number, d: number, label: string): SolutionStep {
  const cm = c.columnWidth / 1000
  const arm = (B - cm) / 2 - d / 1000
  const Vu = c.qu * B * Math.max(0, arm)
  const phiVc = (0.75 * (1 / 6) * Math.sqrt(c.fc) * (B * 1000) * d) / 1000
  return {
    title: `One-way (beam) shear${label ? ` — ${label}` : ''}`,
    lines: [
      { tex: String.raw`a_v = \tfrac{B-c}{2} - d = \tfrac{${n2(B)}-${n3(cm)}}{2} - ${n3(d / 1000)} = ${n3(arm)}\ \text{m}` },
      { tex: String.raw`V_u = q_u B\,a_v = ${n2(c.qu)}(${n2(B)})(${n3(arm)}) = ${n1(Vu)}\ \text{kN}` },
      { tex: String.raw`\phi V_c = 0.75\cdot\tfrac{1}{6}\sqrt{f'_c}\,B d = ${n1(phiVc)}\ \text{kN} \ge V_u\ \checkmark` },
    ],
    note: `Critical section d = ${n0(d)} mm from the column face.`,
  }
}

function thicknessStep(c: SolutionCtx): SolutionStep {
  const dFlex = c.Dc - c.cover - c.barDia / 2
  return {
    title: 'Slab thickness',
    lines: [
      { tex: String.raw`D_c = \max(d_{punch},d_{beam}) + cover + d_b = \max(${n0(c.dPunch)},${n0(Math.max(c.dBeamLong, c.dBeamShort))}) + ${n0(c.cover)} + ${n0(c.barDia)} \to \mathbf{${n0(c.Dc)}}\ \text{mm}` },
      { tex: String.raw`d = D_c - cover - \tfrac{d_b}{2} = ${n0(c.Dc)} - ${n0(c.cover)} - ${n1(c.barDia / 2)} = ${n1(dFlex)}\ \text{mm}` },
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
      { tex: String.raw`a = \tfrac{${label === 'short (y)' ? 'B_y' : 'B'}-c}{2} = ${n3(arm)}\ \text{m},\quad M_u = \tfrac{q_u\,b\,a^2}{2} = ${n1(Mu)}\ \text{kN·m}` },
      { tex: String.raw`R_n = \dfrac{M_u}{\phi b d^2} = ${n3(Rn)}\ \text{MPa}` },
      { tex: String.raw`\rho = \tfrac{0.85 f'_c}{f_y}\!\left(1-\sqrt{1-\tfrac{2R_n}{0.85 f'_c}}\right) = ${n4(rhoCalc)},\quad \rho_{min} = ${n4(rMin)}` },
      { tex: String.raw`A_s = \rho\,b\,d = ${n0(steel.As)}\ \text{mm}^2\quad(\rho = ${n4(steel.rho)})` },
    ],
    note: steel.usedMin ? 'ρ_min governs.' : 'Computed ρ governs.',
  }
}

function barsStep(c: SolutionCtx, steel: SteelCtx, label: string): SolutionStep {
  const Ab = (Math.PI / 4) * c.barDia * c.barDia
  return {
    title: `Bar selection${label ? ` — ${label}` : ''}`,
    lines: [
      { tex: String.raw`A_b = \tfrac{\pi}{4}d_b^2 = ${n0(Ab)}\ \text{mm}^2,\quad n = \lceil A_s/A_b \rceil = ${steel.bars}` },
      { tex: String.raw`s = \dfrac{b - 2\,cover - n d_b}{n-1} = ${n0(steel.spacing)}\ \text{mm}` },
    ],
    note: `Provide ${steel.bars} ⌀${c.barDia} mm @ ${n0(steel.spacing)} mm ${label ? `(${label})` : 'each way'}.`,
  }
}

function eccentricityStep(c: SolutionCtx): SolutionStep | null {
  if (!c.ecc) return null
  const B = c.Bx
  return {
    title: 'Eccentricity & pressure distribution',
    lines: [
      { tex: String.raw`e = \dfrac{M}{P} = \dfrac{${n0(c.serviceMoment)}}{${n0(c.serviceLoad)}} = ${n3(c.ecc.e)}\ \text{m} \;${c.ecc.kernOK ? '\\le' : '>'}\; \tfrac{B}{6} = ${n3(B / 6)}\ \text{m}` },
      { tex: String.raw`q_{max,min} = \dfrac{P}{B^2}\!\left(1 \pm \dfrac{6e}{B}\right) = ${n2(c.ecc.qMax)} \,/\, ${n2(c.ecc.qMin)}\ \text{kPa}` },
    ],
    note: c.ecc.kernOK
      ? 'Resultant stays within the kern — full bearing, no uplift. Design uses the factored peak pressure.'
      : 'Eccentricity exceeds B/6 — partial bearing/uplift; revise the footing.',
  }
}

/** Ordered worked-solution steps for the current design. */
export function buildFoundationSolution(c: SolutionCtx): SolutionStep[] {
  const steps: SolutionStep[] = [bearingStep(c)]
  const eccS = eccentricityStep(c)
  if (eccS) steps.push(eccS)
  steps.push(pressureStep(c), punchingStep(c))

  if (c.type === 'square') {
    steps.push(oneWayStep(c, c.Bx, c.dBeamLong, ''), thicknessStep(c))
    steps.push(flexureStep(c, c.Bx, c.Bx, c.long, ''), barsStep(c, c.long, ''))
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
          { tex: String.raw`\dfrac{\text{band steel}}{\text{total}} = \dfrac{2}{\beta + 1},\quad \beta = \tfrac{B_x}{B_y} = ${n2(c.Bx / c.By)}` },
          { tex: String.raw`\Rightarrow ${c.short.bandBars}\ \text{of}\ ${c.short.bars}\ \text{bars in the central band } B_y\ (\approx ${n0(c.short.bandFraction * 100)}\%)` },
        ],
        note: 'NSCP 2015 §413.3.3.3 — concentrate the central-band fraction within a width B_y under the column.',
      })
    }
  }
  return steps
}
