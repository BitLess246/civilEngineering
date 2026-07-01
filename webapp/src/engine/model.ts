// ─────────────────────────────────────────────────────────────────────────
// Structural model schema — Phase 1 of the 3D model space (docs/ROADMAP-3D.md).
// Pure, JSON-serialisable data: the 3D editor, the frame solvers, the
// tributary engine and the design pipeline all consume this one shape.
// Units: coordinates m; sections mm; loads kN, kN/m, kPa.
// ─────────────────────────────────────────────────────────────────────────
import type { LoadCategory } from './beamAnalysis'
import type { SdlItem } from './deadLoads'
import type { LiveItem } from './liveLoads'

export interface Node { id: string; x: number; y: number; z: number }

export type SectionMaterial = 'concrete' | 'steel'

export interface RectSection {
  id: string
  name: string
  b: number; h: number          // mm  (concrete; for steel a bounding box ≈ bf × d)
  fc: number; fy: number
  barDia: number; tieDia: number; cover: number
  /** Material of the member. Absent ⇒ 'concrete' (back-compatible). */
  material?: SectionMaterial
  /** AISC shape name (steel only), e.g. 'W310x38.7'. Resolved via aiscSections. */
  shape?: string
  /** Steel grade yield/ultimate (steel only). Defaults: Fy 248, Fu 400 (A36). */
  steelFy?: number
  steelFu?: number
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
}

export type PlateRole = 'slab' | 'wall'
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
  | { kind: 'member-udl'; member: string; w: number; cat: LoadCategory }
  | { kind: 'area'; plate: string; q: number /* kPa */; cat: LoadCategory }
  /** Uniform temperature change ΔT (°C, + = rise) with linear expansion α (/°C).
   *  Equivalent axial force P_T = EA·α·ΔT is applied as self-equilibrating end forces
   *  in the solver (AISC 360 Commentary §C2; ACI 318-14 §6.6.3.1). */
  | { kind: 'member-thermal'; member: string; deltaT: number; alpha: number; cat: LoadCategory }

export interface Storey { id: string; name: string; elevation: number /* m */ }

export interface StructuralModel {
  version: 1
  name: string
  nodes: Node[]
  sections: RectSection[]
  members: Member[]
  plates: Plate[]
  walls?: Wall[]
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
