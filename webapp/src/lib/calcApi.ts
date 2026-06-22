// Client for the protected calculation API. The structural-design solvers run
// server-side (see /api), so this module ships only fetch calls — never the
// engine logic. Types below are `import type` only: TypeScript erases them at
// build time, so importing them from the engine does NOT bundle any engine code
// into the browser. Keep it that way (no value imports from ../engine here).
import type {
  DerivedBeamProps,
  BeamFlexureResult,
  BeamShearResult,
  BeamLoadsResult,
  ColumnAxialResult,
  WeakAxisResult,
} from '../engine/steelDesign'

// Base URL from the build env. Empty ⇒ same-origin (local dev / future
// same-origin hosting); a full origin for the separate Node host in production.
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

export interface BeamCalcInput {
  shapeName: string
  Fy: number
  span: number
  Lb: number
  Cb: number
  wDead: number
  wLive: number
}
export interface BeamCalcResult {
  props: DerivedBeamProps
  flex: BeamFlexureResult
  shear: BeamShearResult
  loads: BeamLoadsResult
}
export const calcBeam = (input: BeamCalcInput) =>
  post<BeamCalcResult>('/api/steel/beam', input)

export interface ColumnCalcInput {
  shapeName: string
  Fy: number
  L: number
  Kx: number
  Ky: number
}
export interface ColumnCalcResult {
  props: DerivedBeamProps
  axial: ColumnAxialResult
  weak: WeakAxisResult
}
export const calcColumn = (input: ColumnCalcInput) =>
  post<ColumnCalcResult>('/api/steel/column', input)
