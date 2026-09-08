// ─────────────────────────────────────────────────────────────────────────
// DESIGN SNAPSHOT — which building, which run, which engine.
//
// A calculation report is evidence, and evidence has to be identifiable.
// Two reports on "the same building" printed a week apart were, until this
// module, indistinguishable: same title block, same letterhead, no way to
// tell which model produced which, and no way to tell whether the drawing
// set on the desk belongs to the report beside it. "Rev A" written on a
// title block by hand is not an answer — it says what someone INTENDED, not
// what was computed.
//
// So every document stamps a snapshot: four content digests over what was
// actually analysed, designed and detailed, one short id over all of them,
// and the version of the engine that produced them.
//
// WHAT A DIGEST IS AND IS NOT. This is FNV-1a in two lanes — a fingerprint,
// not a cryptographic hash. It answers "is this the same content?" and it is
// not proof against someone constructing a collision on purpose. That is the
// right tool: the failure this prevents is an honest mix-up, a stale drawing
// or a report reprinted from a model that has since moved on.
//
// WHAT GOES IN. The model digest covers what the ANALYSIS reads — geometry,
// sections, members, plates, walls, supports, loads, storey elevations and
// the modelling flags — canonicalised so that reordering an array or
// renaming the project cannot change it, and moving a node by a millimetre
// must. Cosmetic fields are deliberately excluded: a digest that changes
// when someone edits the project title is a digest nobody will trust.
//
// Units: unchanged from the model (geometry m, sections mm, forces kN).
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import type { StructureDesign } from './pipeline'
import type { F3Analysis } from './frame3d'
import type { RebarCage } from './rebarModel'
import { stableStringify } from '../lib/contentHash'

/**
 * Version of the CALCULATION ENGINE, bumped by hand when a change moves a
 * number a previous report printed.
 *
 * Not the package version (0.0.0 and meaningless) and not the git sha (which
 * changes for a typo in a comment). A reviewer comparing two reports wants to
 * know whether the arithmetic behind them differs, and only a person can
 * answer that.
 */
export const ENGINE_VERSION = '1.0.0'

/** The codes the engine implements — printed so a report states its basis
 *  rather than assuming the reader knows it. */
export const CODE_BASIS = 'NSCP 2015 · ACI 318-14 · AISC 360-16'

/**
 * Numbers are canonicalised to 12 significant digits before hashing.
 *
 * A double is reproducible bit-for-bit on one machine, so this is not needed
 * for a re-run here — it is needed for the CLAIM the snapshot makes. Two
 * engines, or two CPUs, can differ in the last unit in the last place of a
 * transcendental; a digest that flips on that would report a difference where
 * there is none, and an id that cannot be reproduced is worse than no id.
 * Twelve digits is far beyond any quantity this engine reports.
 */
export function canonicalNumber(v: number): number {
  if (!Number.isFinite(v)) return 0
  if (v === 0) return 0            // collapses -0, which stringifies differently
  return Number(v.toPrecision(12))
}

const canon = (v: unknown): unknown => {
  if (typeof v === 'number') return canonicalNumber(v)
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) out[k] = canon(x)
    return out
  }
  return v
}

/**
 * 64-bit FNV-1a over the canonical JSON, as 16 lowercase hex characters.
 *
 * Two independent 32-bit lanes rather than one: `contentHash` in `lib/` is a
 * 32-bit fingerprint, which is right for "did this document change since I
 * last synced it" and too narrow for an identifier a reader is invited to
 * compare across a filing cabinet. At 32 bits a collision becomes likely
 * around 65 000 documents; at 64 it is around four billion.
 */
export function digest(value: unknown): string {
  const s = stableStringify(canon(value))
  let a = 0x811c9dc5, b = 0x9dc5811c
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/** The short form a reader quotes and compares — the first 12 characters,
 *  grouped, which is what fits on a footer and in a conversation. */
export const shortId = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 12)}`.toUpperCase()

// ── what each digest covers ──────────────────────────────────────────────
const byId = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((p, q) => p.id.localeCompare(q.id))

/**
 * The analysis-relevant content of the model.
 *
 * SORTED, so the digest is a property of the structure and not of the order
 * the user happened to draw it in — two engineers modelling the same frame
 * from opposite corners must land on the same id. Loads have no id, so they
 * are sorted by their own canonical text.
 *
 * `name` and every storey's `name` are excluded on purpose: renaming a
 * project does not change the building.
 */
export function modelDigest(m: StructuralModel): string {
  const loads = m.loads.map((l) => stableStringify(canon(l))).sort()
  return digest({
    nodes: byId(m.nodes).map((n) => [n.id, n.x, n.y, n.z]),
    sections: byId(m.sections),
    members: byId(m.members),
    plates: byId(m.plates),
    walls: byId(m.walls ?? []),
    stairs: byId(m.stairs ?? []),
    supports: [...m.supports].sort((p, q) => p.node.localeCompare(q.node)),
    loads,
    storeys: [...m.storeys].map((s) => s.elevation).sort((p, q) => p - q),
    flags: {
      diaphragm: !!m.diaphragm,
      rigidEndZones: !!m.rigidEndZones,
      rigidZoneFactor: m.rigidZoneFactor ?? null,
      shellElements: !!m.shellElements,
    },
  })
}

/**
 * The analysis RESULTS — every solved combination's member force envelope,
 * its reactions and its node displacements.
 *
 * Not the raw stiffness internals, and not the sampled diagrams: what the
 * report shows and what the design consumes. If two reports carry the same
 * analysis digest, every number either of them prints from the analysis is
 * the same number.
 */
export function analysisDigest(a: F3Analysis | null | undefined): string | null {
  if (!a) return null
  return digest(a.perCombo.filter((r) => r.result).map((r) => ({
    combo: r.combo.name,
    f: r.combo.f,
    members: [...r.result!.members].sort((p, q) => p.id.localeCompare(q.id))
      .map((m) => [m.id, m.Nmax, m.Vmax, m.Mmax, m.Tmax]),
    reactions: [...r.result!.reactions].sort((p, q) => p.node.localeCompare(q.node))
      .map((x) => [x.node, ...x.F, ...x.M]),
    d: r.result!.d,
  })))
}

/**
 * The DESIGN — one entry per schedule row, carrying what that row reports.
 *
 * A design digest that only covered pass/fail would be silent on the change
 * that matters most: the same verdict reached with different steel.
 */
export function designDigest(d: StructureDesign | null | undefined): string | null {
  if (!d) return null
  return digest({
    gov: d.govName,
    beams: [...d.beams].sort((p, q) => p.id.localeCompare(q.id)).map((b) => [
      b.id, b.ok, b.hMin, b.thickOK,
      b.sections.map((s) => [s.label, s.Mu, s.Vu, s.design.As, s.design.bars, s.design.AsPrime, s.design.comprBars, s.design.legs, s.design.sAdopt, s.design.sHinge]),
    ]),
    columns: [...d.columns].sort((p, q) => p.id.localeCompare(q.id)).map((c) => [c.id, c.Pu, c.Mu, c.Muy, c.bars, c.phiPn, c.util, c.tieSpacingFinal, c.ok]),
    steelBeams: [...d.steelBeams].sort((p, q) => p.id.localeCompare(q.id)).map((b) => [b.id, b.shape, b.utilM, b.utilV, b.ok]),
    steelColumns: [...d.steelColumns].sort((p, q) => p.id.localeCompare(q.id)).map((c) => [c.id, c.shape, c.ratio, c.ok]),
    footings: [...d.footings].sort((p, q) => p.node.localeCompare(q.node)).map((f) => [f.node, f.design.B, f.design.Dc, f.design.bars, f.design.barSpacing, f.ok]),
    slabs: [...d.slabs].sort((p, q) => p.plate.localeCompare(q.plate)).map((s) => [s.plate, s.design.h, s.barDia, s.ok]),
    walls: d.walls.map((w) => [w.id, w.ok]),
    totals: d.totals,
  })
}

/** The DETAILING — every placed bar path. This is what tells a drawing set
 *  apart from the one printed before the last cage change. */
export function detailingDigest(cages: readonly RebarCage[] | null | undefined): string | null {
  if (!cages || cages.length === 0) return null
  return digest([...cages].sort((p, q) => p.member.localeCompare(q.member)).map((c) => ({
    member: c.member,
    runs: c.runs.map((r) => [r.role, r.dia, r.mark ?? '', r.path.length, r.path]),
  })))
}

// ── the snapshot ─────────────────────────────────────────────────────────
export interface SnapshotInput {
  model: StructuralModel
  design?: StructureDesign | null
  analysis?: F3Analysis | null
  cages?: readonly RebarCage[] | null
  /** The saved project this session belongs to, when there is one. */
  projectId?: string | null
  projectName?: string
  /** Commit the running build came from, when the build knows it. */
  buildId?: string | null
  /** Whether the optimizer was run, and how far it got — part of the identity
   *  of the design, because the same model optimised and not optimised are
   *  two different designs. */
  optimized?: boolean
  generatedAt?: Date
}

export interface DesignSnapshot {
  projectId: string
  projectName: string
  modelDigest: string
  analysisDigest: string | null
  designDigest: string | null
  detailingDigest: string | null
  /** One id over all of the above plus the engine version — the token to
   *  quote when asking "is this the same calculation?". */
  snapshotId: string
  engineVersion: string
  buildId: string | null
  codeBasis: string
  generatedAt: string
  optimized: boolean
}

/**
 * Assemble the snapshot. Pure: the only non-deterministic input is
 * `generatedAt`, which the caller supplies (and the tests pin).
 *
 * The PROJECT ID falls back to the model digest when the session has no saved
 * project. That is deliberate — the alternative is printing "—", and an
 * unsaved model still deserves an identity. It is derived, and the block says
 * so, so nobody mistakes it for a filing reference.
 */
export function buildDesignSnapshot(i: SnapshotInput): DesignSnapshot {
  const md = modelDigest(i.model)
  const ad = analysisDigest(i.analysis)
  const dd = designDigest(i.design)
  const td = detailingDigest(i.cages)
  const optimized = !!i.optimized
  return {
    projectId: i.projectId || `derived:${shortId(md)}`,
    projectName: i.projectName?.trim() || 'Untitled',
    modelDigest: md,
    analysisDigest: ad,
    designDigest: dd,
    detailingDigest: td,
    snapshotId: digest([ENGINE_VERSION, md, ad, dd, td, optimized]),
    engineVersion: ENGINE_VERSION,
    buildId: i.buildId || null,
    codeBasis: CODE_BASIS,
    generatedAt: (i.generatedAt ?? new Date()).toISOString(),
    optimized,
  }
}

/**
 * The snapshot as printable rows.
 *
 * A stage that was not run prints "not run" rather than a dash, because a
 * dash reads as "nothing to say" and the distinction between "no analysis was
 * run" and "the analysis produced nothing" is exactly the kind of thing a
 * report must not blur.
 */
export function snapshotRows(s: DesignSnapshot): [string, string][] {
  const stage = (d: string | null, what: string) => d ? shortId(d) : `not run — no ${what}`
  return [
    ['Project', s.projectName],
    ['Project ID', s.projectId],
    ['Snapshot ID', shortId(s.snapshotId)],
    ['Model revision', shortId(s.modelDigest)],
    ['Analysis ID', stage(s.analysisDigest, 'analysis')],
    ['Design ID', stage(s.designDigest, 'design')],
    ['Detailing ID', stage(s.detailingDigest, 'cages built')],
    ['Optimizer', s.optimized ? 'run — sections are the optimizer\'s' : 'not run — sections are as modelled'],
    ['Engine version', s.engineVersion + (s.buildId ? ` · build ${s.buildId.slice(0, 7)}` : '')],
    ['Code basis', s.codeBasis],
    ['Generated', s.generatedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')],
  ]
}

/** The one-line stamp for a page footer — short enough to sit beside the
 *  page number, specific enough to trace a loose sheet back to its run. */
export const snapshotStamp = (s: DesignSnapshot) =>
  `SNAPSHOT ${shortId(s.snapshotId)} · MODEL ${shortId(s.modelDigest)} · ENGINE ${s.engineVersion}`
