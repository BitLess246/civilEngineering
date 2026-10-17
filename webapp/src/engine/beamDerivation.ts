// ─────────────────────────────────────────────────────────────────────────
// Beam analysis — the worked hand derivation of ONE load combination, the
// way it is done on paper, for the step-by-step solution:
//   1. factored loads and their resultants;
//   2. reactions — statics when determinate; the three-moment equation for a
//      continuous beam on pins/rollers with one EI per span (overhangs give
//      known end moments); otherwise the force method (Hibbeler ch. 10):
//      release the redundants, compatibility Δᵢ₀ + Σfᵢⱼ·Xⱼ = Δᵢ with
//      Δ = ∫M·m/EI dx by virtual work, a spring adding 1/k to fᵢᵢ, and Δᵢ the
//      support's settlement relative to the primary's rigid movement (zero
//      without settlement);
//   3. shear and moment equations per segment, V = 0 for the peak moment;
//   4. deflection by double integration, EI·y″ = M, carried segment to
//      segment so only θ and y at x = 0 remain — fixed from two support
//      conditions, the other supports then read as a check.
// The FEM in beamAnalysis.ts stays the source of the plotted results; this
// module reproduces it independently, and the tests hold the two together.
// Sign convention (same as the FEM's statics): loads P, w downward +;
// reactions R upward +; applied couples COUNTER-clockwise + (as the FEM's
// rotation DOF and the elevation draws them); reaction moments CLOCKWISE +;
// M sagging +; y upward + (deflection reported in mm, negative = down).
// Units: m, kN, kN·m; E in MPa, I in mm⁴, EI in kN·m².
// ─────────────────────────────────────────────────────────────────────────

import { type Support, type BeamLoad, type BeamSegment, eiAt, loadResultant, clipDist, spanLoads, overhangMoment, settleOf } from './beamAnalysis'
import { solveLinear } from './fem'
import type { SolutionLine, SolutionStep } from '../lib/solution'

export type DerivationMethod = 'statics' | 'three-moment' | 'force' | 'stiffness' | 'unstable'

/** One stretch between key points, constant EI: V(ξ), M(ξ) with ξ = x − a. */
export interface SegmentEq {
  a: number; b: number; EI: number
  Va: number; Ma: number        // right-limit values at a (kN, kN·m)
  wa: number; s: number         // intensity at a⁺ (kN/m, down +) and its slope (kN/m²)
  theta: number; y: number      // slope (rad) and deflection (m) at a
}

export interface BeamDerivation {
  method: DerivationMethod
  steps: SolutionStep[]
  /** Hand-method reactions in the order of `supports`. */
  reactions: { x: number; Rv: number; Rm: number }[]
  segs: SegmentEq[]
  Mpeak: { x: number; M: number }
  Vpeak: { x: number; V: number }
  /** Largest |y|, mm (signed), and where. */
  Dpeak: { x: number; y: number }
}

interface R { x: number; Rv: number; Rm: number }
const EPS = 1e-6
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// ── number formatting for the tex lines ──────────────────────────────────
const n2 = (v: number) => (Math.abs(v) < 5e-3 ? '0.00' : v.toFixed(2))
/** A coefficient readable at any magnitude (polynomial terms run to x⁵/120). */
function cf(v: number): string {
  const a = Math.abs(v)
  if (a < 1e-12) return '0'
  if (a >= 10) return v.toFixed(2)
  if (a >= 0.1) return v.toFixed(3)
  return v.toPrecision(3)
}
/** `+ 3.20(1.50)`-style signed term; the first term carries no leading +. */
const signed = (v: string, first: boolean) => (v.startsWith('-') ? `${first ? '-' : ' - '}${v.slice(1)}` : `${first ? '' : ' + '}${v}`)
/** The terms of c₀ + c₁t + c₂t² + …, zero terms dropped, each carrying its sign. */
function polyTerms(cs: number[], t: string): string[] {
  const out: string[] = []
  cs.forEach((c, k) => {
    if (Math.abs(c) < 1e-12) return
    out.push(signed(k === 0 ? cf(c) : `${cf(c)}${t}${k > 1 ? `^{${k}}` : ''}`, out.length === 0))
  })
  return out.length ? out : ['0']
}
/**
 * `lhs = t₁ t₂ …` wrapped every `per` terms into aligned rows — the worked
 * solution sits in a narrow column, and an equation that runs off its edge
 * has to be scrolled sideways to be read at all.
 */
function wrapEq(lhs: string, terms: readonly string[], per = 2): string {
  if (terms.length <= per) return `${lhs} = ${terms.join('')}`
  const chunks: string[] = []
  for (let i = 0; i < terms.length; i += per) chunks.push(terms.slice(i, i + per).join(''))
  return `\\begin{aligned}${lhs} &= ${chunks.join(' \\\\ &\\quad ')}\\end{aligned}`
}
/** Two statements on two aligned rows. */
const two = (a: string, b: string) => `\\begin{aligned}&${a} \\\\ &${b}\\end{aligned}`
const fmtLoad = (ld: BeamLoad): string =>
  ld.type === 'point' ? `Point ${n2(ld.P)} kN at x = ${n2(ld.x)} m`
    : ld.type === 'udl' ? `UDL ${n2(ld.w)} kN/m from ${n2(ld.x1)} to ${n2(ld.x2)} m`
      : ld.type === 'vdl' ? `VDL ${n2(ld.w1)} → ${n2(ld.w2)} kN/m from ${n2(ld.x1)} to ${n2(ld.x2)} m`
        : `Couple ${n2(ld.M)} kN·m (counter-clockwise +) at x = ${n2(ld.x)} m`

// ── statics on a beam with known reactions ───────────────────────────────
/** Right-limit V and M at x from everything at or left of x. */
function stateAt(x: number, reactions: readonly R[], loads: readonly BeamLoad[]): { V: number; M: number } {
  let V = 0, M = 0
  for (const r of reactions) if (r.x <= x + EPS) { V += r.Rv; M += r.Rv * (x - r.x) + r.Rm }
  for (const ld of loads) {
    if (ld.type === 'point') { if (ld.x <= x + EPS) { V -= ld.P; M -= ld.P * (x - ld.x) } }
    else if (ld.type === 'moment') { if (ld.x <= x + EPS) M -= ld.M }
    else {
      const c = clipDist(ld, -Infinity, x)
      if (!c) continue
      const { W, xc } = loadResultant(c)
      V -= W; M -= W * (x - xc)
    }
  }
  return { V, M }
}
/** Distributed intensity just right of x and its slope. */
function intensityAt(x: number, loads: readonly BeamLoad[]): { w: number; s: number } {
  let w = 0, s = 0
  for (const ld of loads) {
    if (ld.type !== 'udl' && ld.type !== 'vdl') continue
    if (!(ld.x1 <= x + EPS && x < ld.x2 - EPS)) continue
    if (ld.type === 'udl') { w += ld.w; continue }
    const sl = (ld.w2 - ld.w1) / Math.max(ld.x2 - ld.x1, 1e-9)
    w += ld.w1 + sl * (x - ld.x1); s += sl
  }
  return { w, s }
}
function totals(loads: readonly BeamLoad[], about: number): { W: number; Mo: number } {
  // W = Σ downward load; Mo = Σ W·(x̄ − about) − Σ C  (the clockwise moment of the loads about `about`)
  let W = 0, Mo = 0
  for (const ld of loads) {
    if (ld.type === 'moment') Mo -= ld.M
    else { const { W: w, xc } = loadResultant(ld); W += w; Mo += w * (xc - about) }
  }
  return { W, Mo }
}

/**
 * ∫f over the breakpoints by 5-point Gauss–Legendre in each interval. Between
 * breakpoints every integrand here is a polynomial of degree ≤ 5 (M cubic at
 * most, m linear, 1/EI constant), which the rule integrates EXACTLY — and it
 * never samples an endpoint, where a point load or couple makes M jump.
 */
const GX = [-0.9061798459386640, -0.5384693101056831, 0, 0.5384693101056831, 0.9061798459386640]
const GW = [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891]
function integrate(f: (x: number) => number, pts: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const mid = (pts[i] + pts[i + 1]) / 2, half = (pts[i + 1] - pts[i]) / 2
    if (half <= 0) continue
    for (let g = 0; g < 5; g++) sum += GW[g] * half * f(mid + half * GX[g])
  }
  return sum
}
const uniq = (xs: number[]): number[] => {
  const out: number[] = []
  for (const x of [...xs].sort((p, q) => p - q)) if (!out.length || x - out[out.length - 1] > EPS) out.push(x)
  return out
}

// ── the derivation ───────────────────────────────────────────────────────
export function deriveBeam(
  supports: readonly Support[], loads: readonly BeamLoad[], L: number, E: number, I: number,
  segments: readonly BeamSegment[] | undefined, comboName: string,
  /** The FEM reactions, used only by the 'stiffness' fallback. */
  femReactions?: readonly { x: number; Rv: number; Rm: number }[],
  /** The combination's factor on support settlement (its T factor). */
  settleFactor = 1,
): BeamDerivation {
  const steps: SolutionStep[] = []
  const EIat = (x: number) => eiAt(x, E, I, segments ? [...segments] : undefined)
  /** Support i's imposed displacement, m, upward + (a spring's BASE). */
  const u = (i: number) => settleOf(supports[i], settleFactor)
  const settles = supports.some((_, i) => Math.abs(u(i)) > 1e-12)

  // supports by position, lettered A, B, C … left to right
  const order = supports.map((s, i) => ({ s, i })).sort((p, q) => p.s.x - q.s.x)
  const name = new Map<number, string>()
  order.forEach(({ i }, k) => name.set(i, LET[k] ?? `S${k + 1}`))
  const nm = (i: number) => name.get(i)!

  // 1 · loads
  const { W: Wtot } = totals(loads, 0)
  steps.push({
    title: `Factored loads — ${comboName}`,
    lines: [
      ...loads.map((ld): SolutionLine => {
        if (ld.type === 'moment') return { item: fmtLoad(ld) }
        const { W, xc } = loadResultant(ld)
        return { item: `${fmtLoad(ld)} → resultant W = ${n2(W)} kN at x̄ = ${n2(xc)} m` }
      }),
      { tex: `\\Sigma W = ${n2(Wtot)}\\ \\text{kN}` },
      { text: 'Convention: loads downward +, reactions upward +, applied couples counter-clockwise +, fixed-end reaction moments clockwise +, bending moment sagging +.' },
    ],
    clause: 'NSCP 2015 §203.3.1',
  })

  // 2 · reactions
  const unknowns = supports.reduce((a, s) => a + (s.type === 'fixed' ? 2 : 1), 0)
  const degree = unknowns - 2
  const vertX = uniq(supports.map((s) => s.x))
  const stable = supports.some((s) => s.type === 'fixed') || vertX.length >= 2
  let method: DerivationMethod = 'stiffness'
  let react: R[] = supports.map((s) => ({ x: s.x, Rv: 0, Rm: 0 }))

  if (!stable || unknowns < 2) {
    method = 'unstable'
    steps.push({ title: 'Reactions', lines: [{ text: 'The supports cannot hold the beam in equilibrium (at least two vertical supports at different points, or one fixed end, are needed).' }] })
    return { method, steps, reactions: react, segs: [], Mpeak: { x: 0, M: 0 }, Vpeak: { x: 0, V: 0 }, Dpeak: { x: 0, y: 0 } }
  }

  const rLines: SolutionLine[] = [
    { text: `${unknowns} reaction component${unknowns > 1 ? 's' : ''} (${supports.length} support${supports.length > 1 ? 's' : ''}) against 2 equations of equilibrium (ΣFy, ΣM) — ${degree === 0 ? 'statically determinate.' : `indeterminate to degree ${degree}.`}` },
  ]

  const contSupports = order.filter(({ s }) => s.type === 'pin' || s.type === 'roller')
  const allSimple = contSupports.length === supports.length
  const interiorXs = vertX.slice(1, -1)
  const coupleAtInterior = loads.some((ld) => ld.type === 'moment' && interiorXs.some((x) => Math.abs(ld.x - x) < EPS))
  const spanEI = (xa: number, xb: number): number | null => {
    const inside = segments?.some((g) => (g.x0 > xa + EPS && g.x0 < xb - EPS) || (g.x1 > xa + EPS && g.x1 < xb - EPS))
    return inside ? null : EIat((xa + xb) / 2)
  }

  if (degree === 0) {
    method = 'statics'
    const fixed = supports.findIndex((s) => s.type === 'fixed')
    if (fixed >= 0) {
      const xf = supports[fixed].x
      const { W, Mo } = totals(loads, xf)
      react[fixed] = { x: xf, Rv: W, Rm: -Mo }
      const lf = nm(fixed)
      rLines.push(
        { tex: `\\Sigma F_y = 0:\\ R_${lf} = \\Sigma W = ${n2(W)}\\ \\text{kN}` },
        { text: `ΣM about ${lf} = 0:` },
        { tex: two(`M_${lf} + \\Sigma W(\\bar x - ${n2(xf)}) - \\Sigma C = 0`, `M_${lf} = ${n2(-Mo)}\\ \\text{kN·m}`) },
        { text: `M_${lf} is the clockwise reaction moment; ${-Mo < 0 ? 'negative, so it acts counter-clockwise' : 'positive, clockwise'}.` },
      )
    } else {
      const [ia, ib] = [order[0].i, order[order.length - 1].i]
      const xa = supports[ia].x, xb = supports[ib].x
      const { W, Mo } = totals(loads, xa)
      const Rb = Mo / (xb - xa), Ra = W - Rb
      react[ia] = { x: xa, Rv: Ra, Rm: 0 }; react[ib] = { x: xb, Rv: Rb, Rm: 0 }
      const A = nm(ia), B = nm(ib)
      const terms = [`R_${B}(${n2(xb - xa)})`]
      for (const ld of loads) {
        if (ld.type === 'moment') terms.push(signed(n2(ld.M), false))
        else { const { W: w, xc } = loadResultant(ld); terms.push(signed(`${n2(-w)}(${n2(xc - xa)})`, false)) }
      }
      rLines.push(
        { text: `ΣM about ${A} = 0, counter-clockwise +:` },
        { tex: wrapEq('0', terms) },
        { tex: `R_${B} = ${n2(Rb)}\\ \\text{kN}` },
        { text: 'ΣFy = 0:' },
        { tex: two(`R_${A} + ${n2(Rb)} - ${n2(W)} = 0`, `R_${A} = ${n2(Ra)}\\ \\text{kN}`) },
      )
    }
  } else if (allSimple && vertX.length === supports.length && !coupleAtInterior && vertX.slice(0, -1).every((x, k) => spanEI(x, vertX[k + 1]) !== null)) {
    // ── three-moment equation ──
    method = 'three-moment'
    const xs = vertX, n = xs.length - 1
    const Ls = xs.slice(0, -1).map((x, k) => xs[k + 1] - x)
    const EIs = Ls.map((_, k) => spanEI(xs[k], xs[k + 1])!)
    const sameEI = EIs.every((v) => Math.abs(v - EIs[0]) < 1e-9 * EIs[0])
    const Lp = Ls.map((l, k) => (l * EIs[0]) / EIs[k])   // effective length L′ = L·EI₁/EIᵢ
    const ltr = (k: number) => nm(order[k].i)
    const per = Ls.map((_, k) => spanLoads(loads, xs[k], xs[k + 1], k === n - 1))
    // simply-supported moment diagram of each span and its 6Aā/L moments
    const ss = per.map((lds, k) => {
      const { W, Mo } = totals(lds, 0)
      const Rb = Mo / Ls[k], Ra = W - Rb
      const M = (x: number) => stateAt(x, [{ x: 0, Rv: Ra, Rm: 0 }], lds).M
      const pts = uniq([0, Ls[k], ...lds.flatMap((ld) => (ld.type === 'point' || ld.type === 'moment' ? [ld.x] : [ld.x1, ld.x2]))])
      return {
        Ra, Rb,
        left: (6 / Ls[k]) * integrate((x) => M(x) * x, pts),             // 6Aā/L, ā from the left end
        right: (6 / Ls[k]) * integrate((x) => M(x) * (Ls[k] - x), pts),  // 6Aā′/L, ā′ from the right end
      }
    })
    const { M: M0, W: W0 } = overhangMoment(loads, xs[0], 'left')
    const { M: Mn, W: Wn } = overhangMoment(loads, xs[n], 'right')
    // settlement h, m DOWNWARD, of the support at each position — the
    // equation's support-movement term, ×EI₁ like everything else in it
    const h = order.map(({ i }) => -u(i))
    const settleTerm = (k: number) => 6 * EIs[0] * ((h[k + 1] - h[k]) / Ls[k] + (h[k + 1] - h[k + 2]) / Ls[k + 1])
    const Mk = new Array(n + 1).fill(0)
    Mk[0] = M0; Mk[n] = Mn
    const size = n - 1
    const Am = Array.from({ length: size }, () => new Array(size).fill(0))
    const bv = new Array(size).fill(0)
    for (let k = 0; k < size; k++) {
      Am[k][k] = 2 * (Lp[k] + Lp[k + 1])
      if (k > 0) Am[k][k - 1] = Lp[k]
      if (k < size - 1) Am[k][k + 1] = Lp[k + 1]
      bv[k] = -(ss[k].left * EIs[0] / EIs[k] + ss[k + 1].right * EIs[0] / EIs[k + 1]) + settleTerm(k)
      if (k === 0) bv[k] -= M0 * Lp[0]
      if (k === size - 1) bv[k] -= Mn * Lp[n - 1]
    }
    const sol = solveLinear(Am, bv) ?? new Array(size).fill(0)
    sol.forEach((v, k) => (Mk[k + 1] = v))

    rLines.push(
      { text: `Three-moment equation (Clapeyron) at each interior support i, spans i and i+1, with simple-span moment diagrams of area A and centroid ā:` },
      { tex: sameEI
        ? `\\begin{aligned}&M_{i-1}L_i + 2M_i(L_i + L_{i+1}) \\\\ &\\quad + M_{i+1}L_{i+1} \\\\ &\\quad = -\\dfrac{6A_i\\bar a_i}{L_i} - \\dfrac{6A_{i+1}\\bar a'_{i+1}}{L_{i+1}}\\end{aligned}`
        : `\\begin{aligned}&M_{i-1}L'_i + 2M_i(L'_i + L'_{i+1}) \\\\ &\\quad + M_{i+1}L'_{i+1} \\\\ &\\quad = -\\dfrac{6A_i\\bar a_i}{L_i}\\dfrac{EI_1}{EI_i} \\\\ &\\quad - \\dfrac{6A_{i+1}\\bar a'_{i+1}}{L_{i+1}}\\dfrac{EI_1}{EI_{i+1}} \\\\ &L'_i = L_i\\,EI_1/EI_i\\end{aligned}` },
      ...Ls.map((l, k): SolutionLine => ({ item: `Span ${ltr(k)}${ltr(k + 1)}: L = ${n2(l)} m${sameEI ? '' : `, EI = ${EIs[k].toFixed(0)} kN·m², L′ = ${n2(Lp[k])} m`}; 6Aā/L = ${n2(ss[k].left)}, 6Aā′/L = ${n2(ss[k].right)} kN·m²` })),
    )
    if (settles) {
      rLines.push(
        { text: `Support settlement adds the support-movement term to the right-hand side, h downward + (m):` },
        { tex: `+\\,6EI_1\\left[\\dfrac{h_i - h_{i-1}}{L_i} + \\dfrac{h_i - h_{i+1}}{L_{i+1}}\\right]` },
        { text: order.map((_, k) => `h_${ltr(k)} = ${(h[k] * 1000).toFixed(1)} mm`).join(', ') + (settleFactor !== 1 ? ` (settlement × ${settleFactor} in this combination)` : '') + '.' },
      )
    }
    if (Math.abs(M0) > 1e-9 || Math.abs(Mn) > 1e-9 || W0 || Wn) {
      rLines.push({ text: `Overhangs fix the end moments by statics: M_${ltr(0)} = ${n2(M0)} kN·m, M_${ltr(n)} = ${n2(Mn)} kN·m.` })
    } else rLines.push({ text: `The outer supports are simple ends: M_${ltr(0)} = M_${ltr(n)} = 0.` })
    for (let k = 0; k < size; k++) {
      const mL = k === 0 ? `(${n2(M0)})` : `M_${ltr(k)}`
      const mR = k + 2 === n ? `(${n2(Mn)})` : `M_${ltr(k + 2)}`
      const rhs = -(ss[k].left * EIs[0] / EIs[k] + ss[k + 1].right * EIs[0] / EIs[k + 1]) + settleTerm(k)
      rLines.push({ tex: `\\begin{aligned}&\\text{at } ${ltr(k + 1)}:\\ ${mL}(${n2(Lp[k])}) + 2M_${ltr(k + 1)}(${n2(Lp[k] + Lp[k + 1])}) \\\\ &\\quad + ${mR}(${n2(Lp[k + 1])}) = ${n2(rhs)}\\end{aligned}` })
    }
    Mk.slice(1, -1).forEach((m, k) => rLines.push({ tex: `M_${ltr(k + 1)} = ${n2(m)}\\ \\text{kN·m}` }))
    // reactions span by span: R = R_ss + (M_far − M_near)/L
    const Rk = new Array(n + 1).fill(0)
    Rk[0] += W0; Rk[n] += Wn
    for (let k = 0; k < n; k++) {
      const dl = ss[k].Ra + (Mk[k + 1] - Mk[k]) / Ls[k]
      const dr = ss[k].Rb + (Mk[k] - Mk[k + 1]) / Ls[k]
      Rk[k] += dl; Rk[k + 1] += dr
      rLines.push(
        { text: `Span ${ltr(k)}${ltr(k + 1)} — simple-span reaction plus the end-moment couple (M_far − M_near)/L:` },
        { tex: `\\begin{aligned}R_{${ltr(k)}} &= ${n2(ss[k].Ra)} + \\dfrac{${n2(Mk[k + 1])} - (${n2(Mk[k])})}{${n2(Ls[k])}} \\\\ &= ${n2(dl)}\\ \\text{kN}\\end{aligned}` },
        { tex: `\\begin{aligned}R_{${ltr(k + 1)}} &= ${n2(ss[k].Rb)} + \\dfrac{${n2(Mk[k])} - (${n2(Mk[k + 1])})}{${n2(Ls[k])}} \\\\ &= ${n2(dr)}\\ \\text{kN}\\end{aligned}` },
      )
    }
    if (W0 || Wn) rLines.push({ text: `Overhang loads go straight to the outer supports: +${n2(W0)} kN at ${ltr(0)}, +${n2(Wn)} kN at ${ltr(n)}.` })
    order.forEach(({ i }, k) => (react[i] = { x: supports[i].x, Rv: Rk[k], Rm: 0 }))
    rLines.push({ text: `Summing the span contributions: ${order.map(({ i }) => `R_${nm(i)} = ${n2(react[i].Rv)} kN`).join(', ')}.` })
  } else {
    // ── force method ──
    const fixedK = order.find(({ s }) => s.type === 'fixed')
    const rigid = order.filter(({ s }) => s.type === 'pin' || s.type === 'roller')
    type Prim = { kind: 'cant'; i: number } | { kind: 'simple'; ia: number; ib: number }
    let prim: Prim | null = null
    if (fixedK) prim = { kind: 'cant', i: fixedK.i }
    else if (rigid.length >= 2 && rigid[rigid.length - 1].s.x - rigid[0].s.x > EPS) prim = { kind: 'simple', ia: rigid[0].i, ib: rigid[rigid.length - 1].i }

    // when no hand method applies, say so and take the stiffness solution's reactions
    const fallback = (why: string) => {
      method = 'stiffness'
      react = (femReactions ?? []).map((r) => ({ ...r }))
      rLines.push({ text: `${why} The reactions are therefore taken from the stiffness solution:` })
      rLines.push({ text: order.map(({ i }) => `R_${nm(i)} = ${n2(react[i]?.Rv ?? 0)} kN`).join(', ') + '.' })
    }
    if (!femReactions) fallback('No stiffness solution was supplied.')
    else if (vertX.length < supports.length) fallback('Two supports sit at the same point, so their shares of the load cannot be separated by compatibility (the flexibility matrix is singular).')
    else if (!prim) fallback('No rigid primary structure can be cut from these supports (the beam rests on springs).')
    else {
      // redundants: every reaction component the primary does not keep
      type Red = { i: number; kind: 'V' | 'M'; label: string; k?: number }
      const reds: Red[] = []
      for (const { s, i } of order) {
        const kept = prim.kind === 'cant' ? i === prim.i : i === prim.ia || i === prim.ib
        if (kept) continue
        reds.push({ i, kind: 'V', label: `R_${nm(i)}`, k: s.type === 'spring' ? Math.max(s.k ?? 1000, 1e-3) : undefined })
        if (s.type === 'fixed') reds.push({ i, kind: 'M', label: `M_${nm(i)}` })
      }
      const p = prim
      const primaryReact = (lds: readonly BeamLoad[]): R[] => {
        if (p.kind === 'cant') {
          const xf = supports[p.i].x
          const { W, Mo } = totals(lds, xf)
          return [{ x: xf, Rv: W, Rm: -Mo }]
        }
        const xa = supports[p.ia].x, xb = supports[p.ib].x
        const { W, Mo } = totals(lds, xa)
        const Rb = Mo / (xb - xa)
        return [{ x: xa, Rv: W - Rb, Rm: 0 }, { x: xb, Rv: Rb, Rm: 0 }]
      }
      const unitLoad = (r: Red): BeamLoad => (r.kind === 'V'
        ? { type: 'point', x: supports[r.i].x, P: -1, cat: 'D' }
        : { type: 'moment', x: supports[r.i].x, M: -1, cat: 'D' })   // a clockwise unit couple
      const R0 = primaryReact(loads)
      const M0 = (x: number) => stateAt(x, R0, loads).M
      const unitR = reds.map((r) => primaryReact([unitLoad(r)]))
      const m = reds.map((r, j) => (x: number) => stateAt(x, unitR[j], [unitLoad(r)]).M)
      const pts = uniq([0, L, ...supports.map((s) => s.x), ...(segments ?? []).flatMap((g) => [g.x0, g.x1]),
        ...loads.flatMap((ld) => (ld.type === 'point' || ld.type === 'moment' ? [ld.x] : [ld.x1, ld.x2]))].filter((x) => x >= -EPS && x <= L + EPS))
      const EI1 = EIat(0)
      const scale = (x: number) => EI1 / EIat(x)   // everything × EI₁ for readable numbers
      const nR = reds.length
      const F = Array.from({ length: nR }, (_, a) => Array.from({ length: nR }, (_, b) => integrate((x) => m[a](x) * m[b](x) * scale(x), pts)))
      reds.forEach((r, a) => { if (r.k) F[a][a] += EI1 / r.k })
      const D0 = reds.map((_, a) => integrate((x) => M0(x) * m[a](x) * scale(x), pts))
      // what each released support must DO, ×EI₁: its own settlement less the
      // primary's rigid movement there — the primary rides on its own
      // supports, which may have settled too
      const rigidAt = (x: number): number => {
        if (p.kind === 'cant') return u(p.i)
        const xa = supports[p.ia].x, xb = supports[p.ib].x
        return u(p.ia) + ((u(p.ib) - u(p.ia)) * (x - xa)) / (xb - xa)
      }
      const rigidCw = p.kind === 'cant' ? 0 : -(u(p.ib) - u(p.ia)) / (supports[p.ib].x - supports[p.ia].x)
      const Dreq = reds.map((rd) => EI1 * (rd.kind === 'V' ? u(rd.i) - rigidAt(supports[rd.i].x) : -rigidCw))
      const Xs = solveLinear(F, D0.map((v, a) => Dreq[a] - v))
      if (!Xs) fallback('The compatibility equations are singular for this support layout.')
      else {
        method = 'force'
        const X = Xs
        const primText = p.kind === 'cant'
          ? `a cantilever from the fixed support ${nm(p.i)}`
          : `a simple beam on ${nm(p.ia)} and ${nm(p.ib)}`
        rLines.push(
          { text: `Force method. Primary structure: ${primText}. Redundants: ${reds.map((r) => r.label).join(', ')} (upward / clockwise +).` },
          ...(settles
            ? [
                { text: 'Compatibility — each released support moves by its settlement, less the primary structure\'s rigid movement on its own settled supports (a spring also moves by −R/k, which brings 1/k onto the diagonal):' },
                { tex: `\\Delta_{i0} + \\sum_j f_{ij}X_j = \\Delta_i` },
                { text: reds.map((rd, a) => `Δ for ${rd.label} = ${rd.kind === 'V' ? `${((Dreq[a] / EI1) * 1000).toFixed(2)} mm` : `${((Dreq[a] / EI1) * 1000).toFixed(3)} mrad`}`).join('; ') + ' (×EI₁ below).' },
              ] as SolutionLine[]
            : [
                { text: 'Compatibility — the released supports do not move (a spring moves by −R/k, which brings 1/k onto the diagonal):' },
                { tex: `\\Delta_{i0} + \\sum_j f_{ij}X_j = 0` },
              ] as SolutionLine[]),
          { tex: `\\Delta_{i0} = \\int \\frac{M_0\\,m_i}{EI}\\,dx` },
        { tex: `f_{ij} = \\int \\frac{m_i\\,m_j}{EI}\\,dx${reds.some((r) => r.k) ? ' + \\frac{\\delta_{ij}}{k_i}' : ''}` },
          { text: `M₀ is the moment of the primary structure under the loads; mᵢ under a unit value of redundant i. The integrals (by virtual work, evaluated piecewise) are multiplied through by EI₁ = ${EI1.toFixed(0)} kN·m²${segments && segments.length > 1 ? ', each stretch weighted by EI₁/EI' : ''}:` },
          { text: reds.map((r, a) => `X${a + 1} = ${r.label}`).join(', ') + ':' },
          ...reds.map((_, a): SolutionLine => ({ tex: wrapEq(cf(Dreq[a] - D0[a]), reds.map((__, b) => signed(`${cf(F[a][b])}X_{${b + 1}}`, b === 0)), 2) })),
          ...reds.map((r, a): SolutionLine => ({ tex: `${r.label} = ${n2(X[a])}\\ \\text{${r.kind === 'M' ? 'kN·m' : 'kN'}}` })),
        )
        // final reactions: primary under loads + Σ X·(primary under unit redundant), plus the redundants
        const rp = R0.map((r0, q) => ({ ...r0, Rv: r0.Rv + X.reduce((acc, xj, j) => acc + xj * unitR[j][q].Rv, 0), Rm: r0.Rm + X.reduce((acc, xj, j) => acc + xj * unitR[j][q].Rm, 0) }))
        if (p.kind === 'cant') react[p.i] = { x: supports[p.i].x, Rv: rp[0].Rv, Rm: rp[0].Rm }
        else { react[p.ia] = { x: supports[p.ia].x, Rv: rp[0].Rv, Rm: 0 }; react[p.ib] = { x: supports[p.ib].x, Rv: rp[1].Rv, Rm: 0 } }
        reds.forEach((r, a) => {
          if (r.kind === 'V') react[r.i] = { ...react[r.i], x: supports[r.i].x, Rv: X[a] }
          else react[r.i] = { ...react[r.i], x: supports[r.i].x, Rm: X[a] }
        })
        rLines.push({ text: 'The supports kept by the primary structure follow from statics with the redundants known:' })
        for (const { i } of order) {
          if (!reds.some((r) => r.i === i && r.kind === 'V')) rLines.push({ tex: `R_${nm(i)} = ${n2(react[i].Rv)}\\ \\text{kN}` })
          if (supports[i].type === 'fixed' && !reds.some((r) => r.i === i && r.kind === 'M')) rLines.push({ tex: `M_${nm(i)} = ${n2(react[i].Rm)}\\ \\text{kN·m}` })
        }
      }
    }
  }
  const sumR = react.reduce((a, r) => a + r.Rv, 0)
  rLines.push({ text: `Check: ΣR = ${n2(sumR)} kN against ΣW = ${n2(Wtot)} kN — difference ${n2(sumR - Wtot)}.` })
  steps.push({ title: 'Reactions', lines: rLines, clause: method === 'force' ? 'Force method — Hibbeler, Structural Analysis ch. 10' : method === 'three-moment' ? 'Three-moment equation — Hibbeler §12.4' : 'Statics' })

  // 3 · shear and moment, segment by segment
  const keys = uniq([0, L, ...supports.map((s) => s.x), ...(segments ?? []).flatMap((g) => [g.x0, g.x1]),
    ...loads.flatMap((ld) => (ld.type === 'point' || ld.type === 'moment' ? [ld.x] : [ld.x1, ld.x2]))].filter((x) => x >= -EPS && x <= L + EPS))
  const segs: SegmentEq[] = []
  for (let k = 0; k < keys.length - 1; k++) {
    const a = keys[k], b = keys[k + 1]
    const { V, M } = stateAt(a, react, loads)
    const { w, s } = intensityAt(a, loads)
    segs.push({ a, b, EI: EIat((a + b) / 2), Va: V, Ma: M, wa: w, s, theta: 0, y: 0 })
  }
  const Vof = (g: SegmentEq, t: number) => g.Va - g.wa * t - (g.s * t * t) / 2
  const Mof = (g: SegmentEq, t: number) => g.Ma + g.Va * t - (g.wa * t * t) / 2 - (g.s * t * t * t) / 6

  const vmLines: SolutionLine[] = [
    { text: 'Cut the beam at x′ = x − a inside each segment a ≤ x ≤ b. With V and M just right of a carried from the left and the load intensity w = wₐ + s·x′:' },
    { tex: `V = V_a - w_a x' - \\tfrac{s}{2}x'^2` },
    { tex: `M = M_a + V_a x' - \\tfrac{w_a}{2}x'^2 - \\tfrac{s}{6}x'^3` },
  ]
  let Mpk = { x: 0, M: 0 }, Vpk = { x: 0, V: 0 }
  const peaks: SolutionLine[] = []
  for (const g of segs) {
    const t = g.a < EPS ? 'x' : "x'"
    vmLines.push(
      { text: `${n2(g.a)} ≤ x ≤ ${n2(g.b)} m${t === 'x' ? '' : ` (x′ = x − ${n2(g.a)})`}:` },
      { tex: wrapEq('V', polyTerms([g.Va, -g.wa, -g.s / 2], t)) },
      { tex: wrapEq('M', polyTerms([g.Ma, g.Va, -g.wa / 2, -g.s / 6], t)) },
    )
    const len = g.b - g.a
    for (const [t0, x0] of [[0, g.a], [len, g.b]] as const) {
      const Mv = Mof(g, t0), Vv = Vof(g, t0)
      if (Math.abs(Mv) > Math.abs(Mpk.M)) Mpk = { x: x0, M: Mv }
      if (Math.abs(Vv) > Math.abs(Vpk.V)) Vpk = { x: x0, V: Vv }
    }
    // V = 0 inside the segment → a local peak of M
    const roots: number[] = []
    if (Math.abs(g.s) < 1e-12) { if (Math.abs(g.wa) > 1e-12) roots.push(g.Va / g.wa) }
    else {
      const disc = g.wa * g.wa + 2 * g.s * g.Va
      if (disc >= 0) for (const sg of [1, -1]) roots.push((-g.wa + sg * Math.sqrt(disc)) / g.s)
    }
    for (const r0 of roots) {
      if (!(r0 > EPS && r0 < len - EPS)) continue
      const Mv = Mof(g, r0)
      peaks.push({ tex: two(`V = 0 \\text{ at } x = ${n2(g.a + r0)}\\ \\text{m}`, `M = ${n2(Mv)}\\ \\text{kN·m}`) })
      if (Math.abs(Mv) > Math.abs(Mpk.M)) Mpk = { x: g.a + r0, M: Mv }
    }
  }
  steps.push({ title: 'Shear and bending moment', lines: vmLines, note: 'V in kN, M in kN·m; x and x′ in m.' })
  steps.push({
    title: 'Maximum shear and moment',
    lines: [
      ...(peaks.length ? [{ text: 'Where the shear crosses zero inside a segment the moment peaks:' } as SolutionLine, ...peaks] : []),
      { tex: two(`|V|_{max} = ${n2(Math.abs(Vpk.V))}\\ \\text{kN}`, `\\text{at } x = ${n2(Vpk.x)}\\ \\text{m}`) },
      { tex: two(`|M|_{max} = ${n2(Math.abs(Mpk.M))}\\ \\text{kN·m}`, `\\text{at } x = ${n2(Mpk.x)}\\ \\text{m}`) },
    ],
  })

  // 4 · deflection: EI·y″ = M, integrated twice inside each segment
  const phi1 = (g: SegmentEq, t: number) => g.Ma * t + (g.Va * t * t) / 2 - (g.wa * t ** 3) / 6 - (g.s * t ** 4) / 24
  const phi2 = (g: SegmentEq, t: number) => (g.Ma * t * t) / 2 + (g.Va * t ** 3) / 6 - (g.wa * t ** 4) / 24 - (g.s * t ** 5) / 120
  // θₖ = θ₀ + dₖ, yₖ = y₀ + θ₀·aₖ + cₖ — carried across every key point
  const dk: number[] = [0], ck: number[] = [0]
  segs.forEach((g, k) => {
    const len = g.b - g.a
    dk.push(dk[k] + phi1(g, len) / g.EI)
    ck.push(ck[k] + dk[k] * len + phi2(g, len) / g.EI)
  })
  const kOf = (x: number) => keys.findIndex((q) => Math.abs(q - x) < EPS)
  // where each support holds the beam: its settlement, and a spring's own
  // compression on top
  const target = (i: number) => u(i) + (supports[i].type === 'spring' ? -react[i].Rv / Math.max(supports[i].k ?? 1000, 1e-3) : 0)
  // two conditions: a fixed end gives y and θ; otherwise the first two vertical supports give y
  type Cond = { kind: 'y' | 'θ'; i: number }
  const fixedI = order.find(({ s }) => s.type === 'fixed')?.i
  const firstTwo = order.filter(({ s }, q) => q === 0 || Math.abs(s.x - order[0].s.x) > EPS).slice(0, 2).map(({ i }) => i)
  const conds: Cond[] = fixedI !== undefined ? [{ kind: 'y', i: fixedI }, { kind: 'θ', i: fixedI }] : firstTwo.map((i) => ({ kind: 'y' as const, i }))
  // why a support's y is not zero: its settlement −δ, a spring's −R/k, or both
  const why = (i: number, lab: string) => {
    const sett = Math.abs(u(i)) > 1e-12, spring = supports[i].type === 'spring'
    if (spring) return sett ? `\\ (= -\\delta_${lab} - R_${lab}/k)` : `\\ (= -R_${lab}/k)`
    return sett ? `\\ (= -\\delta_${lab},\\ \\text{settlement})` : ''
  }
  const rows = conds.map((c) => {
    const kk = kOf(supports[c.i].x)
    return c.kind === 'y'
      ? { a: [1, keys[kk]], rhs: target(c.i) - ck[kk], c, kk }
      : { a: [0, 1], rhs: -dk[kk], c, kk }
  })
  const sol = solveLinear(rows.map((r) => r.a), rows.map((r) => r.rhs)) ?? [0, 0]
  const [y0, th0] = sol
  segs.forEach((g, k) => { g.theta = th0 + dk[k]; g.y = y0 + th0 * g.a + ck[k] })
  const yAt = (x: number) => {
    const g = segs.find((q) => x >= q.a - EPS && x <= q.b + EPS) ?? segs[segs.length - 1]
    const t = x - g.a
    return g.y + g.theta * t + phi2(g, t) / g.EI
  }
  const mm = (v: number) => v * 1000
  const dLines: SolutionLine[] = [
    { text: 'Integrate EI·y″ = M twice inside each segment; slope and deflection are carried across every segment end, so only θ₀ and y₀ at x = 0 stay unknown:' },
    { tex: wrapEq('EI\\,\\theta', ['EI\\,\\theta_a', ' + M_a x\'', ' + \\tfrac{V_a}{2}x\'^2', ' - \\tfrac{w_a}{6}x\'^3', ' - \\tfrac{s}{24}x\'^4']) },
    { tex: wrapEq('EI\\,y', ['EI\\,y_a', ' + EI\\,\\theta_a x\'', ' + \\tfrac{M_a}{2}x\'^2', ' + \\tfrac{V_a}{6}x\'^3', ' - \\tfrac{w_a}{24}x\'^4', ' - \\tfrac{s}{120}x\'^5']) },
    { text: 'Support conditions (y in mm, θ in mrad — mm per m):' },
    ...rows.map((r): SolutionLine => {
      const lab = nm(r.c.i), x = keys[r.kk]
      return r.c.kind === 'y'
        ? { tex: `y_${lab} = y_0 + ${n2(x)}\\,\\theta_0 ${signed(cf(mm(ck[r.kk])), false)} = ${cf(mm(target(r.c.i)))}${why(r.c.i, lab)}` }
        : { tex: `\\theta_${lab} = \\theta_0 ${signed(cf(mm(dk[r.kk])), false)} = 0` }
    }),
    { tex: two(`\\theta_0 = ${cf(mm(th0))}\\ \\text{mrad}`, `y_0 = ${cf(mm(y0))}\\ \\text{mm}`) },
    { text: 'Elastic curve of each segment (EI y in kN·m³):' },
    ...segs.map((g): SolutionLine[] => {
      const t = g.a < EPS ? 'x' : "x'"
      return [
        { text: `${n2(g.a)} ≤ x ≤ ${n2(g.b)} m, EI = ${g.EI.toFixed(0)} kN·m²:` },
        { tex: wrapEq('EI\\,y', polyTerms([g.EI * g.y, g.EI * g.theta, g.Ma / 2, g.Va / 6, -g.wa / 24, -g.s / 120], t)) },
      ]
    }).flat(),
  ]
  // the remaining supports: compatibility already satisfied → a check
  const used = new Set(conds.map((c) => c.i))
  const checks = order.filter(({ i }) => !used.has(i))
  if (checks.length) dLines.push({ text: `Check at the other supports: ${checks.map(({ i }) => `y_${nm(i)} = ${mm(yAt(supports[i].x)).toFixed(3)} mm (expected ${mm(target(i)).toFixed(3)})`).join('; ')}.` })
  // largest deflection: the θ = 0 points, found on a fine scan of every segment
  let Dpk = { x: 0, y: 0 }
  for (const g of segs) for (let j = 0; j <= 200; j++) {
    const x = g.a + ((g.b - g.a) * j) / 200, y = yAt(x)
    if (Math.abs(y) > Math.abs(Dpk.y)) Dpk = { x, y }
  }
  dLines.push({ tex: two(`|y|_{max} = ${n2(Math.abs(mm(Dpk.y)))}\\ \\text{mm}\\ (${Dpk.y < 0 ? '\\text{down}' : '\\text{up}'})`, `\\text{at } x = ${n2(Dpk.x)}\\ \\text{m}`) })
  steps.push({ title: 'Deflection — double integration', lines: dLines, clause: 'Euler–Bernoulli, EI y″ = M' })

  return { method, steps, reactions: react, segs, Mpeak: Mpk, Vpeak: Vpk, Dpeak: { x: Dpk.x, y: mm(Dpk.y) } }
}
