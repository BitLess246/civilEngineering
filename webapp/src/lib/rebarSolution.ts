// ─────────────────────────────────────────────────────────────────────────
// WHY THIS BAR — the reinforcement selection, written out.
//
// The rest of a worked solution derives the steel a section NEEDS. This is
// the step that says which of the layouts satisfying that requirement was
// adopted, and it belongs on the sheet for the same reason every other step
// does: a checker has to be able to disagree with it.
//
// A results table saying "4⌀20" is not checkable. "4⌀20 out of 6 layouts
// generated, 1 rejected on §25.2.1, adopted at 0.898 against 0.778 for the
// runner-up, decided on serviceability" is.
//
// Applies equally to a beam cage, a column cage and a slab mat — the layouts
// name themselves per `ScoreContext.naming`, which the optimiser sets.
// ─────────────────────────────────────────────────────────────────────────

import {
  PRIORITY_WEIGHTS, blockingGates,
  type RebarLayout, type RebarSelection, type ScoredLayout,
} from '../engine/rebarScore'
import { nameCage, nameMat } from './rebarLabel'
import { sn0, sn2, sn3, type SolutionStep } from './solution'

export type LayoutKind = 'cage' | 'mat'

const nameOf = (kind: LayoutKind) => (kind === 'mat' ? nameMat : nameCage)

/** KaTeX-safe: `⌀20 @ 125` carries characters that break in math mode. */
const tt = (s: string) => `\\mathrm{${s.replace(/⌀/g, 'D').replace(/@/g, '\\ @\\ ')}}`

function scoreLine(s: ScoredLayout, name: (l: RebarLayout) => string): string {
  const w = PRIORITY_WEIGHTS
  return `S(${tt(name(s.layout))}) = ` +
    `${sn2(w.serviceability)}(${sn2(s.scores.serviceability)}) + ` +
    `${sn2(w.constructability)}(${sn2(s.scores.constructability)}) + ` +
    `${sn2(w.economy)}(${sn2(s.scores.economy)}) + ` +
    `${sn2(w.simplicity)}(${sn2(s.scores.simplicity)}) = ${sn3(s.total)}`
}

/**
 * The selection, as worked-solution steps.
 *
 * Returns an empty list when there is nothing to justify (no candidates at
 * all), so a caller can concatenate unconditionally.
 */
export function buildRebarSelectionSolution(
  sel: RebarSelection, kind: LayoutKind = 'cage',
): SolutionStep[] {
  const name = nameOf(kind)
  const total = sel.ranked.length + sel.rejected.length
  if (total === 0) return []

  const thing = kind === 'mat' ? 'mat' : 'cage'
  const steps: SolutionStep[] = []

  // ── 1. What was searched ────────────────────────────────────────────────
  steps.push({
    title: 'Layouts considered',
    clause: 'ACI 318-14 §25.2 · §9.7.2',
    lines: [
      {
        text: kind === 'mat'
          ? 'Every bar diameter is paired with every spacing off the standard module, ' +
            'because a mat is specified by spacing and the bar count follows from it. ' +
            'The required steel comes from the flexure check above; nothing is re-derived here.'
          : 'Every bar diameter is laid out against the steel the flexure check above ' +
            'requires, so the choice is made between complete arrangements rather than ' +
            'between areas. No strength is re-derived here.',
      },
      { tex: `n_{\\mathrm{generated}} = ${sn0(sel.ranked.length)} + ${sn0(sel.rejected.length)} = ${sn0(total)}` },
    ],
  })

  // ── 2. The gate ─────────────────────────────────────────────────────────
  const gates = blockingGates(sel)
  if (sel.best) {
    const checks = sel.best.compliance
    steps.push({
      title: 'Code compliance — a gate, not a score',
      clause: sel.best.compliance[0]?.clause ?? 'ACI 318-14 §25.2',
      pass: true,
      lines: [
        {
          text: `A layout failing any one check is infeasible and is never ranked, however ` +
            `well it scores on everything else. The adopted ${thing} passes all ` +
            `${checks.length} of them; ${sel.rejected.length} of the ${total} layouts ` +
            `generated did not and were discarded.`,
        },
        ...checks.map((c) => ({
          text: `Satisfied — ${c.label} per ${c.clause}${c.detail ? `, ${c.detail}` : ''}.`,
        })),
      ],
    })
  } else {
    steps.push({
      title: 'Code compliance — no layout satisfies every check',
      clause: gates[0]?.check.clause ?? 'ACI 318-14 §25.2',
      pass: false,
      lines: [
        {
          text: `None of the ${total} layouts generated is compliant, so there is nothing ` +
            `to rank. More than one gate usually fires and the combination is the ` +
            `diagnosis: what has to change is almost always the section, not the bar.`,
        },
        ...gates.map((g) => ({ text: `${sn0(g.n)} rejected on ${g.check.label} — ${g.check.clause}` })),
      ],
    })
    return steps
  }

  // ── 3. The weighted score ───────────────────────────────────────────────
  const w = PRIORITY_WEIGHTS
  steps.push({
    title: 'Weighted score of the compliant layouts',
    clause: 'ACI 318-14 §24.3.2 · §25.2 (serviceability & detailing basis)',
    lines: [
      {
        text: 'Each dimension is scored 0 to 1 relative to the layouts generated here, ' +
          'then weighted in the stated priority order: serviceability first, then ' +
          'constructability, then economy, then simplicity.',
      },
      {
        tex: `S = ${sn2(w.serviceability)}\\,S_{serv} + ${sn2(w.constructability)}\\,S_{con} + ` +
          `${sn2(w.economy)}\\,S_{eco} + ${sn2(w.simplicity)}\\,S_{simp}`,
      },
      ...sel.ranked.slice(0, 4).map((s) => ({ tex: scoreLine(s, name) })),
    ],
  })

  // ── 4. What was adopted, and why ────────────────────────────────────────
  steps.push({
    title: `Adopted — ${name(sel.best.layout)}`,
    clause: 'ACI 318-14 §25.2 · good detailing practice',
    pass: true,
    lines: [
      { text: `${sel.best.reason} ${sel.margin.charAt(0).toUpperCase()}${sel.margin.slice(1)}.` },
      {
        text: 'Where two layouts score within 0.03 of each other they are treated as ' +
          'equivalent and the better distributed one is preferred — but only if it does ' +
          'not buy that distribution with materially more steel.',
      },
      {
        tex: `A_{s,prov} = ${sn0(sel.best.layout.AsProv)}\\ \\text{mm}^2 \\ge ` +
          `A_{s,req} = ${sn0(sel.best.layout.AsReq)}\\ \\text{mm}^2`,
      },
      {
        // Provided-over-required is the number a checker reaches for first:
        // it says in one figure whether this layout is tight or generous.
        tex: `\\dfrac{A_{s,prov}}{A_{s,req}} = \\dfrac{${sn0(sel.best.layout.AsProv)}}` +
          `{${sn0(sel.best.layout.AsReq)}} = ` +
          `${sn2(sel.best.layout.AsProv / Math.max(sel.best.layout.AsReq, 1e-9))}`,
      },
      {
        tex: `s = ${sn0(sel.best.layout.spacing)}\\ \\text{mm} \\Rightarrow ` +
          `s_{clear} = s - d_b = ${sn0(sel.best.layout.spacing)} - ${sn0(sel.best.layout.db)} = ` +
          `${sn0(sel.best.layout.clearSpacing)}\\ \\text{mm}`,
      },
      {
        tex: `d_{achieved} = ${sn0(sel.best.layout.d)}\\ \\text{mm}` +
          `\\quad (${sn0(sel.best.layout.layers.length)}\\ \\text{layer}` +
          `${sel.best.layout.layers.length === 1 ? '' : 's'}` +
          `${sel.best.layout.layers.length > 1 ? `: ${sel.best.layout.layers.join('+')}` : ''})`,
      },
    ],
  })

  return steps
}
