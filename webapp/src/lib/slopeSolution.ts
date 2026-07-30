// Worked solution for circular slope stability by the method of slices —
// Fellenius/OMS, Bishop's simplified and Janbu's simplified. Mirrors
// engine/slopeStability.ts.
//
// Two things this sheet has to say that a bare FS number cannot:
//
//  • WHICH CIRCLE. The reported FS belongs to one particular slip surface out
//    of a grid of thousands. A factor of safety with no circle attached is not
//    a result, so the search extent and the winning centre/radius are printed.
//
//  • WHY THE METHODS DIFFER. Fellenius ignores interslice forces and is
//    therefore conservative — typically 5–15% below Bishop, more with high
//    pore pressure. That spread is not an error in either method; it is the
//    price of the assumption, and an engineer reading three numbers deserves
//    to be told which one to believe (Bishop, for a circular surface).
import type { CircleResult, SearchResult, SlopeSoil } from '../engine/slopeStability'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export type SlopeMethod = 'bishop' | 'fellenius' | 'janbu'

export interface SlopeSolutionInput {
  H: number; beta: number; crestW: number; toeW: number
  soil: SlopeSoil
  ru: number
  method: SlopeMethod
  /** Required factor of safety the result is judged against. */
  FSreq?: number
}

const METHOD_LABEL: Record<SlopeMethod, string> = {
  bishop: "Bishop's simplified", fellenius: 'Fellenius / OMS', janbu: "Janbu's simplified",
}

export function buildSlopeSolution(
  i: SlopeSolutionInput, r: SearchResult, crit: CircleResult,
): SolutionStep[] {
  const FSreq = i.FSreq ?? 1.5
  const FS = { bishop: crit.bishop.FS, fellenius: crit.fellenius.FS, janbu: crit.janbu.FS }[i.method]
  const ok = FS >= FSreq
  const n = crit.slices.length
  const tanphi = Math.tan((i.soil.phiDeg * Math.PI) / 180)
  // A handful of representative slices — printing thirty rows would bury the
  // method under its own arithmetic.
  const sample = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]
    .filter((k, idx, a) => k >= 0 && k < n && a.indexOf(k) === idx)

  return [
    {
      title: 'Slope geometry and soil',
      clause: 'Terzaghi — limit equilibrium',
      lines: [
        txt('The slope is idealised as a plane face between a level crest and a level toe, and failure is assumed to occur on a circular arc through the mass. Only one soil is modelled, so a layered profile has to be run with weighted-average parameters or by a layered method.'),
        eq(String.raw`H = ${sn2(i.H)}\ \text{m},\qquad \beta = ${sn1(i.beta)}^\circ,\qquad \text{crest } ${sn2(i.crestW)}\ \text{m},\ \text{toe } ${sn2(i.toeW)}\ \text{m}`),
        eq(String.raw`c' = ${sn1(i.soil.c)}\ \text{kPa},\qquad \phi' = ${sn1(i.soil.phiDeg)}^\circ,\qquad \gamma = ${sn1(i.soil.gamma)}\ \text{kN/m}^3`),
        eq(String.raw`r_u = \frac{u}{\gamma h} = ${sn2(i.ru)}\quad${i.ru > 0 ? String.raw`\Rightarrow \text{pore pressure reduces every effective normal force}` : String.raw`\Rightarrow u = 0\ \text{(drained, no pore pressure)}`}`),
      ],
    },
    {
      title: 'Critical circle search',
      clause: 'Terzaghi — limit equilibrium (grid search)',
      lines: [
        txt('The factor of safety belongs to a slip surface, not to a slope, so the governing circle has to be found rather than assumed. A grid of trial centres and radii is swept and the circle with the lowest Bishop FS is reported — the mass most likely to move.'),
        eq(String.raw`${sn0(r.evaluated)}\ \text{valid circles evaluated} \Rightarrow \text{critical circle: } x_c = ${sn2(crit.circle.xc)}\ \text{m},\ y_c = ${sn2(crit.circle.yc)}\ \text{m},\ R = ${sn2(crit.circle.R)}\ \text{m}`),
        eq(String.raw`\text{sliced into } ${sn0(n)}\ \text{vertical slices}`),
      ],
      note: 'The minimum found is a grid minimum. Refine the grid if the winning circle sits on its edge.',
    },
    {
      title: 'Slice forces',
      clause: 'Terzaghi — method of slices',
      lines: [
        txt('Each slice contributes its weight W = γ·b·h. The component along the base W·sinα drives the slide; the component normal to it, less the pore water force, mobilises friction. α is negative near the toe where the arc turns up, and those slices resist rather than drive.'),
        eq(String.raw`W = \gamma\,b\,h = ${sn1(i.soil.gamma)}\,b\,h,\qquad u = r_u\,\gamma\,h = ${sn2(i.ru)}(${sn1(i.soil.gamma)})h,\qquad \ell = \frac{b}{\cos\alpha}`),
        ...sample.map((k) => {
          const s = crit.slices[k]
          return eq(String.raw`\text{slice ${k + 1}: } b = ${sn2(s.b)},\ h = ${sn2(s.h)}\ \text{m},\ \alpha = ${sn1((s.alpha * 180) / Math.PI)}^\circ,\ W = ${sn1(s.W)}\ \text{kN/m},\ u = ${sn1(s.u)}\ \text{kPa}`)
        }),
        eq(String.raw`\sum W\sin\alpha = ${sn1(crit.bishop.driving)}\ \text{kN/m}\quad(\text{driving})`),
      ],
    },
    {
      title: 'Fellenius / Ordinary Method of Slices',
      clause: 'Fellenius (1936) — Terzaghi limit equilibrium',
      lines: [
        txt('The simplest method: interslice forces are ignored entirely, so the normal force on each base is just W·cosα. That assumption violates equilibrium of the slice and always errs on the safe side, which is why Fellenius is used as a lower bound and as the starting guess for the iterative methods below.'),
        eq(String.raw`FS = \frac{\sum\left[c'\ell + (W\cos\alpha - u\ell)\tan\phi'\right]}{\sum W\sin\alpha} = \frac{${sn1(crit.fellenius.resisting)}}{${sn1(crit.fellenius.driving)}} = \mathbf{${sn3(crit.fellenius.FS)}}`),
      ],
    },
    {
      title: "Bishop's simplified",
      clause: 'Bishop (1955) — Terzaghi limit equilibrium',
      lines: [
        txt('Bishop keeps the interslice normal forces and assumes only that the interslice shear vanishes. FS then appears on both sides through mα, so the equation is iterated to convergence. For a circular surface this is the method to report — it satisfies moment equilibrium and sits within about 1% of rigorous methods.'),
        eq(String.raw`m_\alpha = \cos\alpha + \frac{\sin\alpha\,\tan\phi'}{FS},\qquad \tan\phi' = ${sn3(tanphi)}`),
        eq(String.raw`FS = \frac{1}{\sum W\sin\alpha}\sum\frac{c'b + (W - ub)\tan\phi'}{m_\alpha} = \frac{${sn1(crit.bishop.resisting)}}{${sn1(crit.bishop.driving)}} = \mathbf{${sn3(crit.bishop.FS)}}`),
        eq(String.raw`\text{converged in } ${sn0(crit.bishop.iterations)}\ \text{iterations} \Rightarrow \textbf{${crit.bishop.converged ? 'converged' : 'DID NOT CONVERGE'}}`),
      ],
      note: crit.bishop.converged ? undefined : 'Bishop did not converge on this circle — treat the value as unreliable and check the geometry and pore pressure.',
    },
    {
      title: "Janbu's simplified",
      clause: 'Janbu (1973) — Terzaghi limit equilibrium',
      lines: [
        txt('Janbu satisfies force equilibrium instead of moment equilibrium, which makes it the method for non-circular surfaces. Force equilibrium alone under-predicts, so an empirical correction f₀ — a function of how deep the slip mass is relative to its length — is applied.'),
        eq(String.raw`f_0 = 1 + b_1\left[\tfrac{d}{L} - 1.4\left(\tfrac{d}{L}\right)^2\right] = ${sn3(crit.f0)}`),
        eq(String.raw`FS = f_0\,\frac{\sum\dfrac{c'b + (W - ub)\tan\phi'}{n_\alpha}}{\sum W\tan\alpha} = \mathbf{${sn3(crit.janbu.FS)}}`),
      ],
    },
    {
      title: 'Factor of safety',
      clause: 'Terzaghi limit equilibrium — FS acceptance',
      pass: ok,
      lines: [
        txt(`Three methods on the same circle. Fellenius is the conservative bound, Bishop the one to design to for a circular surface, Janbu the force-equilibrium comparison. A spread between them is expected — it measures the interslice assumption, not an error.`),
        eq(String.raw`FS_{Fellenius} = ${sn3(crit.fellenius.FS)},\qquad FS_{Bishop} = ${sn3(crit.bishop.FS)},\qquad FS_{Janbu} = ${sn3(crit.janbu.FS)}`),
        eq(String.raw`\text{reported (${METHOD_LABEL[i.method]}): } FS = ${sn3(FS)} \;${ok ? '\\ge' : '<'}\; FS_{req} = ${sn2(FSreq)} \Rightarrow \textbf{${ok ? 'STABLE' : 'UNSTABLE — flatten, drain or reinforce'}}`),
      ],
      note: ok
        ? 'FS ≥ 1.5 is the usual long-term requirement for a permanent slope; 1.3 is commonly accepted for temporary works and 1.1–1.2 under seismic pseudo-static loading.'
        : 'Options in rough order of cost: flatten the face, lower ru by drainage, bench the slope, or reinforce with soil nails or anchors.',
    },
  ]
}
