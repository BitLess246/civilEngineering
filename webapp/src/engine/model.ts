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

export interface Member {
  id: string
  i: string; j: string          // node ids
  role: MemberRole
  section: string               // RectSection id
  releases?: MemberReleases
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
}

export function emptyModel(name = 'Untitled'): StructuralModel {
  return { version: 1, name, nodes: [], sections: [], members: [], plates: [], walls: [], supports: [], loads: [], storeys: [] }
}
