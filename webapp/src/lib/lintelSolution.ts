// ─────────────────────────────────────────────────────────────────────────
// Worked solution for the lintel calculator (pages/LintelDesign). Every
// number is read off the engine result; the lines restate how engine/lintel
// combined them, so the printed Mu and Vu are the ones the design used.
// Units: spans m, line loads kN/m, masonry kN, moments kN·m, shears kN.
// ─────────────────────────────────────────────────────────────────────────
import type { LintelInput, LintelResult } from '../engine/lintel'
import type { SolutionStep } from './solution'

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—')
const f0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '—')

export function buildLintelSolution(i: LintelInput, r: LintelResult): SolutionStep[] {
  const L = r.loads
  const wD = L.selfWeight + L.udlDead, wu = 1.2 * wD + 1.6 * L.live, Wu = 1.2 * L.masonry
  const d = r.design
  return [
    {
      title: 'Effective span',
      clause: 'ACI 318-14 §6.3.2.1',
      lines: [
        { text: `Not built integrally with its supports, so the span is the clear opening plus the depth, but not more than the distance between bearing centres.` },
        { tex: `\\ell = \\min(\\ell_n + h,\\ \\text{support centres}) = \\min(${f2(i.opening)} + ${f2(i.h / 1000)},\\ \\ldots) = ${f2(r.span)}\\ \\text{m}` },
      ],
    },
    {
      title: L.arching ? 'Masonry load — the arching triangle' : 'Masonry load — no arch forms',
      lines: L.arching ? [
        { text: `Masonry over the opening arches: only a triangle with base angle ${f0(i.archAngleDeg ?? 60)}° bears on the lintel; the rest is carried round to the jambs.` },
        { tex: `h_t = \\tfrac{\\ell}{2}\\tan ${f0(i.archAngleDeg ?? 60)}^\\circ = ${f2(L.triangleHeight)}\\ \\text{m} \\le ${f2(i.wallHeightAbove)}\\ \\text{m of wall}` },
        { tex: `W = \\tfrac12\\,\\ell\\,h_t\\,t\\,\\gamma = \\tfrac12 \\times ${f2(r.span)} \\times ${f2(L.triangleHeight)} \\times ${f2(i.wallThickness / 1000)} \\times ${f2(i.wallUnitWeight)} = ${f2(L.masonry)}\\ \\text{kN}` },
      ] : [
        { text: `The wall above is too short for the triangle to close, so the whole rectangle of wall comes down on the lintel.` },
        { tex: `W = \\ell\\,H\\,t\\,\\gamma = ${f2(r.span)} \\times ${f2(i.wallHeightAbove)} \\times ${f2(i.wallThickness / 1000)} \\times ${f2(i.wallUnitWeight)} = ${f2(L.masonry)}\\ \\text{kN}` },
      ],
    },
    {
      title: 'Factored load and actions',
      clause: 'NSCP 2015 §203.3',
      lines: [
        { tex: `w_u = 1.2(w_{sw} + w_D) + 1.6\\,w_L = 1.2(${f2(L.selfWeight)} + ${f2(L.udlDead)}) + 1.6 \\times ${f2(L.live)} = ${f2(wu)}\\ \\text{kN/m}, \\quad W_u = 1.2W = ${f2(Wu)}\\ \\text{kN}` },
        ...(L.udlArched > 0 ? [{ text: `${f2(L.udlArched)} kN/m of the other dead load sits above the arch and is carried round to the jambs, not by the lintel.` }] : []),
        L.arching
          ? { tex: `M_u = \\frac{W_u\\,\\ell}{6} + \\frac{w_u \\ell^2}{8} = \\frac{${f2(Wu)} \\times ${f2(r.span)}}{6} + \\frac{${f2(wu)} \\times ${f2(r.span)}^2}{8} = ${f2(r.Mu)}\\ \\text{kN·m}` }
          : { tex: `M_u = \\frac{(W_u/\\ell + w_u)\\,\\ell^2}{8} = \\frac{(${f2(Wu)}/${f2(r.span)} + ${f2(wu)}) \\times ${f2(r.span)}^2}{8} = ${f2(r.Mu)}\\ \\text{kN·m}` },
        L.arching
          ? { tex: `V_u = \\frac{W_u}{2} + \\frac{w_u\\ell}{2} = ${f2(r.Vu)}\\ \\text{kN}` }
          : { tex: `V_u = \\frac{W_u + w_u\\ell}{2} = ${f2(r.Vu)}\\ \\text{kN}` },
        ...(L.arching ? [{ text: 'A triangular load peaking at midspan gives Wℓ/6, not the Wℓ/8 a smeared UDL would.' }] : []),
      ],
    },
    {
      title: 'Flexure and shear',
      clause: 'ACI 318-14 §22.2, §22.5',
      pass: d.flexOK,
      lines: [
        { tex: `A_{s,req} = ${f0(d.As)}\\ \\text{mm}^2 \\Rightarrow ${d.bars}\\text{-}\\varnothing${i.barDia}, \\quad \\phi M_{n,max} = ${f2(d.phiMnMax)}\\ \\text{kN·m} ${d.flexOK ? '\\ge' : '<'} M_u` },
        { text: d.sAdopt > 0
          ? `Stirrups ⌀${i.stirrupDia} @ ${f0(d.sAdopt)} mm.`
          : `Vu ≤ φVc/2, so §409.6.3.1 requires no stirrups; a lintel is normally given nominal ties for the cage — a practice decision, not this check.` },
      ],
    },
    {
      title: 'Bearing on the jamb',
      clause: 'ACI 318-14 §22.8',
      pass: r.bearingOK,
      lines: [
        { tex: `f_b = \\frac{V_u}{b\\,b_{rg}} = \\frac{${f2(r.Vu)}}{${f2(i.b / 1000)} \\times ${f2(i.bearing / 1000)} \\times 1000} = ${f2(r.bearingStress)}\\ \\text{MPa} ${r.bearingOK ? '\\le' : '>'} \\phi(0.85f'_c) = ${f2(r.bearingLimit)}\\ \\text{MPa}` },
      ],
    },
  ]
}
