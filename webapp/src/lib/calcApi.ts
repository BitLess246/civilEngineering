// Client for the protected calculation API. Structural-design solvers run
// server-side only — this module ships only fetch() calls and type imports.
// CRITICAL: no value imports from ../engine here; only `import type` is used
// so esbuild never bundles engine code into the browser bundle from this file.
import type {
  DerivedBeamProps,
  BeamFlexureResult, BeamShearResult, BeamLoadsResult,
  ColumnAxialResult, WeakAxisResult, CombinedResult,
  BoltResult, BoltGroupGeom, EccentricBoltResult,
  OutOfPlaneResult, PryingResult, BlockShearCase, WeldResult,
} from '../engine/steelDesign'

// Base URL from the build env. Empty ⇒ same-origin (run the api service on the
// same host, or set VITE_API_URL in .env.local for local dev with split servers).
const BASE = import.meta.env.VITE_API_URL ?? ''

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `Calculation API error (${res.status})`)
  }
  return (await res.json()) as T
}

// ── Beam ──────────────────────────────────────────────────────────────────

export interface BeamCalcInput {
  shapeName: string; Fy: number
  span: number; Lb: number; Cb: number
  wDead: number; wLive: number
}
export interface BeamCalcResult {
  props: DerivedBeamProps
  flex: BeamFlexureResult
  shear: BeamShearResult
  loads: BeamLoadsResult
}
export const calcBeam = (input: BeamCalcInput) =>
  post<BeamCalcResult>('/api/steel/beam', input)

// ── Column ────────────────────────────────────────────────────────────────

export interface ColumnCalcInput {
  shapeName: string; Fy: number
  L: number; Kx: number; Ky: number
  Pu: number; Mux: number; Muy: number
}
export interface ColumnCalcResult {
  props: DerivedBeamProps
  axial: ColumnAxialResult
  flexX: BeamFlexureResult
  weak: WeakAxisResult
  comb: CombinedResult
}
export const calcColumn = (input: ColumnCalcInput) =>
  post<ColumnCalcResult>('/api/steel/column', input)

// ── Connection ────────────────────────────────────────────────────────────

export interface ConnectionCalcInput {
  Vu: number; Hu: number
  boltGrade: 'A325M' | 'A490M'
  db: number; nRows: number; nCols: number
  sy: number; sx: number; ey: number; ex_edge: number
  threads: boolean
  tPlate: number; FuPlate: number; FyPlate: number
  ex_load: number; ey_load: number; e_out: number; b_gage: number
  electrode: 'E70' | 'E80' | 'E90' | 'E100'
  wSize: number
}
export interface ConnectionCalcResult {
  geom: BoltGroupGeom
  phiRnBolt: BoltResult
  eccentric: EccentricBoltResult
  outOfPlane: OutOfPlaneResult | null
  prying: PryingResult | null
  blockShear: BlockShearCase[]
  weld: WeldResult
  weldCapacity: number
}
export const calcConnection = (input: ConnectionCalcInput) =>
  post<ConnectionCalcResult>('/api/steel/connection', input)
