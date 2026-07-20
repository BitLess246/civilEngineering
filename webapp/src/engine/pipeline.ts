// ─────────────────────────────────────────────────────────────────────────
// Structure design pipeline — Phase 6 of the 3D roadmap. For the governing
// NSCP combination, design DOWN the load path:
//   slabs (already distributed by the bridge) → every beam/girder
//   (critical sections → SRRB/DRRB via designBeam) → every column
//   (axial + P–M via columnDesign) → every base support (service +
//   factored reactions → isolated footing) → concrete totals.
// Every stage reuses the existing engines unchanged.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection, ModelLoad, Member } from './model'
import { enforceSectionHierarchy, refreshSelfWeight, barContinuityGroups } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { precomputeFrame, solveWithGeometry, applyF3Combo, serializePrecomp, type F3Result, type F3MemberResult, type F3Load } from './frame3d'
import type { BridgeResult } from './modelBridge'
import { FramePool } from './framePool'
import { nscpCombos, type Combo } from './beamAnalysis'
import type { ProgressFn } from './progress'
import { designBeam, type BeamDesignResult } from './beamDesign'
import { effectiveFlange } from './tbeam'
import { designPrestressed, type PrestressedResult } from './prestressedBeam'
import { minBeamThickness, type BeamSupport } from './beamDeflection'
import { designAxialColumn, capacityAtEccentricity, interaction, type BarLayout } from './columnDesign'
import { designSquareFooting, type SquareFootingResult } from './isolatedFooting'
import { designCombinedFooting, type CombinedFootingResult } from './combinedFooting'
import { designSlabDDM, type SlabDesignResult } from './slabDDM'
import { designShearWall, type ShearWallResult } from './shearWallDesign'
import { checkModelSCWB, type SCWBJointRow } from './scwb'
import { shapeByName, nextHeavierW, nextLighterW, type AiscShape } from './aiscSections'
import { deriveWSection, beamFlexure, beamShear, columnAxial, combinedLoading } from './steelDesign'
import { woodRefOf, checkWoodBeam, checkWoodColumn } from './woodDesign'
import { designBasePlate, adoptPlateThickness, type BasePlateResult } from './baseplate'
import { designSteelJoints, designBeamBeamJoints, type SteelJoint, type BeamBeamJoint } from './steelConnections'

export interface SoilOptions {
  qAllow: number; gammaSoil: number; gammaConc: number; H: number
}

/** A directional lateral load case (one of +X/−X/+Z/−Z for E or W): a set of
 *  category-E or category-W node loads applied as one primary case. */
export interface LateralCase { name: string; kind: 'E' | 'W'; loads: ModelLoad[] }

/** Analysis options threaded into the frame solve. */
export interface AnalyzeOptions {
  /** NSCP §203.3.1 live-load factor f₁ (1.0 / 0.5). */
  f1?: number
  /** Run the second-order P-Δ iteration. */
  pDelta?: boolean
  /** Directional lateral cases (E/W in ±X/±Z). When given, every combination
   *  with an E (or W) factor is run once per E (or W) case and the design is
   *  enveloped per member — STAAD-style. The list is used VERBATIM — include
   *  both senses (±) yourself; only the default cases auto-derived from the
   *  model's E/W node loads get a reversed-sign companion added. */
  lateral?: LateralCase[]
  /** Seismic lateral resisting system — drives column tie detailing per NSCP 2015 §418.
   *  'smf' = Special Moment Frame (§418.7.5), 'imf' = Intermediate (§418.4.3).
   *  Default 'gravity' (ordinary ties only, §425.7.2). */
  seismicSystem?: 'gravity' | 'imf' | 'smf'
  /** ACI 318-14 §6.6.3.1.1 cracked-section I-modifiers (0.35Ig beams/girders,
   *  0.70Ig columns/braces) on concrete members. Default off at the API level;
   *  the Model Space UI enables it by default. */
  crackedSections?: boolean
  /** Vertical seismic component addend Ev = 0.5·Ca·I (NSCP §208.4.1): the
   *  E-carrying combos get D → D+Ev when additive (1.2D+1.0E) and D → D−Ev on
   *  the counteracting uplift combo (0.9D+1.0E). Omit → gross combos. */
  Ev?: number
  /** Timoshenko shear deformation: bridge shear areas into the frame elements
   *  (Φ = 12EI/(G·As·L²)). Default off at the API level; UI enables it. */
  shearDeformation?: boolean
  /** Column P–M bar layout: 'all-around' models the real cage (side bars as
   *  their own strain layers). Default 'two-face' at the API level; the Model
   *  Space UI enables all-around. */
  colLayout?: BarLayout
  /** Flanged (T-beam) action for sagging sections of beams that carry a slab:
   *  bf per ACI §6.3.2 from the adjoining panels, used when a ≤ hf AND the
   *  flanged design actually saves steel. */
  tBeamAction?: boolean
}

export interface BeamSectionDesign {
  label: string; x: number; Mu: number; Vu: number; hogging: boolean
  design: BeamDesignResult
  /** T-beam action: effective flange width used for this sagging section
   *  (ACI §6.3.2) — present only when the block stayed inside the slab. */
  bf?: number; hf?: number
}
export interface BeamScheduleRow {
  id: string; role: string; L: number
  sections: BeamSectionDesign[]
  /** NSCP Table 409.3.1.1 deemed-to-comply serviceability: span type from the
   *  joint connectivity, the corresponding minimum thickness ×(0.4 + fy/700),
   *  and whether the section satisfies it (deflections need not be computed). */
  support: BeamSupport
  hMin: number
  thickOK: boolean
  ok: boolean
  gov?: string   // governing load case (envelope)
  /** Governing-case force diagrams along the member (for the worked solution). */
  diag?: { xs: number[]; Vy: number[]; Mz: number[] }
}
export interface ColumnScheduleRow {
  id: string; L: number
  Pu: number; Mu: number; e: number
  /** P–M bar layout used for the check (mirrors AnalyzeOptions.colLayout). */
  layout?: BarLayout
  bars: number; phiPn: number; util: number
  /** Gravity-only tie spacing (§425.7.2), mm. */
  tieSpacing: number
  /** Final governing tie spacing (seismic confinement if applicable), mm. */
  tieSpacingFinal: number
  /** Human-readable label for the governing tie-spacing clause. */
  tieSpacingLabel: string
  /** Seismic confinement zone length ℓo, mm (smf/imf only). */
  seismicLoZone?: number
  /** Max tie spacing within confinement zone, mm (smf/imf only). */
  seismicSConf?: number
  /** Max tie spacing outside confinement zone, mm (smf only). */
  seismicSOut?: number
  ok: boolean
  gov?: string
}
export interface FootingScheduleRow {
  node: string; P: number; Pu: number
  design: SquareFootingResult
  ok: boolean
  gov?: string
}
export interface CombinedScheduleRow {
  nodes: [string, string]
  spacing: number
  dl1: number; ll1: number; dl2: number; ll2: number
  design: CombinedFootingResult
  ok: boolean
}
export interface SlabScheduleRow {
  plate: string
  lx: number; ly: number
  design: SlabDesignResult
  ok: boolean
}
export interface WallScheduleRow {
  id: string
  member: string
  lw: number; hw: number; thickness: number
  Vu: number
  design: ShearWallResult
  ok: boolean
  gov?: string
}
/** Per-support footing choice: isolated (default) or combined with another node. */
export type FootingPlan = Record<string, { type: 'isolated' } | { type: 'combined'; with: string }>

// ── Steel schedule rows (AISC 360-16 LRFD) ──────────────────────────────────
/** A member the pipeline could NOT design-check (e.g. a steel beam whose shape
 *  family has no §F2 flexure path). Surfaced instead of silently skipped: any
 *  unchecked member fails designOK — a green result must mean "all checked". */
export interface UncheckedMember { id: string; role: string; shape: string; reason: string }

export interface SteelBeamScheduleRow {
  id: string; role: string; L: number; shape: string
  Mu: number; Vu: number          // kN·m, kN
  phiMn: number; phiVn: number     // kN·m, kN
  ltbZone: string
  utilM: number; utilV: number
  /** Estimated midspan deflection (SS bound, 5Mu L²/48EI) and L/240 limit (mm).
   *  Conservative: uses factored Mu and simply-supported boundary conditions. */
  defl: number; deflLim: number; deflOK: boolean
  ok: boolean
  gov?: string
  // solution detail (section props + AISC check steps)
  d: number; bf: number; tf: number; tw: number
  Ix: number; Sx: number; Zx: number; Iy: number; ry: number
  Mp: number; Lp: number; Lr: number; Lb: number; Mn: number
  compact: boolean; compactFlange: boolean; compactWeb: boolean
  lambdaF: number; lambdaPF: number; lambdaW: number; lambdaPW: number
  Aw: number; Cv1: number; phiV: number; hwTw: number
}
export interface SteelColumnScheduleRow {
  id: string; L: number; shape: string
  Pu: number; Mu: number
  phiPn: number; phiMn: number
  slenderness: number
  ratio: number; equation: string  // §H1-1
  ok: boolean
  gov?: string
  // solution detail
  d: number; bf: number; tf: number; tw: number; A: number; rx: number; ry: number
  Fcr: number; Fe: number
  slendernessX: number; slendernessY: number
}
export interface BasePlateScheduleRow {
  node: string; shape: string
  Pu: number; Tu: number
  design: BasePlateResult
  tAdopt: number                   // adopted plate thickness, mm
  ok: boolean
}

// ── Timber schedule rows (NDS §3 / NSCP §6, LRFD via Appendix N) ─────────────
export interface WoodBeamScheduleRow {
  id: string; role: string; L: number
  species: string; kind: string; b: number; d: number
  Mu: number; Vu: number           // kN·m, kN (factored demand)
  fb: number; FbPrime: number; CL: number   // MPa
  fv: number; FvPrime: number      // MPa
  utilM: number; utilV: number
  ok: boolean
  gov?: string
}
export interface WoodColumnScheduleRow {
  id: string; L: number
  species: string; kind: string; b: number; d: number
  Pu: number; Mu: number           // kN, kN·m
  fc: number; FcPrime: number; CP: number; slenderness: number   // MPa
  ratio: number                    // governing (axial or §3.9.2 interaction)
  ok: boolean
  gov?: string
}

/** Prestressed member check (sections with RectSection.ps): the pipeline
 *  back-derives equivalent UDLs from the D-only / L-only midspan sagging
 *  moments (w = 8M/L², self-weight excluded from SDL) and runs the full
 *  prestressedBeam engine — a simple-span GRAVITY idealisation of the member. */
export interface PrestressedScheduleRow {
  id: string; L: number
  design: PrestressedResult
  ok: boolean
}

export interface StructureDesign {
  govName: string
  cases: string[]   // every load case (combo × direction) run for the envelope
  beams: BeamScheduleRow[]
  /** Members whose section carries prestressing (RectSection.ps). */
  prestressed: PrestressedScheduleRow[]
  columns: ColumnScheduleRow[]
  steelBeams: SteelBeamScheduleRow[]
  steelColumns: SteelColumnScheduleRow[]
  /** Timber beams/girders and columns (NDS §3 / NSCP §6, LRFD Appendix N). */
  woodBeams: WoodBeamScheduleRow[]
  woodColumns: WoodColumnScheduleRow[]
  basePlates: BasePlateScheduleRow[]
  joints: SteelJoint[]               // beam-to-column connections (steel frames only)
  /** Beam-to-beam fin plates: beams framing into a girder web (steel only). */
  beamJoints: BeamBeamJoint[]
  slabs: SlabScheduleRow[]
  walls: WallScheduleRow[]
  footings: FootingScheduleRow[]
  combined: CombinedScheduleRow[]
  /** Strong-column/weak-beam joint checks (NSCP §418.7.3.2); only populated for
   *  a Special Moment Frame (`seismicSystem: 'smf'`), empty otherwise. */
  scwb: SCWBJointRow[]
  totals: { concreteMembers: number; concreteSlabs: number; concrete: number; steelKg: number; woodVolume: number }
  orphanEdges: number
  /** Members no design path could check (unsupported shape family). Non-empty ⇒ designOK is false. */
  unchecked: UncheckedMember[]
  /** Load-case runs whose P-Δ iteration failed to converge (singular tangent or
   *  residual above tol) — the forces from those runs are not trustworthy.
   *  Non-empty ⇒ designOK is false. Empty for first-order analyses. */
  pDeltaIssues: string[]
}

/** Every check the pipeline runs must pass — members, foundations, slabs
 *  (DDM + §408.3.1.2 + §424.2 deflection), shear walls, steel joints and the
 *  §418.7.3.2 strong-column/weak-beam hierarchy. Nothing green is unchecked. */
export function designOK(d: StructureDesign): boolean {
  return d.beams.every((b) => b.ok) && d.prestressed.every((p) => p.ok) && d.columns.every((c) => c.ok)
    && d.steelBeams.every((b) => b.ok) && d.steelColumns.every((c) => c.ok)
    && d.woodBeams.every((b) => b.ok) && d.woodColumns.every((c) => c.ok)
    && d.basePlates.every((p) => p.ok)
    && d.footings.every((f) => f.ok) && d.combined.every((c) => c.ok)
    && d.slabs.every((s) => s.ok) && d.walls.every((w) => w.ok)
    && d.joints.every((j) => j.ok) && d.beamJoints.every((j) => j.ok) && d.scwb.every((j) => j.ok)
    && d.unchecked.length === 0
    && d.pDeltaIssues.length === 0
}

// ── Steel member design (reuses steelDesign engine) ──────────────────────────
/** Design a steel beam/girder from a member result. Lb defaults to the full
 *  member length (conservative; the slab braces the top flange for sagging but
 *  support hogging puts the bottom flange in compression). Pass `lbOverride`
 *  (m) to use the real brace spacing for §F2 lateral-torsional buckling. */
function designSteelBeamRow(
  mr: F3MemberResult, role: string, sec: RectSection, lbOverride?: number,
): SteelBeamScheduleRow | null {
  const shape = sec.shape ? shapeByName(sec.shape) : undefined
  if (!shape || (shape.family !== 'W' && shape.family !== 'WT')) return null
  const Fy = sec.steelFy ?? 248
  const p = deriveWSection(shape)
  const Lb = (lbOverride && lbOverride > 0 ? lbOverride : mr.L) * 1000
  const flex = beamFlexure(shape, p, Fy, Lb, 1.0)
  const shear = beamShear(shape, p, Fy)
  const Mu = mr.Mmax, Vu = mr.Vmax
  const utilM = flex.phiMn > 1e-9 ? Mu / flex.phiMn : Infinity
  const utilV = shear.phiVn > 1e-9 ? Vu / shear.phiVn : Infinity
  // §L2 serviceability — conservative SS bound: δ = 5·Mu·L²/(48·E·Ix)
  // Uses factored Mu (overestimates service deflection ~1.3–1.5×) against L/240
  // (total-load limit), so net conservatism is acceptable for optimization.
  const E_STEEL = 200000  // N/mm²
  const L_mm = mr.L * 1000
  const defl = p.Ix > 0 ? (5 * Mu * 1e6 * L_mm ** 2) / (48 * E_STEEL * p.Ix) : Infinity
  const deflLim = L_mm / 240
  const deflOK = defl <= deflLim + 1e-9
  const { d = 0, bf = 0, tf = 0, tw = 0, ry } = shape
  return {
    id: mr.id, role, L: mr.L, shape: shape.name, Mu, Vu,
    phiMn: flex.phiMn, phiVn: shear.phiVn, ltbZone: flex.ltbZone,
    utilM, utilV, defl, deflLim, deflOK,
    ok: utilM <= 1 + 1e-9 && utilV <= 1 + 1e-9 && deflOK,
    d, bf: bf ?? 0, tf: tf ?? 0, tw: tw ?? 0,
    Ix: p.Ix, Sx: p.Sx, Zx: p.Zx, Iy: p.Iy, ry,
    Mp: flex.Mp, Lp: flex.Lp, Lr: flex.Lr, Lb, Mn: flex.Mn,
    compact: flex.compact, compactFlange: flex.compactFlange, compactWeb: flex.compactWeb,
    lambdaF: flex.lambdaF, lambdaPF: flex.lambdaPF, lambdaW: flex.lambdaW, lambdaPW: flex.lambdaPW,
    Aw: shear.Aw, Cv1: shear.Cv1, phiV: shear.phiV, hwTw: shear.hwTw,
  }
}

/** Design a steel column from a member result (§E3 axial + §H1-1 combined). */
function designSteelColumnRow(mr: F3MemberResult, sec: RectSection): SteelColumnScheduleRow | null {
  const shape = sec.shape ? shapeByName(sec.shape) : undefined
  if (!shape) return null
  const Fy = sec.steelFy ?? 248
  const Pu = Math.max(0, -Math.min(...mr.N))   // compression (N < 0)
  const Mu = mr.Mmax
  const axial = columnAxial(shape, Fy, mr.L, 1.0, 1.0)
  let phiMn = Infinity
  if (shape.family === 'W' || shape.family === 'WT') {
    phiMn = beamFlexure(shape, deriveWSection(shape), Fy, mr.L * 1000, 1.0).phiMn
  }
  const comb = combinedLoading(Pu, axial.phiPn, Mu, phiMn)
  const E_STEEL = 200000
  const Fe = axial.slenderness > 0 ? (Math.PI ** 2 * E_STEEL) / axial.slenderness ** 2 : Infinity
  const { d = 0, bf = 0, tf = 0, tw = 0, A, rx, ry } = shape
  return {
    id: mr.id, L: mr.L, shape: shape.name, Pu, Mu,
    phiPn: axial.phiPn, phiMn: Number.isFinite(phiMn) ? phiMn : 0,
    slenderness: axial.slenderness, ratio: comb.ratio, equation: comb.equation,
    ok: comb.ok && axial.slenderOK,
    d, bf: bf ?? 0, tf: tf ?? 0, tw: tw ?? 0, A, rx, ry,
    Fcr: axial.Fcr, Fe,
    slendernessX: axial.slendernessX, slendernessY: axial.slendernessY,
  }
}

const beamOK = (d: BeamDesignResult) =>
  d.flexOK && d.comprEffective && d.comprNAOK && d.region !== 'inadequate'

// ── Timber member design (NDS §3 / NSCP §6, LRFD via Appendix N) ─────────────
/** NDS Appendix N time-effect factor λ from the governing LRFD combo name:
 *  wind/seismic combos (1.0W/1.0E) → 1.0; the 1.4D dead-only combo → 0.6;
 *  everything else (gravity D + L) → 0.8. A conservative name-based mapping. */
function timeEffectFactor(comboName: string): number {
  if (/1\.0E|1\.0W/.test(comboName)) return 1.0
  if (/^1\.4D/.test(comboName)) return 0.6
  return 0.8
}

/** Design a timber beam/girder from a member result. lu (m) is the unbraced
 *  compression-edge length for §3.3.3 CL — falls back to the member length. */
function designWoodBeamRow(
  mr: F3MemberResult, role: string, sec: RectSection, lambda: number, lu?: number,
): WoodBeamScheduleRow | null {
  const ref = woodRefOf(sec)
  if (!ref) return null
  const kind = sec.woodKind === 'glulam' ? 'glulam' : 'sawn'
  const r = checkWoodBeam({
    ref, kind, b: sec.b, d: sec.h, length: mr.L * 1000,
    M: mr.Mmax, V: mr.Vmax, lu: lu && lu > 0 ? lu * 1000 : undefined,
    opts: { method: 'LRFD', lambda, wet: sec.woodWet },
  })
  return {
    id: mr.id, role, L: mr.L, species: sec.woodSpecies ?? '', kind, b: sec.b, d: sec.h,
    Mu: mr.Mmax, Vu: mr.Vmax, fb: r.fb, FbPrime: r.FbPrime, CL: r.CL,
    fv: r.fv, FvPrime: r.FvPrime, utilM: r.bendingRatio, utilV: r.shearRatio, ok: r.ok,
  }
}

/** Design a timber column from a member result: axial (governing-plane CP) +
 *  §3.9.2 beam-column interaction with the peak bending. */
function designWoodColumnRow(mr: F3MemberResult, sec: RectSection, lambda: number): WoodColumnScheduleRow | null {
  const ref = woodRefOf(sec)
  if (!ref) return null
  const kind = sec.woodKind === 'glulam' ? 'glulam' : 'sawn'
  const Pu = Math.max(0, -Math.min(...mr.N))   // compression (N < 0)
  const r = checkWoodColumn({
    ref, kind, b: sec.b, d: sec.h, length: mr.L * 1000,
    P: Pu, Mx: mr.Mmax, opts: { method: 'LRFD', lambda, wet: sec.woodWet },
  })
  return {
    id: mr.id, L: mr.L, species: sec.woodSpecies ?? '', kind, b: sec.b, d: sec.h,
    Pu, Mu: mr.Mmax, fc: r.fc, FcPrime: r.FcPrime, CP: r.CP, slenderness: r.slenderness,
    ratio: r.ratio, ok: r.ok,
  }
}

/** Critical sections of a frame member: the two ends (which carry the hogging
 *  moments, top steel) plus the interior SAGGING peak — the most positive Mz
 *  strictly inside (bottom steel). Using the signed peak rather than |Mz| keeps
 *  the midspan section from latching onto a near-support hogging point. */
function memberSections(mr: F3MemberResult): { label: string; x: number; Mu: number; Vu: number }[] {
  const out: { label: string; x: number; Mu: number; Vu: number }[] = []
  const n = mr.xs.length - 1
  out.push({ label: 'End i', x: 0, Mu: mr.Mz[0], Vu: Math.abs(mr.Vy[0]) })
  out.push({ label: 'End j', x: mr.L, Mu: mr.Mz[n], Vu: Math.abs(mr.Vy[n]) })
  // interior sagging peak: most positive Mz strictly inside the span
  let best = -1, bestM = -Infinity
  for (let k = 1; k < n; k++) {
    if (mr.Mz[k] > bestM) { bestM = mr.Mz[k]; best = k }
  }
  if (best > 0 && mr.xs[best] > 0.02 * mr.L && mr.xs[best] < 0.98 * mr.L) {
    out.push({ label: `Interior (x = ${mr.xs[best].toFixed(2)} m)`, x: mr.xs[best], Mu: bestM, Vu: Math.abs(mr.Vy[best]) })
  }
  return out
}

/** Effective flange for a beam that carries slab panels (T-beam action):
 *  panels adjoin when both member end nodes are among the plate corners.
 *  hf = thinnest adjoining slab; sw = clear web-to-web distance approximated
 *  by the panel width across the beam; interior with 2 panels, edge with 1. */
function memberFlange(model: StructuralModel, m: Member, L: number): { bf: number; hf: number } | null {
  const sec = model.sections.find((x) => x.id === m.section)
  if (!sec || sec.material === 'steel') return null
  const pos = new Map(model.nodes.map((n) => [n.id, n]))
  const panels = model.plates.filter((p) => p.role !== 'wall' && p.corners.includes(m.i) && p.corners.includes(m.j))
  if (!panels.length) return null
  const hf = Math.min(...panels.map((p) => p.thickness))
  const a = pos.get(m.i), b = pos.get(m.j)
  if (!a || !b) return null
  const across = (p: (typeof model.plates)[number]) => Math.max(...p.corners
    .filter((cid) => cid !== m.i && cid !== m.j)
    .map((cid) => {
      const n = pos.get(cid)!
      const dx = b.x - a.x, dz = b.z - a.z
      const len = Math.hypot(dx, dz) || 1
      return Math.abs(((n.x - a.x) * dz - (n.z - a.z) * dx) / len)
    }))
  const swM = Math.max(0.1, Math.min(...panels.map(across)) - sec.b / 1000)
  const { bf } = effectiveFlange({
    kind: panels.length >= 2 ? 'interior' : 'edge',
    bw: sec.b, h: sec.h, hf, ln: L, sw: swM,
    cover: sec.cover, stirrupDia: sec.tieDia, barDia: sec.barDia,
    fc: sec.fc, fy: sec.fy, Mu: 0,
  })
  return { bf, hf }
}

/** Design one beam/girder member from a single run's member result. */
function designBeamRow(
  mr: F3MemberResult, role: string, sec: RectSection, support: BeamSupport = 'both-ends',
  flange?: { bf: number; hf: number }, system: 'gravity' | 'imf' | 'smf' = 'gravity',
): BeamScheduleRow {
  // Transverse stirrup-leg spacing limit hx (§418.6.4.3): 350 mm for seismic
  // frame beams, ~600 mm good-practice for gravity.
  const legSpacingLimit = system === 'smf' || system === 'imf' ? 350 : 600
  const sections: BeamSectionDesign[] = memberSections(mr)
    .filter((s) => Math.abs(s.Mu) > 1e-6 || s.Vu > 1e-6)
    .map((s) => {
      const base = {
        b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia,
        comprBarDia: 16, stirrupDia: sec.tieDia,
        fc: sec.fc, fy: sec.fy, Mu: Math.abs(s.Mu), Vu: s.Vu, legSpacingLimit,
      }
      const rect = designBeam(base)
      // T-beam action (§6.3.2): sagging compression lives in the slab, so the
      // section may design as a rectangle b = bf — adopted only when the block
      // stays inside the flange (a ≤ hf) AND it actually saves steel
      // (designBeam's ρmin scales with b, so a min-governed wide-flange result
      // would be spurious, not a benefit).
      if (flange && s.Mu > 0) {
        const rT = designBeam({ ...base, b: flange.bf, bMin: sec.b })
        const aT = (rT.As * sec.fy) / (0.85 * sec.fc * flange.bf)
        if (aT <= flange.hf + 1e-9 && rT.As <= rect.As + 1e-6) {
          return { label: s.label, x: s.x, Mu: s.Mu, Vu: s.Vu, hogging: false, design: rT, bf: flange.bf, hf: flange.hf }
        }
      }
      return { label: s.label, x: s.x, Mu: s.Mu, Vu: s.Vu, hogging: s.Mu < 0, design: rect }
    })
  // Table 409.3.1.1 minimum thickness (deemed-to-comply — deflections need not
  // be computed when h ≥ hMin). Steel beams check L/240 explicitly; this is the
  // RC counterpart so the optimizer cannot trim a long span into a springboard.
  const hMin = minBeamThickness(mr.L, support, sec.fy)
  const thickOK = sec.h >= hMin - 1e-9
  return {
    id: mr.id, role, L: mr.L, sections, support, hMin, thickOK,
    ok: sections.every((s) => beamOK(s.design)) && thickOK,
    diag: { xs: mr.xs, Vy: mr.Vy, Mz: mr.Mz },
  }
}

/** Column capacity for a given section and a known factored P/M demand (no frame
 *  solve — bar diameter does not change demands, so this is reused for bar trials). */
function designColumnFromPM(
  sec: RectSection, Pu: number, Mu: number,
  system: 'gravity' | 'imf' | 'smf' = 'gravity', columnLength?: number,
  layout: BarLayout = 'two-face',
) {
  const ax = designAxialColumn({
    shape: 'tied', b: sec.b, h: sec.h, cover: sec.cover,
    barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, Pu,
    system, columnLength,
  })
  let phiPn = ax.phiPnMax
  const e = Pu > 1e-9 ? Mu / Pu : 0
  if (e > 1e-4) {
    const cap = capacityAtEccentricity(
      { b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, numBars: ax.bars, layout },
      e,
    )
    const inter = interaction({ b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, numBars: ax.bars, layout })
    phiPn = Math.min(cap.phi * cap.Pn, 0.65 * inter.PnMax)
  }
  const util = phiPn > 1e-9 ? Pu / phiPn : Infinity
  return {
    e, bars: ax.bars, Ast: ax.Ast, phiPn, util,
    tieSpacing: ax.tieSpacing,
    tieSpacingFinal: ax.tieSpacingFinal,
    tieSpacingLabel: ax.tieSpacingLabel,
    seismicLoZone: ax.seismicLoZone,
    seismicSConf: ax.seismicSConf,
    seismicSOut: ax.seismicSOut,
    ok: util <= 1 + 1e-9 && ax.rhoOK,
  }
}

/** Design one column from a single run's member result. */
function designColumnRow(
  mr: F3MemberResult, sec: RectSection,
  system: 'gravity' | 'imf' | 'smf' = 'gravity',
  layout: BarLayout = 'two-face',
): ColumnScheduleRow {
  const Pu = Math.max(0, -Math.min(...mr.N))           // compression (N < 0)
  const Mu = mr.Mmax
  const r = designColumnFromPM(sec, Pu, Mu, system, mr.L * 1000, layout)   // L m → mm
  return {
    id: mr.id, L: mr.L, Pu, Mu, e: r.e, bars: r.bars, phiPn: r.phiPn, util: r.util, layout,
    tieSpacing: r.tieSpacing,
    tieSpacingFinal: r.tieSpacingFinal,
    tieSpacingLabel: r.tieSpacingLabel,
    seismicLoZone: r.seismicLoZone,
    seismicSConf: r.seismicSConf,
    seismicSOut: r.seismicSOut,
    ok: r.ok,
  }
}

const beamSeverity = (r: BeamScheduleRow) =>
  (r.ok ? 0 : 1e9) + Math.max(0, ...r.sections.map((s) => Math.abs(s.Mu)))

interface FrameRun { name: string; result: F3Result }

/** Default directional lateral cases derived from the model's category-E/W node
 *  loads. Seismic and wind forces act in BOTH senses along each axis (NSCP 2015
 *  §208.5.1.1 E is reversible; §207A.8 wind on each principal axis), so each
 *  auto-derived case gets a reversed-sign companion — without it 0.9D + 1.0E/W
 *  never sees uplift/moment reversal and the envelope is one-sided. A
 *  caller-supplied opts.lateral list is used verbatim: the caller owns its own
 *  ± directions (the UI already generates +X/−X/+Z/−Z). */
function defaultLateralCases(model: StructuralModel): LateralCase[] {
  const neg = (l: ModelLoad): ModelLoad => l.kind === 'node'
    ? { ...l, Fx: -(l.Fx ?? 0), Fy: -(l.Fy ?? 0), Fz: -(l.Fz ?? 0) }
    : l
  const out: LateralCase[] = []
  const eL = model.loads.filter((l) => l.kind === 'node' && l.cat === 'E')
  const wL = model.loads.filter((l) => l.kind === 'node' && l.cat === 'W')
  if (eL.length) out.push({ name: 'E+', kind: 'E', loads: eL }, { name: 'E-', kind: 'E', loads: eL.map(neg) })
  if (wL.length) out.push({ name: 'W+', kind: 'W', loads: wL }, { name: 'W-', kind: 'W', loads: wL.map(neg) })
  return out
}

/** §208.4.1 vertical seismic component: E = ρ·Eh + Ev with Ev = 0.5·Ca·I·D for
 *  strength design. Folded into the E-carrying combos as a dead-load factor
 *  shift — +Ev on the additive combo (D ≥ 1.0), −Ev on the counteracting 0.9D
 *  uplift combo — with the effective factor spelled out in the combo name. */
export function withEv(combos: Combo[], Ev?: number): Combo[] {
  if (!Ev) return combos
  return combos.map((c) => {
    const D = c.f.D ?? 0
    if (!(c.f.E ?? 0) || D === 0) return c
    const newD = D >= 1.0 ? D + Ev : D - Ev
    return { name: c.name.replace(`${D}D`, `${newD.toFixed(2)}D`), f: { ...c.f, D: newD } }
  })
}

/** Expand every NSCP combination into its directional variants (once per
 *  lateral E/W case when the combination carries that factor). Shared by the
 *  serial and FramePool run builders. */
function buildComboTasks(lateral: LateralCase[], opts: AnalyzeOptions): { name: string; combo: Combo; lat: F3Load[] }[] {
  const toF3 = (l: ModelLoad): F3Load =>
    ({ kind: 'node', node: (l as { node: string }).node, Fx: (l as { Fx?: number }).Fx, Fy: (l as { Fy?: number }).Fy, Fz: (l as { Fz?: number }).Fz, cat: l.cat })
  const eCases = lateral.filter((c) => c.kind === 'E')
  const wCases = lateral.filter((c) => c.kind === 'W')
  const tasks: { name: string; combo: Combo; lat: F3Load[] }[] = []
  for (const combo of withEv(nscpCombos(opts.f1 ?? 1.0), opts.Ev)) {
    const hasE = (combo.f.E ?? 0) !== 0
    const hasW = (combo.f.W ?? 0) !== 0
    const variants: { tag: string; lat: F3Load[] }[] =
      hasE && eCases.length ? eCases.map((c) => ({ tag: c.name, lat: c.loads.map(toF3) }))
        : hasW && wCases.length ? wCases.map((c) => ({ tag: c.name, lat: c.loads.map(toF3) }))
          : [{ tag: '', lat: [] }]
    for (const v of variants) tasks.push({ name: combo.name + (v.tag ? ` · ${v.tag}` : ''), combo, lat: v.lat })
  }
  return tasks
}

/** Build the load cases to envelope: every NSCP combination, expanded once per
 *  directional lateral case (E/W) when the combination carries that factor. */
function buildRuns(model: StructuralModel, opts: AnalyzeOptions, onProgress?: ProgressFn) {
  // gravity (everything except lateral E/W) is bridged once — includes the
  // slab tributary line loads and member self-weight; lateral cases are pure
  // node loads applied on top per direction.
  const gravityModel = { ...model, loads: model.loads.filter((l) => l.cat !== 'E' && l.cat !== 'W') }
  const br = modelToFrame3D(gravityModel, { useShells: false, crackedSections: opts.crackedSections, shearDeformation: opts.shearDeformation })

  const lateral = opts.lateral?.length ? opts.lateral : defaultLateralCases(model)
  // expand every combo into its directional variants up front so progress has a total
  const tasks = buildComboTasks(lateral, opts)

  const precomp = precomputeFrame(br.nodes, br.members, br.supports)
  const runs: FrameRun[] = []
  tasks.forEach((t, i) => {
    onProgress?.({ phase: 'Solving load cases', current: i + 1, total: tasks.length, detail: t.name })
    const factored = applyF3Combo([...br.loads, ...t.lat], t.combo.f)
    if (!factored.length) return
    const result = solveWithGeometry(precomp, factored, opts)
    if (result) runs.push({ name: t.name, result })
  })
  return { br, runs, precomp }
}

/** All member/footing/slab design given pre-solved FEM results. Shared by the
 *  synchronous and async paths to avoid code duplication. */
function designFromRuns(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan, opts: AnalyzeOptions,
  br: BridgeResult, runs: FrameRun[],
  serviceRes: F3Result | null, dRes: F3Result | null, lRes: F3Result | null,
  onProgress?: ProgressFn,
): StructureDesign | null {
  if (runs.length === 0) return null
  const fallbackSec: RectSection = model.sections[0]
    ?? { id: '', name: '', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memSec = new Map(model.members.map((m) => [m.id, secById.get(m.section) ?? fallbackSec]))
  const secOf = (id: string) => memSec.get(id) ?? fallbackSec
  const colAtNode = (node: string) => model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
  const footSec = (node: string) => { const c = colAtNode(node); return c ? secOf(c.id) : fallbackSec }

  // headline governing run = largest overall bending response
  let govIdx = 0
  runs.forEach((r, i) => { if (r.result.Mmax > runs[govIdx].result.Mmax) govIdx = i })

  const serviceAt = (node: string) => {
    const i = serviceRes?.reactions.findIndex((r) => r.node === node) ?? -1
    return i >= 0 ? Math.max(0, serviceRes!.reactions[i].F[1]) : 0
  }
  const reactAt = (res: F3Result | null, node: string) => {
    const i = res?.reactions.findIndex((r) => r.node === node) ?? -1
    return i >= 0 ? Math.max(0, res!.reactions[i].F[1]) : 0
  }
  const dAt = new Map<string, number>()
  const lAt = new Map<string, number>()
  for (const r of runs[govIdx].result.reactions) {
    dAt.set(r.node, reactAt(dRes, r.node))
    lAt.set(r.node, reactAt(lRes, r.node))
  }

  const roleOf = new Map(model.members.map((m) => [m.id, m.role]))
  const memberOf = (run: FrameRun, id: string) => run.result.members.find((m) => m.id === id)

  // NSCP Table 409.3.1.1 span type from joint connectivity: an end with nothing
  // beyond the beam itself (no other member, no support) is a cantilever tip;
  // an end whose joint continues into a column or another flexural member is
  // continuous; an end held only by a support (e.g. a pin) is discontinuous.
  const memsAtNode = new Map<string, typeof model.members>()
  for (const mm of model.members)
    for (const n of [mm.i, mm.j]) {
      const list = memsAtNode.get(n); if (list) list.push(mm); else memsAtNode.set(n, [mm])
    }
  const supportedNodes = new Set(model.supports.map((s) => s.node))
  const spanTypeOf = (mm: (typeof model.members)[number]): BeamSupport => {
    const others = (n: string) => (memsAtNode.get(n) ?? []).filter((o) => o.id !== mm.id)
    const held = (n: string) => others(n).length > 0 || supportedNodes.has(n)
    if (!held(mm.i) || !held(mm.j)) return 'cantilever'
    const cont = (n: string) => others(n).some((o) => o.role === 'column' || o.role === 'beam' || o.role === 'girder')
    const ci = cont(mm.i), cj = cont(mm.j)
    return ci && cj ? 'both-ends' : ci || cj ? 'one-end' : 'simple'
  }

  // ── Beams & girders — per-member worst case across all runs ──
  const totalMems = model.members.length
  let memDone = 0
  const beams: BeamScheduleRow[] = []
  const prestressed: PrestressedScheduleRow[] = []
  const columns: ColumnScheduleRow[] = []
  const steelBeams: SteelBeamScheduleRow[] = []
  const steelColumns: SteelColumnScheduleRow[] = []
  const woodBeams: WoodBeamScheduleRow[] = []
  const woodColumns: WoodColumnScheduleRow[] = []
  const unchecked: UncheckedMember[] = []
  for (const m of model.members) {
    const role = roleOf.get(m.id)
    const sec = secOf(m.id)
    const isSteel = sec.material === 'steel'
    const isWood = sec.material === 'wood'
    const roleLabel = role === 'beam' ? 'beam' : role === 'girder' ? 'girder' : role === 'column' ? 'column' : role ?? ''
    onProgress?.({ phase: 'Designing members', current: ++memDone, total: totalMems, detail: `${m.id} (${roleLabel} ${sec.b}×${sec.h})` })
    if (role === 'beam' || role === 'girder') {
      if (isSteel) {
        let best: SteelBeamScheduleRow | null = null, bestSev = -1, gov = ''
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designSteelBeamRow(mr, role, sec, m.Lb); if (!row) continue
          const sev = (row.ok ? 0 : 1e9) + row.Mu
          if (sev > bestSev) { bestSev = sev; best = row; gov = run.name }
        }
        if (best) steelBeams.push({ ...best, gov })
        // designSteelBeamRow covers W/WT only (§F2 doubly-symmetric / tee flexure).
        // A C/L/HSS beam would otherwise vanish from the schedule and read as "OK".
        else unchecked.push({
          id: m.id, role, shape: sec.shape ?? '(no shape)',
          reason: 'steel beam flexure covers W/WT shapes only — use a W/WT here or check this member separately',
        })
      } else if (isWood) {
        let best: WoodBeamScheduleRow | null = null, bestSev = -1, gov = ''
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designWoodBeamRow(mr, role, sec, timeEffectFactor(run.name), m.Lb); if (!row) continue
          const sev = (row.ok ? 0 : 1e9) + row.Mu
          if (sev > bestSev) { bestSev = sev; best = row; gov = run.name }
        }
        if (best) woodBeams.push({ ...best, gov })
        else unchecked.push({
          id: m.id, role, shape: sec.woodSpecies ?? '(no species)',
          reason: 'timber section has no resolved species — set a WOOD_SPECIES grade for this member',
        })
      } else {
        let best: BeamScheduleRow | null = null, bestSev = -1, gov = ''
        const support = spanTypeOf(m)
        const flange = opts.tBeamAction ? (() => {
          const ni = model.nodes.find((n) => n.id === m.i), nj = model.nodes.find((n) => n.id === m.j)
          return ni && nj ? memberFlange(model, m, Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z)) : null
        })() : null
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designBeamRow(mr, role, sec, support, flange ?? undefined, opts.seismicSystem ?? 'gravity')
          if (row.sections.length === 0) continue
          const sev = beamSeverity(row)
          if (sev > bestSev) { bestSev = sev; best = row; gov = run.name }
        }
        if (best) beams.push({ ...best, gov })
        // prestressed check (section tagged with ps): equivalent UDLs from the
        // D-only / L-only sagging peaks — simple-span gravity idealisation
        if (sec.ps && best) {
          const L = best.L
          const sag = (res: F3Result | null) => {
            if (!res) return 0
            const mr = res.members.find((x) => x.id === m.id)
            return mr ? Math.max(0, ...mr.Mz) : 0
          }
          const wSW = ((sec.b * sec.h) / 1e6) * 24
          const wD = Math.max(0, (8 * sag(dRes)) / (L * L) - wSW)
          const wL = (8 * sag(lRes)) / (L * L)
          const design = designPrestressed({
            b: sec.b, h: sec.h, span: L, fc: sec.fc, fci: sec.ps.fci,
            Aps: sec.ps.Aps, fpu: sec.ps.fpu, e: sec.ps.e, wSDL: wD, wLL: wL,
          })
          prestressed.push({ id: m.id, L, design, ok: design.ok })
        }
      }
    } else if (role === 'column') {
      if (isSteel) {
        let best: SteelColumnScheduleRow | null = null, bestRatio = -1, gov = ''
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designSteelColumnRow(mr, sec); if (!row) continue
          if (row.ratio > bestRatio) { bestRatio = row.ratio; best = row; gov = run.name }
        }
        if (best) steelColumns.push({ ...best, gov })
        // designSteelColumnRow bails only on an unresolvable shape name
        else unchecked.push({
          id: m.id, role, shape: sec.shape ?? '(no shape)',
          reason: 'shape not found in the AISC library — column axial/§H1-1 check skipped',
        })
      } else if (isWood) {
        let best: WoodColumnScheduleRow | null = null, bestRatio = -1, gov = ''
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designWoodColumnRow(mr, sec, timeEffectFactor(run.name)); if (!row) continue
          if (row.ratio > bestRatio) { bestRatio = row.ratio; best = row; gov = run.name }
        }
        if (best) woodColumns.push({ ...best, gov })
        else unchecked.push({
          id: m.id, role: role ?? 'column', shape: sec.woodSpecies ?? '(no species)',
          reason: 'timber section has no resolved species — set a WOOD_SPECIES grade for this member',
        })
      } else {
        let best: ColumnScheduleRow | null = null, bestUtil = -1, gov = ''
        const sysOpts = opts.seismicSystem ?? 'gravity'
        for (const run of runs) {
          const mr = memberOf(run, m.id); if (!mr) continue
          const row = designColumnRow(mr, sec, sysOpts, opts.colLayout ?? 'two-face')
          if (row.util > bestUtil) { bestUtil = row.util; best = row; gov = run.name }
        }
        if (best) columns.push({ ...best, gov })
      }
    }
  }

  // ── Footings (base supports) — isolated by default, combined per plan ──
  onProgress?.({ phase: 'Designing footings & slabs' })
  const nodeXYZ = new Map(model.nodes.map((n) => [n.id, n]))
  const paired = new Set<string>()
  const combined: CombinedScheduleRow[] = []
  for (const [nodeA, choice] of Object.entries(plan)) {
    if (choice.type !== 'combined' || paired.has(nodeA) || paired.has(choice.with)) continue
    const nodeB = choice.with
    const a = nodeXYZ.get(nodeA), b2 = nodeXYZ.get(nodeB)
    if (!a || !b2) continue
    const spacing = Math.hypot(b2.x - a.x, b2.z - a.z)
    if (spacing < 1e-6) continue
    const fsA = footSec(nodeA), fsB = footSec(nodeB)
    const row: CombinedScheduleRow = {
      nodes: [nodeA, nodeB], spacing,
      dl1: dAt.get(nodeA) ?? 0, ll1: lAt.get(nodeA) ?? 0,
      dl2: dAt.get(nodeB) ?? 0, ll2: lAt.get(nodeB) ?? 0,
      design: designCombinedFooting({
        col1Width: Math.min(fsA.b, fsA.h), col2Width: Math.min(fsB.b, fsB.h), spacing,
        dl1: dAt.get(nodeA) ?? 0, ll1: lAt.get(nodeA) ?? 0,
        dl2: dAt.get(nodeB) ?? 0, ll2: lAt.get(nodeB) ?? 0,
        leftRestrict: false, rightRestrict: false, leftOverhang: 0, rightOverhang: 0,
        fc: fsA.fc, fy: fsA.fy, qAllow: soil.qAllow,
        gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc, surcharge: 0,
        H: soil.H, barDia: fsA.barDia, cover: 75,
      }),
      ok: false,
    }
    row.ok = row.design.qNet > 0 && row.design.Dc > 0
    combined.push(row)
    paired.add(nodeA); paired.add(nodeB)
  }

  const footings: FootingScheduleRow[] = []
  for (const ru of runs[govIdx].result.reactions) {
    if (paired.has(ru.node)) continue
    // envelope the factored axial reaction across all runs (a lateral combo may
    // load a base more than gravity); service load from the gravity solve.
    let Pu = 0, gov = ''
    for (const run of runs) {
      const p = reactAt(run.result, ru.node)
      if (p > Pu) { Pu = p; gov = run.name }
    }
    if (Pu < 1e-6) continue
    const P = Math.max(serviceAt(ru.node), Pu / 1.4)
    const fs = footSec(ru.node)
    const d = designSquareFooting({
      serviceLoad: P, ultimateLoad: Pu, columnWidth: Math.min(fs.b, fs.h),
      fc: fs.fc, fy: fs.fy, qAllow: soil.qAllow,
      gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc, H: soil.H,
      barDia: fs.barDia, cover: 75,
    })
    footings.push({ node: ru.node, P, Pu, design: d, ok: d.qNet > 0 && d.punchOK && d.beamOK, gov })
  }

  // ── Base plates (steel columns landing on a base support) ──
  const basePlates: BasePlateScheduleRow[] = []
  for (const ru of runs[govIdx].result.reactions) {
    const col = colAtNode(ru.node)
    const fs = col ? secOf(col.id) : undefined
    if (!col || !fs || fs.material !== 'steel') continue
    const shape = fs.shape ? shapeByName(fs.shape) : undefined
    if (!shape) continue
    // envelope factored compression (max) and net uplift (most tension) across runs
    let Pu = 0, Tu = 0
    for (const run of runs) {
      const i = run.result.reactions.findIndex((r) => r.node === ru.node)
      if (i < 0) continue
      const Fy = run.result.reactions[i].F[1]
      if (Fy > Pu) Pu = Fy
      if (-Fy > Tu) Tu = -Fy
    }
    if (Pu < 1e-6 && Tu < 1e-6) continue
    const design = designBasePlate({
      Pu, Tu, d: shape.d ?? Math.max(fs.b, fs.h), bf: shape.bf ?? Math.min(fs.b, fs.h),
      fc: fs.fc, Fy: fs.steelFy ?? 248,
    })
    const tAdopt = adoptPlateThickness(design.tReq)
    basePlates.push({ node: ru.node, shape: shape.name, Pu, Tu, design, tAdopt, ok: design.bearingOK && design.anchorOK })
  }

  // ── Concrete & steel totals ──
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  let concreteMembers = 0, steelKg = 0, woodVolume = 0
  for (const m of model.members) {
    const a = nm.get(m.i), b2 = nm.get(m.j)
    if (!a || !b2) continue
    const L = Math.hypot(b2.x - a.x, b2.y - a.y, b2.z - a.z)
    const s = secOf(m.id)
    if (s.material === 'steel') {
      const shape = s.shape ? shapeByName(s.shape) : undefined
      if (shape) steelKg += (shape.A / 1e6) * L * 7850   // A m² × L × ρ
    } else if (s.material === 'wood') {
      woodVolume += (s.b / 1000) * (s.h / 1000) * L       // m³ of timber
    } else {
      concreteMembers += (s.b / 1000) * (s.h / 1000) * L
    }
  }
  let concreteSlabs = 0
  for (const p of model.plates) {
    const c = p.corners.map((id) => nm.get(id))
    if (c.some((q) => !q)) continue
    const [c0, c1, , c3] = c as { x: number; y: number; z: number }[]
    const lx = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z)
    const lz = Math.hypot(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z)
    concreteSlabs += lx * lz * (p.thickness / 1000)
  }

  // ── Slabs — two-way Direct Design Method ──
  const xMin = Math.min(...model.nodes.map((n) => n.x)), xMax = Math.max(...model.nodes.map((n) => n.x))
  const zMin = Math.min(...model.nodes.map((n) => n.z)), zMax = Math.max(...model.nodes.map((n) => n.z))
  const slabs: SlabScheduleRow[] = []
  for (const p of model.plates) {
    if (p.role === 'wall') continue
    const c = p.corners.map((id) => nm.get(id)); if (c.some((q) => !q)) continue
    const cc = c as { x: number; y: number; z: number }[]
    const lx = Math.hypot(cc[1].x - cc[0].x, cc[1].z - cc[0].z)
    const lz = Math.hypot(cc[3].x - cc[0].x, cc[3].z - cc[0].z)
    if (!(lx > 0 && lz > 0)) continue
    const areaD = model.loads.filter((l) => l.kind === 'area' && l.plate === p.id && l.cat === 'D').reduce((s, l) => s + (l as { q: number }).q, 0)
    const areaL = model.loads.filter((l) => l.kind === 'area' && l.plate === p.id && l.cat === 'L').reduce((s, l) => s + (l as { q: number }).q, 0)
    if (areaD + areaL < 1e-9) continue
    const cs = footSec(p.corners[0])
    const extX = cc.some((q) => Math.abs(q.x - xMin) < 1e-4) || cc.some((q) => Math.abs(q.x - xMax) < 1e-4)
    const extZ = cc.some((q) => Math.abs(q.z - zMin) < 1e-4) || cc.some((q) => Math.abs(q.z - zMax) < 1e-4)
    const design = designSlabDDM({
      lx, ly: lz, colWidth: Math.min(cs.b, cs.h), D: areaD, L: areaL,
      fc: cs.fc, fy: cs.fy, h: p.thickness, cover: 20, barDia: 12,
      exterior: { x: extX, y: extZ }, withBeams: true,
    })
    // Pass = §408.3.1.2 minimum thickness AND §424.2 immediate-live + long-term
    // deflection. DDM inapplicability (one-way panel, L > 2D) stays a schedule
    // note — the strips are still detailed conservatively — so it does not
    // dead-end the optimizer; serviceability violations DO fail the design.
    slabs.push({
      plate: p.id, lx, ly: lz, design,
      ok: design.h >= design.hmin - 1e-9
        && design.deflection.liveOK && design.deflection.totalOK,
    })
  }

  // ── Shear walls — in-plane reinforcement ──
  // The bridge models each shear wall as an X of two diagonal struts
  // (wallstrut_<id>_1/2). The panel's in-plane shear is the horizontal
  // projection of the two strut axial forces, enveloped across all runs.
  const walls: WallScheduleRow[] = []
  for (const w of (model.walls ?? []).filter((x) => x.shearWall)) {
    const m = model.members.find((mm) => mm.id === w.member); if (!m) continue
    const a = nm.get(m.i), b2 = nm.get(m.j); if (!a || !b2) continue
    const lw = Math.hypot(b2.x - a.x, b2.z - a.z)         // horizontal length, m
    const hw = w.height
    if (!(lw > 0 && hw > 0)) continue
    // in-plane shear = horizontal projection of the strut axials, taken from
    // each strut's ACTUAL geometry (cos = lw / strut length) so it stays
    // consistent with the bridge whatever the wall's nominal height.
    const strutShear = (run: FrameRun, id: string) => {
      const mr = run.result.members.find((x) => x.id === id)
      if (!mr || mr.L <= 0) return 0
      return Math.max(...mr.N.map(Math.abs)) * (lw / mr.L)
    }
    let Vu = 0, gov = ''
    for (const run of runs) {
      const v = strutShear(run, `wallstrut_${w.id}_1`) + strutShear(run, `wallstrut_${w.id}_2`)
      if (v > Vu) { Vu = v; gov = run.name }
    }
    const sec = secOf(m.id)
    const design = designShearWall({
      lw, hw, thickness: w.thickness, fc: sec.fc, fy: sec.fy, Vu, barDia: 12,
    })
    walls.push({ id: w.id, member: w.member, lw, hw, thickness: w.thickness, Vu, design, ok: design.shearOK, gov })
  }

  const partialDesign = {
    govName: runs[govIdx].name,
    cases: runs.map((r) => r.name),
    beams, prestressed, columns, steelBeams, steelColumns, woodBeams, woodColumns, basePlates,
    joints: [] as SteelJoint[],
    beamJoints: [] as BeamBeamJoint[],
    slabs, walls, footings, combined,
    scwb: [] as SCWBJointRow[],
    totals: { concreteMembers, concreteSlabs, concrete: concreteMembers + concreteSlabs, steelKg, woodVolume },
    orphanEdges: br.orphanEdges.length,
    unchecked,
    // fail-loud: forces from a non-converged P-Δ run must not silently drive design
    pDeltaIssues: runs.filter((r) => r.result.pDelta && !r.result.pDelta.converged).map((r) => r.name),
  }
  partialDesign.joints = designSteelJoints(model, partialDesign)
  partialDesign.beamJoints = designBeamBeamJoints(model, partialDesign)
  // Strong-column/weak-beam is a Special-Moment-Frame requirement (§418.7.3.2).
  if ((opts.seismicSystem ?? 'gravity') === 'smf')
    partialDesign.scwb = checkModelSCWB(model, partialDesign)
  return partialDesign
}

export function designStructure(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, opts: AnalyzeOptions = {},
  onProgress?: ProgressFn,
): StructureDesign | null {
  if (model.members.length === 0) return null
  const { br, runs, precomp } = buildRuns(model, opts, onProgress)
  const serviceLoads = applyF3Combo(br.loads, { D: 1, L: 1, Lr: 1, S: 1, R: 1 })
  const serviceRes = serviceLoads.length ? solveWithGeometry(precomp, serviceLoads, opts) : null
  const dLoads = applyF3Combo(br.loads, { D: 1 })
  const lLoads = applyF3Combo(br.loads, { L: 1 })
  const dRes = dLoads.length ? solveWithGeometry(precomp, dLoads, opts) : null
  const lRes = lLoads.length ? solveWithGeometry(precomp, lLoads, opts) : null
  return designFromRuns(model, soil, plan, opts, br, runs, serviceRes, dRes, lRes, onProgress)
}

/** Solve load cases in parallel using a pre-initialised FramePool.
 *  Returns the same `{ br, runs }` as buildRuns but with solves fanned across workers. */
async function buildRunsParallel(
  model: StructuralModel, opts: AnalyzeOptions, pool: FramePool, onProgress?: ProgressFn,
): Promise<{ br: BridgeResult; runs: FrameRun[] }> {
  const gravityModel = { ...model, loads: model.loads.filter((l) => l.cat !== 'E' && l.cat !== 'W') }
  const br = modelToFrame3D(gravityModel, { useShells: false, crackedSections: opts.crackedSections, shearDeformation: opts.shearDeformation })

  const lateral = opts.lateral?.length ? opts.lateral : defaultLateralCases(model)
  const tasks = buildComboTasks(lateral, opts)

  const precomp = precomputeFrame(br.nodes, br.members, br.supports)
  await pool.init(serializePrecomp(precomp))

  onProgress?.({ phase: 'Solving load cases', current: 0, total: tasks.length })
  let done = 0
  const promises = tasks.map(async (t) => {
    const factored = applyF3Combo([...br.loads, ...t.lat], t.combo.f)
    if (!factored.length) return null
    const result = await pool.solve(factored, opts)
    onProgress?.({ phase: 'Solving load cases', current: ++done, total: tasks.length, detail: t.name })
    return result ? { name: t.name, result } satisfies FrameRun : null
  })
  const settled = await Promise.all(promises)
  const runs = settled.filter((r): r is FrameRun => r !== null)
  return { br, runs }
}

async function designStructureWithPool(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan, opts: AnalyzeOptions,
  pool: FramePool, onProgress?: ProgressFn,
): Promise<StructureDesign | null> {
  if (model.members.length === 0) return null
  const { br, runs } = await buildRunsParallel(model, opts, pool, onProgress)

  // Service / D / L solves also go through the pool (workers already hold the precomp)
  const serviceLoads = applyF3Combo(br.loads, { D: 1, L: 1, Lr: 1, S: 1, R: 1 })
  const dLoads = applyF3Combo(br.loads, { D: 1 })
  const lLoads = applyF3Combo(br.loads, { L: 1 })
  const [serviceRes, dRes, lRes] = await Promise.all([
    serviceLoads.length ? pool.solve(serviceLoads, opts) : Promise.resolve(null),
    dLoads.length ? pool.solve(dLoads, opts) : Promise.resolve(null),
    lLoads.length ? pool.solve(lLoads, opts) : Promise.resolve(null),
  ])

  return designFromRuns(model, soil, plan, opts, br, runs, serviceRes, dRes, lRes, onProgress)
}

/** Async (Worker-pool) version of designStructure. Spawns N frame-solve workers
 *  and fans the 20–30 load-case solves across them for near-linear speed-up. */
export async function designStructureAsync(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, opts: AnalyzeOptions = {},
  onProgress?: ProgressFn,
): Promise<StructureDesign | null> {
  const pool = new FramePool()
  try {
    return await designStructureWithPool(model, soil, plan, opts, pool, onProgress)
  } finally {
    pool.terminate()
  }
}

/** Async version of optimizeStructure. Reuses a single FramePool across all
 *  iterations to amortise worker-spawn cost (~100 ms). */
export async function optimizeStructureAsync(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, maxIter = 30,
  opts: AnalyzeOptions = {}, tryBars = false, onProgress?: ProgressFn,
): Promise<OptimizeResult | null> {
  if (model.members.length === 0) return null
  const pool = new FramePool()
  try {
    const memSecId = new Map(model.members.map((m) => [m.id, m.section]))
    const secRole = new Map<string, string>(model.members.map((m) => [m.section, m.role]))
    const settle = (m: StructuralModel) => refreshSelfWeight(enforceSectionHierarchy(m), soil.gammaConc)
    const sub = (label: string): ProgressFn | undefined =>
      onProgress && ((p) => onProgress({ ...p, phase: `${label} · ${p.phase}` }))
    const detail = async (m: StructuralModel, d: StructureDesign, label: string): Promise<{ m: StructuralModel; d: StructureDesign }> => {
      if (!tryBars) return { m, d }
      const m2 = selectBarDiameters(m, soil, plan, opts, d)
      if (m2 === m) return { m, d }
      const d2 = await designStructureWithPool(m2, soil, plan, opts, pool, sub(label))
      return { m: m2, d: d2 ?? d }
    }

    let work = settle(model)
    const steps: OptimizeStep[] = []

    let design = await designStructureWithPool(work, soil, plan, opts, pool, sub('Optimize · initial'))
    if (!design) return null
    ;({ m: work, d: design } = await detail(work, design, 'Optimize · initial'))
    steps.push({ iter: 0, grown: 0, fails: countFails(design), ok: designOK(design) })

    let iter = 0
    let stopReason: string | undefined
    while (!designOK(design) && iter++ < maxIter) {
      const act = buildGrowActions(design, work, memSecId)
      if (act.n === 0) {                        // not fixable by growing anything
        stopReason = stopReasonFor(design, 'growing sections or thicknesses cannot fix the remaining checks (adjust soil bearing, footing plan, section shapes or DDM layout)')
        break
      }
      onProgress?.({ phase: 'Optimizing — growing sections', current: iter, total: maxIter, detail: `iteration ${iter}: ${act.n} change(s), ${countFails(design)} failing` })
      const sizes = new Map(work.sections.map((s) => {
        const u = act.utils.get(s.id)
        return [s.id, u !== undefined ? jumpSection(s, u, secRole.get(s.id) ?? '') : s]
      }))
      const grown = settle(withWallThickness(withPlateThickness(withSizes(work, sizes), act.plates, soil.gammaConc), act.walls))
      if (!sectionsChanged(work, grown)) {     // nothing can grow (catalog top / unsupported shape)
        stopReason = stopReasonFor(design, 'no failing section can grow any further (top of the W catalog, an unsupported shape family, or the cast-in-place size limit)')
        break
      }
      work = grown
      const d = await designStructureWithPool(work, soil, plan, opts, pool, sub(`Optimize iter ${iter}`))
      if (!d) break
      ;({ m: work, d: design } = await detail(work, d, `Optimize iter ${iter}`))
      steps.push({ iter, grown: act.n, fails: countFails(design), ok: designOK(design) })
    }
    const converged = designOK(design)
    if (!converged && !stopReason)
      stopReason = stopReasonFor(design, `iteration cap (${maxIter}) reached — check spans and loads`)

    if (converged) {
      let batchPass = 0
      // Phase 1 — shrink h (or step to lighter W-shape for steel); only sections
      // with utilisation clearly below capacity are included so one tight section
      // does not poison the entire batch.
      let batchOk = true
      while (batchOk) {
        const utilPerSec = sectionUtilMap(design, memSecId)
        const batchSizes = new Map<string, RectSection>()
        for (const s0 of work.sections) {
          if ((utilPerSec.get(s0.id) ?? 0) >= 0.80) continue
          if (s0.material === 'steel' && s0.shape) {
            const lighter = nextLighterW(s0.shape)
            if (lighter) batchSizes.set(s0.id, applyShape(s0, lighter))
          } else if (s0.h - 25 >= 300) {
            batchSizes.set(s0.id, { ...s0, h: s0.h - 25, name: `${s0.b}×${s0.h - 25}` })
          }
        }
        if (batchSizes.size === 0) break
        batchPass++
        onProgress?.({ phase: 'Optimizing — trimming sections', detail: `batch pass ${batchPass}: ${batchSizes.size} section(s) h↓` })
        const trial = settle(withSizes(work, batchSizes))
        if (!sectionsChanged(work, trial)) break   // hierarchy reverted every shrink — no progress
        const d = await designStructureWithPool(trial, soil, plan, opts, pool)
        if (d && designOK(d)) { work = trial; design = d } else { batchOk = false }
      }
      // Phase 2 — shrink b for RC sections (As = ρ·b·d; narrower b may still satisfy demand)
      let bBatchOk = true
      while (bBatchOk) {
        const utilPerSec = sectionUtilMap(design, memSecId)
        const batchSizes = new Map<string, RectSection>()
        for (const s0 of work.sections) {
          if ((utilPerSec.get(s0.id) ?? 0) >= 0.80) continue
          if (s0.material !== 'steel' && s0.b - 25 >= 200)
            batchSizes.set(s0.id, { ...s0, b: s0.b - 25, name: `${s0.b - 25}×${s0.h}` })
        }
        if (batchSizes.size === 0) break
        batchPass++
        onProgress?.({ phase: 'Optimizing — trimming sections', detail: `batch pass ${batchPass}: ${batchSizes.size} section(s) b↓` })
        const trial = settle(withSizes(work, batchSizes))
        if (!sectionsChanged(work, trial)) break   // hierarchy reverted every shrink — no progress
        const d = await designStructureWithPool(trial, soil, plan, opts, pool)
        if (d && designOK(d)) { work = trial; design = d } else { bBatchOk = false }
      }
      // Phase 3 — trim slab thickness (economy): only panels comfortably inside the
      // §424.2 deflection limits shrink, and never below §408.3.1.2 hmin (or 100 mm).
      let sBatchOk = true
      while (sBatchOk) {
        const trims = new Map<string, number>()
        for (const s of design.slabs) {
          if (!s.ok) continue
          const d0 = s.design
          const util = Math.max(
            d0.deflection.total / Math.max(d0.deflection.limitTotal, 1e-9),
            d0.deflection.immLive / Math.max(d0.deflection.limitLive, 1e-9),
          )
          if (util >= 0.80) continue
          if (d0.h - 25 < Math.max(d0.hmin, 100)) continue
          trims.set(s.plate, d0.h - 25)
        }
        if (trims.size === 0) break
        batchPass++
        onProgress?.({ phase: 'Optimizing — trimming sections', detail: `batch pass ${batchPass}: ${trims.size} slab(s) t↓` })
        const trial = settle(withPlateThickness(work, trims, soil.gammaConc))
        if (!sectionsChanged(work, trial)) break
        const d = await designStructureWithPool(trial, soil, plan, opts, pool)
        if (d && designOK(d)) { work = trial; design = d } else { sBatchOk = false }
      }

      // Fine-tune: sequential per-section trials. Each call to designStructureWithPool
      // internally calls pool.init() which resets all workers, so concurrent calls
      // corrupt each other's state — trials must be sequential. The pool still
      // parallelises the load-case sweep inside each trial.
      // Only util<0.80 sections are candidates (same gate as batch-shrink), capped at
      // 30 sorted by ascending utilisation to bound the worst-case solve count.
      const FINETUNE_CAP = 30
      let improved = true, guard = 0
      while (improved && guard++ < 4) {
        improved = false
        const utilPerSec = sectionUtilMap(design, memSecId)

        // Phase A — h↓ / lighter-W: test candidates one at a time, accept immediately
        const hCandidates = work.sections
          .filter((s0) => {
            if ((utilPerSec.get(s0.id) ?? 0) >= 0.80) return false
            return s0.material === 'steel' && s0.shape ? !!nextLighterW(s0.shape) : s0.h - 25 >= 300
          })
          .sort((a, b) => (utilPerSec.get(a.id) ?? 0) - (utilPerSec.get(b.id) ?? 0))
          .slice(0, FINETUNE_CAP)
        const hSucceededIds = new Set<string>()
        let hDone = 0
        onProgress?.({ phase: 'Optimizing — fine-tuning', current: 0, total: hCandidates.length, detail: `pass ${guard}: h↓ — ${hCandidates.length} section(s) to test` })
        for (const s0 of hCandidates) {
          let newSec: RectSection | null = null
          if (s0.material === 'steel' && s0.shape) {
            const lighter = nextLighterW(s0.shape)
            if (lighter) newSec = applyShape(s0, lighter)
          } else if (s0.h - 25 >= 300) {
            newSec = { ...s0, h: s0.h - 25, name: `${s0.b}×${s0.h - 25}` }
          }
          if (!newSec) { onProgress?.({ phase: 'Optimizing — fine-tuning', current: ++hDone, total: hCandidates.length, detail: `pass ${guard}: h↓ — tested ${s0.name}` }); continue }
          const trial = settle(withSizes(work, new Map([[s0.id, newSec]])))
          if (!sectionsChanged(work, trial)) { onProgress?.({ phase: 'Optimizing — fine-tuning', current: ++hDone, total: hCandidates.length, detail: `pass ${guard}: h↓ — ${s0.name} reverted` }); continue }
          const d = await designStructureWithPool(trial, soil, plan, opts, pool)
          onProgress?.({ phase: 'Optimizing — fine-tuning', current: ++hDone, total: hCandidates.length, detail: `pass ${guard}: h↓ — tested ${s0.name}` })
          if (d && designOK(d)) { work = trial; design = d; improved = true; hSucceededIds.add(s0.id) }
        }

        // Phase B — b↓: sections not helped by h↓, still under-utilised
        const bCandidates = work.sections
          .filter((s0) => {
            if ((utilPerSec.get(s0.id) ?? 0) >= 0.80) return false
            if (s0.material === 'steel' || hSucceededIds.has(s0.id)) return false
            return s0.b - 25 >= 200
          })
          .sort((a, b) => (utilPerSec.get(a.id) ?? 0) - (utilPerSec.get(b.id) ?? 0))
          .slice(0, FINETUNE_CAP)
        let bDone = 0
        onProgress?.({ phase: 'Optimizing — fine-tuning', current: 0, total: bCandidates.length, detail: `pass ${guard}: b↓ — ${bCandidates.length} section(s) to test` })
        for (const s0 of bCandidates) {
          const newSec = { ...s0, b: s0.b - 25, name: `${s0.b - 25}×${s0.h}` }
          const trial = settle(withSizes(work, new Map([[s0.id, newSec]])))
          if (!sectionsChanged(work, trial)) { onProgress?.({ phase: 'Optimizing — fine-tuning', current: ++bDone, total: bCandidates.length, detail: `pass ${guard}: b↓ — ${s0.name} reverted` }); continue }
          const d = await designStructureWithPool(trial, soil, plan, opts, pool)
          onProgress?.({ phase: 'Optimizing — fine-tuning', current: ++bDone, total: bCandidates.length, detail: `pass ${guard}: b↓ — tested ${s0.name}` })
          if (d && designOK(d)) { work = trial; design = d; improved = true }
        }
      }
      if (tryBars) {
        const m2 = selectBarDiameters(work, soil, plan, opts, design)
        if (m2 !== work) {
          const d = await designStructureWithPool(m2, soil, plan, opts, pool)
          if (d) { work = m2; design = d }
        }
      }
      steps.push({ iter: iter + 1, grown: 0, fails: 0, ok: true })
    }

    return { design, model: work, steps, converged, stopReason }
  } finally {
    pool.terminate()
  }
}

// ── Bar-diameter selection ────────────────────────────────────────────────
// Standard NSCP bar sizes the design/optimise engines may try. Bar diameter
// changes neither stiffness nor self-weight (both gross-concrete), so it never
// alters the frame demands — selection is a pure per-member detailing pass that
// rewrites each member's section.barDia, keeping every schedule/drawing/solution
// (which all read sec.barDia) consistent for free.
export const BAR_LADDER_BEAM = [16, 20, 25, 28, 32]
export const BAR_LADDER_COLUMN = [20, 25, 28, 32]

/** §425.2.1 — do `bars` of Ø `db` fit one face of the column at the minimum
 *  clear spacing max(1.5db, 40 mm)? Bars split evenly over the two faces ⟂ to h
 *  (the interaction model's layout), spread across width b. */
function columnBarsFit(sec: RectSection, db: number, bars: number): boolean {
  const perFace = Math.ceil(bars / 2)
  if (perFace <= 1) return true
  const clearWidth = sec.b - 2 * (sec.cover + sec.tieDia) - perFace * db
  const sClear = clearWidth / (perFace - 1)
  return sClear >= Math.max(1.5 * db, 40) - 1e-6
}

/**
 * Pick the most economical bar diameter for every beam/girder and column from a
 * candidate ladder: the smallest-steel size that still passes, falling back to
 * the section's current bar when none of the candidates work (so the section can
 * grow instead). Returns a new model with the chosen per-member section.barDia.
 * Pass `base` (an already-computed design of `model`) to skip the internal solve.
 */
export function selectBarDiameters(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, opts: AnalyzeOptions = {},
  base?: StructureDesign | null,
): StructuralModel {
  const design = base ?? designStructure(model, soil, plan, opts)
  if (!design) return model
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memSecId = new Map(model.members.map((m) => [m.id, m.section]))
  const chosen = new Map<string, number>()
  // candidate sizes, SMALLEST first — we adopt the first one that passes.
  const ladder = (cands: number[], current: number) => [...new Set([current, ...cands])].sort((a, b) => a - b)

  // beams/girders: smallest bar Ø whose every section passes capacity AND the
  // §407.7.1 clear-spacing / layer-fit check (both folded into beamOK).
  for (const row of design.beams) {
    const sec = secById.get(memSecId.get(row.id) ?? ''); if (!sec) continue
    for (const db of ladder(BAR_LADDER_BEAM, sec.barDia)) {
      const allOK = row.sections.every((s) => beamOK(designBeam({
        b: sec.b, h: sec.h, cover: sec.cover, barDia: db, comprBarDia: 16,
        stirrupDia: sec.tieDia, fc: sec.fc, fy: sec.fy, Mu: Math.abs(s.Mu), Vu: s.Vu,
      })))
      if (allOK) { if (db !== sec.barDia) chosen.set(sec.id, db); break }
    }
  }

  // columns: smallest bar Ø that passes P–M + ρ AND fits the §425.2.1 minimum
  // clear bar spacing across the section face (≥ max(1.5db, 40 mm)).
  for (const row of design.columns) {
    const sec = secById.get(memSecId.get(row.id) ?? ''); if (!sec) continue
    for (const db of ladder(BAR_LADDER_COLUMN, sec.barDia)) {
      const r = designColumnFromPM({ ...sec, barDia: db }, row.Pu, row.Mu)
      if (r.ok && columnBarsFit(sec, db, r.bars)) { if (db !== sec.barDia) chosen.set(sec.id, db); break }
    }
  }

  // ── Bar-diameter continuity guard: one Ø through each continuous beam line
  // and each column stack — bars run through the joint / splice storey to
  // storey, so a Ø25 span meeting a Ø20 span at the same column is a detailing
  // error. The group adopts its LARGEST required diameter; bar COUNT stays
  // free per section (cuts and splices handle the difference). This also
  // repairs user-set mismatches whenever bar selection runs.
  for (const group of barContinuityGroups(model)) {
    const diaOf = (mid: string) => {
      const sec = secById.get(memSecId.get(mid) ?? '')
      return sec ? (chosen.get(sec.id) ?? sec.barDia) : 0
    }
    const dmax = Math.max(...group.map(diaOf))
    for (const mid of group) {
      const sec = secById.get(memSecId.get(mid) ?? '')
      if (sec && diaOf(mid) !== dmax) chosen.set(sec.id, dmax)
    }
  }

  if (chosen.size === 0) return model
  return {
    ...model,
    sections: model.sections.map((s) => (chosen.has(s.id) ? { ...s, barDia: chosen.get(s.id)! } : s)),
  }
}

// ── Optimisation loop ─────────────────────────────────────────────────────
export interface OptimizeStep { iter: number; grown: number; fails: number; ok: boolean }
export interface OptimizeResult {
  design: StructureDesign
  model: StructuralModel   // model carrying the optimised per-member sections
  steps: OptimizeStep[]
  converged: boolean
  /** Why the optimizer stopped short, when converged is false. */
  stopReason?: string
}

/** Human-readable reason for a non-converged stop. `why` explains the loop exit;
 *  the failing-check breakdown tells the user what growing sections can't fix. */
function stopReasonFor(d: StructureDesign, why: string): string {
  const parts = [
    [d.beams.filter((x) => !x.ok).length + d.columns.filter((x) => !x.ok).length
      + d.steelBeams.filter((x) => !x.ok).length + d.steelColumns.filter((x) => !x.ok).length, 'member'],
    [d.footings.filter((x) => !x.ok).length + d.combined.filter((x) => !x.ok).length, 'footing'],
    [d.basePlates.filter((x) => !x.ok).length, 'base plate'],
    [d.slabs.filter((x) => !x.ok).length, 'slab'],
    [d.walls.filter((x) => !x.ok).length, 'shear wall'],
    [d.joints.filter((x) => !x.ok).length + d.beamJoints.filter((x) => !x.ok).length, 'steel joint'],
    [d.scwb.filter((x) => !x.ok).length, 'SCWB joint'],
    [d.unchecked.length, 'unchecked member'],
  ] as const
  const failing = parts.filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}${n === 1 ? '' : 's'}`).join(', ')
  return `${why}${failing ? ` — still failing: ${failing}` : ''}`
}

const countFails = (d: StructureDesign): number =>
  d.beams.filter((x) => !x.ok).length + d.columns.filter((x) => !x.ok).length
  + d.steelBeams.filter((x) => !x.ok).length + d.steelColumns.filter((x) => !x.ok).length
  + d.basePlates.filter((x) => !x.ok).length
  + d.footings.filter((x) => !x.ok).length + d.combined.filter((x) => !x.ok).length
  + d.slabs.filter((x) => !x.ok).length + d.walls.filter((x) => !x.ok).length
  + d.joints.filter((x) => !x.ok).length + d.beamJoints.filter((x) => !x.ok).length
  + d.scwb.filter((x) => !x.ok).length
  + d.unchecked.length

const withSizes = (model: StructuralModel, sizes: Map<string, RectSection>): StructuralModel =>
  ({ ...model, sections: model.sections.map((s) => sizes.get(s.id) ?? s) })

/** True when any design geometry differs between two settled models — sections,
 *  slab thicknesses or wall thicknesses.
 *  enforceSectionHierarchy can silently revert a proposed change (e.g. a square
 *  column's h-shrink is clamped back to h ≥ b), so a grow/shrink trial can come
 *  out identical to the current model. Accepting such a trial makes no progress —
 *  the unbounded batch loops would re-propose the same change forever. */
const sectionsChanged = (a: StructuralModel, b: StructuralModel): boolean =>
  a.sections.length !== b.sections.length
  || a.sections.some((s, i) => {
    const t = b.sections[i]
    return s.b !== t.b || s.h !== t.h || s.shape !== t.shape
  })
  || a.plates.some((p, i) => p.thickness !== b.plates[i]?.thickness)
  || (a.walls ?? []).some((w, i) => w.thickness !== (b.walls ?? [])[i]?.thickness)

/** Re-thickness plates and shift each panel's area-D load by Δt·γc — the slab
 *  self-weight is merged into that load at model build time (buildGravityLoads),
 *  so a thickness change must carry its dead-load delta into the analysis. */
function withPlateThickness(model: StructuralModel, t: Map<string, number>, gammaC: number): StructuralModel {
  if (t.size === 0) return model
  const t0 = new Map(model.plates.map((p) => [p.id, p.thickness]))
  const plates = model.plates.map((p) => (t.has(p.id) ? { ...p, thickness: t.get(p.id)! } : p))
  const adjusted = new Set<string>()   // shift only the FIRST area-D load per plate
  const loads = model.loads.map((l) => {
    if (l.kind !== 'area' || l.cat !== 'D' || !t.has(l.plate) || adjusted.has(l.plate)) return l
    adjusted.add(l.plate)
    const dq = ((t.get(l.plate)! - (t0.get(l.plate) ?? 0)) / 1000) * gammaC
    return { ...l, q: l.q + dq }
  })
  return { ...model, plates, loads }
}

/** Re-thickness shear-wall panels; the wall dead load is re-derived from the
 *  new thickness by refreshSelfWeight inside settle(). */
const withWallThickness = (model: StructuralModel, t: Map<string, number>): StructuralModel =>
  t.size === 0 ? model : { ...model, walls: (model.walls ?? []).map((w) => (t.has(w.id) ? { ...w, thickness: t.get(w.id)! } : w)) }

/** Everything the grow phase can change in one iteration: member-section
 *  demand/capacity ratios (incl. SCWB column bumps), slab thickness targets
 *  and shear-wall thickness targets. n = number of distinct actions. */
interface GrowActions { utils: Map<string, number>; plates: Map<string, number>; walls: Map<string, number>; n: number }

function buildGrowActions(design: StructureDesign, model: StructuralModel, memSecId: Map<string, string>): GrowActions {
  const utils = buildUtilMap(design, memSecId)
  // SCWB (§418.7.3.2): ΣMnc ≥ (6/5)·ΣMnb. Column Mnc scales ≈ h², the same law
  // the jump estimator assumes, so feed 1.2/ratio as the demand/capacity of
  // every column framing the failing joint.
  for (const j of design.scwb) {
    if (j.ok) continue
    const need = Math.max(1.05, 1.2 / Math.max(j.ratio, 1e-6))
    for (const mm of model.members) {
      if (mm.role !== 'column' || (mm.i !== j.node && mm.j !== j.node)) continue
      utils.set(mm.section, Math.max(utils.get(mm.section) ?? 0, need))
    }
  }
  // Slabs: §408.3.1.2 hmin directly; §424.2 deflection via Ie ≈ h³ ⇒ target
  // h ≈ h·∛(δ/δlim). 25-mm steps, capped like the section jump.
  const plates = new Map<string, number>()
  for (const s of design.slabs) {
    if (s.ok) continue
    const d = s.design
    const f = Math.max(
      d.hmin / Math.max(d.h, 1),
      Math.cbrt(d.deflection.total / Math.max(d.deflection.limitTotal, 1e-9)),
      Math.cbrt(d.deflection.immLive / Math.max(d.deflection.limitLive, 1e-9)),
    )
    if (f <= 1 + 1e-9) continue
    const steps = Math.max(1, Math.min(10, Math.ceil(((f - 1) * d.h) / 25)))
    plates.set(s.plate, d.h + 25 * steps)
  }
  // Shear walls: in-plane shear failure → thicken the panel one step per iteration.
  const walls = new Map<string, number>()
  for (const w of design.walls) if (!w.ok) walls.set(w.id, w.thickness + 25)
  return { utils, plates, walls, n: utils.size + plates.size + walls.size }
}

/** Copy shape geometry into the section's bounding-box fields so metadata stays consistent. */
const applyShape = (s: RectSection, sh: AiscShape): RectSection =>
  ({ ...s, shape: sh.name, name: sh.name, b: sh.bf ?? s.b, h: sh.d ?? s.h })

/** Demand/capacity utilisation per section-id; only failing members are included. */
function buildUtilMap(
  design: StructureDesign,
  memSecId: Map<string, string>,
): Map<string, number> {
  const out = new Map<string, number>()
  const bump = (sid: string | undefined, u: number) => {
    if (sid) out.set(sid, Math.max(out.get(sid) ?? 0, u))
  }
  for (const b of design.beams) {
    if (!b.ok) {
      const sid = memSecId.get(b.id)
      const u = b.sections.reduce((mx, sec) => {
        const mn = sec.design.phiMnMax
        return Math.max(mx, mn > 1e-9 ? Math.abs(sec.Mu) / mn : 4)
      }, 2)
      bump(sid, u)
    }
  }
  for (const c of design.columns)      if (!c.ok) bump(memSecId.get(c.id), Math.max(2, c.util))
  for (const b of design.steelBeams)   if (!b.ok) bump(memSecId.get(b.id), Math.max(2, b.utilM, b.utilV, b.deflLim > 0 ? b.defl / b.deflLim : 2))
  for (const c of design.steelColumns) if (!c.ok) bump(memSecId.get(c.id), Math.max(2, c.ratio))
  return out
}

/** Max demand/capacity ratio for every section across all member types (passing and failing). */
function sectionUtilMap(design: StructureDesign, memSecId: Map<string, string>): Map<string, number> {
  const out = new Map<string, number>()
  const bump = (sid: string | undefined, u: number) => {
    if (sid) out.set(sid, Math.max(out.get(sid) ?? 0, u))
  }
  for (const b of design.beams) {
    const u = b.sections.reduce((mx, sec) => {
      const mn = sec.design.phiMnMax
      return Math.max(mx, mn > 1e-9 ? Math.abs(sec.Mu) / mn : 0)
    }, 0)
    bump(memSecId.get(b.id), u)
  }
  for (const c of design.columns)      bump(memSecId.get(c.id), c.util)
  for (const b of design.steelBeams)   bump(memSecId.get(b.id), Math.max(b.utilM, b.utilV, b.deflLim > 0 ? b.defl / b.deflLim : 0))
  for (const c of design.steelColumns) bump(memSecId.get(c.id), c.ratio)
  return out
}

/**
 * Grow a section by the estimated number of steps to satisfy a given demand/capacity
 * ratio (util = Mu/φMn ≥ 1).
 *   RC capacity ≈ h²  → target h = h·√util → steps = ⌈(√util − 1)·h/50⌉, cap 10
 *   Steel: jump ⌈√util − 0.5⌉ catalog positions, cap 8
 *   Square RC columns (b/h ∈ [0.75, 1.33]) grow both b and h together to preserve
 *   aspect ratio; all others switch to width growth at h ≥ 2.5b.
 */
/** Cast-in-place size limits — the RC counterpart of the top of the W catalog.
 *  Growth clamps here; a member still failing at the cap exits the grow loop
 *  with an honest stopReason instead of ballooning without bound.
 *  Practical formwork/constructability bounds for building work. */
export const RC_LIMITS = {
  column: { b: 1000, h: 1000 },
  flexural: { b: 600, h: 1200 },   // beams & girders
} as const

function jumpSection(s: RectSection, util: number, role: string): RectSection {
  if (util <= 1 + 1e-9) return s
  if (s.material === 'steel' && s.shape) {
    const n = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(util) - 0.5)))
    let cur = s
    for (let i = 0; i < n; i++) {
      const next = nextHeavierW(cur.shape!)
      if (!next) break
      cur = applyShape(cur, next)
    }
    return cur
  }
  const lim = role === 'column' ? RC_LIMITS.column : RC_LIMITS.flexural
  const nSteps = Math.max(1, Math.min(10, Math.ceil((Math.sqrt(util) - 1) * s.h / 50)))
  const ratio = s.b / s.h
  const isSquareCol = role === 'column' && ratio > 0.75 && ratio < 1.33
  let sec = s
  for (let i = 0; i < nSteps; i++) {
    const canB = sec.b + 50 <= lim.b, canH = sec.h + 50 <= lim.h
    if (isSquareCol && canB && canH) {
      sec = { ...sec, b: sec.b + 50, h: sec.h + 50 }
    } else if ((sec.h >= 2.5 * sec.b || !canH) && canB) {
      sec = { ...sec, b: sec.b + 50 }
    } else if (canH) {
      sec = { ...sec, h: sec.h + 50 }
    } else if (canB) {
      sec = { ...sec, b: sec.b + 50 }
    } else {
      break   // at the cast-in-place cap — cannot grow (like the W-catalog top)
    }
    sec = { ...sec, name: `${sec.b}×${sec.h}` }
  }
  return sec
}

/**
 * Per-member sizing search. Each beam/girder/column carries its own section, so
 * only the FAILING members grow (h in 50-mm steps; b joins once h ≥ 3b) — one
 * at a time — until nothing fails, with the strong-column/weak-beam width
 * hierarchy re-enforced after every growth. Then each member's h is trimmed in
 * 25-mm steps while the whole structure still passes. The frame is re-analysed
 * on every step (stiffness changes feed back into the demands).
 */
export function optimizeStructure(
  model: StructuralModel, soil: SoilOptions, plan: FootingPlan = {}, maxIter = 30,
  opts: AnalyzeOptions = {}, tryBars = false, onProgress?: ProgressFn,
): OptimizeResult | null {
  if (model.members.length === 0) return null
  const memSecId = new Map(model.members.map((m) => [m.id, m.section]))
  // sectionId → member role (valid after splitSharedSections: 1-to-1 mapping)
  const secRole = new Map<string, string>(model.members.map((m) => [m.section, m.role]))
  // sizes & self-weight kept consistent at every step (self-weight uses the
  // footing concrete unit weight so a custom γc feeds the gravity demands).
  const settle = (m: StructuralModel) => refreshSelfWeight(enforceSectionHierarchy(m), soil.gammaConc)
  // wrap the per-solve progress with the current optimise phase so the bar shows
  // the load-case sweep happening inside each iteration.
  const sub = (label: string): ProgressFn | undefined =>
    onProgress && ((p) => onProgress({ ...p, phase: `${label} · ${p.phase}` }))
  // re-detail the bars (cheapest design variable) before measuring fails, so a
  // member that only needs a bigger bar is not grown unnecessarily.
  const detail = (m: StructuralModel, d: StructureDesign, label: string): { m: StructuralModel; d: StructureDesign } => {
    if (!tryBars) return { m, d }
    const m2 = selectBarDiameters(m, soil, plan, opts, d)
    return m2 === m ? { m, d } : { m: m2, d: designStructure(m2, soil, plan, opts, sub(label)) ?? d }
  }
  let work = settle(model)                            // start width-consistent
  const steps: OptimizeStep[] = []

  let design = designStructure(work, soil, plan, opts, sub('Optimize · initial'))
  if (!design) return null
  ;({ m: work, d: design } = detail(work, design, 'Optimize · initial'))
  steps.push({ iter: 0, grown: 0, fails: countFails(design), ok: designOK(design) })

  // GROW: jump each failing section by the estimated steps needed to satisfy
  // demand/capacity, re-enforce the hierarchy and refresh self-weight so the
  // heavier sections feed back into the demands on the next iteration.
  let iter = 0
  let stopReason: string | undefined
  while (!designOK(design) && iter++ < maxIter) {
    const act = buildGrowActions(design, work, memSecId)
    if (act.n === 0) {                          // not fixable by growing anything
      stopReason = stopReasonFor(design, 'growing sections or thicknesses cannot fix the remaining checks (adjust soil bearing, footing plan, section shapes or DDM layout)')
      break
    }
    onProgress?.({ phase: 'Optimizing — growing sections', current: iter, total: maxIter, detail: `iteration ${iter}: ${act.n} change(s), ${countFails(design)} failing` })
    const sizes = new Map(work.sections.map((s) => {
      const u = act.utils.get(s.id)
      return [s.id, u !== undefined ? jumpSection(s, u, secRole.get(s.id) ?? '') : s]
    }))
    const grown = settle(withWallThickness(withPlateThickness(withSizes(work, sizes), act.plates, soil.gammaConc), act.walls))
    if (!sectionsChanged(work, grown)) {       // nothing can grow (catalog top / unsupported shape)
      stopReason = stopReasonFor(design, 'no failing section can grow any further (top of the W catalog, an unsupported shape family, or the cast-in-place size limit)')
      break
    }
    work = grown
    const d = designStructure(work, soil, plan, opts, sub(`Optimize iter ${iter}`))
    if (!d) break
    ;({ m: work, d: design } = detail(work, d, `Optimize iter ${iter}`))
    steps.push({ iter, grown: act.n, fails: countFails(design), ok: designOK(design) })
  }
  const converged = designOK(design)
  if (!converged && !stopReason)
    stopReason = stopReasonFor(design, `iteration cap (${maxIter}) reached — check spans and loads`)

  // SHRINK: first try trimming all sections simultaneously (batch pass) — much
  // faster for large models when most sections are over-sized by several steps.
  // Then fall back to individual 25-mm fine-tune for sections that couldn't be
  // batch-trimmed (typically the critical ones controlling the design).
  if (converged) {
    let batchPass = 0
    // Phase 1 — shrink h; only sections with utilisation clearly below capacity are
    // included so one tight section does not reject the whole batch.
    let batchOk = true
    while (batchOk) {
      const utilPerSec = sectionUtilMap(design, memSecId)
      const batchSizes = new Map<string, RectSection>()
      for (const s0 of work.sections) {
        if ((utilPerSec.get(s0.id) ?? 0) >= 0.80) continue
        if (s0.material === 'steel' && s0.shape) {
          const lighter = nextLighterW(s0.shape)
          if (lighter) batchSizes.set(s0.id, applyShape(s0, lighter))
        } else if (s0.h - 25 >= 300) {
          batchSizes.set(s0.id, { ...s0, h: s0.h - 25, name: `${s0.b}×${s0.h - 25}` })
        }
      }
      if (batchSizes.size === 0) break
      batchPass++
      onProgress?.({ phase: 'Optimizing — trimming sections', detail: `batch pass ${batchPass}: ${batchSizes.size} section(s) h↓` })
      const trial = settle(withSizes(work, batchSizes))
      if (!sectionsChanged(work, trial)) break   // hierarchy reverted every shrink — no progress
      const d = designStructure(trial, soil, plan, opts)
      if (d && designOK(d)) { work = trial; design = d } else { batchOk = false }
    }
    // Phase 2 — shrink b for RC sections (As = ρ·b·d; narrower b may still satisfy demand)
    let bBatchOk = true
    while (bBatchOk) {
      const utilPerSec = sectionUtilMap(design, memSecId)
      const batchSizes = new Map<string, RectSection>()
      for (const s0 of work.sections) {
        if ((utilPerSec.get(s0.id) ?? 0) >= 0.80) continue
        if (s0.material !== 'steel' && s0.b - 25 >= 200)
          batchSizes.set(s0.id, { ...s0, b: s0.b - 25, name: `${s0.b - 25}×${s0.h}` })
      }
      if (batchSizes.size === 0) break
      batchPass++
      onProgress?.({ phase: 'Optimizing — trimming sections', detail: `batch pass ${batchPass}: ${batchSizes.size} section(s) b↓` })
      const trial = settle(withSizes(work, batchSizes))
      if (!sectionsChanged(work, trial)) break   // hierarchy reverted every shrink — no progress
      const d = designStructure(trial, soil, plan, opts)
      if (d && designOK(d)) { work = trial; design = d } else { bBatchOk = false }
    }
    // Phase 3 — trim slab thickness (economy): only panels comfortably inside the
    // §424.2 deflection limits shrink, and never below §408.3.1.2 hmin (or 100 mm).
    let sBatchOk = true
    while (sBatchOk) {
      const trims = new Map<string, number>()
      for (const s of design.slabs) {
        if (!s.ok) continue
        const d0 = s.design
        const util = Math.max(
          d0.deflection.total / Math.max(d0.deflection.limitTotal, 1e-9),
          d0.deflection.immLive / Math.max(d0.deflection.limitLive, 1e-9),
        )
        if (util >= 0.80) continue
        if (d0.h - 25 < Math.max(d0.hmin, 100)) continue
        trims.set(s.plate, d0.h - 25)
      }
      if (trims.size === 0) break
      batchPass++
      onProgress?.({ phase: 'Optimizing — trimming sections', detail: `batch pass ${batchPass}: ${trims.size} slab(s) t↓` })
      const trial = settle(withPlateThickness(work, trims, soil.gammaConc))
      if (!sectionsChanged(work, trial)) break
      const d = designStructure(trial, soil, plan, opts)
      if (d && designOK(d)) { work = trial; design = d } else { sBatchOk = false }
    }

    // Fine-tune: per-section — try h↓ first, then b↓ if h can't shrink or fails.
    // A trial the hierarchy reverts is skipped (identical model ⇒ not an improvement).
    let improved = true, guard = 0
    while (improved && guard++ < 4) {
      improved = false
      for (const s0 of work.sections) {
        if (s0.material === 'steel' && s0.shape) {
          const lighter = nextLighterW(s0.shape)
          if (!lighter) continue
          onProgress?.({ phase: 'Optimizing — fine-tuning', detail: s0.name })
          const trial = settle(withSizes(work, new Map([[s0.id, applyShape(s0, lighter)]])))
          if (!sectionsChanged(work, trial)) continue
          const d = designStructure(trial, soil, plan, opts)
          if (d && designOK(d)) { work = trial; design = d; improved = true }
        } else {
          if (s0.h - 25 >= 300) {
            onProgress?.({ phase: 'Optimizing — fine-tuning', detail: `${s0.name} h↓` })
            const hSec = { ...s0, h: s0.h - 25, name: `${s0.b}×${s0.h - 25}` }
            const trial = settle(withSizes(work, new Map([[s0.id, hSec]])))
            if (sectionsChanged(work, trial)) {
              const d = designStructure(trial, soil, plan, opts)
              if (d && designOK(d)) { work = trial; design = d; improved = true; continue }
            }
          }
          if (s0.b - 25 >= 200) {
            onProgress?.({ phase: 'Optimizing — fine-tuning', detail: `${s0.name} b↓` })
            const bSec = { ...s0, b: s0.b - 25, name: `${s0.b - 25}×${s0.h}` }
            const trial = settle(withSizes(work, new Map([[s0.id, bSec]])))
            if (!sectionsChanged(work, trial)) continue
            const d = designStructure(trial, soil, plan, opts)
            if (d && designOK(d)) { work = trial; design = d; improved = true }
          }
        }
      }
    }
    // final bar re-detail at the trimmed sizes for the most economical layout
    if (tryBars) {
      const m2 = selectBarDiameters(work, soil, plan, opts, design)
      if (m2 !== work) { const d = designStructure(m2, soil, plan, opts); if (d) { work = m2; design = d } }
    }
    steps.push({ iter: iter + 1, grown: 0, fails: 0, ok: true })
  }

  return { design, model: work, steps, converged, stopReason }
}
