// Calculator ↔ Code Library links. "Explain this check" on a calculator opens
// the provision page loaded with THAT calculator's beam, so the explanation
// works the user's own numbers instead of the library's default example.
//
// The beam travels in the query string, and everything read back is screened:
// each value must be a finite number inside the range the provision page's
// own inputs allow, else the default stands; the "back to" route must be a
// known tool route, so a crafted link cannot turn the page into a redirect.
import type { SolutionStep } from '../solution'
import { ALL_TOOLS } from '../tools'
import type { BeamExampleInput } from './types'
import { DEFAULT_BEAM } from './rcBeam'
import { provisionById } from './index'

/** Accepted range per field — the provision page's input limits. Units: mm, MPa, kN, kN·m. */
const RANGE: Record<keyof BeamExampleInput, [number, number, boolean?]> = {
  b: [150, 1200], h: [200, 1500], cover: [20, 100], stirrupDia: [8, 16, true],
  nBars: [1, 12, true], barDia: [10, 36, true], fc: [17, 70], fy: [230, 550], fyt: [230, 550],
  Mu: [0, 1e5], Vu: [0, 1e5], legs: [2, 6, true], s: [25, 600],
}
const KEYS = Object.keys(RANGE) as (keyof BeamExampleInput)[]

export interface CodeLinkSource {
  /** The calculator's route, e.g. '/beam-design'. */
  route: string
  label: string
  /** Bar layers the calculator stacked — the library example is single-layer. */
  layers?: number
}

/** `/codes/<id>?…` carrying the calculator's beam and where it came from. */
export function codeLink(id: string, i?: Partial<BeamExampleInput>, from?: CodeLinkSource): string {
  const q = new URLSearchParams()
  if (i) for (const k of KEYS) { const v = i[k]; if (v !== undefined && Number.isFinite(v)) q.set(k, String(+v.toFixed(3))) }
  if (from) { q.set('from', from.route); q.set('fromLabel', from.label); if (from.layers && from.layers > 1) q.set('layers', String(from.layers)) }
  const s = q.toString()
  return `/codes/${id}${s ? `?${s}` : ''}`
}

export interface LinkedExample {
  inp: BeamExampleInput
  /** Fields the link supplied and that passed screening. */
  carried: (keyof BeamExampleInput)[]
  from?: CodeLinkSource
}

const TOOL_ROUTES = new Set(ALL_TOOLS.map((t) => t.to))

/** Read a beam back from a code link; anything missing or out of range keeps the default. */
export function exampleFromQuery(q: URLSearchParams): LinkedExample {
  const inp: BeamExampleInput = { ...DEFAULT_BEAM }
  const carried: (keyof BeamExampleInput)[] = []
  for (const k of KEYS) {
    const raw = q.get(k)
    if (raw === null || raw.trim() === '') continue
    const v = Number(raw), [lo, hi, int] = RANGE[k]
    if (!Number.isFinite(v) || v < lo || v > hi || (int && !Number.isInteger(v))) continue
    inp[k] = v
    carried.push(k)
  }
  const route = q.get('from')
  const layers = Number(q.get('layers'))
  const from = route && TOOL_ROUTES.has(route)
    ? { route, label: (q.get('fromLabel') ?? '').slice(0, 60) || route, layers: Number.isInteger(layers) && layers > 1 && layers < 10 ? layers : undefined }
    : undefined
  return { inp, carried, from }
}

/**
 * The worked-solution step that lists, for each provision a calculator
 * applied, its clauses and where the Code Library explains it — so a printed
 * report carries the references and not only the screen.
 */
export function codeReferenceStep(ids: string[]): SolutionStep {
  const lines: SolutionStep['lines'] = []
  for (const id of ids) {
    const p = provisionById(id)
    if (!p) throw new Error(`codeReferenceStep: no provision "${id}"`)
    const refs = Object.values(p.refs)
    lines.push({ item: `${p.title} — ${refs.map((r) => r.clause).join(', ')} (${refs[0].edition}). Explained at /codes/${p.id}.` })
  }
  return {
    title: 'Code references',
    lines,
    note: 'Clause numbers are cited for navigation; read the authorized code for the provisions themselves.',
  }
}
