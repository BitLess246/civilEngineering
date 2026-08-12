// Client for the protected calculation API. Structural-design solvers run
// server-side only — this module ships only fetch() calls and type imports.
// CRITICAL: no value imports from ../engine here; only `import type` is used
// so esbuild never bundles engine code into the browser bundle from this file.
import type {
  DerivedBeamProps,
  BeamFlexureResult, BeamShearResult, BeamLoadsResult,
  ColumnAxialResult, WeakAxisResult, CombinedResult,
  BoltResult, BoltGroupGeom, EccentricBoltResult,
  OutOfPlaneResult, PryingResult, BlockShearCase,
} from '../engine/steelDesign'
import type { DesignBasis } from '../engine/designBasis'
import { runToken, ticketFor, rememberTicket, TrialExhaustedError } from './calcRun'
import { TRIAL_ROUTE } from './calcRoutes'

/**
 * AVAILABLE STRENGTHS, on the basis the request asked for: φRn under LRFD,
 * Rn/Ω under ASD (AISC §B3). These are separate from the engine's `phi…`
 * fields, which stay LRFD-always so the design pipeline and Model Space — both
 * LRFD-only — keep reading the numbers they always read. A field named `phiMn`
 * holding Mn/Ω would be a lie in a structural report.
 */
export interface AvailableBeam { Mn: number; Vn: number }
export interface AvailableColumn { Pn: number; Mnx: number; Mny: number }
export interface AvailableBolt { shear: number; bearing: number; governing: number }

// Base URL. Empty is the NORMAL case and now means same-origin: the endpoints
// are Vercel Edge functions in `webapp/api/steel/`, served from this very
// deployment at /api/steel/*. `VITE_API_URL` remains for the split-server case
// (a separate host, or `vercel dev` on another port while Vite serves the SPA).
const BASE = import.meta.env.VITE_API_URL ?? ''

let warnedLocal = false

/**
 * The bearer token for a calculation request.
 *
 * A signed-in member sends their access token. A GUEST sends the anon key —
 * which is a real JWT, is public by design (it is inlined into this bundle),
 * and is what `guest-quota` already relies on for the same reason. Null means
 * no session layer is configured at all, which is a deployment without
 * Supabase; the caller falls back to computing in-browser rather than showing
 * a 401 the visitor cannot act on.
 *
 * Imported lazily so the auth client is not pulled into the eager path of a
 * page that may never calculate anything.
 */
async function calcToken(): Promise<string | null> {
  const { getClient, isAuthConfigured } = await import('./auth/authClient')
  if (!isAuthConfigured()) return null
  const client = getClient()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? null
}

/** In-browser fallback when the API is unreachable (dev without the service,
 *  static deploys) or the route is absent (404). Dynamic import keeps the
 *  engine in a lazy chunk — the eager path still ships zero engine code. */
async function localFallback<T>(path: string, body: unknown): Promise<T> {
  const local = await import('./calcLocal')
  if (!warnedLocal) {
    warnedLocal = true
    console.warn(`calc API unreachable at ${BASE || 'same-origin'} — steel results are computed in-browser (same solver module the endpoint runs).`)
  }
  if (path === '/api/steel/beam') return local.localBeam(body as never) as T
  if (path === '/api/steel/column') return local.localColumn(body as never) as T
  if (path === '/api/steel/connection') return local.localConnection(body as never) as T
  throw new Error(`No local fallback for ${path}`)
}

async function post<T>(path: string, body: unknown, route: string): Promise<T> {
  // The endpoints require a Supabase JWT: a member's access token, or the anon
  // key for a guest. Both are things the SPA already has; without either there
  // is no session layer configured at all, and the fallback is the honest
  // answer rather than a 401 the visitor can do nothing about.
  const token = await calcToken()
  if (!token) return localFallback<T>(path, body)

  // The run token tells the endpoint which requests belong to one arrival, so
  // a guest is charged per visit rather than per keystroke; the ticket is the
  // server's own receipt for that run, replayed to save it a database lookup.
  // Neither grants anything — see calcRun.ts.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Calc-Run': runToken(),
  }
  const ticket = ticketFor(route)
  if (ticket) headers['X-Calc-Ticket'] = ticket

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    return localFallback<T>(path, body)          // network error — API not running
  }
  // 404 IS THE SAFE DEGRADATION, AND IT IS DELIBERATE. If the functions are not
  // deployed — wrong Vercel root directory, a build that dropped them — every
  // steel page would otherwise break outright. Falling back keeps the site
  // working on the identical solver. It also means shipping the endpoints
  // cannot take the site down, which is why the browser copy is still here;
  // removing it is a follow-up for once /api/steel/* is confirmed live.
  if (res.status === 404) return localFallback<T>(path, body)
  // 402 IS NOT AN ERROR TO FALL BACK FROM. It is the server saying this guest
  // has used their five free runs of this calculator — the one refusal that
  // must NOT be answered by computing the result in the browser instead, or
  // the gate would exist only to be routed around by its own client.
  if (res.status === 402) {
    const d = (await res.json().catch(() => null)) as { route?: string; used?: number } | null
    throw new TrialExhaustedError(d?.route ?? route, d?.used ?? 0)
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    const err = new Error(detail?.error ?? `Calculation API error (${res.status})`)
    console.error(err)   // the UI badge says "check console" — make that true
    throw err
  }
  // The receipt for this run, so the next recompute costs the endpoint one
  // hash instead of a round trip to Postgres.
  rememberTicket(route, res.headers.get('x-calc-ticket'))
  return (await res.json()) as T
}

// ── Beam ──────────────────────────────────────────────────────────────────

export interface BeamCalcInput {
  shapeName: string; Fy: number
  span: number; Lb: number; Cb: number
  wDead: number; wLive: number
  /** Defaults to LRFD when absent, so an older caller is unaffected. */
  basis?: DesignBasis
}
export interface BeamCalcResult {
  props: DerivedBeamProps
  flex: BeamFlexureResult
  shear: BeamShearResult
  loads: BeamLoadsResult
  basis: DesignBasis
  avail: AvailableBeam
}
export const calcBeam = (input: BeamCalcInput) =>
  post<BeamCalcResult>('/api/steel/beam', input, TRIAL_ROUTE.beam)

// ── Column ────────────────────────────────────────────────────────────────

export interface ColumnCalcInput {
  shapeName: string; Fy: number
  L: number; Kx: number; Ky: number
  Pu: number; Mux: number; Muy: number
  basis?: DesignBasis
}
export interface ColumnCalcResult {
  props: DerivedBeamProps
  axial: ColumnAxialResult
  flexX: BeamFlexureResult
  weak: WeakAxisResult
  comb: CombinedResult
  basis: DesignBasis
  avail: AvailableColumn
}
export const calcColumn = (input: ColumnCalcInput) =>
  post<ColumnCalcResult>('/api/steel/column', input, TRIAL_ROUTE.column)

// ── Connection ────────────────────────────────────────────────────────────

export interface ConnectionCalcInput {
  Vu: number; Hu: number
  boltGrade: 'A325M' | 'A490M'
  db: number; nRows: number; nCols: number
  sy: number; sx: number; ey: number; ex_edge: number
  /**
   * Bolts at ARBITRARY plate coordinates. When present the grid fields above
   * are ignored for geometry — this is the eccentric-bracket case, where the
   * pattern is not a rectangle. Block shear is skipped for a custom pattern:
   * `shearTabBlockShear` walks a single vertical bolt line, which a free-form
   * group need not have.
   */
  bolts?: { id: string; x: number; y: number }[]
  /** Shear planes crossing each bolt: 1 single, 2 double (§J3.6). */
  nShear?: number
  basis?: DesignBasis
  threads: boolean
  tPlate: number; FuPlate: number; FyPlate: number
  ex_load: number; ey_load: number; e_out: number; b_gage: number
  // NO WELD FIELDS. The fillet-weld §J2.4 sizing that used to ride along here
  // was the Steel Design page's weld tab, and that tab was a three-row subset
  // of /welded-connection's eccentric weld-group solver. The connection
  // endpoint is bolted-only; welds are solved on their own page.
}
export interface ConnectionCalcResult {
  geom: BoltGroupGeom
  phiRnBolt: BoltResult
  eccentric: EccentricBoltResult
  outOfPlane: OutOfPlaneResult | null
  prying: PryingResult | null
  blockShear: BlockShearCase[]
  /**
   * The largest Vu this group carries at the current eccentricity, kN.
   * The elastic method is linear in the applied load, so it is Vu scaled by
   * phiRn/Rmax — no second solve. This is the LRFD statement of the question
   * the old standalone page answered in allowable stress ("maximum load P").
   */
  maxVu: number
  /** Shear stress on the critical bolt, MPa — Rmax over the bolt area times
   *  the shear planes. Reported, not a check: the check is the capacity above. */
  tauMax: number
  basis: DesignBasis
  avail: AvailableBolt
  /** Available block-shear strength per case, kN, in `blockShear` order. */
  availBlockShear: number[]
}
export const calcConnection = (input: ConnectionCalcInput) =>
  post<ConnectionCalcResult>('/api/steel/connection', input, TRIAL_ROUTE.connection)
