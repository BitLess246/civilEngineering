// ─────────────────────────────────────────────────────────────────────────
// Structural model schema — Phase 1 of the 3D model space (docs/ROADMAP-3D.md).
// Pure, JSON-serialisable data: the 3D editor, the frame solvers, the
// tributary engine and the design pipeline all consume this one shape.
// Units: coordinates m; sections mm; loads kN, kN/m, kPa.
// ─────────────────────────────────────────────────────────────────────────
import type { LoadCategory } from './beamAnalysis'
import type { SdlItem } from './deadLoads'
import type { LiveItem } from './liveLoads'
import type { WoodRefValues } from './woodDesign'

export interface Node { id: string; x: number; y: number; z: number }

export type SectionMaterial = 'concrete' | 'steel' | 'wood'

export interface RectSection {
  id: string
  name: string
  b: number; h: number          // mm  (concrete/wood b × d; for steel a bounding box ≈ bf × d)
  fc: number; fy: number
  barDia: number; tieDia: number; cover: number
  /** COLUMN cage: total number of longitudinal bars in the section.
   *
   *  Absent ⇒ the count is DERIVED from the required steel by
   *  `designAxialColumn` (`max(minBars, ceil(AstReq/Ab))`) — how every model
   *  behaved before this field, so old JSON loads unchanged. Present ⇒ the
   *  cage is the stored one, which is what lets the two-axis (Ø × count)
   *  column rebar search adopt a count instead of pinning it to the derived
   *  one: 8⌀20 and 4⌀25 are different columns and only a stored count can tell
   *  the schedule which was chosen.
   *
   *  Even and ≥ 4 (tied) — a cage is symmetric or the P–M interaction is not
   *  the one it was computed for; `meshValidation` enforces it. BEAM sections
   *  ignore it: a beam's count follows As at each critical section. */
  barCount?: number
  /** Material of the member. Absent ⇒ 'concrete' (back-compatible). */
  material?: SectionMaterial
  /** AISC shape name (steel only), e.g. 'W310x38.7'. Resolved via aiscSections. */
  shape?: string
  /** Steel grade yield/ultimate (steel only). Defaults: Fy 248, Fu 400 (A36). */
  steelFy?: number
  steelFu?: number
  /** Timber material id (wood only): a built-in library id (`${species}-${grade}`,
   *  e.g. 'DFL-2') or a custom-material id. Resolves the reference design values
   *  via WOOD_SPECIES when `woodRef` is absent. */
  woodSpecies?: string
  /** Grade key within the species (wood only), e.g. '2' for No.2 — UI metadata. */
  woodGrade?: string
  /** Resolved ASD/LRFD reference design values (wood only). When present these
   *  are authoritative (a custom material's values travel with the model); the
   *  engine falls back to the library id otherwise. JSON-serialisable. */
  woodRef?: WoodRefValues
  /** Solid-sawn ('sawn') or glued-laminated ('glulam') timber (wood only).
   *  Absent ⇒ 'sawn'. */
  woodKind?: 'sawn' | 'glulam'
  /** Wet-service condition (wood only): in-service MC > 19% sawn / 16% glulam. */
  woodWet?: boolean
  /** Pretensioned bonded prestressing on this (concrete beam) section — when
   *  present the pipeline runs the full prestressed check (losses, §24.5
   *  stresses, fps/φMn, 1.2Mcr) beside the RC design. */
  ps?: { Aps: number; fpu: number; e: number; fci: number }
}

export type MemberRole = 'beam' | 'girder' | 'column' | 'brace'

/** Per-end force/moment release flags (true = released, i.e. force/moment = 0 at that end). */
export interface MemberReleases {
  iEnd?: { Fx?: boolean; Fy?: boolean; Fz?: boolean; Mx?: boolean; My?: boolean; Mz?: boolean }
  jEnd?: { Fx?: boolean; Fy?: boolean; Fz?: boolean; Mx?: boolean; My?: boolean; Mz?: boolean }
}

/** Rigid end offsets (member offset / rigid link): vector from the node to the
 *  member end, in GLOBAL coordinates [m]. The flexible element spans end→end;
 *  node↔end is a rigid arm. Models eccentric/centroidal connections. */
export interface MemberOffsets {
  iEnd?: [number, number, number]
  jEnd?: [number, number, number]
}

/** Physical connection idealisation at a member end, which drives BOTH the
 *  analysis (releases) and the steel connection design:
 *   'simple' — shear-only (shear tab / web plate / cleat): a PIN — releases the
 *              bending moments My, Mz at that end (the "schematic hinge").
 *   'moment' — rigid moment connection (end plate / flange weld): no release.
 *   'fixed'  — fully continuous (default for a monolithic joint): no release. */
export type ConnectionKind = 'simple' | 'moment' | 'fixed'

/** Per-end connection type. Absent ⇒ continuous. */
export interface MemberConnections { iEnd?: ConnectionKind; jEnd?: ConnectionKind }

export interface Member {
  id: string
  i: string; j: string          // node ids
  role: MemberRole
  section: string               // RectSection id
  releases?: MemberReleases
  /** Physical connection type per end — pins a 'simple' end (releases My, Mz) and
   *  tags 'moment' ends for moment-connection design. Absent ⇒ continuous. */
  connections?: MemberConnections
  offsets?: MemberOffsets
  /** Per-member rigid-zone factor override (0–1); falls back to the model factor.
   *  0 excludes this member from automatic rigid end zones. */
  rigidZoneFactor?: number
  /** Unbraced length for §F2 lateral-torsional buckling, m (steel beams/girders).
   *  Absent ⇒ the full member length is used (conservative). Set to the real
   *  brace spacing (e.g. purlin/joist pitch) to relieve LTB. */
  Lb?: number
  /** Local-axis rotation about the member axis, degrees (ETABS "local axis 2
   *  angle"): +θ turns the section depth (local y′) toward local z′, i→j
   *  right-hand rule. Absent ⇒ 0 for beams; VERTICAL members default to 90° so
   *  the depth lands on global X — the drawn orientation. */
  axisRotation?: number
  /** Axial participation limit — cross-braces that buckle out under compression
   *  ('tension-only'), or contact/bearing struts that cannot pull ('compression-only').
   *  Resolved by the active-set iteration in `axialOnly.ts`, which makes the
   *  analysis NONLINEAR: results may not be superposed across load combinations.
   *  Absent ⇒ 'both' (an ordinary two-way member). */
  axialMode?: 'both' | 'tension-only' | 'compression-only'
}

export type PlateRole = 'slab' | 'wall'
/**
 * An opening cast through a slab panel — a stair void, a duct or a service
 * penetration.
 *
 * OWNED BY THE PLATE, not a top-level entity. Every other entity in this model
 * is referenced by id by its peers; an opening is the only one whose existence
 * is meaningless without its parent, which makes it a child. Keeping it here
 * means it cannot orphan when the panel is deleted, the mesher already has it
 * while meshing that panel, and "is it inside its plate" stays a single-entity
 * validation rule.
 *
 * An opening crossing two panels is modelled as one opening per panel — which
 * is also how it is detailed, since each panel gets its own trimmer bars.
 *
 * Coordinates are METRES from corner 0, along the plate's two edges (corner
 * 0→1 is the local x axis, corner 0→3 the local y). Real dimensions rather than
 * normalised fractions because the trimmer design, the take-off and the drawing
 * all need them, and bar counts are rounding-sensitive.
 */
export interface SlabOpening {
  id: string
  kind: 'rect' | 'circle'
  /** Position of the opening's ORIGIN (rect: its corner 0; circle: its centre),
   *  m from the plate's corner 0 along the local x and y axes. */
  x: number
  y: number
  /** Rectangular opening size, m. */
  w?: number
  h?: number
  /** Circular opening radius, m. */
  r?: number
}

export interface Plate {
  id: string
  corners: [string, string, string, string]  // node ids, CCW
  role: PlateRole
  thickness: number             // mm
  /** Per-slab superimposed dead load composed from NSCP Table 204-1/204-2.
   *  When present, overrides the global SDL for this panel's area dead load. */
  sdlItems?: SdlItem[]
  /** Per-slab live load from NSCP Table 205-1 occupancy (overrides global LL). */
  live?: LiveItem
  /** Timber deck-on-joist floor (wood slab). When present the panel is designed
   *  by the woodSlab engine (NDS §3 / NSCP §6) instead of the RC Direct Design
   *  Method: plan span/width come from the plate geometry, D/L from its area
   *  loads (superimposed — the deck adds its own self weight). */
  deck?: WoodDeck
  /** Openings cast through this panel (stair voids, ducts, penetrations).
   *  Absent means a solid panel — the overwhelmingly common case. */
  openings?: SlabOpening[]
}

/** A timber deck-on-joist floor carried by a plate. JSON-serialisable. */
export interface WoodDeck {
  joistSpecies?: string          // wood-library id ('DFL-2', …) — resolves joistRef when absent
  joistRef?: WoodRefValues       // explicit reference values (custom material; travels with the model)
  joistKind?: 'sawn' | 'glulam'
  joistB: number                 // mm
  joistD: number                 // mm
  joistSpacing: number           // mm c/c
  joistSupport?: 'simple' | 'continuous'
  deckMaterial: 'plank' | 'bamboo-slat'
  deckThickness: number          // mm
  deckWidth?: number             // mm (board / slat face width)
  deckSupport?: 'simple' | 'continuous'
  wet?: boolean                  // wet-service C_M
}

/** A wall sitting on a member: its self-weight is applied to that member as a
 *  line load (D). `shearWall` tags it as a reinforced shear wall (lateral
 *  system) for downstream design; gravity-only otherwise. */
export interface Wall {
  id: string
  member: string                // supporting member id
  height: number                // m
  thickness: number             // mm
  shearWall: boolean
}

export type SupportFixity = 'pin' | 'fixed' | 'roller' | 'spring'
export interface NodeSupport {
  node: string
  fixity: SupportFixity
  k?: number          // (legacy)
  /** Spring stiffness per global axis [kN/m], used when fixity = 'spring'. */
  kx?: number; ky?: number; kz?: number
}

export type ModelLoad =
  | { kind: 'node'; node: string; Fx?: number; Fy?: number; Fz?: number; cat: LoadCategory }
  | { kind: 'member-point'; member: string; t: number /* 0–1 along i→j */; P: number; cat: LoadCategory }
  /** `sw` marks a GENERATED self-weight line load (member or wall gravity, from
   *  buildGravityLoads) so refreshSelfWeight can rebuild exactly those and leave
   *  user-applied dead line loads untouched. Absent on user loads. */
  | { kind: 'member-udl'; member: string; w: number; cat: LoadCategory; sw?: boolean }
  | { kind: 'area'; plate: string; q: number /* kPa */; cat: LoadCategory }
  /** Uniform temperature change ΔT (°C, + = rise) with linear expansion α (/°C).
   *  Equivalent axial force P_T = EA·α·ΔT is applied as self-equilibrating end forces
   *  in the solver (AISC 360 Commentary §C2; ACI 318-14 §6.6.3.1). */
  | { kind: 'member-thermal'; member: string; deltaT: number; alpha: number; cat: LoadCategory }

export interface Storey { id: string; name: string; elevation: number /* m */ }

/**
 * A straight stair flight bearing on two members at different levels.
 *
 * MODELLED AS LOAD, NOT AS STIFFNESS. The flight is designed by `engine/stair`
 * and its reactions are put onto the two members it bears on — the same route
 * a `Wall` takes for its self weight. It is NOT meshed into the frame, so it
 * contributes no stiffness. That is the usual idealisation and it is
 * conservative for the frame; it is NOT conservative for the stair itself,
 * because a real flight is an inclined strut that attracts storey shear and can
 * shorten the columns it frames into. Meshing it is a separate piece of work.
 *
 * THE GEOMETRY IS DERIVED, NOT DECLARED. Rise and run come from where the two
 * supports actually are, so the only thing to choose is how many risers to
 * climb it in; R = rise/risers and G = run/risers then close by construction.
 * Equal risers are not optional in any stair, and a model that let R, G and the
 * support levels be stated independently would let them disagree.
 *
 * `low` and `high` are member ids; the flight bears on the TOP of each.
 * JSON-serialisable, like everything else in this file.
 */
/**
 * A flat landing at one end of a flight — the half-landing a stair breaks at.
 *
 * A landing is NOT a separate span. The flight and its landing are one one-way
 * slab: the landing is the flat part of it, between the beam it bears on and
 * the foot (or head) of the sloping part. So `depth` eats into the run the
 * flight has, which is why R and G change when a landing is added and the
 * span between the supports does not.
 *
 * WHERE THE BREAK BEAM IS. The member at that end of the flight IS the landing
 * beam: a stair between floors is two `Stair`s meeting on a beam at mid height,
 * the lower one carrying the landing and the upper one starting off it (or the
 * other way round). A shared half-landing belongs to ONE of the two flights —
 * modelling it on both would put the same slab into the frame twice.
 */
export interface StairLanding {
  /** Which end of the flight the landing is at. */
  at: 'low' | 'high'
  /** Plan depth of the landing, m, measured along the flight's run. */
  depth: number
  /** Landing slab thickness, mm. Defaults to the flight's waist. Measured
   *  vertically: a landing is flat, so it has no slope factor. */
  thickness?: number
}

export interface Stair {
  id: string
  /** The member the flight starts from — the lower of the two. */
  low: string
  /** The member it lands on. */
  high: string
  /** Flat landings at the ends of the flight, at most one per end. Absent
   *  means the flight runs the whole way between its two supports. */
  landings?: StairLanding[]
  /** Plan width of the flight, m. */
  width: number
  /** Where the flight sits along the low member's axis: the offset of its
   *  centre from that member's midpoint, m. 0 centres it. */
  offset?: number
  /** Waist thickness, mm — measured NORMAL to the soffit, which is what makes
   *  the 1/cosθ slope factor appear in the load. */
  waist: number
  /** How many risers climb the rise. R = rise/risers, so they are equal. */
  risers: number
  /** Finishes (dead) and live load on the flight, kPa of PLAN area. */
  finishes: number
  live: number
  /** End condition for the flight's own flexural design. */
  support: 'simple' | 'one-end' | 'both-ends'
}

export interface StructuralModel {
  version: 1
  name: string
  nodes: Node[]
  sections: RectSection[]
  members: Member[]
  plates: Plate[]
  walls?: Wall[]
  /** Stair flights bearing on the frame. Absent means none. */
  stairs?: Stair[]
  supports: NodeSupport[]
  loads: ModelLoad[]
  storeys: Storey[]
  /** Treat each storey as a rigid floor diaphragm (ties in-plane lateral DOFs). */
  diaphragm?: boolean
  /** Auto rigid end zones from connectivity (ETABS-style end length offsets). */
  rigidEndZones?: boolean
  /** Rigid-zone factor (0–1) scaling the auto end-offset length (default 0.5). */
  rigidZoneFactor?: number
  /** Model slab/wall panels as flat-shell finite elements (CST membrane + DKT
   *  bending) assembled into the solve, instead of tributary edge load sources.
   *  Each panel meshes to two triangles on its four corner nodes. */
  shellElements?: boolean
}

export function emptyModel(name = 'Untitled'): StructuralModel {
  return { version: 1, name, nodes: [], sections: [], members: [], plates: [], walls: [], supports: [], loads: [], storeys: [] }
}
