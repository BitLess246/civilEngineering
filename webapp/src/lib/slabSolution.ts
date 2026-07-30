// Worked solution for the two-way slab by the Direct Design Method —
// ACI 318-14 §8.10 / NSCP 2015 §408.10. Mirrors engine/slabDDM.ts.
//
// The DDM is a coefficient method: the whole design turns on Mo and on the
// fractions the code assigns to each critical location. So the sheet shows Mo
// derived once, then a table of every location with its coefficient, its
// moment, and the steel that follows — which is exactly the layout an engineer
// checks a slab against.
import type { SlabInput, SlabDesignResult, SlabDirResult } from '../engine/slabDDM'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

/** Steps for one direction — Mo, the coefficient split, and the strip steel. */
function directionSteps(i: SlabInput, r: SlabDesignResult, d: SlabDirResult): SolutionStep[] {
  const db = i.barDia ?? 12
  const label = d.dir === 'x' ? 'x' : 'y'
  return [
    {
      title: `Direction ${label} — total static moment M₀`,
      clause: 'ACI 318-14 §8.10.3.2',
      lines: [
        txt(`The clear span ℓₙ is measured face to face of supports but never taken less than 0.65ℓ₁. M₀ is the full simple-span moment for the panel strip of width ℓ₂ — every design moment in this direction is a fraction of it.`),
        eq(String.raw`\ell_n = \max(0.65\,\ell_1,\ \ell_1 - c) = \max(0.65 \times ${sn2(d.l1)},\ ${sn2(d.l1)} - ${sn3(i.colWidth / 1000)}) = ${sn3(d.ln)}\ \text{m}`),
        eq(String.raw`M_0 = \frac{w_u\,\ell_2\,\ell_n^2}{8} = \frac{${sn2(r.wu)} \times ${sn2(d.l2)} \times ${sn3(d.ln)}^2}{8} = \mathbf{${sn1(d.Mo)}}\ \text{kN·m}`),
        eq(String.raw`d = ${sn1(d.d)}\ \text{mm},\qquad \text{column strip } = ${sn2(d.csWidth)}\ \text{m},\qquad \text{middle strip } = ${sn2(d.msWidth)}\ \text{m}`),
      ],
    },
    {
      title: `Direction ${label} — moment distribution and steel`,
      clause: 'ACI 318-14 §8.10.4 · §8.10.5',
      lines: [
        txt('Each critical section takes a coded fraction of M₀, and that moment is then split between the column strip and the middle strip. The column strip carries the larger share because the slab is stiffer over the supports.'),
        ...d.locations.flatMap((loc) => [
          eq(String.raw`\textbf{${loc.name}:}\quad M = ${sn3(loc.coeff)}\,M_0 = ${sn3(loc.coeff)} \times ${sn1(d.Mo)} = ${sn1(loc.M)}\ \text{kN·m}`),
          eq(String.raw`\quad\text{CS } (${sn0(loc.csFrac * 100)}\%): M = ${sn1(loc.column.M)}\ \text{kN·m},\ b = ${sn0(loc.column.b)}\ \text{mm} \Rightarrow A_s = ${sn0(loc.column.As)}\ \text{mm}^2 = ${sn0(loc.column.bars)}\varnothing${sn0(db)}@${sn0(loc.column.spacing)}\ \text{mm}${loc.column.usedMin ? String.raw`\ (A_{s,min})` : ''}`),
          eq(String.raw`\quad\text{MS } (${sn0((1 - loc.csFrac) * 100)}\%): M = ${sn1(loc.middle.M)}\ \text{kN·m},\ b = ${sn0(loc.middle.b)}\ \text{mm} \Rightarrow A_s = ${sn0(loc.middle.As)}\ \text{mm}^2 = ${sn0(loc.middle.bars)}\varnothing${sn0(db)}@${sn0(loc.middle.spacing)}\ \text{mm}${loc.middle.usedMin ? String.raw`\ (A_{s,min})` : ''}`),
        ]),
      ],
      note: d.locations.some((l) => l.column.usedMin || l.middle.usedMin)
        ? 'Sections marked (As,min) are governed by the temperature and shrinkage minimum, not by flexure.'
        : undefined,
    },
  ]
}

export function buildSlabSolution(i: SlabInput, r: SlabDesignResult): SolutionStep[] {
  const short = Math.min(i.lx, i.ly), long = Math.max(i.lx, i.ly)
  const lnLong = long - i.colWidth / 1000
  const lnShort = short - i.colWidth / 1000
  const beta = lnLong / Math.max(lnShort, 1e-9)

  const steps: SolutionStep[] = [
    {
      title: 'Panel action and factored load',
      clause: 'ACI 318-14 §8.10.2 · NSCP §203.3.1',
      lines: [
        txt('A panel acts two-way while the long-to-short ratio stays under 2; beyond that it spans essentially one way and the Direct Design Method no longer applies.'),
        eq(String.raw`\frac{\ell_{long}}{\ell_{short}} = \frac{${sn2(long)}}{${sn2(short)}} = ${sn2(r.ratio)} \;${r.twoWay ? '<' : '\\ge'}\; 2 \Rightarrow \textbf{${r.twoWay ? 'two-way' : 'one-way — DDM not applicable'}}`),
        eq(String.raw`w_u = 1.2D + 1.6L = 1.2(${sn2(i.D)}) + 1.6(${sn2(i.L)}) = \mathbf{${sn2(r.wu)}}\ \text{kPa}`),
      ],
    },
    {
      title: 'Minimum thickness',
      clause: 'ACI 318-14 §8.3.1.2',
      pass: r.h >= r.hmin,
      lines: [
        txt('Deflection is controlled by thickness rather than by calculation, provided the slab is at least this deep. β is the ratio of clear spans; a long thin panel needs proportionally more depth.'),
        eq(String.raw`\beta = \frac{\ell_{n,long}}{\ell_{n,short}} = \frac{${sn3(lnLong)}}{${sn3(lnShort)}} = ${sn3(beta)}`),
        eq(String.raw`h_{min} = \frac{\ell_{n,long}\left(0.8 + \frac{f_y}{1400}\right)}{36 + 9\beta} = \frac{${sn0(lnLong * 1000)}\left(0.8 + \frac{${sn0(i.fy)}}{1400}\right)}{36 + 9(${sn3(beta)})} = ${sn1(r.hmin)}\ \text{mm}\quad(\ge 90)`),
        eq(String.raw`h = ${sn0(r.h)}\ \text{mm} \;${r.h >= r.hmin ? '\\ge' : '<'}\; h_{min} \Rightarrow \textbf{${r.h >= r.hmin ? 'OK' : 'TOO THIN'}}`),
      ],
    },
  ]

  steps.push(...directionSteps(i, r, r.x))
  steps.push(...directionSteps(i, r, r.y))

  const dfl = r.deflection
  if (dfl) {
    steps.push({
      title: 'Serviceability — mid-panel deflection',
      clause: 'ACI 318-14 §24.2.2 (Table 24.2.2)',
      pass: dfl.liveOK && dfl.totalOK,
      lines: [
        txt('Mid-panel deflection by the crossing-strip method: the panel is treated as two orthogonal strips sharing the load, each with Branson’s effective inertia. The immediate live deflection is limited to ℓ/360 and the long-term total to ℓ/240.'),
        eq(String.raw`\Delta_{imm}(D+L) = ${sn2(dfl.immediate)}\ \text{mm},\qquad \Delta_{imm}(L) = ${sn2(dfl.immLive)}\ \text{mm}`),
        eq(String.raw`\frac{\Delta_{imm,L}}{\ell/360} = \frac{${sn2(dfl.immLive)}}{${sn2(dfl.limitLive)}} = ${sn2(dfl.immLive / dfl.limitLive)} \;${dfl.liveOK ? '\\le' : '>'}\; 1.0`),
        eq(String.raw`\lambda_\Delta = ${sn2(dfl.lambdaDelta)}\ (\xi = 2.0,\ \rho' = 0) \Rightarrow \Delta_{LT,D} = ${sn2(dfl.longTerm)}\ \text{mm}`),
        eq(String.raw`\frac{\Delta_{total}}{\ell/240} = \frac{${sn2(dfl.total)}}{${sn2(dfl.limitTotal)}} = ${sn2(dfl.total / dfl.limitTotal)} \;${dfl.totalOK ? '\\le' : '>'}\; 1.0 \Rightarrow \textbf{${dfl.liveOK && dfl.totalOK ? 'OK' : 'EXCEEDS LIMIT'}}`),
      ],
    })
  }

  if (r.notes.length) {
    steps.push({
      title: 'Applicability notes',
      clause: 'ACI 318-14 §8.10.2',
      lines: [
        txt('The Direct Design Method carries conditions on span arrangement and loading. Anything below that is not satisfied means the coefficients above do not strictly apply and an equivalent-frame or FE analysis should be used instead.'),
        ...r.notes.map((n) => txt(`• ${n}`)),
      ],
    })
  }

  return steps
}
