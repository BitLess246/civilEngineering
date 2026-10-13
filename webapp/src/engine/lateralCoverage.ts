// Lateral-case coverage (audit CODE-02) — layer 4.
//
// The pipeline envelopes whatever directional E/W cases it is handed: the
// model's own node loads (given a reversed twin by `defaultLateralCases`) or a
// caller's `opts.lateral` list, used verbatim. Nothing downstream generates a
// missing direction, so an incomplete set silently designs to a one-sided or
// one-axis envelope. This checks the set BEFORE it is trusted:
//
//   reversal  — every case needs an opposite-sense twin. Earthquake forces are
//               reversible (NSCP 2015 §208.5.1.1) and wind acts in both senses
//               on each principal axis (§207B), so a case with no −R partner
//               leaves 0.9D + 1.0E/W blind to uplift and moment reversal.
//   two axes  — a structure that spans plan in both X and Z must be loaded
//               along both principal axes (§208.5.1.1 "directions that produce
//               the most critical effect"; §208.8.1 orthogonal effects build on
//               it; §207B both principal directions). A planar frame is exempt.
//
// Resultants are judged from the cases' node loads (ΣFx, ΣFz) — the only form
// lateral cases take here — with a relative tolerance, so accidental-torsion
// variants (same resultant, shifted point of application) count as the same
// direction rather than as noise.
//
// Units: forces kN, coordinates m.
import type { StructuralModel, ModelLoad } from './model'

export interface LateralCaseLike { name: string; kind: 'E' | 'W'; loads: ModelLoad[] }
export interface LateralCoverageIssue {
  kind: 'E' | 'W'
  code: 'no-reversal' | 'one-axis'
  cases: string[]
  message: string
}

const resultant = (c: LateralCaseLike): [number, number] => {
  let fx = 0, fz = 0
  for (const l of c.loads) if (l.kind === 'node') { fx += l.Fx ?? 0; fz += l.Fz ?? 0 }
  return [fx, fz]
}

/** True when the model's nodes span plan in both X and Z (not a planar frame). */
function spansPlan(model: StructuralModel, tol = 1e-6): boolean {
  if (!model.nodes.length) return false
  const xs = model.nodes.map((n) => n.x), zs = model.nodes.map((n) => n.z)
  return Math.max(...xs) - Math.min(...xs) > tol && Math.max(...zs) - Math.min(...zs) > tol
}

export function lateralCaseCoverage(model: StructuralModel, cases: LateralCaseLike[], relTol = 0.01): LateralCoverageIssue[] {
  const out: LateralCoverageIssue[] = []
  const LABEL = { E: 'Seismic', W: 'Wind' } as const
  for (const kind of ['E', 'W'] as const) {
    const cs = cases.filter((c) => c.kind === kind).map((c) => ({ c, r: resultant(c) }))
      .filter(({ r }) => Math.hypot(r[0], r[1]) > 1e-9)
    if (!cs.length) continue
    // reversal: each resultant R needs some case with resultant ≈ −R
    const lonely = cs.filter(({ r }) => {
      const m = Math.hypot(r[0], r[1])
      return !cs.some(({ r: q }) => Math.hypot(q[0] + r[0], q[1] + r[1]) <= relTol * m)
    }).map(({ c }) => c.name)
    if (lonely.length) out.push({
      kind, code: 'no-reversal', cases: lonely,
      message: `${LABEL[kind]} case${lonely.length > 1 ? 's' : ''} ${lonely.join(', ')} ha${lonely.length > 1 ? 've' : 's'} no opposite-sense companion — ${kind === 'E' ? 'earthquake forces are reversible (NSCP 2015 §208.5.1.1)' : 'wind acts in both senses on each axis (NSCP 2015 §207B)'}, so the envelope is one-sided.`,
    })
    // two axes: a non-planar structure must be loaded along both X and Z
    if (spansPlan(model)) {
      const hasX = cs.some(({ r }) => Math.abs(r[0]) > relTol * Math.hypot(r[0], r[1]))
      const hasZ = cs.some(({ r }) => Math.abs(r[1]) > relTol * Math.hypot(r[0], r[1]))
      if (hasX !== hasZ) out.push({
        kind, code: 'one-axis', cases: cs.map(({ c }) => c.name),
        message: `${LABEL[kind]} cases act along ${hasX ? 'X' : 'Z'} only, but the structure spans plan in both directions — it must also be loaded along ${hasX ? 'Z' : 'X'} (NSCP 2015 ${kind === 'E' ? '§208.5.1.1, §208.8.1' : '§207B'}).`,
      })
    }
  }
  return out
}
