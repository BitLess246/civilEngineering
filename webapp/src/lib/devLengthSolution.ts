// Worked solution for development and splice lengths — ACI 318-14 §25.4/§25.5.
// Mirrors engine/devLength.ts. Every modification factor is shown with the
// reason it took its value, because the factors are where a development-length
// hand check usually goes wrong.
import type { DevLengthInput, DevLengthResult } from '../engine/devLength'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

// Keyed on the engine's own EpoxyCase values. The first version used
// 'coated'/'coatedClose', which match nothing the engine emits, so every
// coated bar printed the raw enum string instead of a reason.
const EPOXY_WHY: Record<string, string> = {
  'none': 'uncoated or zinc-coated bar',
  'coated-light': 'epoxy-coated, cover ≥ 3db and clear spacing ≥ 6db',
  'coated-heavy': 'epoxy-coated with cover < 3db or clear spacing < 6db',
}

export function buildDevLengthSolution(i: DevLengthInput, r: DevLengthResult): SolutionStep[] {
  const { db, fc, fy, lambda } = i
  // √f'c AS THE ENGINE USED IT — §25.4.1.4 caps it at 8.3. Recomputing it here
  // let the sheet print a different number from the one the answer came from.
  const sq = r.sqrtFc
  const ldc1 = (0.24 * fy * db) / (lambda * sq)
  const ldc2 = 0.043 * fy * db
  const lscRaw = fy <= 420 ? 0.0725 * fy * db : (0.13 * fy - 24) * db

  return [
    {
      title: 'Modification factors',
      clause: 'ACI 318-14 §25.4.2.4',
      lines: [
        txt('Each factor raises or lowers the basic length for a condition that changes bond quality. ψt penalises bars with more than 300 mm of fresh concrete cast below them, because bleed water collects under the bar. The product ψt·ψe is capped at 1.7.'),
        eq(String.raw`\psi_t = ${sn1(r.psi_t)}\quad(\text{${i.topBar ? 'top bar — more than 300 mm cast below' : 'not a top bar'}})`),
        eq(String.raw`\psi_e = ${sn1(r.psi_e)}\quad(\text{${EPOXY_WHY[i.epoxy] ?? i.epoxy}})`),
        // d_b and \le have to live in MATH mode. Wrapped in \text{} they are
        // a KaTeX parse error, and this line rendered as raw source on every
        // visit to the page.
        eq(String.raw`\psi_s = ${sn1(r.psi_s)}\quad\left(d_b = ${sn0(db)}\ \text{mm} ${db <= 20 ? '\\le' : '>'} 20\ \text{mm}\right)`),
        eq(String.raw`\psi_t\psi_e = ${sn1(r.psi_t)} \times ${sn1(r.psi_e)} = ${sn2(r.psi_t * r.psi_e)} \Rightarrow \psi_{te} = \min(\ldots, 1.7) = ${sn2(r.psi_te)}`),
        eq(String.raw`\lambda = ${sn2(lambda)}\quad(\text{${lambda < 1 ? 'lightweight concrete' : 'normal-weight concrete'}})`),
        eq(String.raw`\sqrt{f'_c} = \min(\sqrt{${sn0(fc)}},\ 8.3) = ${sn3(sq)}\ \text{MPa}`),
      ],
      note: r.sqrtFcCapped
        ? "§25.4.1.4 caps √f'c at 8.3 MPa, and that cap governs here — concrete stronger than about 69 MPa buys no further reduction in any §25.4 length."
        : undefined,
    },
    {
      title: 'Confinement term',
      clause: 'ACI 318-14 §25.4.2.3',
      lines: [
        txt('(cb + Ktr)/db combines the smaller of cover and half the bar spacing with the transverse reinforcement crossing the splitting plane. It is capped at 2.5, beyond which a pull-out rather than a splitting failure controls and extra confinement stops helping.'),
        eq(String.raw`\frac{c_b + K_{tr}}{d_b} = ${sn2(i.cbKtr_db)} \Rightarrow \text{use } \min(\ldots, 2.5) = ${sn2(r.confine)}`),
      ],
      note: i.cbKtr_db > 2.5 ? 'Input exceeds the cap, so 2.5 governs.' : undefined,
    },
    {
      title: 'Development length in tension',
      clause: 'ACI 318-14 §25.4.2.3 · §25.4.2.1',
      lines: [
        txt('The general equation, in SI form. The 300 mm floor is an absolute minimum regardless of how favourable the factors are.'),
        eq(String.raw`\ell_d = \frac{f_y\,\psi_{te}\,\psi_s}{1.1\,\lambda\sqrt{f'_c}\;\frac{c_b+K_{tr}}{d_b}}\,d_b`),
        eq(String.raw`\ell_d = \frac{${sn0(fy)} \times ${sn2(r.psi_te)} \times ${sn1(r.psi_s)}}{1.1 \times ${sn2(lambda)} \times ${sn3(sq)} \times ${sn2(r.confine)}} \times ${sn0(db)} = ${sn1(r.ld_raw)}\ \text{mm}`),
        eq(String.raw`\ell_d = \max(${sn1(r.ld_raw)},\ 300) = \mathbf{${sn0(r.ld)}}\ \text{mm}`),
      ],
      note: r.ld_raw < 300 ? 'The 300 mm floor governs.' : undefined,
    },
    {
      title: 'Standard hook in tension',
      clause: 'ACI 318-14 §25.4.3.1 · §25.4.3.2 · §25.3.1',
      lines: [
        txt('Where a straight bar cannot fit, a standard hook anchors it in a much shorter length. ℓdh is measured from the critical section to the OUTSIDE END of the hook, and the 12db tail is NOT part of it. ψt does not appear: the casting-position penalty is a straight-bar bond effect, while a hook anchors mostly by bearing inside the bend.'),
        eq(String.raw`\ell_{dh} = \frac{0.24\,\psi_e\psi_c\psi_r f_y}{\lambda\sqrt{f'_c}}\,d_b`),
        eq(String.raw`\psi_e = ${sn1(i.epoxy === 'none' ? 1.0 : 1.2)}\ (\text{hook: 1.2 if coated, never 1.5}),\quad \psi_c = ${sn1(r.psi_c)},\quad \psi_r = ${sn1(r.psi_r)}`),
        eq(String.raw`\ell_{dh} = \frac{0.24 \times ${sn1(i.epoxy === 'none' ? 1.0 : 1.2)} \times ${sn1(r.psi_c)} \times ${sn1(r.psi_r)} \times ${sn0(fy)}}{${sn2(lambda)} \times ${sn3(sq)}} \times ${sn0(db)} = ${sn1(r.ldh_raw)}\ \text{mm}`),
        eq(String.raw`\ell_{dh} = \max(${sn1(r.ldh_raw)},\ 8d_b = ${sn0(8 * db)},\ 150) = \mathbf{${sn0(r.ldh)}}\ \text{mm}`),
        eq(String.raw`\text{tail} = 12d_b = ${sn0(r.hookTail)}\ \text{mm},\qquad \text{inside bend } \varnothing = ${sn0(r.hookBendDia)}\ \text{mm}`),
      ],
      note: db > 36
        ? 'ψc and ψr apply to ⌀36 and smaller only, so both are 1.0 for this bar.'
        : `ℓdh is ${(r.ldh / r.ld * 100).toFixed(0)}% of the straight ℓd — which is why hooks exist.`,
    },
    {
      title: 'Development length in compression',
      clause: 'ACI 318-14 §25.4.9.2',
      lines: [
        txt('A bar in compression needs less length — there is no splitting from a tension crack, and the bar end bears on the concrete. Two expressions apply and the larger governs, with a 200 mm floor.'),
        eq(String.raw`\ell_{dc,1} = \frac{0.24 f_y d_b}{\lambda\sqrt{f'_c}} = \frac{0.24 \times ${sn0(fy)} \times ${sn0(db)}}{${sn2(lambda)} \times ${sn3(sq)}} = ${sn1(ldc1)}\ \text{mm}`),
        eq(String.raw`\ell_{dc,2} = 0.043 f_y d_b = 0.043 \times ${sn0(fy)} \times ${sn0(db)} = ${sn1(ldc2)}\ \text{mm}`),
        eq(String.raw`\ell_{dc} = \max(${sn1(ldc1)},\ ${sn1(ldc2)},\ 200) = \mathbf{${sn0(r.ldc)}}\ \text{mm}`),
      ],
    },
    {
      title: 'Tension lap splices',
      clause: 'ACI 318-14 §25.5.2.1',
      lines: [
        txt('Class B is the default. Class A is only permitted where the area provided is at least twice that required AND no more than half the bars are spliced within the lap length — conditions worth checking on the drawing before using the shorter one.'),
        eq(String.raw`\ell_{st,A} = 1.0\,\ell_d = 1.0 \times ${sn0(r.ld)} = ${sn0(r.ls_A)}\ \text{mm}\quad(\ge 300)`),
        eq(String.raw`\ell_{st,B} = 1.3\,\ell_d = 1.3 \times ${sn0(r.ld)} = \mathbf{${sn0(r.ls_B)}}\ \text{mm}\quad(\ge 300)`),
      ],
      note: 'Use Class B unless both Class A conditions are demonstrably satisfied.',
    },
    {
      title: 'Compression lap splice',
      clause: 'ACI 318-14 §25.5.5.1 · §25.5.5.2',
      lines: [
        txt('A compression splice is set directly from the bar diameter and grade, not from ld. Concrete weaker than 21 MPa needs the length increased by one third.'),
        eq(fy <= 420
          ? String.raw`\ell_{sc} = 0.0725 f_y d_b = 0.0725 \times ${sn0(fy)} \times ${sn0(db)} = ${sn1(lscRaw)}\ \text{mm}`
          : String.raw`\ell_{sc} = (0.13 f_y - 24) d_b = (0.13 \times ${sn0(fy)} - 24) \times ${sn0(db)} = ${sn1(lscRaw)}\ \text{mm}`),
        ...(fc < 21
          ? [eq(String.raw`f'_c = ${sn0(fc)} < 21\ \text{MPa} \Rightarrow \times\tfrac{4}{3} = ${sn1(lscRaw * 4 / 3)}\ \text{mm}`)]
          : []),
        eq(String.raw`\ell_{sc} = \max(\ldots,\ 300) = \mathbf{${sn0(r.lsc)}}\ \text{mm}`),
      ],
    },
  ]
}
