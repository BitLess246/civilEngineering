// ─────────────────────────────────────────────────────────────────────────
// Structural model schema — Phase 1 of the 3D model space (docs/ROADMAP-3D.md).
// Pure, JSON-serialisable data: the 3D editor, the frame solvers, the
// tributary engine and the design pipeline all consume this one shape.
// Units: coordinates m; sections mm; loads kN, kN/m, kPa.
// ─────────────────────────────────────────────────────────────────────────
import type { LoadCategory } from './beamAnalysis'

export interface Node { id: string; x: number; y: number; z: number }

export interface RectSection {
  id: string
  name: string
  b: number; h: number          // mm
  fc: number; fy: number
  barDia: number; tieDia: number; cover: number
}

export type MemberRole = 'beam' | 'girder' | 'column' | 'brace'
export interface Member {
  id: string
  i: string; j: string          // node ids
  role: MemberRole
  section: string               // RectSection id
}

export type PlateRole = 'slab' | 'wall'
export interface Plate {
  id: string
  corners: [string, string, string, string]  // node ids, CCW
  role: PlateRole
  thickness: number             // mm
}

export type SupportFixity = 'pin' | 'fixed' | 'roller' | 'spring'
export interface NodeSupport { node: string; fixity: SupportFixity; k?: number }

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
  supports: NodeSupport[]
  loads: ModelLoad[]
  storeys: Storey[]
}

export function emptyModel(name = 'Untitled'): StructuralModel {
  return { version: 1, name, nodes: [], sections: [], members: [], plates: [], supports: [], loads: [], storeys: [] }
}
