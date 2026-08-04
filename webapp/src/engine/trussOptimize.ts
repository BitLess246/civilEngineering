// ─────────────────────────────────────────────────────────────────────────
// Truss section optimiser — pick the lightest section per DESIGN GROUP.
//
// The page sizes every member of a truss with ONE section, chosen by hand.
// That is how a truss is drawn, not how it is designed: a bottom chord in
// pure tension is limited only by Fy·Ag, while a top chord of the same
// length carrying the same magnitude in compression is limited by buckling
// and needs several times the area. Sizing both from the worse of the two
// buys tonnage that does nothing.
//
// ── GROUPS ──────────────────────────────────────────────────────────────
//
// A group is a set of members that will be detailed with the SAME section.
// Members are grouped by role and by the sign of their governing force:
//
//     top chord · bottom chord · web in compression · web in tension
//
// which is how a truss is actually fabricated — one size for the chords,
// one for the struts, one for the ties. Coarser groupings are available for
// comparison: 'sign' (two groups) and 'uniform' (one, i.e. what the page
// did before).
//
// A group is sized for the WORST member in it, at that member's own length.
// One group means one section, so a group containing any compression member
// is buckling-limited by the LONGEST of them, not by the highest force.
//
// ── ZERO-FORCE MEMBERS ──────────────────────────────────────────────────
//
// They go into the COMPRESSION group of their family, never the tension
// one. A member carrying no force in this load case still has to hold its
// own length without buckling under any incidental load, and it is the
// slenderness limit — not the force — that sizes it. Putting it in the
// tension group would let a zero force select the smallest section in the
// catalogue.
//
// ── THE ORDER OF THE FILTERS ────────────────────────────────────────────
//
// Same shape as `barSelection`: pass/fail gates applied in sequence, then a
// ranking over whatever survived. A candidate that fails a gate is never
// rescued for being lighter, and the reason a section was rejected is the
// FIRST gate it failed.
//
//   1. STRENGTH      every member in the group has util ≤ 1  (AISC D2 / E3)
//   2. SLENDERNESS   KL/r ≤ 200 for compression (§E2)
//   3. ECONOMY       least gross area — which is least weight and least cost
//
// Units: A mm², r mm, L m, forces kN, weight kg.
// ─────────────────────────────────────────────────────────────────────────

import type { MemberForce } from './truss'
import { designTrussMember, type MemberDesign, type TrussSection } from './trussDesign'
import {
  effectiveSection, doubleAngle, shapesOf,
  type EffectiveSection, type SectionFamily,
} from './aiscSections'

const STEEL_DENSITY = 7850   // kg/m³, matching trussTakeoff

/** §E2 — a compression member beyond this is discouraged. */
export const SLENDER_LIMIT_COMPRESSION = 200
/** §D1 — a preference, not a limit, so it is reported and not enforced. */
export const SLENDER_PREFERENCE_TENSION = 300

export type GroupingMode = 'role' | 'sign' | 'uniform'

export interface TrussGroup {
  id: string
  label: string
  /** True when any member in the group is in compression (or zero-force). */
  compression: boolean
  members: MemberForce[]
}

/** Why one candidate section was rejected — the FIRST gate it failed. */
export type RejectGate = 'strength' | 'slenderness'

export interface GroupChoice {
  group: TrussGroup
  /** The adopted section, or null when nothing in the catalogue works. */
  section: EffectiveSection | null
  /** The member that set the size — the one at the highest utilisation. */
  governing: MemberDesign | null
  maxUtil: number
  maxSlenderness: number
  /**
   * Worst L/r among the TENSION members of the group, and whether it clears
   * the §D1 preference of 300.
   *
   * §D1 says slenderness "preferably" should not exceed 300 for a member in
   * tension — a recommendation about sag, handling damage and vibration, not
   * a strength limit — so it is REPORTED and never enforced. Left silent, the
   * optimiser happily picks a rod-thin bottom chord that is perfectly strong
   * and unpleasant to build with.
   */
  maxTensionSlenderness: number
  tensionSlendernessOK: boolean
  ok: boolean
  /** Total length of the group, m, and the steel it costs, kg. */
  lengthM: number
  weightKg: number
  /** Rejected candidates, lightest first, with the gate each one failed. */
  rejected: { label: string; gate: RejectGate }[]
}

export interface TrussOptimizeResult {
  groups: GroupChoice[]
  members: (MemberDesign & { group: string })[]
  totalWeightKg: number
  ok: boolean
  /** Weight if a single section were used for everything, for comparison. */
  uniformWeightKg: number | null
  /** Fraction saved against the uniform section; 0 when there is nothing to compare. */
  savedFraction: number
}

export interface OptimizeOpts {
  grouping?: GroupingMode
  /** Families to draw candidates from. Defaults to the family passed in. */
  families?: SectionFamily[]
  /** Also consider back-to-back double angles, at this gap (mm). */
  doubleAngles?: boolean
  gap?: number
  E?: number
  Fy?: number
  K?: number
}

// ── Candidates ────────────────────────────────────────────────────────────

/**
 * The catalogue to search, lightest first. Sorted by gross area because area
 * is what stage 3 minimises, and because it is monotone with both weight and
 * cost — a heavier section is never cheaper.
 */
export function candidateSections(
  families: SectionFamily[], opts: { doubleAngles?: boolean; gap?: number } = {},
): EffectiveSection[] {
  const out: EffectiveSection[] = []
  for (const f of families) {
    for (const s of shapesOf(f)) {
      out.push(effectiveSection(s))
      if (opts.doubleAngles && s.family === 'L') out.push(doubleAngle(s, opts.gap ?? 0))
    }
  }
  return out.sort((a, b) => a.A - b.A || a.label.localeCompare(b.label))
}

// ── Grouping ──────────────────────────────────────────────────────────────

/**
 * Split members into the sets that will share a section.
 *
 * Sign is taken from the GOVERNING force already enveloped upstream. A
 * zero-force member is treated as compression — see the header.
 */
export function groupMembers(forces: MemberForce[], mode: GroupingMode = 'role'): TrussGroup[] {
  const key = (f: MemberForce): { id: string; label: string; compression: boolean } => {
    const comp = f.N <= 1e-9          // zero-force counts as compression
    if (mode === 'uniform') return { id: 'all', label: 'All members', compression: true }
    if (mode === 'sign') {
      return comp
        ? { id: 'compression', label: 'Compression members', compression: true }
        : { id: 'tension', label: 'Tension members', compression: false }
    }
    if (f.kind === 'top') return { id: 'top', label: 'Top chord', compression: comp }
    if (f.kind === 'bottom') return { id: 'bottom', label: 'Bottom chord', compression: comp }
    return comp
      ? { id: 'web-compression', label: 'Web — struts (compression)', compression: true }
      : { id: 'web-tension', label: 'Web — ties (tension / cross bracing)', compression: false }
  }

  const map = new Map<string, TrussGroup>()
  for (const f of forces) {
    const k = key(f)
    const g = map.get(k.id)
    if (g) {
      g.members.push(f)
      // A chord group can hold both signs when the envelope flips one panel;
      // the group is then buckling-limited, so the flag latches on.
      g.compression = g.compression || k.compression
    } else {
      map.set(k.id, { id: k.id, label: k.label, compression: k.compression, members: [f] })
    }
  }
  // Stable, readable order.
  const RANK = ['top', 'bottom', 'web-compression', 'web-tension', 'compression', 'tension', 'all']
  return [...map.values()].sort((a, b) => RANK.indexOf(a.id) - RANK.indexOf(b.id))
}

// ── Sizing one group ──────────────────────────────────────────────────────

const weightOf = (A: number, lengthM: number) => (A / 1e6) * lengthM * STEEL_DENSITY

/**
 * The lightest candidate that carries every member of the group.
 *
 * Every member is checked, not just the worst-looking one: the highest force
 * and the longest member are usually different members, and in a compression
 * group it is the long one that governs.
 */
export function sizeGroup(
  group: TrussGroup, candidates: readonly EffectiveSection[],
  mat: { E: number; Fy: number; K?: number },
): GroupChoice {
  const lengthM = group.members.reduce((s, m) => s + m.L, 0)
  const rejected: { label: string; gate: RejectGate }[] = []

  for (const cand of candidates) {
    const sec: TrussSection = { A: cand.A, r: cand.rmin, E: mat.E, Fy: mat.Fy, K: mat.K }
    const designs = group.members.map((m) => designTrussMember(m, sec))

    // Gate 1 — strength. Reported first even when slenderness also fails, so
    // the reason a section was rejected is the first thing wrong with it.
    if (designs.some((d) => d.util > 1 + 1e-9)) {
      rejected.push({ label: cand.label, gate: 'strength' })
      continue
    }
    // Gate 2 — §E2 slenderness, compression members only.
    if (designs.some((d) => d.mode === 'compression' && !d.slenderOK)) {
      rejected.push({ label: cand.label, gate: 'slenderness' })
      continue
    }
    // Gate 3 — economy is the sort order, so the first survivor wins.
    const governing = designs.reduce((a, b) => (b.util > a.util ? b : a), designs[0] ?? null)
    const tensionSlender = designs
      .filter((d) => d.mode === 'tension')
      .reduce((m, d) => Math.max(m, d.slenderness), 0)
    return {
      group, section: cand, governing,
      maxUtil: designs.reduce((m, d) => Math.max(m, d.util), 0),
      maxSlenderness: designs.reduce((m, d) => Math.max(m, d.slenderness), 0),
      maxTensionSlenderness: tensionSlender,
      tensionSlendernessOK: tensionSlender <= SLENDER_PREFERENCE_TENSION + 1e-9,
      ok: true, lengthM, weightKg: weightOf(cand.A, lengthM), rejected,
    }
  }

  // Nothing in the catalogue works — report it rather than adopting a failure.
  return {
    group, section: null, governing: null, maxUtil: Infinity, maxSlenderness: Infinity,
    maxTensionSlenderness: Infinity, tensionSlendernessOK: false,
    ok: false, lengthM, weightKg: 0, rejected,
  }
}

// ── The whole truss ───────────────────────────────────────────────────────

export function optimizeTruss(
  forces: MemberForce[], family: SectionFamily, opts: OptimizeOpts = {},
): TrussOptimizeResult {
  const mat = { E: opts.E ?? 200000, Fy: opts.Fy ?? 248, K: opts.K ?? 1.0 }
  const families = opts.families ?? [family]
  const candidates = candidateSections(families, { doubleAngles: opts.doubleAngles, gap: opts.gap })

  const groups = groupMembers(forces, opts.grouping ?? 'role').map((g) => sizeGroup(g, candidates, mat))

  const members: (MemberDesign & { group: string })[] = []
  for (const gc of groups) {
    if (!gc.section) continue
    const sec: TrussSection = { A: gc.section.A, r: gc.section.rmin, E: mat.E, Fy: mat.Fy, K: mat.K }
    for (const m of gc.group.members) members.push({ ...designTrussMember(m, sec), group: gc.group.id })
  }

  // What a single section for the whole truss would have cost, so the saving
  // is a measured number rather than a claim.
  const uniform = sizeGroup(
    groupMembers(forces, 'uniform')[0] ?? { id: 'all', label: 'All members', compression: true, members: [] },
    candidates, mat,
  )
  const totalWeightKg = groups.reduce((s, g) => s + g.weightKg, 0)
  const uniformWeightKg = uniform.ok ? uniform.weightKg : null

  return {
    groups, members, totalWeightKg,
    ok: groups.every((g) => g.ok),
    uniformWeightKg,
    savedFraction: uniformWeightKg && uniformWeightKg > 0
      ? Math.max(0, 1 - totalWeightKg / uniformWeightKg)
      : 0,
  }
}

/** A one-line explanation of a rejection, for a schedule note or a tooltip. */
export function rejectionNote(label: string, gate: RejectGate): string {
  return gate === 'strength'
    ? `${label}: a member in this group exceeds its capacity`
    : `${label}: a compression member exceeds KL/r = ${SLENDER_LIMIT_COMPRESSION} (§E2)`
}
