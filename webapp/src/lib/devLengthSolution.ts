// Worked solution for development and splice lengths — ACI 318-14 §25.4/§25.5.
// Mirrors engine/devLength.ts. Every modification factor is shown with the
// reason it took its value, because the factors are where a development-length
// hand check usually goes wrong.
import type { DevLengthInput, DevLengthResult } from '../engine/devLength'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

const EPOXY_WHY: Record<string, string> = {
  none: 'uncoated bar',
  coated: 'epoxy-coated, cover ≥ 3db and clear spacing ≥ 6db',
  coatedClose: 'epoxy-coated with close cover or spacing',
}

export function buildDevLengthSolution(i: DevLengthInput, r: DevLengthResult): SolutionStep[] {
  const { db, fc, fy, lambda } = i
  const sq = Math.sqrt(Math.max(fc, 1))
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
        eq(String.raw`\psi_s = ${sn1(r.psi_s)}\quad(\text{d_b = ${sn0(db)} mm, ${db <= 20 ? '\\le 20 mm' : '> 20 mm'}})`),
        eq(String.raw`\psi_t\psi_e = ${sn1(r.psi_t)} \times ${sn1(r.psi_e)} = ${sn2(r.psi_t * r.psi_e)} \Rightarrow \psi_{te} = \min(\ldots, 1.7) = ${sn2(r.psi_te)}`),
        eq(String.raw`\lambda = ${sn2(lambda)}\quad(\text{${lambda < 1 ? 'lightweight concrete' : 'normal-weight concrete'}})`),
      ],
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
