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

let warnedLocal = false

/** In-browser fallback when the API is unreachable (dev without the service,
 *  static deploys) or the route is absent (404). Dynamic import keeps the
 *  engine in a lazy chunk — the eager path still ships zero engine code. */
async function localFallback<T>(path: string, body: unknown): Promise<T> {
  const local = await import('./calcLocal')
  if (!warnedLocal) {
    warnedLocal = true
    console.warn(`calc API unreachable at ${BASE || 'same-origin'} — steel results are computed locally in-browser (same engine).`)
  }
  if (path === '/api/steel/beam') return local.localBeam(body as never) as T
  if (path === '/api/steel/column') return local.localColumn(body as never) as T
  if (path === '/api/steel/connection') return local.localConnection(body as never) as T
  throw new Error(`No local fallback for ${path}`)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return localFallback<T>(path, body)          // network error — API not running
  }
  if (res.status === 404) return localFallback<T>(path, body)  // route absent (static host)
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    const err = new Error(detail?.error ?? `Calculation API error (${res.status})`)
    console.error(err)   // the UI badge says "check console" — make that true
    throw err
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
