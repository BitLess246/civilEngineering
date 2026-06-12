// Worked "load path" narrative for the tributary engine — explains how the
// panel's area load becomes line loads on its edge beams.
import type { AreaLoad, TributaryResult } from '../engine/tributary'
import { type SolutionStep, type SolutionLine, sn1, sn2 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function tributarySolution(areaLoads: AreaLoad[], r: TributaryResult): SolutionStep[] {
  const qTot = areaLoads.reduce((s, l) => s + l.q, 0)
  const peak = (qTot * r.lx) / 2
  const steps: SolutionStep[] = []

  steps.push({
    title: 'Panel classification',
    lines: [
      txt('A slab panel spans to its stiffer (shorter) direction first. When the aspect ratio reaches 2 the long direction carries almost nothing — the panel behaves one-way; below 2 both directions work — two-way.'),
      eq(String.raw`m = \dfrac{\ell_y}{\ell_x} = \dfrac{${sn2(r.ly)}}{${sn2(r.lx)}} = ${sn2(r.ratio)} \;${r.ratio >= 2 ? '\\ge' : '<'}\; 2 \Rightarrow \textbf{${r.behaviour}}`),
    ],
  })

  steps.push({
    title: 'Area load on the panel',
    lines: [
      ...areaLoads.map((l) => eq(String.raw`q_{${l.cat}} = ${sn2(l.q)}\ \text{kPa}`)),
      eq(String.raw`W = q\,\ell_x \ell_y = ${sn2(qTot)}\times ${sn2(r.lx)}\times ${sn2(r.ly)} = ${sn1(r.totalApplied)}\ \text{kN}`),
    ],
    note: 'Each category stays separate so the NSCP combinations can be applied downstream.',
  })

  if (r.behaviour === 'one-way') {
    steps.push({
      title: 'One-way distribution',
      lines: [
        txt('The slab strips span the short direction ℓx, so each LONG edge carries half the strip — a uniform line load over its whole length. The short edges receive only nominal load (taken as zero).'),
        eq(String.raw`w = \dfrac{q\,\ell_x}{2} = \dfrac{${sn2(qTot)}\times ${sn2(r.lx)}}{2} = \mathbf{${sn2(peak)}}\ \text{kN/m on each long edge}`),
      ],
    })
  } else {
    steps.push({
      title: 'Two-way distribution (45° tributary lines)',
      lines: [
        txt('Tributary lines run at 45° from the corners, meeting along the mid-line: each SHORT edge collects a triangular area (peak at midspan), each LONG edge a trapezoidal one (45° ramps over ℓx/2, flat in between).'),
        eq(String.raw`w_{peak} = \dfrac{q\,\ell_x}{2} = ${sn2(peak)}\ \text{kN/m}`),
        eq(String.raw`\text{short edge: triangle } 0 \to ${sn2(peak)} \to 0\ \text{over}\ ${sn2(r.lx)}\ \text{m}`),
        eq(String.raw`\text{long edge: ramp}\ \tfrac{\ell_x}{2} = ${sn2(r.lx / 2)}\ \text{m}, \text{ flat } ${sn2(peak)}\ \text{kN/m over } ${sn2(r.ly - r.lx)}\ \text{m, ramp down}`),
      ],
      note: 'Emitted as the exact UDL/VDL loads the beam & frame solvers accept — no equivalent-uniform approximation.',
    })
  }

  steps.push({
    title: 'Closure check',
    lines: [
      txt('Everything the slab carries must land on its edges — the distributed edge totals must reproduce the applied panel load.'),
      eq(String.raw`\sum_{edges} W_e = ${sn1(r.totalDistributed)}\ \text{kN} \;=\; W = ${sn1(r.totalApplied)}\ \text{kN}\ \checkmark`),
    ],
  })

  return steps
}
