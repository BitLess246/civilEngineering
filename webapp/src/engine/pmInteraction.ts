// ─────────────────────────────────────────────────────────────────────────
// Axial–moment (P–M) interaction for plastic-hinge capacity — Tier 4 #B4.
//
// A plastic hinge does not reach the pure-bending plastic moment Mp when the
// member also carries axial force: the cross-section yields in combined P+M, so
// the available plastic moment is reduced to Mpc(P) < Mp. This module returns
// that reduced capacity for the pushover hinge model.
//
// Steel (AISC 360-16 Appendix 1 / plastic interaction for compact I-shapes):
//   strong axis:  Mpc = 1.18·Mp·(1 − P/Py) ≤ Mp
//   weak  axis:   Mpc = 1.19·Mp·(1 − (P/Py)²) ≤ Mp
//   where Py = Fy·A is the squash (yield axial) load. P is the axial-force
//   magnitude (tension or compression both reduce the plastic moment).
//
// Concrete (ACI 318-14 §22.4, straight-line P–M approximation):
//   Mpc = Mp·(1 − P/Pn0)
//   where Pn0 is the pure-axial capacity. This linear chord underestimates the
//   true moment capacity below the balanced point (real concrete columns gain
//   moment capacity under moderate compression), so it is CONSERVATIVE for a
//   pushover collapse estimate — hinges form a little early, base shear a little
//   low. The full nonlinear P–M diagram is documented future work.
//
// Units: Mp, Mpc in kN·m; P, Pcap (Py or Pn0) in kN.
// ─────────────────────────────────────────────────────────────────────────

/** Which interaction surface to apply. Steel distinguishes the bending axis
 *  (strong = major/Mz, weak = minor/My); concrete uses the linear ACI chord. */
export type PmKind = 'steel-strong' | 'steel-weak' | 'concrete'

/**
 * Reduced plastic moment Mpc(P) on the chosen P–M surface, clamped to [0, Mp].
 *  - `Mp`   pure-bending plastic moment, kN·m
 *  - `P`    axial force at the section (sign-agnostic; |P| is used), kN
 *  - `Pcap` axial capacity: Py = Fy·A (steel) or Pn0 (concrete), kN
 *  - `kind` interaction surface
 * Returns `Mp` unchanged when `Pcap ≤ 0` (no interaction data).
 */
export function reducedPlasticMoment(Mp: number, P: number, Pcap: number, kind: PmKind): number {
  if (Pcap <= 0 || Mp <= 0) return Mp
  const r = Math.min(1, Math.abs(P) / Pcap)   // axial utilisation 0..1
  let f: number
  switch (kind) {
    case 'steel-strong': f = 1.18 * (1 - r); break          // AISC, major axis
    case 'steel-weak':   f = 1.19 * (1 - r * r); break      // AISC, minor axis
    case 'concrete':     f = 1 - r; break                   // ACI §22.4 chord
  }
  return Math.max(0, Math.min(1, f)) * Mp
}
